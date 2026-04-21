import { Router } from "express";
import { db, seekerSubscriptionsTable, analyticsEventsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { logger } from "../lib/logger";

const router = Router();

const FREE_WEEKLY_LIMIT = 3;

router.get("/seeker/subscription", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const [sub] = await db
    .select()
    .from(seekerSubscriptionsTable)
    .where(eq(seekerSubscriptionsTable.clerkUserId, userId));

  const isPro = sub?.status === "active" || sub?.status === "trialing";

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsEventsTable)
    .where(
      and(
        eq(analyticsEventsTable.userId, userId),
        eq(analyticsEventsTable.event, "application_started"),
        gte(analyticsEventsTable.occurredAt, oneWeekAgo),
      )
    );

  res.json({
    status: sub?.status ?? "none",
    isPro,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    applicationCount: countRow?.count ?? 0,
    applicationLimit: isPro ? null : FREE_WEEKLY_LIMIT,
  });
});

router.post("/stripe/seeker-checkout", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  try {
    const rows = await db.execute(sql`
      SELECT pr.id AS price_id, p.metadata AS product_metadata
      FROM stripe.prices pr
      JOIN stripe.products p ON pr.product = p.id
      WHERE p.active = true
        AND pr.active = true
        AND p.metadata->>'type' = 'seeker_pro'
      LIMIT 1
    `);

    if (!rows.rows.length) {
      res.status(400).json({ error: "Seeker Pro product not found. Please run the seed script." });
      return;
    }

    const priceId = (rows.rows[0] as Record<string, unknown>).price_id as string;
    const stripe = await getUncachableStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${baseUrl}/seeker-pro?success=1`,
      cancel_url: `${baseUrl}/seeker-pro?canceled=1`,
      metadata: { clerkUserId: userId, productType: "seeker_pro" },
      subscription_data: {
        metadata: { clerkUserId: userId },
      },
    });

    await db
      .insert(seekerSubscriptionsTable)
      .values({ clerkUserId: userId, status: "pending" })
      .onConflictDoNothing();

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "Error creating seeker checkout session");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/stripe/seeker-portal", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const [sub] = await db
    .select()
    .from(seekerSubscriptionsTable)
    .where(eq(seekerSubscriptionsTable.clerkUserId, userId));

  if (!sub?.stripeCustomerId) {
    res.status(400).json({ error: "No active subscription found" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${baseUrl}/seeker-pro`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "Error creating billing portal session");
    res.status(500).json({ error: "Failed to open billing portal" });
  }
});

export default router;
