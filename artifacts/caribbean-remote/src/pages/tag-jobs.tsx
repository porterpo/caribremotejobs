import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { useListJobs, getListJobsQueryKey } from "@workspace/api-client-react";
import { useSeo } from "@/lib/seo";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Tag, ArrowLeft, Sparkles, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { computeSkillMatch } from "@/lib/skill-match";
import { useQuery } from "@tanstack/react-query";

const PAGE_SIZE = 10;
const JOBS_STALE_TIME_MS = 60_000;
const BASE = import.meta.env.BASE_URL;

export default function TagJobs() {
  const { tagname } = useParams<{ tagname: string }>();
  const tag = decodeURIComponent(tagname ?? "");

  const [page, setPage] = useState(1);
  const [selectedTags, setSelectedTags] = useState<string[]>(tag ? [tag] : []);

  const { isSignedIn } = useUser();
  const queryClient = useQueryClient();

  const { data: resumeData, status: resumeStatus } = useQuery({
    queryKey: ["resume", "me"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/resume/me`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch resume");
      return res.json();
    },
    staleTime: 30_000,
    retry: false,
    enabled: !!isSignedIn,
  });

  const resumeSkills: string[] = useMemo(() => {
    const cached = queryClient.getQueryData<{ skills?: string[] | null } | null>(["resume", "me"]);
    return cached?.skills ?? resumeData?.skills ?? [];
  }, [resumeData, queryClient]);

  const hasSkills = !!isSignedIn && resumeSkills.length > 0;
  const skillsResolved = !isSignedIn || resumeStatus === "success" || resumeStatus === "error";

  const [sortBy, setSortBy] = useState("newest");
  const [minMatch, setMinMatch] = useState(0);

  // Reset selectedTags whenever the URL tag changes
  useEffect(() => {
    setSelectedTags(tag ? [tag] : []);
  }, [tag]);

  const filterParams = tag ? { tag: [tag] } : {};

  const isBestMatch = sortBy === "best-match" && hasSkills;

  // Extra tags are those beyond the URL tag — require all-jobs fetch + local filter
  const extraTags = useMemo(
    () => selectedTags.filter((t) => t.toLowerCase() !== tag.toLowerCase()),
    [selectedTags, tag]
  );

  const needsAllJobs =
    (hasSkills && (isBestMatch || minMatch > 0)) || extraTags.length > 0;

  const normalQueryParams = { ...filterParams, page, limit: PAGE_SIZE };
  const { data: jobsResponse, isLoading: isLoadingNormal } = useListJobs(normalQueryParams, {
    query: { queryKey: getListJobsQueryKey(normalQueryParams), enabled: !needsAllJobs, staleTime: JOBS_STALE_TIME_MS },
  });

  const allJobsQueryParams = { ...filterParams, page: 1, limit: 9999 };
  const { data: allJobsResponse, isLoading: isLoadingAllJobs, isError: isAllJobsError } = useListJobs(allJobsQueryParams, {
    query: { queryKey: getListJobsQueryKey(allJobsQueryParams), enabled: needsAllJobs, staleTime: JOBS_STALE_TIME_MS },
  });

  const isLoading = needsAllJobs
    ? !isAllJobsError && (isLoadingAllJobs || allJobsResponse === undefined)
    : isLoadingNormal;

  useEffect(() => {
    setPage(1);
  }, [tag, sortBy, minMatch, selectedTags]);

  useEffect(() => {
    if (skillsResolved && !hasSkills) {
      if (sortBy === "best-match") setSortBy("newest");
      if (minMatch > 0) setMinMatch(0);
    }
  }, [skillsResolved, hasSkills, sortBy, minMatch]);

  const handleTagClick = useCallback(
    (clickedTag: string) => {
      setSelectedTags((prev) => {
        const lc = clickedTag.toLowerCase();
        const prevLc = prev.map((t) => t.toLowerCase());
        if (prevLc.includes(lc)) {
          // Never remove the URL tag — it's the base filter for this page
          if (lc === tag.toLowerCase()) return prev;
          return prev.filter((t) => t.toLowerCase() !== lc);
        }
        return [...prev, clickedTag];
      });
    },
    [tag]
  );

  const { displayedJobs, activeTotal, activeTotalPages } = useMemo(() => {
    if (needsAllJobs) {
      const allJobs = allJobsResponse?.jobs ?? [];

      const jobsWithScores = allJobs.map((job) => ({
        job,
        score: computeSkillMatch(resumeSkills, job.tags ?? null)?.percentage ?? 0,
      }));

      const filtered = jobsWithScores.filter(({ score, job }) => {
        if (minMatch > 0 && score < minMatch) return false;
        if (extraTags.length > 0) {
          const jobTagsLc = (job.tags ?? "")
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);
          if (!extraTags.every((et) => jobTagsLc.includes(et.toLowerCase()))) return false;
        }
        return true;
      });

      if (isBestMatch) {
        filtered.sort((a, b) => {
          const scoreDiff = b.score - a.score;
          if (scoreDiff !== 0) return scoreDiff;
          const dateA = a.job.createdAt ? new Date(a.job.createdAt).getTime() : 0;
          const dateB = b.job.createdAt ? new Date(b.job.createdAt).getTime() : 0;
          return dateB - dateA;
        });
      }

      const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
      const pageJobs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ job }) => job);
      return { displayedJobs: pageJobs, activeTotal: filtered.length, activeTotalPages: totalPages };
    }
    return {
      displayedJobs: jobsResponse?.jobs ?? [],
      activeTotal: jobsResponse?.total ?? 0,
      activeTotalPages: jobsResponse?.totalPages ?? 1,
    };
  }, [needsAllJobs, isBestMatch, allJobsResponse, jobsResponse, resumeSkills, minMatch, extraTags, page]);

  const { data: tagCounts } = useQuery({
    queryKey: ["job-tags"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/jobs/tags`);
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json() as Promise<Array<{ tag: string; count: number }>>;
    },
    staleTime: JOBS_STALE_TIME_MS,
  });
  const tagJobCount = useMemo(() => {
    if (!tag || !tagCounts) return null;
    return tagCounts.reduce(
      (sum, tc) => (tc.tag.toLowerCase() === tag.toLowerCase() ? sum + tc.count : sum),
      0,
    );
  }, [tag, tagCounts]);

  const pageTitle = tag ? `Remote ${tag} Jobs` : "Remote Jobs by Tag";
  const metaDescription = tag
    ? `Browse ${activeTotal || "all"} remote ${tag} jobs. Find the best remote opportunities requiring ${tag} skills, available to candidates worldwide.`
    : "Browse remote jobs by skill tag.";

  useSeo({
    title: `${pageTitle} | CaribRemotejobs.com`,
    description: metaDescription,
    canonicalPath: tag ? `/jobs/tag/${encodeURIComponent(tag)}` : "/jobs/tags",
  });

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
            {tagJobCount !== null && (
              <Badge variant="secondary" className="text-sm px-2.5 py-0.5 shrink-0 bg-primary/10 text-primary border border-primary/20">
                {tagJobCount} {tagJobCount === 1 ? "job" : "jobs"}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl">
            {isLoading
              ? "Finding jobs…"
              : `${activeTotal} remote ${activeTotal === 1 ? "job" : "jobs"} requiring ${selectedTags.join(" + ")} skills.`}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">
              {isLoading
                ? isBestMatch
                  ? "Finding your best matches…"
                  : "Loading jobs…"
                : `${activeTotal} ${activeTotal === 1 ? "Job" : "Jobs"} Found`}
            </h2>
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Filtering by:</span>
                {selectedTags.map((t) => {
                  const isUrlTag = t.toLowerCase() === tag.toLowerCase();
                  return (
                    <Badge
                      key={t}
                      variant="secondary"
                      title={isUrlTag ? "This is the page tag — navigate to a different tag to change it" : "Click to remove filter"}
                      className={
                        isUrlTag
                          ? "bg-primary/15 text-primary border border-primary/30 text-xs px-2 py-0"
                          : "group/filter bg-primary text-primary-foreground border border-primary text-xs px-2 py-0 cursor-pointer hover:bg-primary/80 transition-colors inline-flex items-center gap-1"
                      }
                      onClick={
                        isUrlTag
                          ? undefined
                          : () => handleTagClick(t)
                      }
                    >
                      {t}
                      {!isUrlTag && (
                        <X className="h-3 w-3 opacity-60 group-hover/filter:opacity-100 transition-opacity shrink-0" />
                      )}
                    </Badge>
                  );
                })}
                {extraTags.length > 0 && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                    onClick={() => setSelectedTags(tag ? [tag] : [])}
                  >
                    Clear extra filters
                  </button>
                )}
              </div>
            )}
          </div>
          {hasSkills && (
            <div className="flex items-center gap-3 flex-wrap shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Min match</span>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={String(minMatch)}
                  onChange={(e) => setMinMatch(Number(e.target.value))}
                >
                  <option value="0">Any</option>
                  <option value="25">25%+</option>
                  <option value="50">50%+</option>
                  <option value="75">75%+</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
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
            </div>
          )}
        </div>

        {needsAllJobs && isAllJobsError ? (
          <div className="text-center py-16 bg-muted/30 border border-dashed rounded-xl">
            <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Couldn't load results</h3>
            <p className="text-muted-foreground mb-6">There was a problem fetching jobs. Please try again.</p>
            <Button variant="outline" onClick={() => { setSortBy("newest"); setMinMatch(0); setSelectedTags(tag ? [tag] : []); }}>
              Reset filters
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
                selectedTags={selectedTags}
                onTagClick={handleTagClick}
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
            <h3 className="text-lg font-medium mb-2">No jobs found</h3>
            <p className="text-muted-foreground mb-6">
              {extraTags.length > 0
                ? `No jobs match all of: ${selectedTags.join(", ")}. Try removing some filters.`
                : `There are no active remote jobs tagged with ${tag} right now. Check back soon or browse all jobs.`}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              {extraTags.length > 0 && (
                <Button variant="outline" onClick={() => setSelectedTags(tag ? [tag] : [])}>
                  Clear extra filters
                </Button>
              )}
              <Link href="/jobs">
                <Button variant="outline">Browse All Jobs</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
