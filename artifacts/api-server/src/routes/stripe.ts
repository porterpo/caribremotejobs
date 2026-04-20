import { Router, type IRouter } from "express";
import { db, jobOrdersTable, certificationOrdersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { logger } from "../lib/logger";
import { sendOrderConfirmation, sendCertificationApplicationConfirmation } from "../lib/resend";

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
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
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

router.post("/stripe/checkout", async (req, res): Promise<void> => {
  const { priceId, email, companyName } = req.body as {
    priceId: string;
    email: string;
    companyName?: string;
  };

  if (!priceId || !email) {
    res.status(400).json({ error: "priceId and email are required" });
    return;
  }

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

    const validTypes = ["single", "pack", "monthly", "featured", "certification"];
    if (!validTypes.includes(productType)) {
      res.status(400).json({ error: `Unknown product type: ${productType}` });
      return;
    }

    if (productType === "certification" && !companyName) {
      res.status(400).json({ error: "companyName is required for certification purchases" });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

    const isCertification = productType === "certification";
    const successUrl = isCertification
      ? `${baseUrl}/certify/success?session_id={CHECKOUT_SESSION_ID}`
      : `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = isCertification ? `${baseUrl}/certify` : `${baseUrl}/pricing`;

    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { productType, email, ...(companyName ? { companyName } : {}) },
    });

    if (productType === "certification") {
      await db.insert(certificationOrdersTable).values({
        email,
        companyName: companyName!,
        stripeSessionId: session.id,
        status: "pending",
      });
    } else {
      const jobsRemaining =
        productType === "pack" ? 3 : productType === "monthly" ? 999 : 1;

      await db.insert(jobOrdersTable).values({
        email,
        stripeSessionId: session.id,
        productType,
        status: "pending",
        jobsRemaining,
      });

      return res.json({ url: session.url });
    }

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "Error creating checkout session");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.get("/stripe/session/:id", async (req, res): Promise<void> => {
  const sessionId = req.params.id;
  try {
    const [order] = await db
      .select()
      .from(jobOrdersTable)
      .where(eq(jobOrdersTable.stripeSessionId, sessionId));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    res.json(order);
  } catch (err) {
    logger.error({ err }, "Error fetching session");
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

router.get("/stripe/certification-session/:id", async (req, res): Promise<void> => {
  const sessionId = req.params.id;
  try {
    const [order] = await db
      .select()
      .from(certificationOrdersTable)
      .where(eq(certificationOrdersTable.stripeSessionId, sessionId));

    if (!order) {
      res.status(404).json({ error: "Certification order not found" });
      return;
    }

    res.json(order);
  } catch (err) {
    logger.error({ err }, "Error fetching certification session");
    res.status(500).json({ error: "Failed to fetch certification session" });
  }
});

const resendTimestamps = new Map<string, number>();
const RESEND_COOLDOWN_MS = 60_000;

router.post("/stripe/resend-confirmation", async (req, res): Promise<void> => {
  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  const now = Date.now();
  const lastSent = resendTimestamps.get(sessionId);
  if (lastSent !== undefined && now - lastSent < RESEND_COOLDOWN_MS) {
    const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
    res.setHeader("Retry-After", String(secondsLeft));
    res.status(429).json({ error: "rate_limited", secondsLeft });
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
      res.status(400).json({ error: "Order is not yet confirmed" });
      return;
    }

    resendTimestamps.set(sessionId, now);

    await sendOrderConfirmation({
      email: order.email,
      orderId: order.id,
      productType: order.productType,
      jobsRemaining: order.jobsRemaining,
    });

    res.json({ success: true });
  } catch (err) {
    resendTimestamps.delete(sessionId);
    logger.error({ err }, "Error resending order confirmation");
    res.status(500).json({ error: "Failed to resend confirmation email" });
  }
});

router.post("/stripe/resend-certification-confirmation", async (req, res): Promise<void> => {
  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  try {
    const [order] = await db
      .select()
      .from(certificationOrdersTable)
      .where(eq(certificationOrdersTable.stripeSessionId, sessionId));

    if (!order) {
      res.status(404).json({ error: "Certification order not found" });
      return;
    }

    if (order.status !== "paid") {
      res.status(400).json({ error: "Order is not yet confirmed" });
      return;
    }

    const now = Date.now();
    if (order.lastResendAt) {
      const elapsed = now - order.lastResendAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        res.setHeader("Retry-After", String(secondsLeft));
        res.status(429).json({ error: "rate_limited", secondsLeft });
        return;
      }
    }

    await db
      .update(certificationOrdersTable)
      .set({ lastResendAt: new Date(now) })
      .where(eq(certificationOrdersTable.stripeSessionId, sessionId));

    try {
      await sendCertificationApplicationConfirmation({
        email: order.email,
        companyName: order.companyName,
      });
    } catch (sendErr) {
      await db
        .update(certificationOrdersTable)
        .set({ lastResendAt: order.lastResendAt })
        .where(eq(certificationOrdersTable.stripeSessionId, sessionId));
      throw sendErr;
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Error resending certification confirmation");
    res.status(500).json({ error: "Failed to resend confirmation email" });
  }
});

export default router;
