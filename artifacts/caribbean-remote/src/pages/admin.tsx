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
import { Loader2, Trash2, CheckCircle2, RefreshCw, Star, Building2, Palmtree } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState } from "react";

interface PendingJob {
  id: number;
  title: string;
  companyName: string;
  category: string;
  jobType: string;
  source: string;
  postedAt: string;
}

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("jobs");
  const [page, setPage] = useState(1);

  const { data: stats } = useGetStats();
  
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 w-full justify-start h-auto p-1 bg-muted/50 overflow-x-auto">
            <TabsTrigger value="pending" className="px-6 py-2">
              Pending Review
              {pendingJobs && pendingJobs.length > 0 && (
                <Badge className="ml-2 bg-orange-500 text-white text-xs px-1.5 py-0">{pendingJobs.length}</Badge>
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
