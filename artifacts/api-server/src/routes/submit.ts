import { Router, type IRouter } from "express";
import { db, jobsTable, jobOrdersTable } from "@workspace/db";
import { eq, and, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendJobSubmissionConfirmation, sendOrderConfirmation } from "../lib/resend";

const router: IRouter = Router();

router.post("/jobs/submit", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;

  const sessionId = String(body.sessionId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const companyName = String(body.companyName ?? "").trim();
  const companyLogo = body.companyLogo ? String(body.companyLogo).trim() : null;
  const category = String(body.category ?? "").trim();
  const jobType = String(body.jobType ?? "full-time").trim();
  const description = String(body.description ?? "").trim();
  const applyUrl = String(body.applyUrl ?? "").trim();
  const salaryMin = body.salaryMin ? Number(body.salaryMin) : null;
  const salaryMax = body.salaryMax ? Number(body.salaryMax) : null;
  const locationRestrictions = body.locationRestrictions
    ? String(body.locationRestrictions).trim()
    : null;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  if (!title || title.length < 3) {
    res.status(400).json({ error: "Job title must be at least 3 characters" });
    return;
  }
  if (!companyName) {
    res.status(400).json({ error: "Company name is required" });
    return;
  }
  if (!category) {
    res.status(400).json({ error: "Category is required" });
    return;
  }
  if (!description || description.length < 50) {
    res
      .status(400)
      .json({ error: "Description must be at least 50 characters" });
    return;
  }
  if (!applyUrl || !/^https?:\/\/.+/.test(applyUrl)) {
    res.status(400).json({ error: "A valid apply URL is required" });
    return;
  }

  try {
    const [order] = await db
      .select()
      .from(jobOrdersTable)
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.status !== "paid") {
      res.status(402).json({
        error: "Payment not confirmed yet. Please wait a moment and try again.",
      });
      return;
    }

    if (order.jobsRemaining <= 0) {
      res
        .status(403)
        .json({ error: "No job slots remaining on this order." });
      return;
    }

    if (order.productType === "featured" && order.jobId !== null) {
      res.status(400).json({
        error:
          "This Featured Upgrade order was already used. Use the featured upgrade endpoint to apply it to an existing job.",
      });
      return;
    }

    const isFeatured = order.productType === "featured";

    const [job] = await db
      .insert(jobsTable)
      .values({
        title,
        companyName,
        companyLogo: companyLogo ?? null,
        category,
        jobType,
        description,
        applyUrl,
        salaryMin: salaryMin ?? null,
        salaryMax: salaryMax ?? null,
        locationRestrictions: locationRestrictions ?? null,
        source: "employer",
        caribbeanFriendly: true,
        featured: isFeatured,
        approved: false,
        entryLevel: false,
        postedAt: new Date(),
      })
      .returning();

    await db
      .update(jobOrdersTable)
      .set({ jobsRemaining: order.jobsRemaining - 1, jobId: job.id })
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    if (order.email) {
      const emailSent = await sendJobSubmissionConfirmation({
        email: order.email,
        sessionId,
        jobTitle: job.title,
        companyName: job.companyName,
      });
      if (emailSent) {
        await db
          .update(jobOrdersTable)
          .set({ jobSubmissionEmailSentAt: new Date() })
          .where(eq(jobOrdersTable.stripeSessionId, sessionId));
      }
    }

    res.status(201).json({ job, jobsRemaining: order.jobsRemaining - 1 });
  } catch (err) {
    logger.error({ err }, "Error submitting job");
    res.status(500).json({ error: "Failed to submit job" });
  }
});

router.post("/jobs/feature", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;

  const sessionId = String(body.sessionId ?? "").trim();
  const jobId = typeof body.jobId === "number" ? body.jobId : parseInt(String(body.jobId));

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  if (!jobId || isNaN(jobId)) {
    res.status(400).json({ error: "jobId is required" });
    return;
  }

  try {
    const [order] = await db
      .select()
      .from(jobOrdersTable)
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.productType !== "featured") {
      res.status(400).json({ error: "This order is not a Featured Upgrade" });
      return;
    }

    if (order.status !== "paid") {
      res.status(402).json({
        error: "Payment not confirmed yet. Please wait a moment and try again.",
      });
      return;
    }

    if (order.jobsRemaining <= 0) {
      res.status(403).json({ error: "This featured upgrade has already been used." });
      return;
    }

    const [job] = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId));

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    await db
      .update(jobsTable)
      .set({ featured: true })
      .where(eq(jobsTable.id, jobId));

    await db
      .update(jobOrdersTable)
      .set({ jobsRemaining: 0, jobId })
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    res.json({ success: true, jobId, message: "Job has been featured for 30 days." });
  } catch (err) {
    logger.error({ err }, "Error applying featured upgrade");
    res.status(500).json({ error: "Failed to apply featured upgrade" });
  }
});

router.put("/jobs/update", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;

  const sessionId = String(body.sessionId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const companyName = String(body.companyName ?? "").trim();
  const category = String(body.category ?? "").trim();
  const jobType = String(body.jobType ?? "full-time").trim();
  const description = String(body.description ?? "").trim();
  const applyUrl = String(body.applyUrl ?? "").trim();
  const salaryMin = body.salaryMin ? Number(body.salaryMin) : null;
  const salaryMax = body.salaryMax ? Number(body.salaryMax) : null;
  const locationRestrictions = body.locationRestrictions
    ? String(body.locationRestrictions).trim()
    : null;
  const companyLogo =
    "companyLogo" in body
      ? (body.companyLogo ? String(body.companyLogo).trim() : null)
      : undefined;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  if (!title || title.length < 3) {
    res.status(400).json({ error: "Job title must be at least 3 characters" });
    return;
  }
  if (!companyName) {
    res.status(400).json({ error: "Company name is required" });
    return;
  }
  if (!category) {
    res.status(400).json({ error: "Category is required" });
    return;
  }
  if (!description || description.length < 50) {
    res.status(400).json({ error: "Description must be at least 50 characters" });
    return;
  }
  if (!applyUrl || !/^https?:\/\/.+/.test(applyUrl)) {
    res.status(400).json({ error: "A valid apply URL is required" });
    return;
  }

  try {
    const [order] = await db
      .select()
      .from(jobOrdersTable)
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.status !== "paid") {
      res.status(402).json({
        error: "Payment not confirmed yet. Please wait a moment and try again.",
      });
      return;
    }

    if (order.productType === "featured") {
      res.status(400).json({
        error: "Featured upgrade orders cannot be used to edit job content.",
      });
      return;
    }

    if (!order.jobId) {
      res.status(400).json({
        error: "No job has been submitted for this order yet. Please use the submit endpoint.",
      });
      return;
    }

    const [existingJob] = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, order.jobId));

    if (!existingJob) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (existingJob.approved) {
      res.status(409).json({
        error: "This job has already been approved and can no longer be edited.",
      });
      return;
    }

    const [updatedJob] = await db
      .update(jobsTable)
      .set({
        title,
        companyName,
        category,
        jobType,
        description,
        applyUrl,
        salaryMin: salaryMin ?? null,
        salaryMax: salaryMax ?? null,
        locationRestrictions: locationRestrictions ?? null,
        ...(companyLogo !== undefined ? { companyLogo } : {}),
      })
      .where(eq(jobsTable.id, order.jobId))
      .returning();

    res.json({ job: updatedJob });
  } catch (err) {
    logger.error({ err }, "Error updating job");
    res.status(500).json({ error: "Failed to update job" });
  }
});

router.post("/jobs/resend-edit-link", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  try {
    // Post-submission: orders where a job was filed but not yet approved — resend the edit link
    const submittedOrders = await db
      .select({
        order: jobOrdersTable,
        job: jobsTable,
      })
      .from(jobOrdersTable)
      .innerJoin(jobsTable, eq(jobOrdersTable.jobId, jobsTable.id))
      .where(
        and(
          sql`lower(${jobOrdersTable.email}) = ${email}`,
          eq(jobOrdersTable.status, "paid"),
          isNotNull(jobOrdersTable.jobId),
          ne(jobOrdersTable.productType, "featured"),
          eq(jobsTable.approved, false),
        )
      );

    for (const { order, job } of submittedOrders) {
      await sendJobSubmissionConfirmation({
        email: order.email,
        sessionId: order.stripeSessionId,
        jobTitle: job.title,
        companyName: job.companyName,
      });
    }

    // Pre-submission: paid orders where no job has been filed yet — resend the order confirmation
    const unsubmittedOrders = await db
      .select()
      .from(jobOrdersTable)
      .where(
        and(
          sql`lower(${jobOrdersTable.email}) = ${email}`,
          eq(jobOrdersTable.status, "paid"),
          isNull(jobOrdersTable.jobId),
          ne(jobOrdersTable.productType, "featured"),
        )
      );

    for (const order of unsubmittedOrders) {
      await sendOrderConfirmation({
        email: order.email,
        orderId: order.id,
        productType: order.productType,
        jobsRemaining: order.jobsRemaining,
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Error resending edit link");
    res.status(500).json({ error: "Failed to send edit link" });
  }
});

export default router;
