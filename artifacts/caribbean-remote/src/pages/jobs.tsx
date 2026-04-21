import { useState, useEffect, useMemo } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { useListJobs, getListJobsQueryKey, useListCategories } from "@workspace/api-client-react";
import { JobCard } from "@/components/JobCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Briefcase, Filter, Sparkles, X, Tag } from "lucide-react";
import { useLocation, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { computeSkillMatch } from "@/lib/skill-match";

const BASE = import.meta.env.BASE_URL;
const SORT_PREF_KEY = "cr_sort_preference";
const FILTER_CATEGORY_KEY = "cr_filter_category";
const FILTER_JOB_TYPE_KEY = "cr_filter_job_type";
const FILTER_ENTRY_LEVEL_KEY = "cr_filter_entry_level";
const FILTER_FEATURED_KEY = "cr_filter_featured";
const FILTER_TAGS_KEY = "cr_filter_tags";
const FILTER_TAG_LOGIC_KEY = "cr_filter_tag_logic";
const SKILLS_NUDGE_DISMISSED_KEY = "cr_skills_nudge_dismissed";
const ALLOWED_SORT_VALUES = ["newest", "best-match"] as const;
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
  const urlFeatured = searchParams.get("featured");
  const urlTags = searchParams.getAll("tag");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);

  const [category, setCategory] = useState(() => {
    if (urlCategory) return urlCategory;
    try {
      return localStorage.getItem(FILTER_CATEGORY_KEY) || "all";
    } catch {
      return "all";
    }
  });

  const [jobType, setJobType] = useState(() => {
    try {
      return localStorage.getItem(FILTER_JOB_TYPE_KEY) || "all";
    } catch {
      return "all";
    }
  });

  const [entryLevel, setEntryLevel] = useState(() => {
    try {
      return localStorage.getItem(FILTER_ENTRY_LEVEL_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [featured, setFeatured] = useState(() => {
    if (urlFeatured !== null) return urlFeatured === "true";
    try {
      return localStorage.getItem(FILTER_FEATURED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    if (urlTags.length > 0) return urlTags;
    try {
      const stored = localStorage.getItem(FILTER_TAGS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [tagLogic, setTagLogic] = useState<"and" | "or">(() => {
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

  const { data: categories } = useListCategories();

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

  const normalQueryParams = { ...filterParams, page, limit: PAGE_SIZE };
  const { data: jobsResponse, isLoading: isLoadingNormal } = useListJobs(normalQueryParams, {
    query: { enabled: !isBestMatch, staleTime: JOBS_STALE_TIME_MS },
  });

  const allJobsQueryParams = { ...filterParams, page: 1, limit: BEST_MATCH_FETCH_LIMIT };
  const { data: allJobsResponse, isLoading: isLoadingBestMatch, isError: isBestMatchError } = useListJobs(allJobsQueryParams, {
    query: { enabled: isBestMatch, staleTime: JOBS_STALE_TIME_MS },
  });

  const isLoading = isBestMatch
    ? !isBestMatchError && (isLoadingBestMatch || allJobsResponse === undefined)
    : isLoadingNormal;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, jobType, entryLevel, featured, sortBy, selectedTags, tagLogic]);

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

  // Reset to newest when skills disappear (persistence effect will save "newest")
  useEffect(() => {
    if (!hasSkills && sortBy === "best-match") {
      setSortBy("newest");
    }
  }, [hasSkills, sortBy]);

  const { displayedJobs, activeTotal, activeTotalPages } = useMemo(() => {
    if (isBestMatch) {
      const allJobs = allJobsResponse?.jobs ?? [];
      const serverTotal = allJobsResponse?.total ?? allJobs.length;

      if (serverTotal > allJobs.length) {
        console.warn(
          `[best-match] Fetched ${allJobs.length} of ${serverTotal} jobs — sort order may not reflect the full result set.`,
        );
      }

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
          <p className="text-muted-foreground text-lg max-w-2xl mb-8">
            Browse remote opportunities from global companies hiring in the Caribbean and beyond.
          </p>
          
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

          {selectedTags.length > 0 && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Filtered by skill:</span>
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
              {selectedTags.length >= 2 && (
                <div className="inline-flex items-center rounded-full border bg-muted text-xs font-medium overflow-hidden">
                  <button
                    onClick={() => setTagLogic("and")}
                    className={`px-2.5 py-1 transition-colors ${tagLogic === "and" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    aria-pressed={tagLogic === "and"}
                  >
                    Match ALL
                  </button>
                  <button
                    onClick={() => setTagLogic("or")}
                    className={`px-2.5 py-1 transition-colors ${tagLogic === "or" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    aria-pressed={tagLogic === "or"}
                  >
                    Match ANY
                  </button>
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

          <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-xl font-semibold">
              {isLoading
                ? isBestMatch
                  ? "Finding your best matches…"
                  : "Loading jobs…"
                : `${activeTotal} Jobs Found`}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <Label htmlFor="sort-by" className="text-sm text-muted-foreground whitespace-nowrap">Sort by</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger id="sort-by" className="w-[160px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  {hasSkills && (
                    <SelectItem value="best-match">Best match</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isBestMatch && isBestMatchError ? (
            <div className="text-center py-16 bg-muted/30 border border-dashed rounded-xl">
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">Couldn't load Best Match results</h3>
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
