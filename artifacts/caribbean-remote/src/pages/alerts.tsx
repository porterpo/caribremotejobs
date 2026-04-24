import { PageLayout } from "@/components/layout/PageLayout";
import { useCreateAlert, useListCategories } from "@workspace/api-client-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { BellRing, Palmtree, CheckCircle2, Zap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { useSeo } from "@/lib/seo";

const BASE = import.meta.env.BASE_URL;

interface SeekerSub { isPro: boolean; }
function useSeekerSub() {
  const { isSignedIn, isLoaded } = useUser();
  return useQuery<SeekerSub>({
    queryKey: ["seeker-subscription"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/seeker/subscription`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<SeekerSub>;
    },
    staleTime: 30_000,
    retry: false,
    enabled: isLoaded && !!isSignedIn,
  });
}

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  categories: z.array(z.string()).optional(),
  jobTypes: z.array(z.string()).optional(),
  keywords: z.string().optional(),
});

export default function Alerts() {
  useSeo({
    title: "Job Alerts | CaribRemotejobs.com",
    description:
      "Get email alerts for new remote jobs that match your preferences. Free for all candidates.",
    canonicalPath: "/alerts",
  });
  const { toast } = useToast();
  const [isSuccess, setIsSuccess] = useState(false);
  const { data: categories } = useListCategories();
  const createAlert = useCreateAlert();
  const { data: sub, isLoading: subLoading } = useSeekerSub();
  const { isSignedIn, isLoaded } = useUser();
  const isPro = sub?.isPro ?? false;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      categories: [],
      jobTypes: [],
      keywords: "",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createAlert.mutate(
      {
        data: {
          email: values.email,
          categories: values.categories?.length ? values.categories.join(",") : undefined,
          jobTypes: values.jobTypes?.length ? values.jobTypes.join(",") : undefined,
          keywords: values.keywords || undefined,
        },
      },
      {
        onSuccess: () => {
          setIsSuccess(true);
        },
        onError: (error) => {
          toast({
            title: "Error creating alert",
            description: "Something went wrong. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const jobTypesList = [
    { id: "full-time", label: "Full Time" },
    { id: "part-time", label: "Part Time" },
    { id: "contract", label: "Contract" },
    { id: "freelance", label: "Freelance" },
  ];

  return (
    <PageLayout>
      <div className="flex-1 bg-muted/20 py-12 md:py-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
              <BellRing className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Remote Job Alerts</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Get notified when top companies post remote roles that match your skills. 
              Be the first to apply to Caribbean-friendly opportunities.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <Card className="border-0 shadow-md">
                <CardContent className="p-6 md:p-8">
                  {isLoaded && isSignedIn && !subLoading && !isPro ? (
                    <div className="text-center py-8 space-y-5">
                      <div className="mx-auto w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                        <Zap className="h-7 w-7" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold mb-1">Job alerts require Seeker Pro</h2>
                        <p className="text-muted-foreground text-sm">
                          Upgrade to get personalized job alerts delivered to your inbox.
                        </p>
                      </div>
                      <ul className="text-sm text-left space-y-2 max-w-xs mx-auto">
                        {[
                          "Email alerts when matching jobs are posted",
                          "Unlimited job applications",
                          "Application history across devices",
                        ].map((b) => (
                          <li key={b} className="flex items-center gap-2 text-muted-foreground">
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            {b}
                          </li>
                        ))}
                      </ul>
                      <a href={`${BASE}seeker-pro`}>
                        <Button className="h-12 px-8 font-semibold">
                          Upgrade to Seeker Pro — $19/month
                        </Button>
                      </a>
                    </div>
                  ) : isSuccess ? (
                    <div className="text-center py-12">
                      <div className="mx-auto w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle2 className="h-8 w-8" />
                      </div>
                      <h2 className="text-2xl font-bold mb-2">You're subscribed!</h2>
                      <p className="text-muted-foreground mb-8">
                        We'll send relevant remote jobs straight to your inbox.
                      </p>
                      <Button onClick={() => {
                        form.reset();
                        setIsSuccess(false);
                      }}>
                        Create Another Alert
                      </Button>
                    </div>
                  ) : (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">Email Address *</FormLabel>
                              <FormControl>
                                <Input placeholder="you@example.com" type="email" className="h-12" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="space-y-6 pt-4 border-t">
                          <h3 className="text-lg font-semibold">Alert Preferences (Optional)</h3>
                          <p className="text-sm text-muted-foreground -mt-4">
                            Leave blank to receive all new remote jobs.
                          </p>

                          <FormField
                            control={form.control}
                            name="categories"
                            render={() => (
                              <FormItem>
                                <FormLabel className="text-base">Categories</FormLabel>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                  {categories?.map((item) => (
                                    <FormField
                                      key={item.slug}
                                      control={form.control}
                                      name="categories"
                                      render={({ field }) => {
                                        return (
                                          <FormItem
                                            key={item.slug}
                                            className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                                          >
                                            <FormControl>
                                              <Checkbox
                                                checked={field.value?.includes(item.slug)}
                                                onCheckedChange={(checked) => {
                                                  return checked
                                                    ? field.onChange([...(field.value || []), item.slug])
                                                    : field.onChange(
                                                        field.value?.filter(
                                                          (value) => value !== item.slug
                                                        )
                                                      )
                                                }}
                                              />
                                            </FormControl>
                                            <FormLabel className="font-normal cursor-pointer flex-1">
                                              {item.label}
                                            </FormLabel>
                                          </FormItem>
                                        )
                                      }}
                                    />
                                  ))}
                                </div>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="jobTypes"
                            render={() => (
                              <FormItem>
                                <FormLabel className="text-base">Job Types</FormLabel>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                  {jobTypesList.map((item) => (
                                    <FormField
                                      key={item.id}
                                      control={form.control}
                                      name="jobTypes"
                                      render={({ field }) => {
                                        return (
                                          <FormItem
                                            key={item.id}
                                            className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                                          >
                                            <FormControl>
                                              <Checkbox
                                                checked={field.value?.includes(item.id)}
                                                onCheckedChange={(checked) => {
                                                  return checked
                                                    ? field.onChange([...(field.value || []), item.id])
                                                    : field.onChange(
                                                        field.value?.filter(
                                                          (value) => value !== item.id
                                                        )
                                                      )
                                                }}
                                              />
                                            </FormControl>
                                            <FormLabel className="font-normal cursor-pointer flex-1">
                                              {item.label}
                                            </FormLabel>
                                          </FormItem>
                                        )
                                      }}
                                    />
                                  ))}
                                </div>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="keywords"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-base">Specific Keywords</FormLabel>
                                <FormDescription>e.g. "React", "Marketing", "Senior"</FormDescription>
                                <FormControl>
                                  <Input placeholder="Comma separated keywords" className="h-12" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Button type="submit" className="w-full h-14 text-base" disabled={createAlert.isPending}>
                          {createAlert.isPending ? "Subscribing..." : "Subscribe to Alerts"}
                        </Button>
                      </form>
                    </Form>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-primary text-primary-foreground border-0 shadow-md">
                <CardContent className="p-6">
                  <Palmtree className="h-10 w-10 mb-4 opacity-80" />
                  <h3 className="text-xl font-bold mb-2">Caribbean Priority</h3>
                  <p className="text-primary-foreground/90 text-sm leading-relaxed">
                    When you sign up for alerts, we'll make sure to highlight companies that have specifically signaled they are friendly to hiring talent from the Caribbean region.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="shadow-sm">
                <CardContent className="p-6">
                  <h3 className="font-bold mb-3">How it works</h3>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex gap-2"><div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">1</div> We scan hundreds of remote job boards daily</li>
                    <li className="flex gap-2"><div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">2</div> We filter out location-restricted roles</li>
                    <li className="flex gap-2"><div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">3</div> You get an email with the best matches</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
