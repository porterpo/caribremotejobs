import { logger } from "./logger";

const EXCLUDED_PATTERNS = [
  /us.?only/i,
  /united states only/i,
  /usa only/i,
  /must be (in|based in) (the )?us/i,
  /must reside in the (united states|us|usa)/i,
  /authorized to work in the (united states|us)/i,
];

function isInternationallyHiring(text: string): boolean {
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(text)) return false;
  }
  return true;
}

export interface SyncResult {
  jobsSynced: number;
  jobsSkipped: number;
  errors: number;
  sources: string[];
}

export async function runJobSync(): Promise<SyncResult> {
  let jobsSynced = 0;
  let jobsSkipped = 0;
  let errors = 0;
  const sources: string[] = [];

  try {
    const response = await fetch("https://remotive.com/api/remote-jobs?limit=50");
    if (response.ok) {
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

      for (const job of data.jobs ?? []) {
        const fullText = `${job.title} ${job.description} ${job.candidate_required_location ?? ""}`;
        if (!isInternationallyHiring(fullText)) {
          jobsSkipped++;
          continue;
        }

        const sourceJobId = `remotive-${job.id}`;
        const existing = await db
          .select({ id: jobsTable.id })
          .from(jobsTable)
          .where(eq(jobsTable.sourceJobId, sourceJobId));

        if (existing.length > 0) {
          jobsSkipped++;
          continue;
        }

        const isCaribFriendly =
          /worldwide|global|anywhere|international|caribbean|bahamas/i.test(
            job.candidate_required_location ?? ""
          ) || job.candidate_required_location === "";

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
          tags: (job.tags ?? []).join(", ") || null,
          featured: false,
          approved: true,
          postedAt: new Date(job.publication_date),
        });

        jobsSynced++;
      }

      sources.push("Remotive");
    }
  } catch (err) {
    logger.error({ err }, "Error syncing from Remotive");
    errors++;
  }

  logger.info({ jobsSynced, jobsSkipped, errors }, "Job sync complete");
  return { jobsSynced, jobsSkipped, errors, sources };
}
