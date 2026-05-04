import { db, jobOrdersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function assertOrderOwnership(
  stripeSessionId: string,
  clerkUserId: string
): Promise<void> {
  const [order] = await db
    .select({ clerkUserId: jobOrdersTable.clerkUserId })
    .from(jobOrdersTable)
    .where(eq(jobOrdersTable.stripeSessionId, stripeSessionId));
  if (!order) throw Object.assign(new Error("Order not found"), { status: 404 });
  if (order.clerkUserId !== null && order.clerkUserId !== clerkUserId)
    throw Object.assign(new Error("Forbidden"), { status: 403 });
}
