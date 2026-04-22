import { Router, type IRouter } from "express";
import { runJobSync } from "../lib/sync";
import { db, jobsTable, companiesTable, jobOrdersTable, seekerSubscriptionsTable } from "@workspace/db";
import { eq, desc, and, isNull, count, sql, gte, lte, SQL } from "drizzle-orm";
import { sendOrderConfirmation } from "../lib/resend";
import { logger } from "../lib/logger";
import { getEmployerEligibility } from "../lib/employerEligibility";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

router.post("/admin/sync-jobs", async (req, res): Promise<void> => {
  const result = await runJobSync();
  res.json(result);
});

router.get("/admin/orders", async (req, res): Promise<void> => {
  const { productType, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  const allowedTypes = ["single", "pack", "monthly", "featured"];
  if (productType && productType !== "all" && !allowedTypes.includes(productType)) {
    res.status(400).json({ error: "Invalid productType" });
    return;
  }

  const conditions: SQL[] = [];
  if (productType && productType !== "all") {
    conditions.push(eq(jobOrdersTable.productType, productType));
  }
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (isNaN(from.getTime())) { res.status(400).json({ error: "Invalid dateFrom" }); return; }
    conditions.push(gte(jobOrdersTable.createdAt, from));
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (isNaN(to.getTime())) { res.status(400).json({ error: "Invalid dateTo" }); return; }
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(jobOrdersTable.createdAt, to));
  }

  const orders = await db
    .select({
      id: jobOrdersTable.id,
      email: jobOrdersTable.email,
      productType: jobOrdersTable.productType,
      status: jobOrdersTable.status,
      jobsRemaining: jobOrdersTable.jobsRemaining,
      jobId: jobOrdersTable.jobId,
      createdAt: jobOrdersTable.createdAt,
      confirmationEmailSentAt: jobOrdersTable.confirmationEmailSentAt,
      jobSubmissionEmailSentAt: jobOrdersTable.jobSubmissionEmailSentAt,
    })
    .from(jobOrdersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(jobOrdersTable.createdAt));
  res.json(orders);
});

router.get("/admin/orders/export", async (req, res): Promise<void> => {
  const { productType, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  const allowedTypes = ["single", "pack", "monthly", "featured"];
  if (productType && productType !== "all" && !allowedTypes.includes(productType)) {
    res.status(400).json({ error: "Invalid productType" });
    return;
  }

  const conditions: SQL[] = [];
  if (productType && productType !== "all") {
    conditions.push(eq(jobOrdersTable.productType, productType));
  }
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (isNaN(from.getTime())) { res.status(400).json({ error: "Invalid dateFrom" }); return; }
    conditions.push(gte(jobOrdersTable.createdAt, from));
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (isNaN(to.getTime())) { res.status(400).json({ error: "Invalid dateTo" }); return; }
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(jobOrdersTable.createdAt, to));
  }

  const orders = await db
    .select({
      id: jobOrdersTable.id,
      email: jobOrdersTable.email,
      productType: jobOrdersTable.productType,
      status: jobOrdersTable.status,
      jobsRemaining: jobOrdersTable.jobsRemaining,
      jobId: jobOrdersTable.jobId,
      createdAt: jobOrdersTable.createdAt,
      confirmationEmailSentAt: jobOrdersTable.confirmationEmailSentAt,
      jobSubmissionEmailSentAt: jobOrdersTable.jobSubmissionEmailSentAt,
    })
    .from(jobOrdersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(jobOrdersTable.createdAt));

  const escape = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return "";
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    "Order ID",
    "Email",
    "Product Type",
    "Status",
    "Jobs Remaining",
    "Job ID",
    "Created Date",
    "Confirmation Email Sent",
    "Job Submission Email Sent",
  ];

  const rows = orders.map((o) => [
    escape(o.id),
    escape(o.email),
    escape(o.productType),
    escape(o.status),
    escape(o.jobsRemaining),
    escape(o.jobId),
    escape(o.createdAt ? new Date(o.createdAt).toISOString() : null),
    escape(o.confirmationEmailSentAt ? new Date(o.confirmationEmailSentAt).toISOString() : null),
    escape(o.jobSubmissionEmailSentAt ? new Date(o.jobSubmissionEmailSentAt).toISOString() : null),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="orders-export.csv"`);
  res.send(csv);
});

router.post("/admin/orders/:id/resend-email", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const [order] = await db
    .select()
    .from(jobOrdersTable)
    .where(eq(jobOrdersTable.id, id));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "paid") {
    res.status(400).json({ error: "Can only resend email for paid orders" });
    return;
  }

  try {
    await sendOrderConfirmation({
      email: order.email,
      orderId: order.id,
      productType: order.productType,
      jobsRemaining: order.jobsRemaining,
    });
  } catch (err) {
    logger.error({ err }, "Admin resend email failed");
    res.status(502).json({ error: "Failed to send email" });
    return;
  }

  const sentAt = new Date();
  await db
    .update(jobOrdersTable)
    .set({ confirmationEmailSentAt: sentAt })
    .where(eq(jobOrdersTable.id, id));

  res.json({ confirmationEmailSentAt: sentAt.toISOString() });
});

router.get("/admin/pending-jobs", async (_req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.approved, false))
    .orderBy(jobsTable.postedAt);
  res.json(jobs);
});

router.post("/admin/jobs/:id/approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;

  const [existing] = await db
    .select({ featured: jobsTable.featured })
    .from(jobsTable)
    .where(eq(jobsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const featuredValue =
    typeof body.featured === "boolean" ? body.featured : existing.featured;

  const [job] = await db
    .update(jobsTable)
    .set({ approved: true, featured: featuredValue, caribbeanFriendly: true })
    .where(eq(jobsTable.id, id))
    .returning();

  if (job.companyLogo) {
    const companyCondition = job.companyId
      ? eq(companiesTable.id, job.companyId)
      : eq(companiesTable.name, job.companyName);
    await db
      .update(companiesTable)
      .set({ logo: job.companyLogo })
      .where(and(companyCondition, isNull(companiesTable.logo)));
  }

  res.json(job);
});

router.get("/admin/companies", requireAdmin, async (_req, res): Promise<void> => {
  const companies = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      logo: companiesTable.logo,
      website: companiesTable.website,
      description: companiesTable.description,
      verifiedEmployer: companiesTable.verifiedEmployer,
      caribbeanFriendly: companiesTable.caribbeanFriendly,
      hiresBahamas: companiesTable.hiresBahamas,
      hiresCaribbean: companiesTable.hiresCaribbean,
      country: companiesTable.country,
      createdAt: companiesTable.createdAt,
    })
    .from(companiesTable)
    .orderBy(companiesTable.name);

  const results = await Promise.all(
    companies.map(async (company) => {
      const eligibility = await getEmployerEligibility(company.id);
      return { ...company, eligibility };
    }),
  );

  res.json(results);
});

router.post("/admin/jobs/:id/flag-violation", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid job id" }); return; }
  const [job] = await db
    .update(jobsTable)
    .set({ rejectedForViolation: true, approved: false })
    .where(eq(jobsTable.id, id))
    .returning({ id: jobsTable.id, title: jobsTable.title, companyId: jobsTable.companyId });
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  logger.info({ jobId: id, jobTitle: job.title }, "Job flagged for policy violation by admin");
  res.json(job);
});

router.post("/admin/jobs/:id/clear-violation", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid job id" }); return; }
  const [job] = await db
    .update(jobsTable)
    .set({ rejectedForViolation: false })
    .where(eq(jobsTable.id, id))
    .returning({ id: jobsTable.id, title: jobsTable.title, companyId: jobsTable.companyId });
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  logger.info({ jobId: id, jobTitle: job.title }, "Job violation flag cleared by admin");
  res.json(job);
});

router.post("/admin/companies/:id/verify", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid company id" });
    return;
  }

  const force = req.query.force === "true";
  if (!force) {
    const eligibility = await getEmployerEligibility(id);
    if (!eligibility.eligible) {
      res.status(422).json({
        error: "Company does not meet eligibility criteria",
        criteria: eligibility.criteria,
        hint: "Pass ?force=true to override eligibility check",
      });
      return;
    }
  }

  const [company] = await db
    .update(companiesTable)
    .set({ verifiedEmployer: true })
    .where(eq(companiesTable.id, id))
    .returning();

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  logger.info({ companyId: id, companyName: company.name, forced: force }, "Verified Employer badge granted by admin");
  res.json(company);
});

router.post("/admin/companies/:id/unverify", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid company id" });
    return;
  }

  const [company] = await db
    .update(companiesTable)
    .set({ verifiedEmployer: false })
    .where(eq(companiesTable.id, id))
    .returning();

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  logger.info({ companyId: id, companyName: company.name }, "Verified Employer badge revoked by admin");
  res.json(company);
});

router.get("/admin/order-stats", requireAdmin, async (_req, res): Promise<void> => {
  const [orderRows, priceRows, seekerSubRows] = await Promise.all([
    db
      .select({ productType: jobOrdersTable.productType, count: count() })
      .from(jobOrdersTable)
      .where(eq(jobOrdersTable.status, "paid"))
      .groupBy(jobOrdersTable.productType),
    db.execute(sql`
      SELECT
        p.metadata->>'type' AS product_type,
        pr.unit_amount
      FROM stripe.products p
      JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
        AND p.metadata->>'type' IN ('single', 'pack', 'monthly', 'featured')
    `),
    db
      .select({ status: seekerSubscriptionsTable.status, count: count() })
      .from(seekerSubscriptionsTable)
      .groupBy(seekerSubscriptionsTable.status),
  ]);

  const seekerSubscriptionCounts: Record<string, number> = { active: 0, past_due: 0, cancelled: 0 };
  for (const row of seekerSubRows) {
    if (row.status) {
      seekerSubscriptionCounts[row.status] = row.count;
    }
  }

  const stripePricesByCents: Record<string, number> = {};
  for (const row of priceRows.rows as Array<{ product_type: string; unit_amount: number }>) {
    if (row.product_type) {
      stripePricesByCents[row.product_type] = row.unit_amount;
    }
  }

  const breakdown: Record<string, number> = { single: 0, pack: 0, monthly: 0, featured: 0 };
  const revenueBreakdown: Record<string, number> = { single: 0, pack: 0, monthly: 0, featured: 0 };
  let totalPaid = 0;
  let totalRevenue = 0;
  for (const row of orderRows) {
    const key = row.productType ?? "other";
    breakdown[key] = (breakdown[key] ?? 0) + row.count;
    totalPaid += row.count;
    const priceCents = stripePricesByCents[key] ?? 0;
    const revenueCents = priceCents * row.count;
    revenueBreakdown[key] = (revenueBreakdown[key] ?? 0) + revenueCents;
    totalRevenue += revenueCents;
  }

  res.json({ totalPaid, breakdown, totalRevenue, revenueBreakdown, seekerSubscriptionCounts });
});

router.get("/admin/seeker-subscriptions", requireAdmin, async (req, res): Promise<void> => {
  const { status, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  const allowedStatuses = ["active", "cancelled", "past_due"];
  if (status && !allowedStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status. Must be one of: active, cancelled, past_due" });
    return;
  }

  const conditions: SQL[] = [];
  if (status) {
    conditions.push(eq(seekerSubscriptionsTable.status, status));
  }
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (isNaN(from.getTime())) { res.status(400).json({ error: "Invalid dateFrom" }); return; }
    conditions.push(gte(seekerSubscriptionsTable.createdAt, from));
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (isNaN(to.getTime())) { res.status(400).json({ error: "Invalid dateTo" }); return; }
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(seekerSubscriptionsTable.createdAt, to));
  }

  const subscriptions = await db
    .select({
      clerkUserId: seekerSubscriptionsTable.clerkUserId,
      stripeCustomerId: seekerSubscriptionsTable.stripeCustomerId,
      stripeSubscriptionId: seekerSubscriptionsTable.stripeSubscriptionId,
      status: seekerSubscriptionsTable.status,
      currentPeriodEnd: seekerSubscriptionsTable.currentPeriodEnd,
      createdAt: seekerSubscriptionsTable.createdAt,
    })
    .from(seekerSubscriptionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(seekerSubscriptionsTable.createdAt));

  res.json(subscriptions);
});

router.get("/admin/seeker-subscriptions/export", requireAdmin, async (req, res): Promise<void> => {
  const { status, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  const allowedStatuses = ["active", "cancelled", "past_due"];
  if (status && !allowedStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status. Must be one of: active, cancelled, past_due" });
    return;
  }

  const conditions: SQL[] = [];
  if (status) {
    conditions.push(eq(seekerSubscriptionsTable.status, status));
  }
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (isNaN(from.getTime())) { res.status(400).json({ error: "Invalid dateFrom" }); return; }
    conditions.push(gte(seekerSubscriptionsTable.createdAt, from));
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (isNaN(to.getTime())) { res.status(400).json({ error: "Invalid dateTo" }); return; }
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(seekerSubscriptionsTable.createdAt, to));
  }

  const subscriptions = await db
    .select({
      clerkUserId: seekerSubscriptionsTable.clerkUserId,
      stripeCustomerId: seekerSubscriptionsTable.stripeCustomerId,
      stripeSubscriptionId: seekerSubscriptionsTable.stripeSubscriptionId,
      status: seekerSubscriptionsTable.status,
      currentPeriodEnd: seekerSubscriptionsTable.currentPeriodEnd,
      createdAt: seekerSubscriptionsTable.createdAt,
    })
    .from(seekerSubscriptionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(seekerSubscriptionsTable.createdAt));

  const escape = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return "";
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    "Clerk User ID",
    "Status",
    "Current Period End",
    "Created Date",
    "Stripe Customer ID",
    "Stripe Subscription ID",
  ];

  const rows = subscriptions.map((s) => [
    escape(s.clerkUserId),
    escape(s.status),
    escape(s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toISOString() : null),
    escape(s.createdAt ? new Date(s.createdAt).toISOString() : null),
    escape(s.stripeCustomerId),
    escape(s.stripeSubscriptionId),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="seeker-subscriptions-export.csv"`);
  res.send(csv);
});

export default router;
