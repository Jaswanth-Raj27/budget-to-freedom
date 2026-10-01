import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ActivePlanProgress } from "@/components/PlanProgress";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="#0c0e12" />
      <path d="M22 34 L48 34 L48 50" stroke="#5b7f9e" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 34 L52 64 L66 50 L80 64" stroke="#c4c9d1" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
      <span className="rounded-[22%] ring-1 ring-border"><LogoMark size={34} /></span>
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
  const linkCls = "text-muted-foreground hover:text-foreground data-[status=active]:text-foreground";
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link to="/dashboard"><Logo /></Link>
        <ActivePlanProgress />
        <nav className="flex items-center gap-1">
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
