import { useState, useEffect, useRef } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Star,
  Eye,
  FileText,
  Save,
  Pencil,
  Upload,
  X,
  Link2,
} from "lucide-react";
import { Link, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { JobCard } from "@/components/JobCard";
import type { Job } from "@workspace/api-client-react";

const CATEGORIES = [
  "software-engineering",
  "design",
  "marketing",
  "customer-support",
  "finance",
  "sales",
  "operations",
  "data-science",
  "product",
  "writing",
  "other",
];

const JOB_TYPES = [
  "full-time",
  "part-time",
  "contract",
  "freelance",
  "internship",
];

const DRAFT_KEY = "post-job-draft";

interface FormState {
  title: string;
  companyName: string;
  category: string;
  jobType: string;
  description: string;
  applyUrl: string;
  salaryMin: string;
  salaryMax: string;
  locationRestrictions: string;
}

const DEFAULT_FORM: FormState = {
  title: "",
  companyName: "",
  category: "",
  jobType: "full-time",
  description: "",
  applyUrl: "",
  salaryMin: "",
  salaryMax: "",
  locationRestrictions: "",
};

interface JobOrder {
  id: number;
  email: string;
  stripeSessionId: string;
  productType: string;
  status: string;
  jobsRemaining: number;
  jobId: number | null;
}

function formToPreviewJob(form: FormState, now: Date, logoPreviewUrl?: string | null): Job {
  const iso = now.toISOString();
  return {
    id: -1,
    title: form.title || "Job Title",
    companyName: form.companyName || "Company Name",
    companyLogo: logoPreviewUrl ?? null,
    companyId: null,
    caribbeanFriendly: false,
    entryLevel: false,
    category: form.category || "other",
    jobType: form.jobType,
    salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
    salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
    salaryCurrency: "USD",
    description: form.description,
    applyUrl: form.applyUrl || "#",
    source: "direct",
    sourceJobId: null,
    locationRestrictions: form.locationRestrictions || null,
    tags: null,
    featured: false,
    approved: false,
    postedAt: iso,
    createdAt: iso,
    updatedAt: iso,
  };
}

function JobPreview({ form, now, logoPreviewUrl }: { form: FormState; now: Date; logoPreviewUrl?: string | null }) {
  const isEmpty = !form.title && !form.companyName;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-3 border-2 border-dashed border-border rounded-xl p-6">
        <Eye className="h-8 w-8 opacity-40" />
        <p className="text-sm">
          Start filling in the form to see a live preview of your job card.
        </p>
      </div>
    );
  }

  return (
    <div className="pointer-events-none select-none">
      <JobCard job={formToPreviewJob(form, now, logoPreviewUrl)} />
    </div>
  );
}

function jobToFormState(job: Job): FormState {
  return {
    title: job.title ?? "",
    companyName: job.companyName ?? "",
    category: job.category ?? "",
    jobType: job.jobType ?? "full-time",
    description: job.description ?? "",
    applyUrl: job.applyUrl ?? "",
    salaryMin: job.salaryMin != null ? String(job.salaryMin) : "",
    salaryMax: job.salaryMax != null ? String(job.salaryMax) : "",
    locationRestrictions: job.locationRestrictions ?? "",
  };
}

export default function PostJob() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("sessionId") ?? "";
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState<false | "new" | "updated">(false);
  const [featuredJobId, setFeaturedJobId] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState("");
  const [mobileTab, setMobileTab] = useState<"form" | "preview">("form");
  const [draftSaved, setDraftSaved] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editModeLoaded, setEditModeLoaded] = useState(false);
  const nowRef = useRef(new Date());
  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const [logoMode, setLogoMode] = useState<"upload" | "url">(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.logoMode === "url") return "url";
      }
    } catch {}
    return "upload";
  });
  const [logoUrlInput, setLogoUrlInput] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return typeof parsed.logoUrlInput === "string" ? parsed.logoUrlInput : "";
      }
    } catch {}
    return "";
  });
  const [logoUrlStatus, setLogoUrlStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null);

  const uploadLogoFile = async (file: File): Promise<string | null> => {
    setLogoUploading(true);
    try {
      const metaRes = await fetch(`${import.meta.env.BASE_URL}api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) {
        const err = await metaRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Could not start upload");
      }
      const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      return objectPath;
    } catch {
      return null;
    } finally {
      setLogoUploading(false);
    }
  };

  const [form, setForm] = useState<FormState>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) return { ...DEFAULT_FORM, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_FORM;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const hasDraft = localStorage.getItem(DRAFT_KEY);
    if (hasDraft) {
      toast({
        title: "Draft restored",
        description:
          "We found a saved draft and loaded it for you.",
      });
    }
  }, [toast]);

  useEffect(() => {
    if (logoMode === "url" && logoUrlInput) {
      setLogoUrlStatus("checking");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, logoMode, logoUrlInput }));
      setDraftSaved(true);
      toast({ title: "Draft saved", description: "You can safely close this tab and return later." });
      setTimeout(() => setDraftSaved(false), 3000);
    } catch {
      toast({ title: "Could not save draft", variant: "destructive" });
    }
  };

  const { data: order, isLoading: orderLoading } = useQuery<JobOrder>({
    queryKey: ["order", sessionId],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/stripe/session/${sessionId}`,
      );
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    },
    enabled: !!sessionId,
    retry: false,
  });

  const { data: pendingJob, isLoading: pendingJobLoading } = useQuery<Job | null>({
    queryKey: ["pending-job", order?.jobId],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/jobs/${order!.jobId}`,
      );
      if (!res.ok) return null;
      return res.json() as Promise<Job>;
    },
    enabled: !!order?.jobId && order?.jobsRemaining === 0,
    retry: false,
  });

  useEffect(() => {
    if (!pendingJob || editModeLoaded) return;
    if (!pendingJob.approved) {
      setEditMode(true);
      setForm(jobToFormState(pendingJob));
      setEditModeLoaded(true);
      localStorage.removeItem(DRAFT_KEY);
      if (pendingJob.companyLogo && /^https?:\/\/.+/.test(pendingJob.companyLogo)) {
        setLogoMode("url");
        setLogoUrlInput(pendingJob.companyLogo);
        setLogoUrlStatus("checking");
      } else if (pendingJob.companyLogo) {
        setExistingLogoUrl(pendingJob.companyLogo);
      } else {
        setLogoMode("upload");
        setLogoUrlInput("");
        setLogoUrlStatus("idle");
        setExistingLogoUrl(null);
      }
    }
  }, [pendingJob, editModeLoaded]);

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be smaller than 5MB.", variant: "destructive" });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setCompanyLogoPreview(previewUrl);
    setCompanyLogoPath(null);
    setExistingLogoUrl(null);
    const objectPath = await uploadLogoFile(file);
    if (objectPath) {
      setCompanyLogoPath(objectPath);
      toast({ title: "Logo uploaded", description: "Your company logo is ready." });
    } else {
      toast({ title: "Logo upload failed", description: "Could not upload logo. You can still submit without one.", variant: "destructive" });
    }
  };

  const clearLogo = () => {
    setCompanyLogoPath(null);
    if (companyLogoPreview) {
      URL.revokeObjectURL(companyLogoPreview);
    }
    setCompanyLogoPreview(null);
    setExistingLogoUrl(null);
  };

  const handleLogoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setLogoUrlInput(val);
    setErrors((err) => ({ ...err, companyLogo: "" }));
    if (!val) {
      setLogoUrlStatus("idle");
      return;
    }
    if (!/^https?:\/\/.+/.test(val)) {
      setLogoUrlStatus("invalid");
      return;
    }
    setLogoUrlStatus("checking");
  };

  const switchLogoMode = (mode: "upload" | "url") => {
    setLogoMode(mode);
    if (mode === "upload") {
      setLogoUrlInput("");
      setLogoUrlStatus("idle");
    } else {
      clearLogo();
    }
  };

  const effectiveLogoPreview =
    logoMode === "url"
      ? logoUrlStatus === "valid" ? logoUrlInput : null
      : companyLogoPreview ?? existingLogoUrl;

  const submitJob = useMutation({
    mutationFn: async () => {
      let logoServingUrl: string | undefined;
      if (logoMode === "url" && logoUrlStatus === "valid" && logoUrlInput) {
        logoServingUrl = logoUrlInput;
      } else if (companyLogoPath) {
        const objectId = companyLogoPath.split("/").pop();
        logoServingUrl = `${import.meta.env.BASE_URL}api/storage/logos/${objectId}`;
      }
      const payload = {
        sessionId,
        title: form.title,
        companyName: form.companyName,
        companyLogo: logoServingUrl,
        category: form.category,
        jobType: form.jobType,
        description: form.description,
        applyUrl: form.applyUrl,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
        locationRestrictions: form.locationRestrictions || undefined,
      };
      const res = await fetch(`${import.meta.env.BASE_URL}api/jobs/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Submission failed");
      }
      return res.json();
    },
    onSuccess: () => {
      localStorage.removeItem(DRAFT_KEY);
      setSubmitted("new");
    },
    onError: (err: Error) => {
      toast({
        title: "Submission failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateJob = useMutation({
    mutationFn: async () => {
      let logoServingUrl: string | null;
      if (logoMode === "url" && logoUrlStatus === "valid" && logoUrlInput) {
        logoServingUrl = logoUrlInput;
      } else if (companyLogoPath) {
        const objectId = companyLogoPath.split("/").pop();
        logoServingUrl = `${import.meta.env.BASE_URL}api/storage/logos/${objectId}`;
      } else if (existingLogoUrl) {
        logoServingUrl = existingLogoUrl;
      } else {
        logoServingUrl = null;
      }
      const payload = {
        sessionId,
        title: form.title,
        companyName: form.companyName,
        companyLogo: logoServingUrl,
        category: form.category,
        jobType: form.jobType,
        description: form.description,
        applyUrl: form.applyUrl,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
        locationRestrictions: form.locationRestrictions || undefined,
      };
      const res = await fetch(`${import.meta.env.BASE_URL}api/jobs/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted("updated");
    },
    onError: (err: Error) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const featureJob = useMutation({
    mutationFn: async () => {
      const jobId = parseInt(featuredJobId);
      if (!jobId || isNaN(jobId)) throw new Error("Enter a valid Job ID");
      const res = await fetch(`${import.meta.env.BASE_URL}api/jobs/feature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, jobId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Feature upgrade failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted("new");
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to apply upgrade",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.title.trim()) newErrors.title = "Job title is required";
    if (!form.companyName.trim())
      newErrors.companyName = "Company name is required";
    if (!form.category) newErrors.category = "Category is required";
    if (!form.description.trim() || form.description.trim().length < 50)
      newErrors.description = "Description must be at least 50 characters";
    if (!form.applyUrl.trim()) newErrors.applyUrl = "Apply URL is required";
    if (form.applyUrl && !/^https?:\/\/.+/.test(form.applyUrl))
      newErrors.applyUrl = "Must be a valid URL (https://...)";
    if (logoMode === "url" && logoUrlInput) {
      if (logoUrlStatus === "checking") {
        newErrors.companyLogo = "Still verifying logo URL — please wait a moment and try again";
      } else if (logoUrlStatus === "invalid") {
        newErrors.companyLogo = "Could not load image from that URL. Please check the link or remove it.";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (editMode) {
      updateJob.mutate();
    } else {
      submitJob.mutate();
    }
  };

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setErrors((err) => ({ ...err, [field]: "" }));
    };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendError("");
    setResendState("loading");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/jobs/resend-edit-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setResendError((err as { error?: string }).error ?? "Something went wrong. Please try again.");
        setResendState("error");
      } else {
        setResendState("sent");
      }
    } catch {
      setResendError("Could not connect to the server. Please try again.");
      setResendState("error");
    }
  };

  if (!sessionId) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-16 max-w-md">
          <div className="text-center mb-8">
            <Link2 className="h-10 w-10 mx-auto mb-4 text-primary" />
            <h1 className="text-2xl font-bold mb-2">Recover Your Job Posting Link</h1>
            <p className="text-muted-foreground text-sm">
              Enter the email you used to purchase your job listing and we'll
              resend your submission link or edit link.
            </p>
          </div>

          {resendState === "sent" ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="font-medium text-lg mb-2">Check your inbox</p>
              <p className="text-sm text-muted-foreground">
                If we found any orders for that email address, we've resent your
                submission or edit link. It may take a minute to arrive.
              </p>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <form onSubmit={handleResend} className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="resend-email">Email address</Label>
                    <Input
                      id="resend-email"
                      data-testid="resend-email-input"
                      type="email"
                      placeholder="you@company.com"
                      value={resendEmail}
                      onChange={(e) => {
                        setResendEmail(e.target.value);
                        setResendError("");
                      }}
                      required
                    />
                  </div>
                  {resendError && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {resendError}
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    data-testid="resend-edit-link-btn"
                    disabled={resendState === "loading" || !resendEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resendEmail)}
                  >
                    {resendState === "loading" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="mr-2 h-4 w-4" />
                    )}
                    Send My Posting Link
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account yet?{" "}
            <Link href="/pricing" className="underline text-foreground">
              View pricing
            </Link>
          </p>
        </div>
      </PageLayout>
    );
  }

  if (submitted) {
    const isFeaturedUpgrade = order?.productType === "featured";
    const isUpdate = submitted === "updated";
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-24 max-w-lg text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">
            {isFeaturedUpgrade
              ? "Featured Upgrade Applied!"
              : isUpdate
              ? "Listing Updated!"
              : "Job Submitted!"}
          </h2>
          <p className="text-muted-foreground mb-6">
            {isFeaturedUpgrade
              ? "Your job listing will now appear at the top of the board for 30 days."
              : isUpdate
              ? "Your changes have been saved. Our team will review the updated listing and approve it within 24 hours."
              : "Your listing has been submitted for review. Our team will approve it within 24 hours and it will go live on the board."}
          </p>
          <Button asChild>
            <Link href="/jobs">Browse Jobs</Link>
          </Button>
          {!isFeaturedUpgrade && (
            <p className="text-sm text-muted-foreground mt-6">
              Can't find your submission or edit link email?{" "}
              <Link href="/post-job" className="underline text-foreground">
                Resend it here
              </Link>
            </p>
          )}
        </div>
      </PageLayout>
    );
  }

  const needsEditModeLoad =
    !!order?.jobId &&
    order?.jobsRemaining === 0 &&
    !!pendingJob &&
    !pendingJob.approved;

  if (
    orderLoading ||
    (order?.jobId && order?.jobsRemaining === 0 && pendingJobLoading) ||
    (needsEditModeLoad && !editModeLoaded)
  ) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        </div>
      </PageLayout>
    );
  }

  if (pendingJob?.approved) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-24 max-w-lg text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-4 text-green-500" />
          <p className="font-medium text-foreground">Your listing is already live.</p>
          <p className="text-sm mt-2">
            This job has been approved and is now visible on the board. Edits are no longer available.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/jobs">Browse Jobs</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  if (order?.productType === "featured") {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-12 max-w-lg">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-6 w-6 text-yellow-500 fill-yellow-400" />
              <h1 className="text-3xl font-bold tracking-tight">
                Apply Featured Upgrade
              </h1>
            </div>
            <p className="text-muted-foreground">
              Enter the ID of an existing job listing to feature it at the top
              of the board for 30 days.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Feature an Existing Job</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="jobId">Job ID</Label>
                <Input
                  id="jobId"
                  data-testid="feature-job-id"
                  value={featuredJobId}
                  onChange={(e) => setFeaturedJobId(e.target.value)}
                  placeholder="e.g. 42"
                  type="number"
                  min={1}
                />
                <p className="text-xs text-muted-foreground">
                  You can find the job ID in your listing URL or by contacting
                  support.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => featureJob.mutate()}
                disabled={featureJob.isPending || !featuredJobId}
                data-testid="apply-feature-btn"
              >
                {featureJob.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Star className="mr-2 h-4 w-4" />
                )}
                Apply Featured Upgrade
              </Button>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Want to post a new featured job instead?{" "}
            <span
              className="underline cursor-pointer text-foreground"
              onClick={() =>
                toast({
                  title: "Contact support",
                  description:
                    "Email hello@caribbeanremote.com to change your upgrade type.",
                })
              }
            >
              Contact us
            </span>
          </p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            {editMode && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                <Pencil className="h-3 w-3" />
                Editing pending listing
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {editMode ? "Edit Your Job Listing" : "Post Your Job"}
          </h1>
          <p className="text-muted-foreground">
            {editMode
              ? "Your listing is still pending review. Make your changes below and re-submit — it won't go live until our team approves it."
              : "Fill in the details below. Our team will review and publish your listing within 24 hours."}
          </p>
        </div>

        {/* Mobile tab switcher — only visible below lg breakpoint */}
        <div className="flex lg:hidden mb-4 border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setMobileTab("form")}
            data-testid="tab-form"
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === "form"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            <FileText className="h-4 w-4" />
            Form
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            data-testid="tab-preview"
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === "preview"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
        </div>

        {/* Split layout: single grid, preview hidden on mobile unless tab is active */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Form column — hidden on mobile when preview tab is active */}
          <div className={mobileTab === "preview" ? "hidden lg:block" : "block"}>
            <Card>
              <CardHeader>
                <CardTitle>Job Details</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="title">Job Title *</Label>
                      <Input
                        id="title"
                        data-testid="job-title"
                        value={form.title}
                        onChange={set("title")}
                        placeholder="e.g. Senior React Developer"
                      />
                      {errors.title && (
                        <p className="text-xs text-destructive">{errors.title}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="companyName">Company Name *</Label>
                      <Input
                        id="companyName"
                        data-testid="company-name"
                        value={form.companyName}
                        onChange={set("companyName")}
                        placeholder="Acme Corp"
                      />
                      {errors.companyName && (
                        <p className="text-xs text-destructive">{errors.companyName}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Company Logo</Label>
                      <div className="flex rounded-md border border-border overflow-hidden text-xs">
                        <button
                          type="button"
                          onClick={() => switchLogoMode("upload")}
                          data-testid="logo-mode-upload"
                          className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${
                            logoMode === "upload"
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <Upload className="h-3 w-3" />
                          Upload file
                        </button>
                        <button
                          type="button"
                          onClick={() => switchLogoMode("url")}
                          data-testid="logo-mode-url"
                          className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${
                            logoMode === "url"
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <Link2 className="h-3 w-3" />
                          Use a URL
                        </button>
                      </div>
                    </div>

                    {logoMode === "upload" ? (
                      companyLogoPreview ? (
                        <div className="flex items-center gap-3">
                          <div className="h-14 w-14 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img
                              src={companyLogoPreview}
                              alt="Logo preview"
                              className="h-full w-full object-contain p-1"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            {logoUploading ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Uploading logo...
                              </div>
                            ) : companyLogoPath ? (
                              <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                                <CheckCircle2 className="h-4 w-4" />
                                Logo ready
                              </p>
                            ) : (
                              <p className="text-sm text-amber-600">Upload pending...</p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearLogo}
                            disabled={logoUploading}
                            aria-label="Remove logo"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : existingLogoUrl ? (
                        <div className="flex items-center gap-3">
                          <div className="h-14 w-14 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img
                              src={existingLogoUrl}
                              alt="Current company logo"
                              className="h-full w-full object-contain p-1"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-muted-foreground">Current logo — change by uploading a new file</p>
                            <label
                              htmlFor="company-logo-input"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-primary cursor-pointer hover:underline"
                            >
                              <Upload className="h-3 w-3" />
                              Replace logo
                              <input
                                id="company-logo-input"
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={handleLogoFileChange}
                                data-testid="logo-file-input"
                              />
                            </label>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearLogo}
                            aria-label="Remove logo"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label
                          htmlFor="company-logo-input"
                          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                          data-testid="logo-upload-area"
                        >
                          <Upload className="h-6 w-6 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground text-center">
                            Click to upload your company logo
                            <br />
                            <span className="text-xs">PNG, JPG, SVG, WebP — max 5MB</span>
                          </span>
                          <input
                            id="company-logo-input"
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={handleLogoFileChange}
                            data-testid="logo-file-input"
                          />
                        </label>
                      )
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2 items-center">
                          <Input
                            data-testid="logo-url-input"
                            value={logoUrlInput}
                            onChange={handleLogoUrlChange}
                            placeholder="https://example.com/logo.png"
                            type="url"
                            className="flex-1"
                          />
                          {logoUrlInput && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => { setLogoUrlInput(""); setLogoUrlStatus("idle"); }}
                              aria-label="Clear URL"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {logoUrlStatus === "checking" && logoUrlInput && (
                          <img
                            src={logoUrlInput}
                            alt=""
                            className="sr-only"
                            onLoad={() => setLogoUrlStatus("valid")}
                            onError={() => setLogoUrlStatus("invalid")}
                          />
                        )}
                        {logoUrlStatus === "valid" && (
                          <div className="flex items-center gap-3">
                            <div className="h-14 w-14 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                              <img
                                src={logoUrlInput}
                                alt="Logo preview"
                                className="h-full w-full object-contain p-1"
                              />
                            </div>
                            <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" />
                              Image URL verified
                            </p>
                          </div>
                        )}
                        {logoUrlStatus === "invalid" && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Could not load image from that URL. Please check the link.
                          </p>
                        )}
                        {logoUrlStatus === "checking" && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Checking image…
                          </div>
                        )}
                        {logoUrlStatus === "idle" && !logoUrlInput && (
                          <p className="text-xs text-muted-foreground">
                            Paste a direct link to your company logo (PNG, JPG, SVG, WebP).
                          </p>
                        )}
                        {errors.companyLogo && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {errors.companyLogo}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Category *</Label>
                      <Select
                        value={form.category}
                        onValueChange={(v) => {
                          setForm((f) => ({ ...f, category: v }));
                          setErrors((e) => ({ ...e, category: "" }));
                        }}
                      >
                        <SelectTrigger data-testid="category-select">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c
                                .replace(/-/g, " ")
                                .replace(/\b\w/g, (l) => l.toUpperCase())}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.category && (
                        <p className="text-xs text-destructive">{errors.category}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Job Type *</Label>
                      <Select
                        value={form.jobType}
                        onValueChange={(v) => setForm((f) => ({ ...f, jobType: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {JOB_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t
                                .replace(/-/g, " ")
                                .replace(/\b\w/g, (l) => l.toUpperCase())}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="description">
                      Job Description *{" "}
                      <span className="text-muted-foreground text-xs">(min. 50 chars)</span>
                    </Label>
                    <Textarea
                      id="description"
                      data-testid="job-description"
                      value={form.description}
                      onChange={set("description")}
                      placeholder="Describe the role, responsibilities, requirements, and what makes your company a great place to work..."
                      rows={8}
                    />
                    {errors.description && (
                      <p className="text-xs text-destructive">{errors.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {form.description.length} characters
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="applyUrl">Application URL *</Label>
                    <Input
                      id="applyUrl"
                      data-testid="apply-url"
                      value={form.applyUrl}
                      onChange={set("applyUrl")}
                      placeholder="https://yourjobboard.com/apply"
                      type="url"
                    />
                    {errors.applyUrl && (
                      <p className="text-xs text-destructive">{errors.applyUrl}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="salaryMin">Salary Min (USD/year)</Label>
                      <Input
                        id="salaryMin"
                        value={form.salaryMin}
                        onChange={set("salaryMin")}
                        placeholder="60000"
                        type="number"
                        min={0}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="salaryMax">Salary Max (USD/year)</Label>
                      <Input
                        id="salaryMax"
                        value={form.salaryMax}
                        onChange={set("salaryMax")}
                        placeholder="90000"
                        type="number"
                        min={0}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="locationRestrictions">Location Notes</Label>
                    <Input
                      id="locationRestrictions"
                      value={form.locationRestrictions}
                      onChange={set("locationRestrictions")}
                      placeholder="e.g. Worldwide, Americas, GMT-5 to GMT+3"
                    />
                  </div>

                  <div className="flex gap-3">
                    {!editMode && (
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={saveDraft}
                        data-testid="save-draft-btn"
                      >
                        <Save className="mr-2 h-4 w-4" />
                        {draftSaved ? "Saved!" : "Save Draft"}
                      </Button>
                    )}
                    <Button
                      type="submit"
                      className={editMode ? "w-full" : "flex-1"}
                      disabled={submitJob.isPending || updateJob.isPending}
                      data-testid="submit-job-btn"
                    >
                      {(submitJob.isPending || updateJob.isPending) ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : editMode ? (
                        <Pencil className="mr-2 h-4 w-4" />
                      ) : null}
                      {editMode ? "Update Listing" : "Submit for Review"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Preview column — hidden on mobile when form tab is active */}
          <div
            data-testid="preview-panel"
            className={`lg:sticky lg:top-8 space-y-3 ${mobileTab === "form" ? "hidden lg:block" : "block"}`}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Eye className="h-4 w-4" />
              Live Preview
            </div>
            <JobPreview form={form} now={nowRef.current} logoPreviewUrl={effectiveLogoPreview} />
            <p className="text-xs text-muted-foreground text-center">
              This is exactly how your listing will appear on the job board.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
