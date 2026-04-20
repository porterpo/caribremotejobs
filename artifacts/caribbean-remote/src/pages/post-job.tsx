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

function formToPreviewJob(form: FormState, now: Date): Job {
  const iso = now.toISOString();
  return {
    id: -1,
    title: form.title || "Job Title",
    companyName: form.companyName || "Company Name",
    companyLogo: null,
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

function JobPreview({ form, now }: { form: FormState; now: Date }) {
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
      <JobCard job={formToPreviewJob(form, now)} />
    </div>
  );
}

export default function PostJob() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("sessionId") ?? "";
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [featuredJobId, setFeaturedJobId] = useState("");
  const [mobileTab, setMobileTab] = useState<"form" | "preview">("form");
  const [draftSaved, setDraftSaved] = useState(false);
  const nowRef = useRef(new Date());

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

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
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

  const submitJob = useMutation({
    mutationFn: async () => {
      const payload = {
        sessionId,
        title: form.title,
        companyName: form.companyName,
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
      setSubmitted(true);
    },
    onError: (err: Error) => {
      toast({
        title: "Submission failed",
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
      setSubmitted(true);
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
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) submitJob.mutate();
  };

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setErrors((err) => ({ ...err, [field]: "" }));
    };

  if (!sessionId) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-24 text-center text-muted-foreground">
          <AlertCircle className="h-10 w-10 mx-auto mb-4 text-destructive" />
          <p className="font-medium">Invalid order link.</p>
          <p className="text-sm mt-2">
            Please use the link from your confirmation page.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/pricing">View Pricing</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  if (submitted) {
    const isFeaturedUpgrade = order?.productType === "featured";
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-24 max-w-lg text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">
            {isFeaturedUpgrade ? "Featured Upgrade Applied!" : "Job Submitted!"}
          </h2>
          <p className="text-muted-foreground mb-6">
            {isFeaturedUpgrade
              ? "Your job listing will now appear at the top of the board for 30 days."
              : "Your listing has been submitted for review. Our team will approve it within 24 hours and it will go live on the board."}
          </p>
          <Button asChild>
            <Link href="/jobs">Browse Jobs</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  if (orderLoading) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
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
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Post Your Job
          </h1>
          <p className="text-muted-foreground">
            Fill in the details below. Our team will review and publish your
            listing within 24 hours.
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
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={submitJob.isPending}
                      data-testid="submit-job-btn"
                    >
                      {submitJob.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Submit for Review
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
            <JobPreview form={form} now={nowRef.current} />
            <p className="text-xs text-muted-foreground text-center">
              This is exactly how your listing will appear on the job board.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
