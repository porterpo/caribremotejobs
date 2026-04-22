import { PageLayout } from "@/components/layout/PageLayout";
import { 
  useListJobs, getListJobsQueryKey,
  useListCompanies, getListCompaniesQueryKey,
  useListAlerts, getListAlertsQueryKey,
  useUpdateJob, useDeleteJob,
  useUpdateCompany,
  useSyncJobs,
  useGetStats
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, CheckCircle2, RefreshCw, Star, Building2, Palmtree, ShieldCheck, XCircle, Mail, MailX, Filter, Download, BarChart2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";

const ANALYTICS_PREF_KEY_FROM = "admin_analyticsDateFrom";
const ANALYTICS_PREF_KEY_TO = "admin_analyticsDateTo";
const ANALYTICS_PREF_KEY_TREND_EVENT = "admin_trendEventFilter";
const ANALYTICS_PREF_KEY_GRANULARITY = "admin_trendGranularity";

interface EligibilityCriteria {
  approvedDirectListings: number;
  profileComplete: boolean;
  noViolations: boolean;
  accountAgeDays: number;
}

interface DirectListing {
  id: number;
  title: string;
  approved: boolean;
  rejectedForViolation: boolean;
}

interface AdminCompany {
  id: number;
  name: string;
  logo: string | null;
  website: string | null;
  description: string | null;
  verifiedEmployer: boolean;
  caribbeanFriendly: boolean;
  createdAt: string;
  eligibility: {
    eligible: boolean;
    criteria: EligibilityCriteria;
    directListings: DirectListing[];
  };
}

interface JobOrder {
  id: number;
  email: string;
  productType: string;
  status: string;
  jobsRemaining: number;
  jobId: number | null;
  createdAt: string;
  confirmationEmailSentAt: string | null;
  jobSubmissionEmailSentAt: string | null;
}

interface SeekerSubscription {
  clerkUserId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string;
  currentPeriodEnd: string | null;
  createdAt: string;
}

interface PendingJob {
  id: number;
  title: string;
  companyName: string;
  category: string;
  jobType: string;
  source: string;
  postedAt: string;
}

interface OrderStats {
  totalPaid: number;
  breakdown: {
    single: number;
    pack: number;
    monthly: number;
    featured: number;
    [key: string]: number;
  };
  totalRevenue: number;
  seekerSubscriptionCounts?: {
    active: number;
    past_due: number;
    cancelled: number;
    [key: string]: number;
  };
  revenueBreakdown: {
    single: number;
    pack: number;
    monthly: number;
    featured: number;
    [key: string]: number;
  };
}

function fmtLocalDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

const ANALYTICS_PRESETS: { label: string; getRange: () => { from: string; to: string } }[] = [
  {
    label: "Last 7 days",
    getRange: () => {
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      return { from: fmtLocalDate(from), to: fmtLocalDate(today) };
    },
  },
  {
    label: "Last 30 days",
    getRange: () => {
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - 29);
      return { from: fmtLocalDate(from), to: fmtLocalDate(today) };
    },
  },
  {
    label: "This month",
    getRange: () => {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmtLocalDate(from), to: fmtLocalDate(today) };
    },
  },
  {
    label: "Last month",
    getRange: () => {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmtLocalDate(from), to: fmtLocalDate(to) };
    },
  },
];

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("jobs");
  const [page, setPage] = useState(1);
  const [orderProductType, setOrderProductType] = useState("all");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [subStatusFilter, setSubStatusFilter] = useState("all");
  const { data: stats } = useGetStats();

  const { data: orderStats } = useQuery<OrderStats>({
    queryKey: ["admin-order-stats"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/order-stats`);
      if (!res.ok) throw new Error("Failed to fetch order stats");
      return res.json();
    },
  });
  
  // Jobs
  const { data: jobsResponse, isLoading: jobsLoading } = useListJobs({ page, limit: 20 });
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  
  // Companies
  const { data: companies, isLoading: companiesLoading } = useListCompanies();
  const updateCompany = useUpdateCompany();
  
  // Alerts
  const { data: alerts, isLoading: alertsLoading } = useListAlerts();
  
  // Sync
  const syncJobs = useSyncJobs();

  // Verified Employers
  const { data: adminCompanies, isLoading: adminCompaniesLoading, refetch: refetchAdminCompanies } = useQuery<AdminCompany[]>({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/companies`);
      if (!res.ok) throw new Error("Failed to fetch admin companies");
      return res.json();
    },
  });

  const grantVerified = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/companies/${id}/verify`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to grant verification");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Verified Employer badge granted" });
      refetchAdminCompanies();
    },
    onError: (err: Error) => toast({ title: err.message || "Failed to grant badge", variant: "destructive" }),
  });

  const revokeVerified = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/companies/${id}/unverify`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to revoke verification");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Verified Employer badge revoked" });
      refetchAdminCompanies();
    },
    onError: () => toast({ title: "Failed to revoke badge", variant: "destructive" }),
  });

  const jobFlagViolation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/jobs/${id}/flag-violation`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to flag job violation");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job flagged for policy violation" });
      refetchAdminCompanies();
    },
    onError: () => toast({ title: "Failed to flag violation", variant: "destructive" }),
  });

  const jobClearViolation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/jobs/${id}/clear-violation`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to clear job violation");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job violation flag cleared" });
      refetchAdminCompanies();
    },
    onError: () => toast({ title: "Failed to clear violation", variant: "destructive" }),
  });

  const pendingVerificationCount = adminCompanies?.filter(c => c.eligibility.eligible && !c.verifiedEmployer).length ?? 0;

  // Orders
  const { data: orders, isLoading: ordersLoading } = useQuery<JobOrder[]>({
    queryKey: ["admin-orders", orderProductType, orderDateFrom, orderDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (orderProductType && orderProductType !== "all") params.set("productType", orderProductType);
      if (orderDateFrom) params.set("dateFrom", orderDateFrom);
      if (orderDateTo) params.set("dateTo", orderDateTo);
      const qs = params.toString();
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/orders${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });

  const missingEmailCount = orders?.filter(
    (o) => o.status === "paid" && (!o.confirmationEmailSentAt || (o.jobId && !o.jobSubmissionEmailSentAt))
  ).length ?? 0;

  const { data: seekerSubscriptions, isLoading: subscriptionsLoading } = useQuery<SeekerSubscription[]>({
    queryKey: ["admin-seeker-subscriptions", subStatusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (subStatusFilter && subStatusFilter !== "all") params.set("status", subStatusFilter);
      const qs = params.toString();
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/seeker-subscriptions${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch seeker subscriptions");
      return res.json();
    },
    enabled: activeTab === "seeker-subscriptions",
  });

  interface AnalyticsSummary {
    totalClicks: number;
    clicksWithResume: number;
    skillsAdded: number;
    applicationStarted: number;
    resumeSaved: number;
    skillsUpdated: number;
    eventBreakdown: { event: string; count: number }[];
    topJobs: { jobId: number | null; jobTitle: string | null; companyName: string | null; clicks: number }[];
  }

  const [analyticsDateFrom, setAnalyticsDateFrom] = useState(
    () => localStorage.getItem("admin_analyticsDateFrom") ?? ""
  );
  const [analyticsDateTo, setAnalyticsDateTo] = useState(
    () => localStorage.getItem("admin_analyticsDateTo") ?? ""
  );
  const [trendEventFilter, setTrendEventFilter] = useState(
    () => localStorage.getItem(ANALYTICS_PREF_KEY_TREND_EVENT) ?? ""
  );
  const [trendEventFilterSecondary, setTrendEventFilterSecondary] = useState("");
  const [granularityOverride, setGranularityOverride] = useState<"auto" | "day" | "week">(
    () => {
      const stored = localStorage.getItem(ANALYTICS_PREF_KEY_GRANULARITY);
      if (stored === "day" || stored === "week") return stored;
      return "auto";
    }
  );
  const [analyticsPreferenceLoaded, setAnalyticsPreferenceLoaded] = useState(false);

  const { data: analyticsPreference } = useQuery<{
    analyticsDateFrom: string | null;
    analyticsDateTo: string | null;
  }>({
    queryKey: ["admin-analytics-preference"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/preferences/analytics-date-range`);
      if (!res.ok) throw new Error("Failed to load analytics preference");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (analyticsPreferenceLoaded) return;
    const from = analyticsPreference?.analyticsDateFrom;
    const to = analyticsPreference?.analyticsDateTo;
    if (from !== undefined || to !== undefined) {
      setAnalyticsDateFrom(from ?? localStorage.getItem(ANALYTICS_PREF_KEY_FROM) ?? "");
      setAnalyticsDateTo(to ?? localStorage.getItem(ANALYTICS_PREF_KEY_TO) ?? "");
      setAnalyticsPreferenceLoaded(true);
    }
  }, [analyticsPreference, analyticsPreferenceLoaded]);

  useEffect(() => {
    if (!analyticsPreferenceLoaded) return;
    if (analyticsDateFrom) {
      localStorage.setItem(ANALYTICS_PREF_KEY_FROM, analyticsDateFrom);
    } else {
      localStorage.removeItem(ANALYTICS_PREF_KEY_FROM);
    }
    if (analyticsDateTo) {
      localStorage.setItem(ANALYTICS_PREF_KEY_TO, analyticsDateTo);
    } else {
      localStorage.removeItem(ANALYTICS_PREF_KEY_TO);
    }
  }, [analyticsDateFrom, analyticsDateTo, analyticsPreferenceLoaded]);

  const saveAnalyticsPreference = useMutation({
    mutationFn: async (next: { analyticsDateFrom: string | null; analyticsDateTo: string | null }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/preferences/analytics-date-range`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("Failed to save analytics preference");
      return res.json() as Promise<{ analyticsDateFrom: string | null; analyticsDateTo: string | null }>;
    },
  });

  const { data: analyticsSummary, isLoading: analyticsLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["admin-analytics-summary", analyticsDateFrom, analyticsDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (analyticsDateFrom) params.set("dateFrom", analyticsDateFrom);
      if (analyticsDateTo) params.set("dateTo", analyticsDateTo);
      const qs = params.toString();
      const res = await fetch(`${import.meta.env.BASE_URL}api/analytics/summary${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch analytics summary");
      return res.json();
    },
  });

  useEffect(() => {
    if (trendEventFilter) {
      localStorage.setItem(ANALYTICS_PREF_KEY_TREND_EVENT, trendEventFilter);
    } else {
      localStorage.removeItem(ANALYTICS_PREF_KEY_TREND_EVENT);
    }
  }, [trendEventFilter]);

  useEffect(() => {
    if (granularityOverride === "auto") {
      localStorage.removeItem(ANALYTICS_PREF_KEY_GRANULARITY);
    } else {
      localStorage.setItem(ANALYTICS_PREF_KEY_GRANULARITY, granularityOverride);
    }
  }, [granularityOverride]);

  useEffect(() => {
    if (!trendEventFilter && !trendEventFilterSecondary) return;
    const available = (analyticsSummary?.eventBreakdown ?? []).map((e) => e.event);
    if (available.length > 0 && trendEventFilter && !available.includes(trendEventFilter)) {
      setTrendEventFilter("");
    }
    if (available.length > 0 && trendEventFilterSecondary && !available.includes(trendEventFilterSecondary)) {
      setTrendEventFilterSecondary("");
    }
  }, [analyticsSummary, trendEventFilter, trendEventFilterSecondary]);

  const effectiveGranularity = useMemo<"day" | "week">(() => {
    if (granularityOverride !== "auto") return granularityOverride;
    if (!analyticsDateFrom || !analyticsDateTo) return "week";
    const from = new Date(analyticsDateFrom + "T00:00:00Z");
    const to = new Date(analyticsDateTo + "T00:00:00Z");
    const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    return diffDays >= 60 ? "week" : "day";
  }, [granularityOverride, analyticsDateFrom, analyticsDateTo]);

  const { data: analyticsTrend, isLoading: trendLoading } = useQuery<{ trend: { event?: string; trend: { date: string; count: number }[] }[] | { date: string; count: number }[]; granularity: string }>({
    queryKey: ["admin-analytics-trend", analyticsDateFrom, analyticsDateTo, trendEventFilter, trendEventFilterSecondary, effectiveGranularity],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (analyticsDateFrom) params.set("dateFrom", analyticsDateFrom);
      if (analyticsDateTo) params.set("dateTo", analyticsDateTo);
      const events = [trendEventFilter, trendEventFilterSecondary].filter(Boolean);
      if (events.length) params.set("event", events.join(","));
      params.set("granularity", effectiveGranularity);
      const qs = params.toString();
      const res = await fetch(`${import.meta.env.BASE_URL}api/analytics/trend${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch analytics trend");
      return res.json();
    },
  });

  const trendData = useMemo(() => {
    const raw = analyticsTrend?.trend ?? [];
    const first = raw[0];
    if (!raw.length || (first && "event" in first)) return raw as any;
    if (!analyticsDateFrom || !analyticsDateTo) return raw;
    const countByDate: Record<string, number> = {};
    for (const row of raw as { date: string; count: number }[]) countByDate[row.date] = row.count;
    const result: { date: string; count: number }[] = [];
    if (effectiveGranularity === "week") {
      const cursor = new Date(analyticsDateFrom + "T00:00:00Z");
      const dayOfWeek = cursor.getUTCDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      cursor.setUTCDate(cursor.getUTCDate() + daysToMonday);
      const end = new Date(analyticsDateTo + "T00:00:00Z");
      while (cursor <= end) {
        const d = cursor.toISOString().slice(0, 10);
        result.push({ date: d, count: countByDate[d] ?? 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    } else {
      const cursor = new Date(analyticsDateFrom + "T00:00:00Z");
      const end = new Date(analyticsDateTo + "T00:00:00Z");
      while (cursor <= end) {
        const d = cursor.toISOString().slice(0, 10);
        result.push({ date: d, count: countByDate[d] ?? 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return result;
  }, [analyticsTrend, analyticsDateFrom, analyticsDateTo, effectiveGranularity]);

  const trendSeriesData = useMemo(() => {
    const raw = analyticsTrend?.trend ?? [];
    if (raw.length && "event" in raw[0]) return raw as { event: string; trend: { date: string; count: number }[] }[];
    if (!raw.length) return [];
    return [{ event: trendEventFilter || "Events", trend: trendData }];
  }, [analyticsTrend, trendData, trendEventFilter]);

  const weekDeltaMap = useMemo(() => {
    if (effectiveGranularity !== "week") return {} as Record<string, number | null>;
    const data = (Array.isArray(trendData) && trendData.length && !("event" in trendData[0]))
      ? (trendData as { date: string; count: number }[])
      : [];
    const map: Record<string, number | null> = {};
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        map[data[i].date] = null;
      } else {
        const prev = data[i - 1].count;
        const curr = data[i].count;
        map[data[i].date] = prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);
      }
    }
    return map;
  }, [trendData, effectiveGranularity]);

  const pricePerUnit = useMemo<Record<string, number>>(() => {
    if (!orderStats) return {};
    const prices: Record<string, number> = {};
    for (const key of Object.keys(orderStats.breakdown)) {
      if (orderStats.breakdown[key] > 0) {
        prices[key] = Math.round(orderStats.revenueBreakdown[key] / orderStats.breakdown[key]);
      }
    }
    return prices;
  }, [orderStats]);

  const filteredRevenue = useMemo(() => {
    if (!orders) return 0;
    return orders
      .filter((o) => o.status === "paid")
      .reduce((sum, o) => sum + (pricePerUnit[o.productType] ?? 0), 0);
  }, [orders, pricePerUnit]);

  const filteredBreakdown = useMemo(() => {
    if (!orders) return [];
    const productLabels: Record<string, string> = {
      single: "Single Post",
      pack: "3-Pack",
      monthly: "Monthly",
      featured: "Featured Upgrade",
    };
    const counts: Record<string, number> = {};
    const revenues: Record<string, number> = {};
    for (const o of orders.filter((o) => o.status === "paid")) {
      counts[o.productType] = (counts[o.productType] ?? 0) + 1;
      revenues[o.productType] = (revenues[o.productType] ?? 0) + (pricePerUnit[o.productType] ?? 0);
    }
    return Object.keys(counts).map((key) => ({
      key,
      label: productLabels[key] ?? key,
      count: counts[key],
      revenue: revenues[key],
    }));
  }, [orders, pricePerUnit]);

  const resendOrderEmail = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/orders/${id}/resend-email`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to resend email");
      }
      return res.json() as Promise<{ confirmationEmailSentAt: string }>;
    },
    onSuccess: (_data, id) => {
      toast({ title: `Confirmation email resent for order #${id}` });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // Pending jobs
  const { data: pendingJobs, isLoading: pendingLoading, refetch: refetchPending } = useQuery<PendingJob[]>({
    queryKey: ["pending-jobs"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/pending-jobs`);
      if (!res.ok) throw new Error("Failed to fetch pending jobs");
      return res.json();
    },
  });

  const approveJob = useMutation({
    mutationFn: async ({ id, featured }: { id: number; featured: boolean }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/jobs/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured }),
      });
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      toast({ title: vars.featured ? "Job approved & featured" : "Job approved" });
      refetchPending();
      queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
    },
    onError: () => toast({ title: "Failed to approve job", variant: "destructive" }),
  });

  const handleSyncJobs = () => {
    syncJobs.mutate(undefined, {
      onSuccess: (data) => {
        toast({
          title: "Sync Complete",
          description: `Synced ${data.jobsSynced} jobs, skipped ${data.jobsSkipped}.`,
        });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      },
      onError: () => {
        toast({
          title: "Sync Failed",
          description: "An error occurred while syncing jobs.",
          variant: "destructive",
        });
      }
    });
  };

  const toggleJobApproval = (id: number, approved: boolean) => {
    updateJob.mutate({ id, data: { approved } }, {
      onSuccess: () => {
        toast({ title: approved ? "Job approved" : "Job unapproved" });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      }
    });
  };

  const toggleJobFeatured = (id: number, featured: boolean) => {
    updateJob.mutate({ id, data: { featured } }, {
      onSuccess: () => {
        toast({ title: featured ? "Job featured" : "Job un-featured" });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      }
    });
  };

  const handleDeleteJob = (id: number) => {
    if (confirm("Are you sure you want to delete this job?")) {
      deleteJob.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Job deleted" });
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        }
      });
    }
  };

  const toggleCompanyCaribbeanFriendly = (id: number, caribbeanFriendly: boolean) => {
    updateCompany.mutate({ id, data: { caribbeanFriendly } }, {
      onSuccess: () => {
        toast({ title: caribbeanFriendly ? "Marked Caribbean Friendly" : "Removed Caribbean Friendly status" });
        queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      }
    });
  };

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage platform content and settings.</p>
          </div>
          
          <Button 
            onClick={handleSyncJobs} 
            disabled={syncJobs.isPending}
            className="shrink-0"
          >
            {syncJobs.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync Jobs API
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalJobs || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Companies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalCompanies || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Alert Subscribers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.alertSubscribers || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Caribbean Friendly</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.caribbeanFriendlyJobs || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-2xl font-bold">{orderStats?.totalPaid ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total orders</div>
              </div>
              <div className="h-8 w-px bg-border hidden sm:block" />
              <div>
                <div className="text-2xl font-bold text-green-700">
                  ${((orderStats?.totalRevenue ?? 0) / 100).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Total revenue</div>
              </div>
              <div className="h-8 w-px bg-border hidden sm:block" />
              <div className="flex flex-wrap gap-4">
                {[
                  { key: "single", label: "Single Post" },
                  { key: "pack", label: "3-Pack" },
                  { key: "monthly", label: "Monthly" },
                  { key: "featured", label: "Featured Upgrade" },
                ].map(({ key, label }) => (
                  <div key={key} className="text-center">
                    <div className="text-lg font-semibold">{orderStats?.breakdown?.[key] ?? 0}</div>
                    <div className="text-xs text-green-700 font-medium">
                      ${((orderStats?.revenueBreakdown?.[key] ?? 0) / 100).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 w-full justify-start h-auto p-1 bg-muted/50 overflow-x-auto">
            <TabsTrigger value="pending" className="px-6 py-2">
              Pending Review
              {pendingJobs && pendingJobs.length > 0 && (
                <Badge className="ml-2 bg-orange-500 text-white text-xs px-1.5 py-0">{pendingJobs.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="orders" className="px-6 py-2">
              Orders
              {missingEmailCount > 0 && (
                <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0">{missingEmailCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="jobs" className="px-6 py-2">Jobs</TabsTrigger>
            <TabsTrigger value="companies" className="px-6 py-2">Companies</TabsTrigger>
            <TabsTrigger value="verified-employers" className="px-6 py-2">
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Verified Employers
              {pendingVerificationCount > 0 && (
                <Badge className="ml-2 bg-blue-500 text-white text-xs px-1.5 py-0">{pendingVerificationCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="alerts" className="px-6 py-2">Alert Subscribers</TabsTrigger>
            <TabsTrigger value="analytics" className="px-6 py-2">
              <BarChart2 className="h-4 w-4 mr-1.5" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="seeker-subscriptions" className="px-6 py-2">
              Seeker Subscriptions
              {(orderStats?.seekerSubscriptionCounts?.past_due ?? 0) > 0 && (
                <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0">
                  {orderStats!.seekerSubscriptionCounts!.past_due}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle>Pending Job Review</CardTitle>
                <CardDescription>Jobs submitted by employers awaiting approval before going live.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job Title</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingLoading ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                      ) : !pendingJobs || pendingJobs.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No jobs pending review.</TableCell></TableRow>
                      ) : (
                        pendingJobs.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell className="font-medium max-w-[220px] truncate">{job.title}</TableCell>
                            <TableCell>{job.companyName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{job.category}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(new Date(job.postedAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell className="text-right flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approveJob.mutate({ id: job.id, featured: false })}
                                disabled={approveJob.isPending}
                                data-testid={`approve-${job.id}`}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1 text-green-600" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => approveJob.mutate({ id: job.id, featured: true })}
                                disabled={approveJob.isPending}
                                data-testid={`approve-feature-${job.id}`}
                              >
                                <Star className="h-4 w-4 mr-1" />
                                Approve + Feature
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Job Posting Orders</CardTitle>
                <CardDescription>
                  All paid job posting orders. Orders flagged in red are missing a confirmation or job submission email.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-4 mb-4 p-3 bg-muted/40 rounded-lg border">
                  <div className="flex flex-wrap gap-2 w-full">
                    {ANALYTICS_PRESETS.map(({ label, getRange }) => {
                      const range = getRange();
                      const isActive = orderDateFrom === range.from && orderDateTo === range.to;
                      return (
                        <Button
                          key={label}
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          className="text-xs h-7 px-3"
                          onClick={() => {
                            setOrderDateFrom(range.from);
                            setOrderDateTo(range.to);
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                  <Filter className="h-4 w-4 text-muted-foreground mt-1 shrink-0 self-center" />
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Product type</Label>
                    <Select value={orderProductType} onValueChange={setOrderProductType}>
                      <SelectTrigger className="h-8 w-[160px] text-sm">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="single">Single Post</SelectItem>
                        <SelectItem value="pack">3-Pack</SelectItem>
                        <SelectItem value="monthly">Monthly Unlimited</SelectItem>
                        <SelectItem value="featured">Featured Upgrade</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input
                      type="date"
                      className="h-8 w-[150px] text-sm"
                      value={orderDateFrom}
                      onChange={(e) => setOrderDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input
                      type="date"
                      className="h-8 w-[150px] text-sm"
                      value={orderDateTo}
                      onChange={(e) => setOrderDateTo(e.target.value)}
                    />
                  </div>
                  {(orderProductType !== "all" || orderDateFrom || orderDateTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground self-end"
                      onClick={() => { setOrderProductType("all"); setOrderDateFrom(""); setOrderDateTo(""); }}
                    >
                      Clear filters
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs self-end"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (orderProductType && orderProductType !== "all") params.set("productType", orderProductType);
                      if (orderDateFrom) params.set("dateFrom", orderDateFrom);
                      if (orderDateTo) params.set("dateTo", orderDateTo);
                      const url = `${import.meta.env.BASE_URL}api/admin/orders/export${params.toString() ? `?${params.toString()}` : ""}`;
                      window.open(url, "_blank");
                    }}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Export CSV
                  </Button>
                  {orders && (orderProductType !== "all" || orderDateFrom || orderDateTo) && (
                    <div className="ml-auto self-end flex flex-wrap items-center gap-4 bg-background border rounded-md px-3 py-1.5">
                      <div className="text-center">
                        <div className="text-base font-bold leading-tight">{orders.length}</div>
                        <div className="text-xs text-muted-foreground">Orders</div>
                      </div>
                      <div className="h-6 w-px bg-border" />
                      <div className="text-center">
                        <div className="text-base font-bold leading-tight text-green-700">
                          {orders.filter(o => o.status === "paid").length}
                        </div>
                        <div className="text-xs text-muted-foreground">Paid</div>
                      </div>
                      <div className="h-6 w-px bg-border" />
                      <div className="text-center">
                        <div className="text-base font-bold leading-tight text-green-700">
                          ${(filteredRevenue / 100).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Revenue</div>
                      </div>
                      {filteredBreakdown.length > 0 && (
                        <>
                          <div className="h-6 w-px bg-border" />
                          <div className="flex flex-wrap gap-3">
                            {filteredBreakdown.map(({ key, label, count, revenue }) => (
                              <button
                                key={key}
                                type="button"
                                className={`relative text-center cursor-pointer rounded px-1.5 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${key === orderProductType ? "bg-primary border border-primary shadow-sm" : "hover:bg-muted border border-transparent"}`}
                                title={key === orderProductType ? "Click to clear filter" : `Filter by ${label}`}
                                onClick={() => setOrderProductType(key === orderProductType ? "all" : key)}
                              >
                                {key === orderProductType && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white leading-none border border-white/30">×</span>
                                )}
                                <div className={`text-sm font-semibold leading-tight ${key === orderProductType ? "text-primary-foreground" : ""}`}>{count}</div>
                                <div className={`text-xs font-medium ${key === orderProductType ? "text-primary-foreground/80" : "text-green-700"}`}>${(revenue / 100).toLocaleString()}</div>
                                <div className={`text-xs underline decoration-dotted ${key === orderProductType ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{label}</div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Job Filed</TableHead>
                        <TableHead>Confirmation Email</TableHead>
                        <TableHead>Submission Email</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center h-24">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : !orders || orders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                            No orders yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        orders.map((order) => {
                          const emailMissing = order.status === "paid" && (!order.confirmationEmailSentAt || (order.jobId && !order.jobSubmissionEmailSentAt));
                          const productLabel: Record<string, string> = {
                            single: "Single Post",
                            pack: "3-Pack",
                            monthly: "Monthly Unlimited",
                            featured: "Featured Upgrade",
                          };
                          return (
                            <TableRow key={order.id} className={emailMissing ? "bg-red-50 hover:bg-red-100" : ""}>
                              <TableCell className="font-medium">{order.email}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {productLabel[order.productType] ?? order.productType}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {order.status === "paid" && (
                                  <Badge className="bg-green-100 text-green-800 border-0 text-xs">Paid</Badge>
                                )}
                                {order.status === "pending" && (
                                  <Badge variant="outline" className="text-muted-foreground text-xs">Pending</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {order.jobId ? (
                                  <span className="text-xs text-green-700 font-medium">Job #{order.jobId}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {order.confirmationEmailSentAt ? (
                                  <div className="flex items-center gap-1.5 text-green-700">
                                    <Mail className="h-4 w-4 shrink-0" />
                                    <span className="text-xs">
                                      Sent {format(new Date(order.confirmationEmailSentAt), "MMM d, h:mm a")}
                                    </span>
                                  </div>
                                ) : order.status === "paid" ? (
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 text-red-600 font-medium">
                                      <MailX className="h-4 w-4 shrink-0" />
                                      <span className="text-xs">Not sent</span>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-xs px-2"
                                      onClick={() => resendOrderEmail.mutate(order.id)}
                                      disabled={resendOrderEmail.isPending && resendOrderEmail.variables === order.id}
                                    >
                                      {resendOrderEmail.isPending && resendOrderEmail.variables === order.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        "Resend Email"
                                      )}
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {order.jobSubmissionEmailSentAt ? (
                                  <div className="flex items-center gap-1.5 text-green-700">
                                    <Mail className="h-4 w-4 shrink-0" />
                                    <span className="text-xs">
                                      Sent {format(new Date(order.jobSubmissionEmailSentAt), "MMM d, h:mm a")}
                                    </span>
                                  </div>
                                ) : order.jobId && order.status === "paid" ? (
                                  <div className="flex items-center gap-1.5 text-red-600 font-medium">
                                    <MailX className="h-4 w-4 shrink-0" />
                                    <span className="text-xs">Not sent</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {format(new Date(order.createdAt), "MMM d, yyyy")}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs">
            <Card>
              <CardHeader>
                <CardTitle>Job Listings</CardTitle>
                <CardDescription>Approve, feature, and manage job postings.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job Title</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-center">Approved</TableHead>
                        <TableHead className="text-center">Featured</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobsLoading ? (
                        <TableRow><TableCell colSpan={6} className="text-center h-24">Loading...</TableCell></TableRow>
                      ) : jobsResponse?.jobs.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center h-24">No jobs found.</TableCell></TableRow>
                      ) : (
                        jobsResponse?.jobs.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell className="font-medium max-w-[250px] truncate">
                              {job.title}
                              <div className="text-xs text-muted-foreground font-normal truncate mt-1">
                                {job.category} • {job.jobType}
                              </div>
                            </TableCell>
                            <TableCell>{job.companyName}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(new Date(job.postedAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch 
                                checked={job.approved} 
                                onCheckedChange={(c) => toggleJobApproval(job.id, c)} 
                                disabled={updateJob.isPending}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch 
                                checked={job.featured} 
                                onCheckedChange={(c) => toggleJobFeatured(job.id, c)}
                                disabled={updateJob.isPending}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteJob(job.id)} disabled={deleteJob.isPending}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                
                {jobsResponse && jobsResponse.totalPages > 1 && (
                  <div className="flex items-center justify-end space-x-2 py-4">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                      Previous
                    </Button>
                    <div className="text-sm font-medium">Page {page} of {jobsResponse.totalPages}</div>
                    <Button variant="outline" size="sm" disabled={page === jobsResponse.totalPages} onClick={() => setPage(p => p + 1)}>
                      Next
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="companies">
            <Card>
              <CardHeader>
                <CardTitle>Companies</CardTitle>
                <CardDescription>Manage company profiles and Caribbean Friendly status.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company Name</TableHead>
                        <TableHead>Website</TableHead>
                        <TableHead>Active Jobs</TableHead>
                        <TableHead className="text-center">Caribbean Friendly</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companiesLoading ? (
                        <TableRow><TableCell colSpan={4} className="text-center h-24">Loading...</TableCell></TableRow>
                      ) : companies?.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center h-24">No companies found.</TableCell></TableRow>
                      ) : (
                        companies?.map((company) => (
                          <TableRow key={company.id}>
                            <TableCell className="font-medium flex items-center gap-2">
                              {company.logo ? (
                                <img src={company.logo} className="h-6 w-6 object-contain" alt="" />
                              ) : (
                                <Building2 className="h-5 w-5 text-muted-foreground" />
                              )}
                              {company.name}
                            </TableCell>
                            <TableCell>
                              {company.website ? (
                                <a href={company.website} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate max-w-[200px] inline-block">
                                  {company.website.replace(/^https?:\/\//, '')}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>{company.jobCount}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Switch 
                                  checked={company.caribbeanFriendly} 
                                  onCheckedChange={(c) => toggleCompanyCaribbeanFriendly(company.id, c)}
                                  disabled={updateCompany.isPending}
                                />
                                {company.caribbeanFriendly && <Palmtree className="h-4 w-4 text-amber-600" />}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="verified-employers">
            <Card>
              <CardHeader>
                <CardTitle>Verified Employer Management</CardTitle>
                <CardDescription>
                  Grant or revoke the Verified Employer badge. Eligibility requires ≥2 approved direct listings, a complete company profile (logo, description, website), and account age of 30+ days.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead className="text-center">Direct Listings</TableHead>
                        <TableHead className="text-center">Profile Complete</TableHead>
                        <TableHead className="text-center">Account Age</TableHead>
                        <TableHead className="text-center">No Violations</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-center">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminCompaniesLoading ? (
                        <TableRow><TableCell colSpan={7} className="text-center h-24">Loading...</TableCell></TableRow>
                      ) : adminCompanies?.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center h-24">No companies found.</TableCell></TableRow>
                      ) : (
                        adminCompanies?.map((company) => {
                          const { criteria, eligible } = company.eligibility;
                          const isMutating = grantVerified.isPending || revokeVerified.isPending || jobFlagViolation.isPending || jobClearViolation.isPending;
                          const isIneligible = !eligible && !company.verifiedEmployer;
                          return (
                            <TableRow key={company.id} className={company.verifiedEmployer ? "bg-blue-50/40" : isIneligible ? "opacity-50" : ""}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {company.logo ? (
                                    <img src={company.logo} className="h-6 w-6 object-contain" alt="" />
                                  ) : (
                                    <Building2 className="h-5 w-5 text-muted-foreground" />
                                  )}
                                  <span className="font-medium">{company.name}</span>
                                  {company.verifiedEmployer && (
                                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      {criteria.approvedDirectListings >= 2 ? (
                                        <div className="flex items-center justify-center gap-1 text-green-700 cursor-default">
                                          <CheckCircle2 className="h-4 w-4" />
                                          <span>{criteria.approvedDirectListings}</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-center gap-1 text-red-600 cursor-default">
                                          <XCircle className="h-4 w-4" />
                                          <span>{criteria.approvedDirectListings}</span>
                                        </div>
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {criteria.approvedDirectListings >= 2
                                        ? `${criteria.approvedDirectListings} approved direct listings ✓`
                                        : `Needs ≥2 approved direct listings (has ${criteria.approvedDirectListings})`}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="text-center">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      {criteria.profileComplete ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-700 mx-auto cursor-default" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-red-600 mx-auto cursor-default" />
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {criteria.profileComplete
                                        ? "Profile complete (logo, description, website) ✓"
                                        : "Missing: logo, description, or website URL"}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="text-center">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      {criteria.accountAgeDays >= 30 ? (
                                        <div className="flex items-center justify-center gap-1 text-green-700 cursor-default">
                                          <CheckCircle2 className="h-4 w-4" />
                                          <span>{criteria.accountAgeDays}d</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-center gap-1 text-red-600 cursor-default">
                                          <XCircle className="h-4 w-4" />
                                          <span>{criteria.accountAgeDays}d</span>
                                        </div>
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {criteria.accountAgeDays >= 30
                                        ? `Account is ${criteria.accountAgeDays} days old ✓`
                                        : `Needs 30+ days old (${criteria.accountAgeDays} days so far)`}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center gap-1">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          {criteria.noViolations ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-700 cursor-default" />
                                          ) : (
                                            <XCircle className="h-4 w-4 text-red-600 cursor-default" />
                                          )}
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {criteria.noViolations
                                            ? "No policy violations on any listing ✓"
                                            : `${company.eligibility.directListings.filter(l => l.rejectedForViolation).length} listing(s) flagged for violation`}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  {company.eligibility.directListings.map((listing) => (
                                    <div key={listing.id} className="flex items-center gap-1 text-xs">
                                      <span className="truncate max-w-[100px]" title={listing.title}>
                                        {listing.title.length > 18 ? `${listing.title.slice(0, 18)}…` : listing.title}
                                      </span>
                                      {listing.rejectedForViolation ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 px-1 text-xs text-green-700 hover:text-green-900"
                                          disabled={isMutating}
                                          onClick={() => jobClearViolation.mutate(listing.id)}
                                        >
                                          Clear
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 px-1 text-xs text-red-600 hover:text-red-800"
                                          disabled={isMutating}
                                          onClick={() => jobFlagViolation.mutate(listing.id)}
                                        >
                                          Flag
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                {company.verifiedEmployer ? (
                                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 gap-1">
                                    <ShieldCheck className="h-3 w-3" />
                                    Verified
                                  </Badge>
                                ) : eligible ? (
                                  <Badge variant="outline" className="text-green-700 border-green-400">Eligible</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">Not Eligible</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {company.verifiedEmployer ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 border-red-300 hover:bg-red-50"
                                    disabled={isMutating}
                                    onClick={() => revokeVerified.mutate(company.id)}
                                  >
                                    Revoke
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                    disabled={isMutating || !eligible}
                                    onClick={() => grantVerified.mutate(company.id)}
                                  >
                                    Grant
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts">
            <Card>
              <CardHeader>
                <CardTitle>Alert Subscribers</CardTitle>
                <CardDescription>Users who have subscribed to email alerts.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Categories</TableHead>
                        <TableHead>Keywords</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date Subscribed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {alertsLoading ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24">Loading...</TableCell></TableRow>
                      ) : alerts?.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24">No subscribers found.</TableCell></TableRow>
                      ) : (
                        alerts?.map((alert) => (
                          <TableRow key={alert.id}>
                            <TableCell className="font-medium">{alert.email}</TableCell>
                            <TableCell>
                              {alert.categories ? (
                                <div className="flex flex-wrap gap-1">
                                  {alert.categories.split(',').map(c => (
                                    <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs italic">All Categories</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {alert.keywords ? alert.keywords : <span className="text-muted-foreground text-xs italic">None</span>}
                            </TableCell>
                            <TableCell>
                              {alert.active ? (
                                <Badge className="bg-green-100 text-green-800 border-0">Active</Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">Unsubscribed</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(new Date(alert.createdAt), "MMM d, yyyy")}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {ANALYTICS_PRESETS.map(({ label, getRange }) => {
                      const range = getRange();
                      const isActive = analyticsDateFrom === range.from && analyticsDateTo === range.to;
                      return (
                        <Button
                          key={label}
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          className="text-xs h-7 px-3"
                          onClick={() => {
                            setAnalyticsDateFrom(range.from);
                            setAnalyticsDateTo(range.to);
                            saveAnalyticsPreference.mutate({ analyticsDateFrom: range.from, analyticsDateTo: range.to });
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="analytics-date-from" className="text-xs text-muted-foreground">From</Label>
                      <Input
                        id="analytics-date-from"
                        type="date"
                        value={analyticsDateFrom}
                        onChange={(e) => {
                          const next = e.target.value;
                          setAnalyticsDateFrom(next);
                          saveAnalyticsPreference.mutate({ analyticsDateFrom: next || null, analyticsDateTo: analyticsDateTo || null });
                        }}
                        className="w-40"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="analytics-date-to" className="text-xs text-muted-foreground">To</Label>
                      <Input
                        id="analytics-date-to"
                        type="date"
                        value={analyticsDateTo}
                        onChange={(e) => {
                          const next = e.target.value;
                          setAnalyticsDateTo(next);
                          saveAnalyticsPreference.mutate({ analyticsDateFrom: analyticsDateFrom || null, analyticsDateTo: next || null });
                        }}
                        className="w-40"
                      />
                    </div>
                    {(analyticsDateFrom || analyticsDateTo) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAnalyticsDateFrom("");
                          setAnalyticsDateTo("");
                          saveAnalyticsPreference.mutate({ analyticsDateFrom: null, analyticsDateTo: null });
                        }}
                      >
                        Clear
                      </Button>
                    )}
                    {!analyticsDateFrom && !analyticsDateTo && (
                      <p className="text-xs text-muted-foreground self-end pb-2">Showing all-time data</p>
                    )}
                    {(analyticsDateFrom || analyticsDateTo) && (
                      <p className="text-xs text-muted-foreground self-end pb-2">
                        {analyticsDateFrom && analyticsDateTo
                          ? `${analyticsDateFrom} to ${analyticsDateTo}`
                          : analyticsDateFrom
                          ? `From ${analyticsDateFrom}`
                          : `Up to ${analyticsDateTo}`}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-sm font-medium">Events Over Time</CardTitle>
                      <CardDescription className="text-xs">
                        {trendEventFilter ? `${trendEventFilter} events` : "Total events"} per {effectiveGranularity === "week" ? "week" : "day"} in the selected range
                        {granularityOverride === "auto" && effectiveGranularity === "week" && (
                          <span className="ml-1 text-muted-foreground/70">(auto)</span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center rounded-md border overflow-hidden">
                        {(["auto", "day", "week"] as const).map((g) => (
                          <button
                            key={g}
                            onClick={() => setGranularityOverride(g)}
                            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                              granularityOverride === g
                                ? "bg-primary text-primary-foreground"
                                : "bg-transparent text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {g === "auto" ? "Auto" : g === "day" ? "Day" : "Week"}
                          </button>
                        ))}
                      </div>
                      <Select value={trendEventFilter || "__all__"} onValueChange={(v) => setTrendEventFilter(v === "__all__" ? "" : v)}>
                        <SelectTrigger className="h-8 text-xs w-44">
                          <SelectValue placeholder="All events" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All events</SelectItem>
                          {(analyticsSummary?.eventBreakdown ?? []).map((e) => (
                            <SelectItem key={e.event} value={e.event}>
                              {e.event}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={trendEventFilterSecondary || "__all__"} onValueChange={(v) => setTrendEventFilterSecondary(v === "__all__" ? "" : v)}>
                        <SelectTrigger className="h-8 text-xs w-44">
                          <SelectValue placeholder="Compare second event" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">No comparison</SelectItem>
                          {(analyticsSummary?.eventBreakdown ?? []).map((e) => (
                            <SelectItem key={e.event} value={e.event}>
                              {e.event}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {trendLoading ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !trendSeriesData.length ? (
                    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                      No data for the selected range
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={trendData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: string) =>
                            effectiveGranularity === "week" ? `W/o ${v.slice(5)}` : v.slice(5)
                          }
                          interval="preserveStartEnd"
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const delta = effectiveGranularity === "week" ? weekDeltaMap[label as string] : undefined;
                            return (
                              <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-md">
                                <p className="font-medium mb-1">
                                  {effectiveGranularity === "week" ? `Week of ${label}` : label}
                                </p>
                                {payload.map((entry, i) => (
                                  <p key={i} style={{ color: entry.color }}>
                                    {entry.name}: {entry.value as number}
                                  </p>
                                ))}
                                {effectiveGranularity === "week" && delta != null && (
                                  <p className={delta >= 0 ? "text-green-600" : "text-red-500"}>
                                    {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% vs prior week
                                  </p>
                                )}
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="count" name={trendEventFilter || "Events"} fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                        {trendEventFilterSecondary && (
                          <Bar dataKey="count" name={trendEventFilterSecondary} fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Applications Started</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {analyticsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (analyticsSummary?.applicationStarted ?? 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">application_started events</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Resumes Saved</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {analyticsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (analyticsSummary?.resumeSaved ?? 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">resume_saved events</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Nudge Clicks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {analyticsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (analyticsSummary?.totalClicks ?? 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">skills_nudge_clicked events</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>All Event Types</CardTitle>
                  <CardDescription>Total counts for every tracked event type across all users.</CardDescription>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <div className="flex items-center justify-center h-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Event</TableHead>
                            <TableHead className="text-right">Total events</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!analyticsSummary?.eventBreakdown?.length ? (
                            <TableRow><TableCell colSpan={2} className="text-center h-24 text-muted-foreground">No events recorded yet.</TableCell></TableRow>
                          ) : (
                            analyticsSummary.eventBreakdown.map((row) => (
                              <TableRow key={row.event}>
                                <TableCell className="font-mono text-sm">{row.event}</TableCell>
                                <TableCell className="text-right font-mono">{row.count}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Skills Completion Funnel</CardTitle>
                  <CardDescription>Event totals comparing skills nudge clicks to skills_added completions. Conversion is calculated as skills_added events ÷ nudge click events.</CardDescription>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <div className="flex items-center justify-center h-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Event</TableHead>
                            <TableHead className="text-right">Total events</TableHead>
                            <TableHead className="text-right">Conversion</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Nudge clicked</TableCell>
                            <TableCell className="text-right font-mono">{analyticsSummary?.totalClicks ?? 0}</TableCell>
                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Skills added</TableCell>
                            <TableCell className="text-right font-mono">{analyticsSummary?.skillsAdded ?? 0}</TableCell>
                            <TableCell className="text-right">
                              {analyticsSummary && analyticsSummary.totalClicks > 0 ? (
                                <Badge className={
                                  Math.round((analyticsSummary.skillsAdded / analyticsSummary.totalClicks) * 100) >= 50
                                    ? "bg-green-100 text-green-800 border-0"
                                    : "bg-amber-100 text-amber-800 border-0"
                                }>
                                  {Math.round((analyticsSummary.skillsAdded / analyticsSummary.totalClicks) * 100)}%
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">no data yet</span>
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Skills updated</TableCell>
                            <TableCell className="text-right font-mono">{analyticsSummary?.skillsUpdated ?? 0}</TableCell>
                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Jobs by Nudge Clicks</CardTitle>
                  <CardDescription>Jobs that have generated the most skills nudge activity.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead className="text-right">Clicks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analyticsLoading ? (
                          <TableRow><TableCell colSpan={3} className="text-center h-24">Loading...</TableCell></TableRow>
                        ) : !analyticsSummary?.topJobs?.length ? (
                          <TableRow><TableCell colSpan={3} className="text-center h-24 text-muted-foreground">No nudge click data yet.</TableCell></TableRow>
                        ) : (
                          analyticsSummary.topJobs.map((row) => (
                            <TableRow key={row.jobId ?? "unknown"}>
                              <TableCell className="font-medium">{row.jobTitle ?? <span className="text-muted-foreground italic">Unknown job</span>}</TableCell>
                              <TableCell className="text-muted-foreground">{row.companyName ?? "—"}</TableCell>
                              <TableCell className="text-right font-mono">{row.clicks}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="seeker-subscriptions">
            <Card>
              <CardHeader>
                <CardTitle>Seeker Pro Subscriptions</CardTitle>
                <CardDescription>All seeker Pro subscriptions. Filter by status to find at-risk or cancelled subscribers.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={subStatusFilter} onValueChange={setSubStatusFilter}>
                      <SelectTrigger className="h-8 w-[160px] text-sm">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="past_due">Past due</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {subStatusFilter !== "all" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground self-end"
                      onClick={() => setSubStatusFilter("all")}
                    >
                      Clear filter
                    </Button>
                  )}
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Clerk User ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Current Period End</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Stripe Links</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subscriptionsLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center h-24">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : !seekerSubscriptions || seekerSubscriptions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                            No subscriptions found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        seekerSubscriptions.map((sub) => (
                          <TableRow key={sub.clerkUserId}>
                            <TableCell className="font-mono text-xs">{sub.clerkUserId}</TableCell>
                            <TableCell>
                              {sub.status === "active" && (
                                <Badge className="bg-green-100 text-green-800 border-0 text-xs">Active</Badge>
                              )}
                              {sub.status === "past_due" && (
                                <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">Past due</Badge>
                              )}
                              {sub.status === "cancelled" && (
                                <Badge variant="outline" className="text-muted-foreground text-xs">Cancelled</Badge>
                              )}
                              {sub.status !== "active" && sub.status !== "past_due" && sub.status !== "cancelled" && (
                                <Badge variant="outline" className="text-xs">{sub.status}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {sub.currentPeriodEnd
                                ? format(new Date(sub.currentPeriodEnd), "MMM d, yyyy")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(sub.createdAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {sub.stripeCustomerId && (
                                  <a
                                    href={`https://dashboard.stripe.com/customers/${sub.stripeCustomerId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                    Customer
                                  </a>
                                )}
                                {sub.stripeSubscriptionId && (
                                  <a
                                    href={`https://dashboard.stripe.com/subscriptions/${sub.stripeSubscriptionId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline"
                                  >
                                    Subscription
                                  </a>
                                )}
                                {!sub.stripeCustomerId && !sub.stripeSubscriptionId && (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
