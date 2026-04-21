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
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, CheckCircle2, RefreshCw, Star, Building2, Palmtree, XCircle, Mail, MailX, Filter, Download, BarChart2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface CertificationOrder {
  id: number;
  email: string;
  companyName: string;
  stripeSessionId: string;
  status: string;
  createdAt: string;
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
  const [certStatus, setCertStatus] = useState("all");
  const [certDateFrom, setCertDateFrom] = useState("");
  const [certDateTo, setCertDateTo] = useState("");

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

  // Certifications
  const { data: certifications, isLoading: certificationsLoading, refetch: refetchCertifications } = useQuery<CertificationOrder[]>({
    queryKey: ["certifications"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/certifications`);
      if (!res.ok) throw new Error("Failed to fetch certifications");
      return res.json();
    },
  });

  const approveCertification = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/certifications/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to approve certification");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Certification approved" });
      refetchCertifications();
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
    },
    onError: () => toast({ title: "Failed to approve certification", variant: "destructive" }),
  });

  const rejectCertification = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/certifications/${id}/reject`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to reject certification");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Certification rejected" });
      refetchCertifications();
    },
    onError: () => toast({ title: "Failed to reject certification", variant: "destructive" }),
  });

  const pendingCertifications = certifications?.filter(c => c.status === "paid") || [];

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

  const [analyticsDateFrom, setAnalyticsDateFrom] = useState("");
  const [analyticsDateTo, setAnalyticsDateTo] = useState("");

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

  const { data: analyticsTrend, isLoading: trendLoading } = useQuery<{ trend: { date: string; count: number }[] }>({
    queryKey: ["admin-analytics-trend", analyticsDateFrom, analyticsDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (analyticsDateFrom) params.set("dateFrom", analyticsDateFrom);
      if (analyticsDateTo) params.set("dateTo", analyticsDateTo);
      const qs = params.toString();
      const res = await fetch(`${import.meta.env.BASE_URL}api/analytics/trend${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch analytics trend");
      return res.json();
    },
  });

  const trendData = useMemo(() => {
    const raw = analyticsTrend?.trend ?? [];
    if (!raw.length) return raw;
    if (!analyticsDateFrom || !analyticsDateTo) return raw;
    const countByDate: Record<string, number> = {};
    for (const row of raw) countByDate[row.date] = row.count;
    const result: { date: string; count: number }[] = [];
    const cursor = new Date(analyticsDateFrom + "T00:00:00Z");
    const end = new Date(analyticsDateTo + "T00:00:00Z");
    while (cursor <= end) {
      const d = cursor.toISOString().slice(0, 10);
      result.push({ date: d, count: countByDate[d] ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  }, [analyticsTrend, analyticsDateFrom, analyticsDateTo]);

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

  const certStatusCounts = useMemo(() => {
    if (!certifications) return { pending: 0, paid: 0, approved: 0, rejected: 0 };
    return certifications.reduce(
      (acc, c) => {
        if (c.status in acc) acc[c.status as keyof typeof acc]++;
        return acc;
      },
      { pending: 0, paid: 0, approved: 0, rejected: 0 },
    );
  }, [certifications]);

  const filteredCertifications = useMemo(() => {
    if (!certifications) return [];
    if (certStatus === "all") return certifications;
    return certifications.filter((c) => c.status === certStatus);
  }, [certifications, certStatus]);

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
            <TabsTrigger value="certifications" className="px-6 py-2">
              Certifications
              {pendingCertifications.length > 0 && (
                <Badge className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0">{pendingCertifications.length}</Badge>
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
            <TabsTrigger value="alerts" className="px-6 py-2">Alert Subscribers</TabsTrigger>
            <TabsTrigger value="analytics" className="px-6 py-2">
              <BarChart2 className="h-4 w-4 mr-1.5" />
              Analytics
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
          
          <TabsContent value="certifications">
            <Card>
              <CardHeader>
                <CardTitle>Caribbean Friendly Certifications</CardTitle>
                <CardDescription>Review and approve certification applications from employers.</CardDescription>
              </CardHeader>
              <CardContent>
                {certifications && certifications.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {([
                      { key: "paid", label: "Awaiting Review", count: certStatusCounts.paid },
                      { key: "pending", label: "Payment Pending", count: certStatusCounts.pending },
                      { key: "approved", label: "Approved", count: certStatusCounts.approved },
                      { key: "rejected", label: "Rejected", count: certStatusCounts.rejected },
                    ] as const).map(({ key, label, count }) => (
                      <button
                        key={key}
                        type="button"
                        className={`relative text-center cursor-pointer rounded px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${key === certStatus ? "bg-primary border border-primary shadow-sm" : "hover:bg-muted border border-border"}`}
                        title={key === certStatus ? "Click to clear filter" : `Filter by ${label}`}
                        onClick={() => setCertStatus(key === certStatus ? "all" : key)}
                      >
                        {key === certStatus && (
                          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white leading-none border border-white/30">×</span>
                        )}
                        <div className={`text-sm font-semibold leading-tight ${key === certStatus ? "text-primary-foreground" : ""}`}>{count}</div>
                        <div className={`text-xs underline decoration-dotted ${key === certStatus ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{label}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-4 mb-4 p-3 bg-muted/40 rounded-lg border">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input
                      type="date"
                      value={certDateFrom}
                      onChange={(e) => setCertDateFrom(e.target.value)}
                      className="h-8 w-[140px] text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input
                      type="date"
                      value={certDateTo}
                      onChange={(e) => setCertDateTo(e.target.value)}
                      className="h-8 w-[140px] text-sm"
                    />
                  </div>
                  {(certDateFrom || certDateTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setCertDateFrom("");
                        setCertDateTo("");
                      }}
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (certStatus && certStatus !== "all") params.set("status", certStatus);
                      if (certDateFrom) params.set("dateFrom", certDateFrom);
                      if (certDateTo) params.set("dateTo", certDateTo);
                      const url = `${import.meta.env.BASE_URL}api/admin/certification-orders/export${params.toString() ? `?${params.toString()}` : ""}`;
                      window.open(url, "_blank");
                    }}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Export CSV
                  </Button>
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certificationsLoading ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                      ) : filteredCertifications.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">{certStatus === "all" ? "No certification applications." : "No certifications match this filter."}</TableCell></TableRow>
                      ) : (
                        filteredCertifications.map((cert) => (
                          <TableRow key={cert.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Palmtree className="h-4 w-4 text-amber-600 shrink-0" />
                                {cert.companyName}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{cert.email}</TableCell>
                            <TableCell>
                              {cert.status === "paid" && (
                                <Badge className="bg-orange-100 text-orange-800 border-0">Awaiting Review</Badge>
                              )}
                              {cert.status === "pending" && (
                                <Badge variant="outline" className="text-muted-foreground">Payment Pending</Badge>
                              )}
                              {cert.status === "approved" && (
                                <Badge className="bg-green-100 text-green-800 border-0">Approved</Badge>
                              )}
                              {cert.status === "rejected" && (
                                <Badge variant="outline" className="text-destructive">Rejected</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {format(new Date(cert.createdAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell className="text-right">
                              {cert.status === "paid" && (
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => approveCertification.mutate(cert.id)}
                                    disabled={approveCertification.isPending || rejectCertification.isPending}
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-1 text-green-600" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => rejectCertification.mutate(cert.id)}
                                    disabled={approveCertification.isPending || rejectCertification.isPending}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Reject
                                  </Button>
                                </div>
                              )}
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
                        onChange={(e) => setAnalyticsDateFrom(e.target.value)}
                        className="w-40"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="analytics-date-to" className="text-xs text-muted-foreground">To</Label>
                      <Input
                        id="analytics-date-to"
                        type="date"
                        value={analyticsDateTo}
                        onChange={(e) => setAnalyticsDateTo(e.target.value)}
                        className="w-40"
                      />
                    </div>
                    {(analyticsDateFrom || analyticsDateTo) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setAnalyticsDateFrom(""); setAnalyticsDateTo(""); }}
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
                  <CardTitle className="text-sm font-medium">Events Over Time</CardTitle>
                  <CardDescription className="text-xs">Total events per day in the selected range</CardDescription>
                </CardHeader>
                <CardContent>
                  {trendLoading ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !trendData.length ? (
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
                          tickFormatter={(v: string) => v.slice(5)}
                          interval="preserveStartEnd"
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip
                          labelFormatter={(label: string) => label}
                          formatter={(value: number) => [value, "Events"]}
                        />
                        <Bar dataKey="count" name="Events" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
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
        </Tabs>
      </div>
    </PageLayout>
  );
}
