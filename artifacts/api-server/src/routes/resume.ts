import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, resumesTable, ResumeUpsertSchema } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getObjectAclPolicy, setObjectAclPolicy, ObjectPermission } from "../lib/objectAcl";
import { Readable } from "stream";
import { randomBytes } from "crypto";

const router = Router();
const objectStorageService = new ObjectStorageService();

async function claimOrVerifyResumeObject(
  objectPath: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  let objectFile;
  try {
    objectFile = await objectStorageService.getObjectEntityFile(objectPath);
  } catch {
    return { ok: false, status: 400, error: "Invalid or missing object path" };
  }

  try {
    const [metadata] = await objectFile.getMetadata();
    const contentType = String(metadata.contentType ?? "");
    if (!contentType.startsWith("application/pdf")) {
      return { ok: false, status: 422, error: "Only PDF files are allowed as uploaded resumes" };
    }
  } catch {
    return { ok: false, status: 400, error: "Could not verify object metadata" };
  }

  const existingAcl = await getObjectAclPolicy(objectFile);

  if (existingAcl) {
    if (existingAcl.owner !== userId) {
      return { ok: false, status: 403, error: "Cannot access this object" };
    }
  } else {
    await setObjectAclPolicy(objectFile, { owner: userId, visibility: "private" });
  }

  return { ok: true };
}

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
  if (parsed.data.uploadedResumePath) {
    const check = await claimOrVerifyResumeObject(parsed.data.uploadedResumePath, userId);
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
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
  if (parsed.data.uploadedResumePath) {
    const check = await claimOrVerifyResumeObject(parsed.data.uploadedResumePath, userId);
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }
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

router.delete("/resume/upload", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const rows = await db
    .select({ uploadedResumePath: resumesTable.uploadedResumePath })
    .from(resumesTable)
    .where(eq(resumesTable.clerkUserId, userId))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Resume not found" });
    return;
  }
  const existingPath = rows[0].uploadedResumePath;
  const [updated] = await db
    .update(resumesTable)
    .set({ uploadedResumePath: null, shareToken: null, shareTokenCreatedAt: null, shareTokenExpiresAt: null, updatedAt: new Date() })
    .where(eq(resumesTable.clerkUserId, userId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Resume not found" });
    return;
  }
  if (existingPath) {
    try {
      const objectPath = `/objects/uploads/${existingPath.split("/").pop()}`;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      await objectFile.delete();
    } catch (err) {
      req.log.warn({ err }, "Could not delete PDF from storage; DB record cleared");
    }
  }
  res.json(updated);
});

router.get("/resume/pdf-link", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const rows = await db
    .select({ uploadedResumePath: resumesTable.uploadedResumePath })
    .from(resumesTable)
    .where(eq(resumesTable.clerkUserId, userId))
    .limit(1);

  if (rows.length === 0 || !rows[0].uploadedResumePath) {
    res.status(404).json({ error: "No uploaded PDF resume found" });
    return;
  }

  const objectPath = `/objects/uploads/${rows[0].uploadedResumePath.split("/").pop()}`;

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const canAccess = await objectStorageService.canAccessObjectEntity({
      userId,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!canAccess) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const privateDir = objectStorageService.getPrivateObjectDir();
    const objectId = rows[0].uploadedResumePath.split("/").pop();
    let fullPath = `${privateDir}/uploads/${objectId}`;
    if (!fullPath.startsWith("/")) fullPath = `/${fullPath}`;
    const parts = fullPath.split("/");
    const bucketName = parts[1];
    const objectName = parts.slice(2).join("/");

    const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
    const ttlSec = 7 * 24 * 3600;
    const request = {
      bucket_name: bucketName,
      object_name: objectName,
      method: "GET",
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };
    const signRes = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    });
    if (!signRes.ok) {
      throw new Error(`Failed to sign: ${signRes.status}`);
    }
    const { signed_url } = await signRes.json() as { signed_url: string };
    res.json({ url: signed_url, expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString() });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "PDF not found in storage" });
      return;
    }
    req.log.error({ err: error }, "Error generating PDF signed link");
    res.status(500).json({ error: "Failed to generate PDF link" });
  }
});

router.get("/resume/pdf/:objectId", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const objectId = String(req.params["objectId"] ?? "");
  if (!objectId || !/^[\w-]+$/.test(objectId)) {
    res.status(400).json({ error: "Invalid object ID" });
    return;
  }

  const rows = await db
    .select({ uploadedResumePath: resumesTable.uploadedResumePath })
    .from(resumesTable)
    .where(eq(resumesTable.clerkUserId, userId))
    .limit(1);

  if (rows.length === 0 || !rows[0].uploadedResumePath) {
    res.status(404).json({ error: "Resume PDF not found" });
    return;
  }

  const storedObjectId = rows[0].uploadedResumePath.split("/").pop();
  if (storedObjectId !== objectId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    const objectPath = `/objects/uploads/${objectId}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const canAccess = await objectStorageService.canAccessObjectEntity({
      userId,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!canAccess) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.setHeader("Content-Disposition", `inline; filename="resume.pdf"`);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-disposition") {
        res.setHeader(key, value);
      }
    });

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "PDF not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving resume PDF");
    res.status(500).json({ error: "Failed to serve resume PDF" });
  }
});

router.post("/resume/share-token", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const rawExpiry = (req.body as { expiresInDays?: unknown })?.expiresInDays;
  let expiresInDays: number | null = null;
  if (rawExpiry !== undefined && rawExpiry !== null) {
    const n = Number(rawExpiry);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 365) {
      res.status(422).json({ error: "expiresInDays must be an integer between 1 and 365, or null for no expiry" });
      return;
    }
    expiresInDays = n;
  }

  const rows = await db
    .select({
      shareToken: resumesTable.shareToken,
      shareTokenCreatedAt: resumesTable.shareTokenCreatedAt,
      shareTokenExpiresAt: resumesTable.shareTokenExpiresAt,
      uploadedResumePath: resumesTable.uploadedResumePath,
      updatedAt: resumesTable.updatedAt,
    })
    .from(resumesTable)
    .where(eq(resumesTable.clerkUserId, userId))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Resume not found" });
    return;
  }

  if (!rows[0].uploadedResumePath) {
    res.status(422).json({ error: "No uploaded PDF resume to share" });
    return;
  }

  if (rows[0].shareToken) {
    res.json({
      shareToken: rows[0].shareToken,
      generatedAt: rows[0].shareTokenCreatedAt ?? rows[0].updatedAt,
      expiresAt: rows[0].shareTokenExpiresAt,
    });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = expiresInDays !== null ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000) : null;
  const [updated] = await db
    .update(resumesTable)
    .set({ shareToken: token, shareTokenCreatedAt: now, shareTokenExpiresAt: expiresAt })
    .where(eq(resumesTable.clerkUserId, userId))
    .returning();

  res.json({
    shareToken: updated.shareToken,
    generatedAt: updated.shareTokenCreatedAt ?? updated.updatedAt,
    expiresAt: updated.shareTokenExpiresAt,
  });
});

router.delete("/resume/share-token", requireAuth, async (req: Request, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const [updated] = await db
    .update(resumesTable)
    .set({ shareToken: null, shareTokenCreatedAt: null, shareTokenExpiresAt: null })
    .where(eq(resumesTable.clerkUserId, userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Resume not found" });
    return;
  }

  res.json({ ok: true });
});

router.get("/resume/shared/:token", async (req: Request, res): Promise<void> => {
  const token = String(req.params["token"] ?? "");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const rows = await db
    .select({
      uploadedResumePath: resumesTable.uploadedResumePath,
      clerkUserId: resumesTable.clerkUserId,
      shareTokenExpiresAt: resumesTable.shareTokenExpiresAt,
    })
    .from(resumesTable)
    .where(eq(resumesTable.shareToken, token))
    .limit(1);

  if (rows.length === 0 || !rows[0].uploadedResumePath) {
    res.status(404).json({ error: "Resume not found or link has been revoked" });
    return;
  }

  if (rows[0].shareTokenExpiresAt && rows[0].shareTokenExpiresAt.getTime() < Date.now()) {
    res.status(410).json({ error: "This share link has expired" });
    return;
  }

  const objectId = rows[0].uploadedResumePath.split("/").pop()!;

  try {
    const objectPath = `/objects/uploads/${objectId}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.setHeader("Content-Disposition", `inline; filename="resume.pdf"`);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-disposition") {
        res.setHeader(key, value);
      }
    });

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "PDF not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving shared resume PDF");
    res.status(500).json({ error: "Failed to serve resume PDF" });
  }
});

export default router;
