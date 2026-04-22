import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, analyticsEventsTable, jobsTable, adminPreferencesTable } from "@workspace/db";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/admin/preferences/analytics-date-range", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId;
  const [preference] = await db
    .select({
      analyticsDateFrom: adminPreferencesTable.analyticsDateFrom,
      analyticsDateTo: adminPreferencesTable.analyticsDateTo,
    })
    .from(adminPreferencesTable)
    .where(eq(adminPreferencesTable.clerkUserId, userId));

  res.json({
    analyticsDateFrom: preference?.analyticsDateFrom ?? null,
    analyticsDateTo: preference?.analyticsDateTo ?? null,
  });
});

router.put("/admin/preferences/analytics-date-range", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId;
  const body = req.body as { analyticsDateFrom?: string | null; analyticsDateTo?: string | null };
  const analyticsDateFrom = typeof body.analyticsDateFrom === "string" && body.analyticsDateFrom ? body.analyticsDateFrom : null;
  const analyticsDateTo = typeof body.analyticsDateTo === "string" && body.analyticsDateTo ? body.analyticsDateTo : null;

  const [saved] = await db
    .insert(adminPreferencesTable)
    .values({ clerkUserId: userId, analyticsDateFrom, analyticsDateTo })
    .onConflictDoUpdate({
      target: adminPreferencesTable.clerkUserId,
      set: {
        analyticsDateFrom,
        analyticsDateTo,
        updatedAt: new Date(),
      },
    })
    .returning({
      analyticsDateFrom: adminPreferencesTable.analyticsDateFrom,
      analyticsDateTo: adminPreferencesTable.analyticsDateTo,
    });

  res.json({
    analyticsDateFrom: saved?.analyticsDateFrom ?? null,
    analyticsDateTo: saved?.analyticsDateTo ?? null,
  });
});

router.post("/analytics/track", async (req, res): Promise<void> => {
  const { event, job_id, has_resume, resume_type } = req.body ?? {};

  if (typeof event !== "string" || event.length === 0 || event.length > 100) {
    res.status(422).json({ error: "Invalid payload" });
    return;
  }

  const auth = getAuth(req);
  const userId =
    (auth?.sessionClaims?.userId as string | undefined) || auth?.userId || null;

  const validResumeTypes = ["built", "pdf", "none"];
  const resumeType =
    typeof resume_type === "string" && validResumeTypes.includes(resume_type)
      ? resume_type
      : null;

  await db.insert(analyticsEventsTable).values({
    event,
    jobId: Number.isInteger(job_id) ? (job_id as number) : null,
    userId,
    hasResume: typeof has_resume === "boolean" ? has_resume : null,
    resumeType,
  });

  res.status(204).end();
});

router.get("/applications/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId;
  const rows = await db
    .select({
      jobId: analyticsEventsTable.jobId,
      jobTitle: jobsTable.title,
      companyName: jobsTable.companyName,
      resumeType: sql<string | null>`max(${analyticsEventsTable.resumeType})`,
      appliedAt: sql<string | null>`max(${analyticsEventsTable.occurredAt})`,
    })
    .from(analyticsEventsTable)
    .leftJoin(jobsTable, eq(analyticsEventsTable.jobId, jobsTable.id))
    .where(and(eq(analyticsEventsTable.userId, userId), eq(analyticsEventsTable.event, "application_started")))
    .groupBy(analyticsEventsTable.jobId, jobsTable.title, jobsTable.companyName)
    .orderBy(desc(sql`max(${analyticsEventsTable.occurredAt})`));

  res.json({
    applications: rows
      .filter((row) => row.jobId !== null)
      .map((row) => ({
        jobId: row.jobId,
        jobTitle: row.jobTitle,
        companyName: row.companyName,
        appliedAt: row.appliedAt,
        resumeType: row.resumeType ?? null,
      })),
  });
});

router.get("/analytics/summary", requireAuth, async (req, res): Promise<void> => {
  const EVENT_NAME = "skills_nudge_clicked";
  const SKILLS_ADDED_EVENT = "skills_added";
  const SKILLS_UPDATED_EVENT = "skills_updated";
  const APPLICATION_STARTED_EVENT = "application_started";
  const RESUME_SAVED_EVENT = "resume_saved";

  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

  const dateConditions = [];
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!isNaN(from.getTime())) {
      dateConditions.push(gte(analyticsEventsTable.occurredAt, from));
    }
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (!isNaN(to.getTime())) {
      to.setUTCHours(23, 59, 59, 999);
      dateConditions.push(lte(analyticsEventsTable.occurredAt, to));
    }
  }

  function withDate(condition: ReturnType<typeof eq>) {
    if (dateConditions.length === 0) return condition;
    return and(condition, ...dateConditions)!;
  }

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsEventsTable)
    .where(withDate(eq(analyticsEventsTable.event, EVENT_NAME)));

  const [resumeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsEventsTable)
    .where(
      dateConditions.length > 0
        ? and(
            sql`${analyticsEventsTable.event} = ${EVENT_NAME} and ${analyticsEventsTable.hasResume} = true`,
            ...dateConditions
          )
        : sql`${analyticsEventsTable.event} = ${EVENT_NAME} and ${analyticsEventsTable.hasResume} = true`
    );

  const [skillsAddedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsEventsTable)
    .where(withDate(eq(analyticsEventsTable.event, SKILLS_ADDED_EVENT)));

  const eventBreakdownRows = await db
    .select({
      event: analyticsEventsTable.event,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(dateConditions.length > 0 ? and(...dateConditions) : undefined)
    .groupBy(analyticsEventsTable.event)
    .orderBy(desc(sql`count(*)`));

  const countMap: Record<string, number> = {};
  for (const row of eventBreakdownRows) {
    countMap[row.event] = row.count;
  }

  const eventBreakdown = eventBreakdownRows.map((row) => ({
    event: row.event,
    count: row.count,
  }));

  const perJob = await db
    .select({
      jobId: analyticsEventsTable.jobId,
      jobTitle: jobsTable.title,
      companyName: jobsTable.companyName,
      clicks: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .leftJoin(jobsTable, eq(analyticsEventsTable.jobId, jobsTable.id))
    .where(
      dateConditions.length > 0
        ? and(
            sql`${analyticsEventsTable.event} = ${EVENT_NAME} and ${analyticsEventsTable.jobId} is not null`,
            ...dateConditions
          )
        : sql`${analyticsEventsTable.event} = ${EVENT_NAME} and ${analyticsEventsTable.jobId} is not null`
    )
    .groupBy(analyticsEventsTable.jobId, jobsTable.title, jobsTable.companyName)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  res.json({
    totalClicks: totalRow?.count ?? 0,
    clicksWithResume: resumeRow?.count ?? 0,
    skillsAdded: skillsAddedRow?.count ?? 0,
    applicationStarted: countMap[APPLICATION_STARTED_EVENT] ?? 0,
    resumeSaved: countMap[RESUME_SAVED_EVENT] ?? 0,
    skillsUpdated: countMap[SKILLS_UPDATED_EVENT] ?? 0,
    eventBreakdown,
    topJobs: perJob,
  });
});

router.get("/analytics/trend", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo, event, granularity: granularityParam } = req.query as {
    dateFrom?: string; dateTo?: string; event?: string; granularity?: string;
  };
  const granularity = granularityParam === "week" ? "week" : "day";
  const eventList = typeof event === "string" && event.length > 0 ? event.split(",").map((v) => v.trim()).filter(Boolean) : [];

  const conditions = [];
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!isNaN(from.getTime())) {
      conditions.push(gte(analyticsEventsTable.occurredAt, from));
    }
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (!isNaN(to.getTime())) {
      to.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(analyticsEventsTable.occurredAt, to));
    }
  }
  if (eventList.length === 1) {
    conditions.push(eq(analyticsEventsTable.event, eventList[0]));
  }

  let rows: { date: string; count: number }[];

  if (granularity === "week") {
    rows = await db
      .select({
        date: sql<string>`to_char(DATE_TRUNC('week', ${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(analyticsEventsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(sql`DATE_TRUNC('week', ${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC')`)
      .orderBy(sql`DATE_TRUNC('week', ${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC')`);
  } else {
    rows = await db
      .select({
        date: sql<string>`to_char(${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(analyticsEventsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(sql`to_char(${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);
  }

  if (eventList.length <= 1) {
    res.json({ trend: rows, granularity });
    return;
  }

  const series = await Promise.all(
    eventList.map(async (eventName) => {
      const eventConditions = [...conditions, eq(analyticsEventsTable.event, eventName)];
      const eventRows = await db
        .select({
          date: granularity === "week"
            ? sql<string>`to_char(DATE_TRUNC('week', ${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
            : sql<string>`to_char(${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(analyticsEventsTable)
        .where(and(...eventConditions))
        .groupBy(
          granularity === "week"
            ? sql`DATE_TRUNC('week', ${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC')`
            : sql`to_char(${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
        )
        .orderBy(
          granularity === "week"
            ? sql`DATE_TRUNC('week', ${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC')`
            : sql`to_char(${analyticsEventsTable.occurredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
        );
      return { event: eventName, trend: eventRows };
    })
  );

  res.json({ trend: series, granularity });
});

export default router;
