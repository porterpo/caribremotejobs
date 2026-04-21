import { getStripeSync, getUncachableStripeClient } from "./stripeClient";
import { db, jobOrdersTable, seekerSubscriptionsTable } from "@workspace/db";
import { eq, ne, and } from "drizzle-orm";
import { sendOrderConfirmation } from "./resend";
import { logger } from "./logger";

export class WebhookHandlers {
  static async processWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "Received type: " +
          typeof payload +
          ". " +
          "Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    const sync = await getStripeSync();

    await sync.processWebhook(payload, signature);

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload.toString("utf8"));
    } catch (parseErr) {
      logger.warn({ parseErr }, "Webhook payload JSON parse failed — skipping custom handler");
      return;
    }

    const eventType = event?.type as string | undefined;
    const eventObj = ((event?.data as Record<string, unknown>)?.object ?? {}) as Record<string, unknown>;

    if (eventType === "checkout.session.completed") {
      const sessionId = eventObj?.id as string | undefined;
      const sessionMetadata = (eventObj?.metadata ?? {}) as Record<string, string>;
      const productType = sessionMetadata?.productType as string | undefined;

      if (sessionId && productType === "seeker_pro") {
        const clerkUserId = sessionMetadata?.clerkUserId;
        const customerId = eventObj?.customer as string | undefined;
        const subscriptionId = eventObj?.subscription as string | undefined;
        if (clerkUserId) {
          let currentPeriodEnd: Date | null = null;
          if (subscriptionId) {
            try {
              const stripe = await getUncachableStripeClient();
              const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
              currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
            } catch (subErr) {
              logger.warn({ subErr }, "Could not fetch subscription currentPeriodEnd at checkout — will be set by subscription event");
            }
          }
          await db
            .insert(seekerSubscriptionsTable)
            .values({
              clerkUserId,
              stripeCustomerId: customerId ?? null,
              stripeSubscriptionId: subscriptionId ?? null,
              status: "active",
              currentPeriodEnd,
            })
            .onConflictDoUpdate({
              target: seekerSubscriptionsTable.clerkUserId,
              set: {
                stripeCustomerId: customerId ?? null,
                stripeSubscriptionId: subscriptionId ?? null,
                status: "active",
                currentPeriodEnd,
                updatedAt: new Date(),
              },
            });
          logger.info({ clerkUserId }, "Seeker Pro subscription activated via checkout");
        }
      } else if (sessionId) {
        const [updatedOrder] = await db
          .update(jobOrdersTable)
          .set({ status: "paid" })
          .where(
            and(
              eq(jobOrdersTable.stripeSessionId, sessionId),
              ne(jobOrdersTable.status, "paid"),
            ),
          )
          .returning();

        if (updatedOrder) {
          let emailSent = false;
          try {
            await sendOrderConfirmation({
              email: updatedOrder.email,
              orderId: updatedOrder.id,
              productType: updatedOrder.productType,
              jobsRemaining: updatedOrder.jobsRemaining,
            });
            emailSent = true;
          } catch (emailErr) {
            logger.error({ emailErr }, "Failed to send order confirmation email via webhook — order is still marked paid");
          }
          if (emailSent) {
            try {
              await db
                .update(jobOrdersTable)
                .set({ confirmationEmailSentAt: new Date() })
                .where(eq(jobOrdersTable.id, updatedOrder.id));
            } catch (dbErr) {
              logger.error({ dbErr }, "Failed to record confirmationEmailSentAt after successful email send");
            }
          }
        }
      }
    }

    if (
      eventType === "customer.subscription.updated" ||
      eventType === "customer.subscription.created"
    ) {
      const subMetadata = ((eventObj?.metadata ?? {}) as Record<string, string>);
      let clerkUserId = subMetadata?.clerkUserId;
      const customerId = eventObj?.customer as string | undefined;
      const subscriptionId = eventObj?.id as string | undefined;

      // Fallback: look up clerkUserId via stripeSubscriptionId only (not customerId)
      // to avoid cross-product contamination if the customer has other recurring subscriptions
      if (!clerkUserId && subscriptionId) {
        const [existing] = await db
          .select({ clerkUserId: seekerSubscriptionsTable.clerkUserId })
          .from(seekerSubscriptionsTable)
          .where(eq(seekerSubscriptionsTable.stripeSubscriptionId, subscriptionId));
        clerkUserId = existing?.clerkUserId;
      }

      if (clerkUserId) {
        const status = (eventObj?.status as string) ?? "none";
        const currentPeriodEnd = eventObj?.current_period_end
          ? new Date((eventObj.current_period_end as number) * 1000)
          : null;

        await db
          .insert(seekerSubscriptionsTable)
          .values({
            clerkUserId,
            stripeCustomerId: customerId ?? null,
            stripeSubscriptionId: subscriptionId ?? null,
            status,
            currentPeriodEnd,
          })
          .onConflictDoUpdate({
            target: seekerSubscriptionsTable.clerkUserId,
            set: {
              status,
              currentPeriodEnd,
              stripeCustomerId: customerId ?? null,
              stripeSubscriptionId: subscriptionId ?? null,
              updatedAt: new Date(),
            },
          });
        logger.info({ clerkUserId, status }, "Seeker subscription updated");
      }
    }

    if (eventType === "customer.subscription.deleted") {
      const subMetadata = ((eventObj?.metadata ?? {}) as Record<string, string>);
      let clerkUserId = subMetadata?.clerkUserId;
      const customerId = eventObj?.customer as string | undefined;
      const subscriptionId = eventObj?.id as string | undefined;

      // Fallback: look up clerkUserId via stripeSubscriptionId only (not customerId)
      // to avoid cross-product contamination if the customer has other recurring subscriptions
      if (!clerkUserId && subscriptionId) {
        const [existing] = await db
          .select({ clerkUserId: seekerSubscriptionsTable.clerkUserId })
          .from(seekerSubscriptionsTable)
          .where(eq(seekerSubscriptionsTable.stripeSubscriptionId, subscriptionId));
        clerkUserId = existing?.clerkUserId;
      }

      if (clerkUserId) {
        await db
          .update(seekerSubscriptionsTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(seekerSubscriptionsTable.clerkUserId, clerkUserId));
        logger.info({ clerkUserId }, "Seeker subscription cancelled");
      }
    }
  }
}
