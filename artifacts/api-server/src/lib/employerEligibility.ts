import { db, jobsTable, companiesTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";

export interface EligibilityCriteria {
  approvedDirectListings: number;
  profileComplete: boolean;
  noViolations: boolean;
  accountAgeDays: number;
}

export interface EligibilityResult {
  eligible: boolean;
  criteria: EligibilityCriteria;
}

export async function getEmployerEligibility(companyId: number): Promise<EligibilityResult> {
  const [company] = await db
    .select({
      logo: companiesTable.logo,
      description: companiesTable.description,
      website: companiesTable.website,
      createdAt: companiesTable.createdAt,
      hasViolation: companiesTable.hasViolation,
    })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));

  if (!company) {
    return {
      eligible: false,
      criteria: {
        approvedDirectListings: 0,
        profileComplete: false,
        noViolations: false,
        accountAgeDays: 0,
      },
    };
  }

  const [directListingsResult] = await db
    .select({ count: count() })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.companyId, companyId),
        eq(jobsTable.approved, true),
        sql`${jobsTable.source} IN ('manual', 'employer')`,
      ),
    );

  const approvedDirectListings = directListingsResult?.count ?? 0;

  const profileComplete =
    !!company.logo?.trim() &&
    !!company.description?.trim() &&
    !!company.website?.trim();

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(company.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  const noViolations = !company.hasViolation;

  const eligible =
    approvedDirectListings >= 2 &&
    profileComplete &&
    accountAgeDays >= 30 &&
    noViolations;

  return {
    eligible,
    criteria: {
      approvedDirectListings,
      profileComplete,
      noViolations,
      accountAgeDays,
    },
  };
}
