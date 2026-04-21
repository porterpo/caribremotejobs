import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, analyticsEventsTable, jobsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.post("/analytics/track", async (req, res): Promise<void> => {
  const { event, job_id, has_resume } = req.body ?? {};

  if (typeof event !== "string" || event.length === 0 || event.length > 100) {
    res.status(422).json({ error: "Invalid payload" });
    return;
  }

  const auth = getAuth(req);
  const userId =
    (auth?.sessionClaims?.userId as string | undefined) || auth?.userId || null;

  await db.insert(analyticsEventsTable).values({
    event,
    jobId: Number.isInteger(job_id) ? (job_id as number) : null,
    userId,
    hasResume: typeof has_resume === "boolean" ? has_resume : null,
  });

  res.status(204).end();
});

router.get("/analytics/summary", requireAuth, async (_req, res): Promise<void> => {
  const EVENT_NAME = "skills_nudge_clicked";
  const SKILLS_ADDED_EVENT = "skills_added";
  const SKILLS_UPDATED_EVENT = "skills_updated";
  const APPLICATION_STARTED_EVENT = "application_started";
  const RESUME_SAVED_EVENT = "resume_saved";

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsEventsTable)
    .where(eq(analyticsEventsTable.event, EVENT_NAME));

  const [resumeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsEventsTable)
    .where(
      sql`${analyticsEventsTable.event} = ${EVENT_NAME} and ${analyticsEventsTable.hasResume} = true`
    );

  const [skillsAddedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsEventsTable)
    .where(eq(analyticsEventsTable.event, SKILLS_ADDED_EVENT));

  const eventBreakdownRows = await db
    .select({
      event: analyticsEventsTable.event,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
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
      sql`${analyticsEventsTable.event} = ${EVENT_NAME} and ${analyticsEventsTable.jobId} is not null`
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

export default router;
