import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, LineChart, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/AppHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Debt Free Buddy — Credit card payoff simulator" },
      { name: "description", content: "See exactly when you'll be debt-free. Compare Snowball vs Avalanche payoff plans for your credit cards." },
      { property: "og:title", content: "Debt Free Buddy — Credit card payoff simulator" },
      { property: "og:description", content: "Compare Snowball vs Avalanche and see your debt-free date. No card numbers, ever." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-12 sm:px-6 sm:pt-20">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">Credit card payoff simulator</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-primary sm:text-5xl">
          Know the month you'll be debt-free.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Enter your card balances and rates, set a monthly budget, and see a clear payoff plan —
          plus how much interest you'll save compared to paying minimums.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button asChild size="lg"><Link to="/auth" search={{ mode: "signup" }}>Get started — it's free</Link></Button>
        </div>
        <div className="mt-6 flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-foreground shadow-sm sm:inline-flex">
          <ShieldCheck className="h-5 w-5 shrink-0 text-accent" />
          We never ask for your card number — just your balances and rates.
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Layers, t: "Add your cards", d: "One at a time, with sensible defaults already filled in." },
            { icon: LineChart, t: "Pick a strategy", d: "Snowball for quick wins, Avalanche to save the most interest." },
            { icon: ShieldCheck, t: "Save your plan", d: "Your scenarios are private and waiting when you come back." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border bg-card p-6 shadow-sm">
              <Icon className="h-5 w-5 text-accent" />
              <h3 className="mt-3 font-semibold text-primary">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
