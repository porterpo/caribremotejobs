import { useState, useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { useListJobs, getListJobsQueryKey, useListCategories } from "@workspace/api-client-react";
import { JobCard } from "@/components/JobCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Briefcase, Filter } from "lucide-react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useQueryClient } from "@tanstack/react-query";

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
  
  const initialCategory = searchParams.get("category") || "all";
  const initialFeatured = searchParams.get("featured") === "true";
  
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  
  const [category, setCategory] = useState(initialCategory);
  const [jobType, setJobType] = useState("all");
  const [caribbeanFriendly, setCaribbeanFriendly] = useState(false);
  const [featured, setFeatured] = useState(initialFeatured);
  const [page, setPage] = useState(1);
  
  const queryClient = useQueryClient();
  const { data: categories } = useListCategories();

  const queryParams = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(category !== "all" ? { category } : {}),
    ...(jobType !== "all" ? { jobType } : {}),
    ...(caribbeanFriendly ? { caribbeanFriendly: true } : {}),
    ...(featured ? { featured: true } : {}),
    page,
    limit: 10,
  };

  const { data: jobsResponse, isLoading } = useListJobs(queryParams);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, jobType, caribbeanFriendly, featured]);

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
            id="caribbeanFriendly" 
            checked={caribbeanFriendly} 
            onCheckedChange={(c) => setCaribbeanFriendly(c as boolean)} 
          />
          <Label htmlFor="caribbeanFriendly" className="font-normal cursor-pointer">
            Caribbean Friendly Only
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
          setCaribbeanFriendly(false);
          setFeatured(false);
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
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {isLoading ? "Loading jobs..." : `${jobsResponse?.total || 0} Jobs Found`}
            </h2>
          </div>

          {isLoading ? (
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
          ) : jobsResponse?.jobs.length ? (
            <div className="space-y-4">
              {jobsResponse.jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
              
              {/* Pagination */}
              {jobsResponse.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-8">
                  <Button 
                    variant="outline" 
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm font-medium px-4">
                    Page {page} of {jobsResponse.totalPages}
                  </span>
                  <Button 
                    variant="outline" 
                    disabled={page === jobsResponse.totalPages}
                    onClick={() => setPage(p => Math.min(jobsResponse.totalPages, p + 1))}
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
                  setCaribbeanFriendly(false);
                  setFeatured(false);
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
