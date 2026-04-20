import { getStripeSync } from "./stripeClient";
import { db, jobOrdersTable, certificationOrdersTable } from "@workspace/db";
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

    if (event?.type === "checkout.session.completed") {
      const sessionObj = (event?.data as Record<string, unknown>)?.object
        ? (event.data as Record<string, unknown>).object as Record<string, unknown>
        : undefined;
      const sessionId = sessionObj?.id as string | undefined;
      const sessionMetadata = (sessionObj?.metadata as Record<string, string>) ?? {};
      const productType = sessionMetadata.productType as string | undefined;

      if (sessionId) {
        if (productType === "certification") {
          await db
            .update(certificationOrdersTable)
            .set({ status: "paid" })
            .where(eq(certificationOrdersTable.stripeSessionId, sessionId));
        } else {
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
            try {
              await sendOrderConfirmation({
                email: updatedOrder.email,
                orderId: updatedOrder.id,
                productType: updatedOrder.productType,
                jobsRemaining: updatedOrder.jobsRemaining,
              });
            } catch (emailErr) {
              logger.error({ emailErr }, "Failed to send order confirmation email via webhook — order is still marked paid");
            }
          }
        }
      }
    }
  }
}
