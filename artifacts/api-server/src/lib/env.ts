const isProduction = process.env.NODE_ENV === "production";

function deriveBaseUrl(): string | undefined {
  // Railway automatically injects RAILWAY_PUBLIC_DOMAIN
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) return `https://${railwayDomain}`;

  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;

  return undefined;
}

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

  const derived = deriveBaseUrl();
  if (derived) return derived;

  throw new Error(
    "APP_BASE_URL is required (set it in Railway environment variables, or REPLIT_DOMAINS in dev)",
  );
}

function readAllowedOrigins(appBaseUrl: string): readonly string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();

  if (!raw) {
    // Fall back to allowing only the app's own origin so the server can start.
    // Set ALLOWED_ORIGINS explicitly for multi-origin deployments.
    const origin = new URL(appBaseUrl).origin;
    return Object.freeze([origin]);
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

const appBaseUrl = readBaseUrl();

function readFrontendUrl(): string {
  const raw = process.env.FRONTEND_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return appBaseUrl;
}

export const env = Object.freeze({
  isProduction,
  appBaseUrl,
  frontendUrl: readFrontendUrl(),
  allowedOrigins: readAllowedOrigins(appBaseUrl),
});

export function isAllowedOrigin(origin: string): boolean {
  const normalized = origin.replace(/\/+$/, "");
  return env.allowedOrigins.includes(normalized);
}
