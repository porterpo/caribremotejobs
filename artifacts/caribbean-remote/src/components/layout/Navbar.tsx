import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Briefcase, Building2, BellRing, Settings, Menu, DollarSign, LogOut, ChevronDown, User, FileText, Tag } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { useUser, useClerk, Show } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProfileData {
  displayName: string | null;
}

function UserMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  const { data: profile } = useQuery<ProfileData | null>({
    queryKey: ["profile", "me"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/profile/me`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json() as Promise<ProfileData>;
    },
    enabled: isLoaded && !!user,
    staleTime: 30_000,
    retry: false,
  });

  if (!isLoaded || !user) return null;

  const clerkFallback =
    user.firstName ||
    user.username ||
    user.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "Account";
  const displayName = profile?.displayName || clerkFallback;
  const initials =
    ((user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")) ||
    displayName[0]?.toUpperCase() ||
    "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full pl-2 pr-3 py-1.5 hover:bg-muted transition-colors text-sm font-medium text-foreground">
          {user.imageUrl ? (
            <img
              src={user.imageUrl}
              alt={displayName}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
              {initials}
            </div>
          )}
          <span className="hidden sm:block max-w-[120px] truncate">{displayName}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-3 py-2">
          <p className="text-sm font-medium truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground truncate">
            {user.emailAddresses[0]?.emailAddress}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
            <User className="h-4 w-4" />
            My Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/resume" className="flex items-center gap-2 cursor-pointer">
            <FileText className="h-4 w-4" />
            My Resume
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive cursor-pointer"
          onClick={() => signOut({ redirectUrl: "/" })}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Navbar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const navigation = [
    { name: "Jobs", href: "/jobs", icon: Briefcase },
    { name: "Browse Tags", href: "/jobs/tags", icon: Tag },
    { name: "Companies", href: "/companies", icon: Building2 },
    { name: "Alerts", href: "/alerts", icon: BellRing },
    { name: "Post a Job", href: "/pricing", icon: DollarSign },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
            <Briefcase className="h-5 w-5" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-foreground">
            Caribbean<span className="text-primary">Remote</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location === item.href ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {item.name}
            </Link>
          ))}
          <div className="flex items-center gap-2 ml-4 pl-4 border-l">
            <Show when="signed-in">
              <Link href="/admin" className="text-muted-foreground hover:text-foreground">
                <Settings className="h-4 w-4" />
                <span className="sr-only">Admin</span>
              </Link>
              <UserMenu />
            </Show>
            <Show when="signed-out">
              <Button asChild size="sm">
                <Link href="/sign-in">Sign In</Link>
              </Button>
            </Show>
          </div>
        </nav>

        {/* Mobile Nav */}
        <div className="md:hidden flex items-center gap-2">
          <Show when="signed-in">
            <UserMenu />
          </Show>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[240px] sm:w-[300px]">
              <div className="flex flex-col gap-6 mt-6">
                <Link
                  href="/"
                  className="font-display font-bold text-xl tracking-tight"
                  onClick={() => setOpen(false)}
                >
                  Caribbean<span className="text-primary">Remote</span>
                </Link>
                <div className="flex flex-col gap-3">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 text-sm font-medium p-2 rounded-md transition-colors ${
                        location === item.href
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  ))}
                  <div className="my-2 border-t" />
                  <Show when="signed-in">
                    <Link
                      href="/profile"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 text-sm font-medium p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <User className="h-4 w-4" />
                      My Profile
                    </Link>
                    <Link
                      href="/resume"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 text-sm font-medium p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <FileText className="h-4 w-4" />
                      My Resume
                    </Link>
                    <Link
                      href="/admin"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 text-sm font-medium p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Settings className="h-4 w-4" />
                      Admin Panel
                    </Link>
                  </Show>
                  <Show when="signed-out">
                    <Link
                      href="/sign-in"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 text-sm font-medium p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Sign In
                    </Link>
                  </Show>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
