import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/AppHeader";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Debt Free Buddy" },
      { name: "description", content: "Get a link to reset your Debt Free Buddy password." },
      { property: "og:title", content: "Reset your password — Debt Free Buddy" },
      { property: "og:description", content: "Get a link to reset your password." },
    ],
  }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
    toast.success("Reset link sent");
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center app-backdrop px-4">
      <Link to="/" className="mb-8"><Logo /></Link>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-card sm:p-8">
        <h1 className="text-xl font-semibold text-foreground">Forgot your password?</h1>
        {sent ? (
          <p className="mt-2 text-sm text-muted-foreground">If an account exists for {email}, a reset link is on its way.</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button className="w-full" disabled={busy}>Send reset link</Button>
          </form>
        )}
        <Link to="/auth" className="mt-6 block text-center text-sm text-muted-foreground hover:underline">Back to sign in</Link>
      </div>
    </div>
  );
}
