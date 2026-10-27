import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { simulate, type BudgetMode, type Strategy } from "@/lib/simulate";
import { monthsElapsed } from "@/lib/plan-utils";

/** Thin "X months into your Y-month plan" bar. */
export function ProgressBar({ elapsed, total, compact }: { elapsed: number; total: number; compact?: boolean }) {
  const reduce = useReducedMotion();
  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
  return (
    <div className={compact ? "w-56" : "w-full"}>
      <div className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {elapsed === 0 ? `Month 1 of your ${total}-month plan` : `${Math.min(elapsed, total)} month${elapsed === 1 ? "" : "s"} into your ${total}-month plan`}
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <motion.div className="h-full rounded-full bg-primary" initial={{ width: reduce ? `${pct}%` : 0 }} animate={{ width: `${Math.max(pct, 2)}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
      </div>
    </div>
  );
}

/** Progress for the most recently edited plan — shown in the header. */
export function ActivePlanProgress() {
  const { data } = useQuery({
    queryKey: ["scenarios", "active"],
    queryFn: async () => (await supabase.from("scenarios").select("id, created_at, budget, budget_mode, strategy, cards!cards_scenario_id_fkey(*)").order("updated_at", { ascending: false }).limit(1).maybeSingle()).data,
  });
  if (!data || !data.cards.length) return null;
  const cards = [...data.cards].sort((a, b) => a.position - b.position).map((c) => ({ name: c.name, balance: Number(c.balance), apr: Number(c.apr), min_pct: Number(c.min_pct), min_floor: Number(c.min_floor) }));
  const r = simulate(cards, Number(data.budget), data.budget_mode as BudgetMode, data.strategy as Strategy);
  if (r.status !== "ok" || !r.months) return null;
  return (
    <Link to="/scenario/$id" params={{ id: data.id }} className="hidden px-2 py-1 hover:bg-secondary lg:block" aria-label="Open your active plan">
      <ProgressBar compact elapsed={monthsElapsed(data.created_at)} total={r.months} />
    </Link>
  );
}

export function Crunching({ label = "Crunching your numbers…" }: { label?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center justify-center gap-3 border-y py-12" role="status">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
        <motion.div className="h-full rounded-full bg-primary" initial={{ width: "10%" }} animate={reduce ? { width: "60%" } : { width: ["10%", "90%"] }}
          transition={reduce ? { duration: 0 } : { duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }} />
      </div>
    </div>
  );
}
