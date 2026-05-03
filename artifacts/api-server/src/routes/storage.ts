import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

const ALLOWED_RESUME_TYPES = ["application/pdf"];

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    res.status(400).json({ error: "Only image files are allowed (JPEG, PNG, GIF, WebP, SVG)" });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.post("/storage/resume-uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  if (!ALLOWED_RESUME_TYPES.includes(contentType)) {
    res.status(400).json({ error: "Only PDF files are allowed for resume uploads" });
    return;
  }

  if (size > 5 * 1024 * 1024) {
    res.status(400).json({ error: "PDF must be smaller than 5MB" });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating resume upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/storage/logos/:objectId", async (req: Request, res: Response) => {
  const objectId = String(req.params["objectId"] ?? "");
  if (!objectId || !/^[\w-]+$/.test(objectId)) {
    res.status(400).json({ error: "Invalid object ID" });
    return;
  }

  try {
    const objectPath = `/objects/uploads/${objectId}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Logo not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving logo");
    res.status(500).json({ error: "Failed to serve logo" });
  }
});

export default router;
