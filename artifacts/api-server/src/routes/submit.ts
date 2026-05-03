import { Router, type IRouter } from "express";
import { db, jobsTable, jobOrdersTable } from "@workspace/db";
import { eq, and, isNotNull, isNull, ne, sql, gt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendJobSubmissionConfirmation, sendOrderConfirmation } from "../lib/resend";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/jobs/submit", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
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
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(jobOrdersTable)
        .where(eq(jobOrdersTable.stripeSessionId, sessionId))
        .for("update");

      if (!order || order.clerkUserId !== userId) {
        return { kind: "not_found" as const };
      }
      if (order.status !== "paid") {
        return { kind: "not_paid" as const };
      }
      if (order.jobsRemaining <= 0) {
        return { kind: "no_slots" as const };
      }
      if (order.productType === "featured" && order.jobId !== null) {
        return { kind: "featured_already_used" as const };
      }

      const isFeatured = order.productType === "featured";

      const [job] = await tx
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

      await tx
        .update(jobOrdersTable)
        .set({ jobsRemaining: order.jobsRemaining - 1, jobId: job.id })
        .where(eq(jobOrdersTable.stripeSessionId, sessionId));

      return {
        kind: "ok" as const,
        job,
        email: order.email,
        jobsRemaining: order.jobsRemaining - 1,
      };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (result.kind === "not_paid") {
      res.status(402).json({
        error: "Payment not confirmed yet. Please wait a moment and try again.",
      });
      return;
    }
    if (result.kind === "no_slots") {
      res.status(403).json({ error: "No job slots remaining on this order." });
      return;
    }
    if (result.kind === "featured_already_used") {
      res.status(400).json({
        error:
          "This Featured Upgrade order was already used. Use the featured upgrade endpoint to apply it to an existing job.",
      });
      return;
    }

    if (result.email) {
      const emailSent = await sendJobSubmissionConfirmation({
        email: result.email,
        sessionId,
        jobTitle: result.job.title,
        companyName: result.job.companyName,
      });
      if (emailSent) {
        await db
          .update(jobOrdersTable)
          .set({ jobSubmissionEmailSentAt: new Date() })
          .where(eq(jobOrdersTable.stripeSessionId, sessionId));
      }
    }

    res.status(201).json({ job: result.job, jobsRemaining: result.jobsRemaining });
  } catch (err) {
    logger.error({ err }, "Error submitting job");
    res.status(500).json({ error: "Failed to submit job" });
  }
});

router.post("/jobs/feature", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
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
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(jobOrdersTable)
        .where(eq(jobOrdersTable.stripeSessionId, sessionId))
        .for("update");

      if (!order || order.clerkUserId !== userId) {
        return { kind: "not_found" as const };
      }
      if (order.productType !== "featured") {
        return { kind: "wrong_product" as const };
      }
      if (order.status !== "paid") {
        return { kind: "not_paid" as const };
      }
      if (order.jobsRemaining <= 0) {
        return { kind: "already_used" as const };
      }

      const [job] = await tx
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.id, jobId))
        .for("update");

      if (!job) {
        return { kind: "job_not_found" as const };
      }

      await tx
        .update(jobsTable)
        .set({ featured: true })
        .where(eq(jobsTable.id, jobId));

      await tx
        .update(jobOrdersTable)
        .set({ jobsRemaining: 0, jobId })
        .where(eq(jobOrdersTable.stripeSessionId, sessionId));

      return { kind: "ok" as const };
    });

    if (result.kind === "not_found" || result.kind === "job_not_found") {
      res.status(404).json({ error: result.kind === "not_found" ? "Order not found" : "Job not found" });
      return;
    }
    if (result.kind === "wrong_product") {
      res.status(400).json({ error: "This order is not a Featured Upgrade" });
      return;
    }
    if (result.kind === "not_paid") {
      res.status(402).json({
        error: "Payment not confirmed yet. Please wait a moment and try again.",
      });
      return;
    }
    if (result.kind === "already_used") {
      res.status(403).json({ error: "This featured upgrade has already been used." });
      return;
    }

    res.json({ success: true, jobId, message: "Job has been featured for 30 days." });
  } catch (err) {
    logger.error({ err }, "Error applying featured upgrade");
    res.status(500).json({ error: "Failed to apply featured upgrade" });
  }
});

router.put("/jobs/update", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
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
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(jobOrdersTable)
        .where(eq(jobOrdersTable.stripeSessionId, sessionId))
        .for("update");

      if (!order || order.clerkUserId !== userId) {
        return { kind: "not_found" as const };
      }
      if (order.status !== "paid") {
        return { kind: "not_paid" as const };
      }
      if (order.productType === "featured") {
        return { kind: "wrong_product" as const };
      }
      if (!order.jobId) {
        return { kind: "no_job_yet" as const };
      }

      const [existingJob] = await tx
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.id, order.jobId))
        .for("update");

      if (!existingJob) {
        return { kind: "job_not_found" as const };
      }
      if (existingJob.approved) {
        return { kind: "already_approved" as const };
      }

      const [updatedJob] = await tx
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

      return { kind: "ok" as const, job: updatedJob };
    });

    if (result.kind === "not_found" || result.kind === "job_not_found") {
      res.status(404).json({ error: result.kind === "not_found" ? "Order not found" : "Job not found" });
      return;
    }
    if (result.kind === "not_paid") {
      res.status(402).json({
        error: "Payment not confirmed yet. Please wait a moment and try again.",
      });
      return;
    }
    if (result.kind === "wrong_product") {
      res.status(400).json({ error: "Featured upgrade orders cannot be used to edit job content." });
      return;
    }
    if (result.kind === "no_job_yet") {
      res.status(400).json({ error: "No job has been submitted for this order yet. Please use the submit endpoint." });
      return;
    }
    if (result.kind === "already_approved") {
      res.status(409).json({ error: "This job has already been approved and can no longer be edited." });
      return;
    }

    res.json({ job: result.job });
  } catch (err) {
    logger.error({ err }, "Error updating job");
    res.status(500).json({ error: "Failed to update job" });
  }
});

const EDIT_LINK_RESEND_COOLDOWN_MS = 60_000;

router.post("/jobs/resend-edit-link", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  try {
    const cooldownCutoff = new Date(Date.now() - EDIT_LINK_RESEND_COOLDOWN_MS);

    const [recentResend] = await db
      .select({ editLinkResendAt: jobOrdersTable.editLinkResendAt })
      .from(jobOrdersTable)
      .where(
        and(
          sql`lower(${jobOrdersTable.email}) = ${email}`,
          gt(jobOrdersTable.editLinkResendAt, cooldownCutoff),
        )
      )
      .limit(1);

    if (recentResend) {
      const elapsed = Date.now() - recentResend.editLinkResendAt!.getTime();
      const secondsLeft = Math.ceil((EDIT_LINK_RESEND_COOLDOWN_MS - elapsed) / 1000);
      res.setHeader("Retry-After", String(secondsLeft));
      res.status(429).json({
        error: "rate_limited",
        secondsLeft,
        message: `Please wait ${secondsLeft} second${secondsLeft !== 1 ? "s" : ""} before requesting another edit link.`,
      });
      return;
    }

    const now = new Date();

    await db
      .update(jobOrdersTable)
      .set({ editLinkResendAt: now })
      .where(sql`lower(${jobOrdersTable.email}) = ${email}`);

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
