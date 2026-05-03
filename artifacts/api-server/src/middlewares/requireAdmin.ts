import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { logger } from "../lib/logger";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (ADMIN_USER_IDS.length === 0) {
    res.status(403).json({ error: "Forbidden: ADMIN_USER_IDS is not configured on this server" });
    return;
  }

  const auth = getAuth(req);
  const userId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;

  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    res.status(403).json({ error: "Forbidden: admin access required" });
    return;
  }

  next();
}
