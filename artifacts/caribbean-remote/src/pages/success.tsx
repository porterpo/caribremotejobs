import { useEffect, useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, Loader2, AlertCircle, Mail } from "lucide-react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/lib/seo";

interface JobOrder {
  id: number;
  email: string;
  stripeSessionId: string;
  productType: string;
  status: string;
  jobsRemaining: number;
}

type ResendState = "idle" | "loading" | "success" | "error" | "rate_limited";

export default function Success() {
  useSeo({
    title: "Order Confirmed | CaribRemotejobs.com",
    description: "Your job posting order has been received.",
    canonicalPath: "/success",
    robots: "noindex,nofollow",
  });
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("session_id");
  const [resendState, setResendState] = useState<ResendState>("idle");
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);

  useEffect(() => {
    if (resendState !== "rate_limited") return;
    const timer = setInterval(() => {
      setRateLimitSeconds((s) => {
        if (s <= 1) {
          setResendState("idle");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendState]);

  async function handleResend() {
    if (!sessionId || resendState === "loading") return;
    setResendState("loading");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/stripe/resend-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (res.status === 429) {
        const data = await res.json();
        setRateLimitSeconds(data.secondsLeft ?? 60);
        setResendState("rate_limited");
        return;
      }
      if (!res.ok) throw new Error("Failed");
      setResendState("success");
    } catch {
      setResendState("error");
    }
  }

  const { data: order, isLoading, isError, refetch } = useQuery<JobOrder>({
    queryKey: ["order", sessionId],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/stripe/session/${sessionId}`);
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    },
    enabled: !!sessionId,
    refetchInterval: (query) => {
      if (query.state.data?.status === "paid") return false;
      return 2000;
    },
  });

  useEffect(() => {
    if (sessionId) {
      const timer = setTimeout(refetch, 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [sessionId, refetch]);

  if (!sessionId) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-24 text-center text-muted-foreground">
          <p>No order found. <Link href="/pricing" className="underline text-foreground">Go to pricing</Link></p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-24 max-w-lg">
        {isLoading && (
          <Card className="text-center">
            <CardContent className="py-12">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
              <p className="font-medium">Confirming your payment…</p>
              <p className="text-sm text-muted-foreground mt-1">This usually takes a few seconds.</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && order?.status === "pending" && (
          <Card className="text-center">
            <CardContent className="py-12">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
              <p className="font-medium">Processing payment…</p>
              <p className="text-sm text-muted-foreground mt-1">Stripe is confirming your payment. Please wait.</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && order?.status === "paid" && (
          <Card>
            <CardHeader className="text-center pb-4">
              <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-3" />
              <CardTitle className="text-2xl">Payment Confirmed!</CardTitle>
              <CardDescription>
                Your order is ready. Fill in your job details below and we'll review it within 24 hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-lg bg-muted p-4 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order ID</span>
                  <span className="font-medium">#{order.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{order.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Job slots remaining</span>
                  <span className="font-medium">{order.jobsRemaining}</span>
                </div>
              </div>
              <Button asChild size="lg" className="w-full" data-testid="post-job-btn">
                <Link href={`/post-job?sessionId=${sessionId}`}>
                  {order.productType === "featured" ? "Apply Featured Upgrade" : "Post Your Job Now"}
                </Link>
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResend}
                disabled={resendState === "loading" || resendState === "success" || resendState === "rate_limited"}
                data-testid="resend-confirmation-btn"
              >
                {resendState === "loading" ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending…</>
                ) : resendState === "success" ? (
                  <><CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />Email sent!</>
                ) : resendState === "rate_limited" ? (
                  <><AlertCircle className="h-4 w-4 mr-2 text-amber-500" />Please wait {rateLimitSeconds}s before resending</>
                ) : resendState === "error" ? (
                  <><AlertCircle className="h-4 w-4 mr-2 text-destructive" />Failed — try again</>
                ) : (
                  <><Mail className="h-4 w-4 mr-2" />Resend confirmation email</>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                You can return to this page later using your confirmation email.
              </p>
            </CardContent>
          </Card>
        )}

        {(isError || (!isLoading && !order)) && (
          <Card className="text-center">
            <CardContent className="py-12">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
              <p className="font-medium">Could not confirm your order</p>
              <p className="text-sm text-muted-foreground mt-1 mb-6">
                Your payment may still be processing. Check your email for a receipt.
              </p>
              <Button variant="outline" onClick={() => refetch()}>Try Again</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
