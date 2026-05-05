/**
 * Backfill Claude-generated summaries for aggregated jobs that have
 * summary_description = NULL.
 *
 * Usage:
 *   DATABASE_URL=... ANTHROPIC_API_KEY=... pnpm backfill-summaries
 *   DATABASE_URL=... ANTHROPIC_API_KEY=... pnpm backfill-summaries --dry-run
 *   DATABASE_URL=... ANTHROPIC_API_KEY=... pnpm backfill-summaries --limit 50
 *
 * The script is safe to re-run — it only processes rows where
 * summary_description IS NULL and source != 'employer'.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db, jobsTable } from "@workspace/db";
import { and, eq, isNull, ne, asc } from "drizzle-orm";

const DELAY_MS = 300;      // between Anthropic API calls
const MAX_DESC_CHARS = 4000;
const DEFAULT_LIMIT = 1000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1]
  ?? (args[args.indexOf("--limit") + 1]);
const limit = limitArg ? parseInt(limitArg, 10) : DEFAULT_LIMIT;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Error: DATABASE_URL is not set.");
  process.exit(1);
}

const ai = new Anthropic();

async function summarize(title: string, company: string, description: string): Promise<string | null> {
  const trimmed = description.slice(0, MAX_DESC_CHARS);
  try {
    const msg = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      messages: [{
        role: "user",
        content:
          `Write a 2–3 sentence neutral summary of this job posting in your own words. ` +
          `Cover the role, key responsibilities, and main requirements. ` +
          `Do not copy phrases from the original. Do not add information not in the posting.\n\n` +
          `Job: ${title} at ${company}\n\n${trimmed}`,
      }],
    });
    const block = msg.content[0];
    return block?.type === "text" ? block.text.trim() || null : null;
  } catch (err) {
    console.warn(`  [warn] Anthropic API error for "${title}" — skipping:`, (err as Error).message);
    return null;
  }
}

async function main() {
  console.log(`\nFetching jobs missing summaries (limit: ${limit})${dryRun ? " [DRY RUN]" : ""}…\n`);

  const jobs = await db
    .select({ id: jobsTable.id, title: jobsTable.title, companyName: jobsTable.companyName, description: jobsTable.description })
    .from(jobsTable)
    .where(and(isNull(jobsTable.summaryDescription), ne(jobsTable.source, "employer")))
    .orderBy(asc(jobsTable.id))
    .limit(limit);

  if (jobs.length === 0) {
    console.log("Nothing to backfill — all eligible jobs already have summaries.");
    return;
  }

  console.log(`Found ${jobs.length} job(s) to process.\n`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const progress = `[${i + 1}/${jobs.length}]`;
    process.stdout.write(`${progress} ${job.title} @ ${job.companyName} … `);

    if (dryRun) {
      console.log("(skipped — dry run)");
      continue;
    }

    const summary = await summarize(job.title, job.companyName, job.description);
    if (!summary) {
      console.log("FAILED");
      skipped++;
    } else {
      await db
        .update(jobsTable)
        .set({ summaryDescription: summary })
        .where(eq(jobsTable.id, job.id));
      console.log("OK");
      updated++;
    }

    if (i < jobs.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\nDone. Updated: ${updated}  Failed: ${skipped}  Total processed: ${jobs.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
