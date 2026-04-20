import { Router, type IRouter } from "express";
import { runJobSync } from "../lib/sync";
import { db, jobsTable, jobOrdersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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
  const featured = req.body?.featured === true;

  const [job] = await db
    .update(jobsTable)
    .set({ approved: true, featured })
    .where(eq(jobsTable.id, id))
    .returning();

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(job);
});

export default router;
