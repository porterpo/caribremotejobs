import { useState, useEffect } from "react";
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from "@/lib/meta";
import { useRoute, Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { useGetJob, getGetJobQueryKey, useListJobs } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Building2, MapPin, DollarSign, Clock, Calendar, ArrowLeft, ExternalLink, Palmtree, BellRing, FileText, ChevronRight, Loader2, Sparkles, Copy, Check, Upload, CheckCircle2 } from "lucide-react";
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
  uploadedResumePath: string | null;
  shareToken: string | null;
}

// ─── Application history (localStorage) ────────────────────────────────────

type ResumeType = "built" | "pdf" | "none";

interface ApplicationRecord {
  resumeType: ResumeType;
  appliedAt: string;
}

function loadApplicationRecords(): Record<string, ApplicationRecord> {
  try {
    return JSON.parse(localStorage.getItem("cr_applied_jobs") ?? "{}") as Record<string, ApplicationRecord>;
  } catch {
    return {};
  }
}

function saveApplicationRecord(jobId: number, resumeType: ResumeType) {
  try {
    const records = loadApplicationRecords();
    records[String(jobId)] = { resumeType, appliedAt: new Date().toISOString() };
    localStorage.setItem("cr_applied_jobs", JSON.stringify(records));
  } catch {
    // ignore storage errors
  }
}

function getApplicationRecord(jobId: number): ApplicationRecord | null {
  return loadApplicationRecords()[String(jobId)] ?? null;
}

// ─── Email builders ─────────────────────────────────────────────────────────

function buildMailtoPreview(
  jobTitle: string,
  userName: string,
  resume: ResumeData | null,
  pdfDownloadUrl?: string | null,
  shareUrl?: string | null,
): { subject: string; body: string } {
  const subject = `Application for ${jobTitle} — ${userName}`;

  const lines: string[] = [];

  lines.push(`Hi,`);
  lines.push(``);
  lines.push(
    `I'm writing to apply for the ${jobTitle} position. Please find a brief summary of my background below.`,
  );

  if (pdfDownloadUrl) {
    lines.push(``);
    lines.push(`My resume (PDF):`);
    lines.push(pdfDownloadUrl);
    if (shareUrl) {
      lines.push(``);
      lines.push(`Permanent resume link (no expiry):`);
      lines.push(shareUrl);
    }
  } else {
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

    if (shareUrl) {
      lines.push(``);
      lines.push(`My resume PDF (permanent link):`);
      lines.push(shareUrl);
    }
  }

  lines.push(``);
  lines.push(`Thank you for your consideration.`);
  lines.push(`${userName}`);

  return { subject, body: lines.join("\n") };
}

function buildEnhancedMailto(
  applyUrl: string,
  jobTitle: string,
  userName: string,
  resume: ResumeData | null,
  pdfDownloadUrl?: string | null,
  shareUrl?: string | null,
): string {
  if (!applyUrl.startsWith("mailto:")) return applyUrl;

  const { subject, body } = buildMailtoPreview(jobTitle, userName, resume, pdfDownloadUrl, shareUrl);

  const qIdx = applyUrl.indexOf("?");
  const base = qIdx === -1 ? applyUrl : applyUrl.slice(0, qIdx);
  const existing = qIdx === -1 ? "" : applyUrl.slice(qIdx + 1);
  const params = new URLSearchParams(existing);
  params.set("subject", subject);
  params.set("body", body);
  return base + "?" + params.toString();
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

function MailtoPreviewDialog({
  open,
  onClose,
  applyUrl,
  subject,
  body,
  onMailClientOpened,
}: {
  open: boolean;
  onClose: () => void;
  applyUrl: string;
  subject: string;
  body: string;
  onMailClientOpened?: () => void;
}) {
  const [copied, setCopied] = useState<"idle" | "done" | "error">("idle");
  const [copiedSubject, setCopiedSubject] = useState<"idle" | "done">("idle");

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

  function handleCopySubject() {
    navigator.clipboard.writeText(subject).then(() => {
      setCopiedSubject("done");
      setTimeout(() => setCopiedSubject("idle"), 2000);
    }).catch(() => {});
  }

  function handleClose() {
    setCopied("idle");
    setCopiedSubject("idle");
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
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Subject
              </p>
              <button
                type="button"
                onClick={handleCopySubject}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copy subject line"
              >
                {copiedSubject === "done" ? (
                  <><Check className="h-3 w-3" /> Copied</>
                ) : (
                  <><Copy className="h-3 w-3" /> Copy</>
                )}
              </button>
            </div>
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
            <Button className="flex-1" asChild onClick={() => { onMailClientOpened?.(); handleClose(); }}>
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
  onShowPreview?: (pdfDownloadUrl: string | null) => void;
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

  const hasBuiltResume =
    status === "success" &&
    resume !== null &&
    !!(resume.summary || (resume.experience?.length ?? 0) > 0 || (resume.education?.length ?? 0) > 0 || (resume.skills?.length ?? 0) > 0);
  const hasPdfResume = status === "success" && resume !== null && !!resume.uploadedResumePath;
  const hasBoth = hasBuiltResume && hasPdfResume;

  const [selectedType, setSelectedType] = useState<"built" | "pdf">("built");
  const [fetchingPdfLink, setFetchingPdfLink] = useState(false);

  useEffect(() => {
    if (hasPdfResume && !hasBuiltResume) setSelectedType("pdf");
    else setSelectedType("built");
  }, [hasPdfResume, hasBuiltResume]);

  const isLoading = status === "pending";
  const hasResume = status === "success" && resume !== null && (hasBuiltResume || hasPdfResume);
  const noResume = status === "success" && !hasResume;
  const hasError = status === "error";

  const handleApplyNow = async () => {
    if (selectedType === "pdf" && hasPdfResume && onShowPreview) {
      setFetchingPdfLink(true);
      try {
        const res = await fetch(`${BASE}api/resume/pdf-link`);
        if (!res.ok) throw new Error("Failed to get PDF link");
        const { url } = await res.json() as { url: string };
        onShowPreview(url);
      } catch {
        onShowPreview(null);
      } finally {
        setFetchingPdfLink(false);
      }
    } else if (onShowPreview) {
      onShowPreview(null);
    }
  };

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
                Build your CaribbeanRemote resume or upload a PDF — then attach it to every application.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild onClick={onClose}>
                <Link href="/resume">Build or Upload Resume <ChevronRight className="h-4 w-4 ml-1" /></Link>
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
            {hasBoth && (
              <div className="flex gap-1 p-1 bg-muted rounded-lg">
                <button
                  type="button"
                  onClick={() => setSelectedType("built")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedType === "built"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Built Resume
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType("pdf")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedType === "pdf"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  Uploaded PDF
                </button>
              </div>
            )}

            {selectedType === "pdf" && hasPdfResume ? (
              <div className="rounded-lg border bg-card p-5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Your uploaded PDF resume</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      A download link will be included in the application email.
                      {resume.shareToken && " Your permanent share link will also be included."}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}

            <div className="pt-3 border-t flex gap-2">
              {onShowPreview ? (
                <Button className="flex-1" onClick={handleApplyNow} disabled={fetchingPdfLink}>
                  {fetchingPdfLink ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing…</>
                  ) : (
                    <>Apply Now <ExternalLink className="h-4 w-4 ml-2" /></>
                  )}
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
  const [pendingPdfUrl, setPendingPdfUrl] = useState<string | null>(null);
  const [pendingResumeType, setPendingResumeType] = useState<ResumeType>("none");
  const [isPrimaryFetchingPdf, setIsPrimaryFetchingPdf] = useState(false);
  const [linkCopied, setLinkCopied] = useState<"idle" | "done" | "error">("idle");

  // Track last application record from localStorage
  const [appliedRecord, setAppliedRecord] = useState<ApplicationRecord | null>(
    () => (jobId ? getApplicationRecord(jobId) : null)
  );

  function getJobUrl() {
    return window.location.origin + BASE.replace(/\/$/, "") + `/jobs/${jobId}`;
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(getJobUrl()).then(() => {
      setLinkCopied("done");
      setTimeout(() => setLinkCopied("idle"), 2000);
    }).catch(() => {
      setLinkCopied("error");
      setTimeout(() => setLinkCopied("idle"), 2500);
    });
  }

  const { isSignedIn, user } = useUser();

  const { data: job, isLoading, error } = useGetJob(jobId, {
    query: { enabled: !!jobId, queryKey: getGetJobQueryKey(jobId) }
  });

  function handleShareTwitter() {
    const url = getJobUrl();
    const title = job?.title ? `${job.title} at ${job.companyName}` : "Check out this remote job";
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
    track("job_shared", { platform: "x", job_id: jobId });
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  function handleShareLinkedIn() {
    const url = getJobUrl();
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    track("job_shared", { platform: "linkedin", job_id: jobId });
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  function handleShareWhatsApp() {
    const url = getJobUrl();
    const title = job?.title ? `${job.title} at ${job.companyName}` : "Check out this remote job";
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;
    track("job_shared", { platform: "whatsapp", job_id: jobId });
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

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

  // Permanent share URL derived from resume shareToken
  const resumeShareUrl = resume?.shareToken
    ? `${window.location.origin}${BASE}api/resume/shared/${resume.shareToken}`
    : null;

  const effectiveApplyUrl =
    isSignedIn && isMailto && job && resume
      ? buildEnhancedMailto(job.applyUrl, job.title, userName, resume, pendingPdfUrl, resumeShareUrl)
      : job?.applyUrl ?? "";

  const showPreviewOnApply = isSignedIn && isMailto && !!resume && !!(
    resume.summary ||
    (resume.experience?.length ?? 0) > 0 ||
    (resume.education?.length ?? 0) > 0 ||
    (resume.skills?.length ?? 0) > 0 ||
    resume.uploadedResumePath
  );

  const mailtoPreview =
    showPreviewOnApply && job
      ? buildMailtoPreview(job.title, userName, resume, pendingPdfUrl, resumeShareUrl)
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

  const missingSkills =
    skillMatch && job?.tags
      ? job.tags.split(',').map(t => t.trim()).filter(tag => tag && !skillMatch.matchedSkills.includes(tag))
      : [];

  useEffect(() => {
    if (!job) return;

    const location = job.locationRestrictions || "Remote";
    const pageTitle = `${job.title} at ${job.companyName} | CaribbeanRemote`;
    const pageDescription = `${job.title} — ${job.companyName} · ${location}. Apply for this remote role on CaribbeanRemote.`;

    const prevTitle = document.title;

    function upsertMeta(key: "name" | "property", keyValue: string, content: string): HTMLMetaElement {
      let el = document.querySelector(`meta[${key}="${keyValue}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(key, keyValue);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
      return el;
    }

    document.title = pageTitle;
    const descEl = upsertMeta("name", "description", pageDescription);
    const ogTitleEl = upsertMeta("property", "og:title", pageTitle);
    const ogDescEl = upsertMeta("property", "og:description", pageDescription);

    return () => {
      document.title = prevTitle;
      descEl.setAttribute("content", DEFAULT_DESCRIPTION);
      ogTitleEl.setAttribute("content", DEFAULT_TITLE);
      ogDescEl.setAttribute("content", DEFAULT_DESCRIPTION);
    };
  }, [job]);

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

  const hasPdfOnly =
    !!resume?.uploadedResumePath &&
    !resume.summary &&
    !(resume.experience?.length) &&
    !(resume.education?.length) &&
    !(resume.skills?.length);

  async function handlePrimaryApply() {
    track("application_started", { job_id: jobId });
    const resumeType: ResumeType = hasPdfOnly ? "pdf" : (resume ? "built" : "none");
    setPendingResumeType(resumeType);
    if (hasPdfOnly && showPreviewOnApply) {
      setIsPrimaryFetchingPdf(true);
      try {
        const res = await fetch(`${BASE}api/resume/pdf-link`);
        if (res.ok) {
          const { url } = await res.json() as { url: string };
          setPendingPdfUrl(url);
        }
      } catch {
        // proceed without PDF URL
      } finally {
        setIsPrimaryFetchingPdf(false);
      }
    }
    setPreviewDialogOpen(true);
  }

  function handleMailClientOpened() {
    saveApplicationRecord(jobId, pendingResumeType);
    track("application_started", { job_id: jobId, resume_type: pendingResumeType });
    setAppliedRecord({ resumeType: pendingResumeType, appliedAt: new Date().toISOString() });
  }

  function handleDirectApply(resumeType: ResumeType = "none") {
    track("application_started", { job_id: jobId, resume_type: resumeType });
    saveApplicationRecord(jobId, resumeType);
    setAppliedRecord({ resumeType, appliedAt: new Date().toISOString() });
  }

  const resumeTypeLabel: Record<ResumeType, string> = {
    built: "Built Resume",
    pdf: "PDF Resume",
    none: "Resume",
  };

  return (
    <PageLayout>
      {isSignedIn && job && (
        <ApplyWithResumeDialog
          open={applyDialogOpen}
          onClose={() => setApplyDialogOpen(false)}
          applyUrl={effectiveApplyUrl}
          jobTitle={job.title}
          onShowPreview={showPreviewOnApply ? (pdfUrl) => {
            const rt: ResumeType = pdfUrl !== null ? "pdf" : "built";
            setPendingPdfUrl(pdfUrl);
            setPendingResumeType(rt);
            setApplyDialogOpen(false);
            setPreviewDialogOpen(true);
          } : undefined}
        />
      )}
      {isSignedIn && job && mailtoPreview && (
        <MailtoPreviewDialog
          open={previewDialogOpen}
          onClose={() => { setPreviewDialogOpen(false); setPendingPdfUrl(null); }}
          applyUrl={buildEnhancedMailto(job.applyUrl, job.title, userName, resume ?? null, pendingPdfUrl, resumeShareUrl)}
          subject={buildMailtoPreview(job.title, userName, resume ?? null, pendingPdfUrl, resumeShareUrl).subject}
          body={buildMailtoPreview(job.title, userName, resume ?? null, pendingPdfUrl, resumeShareUrl).body}
          onMailClientOpened={handleMailClientOpened}
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
              {skillMatch && (
                <div className="flex justify-center md:justify-end">
                  <SkillMatchBadge match={skillMatch} size="md" />
                </div>
              )}
              {/* Previously applied indicator */}
              {appliedRecord && (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Applied {formatDistanceToNow(new Date(appliedRecord.appliedAt), { addSuffix: true })}
                    {appliedRecord.resumeType !== "none" && ` · ${resumeTypeLabel[appliedRecord.resumeType]}`}
                  </span>
                </div>
              )}
              {showPreviewOnApply ? (
                <Button
                  size="lg"
                  className="w-full text-base h-12"
                  onClick={() => void handlePrimaryApply()}
                  disabled={isPrimaryFetchingPdf}
                >
                  {isPrimaryFetchingPdf
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Apply Now</>
                    : <>Apply Now <ExternalLink className="ml-2 h-4 w-4" /></>
                  }
                </Button>
              ) : (
                <Button size="lg" className="w-full text-base h-12" disabled={isResumePending} asChild={!isResumePending}>
                  {isResumePending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Apply Now
                    </>
                  ) : (
                    <a
                      href={effectiveApplyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleDirectApply(hasPdfOnly ? "pdf" : resume ? "built" : "none")}
                    >
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
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={handleCopyLink}
              >
                {linkCopied === "done" ? (
                  <>
                    <Check className="h-4 w-4 mr-2 text-green-600" />
                    <span className="text-green-600">Link copied!</span>
                  </>
                ) : linkCopied === "error" ? (
                  <>
                    <Copy className="h-4 w-4 mr-2 text-destructive" />
                    <span className="text-destructive">Copy failed</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy link
                  </>
                )}
              </Button>
              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Share:</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleShareTwitter}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-full border bg-background hover:bg-muted transition-colors"
                        aria-label="Share on X (Twitter)"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Share on X</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleShareLinkedIn}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-full border bg-background hover:bg-muted transition-colors"
                        aria-label="Share on LinkedIn"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                        </svg>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Share on LinkedIn</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleShareWhatsApp}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-full border bg-background hover:bg-muted transition-colors"
                        aria-label="Share on WhatsApp"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
                        </svg>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Share on WhatsApp</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
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
                </div>
                <div className="flex flex-wrap gap-2">
                  <TooltipProvider>
                    {job.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => {
                      const isMatched = skillMatch?.matchedSkills.includes(tag);
                      const tooltipText = isMatched ? "Matches your resume" : "Required skill";
                      return (
                        <Tooltip key={tag}>
                          <TooltipTrigger asChild>
                            <Link
                              href={`/jobs/tag/${encodeURIComponent(tag)}`}
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
                {missingSkills.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-2">Skills you're missing</p>
                    <div className="flex flex-wrap gap-1.5">
                      {missingSkills.map(skill => (
                        <span key={skill} className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 px-2.5 py-0.5 text-xs text-amber-900 dark:text-amber-300 font-normal">
                          {skill}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-500 mt-2">
                      Consider adding these to your{" "}
                      <Link href="/resume" className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300" onClick={() => track("missing_skills_resume_clicked", { job_id: jobId })}>
                        resume
                      </Link>
                      {" "}to improve your match.
                    </p>
                  </div>
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
              {/* Previously applied indicator (bottom) */}
              {appliedRecord && (
                <div className="w-full flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    You applied {formatDistanceToNow(new Date(appliedRecord.appliedAt), { addSuffix: true })}
                    {appliedRecord.resumeType !== "none" && ` using your ${resumeTypeLabel[appliedRecord.resumeType]}`}
                  </span>
                </div>
              )}
              {showPreviewOnApply ? (
                <Button
                  size="lg"
                  className="px-8"
                  onClick={() => void handlePrimaryApply()}
                  disabled={isPrimaryFetchingPdf}
                >
                  {isPrimaryFetchingPdf
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing...</>
                    : <>Apply for this position <ExternalLink className="ml-2 h-4 w-4" /></>
                  }
                </Button>
              ) : (
                <Button size="lg" className="px-8" disabled={isResumePending} asChild={!isResumePending}>
                  {isResumePending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Apply for this position
                    </>
                  ) : (
                    <a
                      href={effectiveApplyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleDirectApply(hasPdfOnly ? "pdf" : resume ? "built" : "none")}
                    >
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

            {!isSignedIn && (
              <div className="border rounded-xl p-6 bg-primary/5 border-primary/20 text-center">
                <Palmtree className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-2">Join CaribbeanRemote</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a free account to apply with your resume, set job alerts, and track opportunities.
                </p>
                <Button className="w-full" asChild>
                  <Link href="/sign-up">Create free account</Link>
                </Button>
                <p className="text-xs text-muted-foreground mt-3">
                  Already have an account?{" "}
                  <Link href="/sign-in" className="text-primary hover:underline">Sign in</Link>
                </p>
              </div>
            )}

            {isSignedIn && job?.category && (
              <div className="border rounded-xl p-6 bg-card shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <BellRing className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Get job alerts</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Be the first to know when new {job.category.replace(/-/g, ' ')} jobs are posted.
                </p>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/alerts">Create alert</Link>
                </Button>
              </div>
            )}

            {similarJobs.length > 0 && (
              <div>
                <h3 className="font-semibold text-lg mb-4">Similar Remote Jobs</h3>
                <div className="space-y-3">
                  {similarJobs.map((j) => (
                    <JobCard key={j.id} job={j} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
