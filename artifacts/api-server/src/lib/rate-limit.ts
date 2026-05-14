import rateLimit from "express-rate-limit";
import { PostgresRateLimitStore } from "./pg-rate-limit-store";

const json429 = (msg: string) => ({
  error: msg,
  retryAfter: "Retry-After header contains seconds to wait",
});

// Baseline for all /api routes — in-memory is fine here; too high-volume for DB
// round-trips, and Cloudflare WAF handles edge-level abuse before it reaches the process.
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("Too many requests"),
});

// Stripe checkout — DB-backed so limits hold across restarts and replicas
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new PostgresRateLimitStore(15 * 60_000),
  message: json429("Too many checkout attempts, please try again later"),
});

// Email resend — DB-backed; very tight to prevent email flooding
export const resendLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new PostgresRateLimitStore(60 * 60_000),
  message: json429("Too many resend attempts, please try again later"),
});

// Alert subscription — DB-backed; supplements CAPTCHA to limit email harvesting
export const alertsLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new PostgresRateLimitStore(60 * 60_000),
  message: json429("Too many subscription attempts, please try again later"),
});

// Job submission — DB-backed; prevents submission flooding per session
export const submitLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new PostgresRateLimitStore(60 * 60_000),
  message: json429("Too many submission attempts, please try again later"),
});
