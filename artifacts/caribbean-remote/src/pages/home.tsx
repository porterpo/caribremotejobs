import { PageLayout } from "@/components/layout/PageLayout";
import { useGetStats, useListFeaturedJobs, useListRecentJobs, useListCategories, useGetStatsByCategory } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { JobCard } from "@/components/JobCard";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Palmtree, ArrowRight, Briefcase, Globe, Search, ArrowUpRight, BellRing, Tag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: featuredJobs, isLoading: featuredLoading } = useListFeaturedJobs();
  const { data: recentJobs, isLoading: recentLoading } = useListRecentJobs();
  const { data: categories, isLoading: categoriesLoading } = useListCategories();
  const { data: tags, isLoading: tagsLoading } = useQuery({
    queryKey: ["job-tags"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/jobs/tags`);
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json() as Promise<Array<{ tag: string; count: number }>>;
    },
    staleTime: 60_000,
  });

  return (
    <PageLayout>
      <div className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="relative py-20 lg:py-32 overflow-hidden bg-background border-b">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background opacity-70 pointer-events-none" />
          
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent font-medium text-sm mb-6 border border-accent/20">
                <Palmtree className="h-4 w-4" />
                <span>The gateway to global remote work</span>
              </div>
              
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 text-foreground">
                Work globally.<br />
                <span className="text-primary">Live locally.</span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
                Connect with international companies hiring remote talent from the Caribbean. Build a world-class career without leaving the islands you love.
              </p>
              
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 mb-12">
                <Button size="lg" asChild className="text-base h-12 sm:h-14 px-6 sm:px-8 w-full sm:w-auto justify-center">
                  <Link href="/jobs">Browse Opportunities</Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-base h-12 sm:h-14 px-6 sm:px-8 w-full sm:w-auto justify-center bg-background">
                  <Link href="/alerts">Get Job Alerts</Link>
                </Button>
              </div>
              
              {/* Stats */}
              {!statsLoading && stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 border-t border-border/60">
                  <div>
                    <div className="text-3xl font-bold text-foreground mb-1">{stats.totalJobs}</div>
                    <div className="text-sm text-muted-foreground font-medium">Active Jobs</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-primary mb-1">{stats.caribbeanFriendlyJobs}</div>
                    <div className="text-sm text-muted-foreground font-medium">Caribbean Friendly</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-foreground mb-1">{stats.totalCompanies}</div>
                    <div className="text-sm text-muted-foreground font-medium">Companies</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-accent mb-1">+{stats.newJobsThisWeek}</div>
                    <div className="text-sm text-muted-foreground font-medium">New This Week</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Featured Jobs */}
        <section className="py-16 md:py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-3xl font-bold tracking-tight mb-2">Featured Opportunities</h2>
                <p className="text-muted-foreground">Hand-picked remote roles for Caribbean professionals.</p>
              </div>
              <Button variant="ghost" className="hidden sm:flex" asChild>
                <Link href="/jobs?featured=true">
                  View all <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {featuredLoading ? (
              <div className="grid gap-4">
                {[1, 2, 3].map(i => <div key={i} className="h-[120px] rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : featuredJobs && featuredJobs.length > 0 ? (
              <div className="grid gap-4">
                {featuredJobs.slice(0, 5).map(job => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-background rounded-xl border border-dashed">
                <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-foreground mb-1">No featured jobs right now</h3>
                <p className="text-muted-foreground">Check back soon for new opportunities.</p>
              </div>
            )}
            
            <div className="mt-8 text-center sm:hidden">
              <Button variant="outline" className="w-full" asChild>
                <Link href="/jobs?featured=true">View all featured jobs</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="py-16 md:py-24 bg-background">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold tracking-tight mb-10 text-center">Top Categories</h2>
            
            {categoriesLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : categories && categories.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {categories.slice(0, 8).map(category => (
                  <Link key={category.slug} href={`/jobs?category=${category.slug}`}>
                    <Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer h-full group">
                      <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full gap-2">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">{category.label}</h3>
                        <Badge variant="secondary" className="bg-muted">{category.count} jobs</Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/* Popular Skills */}
        {(tagsLoading || (tags && tags.length > 0)) && (
          <section className="py-16 md:py-24 bg-muted/30 border-t">
            <div className="container mx-auto px-4">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight mb-2">Browse by Skill</h2>
                  <p className="text-muted-foreground">Explore jobs by the most in-demand skills.</p>
                </div>
                <Button variant="ghost" className="hidden sm:flex" asChild>
                  <Link href="/jobs/tags">
                    See all tags <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              {tagsLoading ? (
                <div className="flex flex-wrap gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                    <div key={i} className="h-9 w-24 rounded-full bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {tags!.slice(0, 10).map(tag => (
                    <Link key={tag.tag} href={`/jobs/tag/${encodeURIComponent(tag.tag)}`}>
                      <Badge
                        variant="secondary"
                        className="px-4 py-2 text-sm font-medium cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors rounded-full border border-border/60"
                      >
                        <Tag className="h-3 w-3 mr-1.5 opacity-60" />
                        {tag.tag}
                        <span className="ml-1.5 opacity-60 text-xs">({tag.count})</span>
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}

              <div className="mt-6 sm:hidden">
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/jobs/tags">See all tags</Link>
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Recent Jobs */}
        <section className="py-16 md:py-24 bg-muted/30 border-t">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-3xl font-bold tracking-tight mb-2">Latest Remote Jobs</h2>
                <p className="text-muted-foreground">The newest opportunities added to our board.</p>
              </div>
              <Button variant="ghost" className="hidden sm:flex" asChild>
                <Link href="/jobs">
                  View all <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {recentLoading ? (
              <div className="grid gap-4">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-[120px] rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : recentJobs && recentJobs.length > 0 ? (
              <div className="grid gap-4">
                {recentJobs.slice(0, 5).map(job => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-background rounded-xl border border-dashed">
                <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-foreground mb-1">No jobs found</h3>
                <p className="text-muted-foreground">Check back soon for new opportunities.</p>
              </div>
            )}
            
            <div className="mt-10 flex justify-center">
              <Button size="lg" asChild className="min-w-[200px]">
                <Link href="/jobs">Browse all {stats?.totalJobs || ''} jobs</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-primary text-primary-foreground relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1590492813587-8df1da88b14a?q=80&w=2070&auto=format&fit=crop')] opacity-10 bg-cover bg-center mix-blend-overlay" />
          <div className="container mx-auto px-4 relative z-10 text-center max-w-2xl">
            <BellRing className="h-12 w-12 mx-auto mb-6 opacity-90" />
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Never miss a remote opportunity</h2>
            <p className="text-primary-foreground/80 text-lg mb-8">
              Get personalized job alerts sent directly to your inbox. Be the first to apply to Caribbean-friendly remote roles.
            </p>
            <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90 h-14 px-8 text-base font-semibold" asChild>
              <Link href="/alerts">Set up Job Alerts</Link>
            </Button>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
