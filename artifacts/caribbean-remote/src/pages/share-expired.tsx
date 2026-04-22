import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function ShareExpired() {
  return (
    <PageLayout>
      <div className="flex-1 flex items-center justify-center bg-muted/20 py-20 px-4">
        <Card className="max-w-md w-full border-0 shadow-lg text-center">
          <CardContent className="p-8 md:p-12">
            <div className="py-4">
              <div className="mx-auto w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-6">
                <Clock className="h-10 w-10" />
              </div>
              <h1 className="text-2xl font-bold mb-3">This resume link has expired</h1>
              <p className="text-muted-foreground mb-8">
                The share link you opened is no longer valid. Please reach out
                to the candidate directly and ask them to send you a fresh link
                to their resume.
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
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
