import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { useListCompanies } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Building2, MapPin, ExternalLink, Palmtree, Briefcase, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Companies() {
  const [search, setSearch] = useState("");
  const [caribbeanFriendly, setCaribbeanFriendly] = useState(false);

  const { data: companies, isLoading } = useListCompanies({
    ...(caribbeanFriendly ? { caribbeanFriendly: true } : {})
  });

  const filteredCompanies = companies?.filter(company => 
    !search || company.name.toLowerCase().includes(search.toLowerCase()) || 
    company.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageLayout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <div className="max-w-3xl text-center mx-auto">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">Discover Remote Companies</h1>
            <p className="text-muted-foreground text-lg mb-10">
              Explore companies that embrace remote work and hire international talent. 
              Look for the Caribbean Friendly badge to find organizations actively hiring in the region.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-2xl mx-auto">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search companies by name..."
                  className="pl-10 h-12 text-base bg-background shadow-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center space-x-2 shrink-0 bg-background border px-4 h-12 rounded-md shadow-sm">
                <Checkbox 
                  id="caribbeanFriendly" 
                  checked={caribbeanFriendly} 
                  onCheckedChange={(c) => setCaribbeanFriendly(c as boolean)} 
                />
                <Label htmlFor="caribbeanFriendly" className="font-medium cursor-pointer whitespace-nowrap">
                  Caribbean Friendly
                </Label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {isLoading ? "Loading companies..." : `${filteredCompanies?.length || 0} Companies`}
          </h2>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex gap-4 items-start mb-4">
                    <Skeleton className="h-12 w-12 rounded-lg" />
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
        ) : filteredCompanies?.length ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCompanies.map((company) => (
              <Card key={company.id} className="group hover:shadow-md transition-all hover:border-primary/30 flex flex-col h-full">
                <CardContent className="p-6 flex flex-col flex-1">
                  <div className="flex gap-4 items-start mb-4">
                    <div className="h-14 w-14 rounded-lg bg-white border flex items-center justify-center shrink-0 p-1">
                      {company.logo ? (
                        <img src={company.logo} alt={company.name} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <Link href={`/companies/${company.id}`} className="font-bold text-lg hover:text-primary transition-colors line-clamp-1">
                        {company.name}
                      </Link>
                      {company.country && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {company.country}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    {company.caribbeanFriendly && (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200 gap-1 text-xs px-2 py-0 h-6">
                        <Palmtree className="h-3 w-3" />
                        Caribbean Friendly
                      </Badge>
                    )}
                    {company.hiresBahamas && (
                      <Badge variant="outline" className="text-xs px-2 py-0 h-6">
                        Hires in Bahamas
                      </Badge>
                    )}
                  </div>
                  
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-6 flex-1">
                    {company.description || "No description provided."}
                  </p>
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      {company.jobCount} open jobs
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
        ) : (
          <div className="text-center py-16 bg-muted/30 border border-dashed rounded-xl max-w-2xl mx-auto">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No companies found</h3>
            <p className="text-muted-foreground mb-6">We couldn't find any companies matching your criteria.</p>
            <Button 
              variant="outline"
              onClick={() => {
                setSearch("");
                setCaribbeanFriendly(false);
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

