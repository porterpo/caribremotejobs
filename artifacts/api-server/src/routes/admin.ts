import { Router, type IRouter } from "express";
import { runJobSync } from "../lib/sync";
import { db, jobsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/admin/sync-jobs", async (req, res): Promise<void> => {
  const result = await runJobSync();
  res.json(result);
});

router.get("/admin/pending-jobs", async (_req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.approved, false))
    .orderBy(jobsTable.postedAt);
  res.json(jobs);
});

router.post("/admin/jobs/:id/approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;

  const [existing] = await db
    .select({ featured: jobsTable.featured })
    .from(jobsTable)
    .where(eq(jobsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const featuredValue =
    typeof body.featured === "boolean" ? body.featured : existing.featured;

  const [job] = await db
    .update(jobsTable)
    .set({ approved: true, featured: featuredValue })
    .where(eq(jobsTable.id, id))
    .returning();

  res.json(job);
});

export default router;
