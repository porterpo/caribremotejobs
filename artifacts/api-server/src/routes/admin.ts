import { Router, type IRouter } from "express";
import { runJobSync } from "../lib/sync";
import { db, jobsTable, companiesTable, certificationOrdersTable, jobOrdersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { sendOrderConfirmation } from "../lib/resend";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/admin/sync-jobs", async (req, res): Promise<void> => {
  const result = await runJobSync();
  res.json(result);
});

router.get("/admin/orders", async (_req, res): Promise<void> => {
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
    })
    .from(jobOrdersTable)
    .orderBy(desc(jobOrdersTable.createdAt));
  res.json(orders);
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
    .set({ approved: true, featured: featuredValue })
    .where(eq(jobsTable.id, id))
    .returning();

  res.json(job);
});

router.get("/admin/certifications", async (_req, res): Promise<void> => {
  const certifications = await db
    .select()
    .from(certificationOrdersTable)
    .orderBy(certificationOrdersTable.createdAt);
  res.json(certifications);
});

router.post("/admin/certifications/:id/approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);

  const [cert] = await db
    .select()
    .from(certificationOrdersTable)
    .where(eq(certificationOrdersTable.id, id));

  if (!cert) {
    res.status(404).json({ error: "Certification order not found" });
    return;
  }

  const [updated] = await db
    .update(certificationOrdersTable)
    .set({ status: "approved" })
    .where(eq(certificationOrdersTable.id, id))
    .returning();

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const existingCompanies = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.name, cert.companyName));

  if (existingCompanies.length > 0) {
    const companyId = existingCompanies[0].id;
    await db
      .update(companiesTable)
      .set({
        caribbeanFriendly: true,
        caribbeanFriendlyCertified: true,
        certificationExpiresAt: expiresAt,
      })
      .where(eq(companiesTable.id, companyId));

    await db
      .update(jobsTable)
      .set({ caribbeanFriendly: true })
      .where(eq(jobsTable.companyId, companyId));
  }

  res.json(updated);
});

router.post("/admin/certifications/:id/reject", async (req, res): Promise<void> => {
  const id = Number(req.params.id);

  const [cert] = await db
    .select()
    .from(certificationOrdersTable)
    .where(eq(certificationOrdersTable.id, id));

  if (!cert) {
    res.status(404).json({ error: "Certification order not found" });
    return;
  }

  const [updated] = await db
    .update(certificationOrdersTable)
    .set({ status: "rejected" })
    .where(eq(certificationOrdersTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
