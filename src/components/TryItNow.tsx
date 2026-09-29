import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Plus, ShieldCheck, X } from "lucide-react";
import { simulate, money, formatMonths, type CardInput, type Strategy } from "@/lib/simulate";
import { monthLong, stashGuestPlan } from "@/lib/plan-utils";
import { PayoffLandscape } from "@/components/PayoffLandscape";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Row = { name: string; balance: string; apr: string };
const blank: Row = { name: "", balance: "", apr: "" };

/** Guest calculator — everything stays in this browser tab. */
export function TryItNow() {
  const [rows, setRows] = useState<Row[]>([{ name: "", balance: "4200", apr: "24.9" }, { name: "", balance: "1300", apr: "18.5" }]);
  const [budget, setBudget] = useState("350");
  const [strategy, setStrategy] = useState<Strategy>("avalanche");
  const [result, setResult] = useState<{ cards: CardInput[]; budget: number; strategy: Strategy } | null>(null);

  const cards: CardInput[] = rows
    .filter((r) => Number(r.balance) > 0)
    .map((r, i) => ({ name: r.name.trim() || `Card ${i + 1}`, balance: Number(r.balance), apr: Number(r.apr) || 0, min_pct: 2, min_floor: 25 }));

  const plan = result ? simulate(result.cards, result.budget, "fixed_total", result.strategy) : null;
  const base = result ? simulate(result.cards, 0, "fixed_total", result.strategy, true) : null;
  const saved = plan && base && base.status === "ok" ? base.totalInterest - plan.totalInterest : null;

  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const opt = (a: boolean) => cn("flex-1 rounded-lg px-3 py-2 text-sm transition-colors", a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <section id="try" className="mt-16 rounded-3xl border bg-card/80 p-5 shadow-card backdrop-blur sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-primary">Try it now · no account</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">See your debt-free date in 10 seconds</h2>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-accent" /> We never ask for your card number — just your balances and rates.</p>
      </div>

      <form className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]" onSubmit={(e) => { e.preventDefault(); if (cards.length) setResult({ cards, budget: Number(budget) || 0, strategy }); }}>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 sm:grid-cols-[1.3fr_1fr_1fr_auto]">
              <div className="col-span-3 space-y-1 sm:col-span-1">
                <Label htmlFor={`tn${i}`} className="text-xs">Card name (optional)</Label>
                <Input id={`tn${i}`} value={r.name} placeholder={`Card ${i + 1}`} onChange={(e) => set(i, "name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`tb${i}`} className="text-xs">Balance ($)</Label>
                <Input id={`tb${i}`} type="number" min="0" step="0.01" inputMode="decimal" value={r.balance} onChange={(e) => set(i, "balance", e.target.value)} className="tabular-nums" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`ta${i}`} className="text-xs">APR (%)</Label>
                <Input id={`ta${i}`} type="number" min="0" step="0.01" inputMode="decimal" value={r.apr} onChange={(e) => set(i, "apr", e.target.value)} className="tabular-nums" />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove card" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          {rows.length < 3 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blank])}><Plus className="h-4 w-4" /> Add card</Button>
          )}
          <p className="text-xs text-muted-foreground">Minimum payment assumed: 2% of balance, at least $25.</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="tbud" className="text-xs">Total monthly budget ($)</Label>
            <Input id="tbud" type="number" min="0" step="1" value={budget} onChange={(e) => setBudget(e.target.value)} className="tabular-nums" />
          </div>
          <div className="flex rounded-xl border p-1">
            <button type="button" className={opt(strategy === "snowball")} onClick={() => setStrategy("snowball")}>Snowball</button>
            <button type="button" className={opt(strategy === "avalanche")} onClick={() => setStrategy("avalanche")}>Avalanche</button>
          </div>
          <p className="text-xs text-muted-foreground">{strategy === "snowball" ? "Smallest balance first, for quick wins." : "Highest interest rate first, to save the most."}</p>
          <Button type="submit" className="w-full" disabled={!cards.length}>Show my plan <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </form>

      <AnimatePresence>
        {plan && result && base && (
          <motion.div key={JSON.stringify(result)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 border-t pt-6">
            {plan.status !== "ok" ? (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {plan.status === "below_minimums" ? `That budget is below your ${money(plan.firstMonthMinimums)} in minimums — try a higher amount.` : "This budget will never pay off your debt — try a higher amount."}
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Mini label="Debt-free by" value={monthLong(plan.months)} />
                  <Mini label="Time to go" value={formatMonths(plan.months)} />
                  <Mini label="Interest saved vs minimums" value={saved !== null ? money(Math.max(0, saved)) : "—"} />
                </div>
                <div className="mt-5"><PayoffLandscape compact cards={result.cards} plan={plan} base={base} /></div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                  <span className="text-sm text-foreground">Keep this plan and fine-tune it anytime.</span>
                  <Button asChild onClick={() => stashGuestPlan({ cards: result.cards, budget: result.budget, mode: "fixed_total", strategy: result.strategy })}>
                    <Link to="/auth" search={{ mode: "signup" }}>Save this plan — create a free account <ArrowRight className="h-4 w-4" /></Link>
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/50 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
