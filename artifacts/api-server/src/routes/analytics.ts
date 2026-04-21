import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, analyticsEventsTable } from "@workspace/db";

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

export default router;
