import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Zap, BellRing, Loader2, Sparkles, Globe, Shield, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL;

interface SeekerSubscription {
  status: string;
  isPro: boolean;
  currentPeriodEnd: string | null;
  applicationCount: number;
  applicationLimit: number | null;
}

interface StripeProductPrice {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string } | null;
}

interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string> | null;
  prices: StripeProductPrice[];
}

const BENEFITS = [
  {
    icon: <Zap className="h-5 w-5 text-primary" />,
    title: "Unlimited applications",
    description: "Apply to as many roles as you want — no weekly cap.",
  },
  {
    icon: <BellRing className="h-5 w-5 text-primary" />,
    title: "Custom job alerts",
    description: "Get emailed when new jobs matching your skills are posted.",
  },
  {
    icon: <Globe className="h-5 w-5 text-primary" />,
    title: "Application history across devices",
    description: "Your applied-jobs list syncs everywhere you sign in.",
  },
  {
    icon: <Shield className="h-5 w-5 text-primary" />,
    title: "Priority seeker support",
    description: "Direct support channel for Pro members.",
  },
];

export default function SeekerPro() {
  const { isSignedIn, isLoaded } = useUser();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(window.location.search);
  const isSuccess = searchParams.get("success") === "1";
  const isCanceled = searchParams.get("canceled") === "1";

  useEffect(() => {
    if (isSuccess) {
      void queryClient.invalidateQueries({ queryKey: ["seeker-subscription"] });
    }
  }, [isSuccess, queryClient]);

  const { data: sub, isLoading: subLoading } = useQuery<SeekerSubscription>({
    queryKey: ["seeker-subscription"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/seeker/subscription`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: isLoaded && !!isSignedIn,
    staleTime: isSuccess ? 0 : 30_000,
  });

  const { data: productsData } = useQuery<{ products: StripeProduct[] }>({
    queryKey: ["stripe-products"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/stripe/products`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const seekerProProduct = productsData?.products?.find(
    (p) => p.metadata?.type === "seeker_pro"
  );
  const seekerProPrice = seekerProProduct?.prices?.[0];
  const displayPrice = seekerProPrice
    ? `$${Math.floor(seekerProPrice.unit_amount / 100)}`
    : "$19";

  const checkout = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/stripe/seeker-checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
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

  const portal = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/stripe/seeker-portal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to open billing portal");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isPro = sub?.isPro ?? false;

  return (
    <PageLayout>
      <div className="flex-1 bg-gradient-to-b from-muted/30 to-background py-12 md:py-20">
        <div className="container mx-auto px-4 max-w-4xl">
          {isSuccess && (
            <div className="mb-8 flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 text-green-800 px-5 py-4">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">You're now a Seeker Pro member!</p>
                <p className="text-sm text-green-700">Unlimited applications and job alerts are now active on your account.</p>
              </div>
            </div>
          )}

          {isCanceled && (
            <div className="mb-8 flex items-center gap-3 rounded-xl bg-muted border px-5 py-4 text-muted-foreground">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm">Checkout was cancelled. Your account was not charged.</p>
            </div>
          )}

          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
              Seeker Pro
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Everything you need to land your next remote role from the Caribbean.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Benefits list */}
            <div className="space-y-5">
              {BENEFITS.map((b) => (
                <div key={b.title} className="flex gap-4">
                  <div className="mt-0.5 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {b.icon}
                  </div>
                  <div>
                    <p className="font-semibold">{b.title}</p>
                    <p className="text-sm text-muted-foreground">{b.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Subscription card */}
            <Card className="border-primary/20 shadow-lg">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <CardTitle className="text-2xl">Seeker Pro</CardTitle>
                  <Badge className="bg-primary/10 text-primary border-primary/20">Monthly</Badge>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">{displayPrice}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {BENEFITS.map((b) => (
                    <li key={b.title} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      {b.title}
                    </li>
                  ))}
                </ul>

                {!isLoaded || subLoading ? (
                  <Button className="w-full" disabled>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                  </Button>
                ) : !isSignedIn ? (
                  <Button className="w-full" onClick={() => navigate(`/sign-in?redirect=${encodeURIComponent("/seeker-pro")}`)}>
                    Sign in to Subscribe
                  </Button>
                ) : isPro ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-green-800">Active subscription</p>
                        {sub?.currentPeriodEnd && (
                          <p className="text-xs text-green-700">
                            Renews {format(new Date(sub.currentPeriodEnd), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => portal.mutate()}
                      disabled={portal.isPending}
                    >
                      {portal.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Manage Subscription
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sub && (sub.applicationCount ?? 0) > 0 && (
                      <p className="text-xs text-center text-muted-foreground">
                        You've used <strong>{sub.applicationCount}</strong> of{" "}
                        <strong>{sub.applicationLimit}</strong> free applications this week.
                      </p>
                    )}
                    <Button
                      className="w-full h-12 text-base font-semibold"
                      onClick={() => checkout.mutate()}
                      disabled={checkout.isPending}
                    >
                      {checkout.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting…</>
                      ) : (
                        `Subscribe — ${displayPrice}/month`
                      )}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      Cancel anytime. Billed monthly.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
