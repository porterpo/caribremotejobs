import { Router, type IRouter } from "express";
import { eq, count, gte, and } from "drizzle-orm";
import { db, jobsTable, companiesTable, alertsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalJobsResult,
    caribbeanFriendlyJobsResult,
    totalCompaniesResult,
    caribbeanFriendlyCompaniesResult,
    alertSubscribersResult,
    newJobsThisWeekResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(jobsTable).where(eq(jobsTable.approved, true)),
    db.select({ count: count() }).from(jobsTable).where(and(eq(jobsTable.approved, true), eq(jobsTable.caribbeanFriendly, true))),
    db.select({ count: count() }).from(companiesTable),
    db.select({ count: count() }).from(companiesTable).where(eq(companiesTable.caribbeanFriendly, true)),
    db.select({ count: count() }).from(alertsTable).where(eq(alertsTable.active, true)),
    db.select({ count: count() }).from(jobsTable).where(and(eq(jobsTable.approved, true), gte(jobsTable.postedAt, sevenDaysAgo))),
  ]);

  res.json({
    totalJobs: totalJobsResult[0]?.count ?? 0,
    caribbeanFriendlyJobs: caribbeanFriendlyJobsResult[0]?.count ?? 0,
    totalCompanies: totalCompaniesResult[0]?.count ?? 0,
    caribbeanFriendlyCompanies: caribbeanFriendlyCompaniesResult[0]?.count ?? 0,
    alertSubscribers: alertSubscribersResult[0]?.count ?? 0,
    newJobsThisWeek: newJobsThisWeekResult[0]?.count ?? 0,
  });
});

router.get("/stats/by-category", async (_req, res): Promise<void> => {
  const result = await db
    .select({
      category: jobsTable.category,
      count: count(),
    })
    .from(jobsTable)
    .where(eq(jobsTable.approved, true))
    .groupBy(jobsTable.category)
    .orderBy(count());

  res.json(result);
});

export default router;
