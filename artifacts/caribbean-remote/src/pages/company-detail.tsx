import { useState } from "react";
import { useRoute, Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { useGetCompany, getGetCompanyQueryKey, useListJobs } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Globe, ArrowLeft, Palmtree, Briefcase } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { JobCard } from "@/components/JobCard";

export default function CompanyDetail() {
  const [, params] = useRoute("/companies/:id");
  const companyId = parseInt(params?.id || "0", 10);
  const [logoError, setLogoError] = useState(false);

  const { data: company, isLoading, error } = useGetCompany(companyId, {
    query: { enabled: !!companyId, queryKey: getGetCompanyQueryKey(companyId) }
  });

  const { data: jobsResponse, isLoading: jobsLoading } = useListJobs(
    { search: company?.name },
    { query: { enabled: !!company?.name, queryKey: ["/api/jobs", { search: company?.name }] } }
  );

  const companyJobs = jobsResponse?.jobs.filter(j => j.companyName === company?.name) || [];

  if (isLoading) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-24 mb-8" />
          <div className="border rounded-xl p-8 mb-12">
            <div className="flex gap-6 items-start">
              <Skeleton className="h-24 w-24 rounded-xl" />
              <div className="space-y-4 flex-1">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-20 w-full mt-4" />
              </div>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !company) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold mb-4">Company Not Found</h2>
          <p className="text-muted-foreground mb-8">The company you're looking for doesn't exist or has been removed.</p>
          <Button asChild>
            <Link href="/companies">Back to Companies</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-8 md:py-16">
          <Button variant="ghost" size="sm" asChild className="mb-8 -ml-3 text-muted-foreground hover:text-foreground">
            <Link href="/companies">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to companies
            </Link>
          </Button>

          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="h-32 w-32 rounded-2xl bg-white border shadow-sm flex items-center justify-center shrink-0 p-4">
              {company.logo && !logoError ? (
                <img
                  src={company.logo}
                  alt={company.name}
                  className="max-h-full max-w-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <Building2 className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex flex-wrap gap-2 mb-3">
                {company.caribbeanFriendlyCertified && (
                  <Badge className="bg-amber-500 text-white border-amber-500 gap-1">
                    <Palmtree className="h-3.5 w-3.5" />
                    Caribbean Friendly Certified
                  </Badge>
                )}
                {!company.caribbeanFriendlyCertified && company.caribbeanFriendly && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
                    <Palmtree className="h-3.5 w-3.5" />
                    Caribbean Friendly Employer
                  </Badge>
                )}
                {company.hiresBahamas && (
                  <Badge variant="outline">Hires in Bahamas</Badge>
                )}
                {company.hiresCaribbean && (
                  <Badge variant="outline">Hires across Caribbean</Badge>
                )}
              </div>
              
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-foreground">{company.name}</h1>
              
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-muted-foreground mb-6">
                {company.country && (
                  <div className="flex items-center gap-1.5 font-medium">
                    <MapPin className="h-4 w-4" />
                    Headquarters: {company.country}
                  </div>
                )}
                {company.website && (
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                    <Globe className="h-4 w-4" />
                    {company.website.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                )}
              </div>
              
              <div className="prose prose-gray dark:prose-invert max-w-none">
                <p className="text-lg leading-relaxed text-foreground/90">{company.description}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Open Roles at {company.name}</h2>
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <Briefcase className="mr-1.5 h-4 w-4" />
            {companyJobs.length} Jobs
          </Badge>
        </div>

        {jobsLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-[120px] rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : companyJobs.length > 0 ? (
          <div className="grid gap-4">
            {companyJobs.map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-muted/30 border border-dashed rounded-xl">
            <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-1">No open positions</h3>
            <p className="text-muted-foreground mb-6">This company doesn't have any active job listings right now.</p>
            <Button variant="outline" asChild>
              <Link href="/alerts">Get alerted when they post</Link>
            </Button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
