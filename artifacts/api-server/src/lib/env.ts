const isProduction = process.env.NODE_ENV === "production";

function readBaseUrl(): string {
  const raw = process.env.APP_BASE_URL?.trim();

  if (raw) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(
        `APP_BASE_URL is not a valid URL: ${JSON.stringify(raw)}`,
      );
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(
        `APP_BASE_URL must use http(s); got ${parsed.protocol}`,
      );
    }
    if (isProduction && parsed.protocol !== "https:") {
      throw new Error("APP_BASE_URL must be https in production");
    }
    return raw.replace(/\/+$/, "");
  }

  if (isProduction) {
    throw new Error("APP_BASE_URL is required in production");
  }

  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) {
    return `https://${replitDomain}`;
  }

  throw new Error(
    "APP_BASE_URL is required (or REPLIT_DOMAINS in dev fallback)",
  );
}

function readAllowedOrigins(): readonly string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();

  if (!raw) {
    if (isProduction) {
      throw new Error("ALLOWED_ORIGINS is required in production");
    }
    return [];
  }

  const list = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.replace(/\/+$/, ""));

  for (const entry of list) {
    let parsed: URL;
    try {
      parsed = new URL(entry);
    } catch {
      throw new Error(
        `ALLOWED_ORIGINS contains an invalid origin: ${JSON.stringify(entry)}`,
      );
    }
    if (parsed.pathname !== "/" && parsed.pathname !== "") {
      throw new Error(
        `ALLOWED_ORIGINS entries must not include a path: ${JSON.stringify(entry)}`,
      );
    }
  }

  return Object.freeze(list);
}

export const env = Object.freeze({
  isProduction,
  appBaseUrl: readBaseUrl(),
  allowedOrigins: readAllowedOrigins(),
});

export function isAllowedOrigin(origin: string): boolean {
  const normalized = origin.replace(/\/+$/, "");
  return env.allowedOrigins.includes(normalized);
}
