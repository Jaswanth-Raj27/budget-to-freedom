import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ActivePlanProgress } from "@/components/PlanProgress";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="var(--primary)" />
      <path d="M22 34 L48 34 L48 50" stroke="var(--primary-foreground)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 34 L52 64 L66 50 L80 64" stroke="var(--primary-foreground)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex min-w-0 items-center gap-2.5 whitespace-nowrap text-sm font-bold text-foreground sm:text-base">
      <span className="shrink-0"><LogoMark size={34} /></span>
      Debt Free Buddy
    </span>
  );
}

export function AppHeader() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  const linkCls = "nav-link text-muted-foreground hover:text-foreground data-[status=active]:text-primary data-[status=active]:bg-secondary";
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 sm:flex sm:min-h-20 sm:justify-between sm:px-8">
        <Link to="/dashboard"><Logo /></Link>
        <ActivePlanProgress />
        <nav className="col-span-2 mt-3 flex items-center justify-between gap-1 border-t pt-2 sm:mt-0 sm:justify-start sm:border-0 sm:pt-0" aria-label="Main navigation">
          <Button asChild variant="ghost" size="sm" className={linkCls}>
            <Link to="/dashboard">Dashboard</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className={linkCls}>
            <Link to="/cards">My Cards</Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Account settings" className={linkCls}>
            <Link to="/settings"><Settings className="h-4 w-4" /></Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </header>
  );
}
