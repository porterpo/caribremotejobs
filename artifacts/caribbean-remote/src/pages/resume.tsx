import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { PageLayout } from "@/components/layout/PageLayout";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, X, Download, FileText, Upload, ExternalLink, CheckCircle2, Loader2, RefreshCw, Link2, Link2Off, Copy, Check, AlertTriangle, Briefcase } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

function uuid() {
  return crypto.randomUUID();
}

interface ExperienceEntry {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  description: string;
}

interface EducationEntry {
  id: string;
  degree: string;
  institution: string;
  graduationYear: string;
}

interface ResumeData {
  id: number;
  clerkUserId: string;
  summary: string | null;
  experience: ExperienceEntry[] | null;
  education: EducationEntry[] | null;
  skills: string[] | null;
  uploadedResumePath: string | null;
  shareToken: string | null;
  shareTokenCreatedAt: string | null;
  shareTokenExpiresAt: string | null;
  updatedAt: string;
}

interface FormState {
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
}

const emptyForm: FormState = {
  summary: "",
  experience: [],
  education: [],
  skills: [],
};

function SkillTag({ skill, onRemove }: { skill: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-sm px-3 py-1 rounded-full font-medium">
      {skill}
      <button type="button" onClick={onRemove} className="hover:text-destructive ml-1">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

type AppliedJobRecord = {
  resumeType?: "built" | "pdf" | "none";
  appliedAt?: string;
};

function getAppliedJobRecords(): Record<string, AppliedJobRecord> {
  try {
    return JSON.parse(localStorage.getItem("cr_applied_jobs") ?? "{}") as Record<string, AppliedJobRecord>;
  } catch {
    return {};
  }
}

function getResumeTypeLabel(resumeType?: "built" | "pdf" | "none") {
  if (resumeType === "pdf") return "PDF Resume";
  if (resumeType === "built") return "Built Resume";
  return "Resume";
}

interface ApiApplicationRecord {
  jobId: number;
  jobTitle: string | null;
  companyName: string | null;
  appliedAt: string | null;
  resumeType: "built" | "pdf" | "none" | null;
}

function ApplicationsHistorySection() {
  const { isSignedIn } = useUser();
  const [localRecords, setLocalRecords] = useState<Record<string, AppliedJobRecord>>({});

  useEffect(() => {
    setLocalRecords(getAppliedJobRecords());
  }, []);

  const { data: apiData, isLoading: apiLoading } = useQuery<{ applications: ApiApplicationRecord[] }>({
    queryKey: ["applications-history"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/applications/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 1000 * 60,
  });

  // For signed-in users: use API data merged with localStorage resume type
  // For guests: use localStorage only
  const entries = (() => {
    if (isSignedIn) {
      if (!apiData) return [];
      return apiData.applications.map((row) => {
        const local = localRecords[String(row.jobId)];
        return {
          jobId: String(row.jobId),
          jobTitle: row.jobTitle,
          companyName: row.companyName,
          appliedAt: row.appliedAt ?? local?.appliedAt ?? null,
          resumeType: (local?.resumeType ?? row.resumeType) as "built" | "pdf" | "none" | null | undefined,
        };
      });
    }
    return Object.entries(localRecords)
      .map(([jobId, record]) => ({
        jobId,
        jobTitle: null as string | null,
        companyName: null as string | null,
        appliedAt: record.appliedAt ?? null,
        resumeType: record.resumeType as "built" | "pdf" | "none" | null | undefined,
      }))
      .filter((e) => e.appliedAt)
      .sort((a, b) => new Date(b.appliedAt!).getTime() - new Date(a.appliedAt!).getTime());
  })();

  const isEmpty = entries.length === 0;
  const showLoading = apiLoading && isSignedIn;

  return (
    <section className="border rounded-xl p-6 bg-card space-y-4">
      <div className="flex items-center gap-3">
        <Briefcase className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <h2 className="text-xl font-semibold">Application history</h2>
          <p className="text-sm text-muted-foreground">
            {isSignedIn ? "Synced across all your devices." : "Saved on this device only."}
          </p>
        </div>
      </div>

      {showLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading history…
        </div>
      ) : isEmpty ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>You haven't applied to any jobs yet.</p>
          <p className="mt-1">
            <Link href="/jobs" className="text-primary hover:underline">
              Browse jobs
            </Link>{" "}
            to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
          {entries.map((entry) => (
            <Link
              key={entry.jobId}
              href={`/jobs/${entry.jobId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {entry.jobTitle ?? `Job #${entry.jobId}`}
                </p>
                {entry.companyName && (
                  <p className="text-xs text-muted-foreground">{entry.companyName}</p>
                )}
                {entry.appliedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Applied {new Date(entry.appliedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 shrink-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {getResumeTypeLabel(entry.resumeType ?? undefined)}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ExperienceSection({
  entries,
  onChange,
}: {
  entries: ExperienceEntry[];
  onChange: (entries: ExperienceEntry[]) => void;
}) {
  const update = (id: string, field: keyof ExperienceEntry, value: string | null) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div key={entry.id} className="border rounded-lg p-4 space-y-3 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">
              Position {i + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-7"
              onClick={() => onChange(entries.filter((e) => e.id !== entry.id))}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Job Title</Label>
              <Input
                placeholder="Senior Software Engineer"
                value={entry.title}
                onChange={(e) => update(entry.id, "title", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Company</Label>
              <Input
                placeholder="Acme Corp"
                value={entry.company}
                onChange={(e) => update(entry.id, "company", e.target.value)}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start Date</Label>
              <Input
                placeholder="Jan 2022"
                value={entry.startDate}
                onChange={(e) => update(entry.id, "startDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Date (leave blank for Present)</Label>
              <Input
                placeholder="Present"
                value={entry.endDate ?? ""}
                onChange={(e) =>
                  update(entry.id, "endDate", e.target.value || null)
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Key Responsibilities / Achievements</Label>
            <Textarea
              placeholder="- Led migration of legacy monolith to microservices&#10;- Reduced API latency by 40% through query optimisation"
              rows={3}
              value={entry.description}
              onChange={(e) => update(entry.id, "description", e.target.value)}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...entries,
            { id: uuid(), title: "", company: "", startDate: "", endDate: null, description: "" },
          ])
        }
      >
        <Plus className="h-4 w-4 mr-1" /> Add Position
      </Button>
    </div>
  );
}

function EducationSection({
  entries,
  onChange,
}: {
  entries: EducationEntry[];
  onChange: (entries: EducationEntry[]) => void;
}) {
  const update = (id: string, field: keyof EducationEntry, value: string) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div key={entry.id} className="border rounded-lg p-4 space-y-3 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">
              Education {i + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-7"
              onClick={() => onChange(entries.filter((e) => e.id !== entry.id))}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Degree / Qualification</Label>
              <Input
                placeholder="BSc Computer Science"
                value={entry.degree}
                onChange={(e) => update(entry.id, "degree", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Institution</Label>
              <Input
                placeholder="University of the West Indies"
                value={entry.institution}
                onChange={(e) => update(entry.id, "institution", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1 max-w-[200px]">
            <Label className="text-xs">Graduation Year</Label>
            <Input
              placeholder="2020"
              value={entry.graduationYear}
              onChange={(e) => update(entry.id, "graduationYear", e.target.value)}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...entries, { id: uuid(), degree: "", institution: "", graduationYear: "" }])
        }
      >
        <Plus className="h-4 w-4 mr-1" /> Add Education
      </Button>
    </div>
  );
}

function ResumePreview({ form, displayName }: { form: FormState; displayName: string }) {
  const hasContent =
    form.summary ||
    form.experience.length > 0 ||
    form.education.length > 0 ||
    form.skills.length > 0;

  if (!hasContent) return null;

  return (
    <div id="resume-print-region" className="border rounded-xl p-8 bg-white space-y-6 text-sm">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-foreground">{displayName}</h2>
        <p className="text-xs text-muted-foreground mt-1">CaribbeanRemote Profile</p>
      </div>

      {form.summary && (
        <section>
          <h3 className="font-semibold text-base mb-2 text-primary">Professional Summary</h3>
          <p className="text-muted-foreground leading-relaxed">{form.summary}</p>
        </section>
      )}

      {form.experience.length > 0 && (
        <section>
          <h3 className="font-semibold text-base mb-3 text-primary">Work Experience</h3>
          <div className="space-y-4">
            {form.experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{exp.title || "—"}</p>
                    <p className="text-muted-foreground">{exp.company || "—"}</p>
                  </div>
                  <p className="text-muted-foreground text-xs shrink-0 ml-4">
                    {exp.startDate} – {exp.endDate ?? "Present"}
                  </p>
                </div>
                {exp.description && (
                  <div className="mt-1 text-muted-foreground whitespace-pre-line">
                    {exp.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {form.education.length > 0 && (
        <section>
          <h3 className="font-semibold text-base mb-3 text-primary">Education</h3>
          <div className="space-y-3">
            {form.education.map((edu) => (
              <div key={edu.id} className="flex justify-between">
                <div>
                  <p className="font-semibold">{edu.degree || "—"}</p>
                  <p className="text-muted-foreground">{edu.institution || "—"}</p>
                </div>
                {edu.graduationYear && (
                  <p className="text-muted-foreground text-xs">{edu.graduationYear}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {form.skills.length > 0 && (
        <section>
          <h3 className="font-semibold text-base mb-2 text-primary">Skills</h3>
          <div className="flex flex-wrap gap-2">
            {form.skills.map((s) => (
              <span key={s} className="bg-muted px-2 py-0.5 rounded text-xs font-medium">
                {s}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function UploadResumeTab({
  uploadedResumePath,
  shareToken,
  shareTokenGeneratedAt,
  shareTokenExpiresAt,
  resumeExists,
  updatedAt,
  onUploaded,
  onRemoved,
  onShareTokenChange,
}: {
  uploadedResumePath: string | null;
  shareToken: string | null;
  shareTokenGeneratedAt: string | null;
  shareTokenExpiresAt: string | null;
  resumeExists: boolean;
  updatedAt: string | null;
  onUploaded: (path: string, savedResume: ResumeData) => void;
  onRemoved: () => void;
  onShareTokenChange: (token: string | null, generatedAt?: string | null, expiresAt?: string | null) => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expirySelection, setExpirySelection] = useState<"never" | "30" | "60" | "90">("never");
  const [staleBannerDismissed, setStaleBannerDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("cr_pdf_stale_dismissed") === "1";
    } catch {
      return false;
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const applicationHistory = (() => {
    try {
      return JSON.parse(localStorage.getItem("cr_applied_jobs") ?? "{}") as Record<
        string,
        { resumeType?: "built" | "pdf" | "none"; appliedAt?: string }
      >;
    } catch {
      return {};
    }
  })();

  const objectId = uploadedResumePath ? uploadedResumePath.split("/").pop() : null;
  const previewUrl = objectId ? `${BASE}api/resume/pdf/${objectId}` : null;

  const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000;
  const isPdfStale =
    !!uploadedResumePath &&
    !!updatedAt &&
    new Date(updatedAt).getTime() < Date.now() - THREE_MONTHS_MS;

  const shareUrl = shareToken
    ? `${window.location.origin}${BASE}api/resume/shared/${shareToken}`
    : null;
  const shareGeneratedAt = shareTokenGeneratedAt ? new Date(shareTokenGeneratedAt) : null;
  const shareGeneratedLabel = shareGeneratedAt && !Number.isNaN(shareGeneratedAt.getTime())
    ? shareGeneratedAt.toLocaleString()
    : null;
  const shareExpiresAtDate = shareTokenExpiresAt ? new Date(shareTokenExpiresAt) : null;
  const shareExpiresLabel = shareExpiresAtDate && !Number.isNaN(shareExpiresAtDate.getTime())
    ? shareExpiresAtDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;
  const isShareExpired = !!(shareExpiresAtDate && shareExpiresAtDate.getTime() < Date.now());

  const handleGenerateShareLink = async (rotate = false) => {
    setShareLoading(true);
    try {
      if (rotate && shareToken) {
        const revokeRes = await fetch(`${BASE}api/resume/share-token`, { method: "DELETE" });
        if (!revokeRes.ok) throw new Error("Failed to rotate share link");
      }
      const expiresInDays = expirySelection === "never" ? null : Number(expirySelection);
      const res = await fetch(`${BASE}api/resume/share-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to generate share link");
      }
      const { shareToken: token, generatedAt, expiresAt } = await res.json() as {
        shareToken: string;
        generatedAt?: string;
        expiresAt?: string | null;
      };
      onShareTokenChange(token, generatedAt ?? null, expiresAt ?? null);
      toast({
        title: "Share link created",
        description: expiresAt
          ? `Link will expire on ${new Date(expiresAt).toLocaleDateString()}.`
          : "Anyone with the link can view your resume PDF.",
      });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not generate link.", variant: "destructive" });
    } finally {
      setShareLoading(false);
    }
  };

  const handleRevokeShareLink = async () => {
    setShareLoading(true);
    try {
      const res = await fetch(`${BASE}api/resume/share-token`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke share link");
      onShareTokenChange(null, null, null);
      toast({ title: "Share link revoked", description: "The previous link is no longer accessible." });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not revoke link.", variant: "destructive" });
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", description: "Please copy the link manually.", variant: "destructive" });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file type", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "PDF must be smaller than 5MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const metaRes = await fetch(`${BASE}api/storage/resume-uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) {
        const err = await metaRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Could not start upload");
      }
      const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": "application/pdf" },
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      const saveMethod = resumeExists ? "PATCH" : "POST";
      const saveRes = await fetch(`${BASE}api/resume`, {
        method: saveMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadedResumePath: objectPath }),
      });
      if (!saveRes.ok) {
        const errBody = await saveRes.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? "Failed to save upload path");
      }
      const savedResume = await saveRes.json();

      onUploaded(objectPath, savedResume);
      toast({ title: "Resume uploaded", description: "Your PDF resume has been saved." });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload PDF.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    try {
      const res = await fetch(`${BASE}api/resume/upload`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
      onRemoved();
      toast({ title: "Resume removed", description: "Your uploaded PDF has been removed." });
    } catch {
      toast({ title: "Remove failed", description: "Could not remove the PDF.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {uploadedResumePath && objectId ? (
        <div className="border rounded-xl p-6 bg-card space-y-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
              <FileText className="h-6 w-6 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <p className="font-semibold text-sm">PDF resume uploaded</p>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Object ID: {objectId}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={previewUrl!} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" /> Preview PDF
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" /> Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={uploading}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Remove
            </Button>
          </div>
          {isPdfStale && !staleBannerDismissed && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <div className="flex-1">
                <p className="font-medium">Your PDF may be out of date</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  This resume was last updated over 3 months ago. Consider replacing it with a current version so employers see your latest experience.
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss warning"
                className="shrink-0 text-amber-600 hover:text-amber-800 ml-1 mt-0.5"
                onClick={() => {
                  setStaleBannerDismissed(true);
                  try {
                    sessionStorage.setItem("cr_pdf_stale_dismissed", "1");
                  } catch {
                  }
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className="border-2 border-dashed rounded-xl p-10 text-center space-y-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            {uploading ? (
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
            ) : (
              <Upload className="h-7 w-7 text-primary" />
            )}
          </div>
          <div>
            <p className="font-semibold text-base">
              {uploading ? "Uploading…" : "Upload your PDF resume"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF only · max 5 MB
            </p>
          </div>
          {!uploading && (
            <Button type="button" variant="outline" size="sm">
              Choose file
            </Button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />

      {uploadedResumePath && (
        <div className="border rounded-xl p-6 bg-card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="h-4 w-4 text-primary shrink-0" />
            <p className="font-semibold text-sm">Shareable Resume Link</p>
          </div>
          {shareUrl ? (
            <>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can view your resume PDF. You can revoke it at any time.
              </p>
              {shareGeneratedLabel && (
                <p className="text-xs text-muted-foreground">
                  Last generated: {shareGeneratedLabel}
                </p>
              )}
              {shareExpiresLabel && (
                <p className={`text-xs ${isShareExpired ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {isShareExpired ? "Expired on" : "Expires"}: {shareExpiresLabel}
                </p>
              )}
              {!shareTokenExpiresAt && (
                <p className="text-xs text-muted-foreground">
                  Expires: Never (link is permanent)
                </p>
              )}
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="text-xs font-mono bg-muted"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1.5" /> Open Link
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleRevokeShareLink}
                  disabled={shareLoading}
                >
                  {shareLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Link2Off className="h-4 w-4 mr-1.5" />}
                  Revoke Link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGenerateShareLink(true)}
                  disabled={shareLoading}
                >
                  {shareLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                  Rotate Link
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                <Label htmlFor="rotate-expiry" className="text-xs text-muted-foreground">
                  Expiry on rotate:
                </Label>
                <select
                  id="rotate-expiry"
                  value={expirySelection}
                  onChange={(e) => setExpirySelection(e.target.value as "never" | "30" | "60" | "90")}
                  className="text-xs border rounded px-2 py-1 bg-background"
                  disabled={shareLoading}
                >
                  <option value="never">Never</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Generate a link to share your resume PDF with employers. Choose how long it should remain valid.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="new-expiry" className="text-xs text-muted-foreground">
                  Link expires after:
                </Label>
                <select
                  id="new-expiry"
                  value={expirySelection}
                  onChange={(e) => setExpirySelection(e.target.value as "never" | "30" | "60" | "90")}
                  className="text-xs border rounded px-2 py-1 bg-background"
                  disabled={shareLoading}
                >
                  <option value="never">Never (permanent)</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                </select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGenerateShareLink(false)}
                disabled={shareLoading}
              >
                {shareLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Link2 className="h-4 w-4 mr-1.5" />}
                Generate Share Link
              </Button>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Your PDF is stored securely and only you can access it. When you apply for a job, a download
        link will be included in the application email so employers can view your resume.
      </p>
      {Object.keys(applicationHistory).length > 0 && (
        <div className="text-xs text-muted-foreground">
          Your recent applications are saved on this device.
        </div>
      )}
    </div>
  );
}

interface LastApplication {
  resumeType: string | null;
  jobId: number | null;
  jobTitle: string | null;
  companyName: string | null;
  occurredAt: string;
}

export default function ResumePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isSignedIn } = useUser();
  const [activeTab, setActiveTab] = useState<"build" | "upload">("build");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [skillInput, setSkillInput] = useState("");
  const skillInputRef = useRef<HTMLInputElement>(null);

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

  const { data: lastApplicationData } = useQuery<{ lastApplication: LastApplication | null }>({
    queryKey: ["my-last-application"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/analytics/my-last-application`);
      if (!res.ok) return { lastApplication: null };
      return res.json() as Promise<{ lastApplication: LastApplication | null }>;
    },
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });

  const lastApplication = lastApplicationData?.lastApplication ?? null;

  useEffect(() => {
    if (resume) {
      setForm({
        summary: resume.summary ?? "",
        experience: (resume.experience ?? []).map((e) => ({ ...e, id: e.id ?? uuid() })),
        education: (resume.education ?? []).map((e) => ({ ...e, id: e.id ?? uuid() })),
        skills: resume.skills ?? [],
      });
    }
  }, [resume]);

  const saveMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const isNew = resume === null;
      const res = await fetch(`${BASE}api/resume`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to save resume");
      }
      return res.json() as Promise<ResumeData>;
    },
    onSuccess: (saved) => {
      track("resume_saved");
      const hadSkillsBefore = (resume?.skills ?? []).length > 0;
      const hasSkillsNow = (saved.skills ?? []).length > 0;
      if (hasSkillsNow && !hadSkillsBefore) {
        track("skills_added", { skill_count: saved.skills!.length });
      } else if (hasSkillsNow && hadSkillsBefore) {
        track("skills_updated", { skill_count: saved.skills!.length });
      }
      queryClient.setQueryData(["resume", "me"], saved);
      toast({ title: "Resume saved", description: "Your resume has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (!trimmed || form.skills.includes(trimmed)) return;
    setForm((prev) => ({ ...prev, skills: [...prev.skills, trimmed] }));
    setSkillInput("");
    skillInputRef.current?.focus();
  };

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill();
    }
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  const handleUploadedPath = (_path: string, savedResume: ResumeData) => {
    queryClient.setQueryData(["resume", "me"], savedResume);
  };

  const handleRemovedUpload = () => {
    queryClient.setQueryData(["resume", "me"], (old: ResumeData | null) =>
      old ? { ...old, uploadedResumePath: null, shareToken: null, shareTokenCreatedAt: null, shareTokenExpiresAt: null } : old
    );
  };

  const handleShareTokenChange = (
    token: string | null,
    generatedAt?: string | null,
    expiresAt?: string | null,
  ) => {
    queryClient.setQueryData(["resume", "me"], (old: ResumeData | null) =>
      old
        ? {
            ...old,
            shareToken: token,
            shareTokenCreatedAt: generatedAt ?? null,
            shareTokenExpiresAt: expiresAt ?? null,
          }
        : old
    );
  };

  const isLoading = status === "pending";
  const uploadedResumePath = resume?.uploadedResumePath ?? null;
  const shareToken = resume?.shareToken ?? null;

  const displayName =
    (queryClient.getQueryData(["profile", "me"]) as { displayName?: string } | null)
      ?.displayName || "My Resume";

  return (
    <>
      <style>{`
        @media print {
          body { visibility: hidden; }
          #resume-print-region, #resume-print-region * { visibility: visible; }
          #resume-print-region {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            padding: 2rem;
          }
        }
      `}</style>

      <PageLayout>
        <div className="max-w-3xl mx-auto px-4 py-10 w-full">
          <div className="flex items-start justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-1">My Resume</h1>
              <p className="text-muted-foreground">
                Build a structured resume or upload a PDF — use either when applying for jobs.
              </p>
              {lastApplication && lastApplication.resumeType && (
                <div className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-full px-3 py-1">
                  {lastApplication.resumeType === "pdf" ? (
                    <Upload className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>
                    Last applied with{" "}
                    <span className="font-medium text-foreground">
                      {lastApplication.resumeType === "pdf" ? "uploaded PDF" : "built resume"}
                    </span>
                    {lastApplication.jobTitle && (
                      <>
                        {" "}for{" "}
                        {lastApplication.jobId ? (
                          <Link
                            href={`/jobs/${lastApplication.jobId}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {lastApplication.jobTitle}
                          </Link>
                        ) : (
                          <span className="font-medium text-foreground">{lastApplication.jobTitle}</span>
                        )}
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
            {activeTab === "build" && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadPdf}
                className="shrink-0"
                disabled={!form.summary && form.experience.length === 0 && form.education.length === 0 && form.skills.length === 0}
              >
                <Download className="h-4 w-4 mr-2" /> Download PDF
              </Button>
            )}
          </div>

          {/* Tab toggle */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg mb-8 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab("build")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "build"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-4 w-4" />
              Build Resume
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "upload"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Upload className="h-4 w-4" />
              Upload Resume
              {uploadedResumePath && (
                <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
              )}
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : activeTab === "upload" ? (
            <UploadResumeTab
              uploadedResumePath={uploadedResumePath}
              shareToken={shareToken}
              shareTokenGeneratedAt={resume?.shareTokenCreatedAt ?? null}
              shareTokenExpiresAt={resume?.shareTokenExpiresAt ?? null}
              resumeExists={resume !== null && resume !== undefined}
              updatedAt={resume?.updatedAt ?? null}
              onUploaded={handleUploadedPath}
              onRemoved={handleRemovedUpload}
              onShareTokenChange={handleShareTokenChange}
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-10">
              {/* Professional Summary */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Professional Summary</h2>
                </div>
                <Textarea
                  placeholder="A brief overview of your professional background, core skills, and career goals…"
                  rows={4}
                  value={form.summary}
                  onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                />
              </section>

              {/* Work Experience */}
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">Work Experience</h2>
                <ExperienceSection
                  entries={form.experience}
                  onChange={(experience) => setForm((prev) => ({ ...prev, experience }))}
                />
              </section>

              {/* Education */}
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">Education</h2>
                <EducationSection
                  entries={form.education}
                  onChange={(education) => setForm((prev) => ({ ...prev, education }))}
                />
              </section>

              {/* Skills */}
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">Skills</h2>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      ref={skillInputRef}
                      placeholder="Type a skill and press Enter (e.g. React, Python, Figma)"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={handleSkillKeyDown}
                    />
                    <Button type="button" variant="outline" onClick={addSkill}>
                      Add
                    </Button>
                  </div>
                  {form.skills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {form.skills.map((skill) => (
                        <SkillTag
                          key={skill}
                          skill={skill}
                          onRemove={() =>
                            setForm((prev) => ({
                              ...prev,
                              skills: prev.skills.filter((s) => s !== skill),
                            }))
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <div className="flex items-center gap-3 pt-2 border-t">
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : "Save Resume"}
                </Button>
                <Button type="button" variant="ghost" asChild>
                  <Link href="/jobs">Cancel</Link>
                </Button>
              </div>
            </form>
          )}

          {/* Live Preview (build tab only) */}
          {!isLoading && activeTab === "build" && (form.summary || form.experience.length > 0 || form.education.length > 0 || form.skills.length > 0) && (
            <div className="mt-12 pt-8 border-t">
              <h2 className="text-xl font-semibold mb-4">Preview</h2>
              <ResumePreview form={form} displayName={displayName} />
            </div>
          )}

          {/* Application history */}
          {!isLoading && (
            <div className="mt-12">
              <ApplicationsHistorySection />
            </div>
          )}
        </div>
      </PageLayout>
    </>
  );
}
