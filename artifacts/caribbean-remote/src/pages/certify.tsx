import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Palmtree, CheckCircle2, Star, Users, Globe, ShieldCheck, Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const BENEFITS = [
  {
    icon: ShieldCheck,
    title: "Official Certified Badge",
    description: "Display the Caribbean Friendly Certified badge on your company profile and all job listings.",
  },
  {
    icon: Users,
    title: "Attract Caribbean Talent",
    description: "Stand out to thousands of Caribbean job seekers actively looking for employers who value their region.",
  },
  {
    icon: Star,
    title: "Boosted Visibility",
    description: "Your company and jobs rank higher in Caribbean Friendly filtered searches.",
  },
  {
    icon: Globe,
    title: "Dedicated Company Profile",
    description: "Appear prominently in the companies directory with your certification highlighted.",
  },
];

export default function Certify() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !companyName) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const productsRes = await fetch(`${import.meta.env.BASE_URL}api/stripe/products`);
      if (!productsRes.ok) throw new Error("Failed to load products");
      const { products } = await productsRes.json() as {
        products: Array<{
          id: string;
          name: string;
          metadata: Record<string, string> | null;
          prices: Array<{ id: string; unit_amount: number; recurring: { interval: string } | null }>;
        }>;
      };

      const certProduct = products.find(p => p.metadata?.type === "certification");
      if (!certProduct || !certProduct.prices.length) {
        toast({ title: "Certification product not available", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const priceId = certProduct.prices[0].id;

      const checkoutRes = await fetch(`${import.meta.env.BASE_URL}api/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, email, companyName }),
      });

      if (!checkoutRes.ok) {
        const err = await checkoutRes.json() as { error?: string };
        throw new Error(err.error || "Failed to create checkout session");
      }

      const { url } = await checkoutRes.json() as { url: string };
      window.location.href = url;
    } catch (err) {
      toast({
        title: "Something went wrong",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <PageLayout>
      <div className="bg-gradient-to-b from-amber-50 to-background border-b">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1.5 mb-6 px-4 py-1.5 text-sm">
              <Palmtree className="h-4 w-4" />
              Caribbean Friendly Certification
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Show Your Commitment to Caribbean Hiring
            </h1>
            <p className="text-lg text-muted-foreground mb-4 leading-relaxed">
              The Caribbean Friendly Certification is a mark of distinction for employers who actively hire, support, and champion talent from the Caribbean region. Become certified and be recognized by thousands of job seekers who are looking for companies like yours.
            </p>
            <div className="flex items-center justify-center gap-2 text-3xl font-bold text-foreground mt-8">
              $199
              <span className="text-base font-normal text-muted-foreground">/year</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Renews annually. Cancel any time.</p>
            <div className="mt-6">
              <Link
                href="/certified"
                className="inline-flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-900 font-medium transition-colors"
              >
                See who's already certified
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
          <div>
            <h2 className="text-2xl font-bold mb-8">What you get</h2>
            <div className="space-y-6">
              {BENEFITS.map((benefit) => (
                <div key={benefit.title} className="flex gap-4">
                  <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <benefit.icon className="h-5 w-5 text-amber-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{benefit.title}</h3>
                    <p className="text-sm text-muted-foreground">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 p-5 bg-muted/50 rounded-xl border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                How it works
              </h3>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>Complete your purchase below</li>
                <li>Our team reviews your application within 2 business days</li>
                <li>Upon approval, your badge appears instantly on your company profile and job listings</li>
                <li>Your certification renews annually at $199/year</li>
              </ol>
            </div>
          </div>

          <div>
            <Card className="shadow-lg border-2">
              <CardHeader>
                <CardTitle className="text-xl">Get Certified Today</CardTitle>
                <CardDescription>
                  Enter your details to begin the certification process. You'll be redirected to our secure payment page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCheckout} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      placeholder="Acme Corporation"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Work Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@yourcompany.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    size="lg"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Palmtree className="mr-2 h-4 w-4" />
                        Get Certified — $199/year
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Secure payment via Stripe. Certification is subject to review and approval.
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
