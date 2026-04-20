import Parser from "rss-parser";
import { logger } from "./logger";

const EXCLUDED_PATTERNS = [
  /us.?only/i,
  /united states only/i,
  /usa only/i,
  /must be (in|based in) (the )?us/i,
  /must reside in the (united states|us|usa)/i,
  /authorized to work in the (united states|us)/i,
];

// Strong signals — checked in both title and description
const ENTRY_LEVEL_TITLE_AND_DESC: RegExp[] = [
  /\bjunior\b/i,
  /\bentry.?level\b/i,
  /\btrainee\b/i,
  /\bapprentice\b/i,
  /no experience required/i,
  /0[-–]1 years?\b/i,
  /0[-–]2 years?\b/i,
  /fresh graduate/i,
];

// Weaker signals — only reliable when in the job title itself
const ENTRY_LEVEL_TITLE_ONLY: RegExp[] = [
  /\bassociate\b/i,
  /\bintern(ship)?\b/i,
  /\bgraduate\b/i,
];

function isInternationallyHiring(text: string): boolean {
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(text)) return false;
  }
  return true;
}

function detectEntryLevel(title: string, description: string): boolean {
  if (ENTRY_LEVEL_TITLE_AND_DESC.some((p) => p.test(title) || p.test(description))) return true;
  if (ENTRY_LEVEL_TITLE_ONLY.some((p) => p.test(title))) return true;
  return false;
}

export interface SyncResult {
  jobsSynced: number;
  jobsSkipped: number;
  errors: number;
  sources: string[];
}

async function syncRemotive(): Promise<{ synced: number; skipped: number; error: boolean }> {
  try {
    const response = await fetch("https://remotive.com/api/remote-jobs?limit=50");
    if (!response.ok) return { synced: 0, skipped: 0, error: true };

    const data = await response.json() as {
      jobs: Array<{
        id: number;
        url: string;
        title: string;
        company_name: string;
        company_logo: string;
        category: string;
        job_type: string;
        salary: string;
        description: string;
        publication_date: string;
        candidate_required_location: string;
        tags: string[];
      }>;
    };

    const { db, jobsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    let synced = 0;
    let skipped = 0;

    for (const job of data.jobs ?? []) {
      const fullText = `${job.title} ${job.description} ${job.candidate_required_location ?? ""}`;
      if (!isInternationallyHiring(fullText)) { skipped++; continue; }

      const sourceJobId = `remotive-${job.id}`;
      const existing = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.sourceJobId, sourceJobId));
      if (existing.length > 0) { skipped++; continue; }

      const isCaribFriendly =
        /worldwide|global|anywhere|international|caribbean|bahamas/i.test(job.candidate_required_location ?? "") ||
        job.candidate_required_location === "";

      await db.insert(jobsTable).values({
        title: job.title,
        companyName: job.company_name,
        companyLogo: job.company_logo || null,
        category: job.category?.toLowerCase().replace(/\s+/g, "-") ?? "other",
        jobType: job.job_type === "full_time" ? "full-time" : job.job_type ?? "full-time",
        description: job.description,
        applyUrl: job.url,
        source: "remotive",
        sourceJobId,
        locationRestrictions: job.candidate_required_location || null,
        caribbeanFriendly: isCaribFriendly,
        entryLevel: detectEntryLevel(job.title, job.description),
        tags: (job.tags ?? []).join(", ") || null,
        featured: false,
        approved: true,
        postedAt: new Date(job.publication_date),
      });
      synced++;
    }

    return { synced, skipped, error: false };
  } catch (err) {
    logger.error({ err }, "Error syncing from Remotive");
    return { synced: 0, skipped: 0, error: true };
  }
}

async function syncWWR(): Promise<{ synced: number; skipped: number; error: boolean }> {
  try {
    const parser = new Parser({
      customFields: {
        item: ["region", "type", "category", "skills"],
      },
    });

    const feed = await parser.parseURL("https://weworkremotely.com/remote-jobs.rss");
    const { db, jobsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    let synced = 0;
    let skipped = 0;

    for (const item of feed.items) {
      const title = item.title ?? "";
      const link = item.link ?? item.guid ?? "";
      const description = item.content ?? item.contentSnippet ?? "";
      const region: string = (item as Record<string, unknown>)["region"] as string ?? "";
      const jobTypeRaw: string = (item as Record<string, unknown>)["type"] as string ?? "Full-Time";
      const categoryRaw: string = (item as Record<string, unknown>)["category"] as string ?? "other";

      const fullText = `${title} ${description} ${region}`;
      if (!isInternationallyHiring(fullText)) { skipped++; continue; }

      // Strip company prefix — WWR titles are "Company: Job Title"
      const cleanTitle = title.includes(":") ? title.split(":").slice(1).join(":").trim() : title;
      const companyName = title.includes(":") ? title.split(":")[0]?.trim() ?? "Unknown" : "Unknown";

      const sourceJobId = `wwr-${link.replace(/[^a-z0-9]/gi, "-")}`;
      const existing = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.sourceJobId, sourceJobId));
      if (existing.length > 0) { skipped++; continue; }

      const isCaribFriendly =
        /worldwide|global|anywhere|international|caribbean|bahamas/i.test(region) || region === "";

      const jobType = jobTypeRaw.toLowerCase().replace(/\s+/g, "-").replace("full-time", "full-time").replace("part-time", "part-time").replace("contract", "contract").replace("freelance", "freelance");

      await db.insert(jobsTable).values({
        title: cleanTitle,
        companyName,
        companyLogo: null,
        category: categoryRaw.toLowerCase().replace(/\s+/g, "-"),
        jobType: jobType || "full-time",
        description,
        applyUrl: link,
        source: "weworkremotely",
        sourceJobId,
        locationRestrictions: region || null,
        caribbeanFriendly: isCaribFriendly,
        entryLevel: detectEntryLevel(cleanTitle, description),
        tags: null,
        featured: false,
        approved: true,
        postedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      });
      synced++;
    }

    return { synced, skipped, error: false };
  } catch (err) {
    logger.error({ err }, "Error syncing from We Work Remotely");
    return { synced: 0, skipped: 0, error: true };
  }
}

export async function runJobSync(): Promise<SyncResult> {
  const [remotive, wwr] = await Promise.all([syncRemotive(), syncWWR()]);

  const result: SyncResult = {
    jobsSynced: remotive.synced + wwr.synced,
    jobsSkipped: remotive.skipped + wwr.skipped,
    errors: (remotive.error ? 1 : 0) + (wwr.error ? 1 : 0),
    sources: [
      ...(!remotive.error ? ["Remotive"] : []),
      ...(!wwr.error ? ["We Work Remotely"] : []),
    ],
  };

  logger.info(result, "Job sync complete");
  return result;
}
