import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Palmtree, Loader2, Mail, AlertCircle } from "lucide-react";
import { Link } from "wouter";

type ResendState = "idle" | "loading" | "success" | "error" | "rate_limited";

export default function CertifySuccess() {
  const [location] = useLocation();
  const [status, setStatus] = useState<"loading" | "paid" | "error">("loading");
  const [companyName, setCompanyName] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resendState, setResendState] = useState<ResendState>("idle");
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    if (!sid) {
      setStatus("error");
      return;
    }
    setSessionId(sid);

    fetch(`${import.meta.env.BASE_URL}api/stripe/certification-session/${sid}`)
      .then(res => {
        if (!res.ok) throw new Error("Not found");
        return res.json() as Promise<{ status: string; companyName: string }>;
      })
      .then(order => {
        if (order.status !== "paid") {
          setStatus("error");
          return;
        }
        setCompanyName(order.companyName);
        setStatus("paid");
      })
      .catch(() => setStatus("error"));
  }, [location]);

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
      const res = await fetch(`${import.meta.env.BASE_URL}api/stripe/resend-certification-confirmation`, {
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

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-24">
        <div className="max-w-lg mx-auto text-center">
          {status === "loading" && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Confirming your payment...</span>
            </div>
          )}

          {status === "paid" && (
            <>
              <div className="flex justify-center mb-6">
                <div className="h-20 w-20 rounded-full bg-amber-100 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-amber-700" />
                </div>
              </div>
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1.5 mb-4 px-4 py-1.5">
                <Palmtree className="h-4 w-4" />
                Application Received
              </Badge>
              <h1 className="text-3xl font-bold mb-4">You're on your way!</h1>
              <p className="text-muted-foreground mb-4">
                We've received your Caribbean Friendly Certification application
                {companyName ? ` for ${companyName}` : ""}. Our team will review it within 2 business days.
              </p>
              <p className="text-sm text-muted-foreground mb-8">
                Once approved, your Caribbean Friendly Certified badge will appear automatically on your company profile and all job listings.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
                <Button asChild>
                  <Link href="/companies">Browse Companies</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/jobs">View Jobs</Link>
                </Button>
              </div>
              <Button
                variant="ghost"
                className="w-full sm:w-auto text-muted-foreground"
                onClick={handleResend}
                disabled={resendState === "loading" || resendState === "success" || resendState === "rate_limited"}
                data-testid="resend-certification-btn"
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
            </>
          )}

          {status === "error" && (
            <>
              <h1 className="text-3xl font-bold mb-4">Something went wrong</h1>
              <p className="text-muted-foreground mb-8">
                We couldn't verify your payment. If you completed checkout, please contact us and we'll sort it out right away.
              </p>
              <Button asChild>
                <Link href="/certify">Try Again</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
