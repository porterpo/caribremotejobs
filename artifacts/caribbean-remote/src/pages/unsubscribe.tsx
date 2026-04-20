import { useRoute, Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { BellOff, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useUnsubscribeAlert, getUnsubscribeAlertQueryKey } from "@workspace/api-client-react";

export default function Unsubscribe() {
  const [, params] = useRoute("/unsubscribe/:token");
  const token = params?.token ?? "";

  const { data, isLoading, isError } = useUnsubscribeAlert(token, {
    query: {
      enabled: !!token,
      queryKey: getUnsubscribeAlertQueryKey(token),
    },
  });

  const status = isLoading ? "loading" : isError ? "error" : data?.success ? "success" : "error";
  const message = data?.message ?? (isError ? "An error occurred while processing your request." : "");

  return (
    <PageLayout>
      <div className="flex-1 flex items-center justify-center bg-muted/20 py-20 px-4">
        <Card className="max-w-md w-full border-0 shadow-lg text-center">
          <CardContent className="p-8 md:p-12">
            {status === "loading" ? (
              <div className="py-8 animate-pulse">
                <div className="h-16 w-16 bg-muted rounded-full mx-auto mb-6" />
                <div className="h-6 w-3/4 bg-muted mx-auto mb-3 rounded" />
                <div className="h-4 w-1/2 bg-muted mx-auto rounded" />
              </div>
            ) : status === "success" ? (
              <div className="py-4">
                <div className="mx-auto w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h1 className="text-2xl font-bold mb-3">Unsubscribed</h1>
                <p className="text-muted-foreground mb-8">
                  {message}
                </p>
                <div className="flex flex-col gap-3">
                  <Button asChild className="w-full">
                    <Link href="/">Return to Homepage</Link>
                  </Button>
                  <Button variant="outline" asChild className="w-full">
                    <Link href="/jobs">Browse Jobs Instead</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-4">
                <div className="mx-auto w-20 h-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-6">
                  <BellOff className="h-10 w-10" />
                </div>
                <h1 className="text-2xl font-bold mb-3">Unable to Unsubscribe</h1>
                <p className="text-muted-foreground mb-8">
                  {message}
                </p>
                <Button asChild className="w-full">
                  <Link href="/">Return to Homepage</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
