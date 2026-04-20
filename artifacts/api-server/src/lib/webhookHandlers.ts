import { getStripeSync } from "./stripeClient";
import { db, jobOrdersTable } from "@workspace/db";
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
      const sessionId = (event?.data as Record<string, unknown>)?.object
        ? ((event.data as Record<string, unknown>).object as Record<string, unknown>)?.id as string | undefined
        : undefined;
      if (sessionId) {
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
          await sendOrderConfirmation({
            email: updatedOrder.email,
            orderId: updatedOrder.id,
            productType: updatedOrder.productType,
            jobsRemaining: updatedOrder.jobsRemaining,
          });
        }
      }
    }
  }
}
