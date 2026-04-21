import { Router, type IRouter } from "express";
import { eq, and, or, gte, lte, ilike, desc, count, sql } from "drizzle-orm";
import { db, jobsTable } from "@workspace/db";
import {
  ListJobsQueryParams,
  CreateJobBody,
  GetJobParams,
  UpdateJobParams,
  UpdateJobBody,
  DeleteJobParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/jobs/featured", async (req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.featured, true), eq(jobsTable.approved, true)))
    .orderBy(desc(jobsTable.postedAt))
    .limit(6);
  res.json(jobs);
});

router.get("/jobs/recent", async (req, res): Promise<void> => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.approved, true), gte(jobsTable.postedAt, sevenDaysAgo)))
    .orderBy(
      desc(sql<number>`CASE WHEN ${jobsTable.source} IN ('manual','employer') THEN 1 ELSE 0 END`),
      desc(jobsTable.postedAt)
    )
    .limit(10);
  res.json(jobs);
});

router.get("/jobs/tags", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ tags: jobsTable.tags })
    .from(jobsTable)
    .where(eq(jobsTable.approved, true));

  const countMap = new Map<string, number>();
  for (const row of rows) {
    if (!row.tags) continue;
    const parts = row.tags.split(",").map((t) => t.trim()).filter(Boolean);
    for (const tag of parts) {
      countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
    }
  }

  const result = Array.from(countMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  res.json(result);
});

router.get("/jobs/tag-counts", async (req, res): Promise<void> => {
  const rawTag = req.query.tag;
  const normalizedQuery = {
    ...req.query,
    tag: rawTag !== undefined
      ? (Array.isArray(rawTag) ? rawTag : [rawTag])
      : undefined,
  };
  const parsed = ListJobsQueryParams.safeParse(normalizedQuery);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const params = parsed.data;
  const tagList = params.tag ?? [];

  if (tagList.length < 2) {
    res.status(400).json({ error: "At least 2 tags required" });
    return;
  }

  const baseConditions: ReturnType<typeof eq>[] = [eq(jobsTable.approved, true)];
  if (params.category) baseConditions.push(eq(jobsTable.category, params.category));
  if (params.jobType) baseConditions.push(eq(jobsTable.jobType, params.jobType));
  if (params.caribbeanFriendly !== undefined) baseConditions.push(eq(jobsTable.caribbeanFriendly, params.caribbeanFriendly));
  if (params.entryLevel !== undefined) baseConditions.push(eq(jobsTable.entryLevel, params.entryLevel));
  if (params.featured !== undefined) baseConditions.push(eq(jobsTable.featured, params.featured));

  const tagSqlConditions = tagList.map((t) => {
    const escapedTag = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return sql`${jobsTable.tags} ~* ${`(^|,\\s*)${escapedTag}(\\s*,|$)`}`;
  });

  const andWhere = and(...baseConditions, ...tagSqlConditions.map((c) => c as ReturnType<typeof eq>));
  const orWhere = and(...baseConditions, or(...tagSqlConditions) as ReturnType<typeof eq>);

  let andCountQuery = db.select({ count: count() }).from(jobsTable).$dynamic().where(andWhere);
  let orCountQuery = db.select({ count: count() }).from(jobsTable).$dynamic().where(orWhere);

  if (params.search) {
    const searchWhere = ilike(jobsTable.title, `%${params.search}%`);
    andCountQuery = andCountQuery.where(searchWhere);
    orCountQuery = orCountQuery.where(searchWhere);
  }

  const [andResult, orResult] = await Promise.all([andCountQuery, orCountQuery]);

  res.json({
    andCount: andResult[0]?.count ?? 0,
    orCount: orResult[0]?.count ?? 0,
  });
});

router.get("/jobs", async (req, res): Promise<void> => {
  const rawTag = req.query.tag;
  const normalizedQuery = {
    ...req.query,
    tag: rawTag !== undefined
      ? (Array.isArray(rawTag) ? rawTag : [rawTag])
      : undefined,
  };
  const parsed = ListJobsQueryParams.safeParse(normalizedQuery);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const params = parsed.data;
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [eq(jobsTable.approved, true)];

  if (params.category) conditions.push(eq(jobsTable.category, params.category));
  if (params.jobType) conditions.push(eq(jobsTable.jobType, params.jobType));
  if (params.caribbeanFriendly !== undefined) conditions.push(eq(jobsTable.caribbeanFriendly, params.caribbeanFriendly));
  if (params.entryLevel !== undefined) conditions.push(eq(jobsTable.entryLevel, params.entryLevel));
  if (params.featured !== undefined) conditions.push(eq(jobsTable.featured, params.featured));
  if (params.tag) {
    const tagList = Array.isArray(params.tag) ? params.tag : [params.tag];
    if (params.tagLogic === "or") {
      const orConditions = tagList.map((t) => {
        const escapedTag = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const tagPattern = `(^|,\\s*)${escapedTag}(\\s*,|$)`;
        return sql`${jobsTable.tags} ~* ${tagPattern}`;
      });
      conditions.push(or(...orConditions) as ReturnType<typeof eq>);
    } else {
      for (const t of tagList) {
        const escapedTag = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const tagPattern = `(^|,\\s*)${escapedTag}(\\s*,|$)`;
        conditions.push(sql`${jobsTable.tags} ~* ${tagPattern}` as ReturnType<typeof eq>);
      }
    }
  }
  if (params.salaryMin !== undefined) {
    conditions.push(gte(jobsTable.salaryMin, params.salaryMin));
  }
  if (params.salaryMax !== undefined) {
    conditions.push(lte(jobsTable.salaryMax, params.salaryMax));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let baseQuery = db.select().from(jobsTable).$dynamic();
  let countQuery = db.select({ count: count() }).from(jobsTable).$dynamic();

  if (where) {
    baseQuery = baseQuery.where(where);
    countQuery = countQuery.where(where);
  }

  if (params.search) {
    const searchWhere = ilike(jobsTable.title, `%${params.search}%`);
    baseQuery = baseQuery.where(searchWhere);
    countQuery = countQuery.where(searchWhere);
  }

  const [jobs, countResult] = await Promise.all([
    baseQuery.orderBy(
      desc(jobsTable.featured),
      desc(sql<number>`CASE WHEN ${jobsTable.source} IN ('manual','employer') THEN 1 ELSE 0 END`),
      desc(jobsTable.postedAt)
    ).limit(limit).offset(offset),
    countQuery,
  ]);

  const total = countResult[0]?.count ?? 0;

  res.json({
    jobs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

router.post("/jobs", async (req, res): Promise<void> => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [job] = await db
    .insert(jobsTable)
    .values({
      ...parsed.data,
      caribbeanFriendly: parsed.data.caribbeanFriendly ?? false,
      featured: parsed.data.featured ?? false,
      approved: parsed.data.approved ?? true,
    })
    .returning();

  res.status(201).json(job);
});

router.get("/jobs/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetJobParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, params.data.id));

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(job);
});

router.patch("/jobs/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateJobParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [job] = await db
    .update(jobsTable)
    .set(parsed.data)
    .where(eq(jobsTable.id, params.data.id))
    .returning();

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(job);
});

router.delete("/jobs/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteJobParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .delete(jobsTable)
    .where(eq(jobsTable.id, params.data.id))
    .returning();

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
