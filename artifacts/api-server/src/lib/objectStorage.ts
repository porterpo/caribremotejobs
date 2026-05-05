import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { r2Client, R2_BUCKET } from "./r2Client";
import {
  type ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

export interface R2Object {
  key: string;
  bucket: string;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  async getObjectEntityUploadURL(): Promise<string> {
    const key = `uploads/${randomUUID()}`;
    const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key });
    return getSignedUrl(r2Client, command, { expiresIn: 900 });
  }

  normalizeObjectEntityPath(signedUrl: string): string {
    try {
      const url = new URL(signedUrl);
      const pathname = decodeURIComponent(url.pathname);
      const prefix = `/${R2_BUCKET}/`;
      const key = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname.slice(1);
      return `/objects/${key}`;
    } catch {
      return signedUrl;
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<R2Object> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const key = objectPath.slice("/objects/".length);
    if (!key) throw new ObjectNotFoundError();
    try {
      await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch {
      throw new ObjectNotFoundError();
    }
    return { key, bucket: R2_BUCKET };
  }

  async downloadObject(file: R2Object, cacheTtlSec = 3600): Promise<Response> {
    const result = await r2Client.send(new GetObjectCommand({ Bucket: file.bucket, Key: file.key }));
    if (!result.Body) throw new ObjectNotFoundError();

    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const headers: Record<string, string> = {
      "Content-Type": result.ContentType ?? "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (result.ContentLength) headers["Content-Length"] = String(result.ContentLength);

    return new Response(result.Body.transformToWebStream(), { headers, status: 200 });
  }

  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: ObjectAclPolicy): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/objects/")) return normalizedPath;
    const key = normalizedPath.slice("/objects/".length);
    await setObjectAclPolicy({ key, bucket: R2_BUCKET }, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: R2Object;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  async searchPublicObject(filePath: string): Promise<R2Object | null> {
    const key = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    try {
      await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      return { key, bucket: R2_BUCKET };
    } catch {
      return null;
    }
  }

  getPublicObjectSearchPaths(): string[] {
    return [R2_BUCKET];
  }

  getPrivateObjectDir(): string {
    return R2_BUCKET;
  }
}
