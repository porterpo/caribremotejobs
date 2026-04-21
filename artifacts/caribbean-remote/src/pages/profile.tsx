import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface ProfileData {
  id: number;
  clerkUserId: string;
  displayName: string | null;
  headline: string | null;
  location: string | null;
  bio: string | null;
  linkedIn: string | null;
  website: string | null;
}

interface FormState {
  displayName: string;
  headline: string;
  location: string;
  bio: string;
  linkedIn: string;
  website: string;
}

const emptyForm: FormState = {
  displayName: "",
  headline: "",
  location: "",
  bio: "",
  linkedIn: "",
  website: "",
};

const BASE = import.meta.env.BASE_URL;

export default function ProfilePage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const isOnboarding = params.get("onboarding") === "true";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, status } = useQuery<ProfileData | null>({
    queryKey: ["profile", "me"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/profile/me`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json() as Promise<ProfileData>;
    },
    staleTime: 30_000,
    retry: false,
  });

  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (profile) {
      setForm({
        displayName: profile.displayName ?? "",
        headline: profile.headline ?? "",
        location: profile.location ?? "",
        bio: profile.bio ?? "",
        linkedIn: profile.linkedIn ?? "",
        website: profile.website ?? "",
      });
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const isNew = profile === null;
      const res = await fetch(`${BASE}api/profile`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to save profile");
      }
      return res.json() as Promise<ProfileData>;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["profile", "me"], saved);
      toast({ title: "Profile saved", description: "Your profile has been updated." });
      if (isOnboarding) {
        navigate("/jobs");
      }
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleChange = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const isLoading = status === "pending";

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto px-4 py-10 w-full">
        <div className="mb-8">
          {isOnboarding ? (
            <>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Let's get you set up
              </h1>
              <p className="text-muted-foreground">
                Tell employers a bit about yourself. You can update this any time.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-foreground mb-2">My Profile</h1>
              <p className="text-muted-foreground">
                Keep your profile up to date so employers can find you.
              </p>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                placeholder="e.g. Marcus Thompson"
                value={form.displayName}
                onChange={handleChange("displayName")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="headline">Headline</Label>
              <Input
                id="headline"
                placeholder="e.g. Full-Stack Engineer based in Barbados"
                value={form.headline}
                onChange={handleChange("headline")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="e.g. Bridgetown, Barbados"
                value={form.location}
                onChange={handleChange("location")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Short bio</Label>
              <Textarea
                id="bio"
                placeholder="A few sentences about your background and what you're looking for…"
                rows={4}
                value={form.bio}
                onChange={handleChange("bio")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedIn">LinkedIn URL</Label>
              <Input
                id="linkedIn"
                type="url"
                placeholder="https://linkedin.com/in/your-name"
                value={form.linkedIn}
                onChange={handleChange("linkedIn")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Personal website</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://yoursite.com"
                value={form.website}
                onChange={handleChange("website")}
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? "Saving…"
                  : isOnboarding
                  ? "Save & browse jobs"
                  : "Save profile"}
              </Button>
              {!isOnboarding && (
                <Button type="button" variant="ghost" onClick={() => navigate("/jobs")}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </PageLayout>
  );
}
