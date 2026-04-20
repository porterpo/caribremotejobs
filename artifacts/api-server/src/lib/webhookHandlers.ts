import { getStripeSync } from "./stripeClient";
import { db, jobOrdersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

    try {
      const event = JSON.parse(payload.toString("utf8"));
      if (event?.type === "checkout.session.completed") {
        const sessionId: string = event?.data?.object?.id;
        if (sessionId) {
          await db
            .update(jobOrdersTable)
            .set({ status: "paid" })
            .where(eq(jobOrdersTable.stripeSessionId, sessionId));
        }
      }
    } catch {
    }
  }
}
