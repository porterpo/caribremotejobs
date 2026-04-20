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
import { Loader2, Trash2, CheckCircle2, RefreshCw, Star, Building2, Palmtree, XCircle, Mail, MailX, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState, useMemo } from "react";

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

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("jobs");
  const [page, setPage] = useState(1);
  const [orderProductType, setOrderProductType] = useState("all");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");

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
                      ) : !certifications || certifications.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No certification applications.</TableCell></TableRow>
                      ) : (
                        certifications.map((cert) => (
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
                  {orders && (
                    <div className="ml-auto self-end text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{orders.length}</span> order{orders.length !== 1 ? "s" : ""}
                      {" · "}
                      <span className="font-semibold text-green-700">
                        {orders.filter(o => o.status === "paid").length} paid
                      </span>
                      {" · "}
                      <span className="font-semibold text-green-700">
                        ${(filteredRevenue / 100).toLocaleString()} revenue
                      </span>
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
        </Tabs>
      </div>
    </PageLayout>
  );
}
