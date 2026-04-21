import { useState } from "react";
import { useRoute, Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { useGetJob, getGetJobQueryKey, useListJobs } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Building2, MapPin, DollarSign, Clock, Calendar, ArrowLeft, ExternalLink, Palmtree, BellRing, FileText, ChevronRight, Loader2, Sparkles, Copy, Check } from "lucide-react";
import { computeSkillMatch } from "@/lib/skill-match";
import { track } from "@/lib/analytics";
import { SkillMatchBadge } from "@/components/SkillMatchBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow, format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { JobCard } from "@/components/JobCard";

const BASE = import.meta.env.BASE_URL;

interface ResumeData {
  id: number;
  summary: string | null;
  experience: Array<{
    id: string;
    title: string;
    company: string;
    startDate: string;
    endDate: string | null;
    description: string;
  }> | null;
  education: Array<{
    id: string;
    degree: string;
    institution: string;
    graduationYear: string;
  }> | null;
  skills: string[] | null;
}

export function buildMailtoPreview(
  jobTitle: string,
  userName: string,
  resume: ResumeData | null,
): { subject: string; body: string } {
  const subject = `Application for ${jobTitle} — ${userName}`;

  const lines: string[] = [];

  lines.push(`Hi,`);
  lines.push(``);
  lines.push(
    `I'm writing to apply for the ${jobTitle} position. Please find a brief summary of my background below.`,
  );

  if (resume?.summary) {
    lines.push(``);
    lines.push(`About me:`);
    lines.push(resume.summary);
  }

  if (resume?.skills && resume.skills.length > 0) {
    lines.push(``);
    lines.push(`Top skills:`);
    lines.push(resume.skills.slice(0, 10).join(", "));
  }

  if (resume?.experience && resume.experience.length > 0) {
    lines.push(``);
    lines.push(`Recent experience:`);
    resume.experience.slice(0, 3).forEach((exp) => {
      const end = exp.endDate ?? "Present";
      lines.push(`• ${exp.title} at ${exp.company} (${exp.startDate} – ${end})`);
    });
  }

  if (resume?.education && resume.education.length > 0) {
    lines.push(``);
    lines.push(`Education:`);
    resume.education.slice(0, 2).forEach((edu) => {
      lines.push(`• ${edu.degree}, ${edu.institution} (${edu.graduationYear})`);
    });
  }

  const profileUrl =
    window.location.origin + BASE.replace(/\/$/, "") + "/resume";
  lines.push(``);
  lines.push(`You can view my full profile here: ${profileUrl}`);
  lines.push(``);
  lines.push(`Thank you for your consideration.`);
  lines.push(`${userName}`);

  return { subject, body: lines.join("\n") };
}

export function buildEnhancedMailto(
  applyUrl: string,
  jobTitle: string,
  userName: string,
  resume: ResumeData | null,
): string {
  if (!applyUrl.startsWith("mailto:")) return applyUrl;

  const { subject, body } = buildMailtoPreview(jobTitle, userName, resume);

  const qIdx = applyUrl.indexOf("?");
  const base = qIdx === -1 ? applyUrl : applyUrl.slice(0, qIdx);
  const existing = qIdx === -1 ? "" : applyUrl.slice(qIdx + 1);
  const params = new URLSearchParams(existing);
  params.set("subject", subject);
  params.set("body", body);
  return base + "?" + params.toString();
}

function MailtoPreviewDialog({
  open,
  onClose,
  applyUrl,
  subject,
  body,
}: {
  open: boolean;
  onClose: () => void;
  applyUrl: string;
  subject: string;
  body: string;
}) {
  const [copied, setCopied] = useState<"idle" | "done" | "error">("idle");

  function handleCopy() {
    const text = `Subject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied("done");
      setTimeout(() => setCopied("idle"), 2000);
    }).catch(() => {
      setCopied("error");
      setTimeout(() => setCopied("idle"), 2500);
    });
  }

  function handleClose() {
    setCopied("idle");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email preview</DialogTitle>
          <DialogDescription>
            This is what will be pre-filled when your mail client opens. You can edit it before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Subject
            </p>
            <p className="text-sm bg-muted rounded-md px-3 py-2">{subject}</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Body
              </p>
              <span className={`text-xs tabular-nums ${body.length > 1800 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                {body.length.toLocaleString()} chars
              </span>
            </div>
            <pre className="text-sm bg-muted rounded-md px-3 py-2 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
              {body}
            </pre>
          </div>

          {body.length > 1800 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Your email body is over 1,800 characters. Some mail clients may truncate long bodies — consider trimming your resume before sending.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Your mail client may reformat the text slightly.
          </p>

          <div className="pt-2 border-t flex gap-2 flex-wrap">
            <Button className="flex-1" asChild onClick={handleClose}>
              <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                Open Mail Client <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            </Button>
            <Button variant="outline" onClick={handleCopy} className="flex-1">
              {copied === "done" ? (
                <>Copied <Check className="h-4 w-4 ml-2" /></>
              ) : copied === "error" ? (
                <>Copy failed — try manually</>
              ) : (
                <>Copy email text <Copy className="h-4 w-4 ml-2" /></>
              )}
            </Button>
            <Button variant="outline" asChild onClick={handleClose}>
              <Link href="/resume">Edit Resume</Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApplyWithResumeDialog({
  open,
  onClose,
  applyUrl,
  jobTitle,
  onShowPreview,
}: {
  open: boolean;
  onClose: () => void;
  applyUrl: string;
  jobTitle: string;
  onShowPreview?: () => void;
}) {
  const { data: resume, status } = useQuery<ResumeData | null>({
    queryKey: ["resume", "me"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/resume/me`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch resume");
      return res.json() as Promise<ResumeData>;
    },
    staleTime: 30_000,
    retry: false,
  });

  const isLoading = status === "pending";
  const hasResume = status === "success" && resume !== null;
  const noResume = status === "success" && resume === null;
  const hasError = status === "error";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply for {jobTitle}</DialogTitle>
          <DialogDescription>
            {hasResume
              ? "Review your resume before heading to the application."
              : "Add a resume to stand out when applying."}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-6 bg-muted rounded animate-pulse" />
            ))}
          </div>
        )}

        {hasError && (
          <div className="py-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Unable to load your resume. You can still apply directly.
            </p>
            <Button asChild onClick={onClose}>
              <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                Apply Now <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </div>
        )}

        {noResume && (
          <div className="py-6 text-center space-y-4">
            <div className="h-14 w-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <FileText className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="font-semibold mb-1">No resume yet</p>
              <p className="text-sm text-muted-foreground">
                Build your CaribbeanRemote resume once and attach it to every application.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild onClick={onClose}>
                <Link href="/resume">Build my Resume <ChevronRight className="h-4 w-4 ml-1" /></Link>
              </Button>
              <Button variant="ghost" asChild onClick={onClose}>
                <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                  Apply without resume <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </a>
              </Button>
            </div>
          </div>
        )}

        {hasResume && resume && (
          <div className="space-y-5 py-2">
            {resume.summary && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Summary
                </h4>
                <p className="text-sm leading-relaxed">{resume.summary}</p>
              </section>
            )}

            {resume.experience && resume.experience.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Experience
                </h4>
                <div className="space-y-3">
                  {resume.experience.map((exp) => (
                    <div key={exp.id} className="text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{exp.title}</span>
                        <span className="text-muted-foreground text-xs shrink-0">
                          {exp.startDate} – {exp.endDate ?? "Present"}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{exp.company}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {resume.education && resume.education.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Education
                </h4>
                <div className="space-y-2">
                  {resume.education.map((edu) => (
                    <div key={edu.id} className="text-sm flex justify-between gap-2">
                      <div>
                        <span className="font-medium">{edu.degree}</span>
                        <span className="text-muted-foreground"> · {edu.institution}</span>
                      </div>
                      {edu.graduationYear && (
                        <span className="text-muted-foreground text-xs shrink-0">
                          {edu.graduationYear}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {resume.skills && resume.skills.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Skills
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {resume.skills.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            <div className="pt-3 border-t flex gap-2">
              {onShowPreview ? (
                <Button className="flex-1" onClick={onShowPreview}>
                  Apply Now <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button className="flex-1" asChild onClick={onClose}>
                  <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                    Apply Now <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/resume" onClick={onClose}>Edit Resume</Link>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function JobDetail() {
  const [, params] = useRoute("/jobs/:id");
  const jobId = parseInt(params?.id || "0", 10);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const { isSignedIn, user } = useUser();

  const { data: job, isLoading, error } = useGetJob(jobId, {
    query: { enabled: !!jobId, queryKey: getGetJobQueryKey(jobId) }
  });

  const isMailto = !!job?.applyUrl?.startsWith("mailto:");

  const { data: resume, status: resumeStatus } = useQuery<ResumeData | null>({
    queryKey: ["resume", "me"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/resume/me`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch resume");
      return res.json() as Promise<ResumeData>;
    },
    staleTime: 30_000,
    retry: false,
    enabled: !!isSignedIn,
  });

  const isResumePending = isSignedIn && isMailto && resumeStatus === "pending";

  const userName = user?.fullName || user?.firstName || "Applicant";

  const effectiveApplyUrl =
    isSignedIn && isMailto && job && resume
      ? buildEnhancedMailto(job.applyUrl, job.title, userName, resume)
      : job?.applyUrl ?? "";

  const showPreviewOnApply = isSignedIn && isMailto && !!resume;

  const mailtoPreview =
    showPreviewOnApply && job
      ? buildMailtoPreview(job.title, userName, resume)
      : null;

  const { data: similarJobsResponse } = useListJobs(
    { category: job?.category, limit: 3 },
    { query: { enabled: !!job?.category, queryKey: ["/api/jobs", { category: job?.category, limit: 3 }] } }
  );

  const similarJobs = similarJobsResponse?.jobs.filter(j => j.id !== jobId) || [];

  const skillMatch =
    isSignedIn && resume?.skills && resume.skills.length > 0 && job?.tags
      ? computeSkillMatch(resume.skills, job.tags)
      : null;

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
      {job && (
        <ApplyWithResumeDialog
          open={applyDialogOpen}
          onClose={() => setApplyDialogOpen(false)}
          applyUrl={effectiveApplyUrl}
          jobTitle={job.title}
          onShowPreview={showPreviewOnApply ? () => { setApplyDialogOpen(false); setPreviewDialogOpen(true); } : undefined}
        />
      )}
      {job && mailtoPreview && (
        <MailtoPreviewDialog
          open={previewDialogOpen}
          onClose={() => setPreviewDialogOpen(false)}
          applyUrl={effectiveApplyUrl}
          subject={mailtoPreview.subject}
          body={mailtoPreview.body}
        />
      )}

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
              {showPreviewOnApply ? (
                <Button
                  size="lg"
                  className="w-full text-base h-12"
                  onClick={() => { track("application_started", { job_id: jobId }); setPreviewDialogOpen(true); }}
                >
                  Apply Now <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button size="lg" className="w-full text-base h-12" disabled={isResumePending} asChild={!isResumePending}>
                  {isResumePending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Apply Now
                    </>
                  ) : (
                    <a href={effectiveApplyUrl} target="_blank" rel="noopener noreferrer" onClick={() => track("application_started", { job_id: jobId })}>
                      Apply Now <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  )}
                </Button>
              )}
              {isSignedIn && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => { track("application_started", { job_id: jobId }); setApplyDialogOpen(true); }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Apply with Resume
                </Button>
              )}
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
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h3 className="text-lg font-semibold">Skills & Requirements</h3>
                  {skillMatch && (
                    <SkillMatchBadge match={skillMatch} size="md" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <TooltipProvider>
                    {job.tags.split(',').map(tag => {
                      const isMatched = skillMatch?.matchedSkills.includes(tag.trim());
                      const tooltipText = isMatched ? "Matches your resume" : "Required skill";
                      return (
                        <Tooltip key={tag}>
                          <TooltipTrigger asChild>
                            <Link
                              href={`/jobs/tag/${encodeURIComponent(tag.trim())}`}
                              className="no-underline"
                            >
                              <Badge
                                variant="secondary"
                                className={`font-normal text-sm px-3 py-1 cursor-pointer transition-colors ${isMatched ? "bg-green-100 text-green-800 hover:bg-green-200 border border-green-200" : "hover:bg-muted/70"}`}
                              >
                                {tag.trim()}
                              </Badge>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            {tooltipText}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </TooltipProvider>
                </div>
                {skillMatch && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Highlighted skills match your resume.
                  </p>
                )}
                {isSignedIn && resumeStatus === "success" && (!resume || !resume.skills || resume.skills.length === 0) && (
                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-foreground">
                      <Link
                        href="/resume"
                        className="font-medium text-primary hover:underline"
                        onClick={() =>
                          track("skills_nudge_clicked", {
                            job_id: jobId,
                            has_resume: !!resume,
                          })
                        }
                      >
                        Add skills to your resume
                      </Link>{" "}
                      to see how well you match this job.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-8 border-t flex flex-wrap gap-3">
              {showPreviewOnApply ? (
                <Button
                  size="lg"
                  className="px-8"
                  onClick={() => { track("application_started", { job_id: jobId }); setPreviewDialogOpen(true); }}
                >
                  Apply for this position <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button size="lg" className="px-8" disabled={isResumePending} asChild={!isResumePending}>
                  {isResumePending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Apply for this position
                    </>
                  ) : (
                    <a href={effectiveApplyUrl} target="_blank" rel="noopener noreferrer" onClick={() => track("application_started", { job_id: jobId })}>
                      Apply for this position <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  )}
                </Button>
              )}
              {isSignedIn && (
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8"
                  onClick={() => { track("application_started", { job_id: jobId }); setApplyDialogOpen(true); }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Apply with Resume
                </Button>
              )}
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
