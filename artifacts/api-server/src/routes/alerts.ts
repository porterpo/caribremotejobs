import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, alertsTable } from "@workspace/db";
import { CreateAlertBody, DeleteAlertParams, UnsubscribeAlertParams } from "@workspace/api-zod";
import { sendAlertConfirmation } from "../lib/resend";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/requireAuth";
import { getAuth } from "@clerk/express";
import { getSeekerSubscription } from "../lib/getSeekerSubscription";
import { requireAdmin } from "../middlewares/requireAdmin";
import { alertsLimiter } from "../lib/rate-limit";

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function verifyTurnstile(token: string): Promise<boolean> {
  const body = new URLSearchParams({ secret: TURNSTILE_SECRET!, response: token });
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
    });
    const data = await res.json() as { success: boolean };
    return data.success === true;
  } catch (err) {
    logger.error({ err }, "Turnstile verification request failed");
    return false;
  }
}

const router: IRouter = Router();

router.post("/alerts", alertsLimiter, async (req, res): Promise<void> => {
  const parsed = CreateAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Signed-in users must be Pro to create alerts
  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) || auth?.userId;
  if (clerkUserId) {
    const sub = await getSeekerSubscription(clerkUserId);
    if (!sub.isPro) {
      res.status(403).json({ error: "Seeker Pro subscription required for job alerts" });
      return;
    }
  } else {
    // Anonymous request — require CAPTCHA
    if (!TURNSTILE_SECRET) {
      logger.warn("TURNSTILE_SECRET_KEY not set; CAPTCHA verification skipped");
    } else {
      const { captchaToken } = parsed.data;
      if (!captchaToken) {
        res.status(422).json({ error: "CAPTCHA token required" });
        return;
      }
      const valid = await verifyTurnstile(captchaToken);
      if (!valid) {
        res.status(422).json({ error: "CAPTCHA verification failed" });
        return;
      }
    }
  }

  // Check existing subscription
  const existing = await db
    .select()
    .from(alertsTable)
    .where(eq(alertsTable.email, parsed.data.email));

  if (existing.length > 0) {
    res.status(201).json({ success: true });
    return;
  }

  const [alert] = await db
    .insert(alertsTable)
    .values({
      email: parsed.data.email,
      categories: parsed.data.categories ?? null,
      jobTypes: parsed.data.jobTypes ?? null,
      keywords: parsed.data.keywords ?? null,
      active: true,
    })
    .returning();

  // Send confirmation email (don't block response)
  sendAlertConfirmation(alert.email, alert.token).catch((err) =>
    logger.error({ err }, "Failed sending confirmation")
  );

  res.status(201).json(alert);
});

router.get("/alerts", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const alerts = await db
    .select()
    .from(alertsTable)
    .orderBy(alertsTable.createdAt);
  res.json(alerts);
});

router.delete("/alerts/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteAlertParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [alert] = await db
    .delete(alertsTable)
    .where(eq(alertsTable.id, params.data.id))
    .returning();

  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/alerts/unsubscribe/:token", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const params = UnsubscribeAlertParams.safeParse({ token: raw });
  if (!params.success) {
    res.status(400).json({ success: false, message: "Invalid token" });
    return;
  }

  const [alert] = await db
    .update(alertsTable)
    .set({ active: false })
    .where(eq(alertsTable.token, params.data.token))
    .returning();

  if (!alert) {
    res.status(404).json({ success: false, message: "Subscription not found" });
    return;
  }

  res.json({ success: true, message: "You have been unsubscribed successfully" });
});

export default router;
