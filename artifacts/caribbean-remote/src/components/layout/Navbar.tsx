import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Briefcase, Building2, BellRing, Settings, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

export function Navbar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const navigation = [
    { name: "Jobs", href: "/jobs", icon: Briefcase },
    { name: "Companies", href: "/companies", icon: Building2 },
    { name: "Alerts", href: "/alerts", icon: BellRing },
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
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">
              <Settings className="h-4 w-4" />
              <span className="sr-only">Admin</span>
            </Link>
            <Button asChild size="sm">
              <Link href="/alerts">Get Job Alerts</Link>
            </Button>
          </div>
        </nav>

        {/* Mobile Nav */}
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[240px] sm:w-[300px]">
              <div className="flex flex-col gap-6 mt-6">
                <Link href="/" className="font-display font-bold text-xl tracking-tight" onClick={() => setOpen(false)}>
                  Caribbean<span className="text-primary">Remote</span>
                </Link>
                <div className="flex flex-col gap-3">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 text-sm font-medium p-2 rounded-md transition-colors ${
                        location === item.href ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  ))}
                  <div className="my-2 border-t" />
                  <Link
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 text-sm font-medium p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Settings className="h-4 w-4" />
                    Admin Panel
                  </Link>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
