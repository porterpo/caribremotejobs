import { HeadObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "./r2Client";

export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

export interface R2Ref {
  key: string;
  bucket: string;
}

function isPermissionAllowed(requested: ObjectPermission, granted: ObjectPermission): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}
  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(_group: ObjectAccessGroup): BaseObjectAccessGroup {
  throw new Error(`Unknown access group type: ${_group.type}`);
}

export async function setObjectAclPolicy(object: R2Ref, aclPolicy: ObjectAclPolicy): Promise<void> {
  const head = await r2Client.send(new HeadObjectCommand({ Bucket: object.bucket, Key: object.key }));
  await r2Client.send(new CopyObjectCommand({
    Bucket: object.bucket,
    Key: object.key,
    CopySource: `${object.bucket}/${object.key}`,
    ContentType: head.ContentType,
    Metadata: { ...head.Metadata, aclpolicy: JSON.stringify(aclPolicy) },
    MetadataDirective: "REPLACE",
  }));
}

export async function getObjectAclPolicy(object: R2Ref): Promise<ObjectAclPolicy | null> {
  try {
    const head = await r2Client.send(new HeadObjectCommand({ Bucket: object.bucket, Key: object.key }));
    const raw = head.Metadata?.aclpolicy;
    if (!raw) return null;
    return JSON.parse(raw) as ObjectAclPolicy;
  } catch {
    return null;
  }
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: R2Ref;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) return false;

  if (aclPolicy.visibility === "public" && requestedPermission === ObjectPermission.READ) {
    return true;
  }

  if (!userId) return false;
  if (aclPolicy.owner === userId) return true;

  for (const rule of aclPolicy.aclRules ?? []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
