import rateLimit from "express-rate-limit";

const json429 = (msg: string) => ({
  error: msg,
  retryAfter: "Retry-After header contains seconds to wait",
});

// Baseline for all /api routes — prevents general abuse
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("Too many requests"),
});

// Stripe checkout — prevents checkout-session spam
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("Too many checkout attempts, please try again later"),
});

// Email resend — very tight to prevent email flooding
export const resendLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("Too many resend attempts, please try again later"),
});

// Alert subscription — supplements CAPTCHA to limit email harvesting
export const alertsLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("Too many subscription attempts, please try again later"),
});

// Job submission — prevents submission flooding per session
export const submitLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("Too many submission attempts, please try again later"),
});
