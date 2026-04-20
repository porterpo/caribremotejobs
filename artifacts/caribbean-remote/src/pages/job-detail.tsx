import { useRoute, Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { useGetJob, getGetJobQueryKey, useListJobs } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, DollarSign, Clock, Calendar, ArrowLeft, ExternalLink, Palmtree, BellRing } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { JobCard } from "@/components/JobCard";

export default function JobDetail() {
  const [, params] = useRoute("/jobs/:id");
  const jobId = parseInt(params?.id || "0", 10);

  const { data: job, isLoading, error } = useGetJob(jobId, {
    query: { enabled: !!jobId, queryKey: getGetJobQueryKey(jobId) }
  });

  const { data: similarJobsResponse } = useListJobs(
    { category: job?.category, limit: 3 },
    { query: { enabled: !!job?.category, queryKey: ["/api/jobs", { category: job?.category, limit: 3 }] } }
  );

  const similarJobs = similarJobsResponse?.jobs.filter(j => j.id !== jobId) || [];

  if (isLoading) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-24 mb-8" />
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              <Skeleton className="h-24 w-24 rounded-xl" />
              <Skeleton className="h-10 w-3/4" />
              <div className="flex gap-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-6 w-32" />
              </div>
              <div className="space-y-2 mt-8">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
            <div className="space-y-4">
              <Skeleton className="h-[300px] w-full rounded-xl" />
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !job) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold mb-4">Job Not Found</h2>
          <p className="text-muted-foreground mb-8">The job you're looking for doesn't exist or has been removed.</p>
          <Button asChild>
            <Link href="/jobs">Back to Jobs</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <Button variant="ghost" size="sm" asChild className="mb-6 -ml-3 text-muted-foreground hover:text-foreground">
            <Link href="/jobs">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to jobs
            </Link>
          </Button>

          <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between">
            <div className="flex gap-6 items-start">
              {job.companyId ? (
                <Link href={`/companies/${job.companyId}`} className="h-20 w-20 rounded-xl bg-white border flex items-center justify-center shrink-0 shadow-sm overflow-hidden p-2 hover:ring-2 hover:ring-primary/30 transition-shadow">
                  {job.companyLogo ? (
                    <img src={job.companyLogo} alt={job.companyName} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </Link>
              ) : (
                <div className="h-20 w-20 rounded-xl bg-white border flex items-center justify-center shrink-0 shadow-sm overflow-hidden p-2">
                  {job.companyLogo ? (
                    <img src={job.companyLogo} alt={job.companyName} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              )}
              <div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {job.featured && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 font-medium">
                      Featured
                    </Badge>
                  )}
                  {job.caribbeanFriendly && (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200 gap-1">
                      <Palmtree className="h-3 w-3" />
                      Caribbean Friendly
                    </Badge>
                  )}
                  <Badge variant="outline" className="bg-background">
                    {job.category}
                  </Badge>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">{job.title}</h1>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground">
                  <Link href={job.companyId ? `/companies/${job.companyId}` : '#'} className="flex items-center gap-1.5 font-medium text-foreground hover:text-primary transition-colors">
                    <Building2 className="h-4 w-4" />
                    {job.companyName}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {job.locationRestrictions || "Anywhere"}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    <span className="capitalize">{job.jobType.replace('-', ' ')}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col gap-3 min-w-[200px] shrink-0 mt-4 md:mt-0">
              <Button size="lg" className="w-full text-base h-12" asChild>
                <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
                  Apply Now <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-12">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-10">
            <div>
              <h2 className="text-2xl font-bold mb-6">Job Description</h2>
              <div 
                className="prose prose-gray dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-display prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80"
                dangerouslySetInnerHTML={{ __html: job.description.replace(/\n/g, '<br />') }}
              />
            </div>
            
            {job.tags && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Skills & Requirements</h3>
                <div className="flex flex-wrap gap-2">
                  {job.tags.split(',').map(tag => (
                    <Badge key={tag} variant="secondary" className="font-normal text-sm px-3 py-1">
                      {tag.trim()}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-8 border-t">
              <Button size="lg" className="w-full md:w-auto px-8" asChild>
                <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
                  Apply for this position <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="border rounded-xl p-6 bg-card shadow-sm">
              <h3 className="font-semibold text-lg mb-4">Job Overview</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Posted Date</div>
                    <div className="text-sm text-muted-foreground">{format(new Date(job.postedAt), "MMMM d, yyyy")}</div>
                  </div>
                </div>
                
                {(job.salaryMin || job.salaryMax) && (
                  <div className="flex items-start gap-3">
                    <DollarSign className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Salary Range</div>
                      <div className="text-sm text-muted-foreground">
                        {job.salaryMin ? `${job.salaryMin / 1000}k` : ''}
                        {job.salaryMin && job.salaryMax ? ' - ' : ''}
                        {job.salaryMax ? `${job.salaryMax / 1000}k` : ''} {job.salaryCurrency}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Location</div>
                    <div className="text-sm text-muted-foreground">{job.locationRestrictions || "Anywhere in the world"}</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Job Type</div>
                    <div className="text-sm text-muted-foreground capitalize">{job.jobType.replace('-', ' ')}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border rounded-xl p-6 bg-primary/5 border-primary/20 text-center">
              <BellRing className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold mb-2">Get alerts for similar jobs</h3>
              <p className="text-sm text-muted-foreground mb-4">
                We'll email you when jobs like this are posted.
              </p>
              <Button variant="outline" className="w-full bg-background" asChild>
                <Link href={`/alerts?category=${job.category}`}>Subscribe</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Similar Jobs */}
        {similarJobs.length > 0 && (
          <div className="mt-16 pt-12 border-t">
            <h2 className="text-2xl font-bold tracking-tight mb-6">Similar Remote Jobs</h2>
            <div className="grid gap-4">
              {similarJobs.map(similarJob => (
                <JobCard key={similarJob.id} job={similarJob} />
              ))}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
