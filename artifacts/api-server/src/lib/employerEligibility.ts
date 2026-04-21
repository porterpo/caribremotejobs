import { db, jobsTable, companiesTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";

export interface EligibilityCriteria {
  approvedDirectListings: number;
  profileComplete: boolean;
  noViolations: boolean;
  accountAgeDays: number;
}

export interface DirectListing {
  id: number;
  title: string;
  approved: boolean;
  rejectedForViolation: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  criteria: EligibilityCriteria;
  directListings: DirectListing[];
}

export async function getEmployerEligibility(companyId: number): Promise<EligibilityResult> {
  const [company] = await db
    .select({
      logo: companiesTable.logo,
      description: companiesTable.description,
      website: companiesTable.website,
      createdAt: companiesTable.createdAt,
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
      directListings: [],
    };
  }

  const directListings = await db
    .select({
      id: jobsTable.id,
      title: jobsTable.title,
      approved: jobsTable.approved,
      rejectedForViolation: jobsTable.rejectedForViolation,
    })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.companyId, companyId),
        sql`${jobsTable.source} IN ('manual', 'employer')`,
      ),
    );

  const approvedDirectListings = directListings.filter((j) => j.approved && !j.rejectedForViolation).length;
  const noViolations = directListings.every((j) => !j.rejectedForViolation);

  const profileComplete =
    !!company.logo?.trim() &&
    !!company.description?.trim() &&
    !!company.website?.trim();

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(company.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );

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
    directListings,
  };
}
