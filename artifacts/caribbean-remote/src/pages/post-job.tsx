import { useState } from "react";
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
import { CheckCircle2, Loader2, AlertCircle, Star } from "lucide-react";
import { Link, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

interface JobOrder {
  id: number;
  email: string;
  stripeSessionId: string;
  productType: string;
  status: string;
  jobsRemaining: number;
  jobId: number | null;
}

export default function PostJob() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("sessionId") ?? "";
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [featuredJobId, setFeaturedJobId] = useState("");

  const [form, setForm] = useState({
    title: "",
    companyName: "",
    category: "",
    jobType: "full-time",
    description: "",
    applyUrl: "",
    salaryMin: "",
    salaryMax: "",
    locationRestrictions: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

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
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/jobs/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Submission failed");
      }
      return res.json();
    },
    onSuccess: () => {
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
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/jobs/feature`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, jobId }),
        },
      );
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
    (field: string) =>
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
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Post Your Job
          </h1>
          <p className="text-muted-foreground">
            Fill in the details below. Our team will review and publish your
            listing within 24 hours.
          </p>
        </div>

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
                    <p className="text-xs text-destructive">
                      {errors.companyName}
                    </p>
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
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, jobType: v }))
                    }
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
                  <span className="text-muted-foreground text-xs">
                    (min. 50 chars)
                  </span>
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
                  <p className="text-xs text-destructive">
                    {errors.description}
                  </p>
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

              <Button
                type="submit"
                className="w-full"
                disabled={submitJob.isPending}
                data-testid="submit-job-btn"
              >
                {submitJob.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Submit Job for Review
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
