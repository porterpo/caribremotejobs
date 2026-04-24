import { Router, type IRouter } from "express";
import { db, jobsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const SITE_URL = "https://caribremotejobs.com";

const STATIC_ROUTES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/jobs/tags", changefreq: "daily", priority: "0.7" },
  { path: "/alerts", changefreq: "weekly", priority: "0.6" },
  { path: "/seeker-pro", changefreq: "monthly", priority: "0.5" },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod?: string, changefreq?: string, priority?: string): string {
  const parts = [`    <loc>${escapeXml(loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  return `  <url>\n${parts.join("\n")}\n  </url>`;
}

const router: IRouter = Router();

router.get("/sitemap.xml", async (_req, res, next) => {
  try {
    const jobs = await db
      .select({
        id: jobsTable.id,
        postedAt: jobsTable.postedAt,
        tags: jobsTable.tags,
      })
      .from(jobsTable)
      .where(eq(jobsTable.approved, true))
      .orderBy(desc(jobsTable.postedAt))
      .limit(5000);

    const tagSet = new Set<string>();
    for (const j of jobs) {
      if (!j.tags) continue;
      for (const raw of j.tags.split(",")) {
        const tag = raw.trim();
        if (tag) tagSet.add(tag);
      }
    }

    const now = new Date().toISOString();
    const urls: string[] = [];

    for (const r of STATIC_ROUTES) {
      urls.push(urlEntry(`${SITE_URL}${r.path}`, now, r.changefreq, r.priority));
    }

    for (const job of jobs) {
      const lastmod = new Date(job.postedAt).toISOString();
      urls.push(
        urlEntry(`${SITE_URL}/jobs/${job.id}`, lastmod, "weekly", "0.8"),
      );
    }

    for (const tag of tagSet) {
      urls.push(
        urlEntry(
          `${SITE_URL}/jobs/tag/${encodeURIComponent(tag)}`,
          now,
          "daily",
          "0.6",
        ),
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=600");
    res.status(200).send(xml);
  } catch (err) {
    next(err);
  }
});

export default router;
