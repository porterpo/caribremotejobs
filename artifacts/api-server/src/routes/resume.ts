import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, resumesTable, ResumeUpsertSchema } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router = Router();

router.get("/resume/me", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const rows = await db
    .select()
    .from(resumesTable)
    .where(eq(resumesTable.clerkUserId, userId))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Resume not found" });
    return;
  }
  res.json(rows[0]);
});

router.post("/resume", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = ResumeUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid resume data", issues: parsed.error.issues });
    return;
  }
  const existing = await db
    .select({ id: resumesTable.id })
    .from(resumesTable)
    .where(eq(resumesTable.clerkUserId, userId))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Resume already exists; use PATCH to update" });
    return;
  }
  const [resume] = await db
    .insert(resumesTable)
    .values({ ...parsed.data, clerkUserId: userId })
    .returning();
  res.status(201).json(resume);
});

router.patch("/resume", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = ResumeUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid resume data", issues: parsed.error.issues });
    return;
  }
  const [updated] = await db
    .update(resumesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(resumesTable.clerkUserId, userId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Resume not found; use POST to create" });
    return;
  }
  res.json(updated);
});

export default router;
