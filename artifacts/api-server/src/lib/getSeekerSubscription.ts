import { db, seekerSubscriptionsTable, analyticsEventsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";

const FREE_WEEKLY_LIMIT = 3;

export interface SeekerSubscriptionInfo {
  status: string;
  isPro: boolean;
  currentPeriodEnd: Date | null;
  applicationCount: number;
  applicationLimit: number | null;
  stripeCustomerId: string | null;
}

export async function getSeekerSubscription(clerkUserId: string): Promise<SeekerSubscriptionInfo> {
  const [sub] = await db
    .select()
    .from(seekerSubscriptionsTable)
    .where(eq(seekerSubscriptionsTable.clerkUserId, clerkUserId));

  const isPro = sub?.status === "active" || sub?.status === "trialing";

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsEventsTable)
    .where(
      and(
        eq(analyticsEventsTable.userId, clerkUserId),
        eq(analyticsEventsTable.event, "application_started"),
        gte(analyticsEventsTable.occurredAt, oneWeekAgo),
      )
    );

  return {
    status: sub?.status ?? "none",
    isPro,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    applicationCount: countRow?.count ?? 0,
    applicationLimit: isPro ? null : FREE_WEEKLY_LIMIT,
    stripeCustomerId: sub?.stripeCustomerId ?? null,
  };
}
