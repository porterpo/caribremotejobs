import { Router, type IRouter } from "express";
import { runJobSync } from "../lib/sync";
import { db, jobsTable, companiesTable, jobOrdersTable } from "@workspace/db";
import { eq, desc, and, isNull, count, sql, gte, lte, SQL } from "drizzle-orm";
import { sendOrderConfirmation } from "../lib/resend";
import { logger } from "../lib/logger";

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

router.get("/admin/order-stats", async (_req, res): Promise<void> => {
  const [orderRows, priceRows] = await Promise.all([
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
  ]);

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

  res.json({ totalPaid, breakdown, totalRevenue, revenueBreakdown });
});

export default router;
