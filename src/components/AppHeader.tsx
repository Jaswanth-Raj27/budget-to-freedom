import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight text-primary">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-accent">
        DF
      </span>
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
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link to="/dashboard"><Logo /></Link>
        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">Dashboard</Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Account settings">
            <Link to="/settings"><Settings className="h-4 w-4" /></Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </header>
  );
}
