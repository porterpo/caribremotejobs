import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, jobOrdersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { logger } from "../lib/logger";
import { sendOrderConfirmation } from "../lib/resend";
import { env } from "../lib/env";
import { getAuth } from "@clerk/express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { checkoutLimiter, resendLimiter } from "../lib/rate-limit";

const CheckoutSchema = z.object({
  priceId: z.string().min(1, "priceId is required"),
  email: z.string().email("A valid email address is required"),
});

const ResendConfirmationSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
});

const router: IRouter = Router();

router.get("/stripe/products", async (_req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.description AS product_description,
        p.metadata AS product_metadata,
        p.active AS product_active,
        pr.id AS price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active AS price_active
      FROM stripe.products p
      LEFT JOIN stripe.prices pr
        ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
        AND p.metadata->>'type' IN ('single', 'pack', 'monthly', 'featured', 'seeker_pro')
      ORDER BY pr.unit_amount ASC
    `);

    const productsMap = new Map<
      string,
      {
        id: string;
        name: string;
        description: string | null;
        metadata: Record<string, string> | null;
        prices: Array<{
          id: string;
          unit_amount: number;
          currency: string;
          recurring: { interval: string } | null;
        }>;
      }
    >();

    for (const row of rows.rows as Record<string, unknown>[]) {
      const pid = row.product_id as string;
      if (!productsMap.has(pid)) {
        productsMap.set(pid, {
          id: pid,
          name: row.product_name as string,
          description: row.product_description as string | null,
          metadata: row.product_metadata as Record<string, string> | null,
          prices: [],
        });
      }
      if (row.price_id) {
        productsMap.get(pid)!.prices.push({
          id: row.price_id as string,
          unit_amount: row.unit_amount as number,
          currency: row.currency as string,
          recurring: row.recurring as { interval: string } | null,
        });
      }
    }

    res.json({ products: Array.from(productsMap.values()) });
  } catch (err) {
    logger.error({ err }, "Error fetching Stripe products");
    res.status(500).json({ error: "Failed to load products" });
  }
});

router.post("/stripe/checkout", checkoutLimiter, requireAuth, async (req, res): Promise<void> => {
  const parsed = CheckoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { priceId, email } = parsed.data;
  const { userId: clerkUserId } = req as AuthenticatedRequest;

  try {
    const rows = await db.execute(sql`
      SELECT
        pr.id AS price_id,
        pr.recurring,
        p.metadata AS product_metadata
      FROM stripe.prices pr
      JOIN stripe.products p ON pr.product = p.id
      WHERE pr.id = ${priceId}
        AND pr.active = true
        AND p.active = true
      LIMIT 1
    `);

    if (!rows.rows.length) {
      res.status(400).json({ error: "Invalid or inactive price" });
      return;
    }

    const row = rows.rows[0] as Record<string, unknown>;
    const metadata = (row.product_metadata as Record<string, string>) ?? {};
    const productType = metadata.type as string | undefined;
    const isRecurring = !!row.recurring;

    if (!productType) {
      res.status(400).json({ error: "Product is missing type metadata" });
      return;
    }

    const validTypes = ["single", "pack", "monthly", "featured"];
    if (!validTypes.includes(productType)) {
      res.status(400).json({ error: `Unknown product type: ${productType}` });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const frontendUrl = env.frontendUrl;

    const tenMinBucket = Math.floor(Date.now() / (10 * 60_000));
    const idempotencyKey = `checkout:${clerkUserId}:${priceId}:${tenMinBucket}`;

    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/pricing`,
      metadata: { productType, email },
    }, { idempotencyKey });

    const jobsRemaining =
      productType === "pack" ? 3 : productType === "monthly" ? 999 : 1;

    await db.insert(jobOrdersTable).values({
      email,
      stripeSessionId: session.id,
      productType,
      status: "pending",
      jobsRemaining,
      clerkUserId,
    }).onConflictDoNothing();

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "Error creating checkout session");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.get("/stripe/session/:id", requireAuth, async (req, res): Promise<void> => {
  const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { userId } = req as AuthenticatedRequest;
  try {
    const [order] = await db
      .select()
      .from(jobOrdersTable)
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    if (!order || !order.clerkUserId || order.clerkUserId !== userId) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.json({
      id: order.id,
      productType: order.productType,
      status: order.status,
      jobsRemaining: order.jobsRemaining,
      jobId: order.jobId,
    });
  } catch (err) {
    logger.error({ err }, "Error fetching session");
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

const RESEND_COOLDOWN_MS = 60_000;

router.post("/stripe/resend-confirmation", resendLimiter, requireAuth, async (req, res): Promise<void> => {
  const parsed = ResendConfirmationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { sessionId } = parsed.data;
  const { userId } = req as AuthenticatedRequest;

  try {
    const [order] = await db
      .select()
      .from(jobOrdersTable)
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    if (!order || !order.clerkUserId || order.clerkUserId !== userId) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.status !== "paid") {
      res.status(400).json({ error: "Order is not yet confirmed" });
      return;
    }

    const now = Date.now();
    if (order.lastResendAt !== null && now - order.lastResendAt.getTime() < RESEND_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - (now - order.lastResendAt.getTime())) / 1000);
      res.setHeader("Retry-After", String(secondsLeft));
      res.status(429).json({ error: "rate_limited", secondsLeft });
      return;
    }

    await db
      .update(jobOrdersTable)
      .set({ lastResendAt: new Date() })
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    await sendOrderConfirmation({
      email: order.email,
      orderId: order.id,
      productType: order.productType,
      jobsRemaining: order.jobsRemaining,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Error resending order confirmation");
    res.status(500).json({ error: "Failed to resend confirmation email" });
  }
});

export default router;
