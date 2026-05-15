import cron from "node-cron";
import { clerkClient } from "@clerk/express";
import { and, eq, gte, lt, isNotNull, or, isNull, sql } from "drizzle-orm";
import { db, resumesTable, alertsTable, jobsTable } from "@workspace/db";
import { logger } from "./logger";
import { runJobSync } from "./sync";
import { sendShareLinkExpiryReminder, sendJobAlerts } from "./resend";

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

async function runJobAlertDigest(): Promise<void> {
  const alerts = await db
    .select()
    .from(alertsTable)
    .where(eq(alertsTable.active, true));

  if (alerts.length === 0) {
    logger.info("Job alert digest: no active subscribers");
    return;
  }

  // Safety cap: never look back more than 48 hours regardless of lastAlertSentAt
  const cap48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Find the earliest window we need (so one jobs query covers all subscribers)
  const earliestSince = alerts.reduce<Date>((acc, a) => {
    const since = a.lastAlertSentAt ?? cap48h;
    return since < acc ? since : acc;
  }, new Date());
  const windowStart = earliestSince < cap48h ? cap48h : earliestSince;

  const recentJobs = await db
    .select({
      id: jobsTable.id,
      title: jobsTable.title,
      companyName: jobsTable.companyName,
      applyUrl: jobsTable.applyUrl,
      category: jobsTable.category,
      jobType: jobsTable.jobType,
      postedAt: jobsTable.postedAt,
    })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.approved, true),
        eq(jobsTable.rejectedForViolation, false),
        gte(jobsTable.postedAt, windowStart),
      ),
    );

  if (recentJobs.length === 0) {
    logger.info({ since: windowStart }, "Job alert digest: no new jobs in window");
    return;
  }

  let sent = 0;
  let failed = 0;
  const now = new Date();

  for (const alert of alerts) {
    const since = alert.lastAlertSentAt ?? cap48h;
    const matchingJobs = recentJobs.filter((job) => {
      if (job.postedAt < since) return false;

      if (alert.categories) {
        const cats = alert.categories.split(",").map((c) => c.trim().toLowerCase());
        if (!cats.includes(job.category.toLowerCase())) return false;
      }

      if (alert.jobTypes) {
        const types = alert.jobTypes.split(",").map((t) => t.trim().toLowerCase());
        if (!types.includes(job.jobType.toLowerCase())) return false;
      }

      if (alert.keywords) {
        const kws = alert.keywords.split(",").map((k) => k.trim().toLowerCase());
        const haystack = `${job.title} ${job.companyName}`.toLowerCase();
        if (!kws.some((kw) => haystack.includes(kw))) return false;
      }

      return true;
    });

    if (matchingJobs.length === 0) continue;

    try {
      await sendJobAlerts(alert.email, alert.token, matchingJobs);
      await db
        .update(alertsTable)
        .set({ lastAlertSentAt: now })
        .where(eq(alertsTable.id, alert.id));
      sent += 1;
    } catch (err) {
      failed += 1;
      logger.error({ err, alertId: alert.id }, "Job alert digest: send failed");
    }
  }

  logger.info({ subscribers: alerts.length, sent, failed }, "Job alert digest: pass complete");
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

  // Daily job alert digest at 08:00 UTC (2h after morning job sync)
  cron.schedule("0 8 * * *", async () => {
    logger.info("Job alert digest starting");
    try {
      await runJobAlertDigest();
    } catch (err) {
      logger.error({ err }, "Job alert digest failed");
    }
  });

  logger.info(
    "Scheduler started — job sync 06:00/14:00/22:00 UTC, alert digest 08:00 UTC, share-link reminders 09:00 UTC",
  );
}
