import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, DollarSign, Clock, Palmtree } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import type { Job } from "@workspace/api-client-react";
import { computeSkillMatch } from "@/lib/skill-match";
import { SkillMatchBadge } from "@/components/SkillMatchBadge";

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  const isFeatured = job.featured;
  const isCaribbeanFriendly = job.caribbeanFriendly;
  const { isSignedIn } = useUser();
  const queryClient = useQueryClient();
  const resume = isSignedIn
    ? queryClient.getQueryData<{ skills?: string[] | null } | null>(["resume", "me"])
    : null;
  const skillMatch =
    resume?.skills && resume.skills.length > 0
      ? computeSkillMatch(resume.skills, job.tags ?? null)
      : null;

  const allTags = job.tags
    ? job.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const MAX_TAGS = 4;
  const visibleTags = allTags.slice(0, MAX_TAGS);
  const overflowCount = allTags.length - visibleTags.length;
  const matchedSet = new Set(
    skillMatch ? skillMatch.matchedSkills.map((s) => s.toLowerCase()) : []
  );

  return (
    <Card className={`group relative transition-all duration-300 hover:shadow-md ${
      isFeatured ? "border-primary/50 shadow-sm ring-1 ring-primary/10" : ""
    }`}>
      {isFeatured && (
        <div className="absolute -top-px -left-px -right-px h-1 bg-gradient-to-r from-primary to-accent rounded-t-xl" />
      )}
      
      <Link href={`/jobs/${job.id}`} className="absolute inset-0 z-10" aria-label={`View details for ${job.title}`}>
        <span className="sr-only">View job details</span>
      </Link>
      
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-4 items-start">
          {job.companyId ? (
            <Link
              href={`/companies/${job.companyId}`}
              className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 border border-border/50 overflow-hidden relative z-20 bg-white hover:ring-2 hover:ring-primary/30 transition-shadow"
              aria-label={`View ${job.companyName} profile`}
              onClick={(e) => e.stopPropagation()}
            >
              {job.companyLogo ? (
                <img src={job.companyLogo} alt={`${job.companyName} logo`} className="h-full w-full object-contain p-1" />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground" />
              )}
            </Link>
          ) : (
            <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 border border-border/50 overflow-hidden relative z-20 bg-white">
              {job.companyLogo ? (
                <img src={job.companyLogo} alt={`${job.companyName} logo`} className="h-full w-full object-contain p-1" />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-1">{job.title}</h3>
              {isFeatured && (
                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 font-medium text-xs py-0 h-5">
                  Featured
                </Badge>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground mb-3">
              <div className="flex items-center gap-1.5 font-medium text-foreground/80">
                <Building2 className="h-4 w-4" />
                {job.companyName}
              </div>
              
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span className="capitalize">{job.jobType.replace('-', ' ')}</span>
              </div>
              
              {(job.salaryMin || job.salaryMax) && (
                <div className="flex items-center gap-1.5 text-foreground/70">
                  <DollarSign className="h-4 w-4" />
                  <span>
                    {job.salaryMin ? `${job.salaryMin / 1000}k` : ''}
                    {job.salaryMin && job.salaryMax ? ' - ' : ''}
                    {job.salaryMax ? `${job.salaryMax / 1000}k` : ''} {job.salaryCurrency}
                  </span>
                </div>
              )}
            </div>

            {visibleTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mb-3 relative z-20">
                {visibleTags.map((tag, idx) => {
                  const isMatched = matchedSet.has(tag.toLowerCase());
                  return (
                    <Badge
                      key={`${tag}-${idx}`}
                      variant="secondary"
                      className={
                        isMatched
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs px-2 py-0"
                          : "bg-muted text-muted-foreground text-xs px-2 py-0"
                      }
                    >
                      {tag}
                    </Badge>
                  );
                })}
                {overflowCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    +{overflowCount} more
                  </span>
                )}
              </div>
            )}
            
            <div className="flex flex-wrap items-center gap-2 relative z-20">
              {isCaribbeanFriendly && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200 gap-1 px-2.5">
                  <Palmtree className="h-3 w-3" />
                  Caribbean Friendly
                </Badge>
              )}
              
              <Badge variant="outline" className="bg-background text-muted-foreground">
                {job.category}
              </Badge>

              {skillMatch && (
                <SkillMatchBadge match={skillMatch} />
              )}
              
              {job.locationRestrictions && job.locationRestrictions !== 'Anywhere' && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto bg-muted/50 px-2 py-1 rounded-md">
                  <MapPin className="h-3 w-3" />
                  <span className="max-w-[120px] truncate" title={job.locationRestrictions}>{job.locationRestrictions}</span>
                </div>
              )}
              
              <div className="text-xs text-muted-foreground ml-auto md:ml-0 md:pl-2">
                {formatDistanceToNow(new Date(job.postedAt), { addSuffix: true })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
