import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Palmtree, Loader2 } from "lucide-react";
import { Link } from "wouter";

export default function CertifySuccess() {
  const [location] = useLocation();
  const [status, setStatus] = useState<"loading" | "paid" | "error">("loading");
  const [companyName, setCompanyName] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) {
      setStatus("error");
      return;
    }

    fetch(`${import.meta.env.BASE_URL}api/stripe/certification-session/${sessionId}`)
      .then(res => {
        if (!res.ok) throw new Error("Not found");
        return res.json() as Promise<{ status: string; companyName: string }>;
      })
      .then(order => {
        setCompanyName(order.companyName);
        setStatus("paid");
      })
      .catch(() => setStatus("error"));
  }, [location]);

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
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild>
                  <Link href="/companies">Browse Companies</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/jobs">View Jobs</Link>
                </Button>
              </div>
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
