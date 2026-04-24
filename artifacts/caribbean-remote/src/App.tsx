import { useEffect, useRef } from "react";
import { type ComponentType } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation, useSearch } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Jobs from "@/pages/jobs";
import JobDetail from "@/pages/job-detail";
import Alerts from "@/pages/alerts";
import Admin from "@/pages/admin";
import Unsubscribe from "@/pages/unsubscribe";
import Pricing from "@/pages/pricing";
import Success from "@/pages/success";
import PostJob from "@/pages/post-job";
import Profile from "@/pages/profile";
import Resume from "@/pages/resume";
import TagJobs from "@/pages/tag-jobs";
import TagsIndex from "@/pages/tags-index";
import SeekerPro from "@/pages/seeker-pro";
import ShareExpired from "@/pages/share-expired";

const queryClient = new QueryClient();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(190, 90%, 35%)",
    colorForeground: "hsl(220, 40%, 15%)",
    colorMutedForeground: "hsl(215, 16%, 47%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(40, 33%, 98%)",
    colorInput: "hsl(40, 33%, 98%)",
    colorInputForeground: "hsl(220, 40%, 15%)",
    colorNeutral: "hsl(210, 20%, 80%)",
    colorModalBackdrop: "rgba(13, 27, 50, 0.6)",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[hsl(220,40%,15%)] font-bold",
    headerSubtitle: "text-[hsl(215,16%,47%)]",
    socialButtonsBlockButtonText: "text-[hsl(220,40%,15%)] font-medium",
    formFieldLabel: "text-[hsl(220,40%,15%)] font-medium",
    footerActionLink: "text-[hsl(190,90%,35%)] font-medium",
    footerActionText: "text-[hsl(215,16%,47%)]",
    dividerText: "text-[hsl(215,16%,47%)]",
    identityPreviewEditButton: "text-[hsl(190,90%,35%)]",
    formFieldSuccessText: "text-green-600",
    alertText: "text-[hsl(220,40%,15%)]",
    logoBox: "justify-center",
    logoImage: "h-12 w-12",
    socialButtonsBlockButton: "border border-[hsl(210,20%,80%)] bg-white",
    formButtonPrimary: "bg-[hsl(190,90%,35%)] text-white font-semibold",
    formFieldInput: "border-[hsl(210,20%,80%)] bg-white text-[hsl(220,40%,15%)]",
    footerAction: "bg-[hsl(40,20%,96%)]",
    dividerLine: "bg-[hsl(210,20%,80%)]",
    alert: "border-[hsl(210,20%,80%)]",
    otpCodeFieldInput: "border-[hsl(210,20%,80%)] text-[hsl(220,40%,15%)]",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  const search = useSearch();
  const params = new URLSearchParams(search);
  const redirectPath = params.get("redirect");
  const forceRedirectUrl =
    redirectPath && redirectPath.startsWith("/")
      ? `${basePath}${redirectPath}`
      : undefined;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-[hsl(190,50%,95%)] to-[hsl(40,33%,98%)] px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={forceRedirectUrl}
        fallbackRedirectUrl={`${basePath}/jobs`}
      />
    </div>
  );
}

function SignUpPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-[hsl(190,50%,95%)] to-[hsl(40,33%,98%)] px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/jobs`}
      />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const [location] = useLocation();
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to={`/sign-in?redirect=${encodeURIComponent(location)}`} />
      </Show>
    </>
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/jobs" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

const SKILLS_NUDGE_DISMISSED_KEY = "cr_skills_nudge_dismissed";

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
        try {
          localStorage.removeItem(SKILLS_NUDGE_DISMISSED_KEY);
        } catch {
          // ignore
        }
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ProfileOnboardingRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const [location, navigate] = useLocation();

  const { data, status } = useQuery<{ id: number } | null>({
    queryKey: ["profile", "me"],
    queryFn: async () => {
      const res = await fetch(`${basePath ? basePath + "/" : ""}api/profile/me`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json() as Promise<{ id: number }>;
    },
    enabled: isLoaded && isSignedIn === true,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (status === "success" && data === null && location !== "/profile") {
      navigate("/profile?onboarding=true", { replace: true });
    }
  }, [status, data, location, navigate]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to find your next remote opportunity",
          },
        },
        signUp: {
          start: {
            title: "Join CaribRemotejobs.com",
            subtitle: "Create your account to access remote jobs",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <ProfileOnboardingRedirect />
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />

            <Route path="/jobs">
              {() => <ProtectedRoute component={Jobs} />}
            </Route>
            <Route path="/jobs/tags" component={TagsIndex} />
            <Route path="/jobs/tag/:tagname" component={TagJobs} />
            <Route path="/jobs/:id" component={JobDetail} />
            <Route path="/alerts" component={Alerts} />
            <Route path="/seeker-pro" component={SeekerPro} />
            <Route path="/admin">
              {() => <ProtectedRoute component={Admin} />}
            </Route>
            <Route path="/pricing">
              {() => <ProtectedRoute component={Pricing} />}
            </Route>
            <Route path="/success">
              {() => <ProtectedRoute component={Success} />}
            </Route>
            <Route path="/post-job">
              {() => <ProtectedRoute component={PostJob} />}
            </Route>
            <Route path="/profile">
              {() => <ProtectedRoute component={Profile} />}
            </Route>
            <Route path="/resume">
              {() => <ProtectedRoute component={Resume} />}
            </Route>

            {/* Email token route — stays public; accessed from email links without Clerk session */}
            <Route path="/unsubscribe/:token" component={Unsubscribe} />
            <Route path="/share-expired" component={ShareExpired} />

            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
