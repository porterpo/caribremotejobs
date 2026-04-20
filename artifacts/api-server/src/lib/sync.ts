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

function isHimalayasUsOnly(locationRestrictions: string[]): boolean {
  if (!locationRestrictions || locationRestrictions.length === 0) return false;
  const usTerms = /^(united states|usa|us)$/i;
  return locationRestrictions.every((loc) => usTerms.test(loc.trim()));
}

function detectEntryLevel(title: string, description: string, seniority?: string): boolean {
  if (seniority && /junior|entry/i.test(seniority)) return true;
  if (ENTRY_LEVEL_TITLE_AND_DESC.some((p) => p.test(title) || p.test(description))) return true;
  if (ENTRY_LEVEL_TITLE_ONLY.some((p) => p.test(title))) return true;
  return false;
}

function isCaribBean(locationText: string): boolean {
  return (
    /worldwide|global|anywhere|international|caribbean|bahamas/i.test(locationText) ||
    locationText.trim() === ""
  );
}

export interface SyncResult {
  jobsSynced: number;
  jobsSkipped: number;
  errors: number;
  sources: string[];
}

type SourceResult = { synced: number; skipped: number; error: boolean };

async function syncRemotive(): Promise<SourceResult> {
  try {
    const response = await fetch("https://remotive.com/api/remote-jobs?limit=50");
    if (!response.ok) return { synced: 0, skipped: 0, error: true };

    const data = await response.json() as {
      jobs: Array<{
        id: number; url: string; title: string; company_name: string;
        company_logo: string; category: string; job_type: string; salary: string;
        description: string; publication_date: string;
        candidate_required_location: string; tags: string[];
      }>;
    };

    const { db, jobsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    let synced = 0, skipped = 0;

    for (const job of data.jobs ?? []) {
      const location = job.candidate_required_location ?? "";
      const fullText = `${job.title} ${job.description} ${location}`;
      if (!isInternationallyHiring(fullText)) { skipped++; continue; }
      if (!isCaribBean(location)) { skipped++; continue; }
      const sourceJobId = `remotive-${job.id}`;
      const existing = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.sourceJobId, sourceJobId));
      if (existing.length > 0) { skipped++; continue; }
      await db.insert(jobsTable).values({
        title: job.title, companyName: job.company_name,
        companyLogo: job.company_logo || null,
        category: job.category?.toLowerCase().replace(/\s+/g, "-") ?? "other",
        jobType: job.job_type === "full_time" ? "full-time" : job.job_type ?? "full-time",
        description: job.description, applyUrl: job.url,
        source: "remotive", sourceJobId,
        locationRestrictions: job.candidate_required_location || null,
        caribbeanFriendly: isCaribBean(job.candidate_required_location ?? ""),
        entryLevel: detectEntryLevel(job.title, job.description),
        tags: (job.tags ?? []).join(", ") || null,
        featured: false, approved: true,
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

async function syncWWR(): Promise<SourceResult> {
  try {
    const parser = new Parser({ customFields: { item: ["region", "type", "category", "skills"] } });
    const feed = await parser.parseURL("https://weworkremotely.com/remote-jobs.rss");
    const { db, jobsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    let synced = 0, skipped = 0;

    for (const item of feed.items) {
      const title = item.title ?? "";
      const link = item.link ?? item.guid ?? "";
      const description = item.content ?? item.contentSnippet ?? "";
      const region: string = (item as Record<string, unknown>)["region"] as string ?? "";
      const jobTypeRaw: string = (item as Record<string, unknown>)["type"] as string ?? "Full-Time";
      const categoryRaw: string = (item as Record<string, unknown>)["category"] as string ?? "other";

      if (!isInternationallyHiring(`${title} ${description} ${region}`)) { skipped++; continue; }
      if (!isCaribBean(region)) { skipped++; continue; }

      const cleanTitle = title.includes(":") ? title.split(":").slice(1).join(":").trim() : title;
      const companyName = title.includes(":") ? title.split(":")[0]?.trim() ?? "Unknown" : "Unknown";
      const sourceJobId = `wwr-${link.replace(/[^a-z0-9]/gi, "-")}`;
      const existing = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.sourceJobId, sourceJobId));
      if (existing.length > 0) { skipped++; continue; }

      await db.insert(jobsTable).values({
        title: cleanTitle, companyName, companyLogo: null,
        category: categoryRaw.toLowerCase().replace(/\s+/g, "-"),
        jobType: jobTypeRaw.toLowerCase().replace(/\s+/g, "-") || "full-time",
        description, applyUrl: link,
        source: "weworkremotely", sourceJobId,
        locationRestrictions: region || null,
        caribbeanFriendly: isCaribBean(region),
        entryLevel: detectEntryLevel(cleanTitle, description),
        tags: null, featured: false, approved: true,
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

async function syncRemoteOK(): Promise<SourceResult> {
  try {
    const response = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "CaribbeanRemote/1.0 (caribbeanremote.com)" },
    });
    if (!response.ok) return { synced: 0, skipped: 0, error: true };

    const data = await response.json() as Array<{
      id?: string; slug?: string; position?: string; company?: string;
      company_logo?: string; logo?: string; url?: string; apply_url?: string;
      tags?: string[]; description?: string; location?: string;
      salary_min?: number; salary_max?: number; date?: string;
    }>;

    const { db, jobsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    let synced = 0, skipped = 0;

    for (const job of data) {
      if (!job.id || !job.position) continue; // skip the notice/metadata row
      const location = job.location ?? "";
      const description = job.description ?? "";
      if (!isInternationallyHiring(`${job.position} ${description} ${location}`)) { skipped++; continue; }
      if (!isCaribBean(location)) { skipped++; continue; }

      const sourceJobId = `remoteok-${job.id}`;
      const existing = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.sourceJobId, sourceJobId));
      if (existing.length > 0) { skipped++; continue; }

      const category = (job.tags?.[0] ?? "other").toLowerCase().replace(/\s+/g, "-");
      const applyUrl = job.apply_url ?? job.url ?? `https://remoteok.com/remote-jobs/${job.slug}`;

      await db.insert(jobsTable).values({
        title: job.position, companyName: job.company ?? "Unknown",
        companyLogo: job.company_logo ?? job.logo ?? null,
        category, jobType: "full-time",
        description, applyUrl,
        source: "remoteok", sourceJobId,
        locationRestrictions: location || null,
        caribbeanFriendly: isCaribBean(location),
        entryLevel: detectEntryLevel(job.position, description),
        salaryMin: job.salary_min && job.salary_min > 0 ? job.salary_min : null,
        salaryMax: job.salary_max && job.salary_max > 0 ? job.salary_max : null,
        tags: (job.tags ?? []).join(", ") || null,
        featured: false, approved: true,
        postedAt: job.date ? new Date(job.date) : new Date(),
      });
      synced++;
    }
    return { synced, skipped, error: false };
  } catch (err) {
    logger.error({ err }, "Error syncing from Remote OK");
    return { synced: 0, skipped: 0, error: true };
  }
}

async function syncHimalayas(): Promise<SourceResult> {
  try {
    const response = await fetch("https://himalayas.app/jobs/api?limit=100");
    if (!response.ok) return { synced: 0, skipped: 0, error: true };

    const data = await response.json() as {
      jobs: Array<{
        guid?: string; title?: string; companyName?: string; companyLogo?: string;
        employmentType?: string; minSalary?: number; maxSalary?: number;
        currency?: string; seniority?: string;
        locationRestrictions?: string[]; timezoneRestrictions?: string;
        categories?: string[]; description?: string; applicationLink?: string;
        pubDate?: string;
      }>;
    };

    const { db, jobsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    let synced = 0, skipped = 0;

    for (const job of data.jobs ?? []) {
      if (!job.guid || !job.title) continue;
      const restrictions = job.locationRestrictions ?? [];
      if (isHimalayasUsOnly(restrictions)) { skipped++; continue; }

      const locationText = restrictions.join(", ");
      if (!isInternationallyHiring(`${job.title} ${job.description ?? ""} ${locationText}`)) { skipped++; continue; }
      if (restrictions.length > 0 && !isCaribBean(locationText)) { skipped++; continue; }

      const sourceJobId = `himalayas-${job.guid}`;
      const existing = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.sourceJobId, sourceJobId));
      if (existing.length > 0) { skipped++; continue; }

      const category = (job.categories?.[0] ?? "other").toLowerCase().replace(/\s+/g, "-");
      const jobTypeRaw = job.employmentType ?? "Full-Time";
      const jobType = jobTypeRaw.toLowerCase().replace(/\s+/g, "-");

      await db.insert(jobsTable).values({
        title: job.title, companyName: job.companyName ?? "Unknown",
        companyLogo: job.companyLogo ?? null,
        category, jobType: jobType || "full-time",
        description: job.description ?? "",
        applyUrl: job.applicationLink ?? `https://himalayas.app/jobs`,
        source: "himalayas", sourceJobId,
        locationRestrictions: locationText || null,
        caribbeanFriendly: restrictions.length === 0 || isCaribBean(locationText),
        entryLevel: detectEntryLevel(job.title, job.description ?? "", job.seniority),
        salaryMin: job.minSalary && job.minSalary > 0 ? job.minSalary : null,
        salaryMax: job.maxSalary && job.maxSalary > 0 ? job.maxSalary : null,
        salaryCurrency: job.currency ?? "USD",
        tags: null, featured: false, approved: true,
        postedAt: job.pubDate ? new Date(job.pubDate) : new Date(),
      });
      synced++;
    }
    return { synced, skipped, error: false };
  } catch (err) {
    logger.error({ err }, "Error syncing from Himalayas");
    return { synced: 0, skipped: 0, error: true };
  }
}

async function syncWorkingNomads(): Promise<SourceResult> {
  try {
    const response = await fetch("https://www.workingnomads.com/api/exposed_jobs/?limit=50");
    if (!response.ok) return { synced: 0, skipped: 0, error: true };

    const data = await response.json() as Array<{
      url?: string; title?: string; description?: string;
      company_name?: string; category_name?: string;
      tags?: string; location?: string; pub_date?: string;
    }>;

    const { db, jobsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    let synced = 0, skipped = 0;

    for (const job of data) {
      if (!job.url || !job.title) continue;
      const location = job.location ?? "";
      const description = job.description ?? "";
      if (!isInternationallyHiring(`${job.title} ${description} ${location}`)) { skipped++; continue; }
      if (!isCaribBean(location)) { skipped++; continue; }

      const sourceJobId = `workingnomads-${job.url.replace(/[^a-z0-9]/gi, "-")}`;
      const existing = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.sourceJobId, sourceJobId));
      if (existing.length > 0) { skipped++; continue; }

      const category = (job.category_name ?? "other").toLowerCase().replace(/\s+/g, "-");

      await db.insert(jobsTable).values({
        title: job.title, companyName: job.company_name ?? "Unknown",
        companyLogo: null, category, jobType: "full-time",
        description, applyUrl: job.url,
        source: "workingnomads", sourceJobId,
        locationRestrictions: location || null,
        caribbeanFriendly: isCaribBean(location),
        entryLevel: detectEntryLevel(job.title, description),
        tags: job.tags || null,
        featured: false, approved: true,
        postedAt: job.pub_date ? new Date(job.pub_date) : new Date(),
      });
      synced++;
    }
    return { synced, skipped, error: false };
  } catch (err) {
    logger.error({ err }, "Error syncing from Working Nomads");
    return { synced: 0, skipped: 0, error: true };
  }
}

export async function runJobSync(): Promise<SyncResult> {
  const [remotive, wwr, remoteok, himalayas, workingnomads] = await Promise.all([
    syncRemotive(),
    syncWWR(),
    syncRemoteOK(),
    syncHimalayas(),
    syncWorkingNomads(),
  ]);

  const all = [
    { name: "Remotive", r: remotive },
    { name: "We Work Remotely", r: wwr },
    { name: "Remote OK", r: remoteok },
    { name: "Himalayas", r: himalayas },
    { name: "Working Nomads", r: workingnomads },
  ];

  const result: SyncResult = {
    jobsSynced: all.reduce((s, x) => s + x.r.synced, 0),
    jobsSkipped: all.reduce((s, x) => s + x.r.skipped, 0),
    errors: all.filter((x) => x.r.error).length,
    sources: all.filter((x) => !x.r.error).map((x) => x.name),
  };

  logger.info(result, "Job sync complete");
  return result;
}
