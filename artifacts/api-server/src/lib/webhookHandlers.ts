import { getStripeSync } from "./stripeClient";
import { db, jobOrdersTable, certificationOrdersTable, companiesTable, jobsTable } from "@workspace/db";
import { eq, ne, and, lt, isNotNull } from "drizzle-orm";
import { sendOrderConfirmation, sendCertificationApplicationConfirmation } from "./resend";
import { logger } from "./logger";

async function revokeCertificationByCompanyId(companyId: number, companyName: string, reason: string): Promise<void> {
  await db
    .update(companiesTable)
    .set({ caribbeanFriendlyCertified: false, certificationExpiresAt: null })
    .where(eq(companiesTable.id, companyId));

  await db
    .update(jobsTable)
    .set({ caribbeanFriendly: false })
    .where(eq(jobsTable.companyId, companyId));

  logger.info({ companyId, companyName, reason }, "Certification revoked from company and job listings cleared");
}

async function revokeCertificationByCompanyName(companyName: string, reason: string): Promise<void> {
  const existing = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.name, companyName));

  if (existing.length === 0) {
    logger.warn({ companyName, reason }, "Certification revocation: company not found");
    return;
  }

  await revokeCertificationByCompanyId(existing[0].id, companyName, reason);
}

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
      const sessionMetadata = (eventObj?.metadata as Record<string, string>) ?? {};
      const productType = sessionMetadata.productType as string | undefined;
      const subscriptionId = eventObj?.subscription as string | null | undefined;
      const customerId = eventObj?.customer as string | null | undefined;

      if (sessionId) {
        if (productType === "certification") {
          const [updatedCert] = await db
            .update(certificationOrdersTable)
            .set({
              status: "paid",
              ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
              ...(customerId ? { stripeCustomerId: customerId } : {}),
            })
            .where(
              and(
                eq(certificationOrdersTable.stripeSessionId, sessionId),
                ne(certificationOrdersTable.status, "paid"),
              ),
            )
            .returning();

          if (updatedCert) {
            try {
              await sendCertificationApplicationConfirmation({
                email: updatedCert.email,
                companyName: updatedCert.companyName,
              });
            } catch (emailErr) {
              logger.error({ emailErr }, "Failed to send certification application confirmation email — order is still marked paid");
            }
          }
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
    } else if (eventType === "customer.subscription.deleted") {
      const subscriptionId = eventObj?.id as string | undefined;
      if (!subscriptionId) return;

      const certs = await db
        .select({ companyName: certificationOrdersTable.companyName })
        .from(certificationOrdersTable)
        .where(eq(certificationOrdersTable.stripeSubscriptionId, subscriptionId));

      for (const cert of certs) {
        await revokeCertificationByCompanyName(cert.companyName, "subscription deleted");
      }
    } else if (eventType === "invoice.payment_failed") {
      const subscriptionId = eventObj?.subscription as string | null | undefined;
      if (!subscriptionId) return;

      const billingReason = eventObj?.billing_reason as string | undefined;

      const certs = await db
        .select({ companyName: certificationOrdersTable.companyName })
        .from(certificationOrdersTable)
        .where(eq(certificationOrdersTable.stripeSubscriptionId, subscriptionId));

      for (const cert of certs) {
        await revokeCertificationByCompanyName(
          cert.companyName,
          `invoice payment failed (billing_reason: ${billingReason ?? "unknown"})`,
        );
      }
    }
  }

  static async expireElapsedCertifications(): Promise<number> {
    const now = new Date();

    const expiredCompanies = await db
      .select({ id: companiesTable.id, name: companiesTable.name })
      .from(companiesTable)
      .where(
        and(
          eq(companiesTable.caribbeanFriendlyCertified, true),
          isNotNull(companiesTable.certificationExpiresAt),
          lt(companiesTable.certificationExpiresAt, now),
        ),
      );

    if (expiredCompanies.length === 0) return 0;

    for (const company of expiredCompanies) {
      await revokeCertificationByCompanyId(
        company.id,
        company.name,
        "certification expiry date lapsed",
      );
    }

    return expiredCompanies.length;
  }
}
