import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, jobsTable, jobOrdersTable } from "@workspace/db";
import { eq, and, isNotNull, isNull, ne, sql, gt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendJobSubmissionConfirmation, sendOrderConfirmation } from "../lib/resend";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { submitLimiter } from "../lib/rate-limit";

const JobFieldsSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  title: z.string().min(3, "Job title must be at least 3 characters").max(200),
  companyName: z.string().min(1, "Company name is required").max(200),
  companyLogo: z.string().url("Invalid company logo URL").nullish(),
  category: z.string().min(1, "Category is required"),
  jobType: z.string().min(1).default("full-time"),
  description: z.string().min(50, "Description must be at least 50 characters"),
  applyUrl: z.string().url("A valid apply URL is required"),
  salaryMin: z.number().positive().nullish(),
  salaryMax: z.number().positive().nullish(),
  locationRestrictions: z.string().nullish(),
});

const FeatureJobSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  jobId: z.coerce.number().int().positive("jobId is required"),
});

const UpdateJobSchema = JobFieldsSchema;

const ResendEditLinkSchema = z.object({
  email: z.string().email("A valid email address is required"),
});

const router: IRouter = Router();

router.post("/jobs/submit", requireAuth, submitLimiter, async (req, res): Promise<void> => {
  const parsed = JobFieldsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { sessionId, title, companyName, companyLogo, category, jobType, description, applyUrl, salaryMin, salaryMax, locationRestrictions } = parsed.data;

  const { userId } = req as AuthenticatedRequest;

  try {
    const [order] = await db
      .select()
      .from(jobOrdersTable)
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (!order.clerkUserId || order.clerkUserId !== userId) {
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
    const orderEmail = order.email;

    const { job, jobsRemaining } = await db.transaction(async (tx) => {
      const [lockedOrder] = await tx
        .select({ jobsRemaining: jobOrdersTable.jobsRemaining })
        .from(jobOrdersTable)
        .where(eq(jobOrdersTable.stripeSessionId, sessionId))
        .for("update");

      if (!lockedOrder || lockedOrder.jobsRemaining <= 0) {
        throw new Error("No job slots remaining on this order.");
      }

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
        .set({ jobsRemaining: lockedOrder.jobsRemaining - 1, jobId: job.id })
        .where(eq(jobOrdersTable.stripeSessionId, sessionId));

      return { job, jobsRemaining: lockedOrder.jobsRemaining - 1 };
    });

    if (orderEmail) {
      const emailSent = await sendJobSubmissionConfirmation({
        email: orderEmail,
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

    res.status(201).json({ job, jobsRemaining });
  } catch (err) {
    logger.error({ err }, "Error submitting job");
    res.status(500).json({ error: "Failed to submit job" });
  }
});

router.post("/jobs/feature", requireAuth, async (req, res): Promise<void> => {
  const parsed = FeatureJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { sessionId, jobId } = parsed.data;

  const { userId } = req as AuthenticatedRequest;

  try {
    const [order] = await db
      .select()
      .from(jobOrdersTable)
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (!order.clerkUserId || order.clerkUserId !== userId) {
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

router.put("/jobs/update", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { sessionId, title, companyName, companyLogo, category, jobType, description, applyUrl, salaryMin, salaryMax, locationRestrictions } = parsed.data;

  const { userId } = req as AuthenticatedRequest;

  try {
    const [order] = await db
      .select()
      .from(jobOrdersTable)
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (!order.clerkUserId || order.clerkUserId !== userId) {
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

const EDIT_LINK_RESEND_COOLDOWN_MS = 60_000;

router.post("/jobs/resend-edit-link", async (req, res): Promise<void> => {
  const parsed = ResendEditLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const email = parsed.data.email.toLowerCase();

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
      // Always 200 to prevent email enumeration — rate limit is silently enforced
      res.json({ success: true });
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
