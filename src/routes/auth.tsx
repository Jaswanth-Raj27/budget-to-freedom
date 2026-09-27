import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/AppHeader";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ mode: z.enum(["signin", "signup"]).optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Debt Free Buddy" },
      { name: "description", content: "Sign in or create your free Debt Free Buddy account." },
      { property: "og:title", content: "Sign in — Debt Free Buddy" },
      { property: "og:description", content: "Create a free account to save your payoff plans." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode = "signin" } = Route.useSearch();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const signup = mode === "signup";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (signup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name }, emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      if (data.session) {
        toast.success("Welcome aboard!");
        navigate({ to: "/dashboard" });
      } else setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Signed in");
      navigate({ to: "/dashboard" });
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center app-backdrop px-4 py-10">
      <Link to="/" className="mb-8"><Logo /></Link>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-card sm:p-8">
        {sent ? (
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a confirmation link to <strong>{email}</strong>. Click it to finish creating your account.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-foreground">{signup ? "Create your account" : "Welcome back"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {signup ? "Free, private, and takes a minute." : "Sign in to see your saved plans."}
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              {signup && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {!signup && (
                    <Link to="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? "new-password" : "current-password"} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {signup ? "Already have an account? " : "New here? "}
              <Link to="/auth" search={{ mode: signup ? "signin" : "signup" }} className="font-medium text-foreground underline-offset-4 hover:underline">
                {signup ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </>
        )}
      </div>
      <p className="mt-6 flex max-w-sm items-center gap-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
        We never ask for your card number — just your balances and rates.
      </p>
    </div>
  );
}
