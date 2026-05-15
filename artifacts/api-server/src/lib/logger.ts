import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export function safeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const e = err as unknown as Record<string, unknown>;
    return {
      name: err.name,
      message: String(err.message).slice(0, 500),
      // Include safe structured fields from library errors (e.g. Stripe, pg)
      ...(typeof e["code"] === "string" ? { code: e["code"] } : {}),
      ...(typeof e["statusCode"] === "number" ? { statusCode: e["statusCode"] } : {}),
      // Stack only in development — exposes file paths and internals in production
      ...(!isProduction ? { stack: err.stack } : {}),
    };
  }
  return { message: String(err).slice(0, 500) };
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  serializers: {
    // Sanitize anything logged under the `err` key
    err: safeError,
  },
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "password",
    "token",
    "secret",
    "email",
    "stripe_session_id",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
