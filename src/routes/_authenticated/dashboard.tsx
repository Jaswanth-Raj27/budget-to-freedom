import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { monthsElapsed, takeGuestPlan } from "@/lib/plan-utils";
import { Crunching, ProgressBar } from "@/components/PlanProgress";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { motion, useReducedMotion } from "motion/react";
import { pageMeta } from "@/lib/page-meta";
import { Reveal } from "@/components/Reveal";
import { monthLong } from "@/lib/plan-utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { simulate, money, formatMonths, type BudgetMode, type Strategy } from "@/lib/simulate";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageMeta("Your plans", "Your private payoff plans, progress, budgets, and debt-free dates in one place."),
  component: Dashboard,
});

function Dashboard() {
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const imported = useRef(false);
  // Carry a plan built on the homepage (before signup) into a saved scenario
  useEffect(() => {
    if (imported.current) return;
    imported.current = true;
    const g = takeGuestPlan();
    if (!g || !g.cards.length) return;
    (async () => {
      const { data, error } = await supabase.from("scenarios").insert({ name: "My first plan", budget: g.budget, budget_mode: g.mode, strategy: g.strategy }).select("id").single();
      if (error) { toast.error(error.message); return; }
      const { error: ce } = await supabase.from("cards").insert(g.cards.map((c, i) => ({ ...c, scenario_id: data.id, position: i })));
      if (ce) { toast.error(ce.message); return; }
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      toast.success("Your plan from the homepage is saved");
      navigate({ to: "/scenario/$id", params: { id: data.id } });
    })();
  }, [qc, navigate]);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await supabase.from("profiles").select("name").maybeSingle()).data,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scenarios")
        .select("*, cards(*)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function remove(id: string, name: string) {
    const { error } = await supabase.from("scenarios").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted "${name}"`);
    qc.invalidateQueries({ queryKey: ["scenarios"] });
  }

  const latest = data?.[0];
  const latestCards = latest?.cards.map((c) => ({ name: c.name, balance: Number(c.balance), apr: Number(c.apr), min_pct: Number(c.min_pct), min_floor: Number(c.min_floor) })) ?? [];
  const latestResult = latest ? simulate(latestCards, Number(latest.budget), latest.budget_mode as BudgetMode, latest.strategy as Strategy) : null;
  const latestTotal = latestCards.reduce((sum, c) => sum + c.balance, 0);

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:justify-between">
        <div>
          <p className="eyebrow mb-3">Your financial next chapter</p>
          <h1 className="text-4xl text-foreground sm:text-5xl">
            {profile?.name ? `Hi, ${profile.name.split(" ")[0]}` : "Your plans"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">A little perspective. A plan to move forward.</p>
        </div>
        <Button asChild>
          <Link to="/scenario/$id" params={{ id: "new" }}><Plus className="h-4 w-4" /> New scenario</Link>
        </Button>
      </div>

      {latest && latestResult && (
        <section className="mt-9 grid overflow-hidden rounded-lg border bg-card md:grid-cols-[1.3fr_1fr]">
          <div className="bg-primary p-6 text-primary-foreground sm:p-8">
            <p className="text-xs font-medium uppercase opacity-80">Your most recent plan</p>
            <h2 className="editorial-title mt-4 text-3xl sm:text-4xl">{latestResult.status === "ok" ? <>A fresh start.<br />{monthLong(latestResult.months)}.</> : "Let’s find your next step."}</h2>
            <Link to="/scenario/$id" params={{ id: latest.id }} className="mt-6 inline-flex items-center gap-2 border-b border-primary-foreground/40 pb-1 text-sm">{latest.name} <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-2 gap-5 p-6 sm:p-8">
            <div className="col-span-2"><p className="text-xs text-muted-foreground">Starting balance</p><p className="mt-1 text-4xl font-medium tabular-nums">{money(latestTotal)}</p></div>
            <div><p className="text-xs text-muted-foreground">Monthly budget</p><p className="mt-1 text-xl tabular-nums">{money(Number(latest.budget))}</p></div>
            <div><p className="text-xs text-muted-foreground">Your approach</p><p className="mt-1 text-xl capitalize">{latest.strategy}</p></div>
            {latestResult.status === "ok" && latestResult.months > 0 && <div className="col-span-2 border-t pt-4"><ProgressBar elapsed={monthsElapsed(latest.created_at)} total={latestResult.months} /></div>}
          </div>
        </section>
      )}
      <Reveal className="mt-10">
      <div className="mb-4 flex items-center justify-between border-b pb-4"><h2 className="editorial-title text-2xl">Your saved plans</h2><span className="text-xs tabular-nums text-muted-foreground">{data?.length ?? 0} plans</span></div>
      <div className="space-y-0">
        {isLoading && <Crunching label="Loading your plans…" />}
        {data && data.length === 0 && (
          <div className="border-b py-12 text-center">
            <h2 className="text-lg font-semibold text-foreground">No scenarios yet — let's build your first payoff plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">It takes about a minute, and only you can see it.</p>
            <Button asChild size="lg" className="mt-6">
              <Link to="/scenario/$id" params={{ id: "new" }}><Plus className="h-4 w-4" /> Create your first scenario</Link>
            </Button>
          </div>
        )}
        {data?.map((s, idx) => {
          const cards = [...s.cards].sort((a, b) => a.position - b.position).map((c) => ({
            name: c.name, balance: Number(c.balance), apr: Number(c.apr), min_pct: Number(c.min_pct), min_floor: Number(c.min_floor),
          }));
          const r = simulate(cards, Number(s.budget), s.budget_mode as BudgetMode, s.strategy as Strategy);
          const total = cards.reduce((a, c) => a + c.balance, 0);
          return (
            <motion.div key={s.id} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: Math.min(idx, 10) * 0.06, ease: [0.22, 1, 0.36, 1] }} className="ledger-row group flex items-center gap-3 p-4 transition-colors sm:p-5">
              <Link to="/scenario/$id" params={{ id: s.id }} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">{s.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {money(total)} across {cards.length} card{cards.length === 1 ? "" : "s"} · edited{" "}
                    {new Date(s.updated_at).toLocaleDateString()}
                  </div>
                  {r.status === "ok" && r.months > 0 && <div className="mt-2 max-w-xs"><ProgressBar elapsed={monthsElapsed(s.created_at)} total={r.months} /></div>}
                </div>
                <div className="col-start-1 row-start-2 text-left sm:ml-auto sm:shrink-0 sm:text-right">
                  {r.status === "ok" && r.months > 0 ? (
                    <>
                      <div className="text-sm font-semibold text-foreground">Debt-free in {formatMonths(r.months)}</div>
                      <div className="text-xs capitalize text-muted-foreground">{s.strategy}</div>
                    </>
                  ) : (
                    <div className="text-sm font-medium text-muted-foreground">Needs a bigger budget</div>
                  )}
                </div>
                <ArrowUpRight className="col-start-2 row-start-1 h-5 w-5 shrink-0 text-primary" />
              </Link>
              <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => remove(s.id, s.name)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </motion.div>
          );
        })}
      </div>
      </Reveal>
    </div>
  );
}
