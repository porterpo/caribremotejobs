import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { useListJobs, getListJobsQueryKey, useListCategories, useListJobTags } from "@workspace/api-client-react";
import { JobCard } from "@/components/JobCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Briefcase, Filter, Sparkles, X, Tag, AlertTriangle, AlertCircle } from "lucide-react";
import { useLocation, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { computeSkillMatch } from "@/lib/skill-match";

const BASE = import.meta.env.BASE_URL;
const SORT_PREF_KEY = "cr_sort_preference";
const FILTER_SEARCH_KEY = "cr_filter_search";
const FILTER_CATEGORY_KEY = "cr_filter_category";
const FILTER_JOB_TYPE_KEY = "cr_filter_job_type";
const FILTER_ENTRY_LEVEL_KEY = "cr_filter_entry_level";
const FILTER_FEATURED_KEY = "cr_filter_featured";
const FILTER_TAGS_KEY = "cr_filter_tags";
const FILTER_TAG_LOGIC_KEY = "cr_filter_tag_logic";
const FILTER_MIN_MATCH_KEY = "cr_filter_min_match";
const FILTER_ONLY_MATCHING_KEY = "cr_filter_only_matching";
const SKILLS_NUDGE_DISMISSED_KEY = "cr_skills_nudge_dismissed";
const LIMIT_BANNER_DISMISSED_KEY = "cr_limit_banner_dismissed_week";

function getCurrentWeekToken(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
const ALLOWED_SORT_VALUES = ["newest", "best-match"] as const;
const ALLOWED_MIN_MATCH_VALUES = [0, 25, 50, 75] as const;
const PAGE_SIZE = 10;
const JOBS_STALE_TIME_MS = 60_000;
const BEST_MATCH_FETCH_LIMIT = 9999;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function Jobs() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  
  const urlCategory = searchParams.get("category");
  const urlJobType = searchParams.get("jobType");
  const urlEntryLevel = searchParams.get("entryLevel");
  const urlFeatured = searchParams.get("featured");
  const urlTags = searchParams.getAll("tag");
  const urlTagLogic = searchParams.get("tagLogic");

  // If any filter param is present in the URL, treat the URL as the sole
  // source of truth for ALL filter state so shared links are deterministic.
  const hasUrlFilters =
    urlCategory !== null ||
    urlJobType !== null ||
    urlEntryLevel !== null ||
    urlFeatured !== null ||
    urlTags.length > 0;

  const [search, setSearch] = useState(() => {
    if (hasUrlFilters) return "";
    try {
      return localStorage.getItem(FILTER_SEARCH_KEY) || "";
    } catch {
      return "";
    }
  });
  const debouncedSearch = useDebounce(search, 500);

  const [category, setCategory] = useState(() => {
    if (urlCategory) return urlCategory;
    if (hasUrlFilters) return "all";
    try {
      return localStorage.getItem(FILTER_CATEGORY_KEY) || "all";
    } catch {
      return "all";
    }
  });

  const [jobType, setJobType] = useState(() => {
    if (urlJobType) return urlJobType;
    if (hasUrlFilters) return "all";
    try {
      return localStorage.getItem(FILTER_JOB_TYPE_KEY) || "all";
    } catch {
      return "all";
    }
  });

  const [entryLevel, setEntryLevel] = useState(() => {
    if (urlEntryLevel !== null) return urlEntryLevel === "true";
    if (hasUrlFilters) return false;
    try {
      return localStorage.getItem(FILTER_ENTRY_LEVEL_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [featured, setFeatured] = useState(() => {
    if (urlFeatured !== null) return urlFeatured === "true";
    if (hasUrlFilters) return false;
    try {
      return localStorage.getItem(FILTER_FEATURED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    if (urlTags.length > 0) return urlTags;
    if (hasUrlFilters) return [];
    try {
      const stored = localStorage.getItem(FILTER_TAGS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [tagLogic, setTagLogic] = useState<"and" | "or">(() => {
    if (urlTagLogic === "or") return "or";
    if (urlTagLogic === "and") return "and";
    if (hasUrlFilters) return "and";
    try {
      const stored = localStorage.getItem(FILTER_TAG_LOGIC_KEY);
      return stored === "or" ? "or" : "and";
    } catch {
      return "and";
    }
  });

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  const [page, setPage] = useState(1);
  
  const [sortBy, setSortBy] = useState(() => {
    try {
      const stored = localStorage.getItem(SORT_PREF_KEY);
      return ALLOWED_SORT_VALUES.includes(stored as typeof ALLOWED_SORT_VALUES[number])
        ? (stored as string)
        : "newest";
    } catch {
      return "newest";
    }
  });

  const [minMatch, setMinMatch] = useState<number>(() => {
    try {
      const stored = parseInt(localStorage.getItem(FILTER_MIN_MATCH_KEY) ?? "0", 10);
      return (ALLOWED_MIN_MATCH_VALUES as readonly number[]).includes(stored) ? stored : 0;
    } catch {
      return 0;
    }
  });

  const [onlyMatching, setOnlyMatching] = useState(() => {
    try {
      return localStorage.getItem(FILTER_ONLY_MATCHING_KEY) === "1";
    } catch {
      return false;
    }
  });

  const { isSignedIn } = useUser();
  const queryClient = useQueryClient();

  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return localStorage.getItem(SKILLS_NUDGE_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  function dismissNudge() {
    try {
      localStorage.setItem(SKILLS_NUDGE_DISMISSED_KEY, "1");
    } catch {}
    setNudgeDismissed(true);
  }

  const [limitBannerDismissed, setLimitBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem(LIMIT_BANNER_DISMISSED_KEY) === getCurrentWeekToken();
    } catch {
      return false;
    }
  });

  function dismissLimitBanner() {
    try {
      localStorage.setItem(LIMIT_BANNER_DISMISSED_KEY, getCurrentWeekToken());
    } catch {}
    setLimitBannerDismissed(true);
  }

  const { data: subscriptionData } = useQuery<{
    isPro: boolean;
    applicationCount: number;
    applicationLimit: number | null;
  }>({
    queryKey: ["seeker", "subscription"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/seeker/subscription`);
      if (!res.ok) throw new Error("Failed to fetch subscription");
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });

  const showLimitBanner =
    !limitBannerDismissed &&
    !!isSignedIn &&
    !!subscriptionData &&
    !subscriptionData.isPro &&
    subscriptionData.applicationLimit !== null &&
    (subscriptionData.applicationCount >= 2 ||
      subscriptionData.applicationCount >= subscriptionData.applicationLimit);

  const isAtLimit =
    !!subscriptionData &&
    subscriptionData.applicationLimit !== null &&
    subscriptionData.applicationCount >= subscriptionData.applicationLimit;

  const [tagInput, setTagInput] = useState("");

  const debouncedSelectedTags = useDebounce(selectedTags, 400);

  const { data: tagCounts, isFetching: tagCountsFetching } = useQuery<{ andCount: number; orCount: number }>({
    queryKey: ["jobs", "tag-counts", debouncedSelectedTags, debouncedSearch, category, jobType, entryLevel, featured],
    queryFn: async () => {
      const params = new URLSearchParams();
      debouncedSelectedTags.forEach((t) => params.append("tag", t));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (category !== "all") params.set("category", category);
      if (jobType !== "all") params.set("jobType", jobType);
      if (entryLevel) params.set("entryLevel", "true");
      if (featured) params.set("featured", "true");
      const res = await fetch(`${BASE}api/jobs/tag-counts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch tag counts");
      return res.json();
    },
    enabled: debouncedSelectedTags.length >= 2,
    staleTime: 30_000,
  });

  const { data: categories } = useListCategories();
  const { data: allTags } = useListJobTags();

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

  const filterParams = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(category !== "all" ? { category } : {}),
    ...(jobType !== "all" ? { jobType } : {}),
    ...(entryLevel ? { entryLevel: true } : {}),
    ...(featured ? { featured: true } : {}),
    ...(selectedTags.length > 0 ? { tag: selectedTags } : {}),
    ...(selectedTags.length >= 2 ? { tagLogic } : {}),
  };

  const isBestMatch = sortBy === "best-match" && hasSkills;
  const needsAllJobs = hasSkills && (isBestMatch || minMatch > 0 || onlyMatching);

  const normalQueryParams = { ...filterParams, page, limit: PAGE_SIZE };
  const { data: jobsResponse, isLoading: isLoadingNormal } = useListJobs(normalQueryParams, {
    query: { enabled: !needsAllJobs, staleTime: JOBS_STALE_TIME_MS },
  });

  const allJobsQueryParams = { ...filterParams, page: 1, limit: BEST_MATCH_FETCH_LIMIT };
  const { data: allJobsResponse, isLoading: isLoadingAllJobs, isError: isAllJobsError } = useListJobs(allJobsQueryParams, {
    query: { enabled: needsAllJobs, staleTime: JOBS_STALE_TIME_MS },
  });

  const isLoading = needsAllJobs
    ? !isAllJobsError && (isLoadingAllJobs || allJobsResponse === undefined)
    : isLoadingNormal;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, jobType, entryLevel, featured, sortBy, minMatch, onlyMatching, selectedTags, tagLogic]);

  // Persist search term to localStorage
  useEffect(() => {
    try {
      if (search) {
        localStorage.setItem(FILTER_SEARCH_KEY, search);
      } else {
        localStorage.removeItem(FILTER_SEARCH_KEY);
      }
    } catch {}
  }, [search]);

  // Persist sort preference to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SORT_PREF_KEY, sortBy);
    } catch {
    }
  }, [sortBy]);

  // Persist filter preferences to localStorage
  useEffect(() => {
    try { localStorage.setItem(FILTER_CATEGORY_KEY, category); } catch {}
  }, [category]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_JOB_TYPE_KEY, jobType); } catch {}
  }, [jobType]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_ENTRY_LEVEL_KEY, entryLevel ? "1" : "0"); } catch {}
  }, [entryLevel]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_FEATURED_KEY, featured ? "1" : "0"); } catch {}
  }, [featured]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_TAGS_KEY, JSON.stringify(selectedTags)); } catch {}
  }, [selectedTags]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_TAG_LOGIC_KEY, tagLogic); } catch {}
  }, [tagLogic]);

  // Sync all active filters to the URL so filter state is shareable
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (category !== "all") {
      params.set("category", category);
    } else {
      params.delete("category");
    }

    if (jobType !== "all") {
      params.set("jobType", jobType);
    } else {
      params.delete("jobType");
    }

    if (entryLevel) {
      params.set("entryLevel", "true");
    } else {
      params.delete("entryLevel");
    }

    if (featured) {
      params.set("featured", "true");
    } else {
      params.delete("featured");
    }

    params.delete("tag");
    selectedTags.forEach((t) => params.append("tag", t));
    if (selectedTags.length >= 2 && tagLogic === "or") {
      params.set("tagLogic", "or");
    } else {
      params.delete("tagLogic");
    }

    const newSearch = params.toString();
    const newUrl = newSearch
      ? `${window.location.pathname}?${newSearch}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [category, jobType, entryLevel, featured, selectedTags, tagLogic]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_MIN_MATCH_KEY, String(minMatch)); } catch {}
  }, [minMatch]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_ONLY_MATCHING_KEY, onlyMatching ? "1" : "0"); } catch {}
  }, [onlyMatching]);

  // Reset skill-based settings when skills are confirmed gone (not just loading)
  const skillsResolved = !isSignedIn || resumeStatus === "success" || resumeStatus === "error";
  useEffect(() => {
    if (skillsResolved && !hasSkills) {
      if (sortBy === "best-match") setSortBy("newest");
      if (minMatch > 0) setMinMatch(0);
      if (onlyMatching) setOnlyMatching(false);
    }
  }, [skillsResolved, hasSkills, sortBy, minMatch, onlyMatching]);

  const { displayedJobs, activeTotal, activeTotalPages } = useMemo(() => {
    if (needsAllJobs) {
      const allJobs = allJobsResponse?.jobs ?? [];
      const serverTotal = allJobsResponse?.total ?? allJobs.length;

      if (serverTotal > allJobs.length) {
        console.warn(
          `[skill-filter] Fetched ${allJobs.length} of ${serverTotal} jobs — results may not reflect the full set.`,
        );
      }

      const jobsWithScores = allJobs.map((job) => ({
        job,
        score: computeSkillMatch(resumeSkills, job.tags ?? null)?.percentage ?? 0,
      }));

      const filtered = jobsWithScores.filter(({ score }) => {
        if (onlyMatching && score === 0) return false;
        if (minMatch > 0 && score < minMatch) return false;
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
  }, [needsAllJobs, isBestMatch, allJobsResponse, jobsResponse, resumeSkills, minMatch, onlyMatching, page]);

  const FilterContent = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label htmlFor="category">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="category">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label htmlFor="jobType">Job Type</Label>
        <Select value={jobType} onValueChange={setJobType}>
          <SelectTrigger id="jobType">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="full-time">Full Time</SelectItem>
            <SelectItem value="part-time">Part Time</SelectItem>
            <SelectItem value="contract">Contract</SelectItem>
            <SelectItem value="freelance">Freelance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <Label>Filters</Label>
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="entryLevel" 
            checked={entryLevel} 
            onCheckedChange={(c) => setEntryLevel(c as boolean)} 
          />
          <Label htmlFor="entryLevel" className="font-normal cursor-pointer">
            Entry Level Only
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="featured" 
            checked={featured} 
            onCheckedChange={(c) => setFeatured(c as boolean)} 
          />
          <Label htmlFor="featured" className="font-normal cursor-pointer">
            Featured Jobs Only
          </Label>
        </div>
        {hasSkills && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="onlyMatching"
              checked={onlyMatching}
              onCheckedChange={(c) => setOnlyMatching(c as boolean)}
            />
            <Label htmlFor="onlyMatching" className="font-normal cursor-pointer">
              Matching my skills only
            </Label>
          </div>
        )}
      </div>

      {hasSkills && (
        <div className="space-y-3">
          <Label htmlFor="min-match">Minimum Skill Match</Label>
          <Select value={String(minMatch)} onValueChange={(v) => setMinMatch(Number(v))}>
            <SelectTrigger id="min-match">
              <SelectValue placeholder="Any match" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any match</SelectItem>
              <SelectItem value="25">25% or more</SelectItem>
              <SelectItem value="50">50% or more</SelectItem>
              <SelectItem value="75">75% or more</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      
      <div className="space-y-3">
        <Label htmlFor="tag-search">Skills / Tags</Label>
        <div className="relative">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            id="tag-search"
            placeholder="Type to search tags…"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {(() => {
          const trimmed = tagInput.trim().toLowerCase();
          const suggestions = (allTags ?? []).filter(
            ({ tag }) =>
              tag.toLowerCase().includes(trimmed) &&
              !selectedTags.includes(tag)
          );
          if (!trimmed && selectedTags.length === 0) return null;
          return (
            <div className="space-y-1.5">
              {selectedTags.map((tag) => (
                <div
                  key={tag}
                  className="flex items-center justify-between rounded-md bg-primary/10 border border-primary/20 px-2.5 py-1.5 text-sm font-medium text-primary"
                >
                  <span className="truncate">{tag}</span>
                  <button
                    onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                    aria-label={`Remove ${tag} filter`}
                    className="ml-2 shrink-0 hover:text-primary/70 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {selectedTags.length === 1 && (
                <p className="text-xs text-muted-foreground px-0.5 pt-0.5">
                  Add another tag to choose AND/OR matching
                </p>
              )}
              {selectedTags.length >= 2 && (
                <div className="flex flex-col gap-1 pt-1">
                  <div className="inline-flex items-center rounded-full border bg-muted text-xs font-medium overflow-hidden self-start">
                    <button
                      onClick={() => setTagLogic("and")}
                      className={`px-2.5 py-1 transition-colors ${tagLogic === "and" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      aria-pressed={tagLogic === "and"}
                    >
                      Match ALL <span className="inline-block min-w-[5ch] text-center tabular-nums">{tagCountsFetching && tagCounts == null ? "(…)" : tagCounts != null ? `(${tagCounts.andCount})` : ""}</span>
                    </button>
                    <button
                      onClick={() => setTagLogic("or")}
                      className={`px-2.5 py-1 transition-colors ${tagLogic === "or" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      aria-pressed={tagLogic === "or"}
                    >
                      Match ANY <span className="inline-block min-w-[5ch] text-center tabular-nums">{tagCountsFetching && tagCounts == null ? "(…)" : tagCounts != null ? `(${tagCounts.orCount})` : ""}</span>
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground pl-0.5">
                    {tagLogic === "and" ? "Jobs must have all selected tags" : "Jobs can have any selected tag"}
                  </span>
                </div>
              )}
              {trimmed && suggestions.slice(0, 8).map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => { toggleTag(tag); setTagInput(""); }}
                  className="flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-sm text-foreground hover:bg-muted transition-colors text-left"
                >
                  <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{tag}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{count}</span>
                </button>
              ))}
              {trimmed && suggestions.length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No matching tags found.</p>
              )}
            </div>
          );
        })()}
      </div>

      <Button 
        variant="outline" 
        className="w-full"
        onClick={() => {
          setSearch("");
          setCategory("all");
          setJobType("all");
          setEntryLevel(false);
          setFeatured(false);
          setSelectedTags([]);
          setTagLogic("and");
          setMinMatch(0);
          setOnlyMatching(false);
          setTagInput("");
        }}
      >
        Clear Filters
      </Button>
    </div>
  );

  return (
    <PageLayout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Find Your Next Remote Role</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mb-4">
            Browse remote opportunities from global companies hiring in the Caribbean and beyond.
          </p>

          <Link
            href="/jobs/tags"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-8"
          >
            <Tag className="h-4 w-4" />
            Browse by Skill Tag
          </Link>
          
          <div className="flex gap-2 w-full max-w-3xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search job titles, keywords, or companies..."
                className="pl-10 h-12 text-base bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-12 w-12 shrink-0 md:hidden bg-background">
                  <Filter className="h-5 w-5" />
                  <span className="sr-only">Filters</span>
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader className="mb-6">
                  <SheetTitle>Filter Jobs</SheetTitle>
                </SheetHeader>
                <FilterContent />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row gap-8 items-start">
        {/* Desktop Sidebar Filters */}
        <div className="hidden md:block w-[280px] shrink-0 sticky top-24 border rounded-xl p-6 bg-card">
          <h2 className="font-semibold text-lg mb-6 flex items-center gap-2">
            <Filter className="h-5 w-5" /> Filters
          </h2>
          <FilterContent />
        </div>

        {/* Job List */}
        <div className="flex-1 w-full min-w-0">
          {showLimitBanner && (
            <div
              className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 ${
                isAtLimit
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }`}
            >
              {isAtLimit ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
              )}
              <p className="flex-1 text-sm text-foreground">
                {isAtLimit ? (
                  <>
                    You've used all{" "}
                    {subscriptionData!.applicationLimit} of your{" "}
                    {subscriptionData!.applicationLimit} free applications this week.{" "}
                    <Link href="/seeker-pro" className="font-medium text-primary hover:underline">
                      Upgrade to Seeker Pro
                    </Link>{" "}
                    for unlimited applications.
                  </>
                ) : (
                  <>
                    You've used {subscriptionData!.applicationCount} of{" "}
                    {subscriptionData!.applicationLimit} free applications this week.{" "}
                    <Link href="/seeker-pro" className="font-medium text-primary hover:underline">
                      Upgrade to Seeker Pro
                    </Link>{" "}
                    before you hit your limit.
                  </>
                )}
              </p>
              <button
                onClick={dismissLimitBanner}
                aria-label="Dismiss"
                className="ml-auto text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {isSignedIn && resumeStatus === "success" && !hasSkills && !nudgeDismissed && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <p className="flex-1 text-sm text-foreground">
                <Link href="/resume" className="font-medium text-primary hover:underline">
                  Add skills to your resume
                </Link>{" "}
                to unlock skill-match scores and sort jobs by best fit.
              </p>
              <button
                onClick={dismissNudge}
                aria-label="Dismiss"
                className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {(selectedTags.length > 0 || minMatch > 0) && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Filtered by skill:</span>
              {minMatch > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm px-3 py-1 font-medium">
                  {minMatch}%+ match
                  <button
                    onClick={() => setMinMatch(0)}
                    aria-label="Remove minimum match filter"
                    className="ml-0.5 hover:text-primary/70 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
              {selectedTags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm px-3 py-1 font-medium">
                  <Tag className="h-3 w-3" />
                  {tag}
                  <button
                    onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                    aria-label={`Remove ${tag} filter`}
                    className="ml-0.5 hover:text-primary/70 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {selectedTags.length === 1 && (
                <span className="text-xs text-muted-foreground w-full">
                  Add another tag to choose AND/OR matching
                </span>
              )}
              {selectedTags.length >= 2 && (
                <div className="inline-flex flex-col items-start gap-0.5">
                  <div className="inline-flex items-center rounded-full border bg-muted text-xs font-medium overflow-hidden">
                    <button
                      onClick={() => setTagLogic("and")}
                      className={`px-2.5 py-1 transition-colors ${tagLogic === "and" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      aria-pressed={tagLogic === "and"}
                    >
                      Match ALL <span className="inline-block min-w-[5ch] text-center tabular-nums">{tagCountsFetching && tagCounts == null ? "(…)" : tagCounts != null ? `(${tagCounts.andCount})` : ""}</span>
                    </button>
                    <button
                      onClick={() => setTagLogic("or")}
                      className={`px-2.5 py-1 transition-colors ${tagLogic === "or" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      aria-pressed={tagLogic === "or"}
                    >
                      Match ANY <span className="inline-block min-w-[5ch] text-center tabular-nums">{tagCountsFetching && tagCounts == null ? "(…)" : tagCounts != null ? `(${tagCounts.orCount})` : ""}</span>
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground pl-0.5">
                    {tagLogic === "and" ? "Jobs must have all selected tags" : "Jobs can have any selected tag"}
                  </span>
                </div>
              )}
              {selectedTags.length > 1 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">
                {isLoading
                  ? needsAllJobs
                    ? isBestMatch
                      ? "Finding your best matches…"
                      : "Filtering by skill match…"
                    : "Loading jobs…"
                  : `${activeTotal} Jobs Found`}
              </h2>
              {!isLoading && isBestMatch && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium px-2.5 py-1 cursor-default whitespace-nowrap">
                      <Sparkles className="h-3 w-3 shrink-0" />
                      Sorted by best match
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[200px] text-center">
                    Order is based on how well each job matches your resume skills
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label htmlFor="sort-by" className="text-sm text-muted-foreground whitespace-nowrap">Sort by</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger id="sort-by" className="w-[160px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="best-match" disabled={!hasSkills}>
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Best match
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {isSignedIn && !hasSkills && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <Link href="/resume" className="font-medium text-primary hover:underline">
                    Add skills to your resume
                  </Link>{" "}
                  to enable Best match sorting.
                </div>
              )}
            </div>
          </div>

          {needsAllJobs && isAllJobsError ? (
            <div className="text-center py-16 bg-muted/30 border border-dashed rounded-xl">
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">Couldn't load results</h3>
              <p className="text-muted-foreground mb-6">There was a problem fetching jobs. Please try again.</p>
              <Button variant="outline" onClick={() => { setSortBy("newest"); setMinMatch(0); setOnlyMatching(false); }}>
                Reset and show newest first
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
                <JobCard key={job.id} job={job} isBestMatch={isBestMatch} onTagClick={toggleTag} selectedTags={selectedTags} />
              ))}
              
              {/* Pagination */}
              {activeTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-8">
                  <Button 
                    variant="outline" 
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm font-medium px-4">
                    Page {page} of {activeTotalPages}
                  </span>
                  <Button 
                    variant="outline" 
                    disabled={page === activeTotalPages}
                    onClick={() => setPage(p => Math.min(activeTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 bg-muted/30 border border-dashed rounded-xl">
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">No jobs matched your search</h3>
              <p className="text-muted-foreground mb-6">Try adjusting your filters or search terms to find what you're looking for.</p>
              <Button 
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setJobType("all");
                  setEntryLevel(false);
                  setFeatured(false);
                  setSelectedTags([]);
                  setTagLogic("and");
                  setMinMatch(0);
                  setTagInput("");
                }}
              >
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
