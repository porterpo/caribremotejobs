import { PageLayout } from "@/components/layout/PageLayout";
import { useListCompanies } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, MapPin, Briefcase, ArrowRight, Palmtree, ShieldCheck, Star } from "lucide-react";
import { Link } from "wouter";

export default function Certified() {
  const { data: companies, isLoading } = useListCompanies({ caribbeanFriendly: true });

  const certifiedCompanies = companies?.filter((c) => c.caribbeanFriendlyCertified);

  return (
    <PageLayout>
      <div className="bg-gradient-to-b from-amber-50 to-background border-b">
        <div className="container mx-auto px-4 py-16 md:py-24 text-center">
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1.5 mb-6 px-4 py-1.5 text-sm inline-flex">
            <Palmtree className="h-4 w-4" />
            Caribbean Friendly Certified
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Certified Employers
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
            These companies have earned the Caribbean Friendly Certified badge by demonstrating a genuine commitment to hiring and supporting talent from across the Caribbean region.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild className="bg-amber-600 hover:bg-amber-700 text-white">
              <Link href="/certify">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Get Your Company Certified
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/companies">Browse All Companies</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex gap-4 items-start mb-4">
                    <Skeleton className="h-16 w-16 rounded-xl" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="h-16 w-full mb-4" />
                  <Skeleton className="h-8 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : certifiedCompanies?.length ? (
          <>
            <div className="mb-6 flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                <span className="font-semibold text-foreground">{certifiedCompanies.length}</span>{" "}
                {certifiedCompanies.length === 1 ? "company" : "companies"} certified
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {certifiedCompanies.map((company) => (
                <Card
                  key={company.id}
                  className="group hover:shadow-lg transition-all hover:border-amber-300 flex flex-col h-full border-2"
                >
                  <CardContent className="p-6 flex flex-col flex-1">
                    <div className="flex gap-4 items-start mb-4">
                      <div className="h-16 w-16 rounded-xl bg-white border-2 border-amber-100 flex items-center justify-center shrink-0 p-1.5 shadow-sm">
                        {company.logo ? (
                          <img
                            src={company.logo}
                            alt={company.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <Building2 className="h-7 w-7 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/companies/${company.id}`}
                          className="font-bold text-lg hover:text-primary transition-colors line-clamp-1 block"
                        >
                          {company.name}
                        </Link>
                        {company.country && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            {company.country}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mb-4">
                      <Badge className="bg-amber-500 text-white hover:bg-amber-600 border-amber-500 gap-1 text-xs px-2.5 py-0.5">
                        <Palmtree className="h-3 w-3" />
                        CF Certified
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-3 mb-6 flex-1">
                      {company.description || "No description provided."}
                    </p>

                    <div className="flex items-center justify-between mt-auto pt-4 border-t">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        {company.jobCount} open {company.jobCount === 1 ? "job" : "jobs"}
                      </div>
                      <Button variant="ghost" size="sm" asChild className="group-hover:text-primary">
                        <Link href={`/companies/${company.id}`}>
                          View Profile <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-20 bg-amber-50/50 border border-amber-100 border-dashed rounded-xl max-w-2xl mx-auto">
            <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <Star className="h-8 w-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No certified companies yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Be the first to earn the Caribbean Friendly Certified badge and gain premium visibility.
            </p>
            <Button asChild className="bg-amber-600 hover:bg-amber-700 text-white">
              <Link href="/certify">Get Certified</Link>
            </Button>
          </div>
        )}
      </div>

      <div className="bg-amber-50 border-t mt-8">
        <div className="container mx-auto px-4 py-12 text-center">
          <h2 className="text-2xl font-bold mb-3">Is your company Caribbean Friendly?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Join the certified employers above and show Caribbean job seekers that your company values their talent and their region.
          </p>
          <Button asChild size="lg" className="bg-amber-600 hover:bg-amber-700 text-white">
            <Link href="/certify">
              <Palmtree className="mr-2 h-5 w-5" />
              Learn About Certification
            </Link>
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
