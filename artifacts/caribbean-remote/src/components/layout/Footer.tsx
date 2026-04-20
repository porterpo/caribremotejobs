import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-card border-t mt-auto">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <Link href="/" className="font-display font-bold text-xl tracking-tight inline-block mb-4">
              Caribbean<span className="text-primary">Remote</span>
            </Link>
            <p className="text-muted-foreground text-sm max-w-sm">
              The premier gateway for Caribbean talent to access the global remote economy. 
              Connecting professionals with companies that value diversity and global perspectives.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-4 text-foreground">Platform</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/jobs" className="hover:text-primary transition-colors">Browse Jobs</Link></li>
              <li><Link href="/companies" className="hover:text-primary transition-colors">Companies</Link></li>
              <li><Link href="/alerts" className="hover:text-primary transition-colors">Job Alerts</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4 text-foreground">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} CaribbeanRemote. All rights reserved.</p>
          <p>Built for the Caribbean diaspora and beyond.</p>
        </div>
      </div>
    </footer>
  );
}
