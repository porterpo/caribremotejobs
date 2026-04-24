import { useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Briefcase, Star, Package, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useSeo } from "@/lib/seo";

interface Product {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string> | null;
  prices: Array<{
    id: string;
    unit_amount: number;
    currency: string;
    recurring: { interval: string } | null;
  }>;
}

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  single: <Briefcase className="h-6 w-6" />,
  pack: <Package className="h-6 w-6" />,
  monthly: <Zap className="h-6 w-6" />,
  featured: <Star className="h-6 w-6" />,
};

const PRODUCT_HIGHLIGHTS: Record<string, string[]> = {
  single: ["1 job listing", "Caribbean Friendly badge", "Admin review within 24h", "30-day listing"],
  pack: ["3 job listings", "Caribbean Friendly badge", "Admin review within 24h", "30-day listings each"],
  monthly: ["Unlimited job postings", "Caribbean Friendly badge", "Priority review", "All listings featured"],
  featured: ["Top of board placement", "30 days featured", "Caribbean Friendly badge", "Maximum visibility"],
};

function formatPrice(unitAmount: number, currency: string, recurring: { interval: string } | null) {
  const amount = unitAmount / 100;
  return `$${amount.toFixed(0)} ${currency.toUpperCase()}${recurring ? `/${recurring.interval}` : ""}`;
}

function getProductType(metadata: Record<string, string> | null): string {
  return metadata?.type ?? "single";
}

export default function Pricing() {
  useSeo({
    title: "Post a Job — Pricing | CaribRemotejobs.com",
    description:
      "Reach Caribbean-based remote talent. Affordable single posts, packs, and unlimited monthly plans for employers.",
    canonicalPath: "/pricing",
    robots: "noindex,follow",
  });
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, isError } = useQuery<{ products: Product[] }>({
    queryKey: ["stripe-products"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/stripe/products`);
      if (!res.ok) throw new Error("Failed to load products");
      return res.json();
    },
  });

  const checkout = useMutation({
    mutationFn: async ({ priceId, email }: { priceId: string; email: string }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, email }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Checkout failed");
      }
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    },
  });

  const handleBuyClick = (product: Product) => {
    setSelectedProduct(product);
    setEmailError("");
    setDialogOpen(true);
  };

  const handleCheckout = () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    if (!selectedProduct) return;
    const price = selectedProduct.prices[0];
    if (!price) return;
    checkout.mutate({ priceId: price.id, email });
  };

  const products = (data?.products ?? []).filter(p => p.metadata?.type !== "seeker_pro");

  const ORDER: Record<string, number> = { single: 0, pack: 1, monthly: 2, featured: 3 };
  const sorted = [...products].sort((a, b) => {
    const ta = getProductType(a.metadata);
    const tb = getProductType(b.metadata);
    return (ORDER[ta] ?? 99) - (ORDER[tb] ?? 99);
  });

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">Post Your Job to the Caribbean</h1>
          <p className="text-lg text-muted-foreground">
            Reach thousands of qualified remote professionals across the Caribbean and Bahamas.
            Choose a plan that works for your hiring needs.
          </p>
        </div>

        {isLoading && (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="text-center py-24 text-muted-foreground">
            <p>Failed to load pricing. Please refresh the page.</p>
            <p className="text-sm mt-2">If this persists, the payment system may not be configured yet.</p>
          </div>
        )}

        {!isLoading && !isError && sorted.length === 0 && (
          <div className="text-center py-24 text-muted-foreground">
            <p>Pricing packages coming soon. Check back shortly.</p>
          </div>
        )}

        {sorted.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {sorted.map((product) => {
              const type = getProductType(product.metadata);
              const price = product.prices[0];
              const isPopular = type === "pack";
              const highlights = PRODUCT_HIGHLIGHTS[type] ?? [];

              return (
                <Card
                  key={product.id}
                  className={`relative flex flex-col ${isPopular ? "border-primary shadow-lg ring-2 ring-primary" : ""}`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground px-3 py-1">Most Popular</Badge>
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${isPopular ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {PRODUCT_ICONS[type]}
                    </div>
                    <CardTitle className="text-lg">{product.name}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">{product.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    {price && (
                      <div className="mb-4">
                        <span className="text-3xl font-extrabold">{formatPrice(price.unit_amount, price.currency, price.recurring)}</span>
                      </div>
                    )}
                    <ul className="space-y-2">
                      {highlights.map((point) => (
                        <li key={point} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full"
                      variant={isPopular ? "default" : "outline"}
                      onClick={() => handleBuyClick(product)}
                      disabled={!price}
                      data-testid={`buy-${type}`}
                    >
                      {price ? "Get Started" : "Coming Soon"}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-16 text-center text-sm text-muted-foreground">
          <p>All listings are reviewed by our team within 24 hours. Questions? Contact us at <a href="mailto:hello@caribremotejobs.com" className="underline hover:text-foreground">hello@caribremotejobs.com</a></p>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter your email to continue</DialogTitle>
            <DialogDescription>
              We'll use this to send your receipt and link your order to your job submission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="checkout-email">Email address</Label>
            <Input
              id="checkout-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
              data-testid="checkout-email"
            />
            {emailError && <p className="text-sm text-destructive">{emailError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCheckout} disabled={checkout.isPending} data-testid="confirm-checkout">
              {checkout.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Proceed to Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
