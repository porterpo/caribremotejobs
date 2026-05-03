import cron from "node-cron";
import { clerkClient } from "@clerk/express";
import { and, gte, lt, isNotNull, or, isNull, sql } from "drizzle-orm";
import { db, resumesTable } from "@workspace/db";
import { logger } from "./logger";
import { runJobSync } from "./sync";
import { sendShareLinkExpiryReminder } from "./resend";

async function runShareLinkExpiryReminders(): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select({
      id: resumesTable.id,
      clerkUserId: resumesTable.clerkUserId,
      shareTokenExpiresAt: resumesTable.shareTokenExpiresAt,
      shareTokenReminderSentAt: resumesTable.shareTokenReminderSentAt,
    })
    .from(resumesTable)
    .where(
      and(
        isNotNull(resumesTable.shareToken),
        isNotNull(resumesTable.shareTokenExpiresAt),
        gte(resumesTable.shareTokenExpiresAt, windowStart),
        lt(resumesTable.shareTokenExpiresAt, windowEnd),
        or(
          isNull(resumesTable.shareTokenReminderSentAt),
          sql`${resumesTable.shareTokenReminderSentAt} < ${resumesTable.shareTokenExpiresAt} - interval '7 days'`,
        ),
      ),
    );

  if (candidates.length === 0) {
    logger.info("Share link expiry reminders: no candidates in window");
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const row of candidates) {
    if (!row.shareTokenExpiresAt) continue;
    try {
      const user = await clerkClient.users.getUser(row.clerkUserId);
      const email =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses?.[0]?.emailAddress;
      if (!email) {
        logger.warn(
          { resumeId: row.id, clerkUserId: row.clerkUserId },
          "Share link reminder: no email on Clerk user",
        );
        failed += 1;
        continue;
      }
      const ok = await sendShareLinkExpiryReminder({
        email,
        expiresAt: row.shareTokenExpiresAt,
      });
      if (ok) {
        await db
          .update(resumesTable)
          .set({ shareTokenReminderSentAt: new Date() })
          .where(sql`${resumesTable.id} = ${row.id}`);
        sent += 1;
      } else {
        failed += 1;
      }
    } catch (err) {
      failed += 1;
      logger.error(
        { err, resumeId: row.id, clerkUserId: row.clerkUserId },
        "Share link reminder: send failed",
      );
    }
  }
  logger.info(
    { candidates: candidates.length, sent, failed },
    "Share link expiry reminders: pass complete",
  );
}

export function startScheduler(): void {
  // Sync jobs every 8 hours: at 06:00, 14:00, and 22:00 UTC
  cron.schedule("0 6,14,22 * * *", async () => {
    logger.info("Scheduled job sync starting");
    try {
      const result = await runJobSync();
      logger.info(result, "Scheduled job sync finished");
    } catch (err) {
      logger.error({ err }, "Scheduled job sync failed");
    }
  });

  // Daily share-link expiry reminders at 09:00 UTC
  cron.schedule("0 9 * * *", async () => {
    logger.info("Share link expiry reminder pass starting");
    try {
      await runShareLinkExpiryReminders();
    } catch (err) {
      logger.error({ err }, "Share link expiry reminder pass failed");
    }
  });

  logger.info(
    "Scheduler started — job sync 06:00/14:00/22:00 UTC, share-link reminders 09:00 UTC",
  );
}
