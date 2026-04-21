import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, profilesTable, insertProfileSchema, patchProfileSchema } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router = Router();

router.get("/profile/me", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const rows = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(rows[0]);
});

router.post("/profile", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = insertProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid profile data", issues: parsed.error.issues });
    return;
  }
  const existing = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Profile already exists; use PATCH to update" });
    return;
  }
  const [profile] = await db
    .insert(profilesTable)
    .values({ ...parsed.data, clerkUserId: userId })
    .returning();
  res.status(201).json(profile);
});

router.patch("/profile", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const parsed = patchProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid profile data", issues: parsed.error.issues });
    return;
  }
  const [updated] = await db
    .update(profilesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(profilesTable.clerkUserId, userId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Profile not found; use POST to create" });
    return;
  }
  res.json(updated);
});

export default router;
