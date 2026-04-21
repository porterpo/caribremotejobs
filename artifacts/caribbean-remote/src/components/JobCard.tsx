import { Link } from "wouter";
import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Building2, MapPin, DollarSign, Clock, Palmtree, ShieldCheck, X, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import type { Job } from "@workspace/api-client-react";
import { computeSkillMatch } from "@/lib/skill-match";
import { SkillMatchBadge } from "@/components/SkillMatchBadge";

const LONG_PRESS_MS = 500;

function SkillBadgeTooltip({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function toggleOpen() {
    clearTimer();
    setOpen((current) => !current);
  }

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          className="inline-flex"
          tabIndex={0}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onTouchStart={() => {
            clearTimer();
            timerRef.current = setTimeout(() => setOpen(true), LONG_PRESS_MS);
          }}
          onTouchEnd={() => {
            const touchStart = touchStartRef.current;
            touchStartRef.current = null;
            clearTimer();
            if (!touchStart) return;
          }}
          onTouchMove={() => {
            touchStartRef.current = null;
            clearTimer();
            setOpen(false);
          }}
          onClick={() => {
            if (window.matchMedia("(pointer: coarse)").matches) {
              toggleOpen();
            }
          }}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface JobCardProps {
  job: Job;
  isBestMatch?: boolean;
  onTagClick?: (tag: string) => void;
  selectedTags?: string[];
}

export function JobCard({ job, isBestMatch = false, onTagClick, selectedTags }: JobCardProps) {
  const isFeatured = job.featured;
  const isCaribbeanFriendly = job.caribbeanFriendly;
  const isVerifiedEmployer = job.verifiedEmployer;
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
  const matchedSet = new Set(
    skillMatch ? skillMatch.matchedSkills.map((s) => s.toLowerCase()) : []
  );
  const activeSet = new Set(
    selectedTags ? selectedTags.map((s) => s.toLowerCase()) : []
  );
  const appliedRecord = (() => {
    try {
      const records = JSON.parse(localStorage.getItem("cr_applied_jobs") ?? "{}") as Record<string, { resumeType?: "built" | "pdf" | "none"; appliedAt?: string }>;
      return records[String(job.id)] ?? null;
    } catch {
      return null;
    }
  })();

  // Promote any active filter tags that would be hidden in overflow
  const activeOverflowTags = allTags.slice(MAX_TAGS).filter((t) => activeSet.has(t.toLowerCase()));
  let visibleTags: string[];
  if (activeOverflowTags.length === 0) {
    visibleTags = allTags.slice(0, MAX_TAGS);
  } else {
    const promoted = allTags.slice(0, MAX_TAGS);
    let slotIdx = promoted.length - 1;
    for (const activeTag of activeOverflowTags) {
      // Find the last non-active visible tag to displace
      while (slotIdx >= 0 && activeSet.has(promoted[slotIdx].toLowerCase())) {
        slotIdx--;
      }
      if (slotIdx >= 0) {
        promoted[slotIdx] = activeTag;
        slotIdx--;
      } else {
        break;
      }
    }
    visibleTags = promoted;
  }
  const overflowCount = allTags.length - visibleTags.length;
  // Use index-based tracking so duplicate tag values are handled correctly
  const hiddenTagIndices = new Set(allTags.map((_, i) => i));
  for (const vTag of visibleTags) {
    for (const [i, t] of allTags.entries()) {
      if (t === vTag && hiddenTagIndices.has(i)) {
        hiddenTagIndices.delete(i);
        break;
      }
    }
  }
  const hiddenTags = allTags.filter((_, i) => hiddenTagIndices.has(i));
  const hiddenMatchedCount = hiddenTags.filter((tag) => matchedSet.has(tag.toLowerCase())).length;

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
              <TooltipProvider delayDuration={300}>
                <div className="flex flex-wrap items-center gap-1.5 mb-3 relative z-20">
                  {visibleTags.map((tag, idx) => {
                    const isMatched = matchedSet.has(tag.toLowerCase());
                    const isActive = activeSet.has(tag.toLowerCase());
                    const tooltipLabel = isActive
                      ? onTagClick ? "Click to remove filter" : "Active filter"
                      : isMatched
                      ? "Matches your resume"
                      : "Required skill";
                    const badgeContent = (
                      <Badge
                        variant="secondary"
                        className={
                          isActive
                            ? "group/tag bg-primary text-primary-foreground border border-primary text-xs px-2 py-0 cursor-pointer hover:bg-primary/80 transition-colors inline-flex items-center gap-1"
                            : isMatched
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs px-2 py-0 cursor-pointer hover:bg-emerald-200 transition-colors"
                            : "bg-muted text-muted-foreground text-xs px-2 py-0 cursor-pointer hover:bg-muted/70 transition-colors"
                        }
                        {...(onTagClick
                          ? {
                              onClick: (e: React.MouseEvent) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onTagClick(tag);
                              },
                            }
                          : {})}
                      >
                        {tag}
                        {isActive && onTagClick && (
                          <X className="h-3 w-3 opacity-0 group-hover/tag:opacity-100 transition-opacity shrink-0" />
                        )}
                      </Badge>
                    );
                    return (
                      <SkillBadgeTooltip
                        key={`${tag}-${idx}`}
                        label={tooltipLabel}
                      >
                        {onTagClick ? (
                          badgeContent
                        ) : (
                          <Link
                            href={`/jobs/tag/${encodeURIComponent(tag)}`}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            {badgeContent}
                          </Link>
                        )}
                      </SkillBadgeTooltip>
                    );
                  })}
                  {overflowCount > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          className={[
                            "text-xs underline-offset-2 hover:underline cursor-pointer select-none focus:outline-none",
                            hiddenMatchedCount > 0 ? "text-emerald-700 font-medium" : "text-primary",
                          ].join(" ")}
                        >
                          +{overflowCount} more
                          {hiddenMatchedCount > 0 && (
                            <span className="ml-1">
                              ({hiddenMatchedCount} match{hiddenMatchedCount === 1 ? "" : "es"})
                            </span>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-auto max-w-[260px] p-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-xs font-medium text-muted-foreground mb-2">More skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {hiddenTags.map((tag, i) => {
                            const isMatched = matchedSet.has(tag.toLowerCase());
                            const badgeEl = (
                              <Badge
                                key={`hidden-${tag}-${i}`}
                                variant="secondary"
                                className={
                                  isMatched
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs px-2 py-0 hover:bg-emerald-200 transition-colors"
                                    : "bg-muted text-muted-foreground text-xs px-2 py-0 hover:bg-muted/70 transition-colors"
                                }
                              >
                                {tag}
                              </Badge>
                            );
                            if (onTagClick) {
                              return (
                                <button
                                  key={`hidden-btn-${tag}-${i}`}
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagClick(tag); }}
                                >
                                  {badgeEl}
                                </button>
                              );
                            }
                            return (
                              <Link
                                key={`hidden-link-${tag}-${i}`}
                                href={`/jobs/tag/${encodeURIComponent(tag)}`}
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                              >
                                {badgeEl}
                              </Link>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </TooltipProvider>
            )}
            
            <div className="flex flex-wrap items-center gap-2 relative z-20">
              {appliedRecord && (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200 gap-1 px-2.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Applied
                </Badge>
              )}
              {isVerifiedEmployer && (
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200 gap-1 px-2.5">
                  <ShieldCheck className="h-3 w-3" />
                  Verified Employer
                </Badge>
              )}
              {isCaribbeanFriendly && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200 gap-1 px-2.5">
                  <Palmtree className="h-3 w-3" />
                  Caribbean Friendly
                </Badge>
              )}
              
              <Badge variant="outline" className="bg-background text-muted-foreground">
                {job.category}
              </Badge>

              {skillMatch && skillMatch.percentage > 0 && (
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
