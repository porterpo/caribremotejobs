import { defineConfig } from "vite";
import type { Plugin, ViteDevServer, PreviewServer, Connect } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerResponse } from "node:http";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface JobMeta {
  title: string;
  companyName: string;
  locationRestrictions?: string | null;
}

async function fetchJobMeta(jobId: string): Promise<JobMeta | null> {
  const apiBase =
    process.env.API_INTERNAL_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${apiBase}/api/jobs/${jobId}`);
    if (!res.ok) return null;
    return (await res.json()) as JobMeta;
  } catch {
    return null;
  }
}

function injectJobMeta(html: string, job: JobMeta): string {
  const title = escapeHtml(
    `${job.title} at ${job.companyName} | CaribRemote.com`,
  );
  const desc = escapeHtml(
    `${job.title} — ${job.companyName} · ${job.locationRestrictions ?? "Remote"}. Apply for this remote role on CaribRemote.com.`,
  );
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /(<meta name="description" content=")[^"]*(")/,
      `$1${desc}$2`,
    )
    .replace(
      /(<meta property="og:title" content=")[^"]*(")/,
      `$1${title}$2`,
    )
    .replace(
      /(<meta property="og:description" content=")[^"]*(")/,
      `$1${desc}$2`,
    );
}

function makeJobMiddleware(
  htmlPath: string,
  transform?: (url: string, html: string) => Promise<string>,
): Connect.NextHandleFunction {
  return async (
    req: Connect.IncomingMessage,
    res: ServerResponse,
    next: Connect.NextFunction,
  ): Promise<void> => {
    const url = req.url ?? "";
    const match = url.match(/\/jobs\/(\d+)(?:[?#].*)?$/);
    const jobId = match?.[1] ?? null;
    if (!jobId) return next();

    const job = await fetchJobMeta(jobId);
    if (!job) return next();

    let html: string;
    try {
      html = readFileSync(htmlPath, "utf-8");
    } catch {
      return next();
    }

    html = injectJobMeta(html, job);
    if (transform) {
      html = await transform(url, html);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  };
}

function jobSeoPlugin(): Plugin {
  return {
    name: "job-seo",

    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        makeJobMiddleware(
          resolve(import.meta.dirname, "index.html"),
          (url, html) => server.transformIndexHtml(url, html),
        ),
      );
    },

    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(
        makeJobMiddleware(
          resolve(import.meta.dirname, "dist/public/index.html"),
        ),
      );
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    jobSeoPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  define: {
    "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(
      process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "",
    ),
    "import.meta.env.VITE_CLERK_PROXY_URL": JSON.stringify(
      process.env.VITE_CLERK_PROXY_URL ?? "",
    ),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
