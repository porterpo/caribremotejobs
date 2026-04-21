import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { useListJobs } from "@workspace/api-client-react";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import { Briefcase, Tag, ArrowLeft, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { computeSkillMatch } from "@/lib/skill-match";

const PAGE_SIZE = 10;
const JOBS_STALE_TIME_MS = 60_000;

export default function TagJobs() {
  const { tagname } = useParams<{ tagname: string }>();
  const tag = decodeURIComponent(tagname ?? "");

  const [page, setPage] = useState(1);

  const { isSignedIn } = useUser();
  const queryClient = useQueryClient();
  const resume = isSignedIn
    ? queryClient.getQueryData<{ skills?: string[] | null } | null>(["resume", "me"])
    : null;
  const resumeSkills: string[] = resume?.skills ?? [];
  const hasSkills = !!isSignedIn && resumeSkills.length > 0;

  const [sortBy, setSortBy] = useState("newest");

  const filterParams = tag ? { tag: [tag] } : {};

  const isBestMatch = sortBy === "best-match" && hasSkills;

  const normalQueryParams = { ...filterParams, page, limit: PAGE_SIZE };
  const { data: jobsResponse, isLoading: isLoadingNormal } = useListJobs(normalQueryParams, {
    query: { enabled: !isBestMatch, staleTime: JOBS_STALE_TIME_MS },
  });

  const allJobsQueryParams = { ...filterParams, page: 1, limit: 9999 };
  const { data: allJobsResponse, isLoading: isLoadingBestMatch, isError: isBestMatchError } = useListJobs(allJobsQueryParams, {
    query: { enabled: isBestMatch, staleTime: JOBS_STALE_TIME_MS },
  });

  const isLoading = isBestMatch
    ? !isBestMatchError && (isLoadingBestMatch || allJobsResponse === undefined)
    : isLoadingNormal;

  useEffect(() => {
    setPage(1);
  }, [tag, sortBy]);

  const { displayedJobs, activeTotal, activeTotalPages } = useMemo(() => {
    if (isBestMatch) {
      const allJobs = allJobsResponse?.jobs ?? [];
      const serverTotal = allJobsResponse?.total ?? allJobs.length;
      const sorted = [...allJobs].sort((a, b) => {
        const matchA = computeSkillMatch(resumeSkills, a.tags ?? null);
        const matchB = computeSkillMatch(resumeSkills, b.tags ?? null);
        return (matchB?.percentage ?? 0) - (matchA?.percentage ?? 0);
      });
      const totalPages = Math.ceil(sorted.length / PAGE_SIZE) || 1;
      const pageJobs = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return { displayedJobs: pageJobs, activeTotal: serverTotal, activeTotalPages: totalPages };
    }
    return {
      displayedJobs: jobsResponse?.jobs ?? [],
      activeTotal: jobsResponse?.total ?? 0,
      activeTotalPages: jobsResponse?.totalPages ?? 1,
    };
  }, [isBestMatch, allJobsResponse, jobsResponse, resumeSkills, page]);

  const pageTitle = tag ? `Remote ${tag} Jobs` : "Remote Jobs by Tag";
  const metaDescription = tag
    ? `Browse ${activeTotal || "all"} remote ${tag} jobs. Find the best remote opportunities requiring ${tag} skills, available to candidates worldwide.`
    : "Browse remote jobs by skill tag.";

  useEffect(() => {
    document.title = `${pageTitle} | CaribbeanRemote`;
    let metaEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!metaEl) {
      metaEl = document.createElement("meta");
      metaEl.name = "description";
      document.head.appendChild(metaEl);
    }
    metaEl.content = metaDescription;
    return () => {
      document.title = "CaribbeanRemote";
    };
  }, [pageTitle, metaDescription]);

  return (
    <PageLayout>
      {!isSignedIn && (
        <div className="bg-primary/5 border-b border-primary/10">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-foreground/80">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span>Create a free account to apply for jobs and get personalised matches.</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/sign-in">
                <Button variant="outline" size="sm">Sign in</Button>
              </Link>
              <Link href="/sign-up">
                <Button size="sm">Sign up free</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              All Jobs
            </Link>
            <span className="text-muted-foreground/40 text-sm">·</span>
            <Link href="/jobs/tags" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Tag className="h-4 w-4" />
              All Skill Tags
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Tag className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{pageTitle}</h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl">
            {isLoading
              ? "Finding jobs…"
              : `${activeTotal} remote ${activeTotal === 1 ? "job" : "jobs"} requiring ${tag} skills.`}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-xl font-semibold">
            {isLoading
              ? isBestMatch
                ? "Finding your best matches…"
                : "Loading jobs…"
              : `${activeTotal} ${activeTotal === 1 ? "Job" : "Jobs"} Found`}
          </h2>
          {hasSkills && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Sort by</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="best-match">Best match</option>
              </select>
            </div>
          )}
        </div>

        {isBestMatch && isBestMatchError ? (
          <div className="text-center py-16 bg-muted/30 border border-dashed rounded-xl">
            <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Couldn't load Best Match results</h3>
            <p className="text-muted-foreground mb-6">There was a problem fetching jobs. Please try again.</p>
            <Button variant="outline" onClick={() => setSortBy("newest")}>
              Switch to Newest first
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="border rounded-xl p-6 bg-card">
                <div className="flex gap-4">
                  <Skeleton className="h-14 w-14 rounded-lg shrink-0" />
                  <div className="space-y-3 flex-1">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-4 w-1/4" />
                    <div className="flex gap-2 pt-2">
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : displayedJobs.length ? (
          <div className="space-y-4">
            {displayedJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isBestMatch={isBestMatch}
                selectedTags={[tag]}
              />
            ))}

            {activeTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-8">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm font-medium px-4">
                  Page {page} of {activeTotalPages}
                </span>
                <Button
                  variant="outline"
                  disabled={page === activeTotalPages}
                  onClick={() => setPage((p) => Math.min(activeTotalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-16 bg-muted/30 border border-dashed rounded-xl">
            <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No jobs found for "{tag}"</h3>
            <p className="text-muted-foreground mb-6">
              There are no active remote jobs tagged with {tag} right now. Check back soon or browse all jobs.
            </p>
            <Link href="/jobs">
              <Button variant="outline">Browse All Jobs</Button>
            </Link>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
