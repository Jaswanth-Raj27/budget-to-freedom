import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { monthsElapsed, stashGuestPlan, takeGuestPlan } from "@/lib/plan-utils";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { simulate, formatMonths, type BudgetMode, type Strategy } from "@/lib/simulate";
import { calculateScenarioRepayment, formatInr, isMissingPaymentsTable, parseCents } from "@/lib/repayment-utils";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageMeta("Your plans", "Your private payoff plans, progress, budgets, and debt-free dates in one place."),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const imported = useRef(false);
  const [overview, setOverview] = useState<"plan" | "repayment">("plan");
  const overviewRef = useRef<HTMLDivElement>(null);
  function showOverview(index: number) {
    const container = overviewRef.current;
    const card = container?.children[index] as HTMLElement | undefined;
    if (container && card) container.scrollTo({ left: card.offsetLeft - container.offsetLeft, behavior: reduce ? "instant" : "smooth" });
  }
  // Carry a plan built on the homepage (before signup) into a saved scenario
  useEffect(() => {
    if (imported.current) return;
    imported.current = true;
    const g = takeGuestPlan();
    if (!g || !g.cards.length) return;
    (async () => {
      const { data: scenarioId, error } = await supabase.rpc("save_debt_scenario", {
        p_scenario_id: null,
        p_name: "My first plan",
        p_budget: g.budget,
        p_budget_mode: g.mode,
        p_strategy: g.strategy,
        p_cards: g.cards.map((card, position) => ({ ...card, position })),
      });
      if (error) {
        stashGuestPlan(g);
        toast.error(error.code === "PGRST202"
          ? "Atomic scenario saving is not available yet. Apply and verify migration 0006 first. Your plan has been kept for retry."
          : "Your plan couldn't be saved. It has been kept for retry.");
        return;
      }
      if (!scenarioId) { stashGuestPlan(g); toast.error("The database did not return the saved scenario ID."); return; }
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      toast.success("Your plan from the homepage is saved");
      navigate({ to: "/scenario/$id", params: { id: scenarioId } });
    })();
  }, [qc, navigate]);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await supabase.from("profiles").select("name").maybeSingle()).data,
  });
  const savedCardsQuery = useQuery({
    queryKey: ["dashboard-saved-card-balances", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("saved_cards").select("id, balance");
      if (error) throw error;
      return data;
    },
  });
  const savedTotal = savedCardsQuery.data?.reduce((sum, card) => sum + (parseCents(String(card.balance)) ?? 0), 0) ?? 0;
  const { data, isLoading } = useQuery({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scenarios")
        .select("*, cards!cards_scenario_id_fkey(*)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const paymentsQuery = useQuery({
    queryKey: ["dashboard-debt-payments", user.id],
    enabled: !!data?.length,
    queryFn: async () => {
      const { data: payments, error } = await supabase
        .from("debt_payments")
        .select("user_id, scenario_id, card_id, amount, payment_date")
        .eq("user_id", user.id);
      if (error) throw error;
      return payments;
    },
    retry: (failureCount, error) => !isMissingPaymentsTable(error) && failureCount < 2,
  });

  async function remove(id: string, name: string) {
    const { error } = await supabase.from("scenarios").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted "${name}"`);
    qc.invalidateQueries({ queryKey: ["scenarios"] });
  }

  const latest = data?.[0];
  const latestCards = latest?.cards.map((c) => ({ id: c.id, name: c.name, balance: Number(c.balance), apr: Number(c.apr), min_pct: Number(c.min_pct), min_floor: Number(c.min_floor) })) ?? [];
  const latestResult = latest ? simulate(latestCards, Number(latest.budget), latest.budget_mode as BudgetMode, latest.strategy as Strategy) : null;
  const latestTotal = latestCards.reduce((sum, c) => sum + c.balance, 0);
  const latestRepayment = latest
    ? calculateScenarioRepayment(latestCards, paymentsQuery.data ?? [], user.id, latest.id)
    : null;

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
        <section className="mt-9" aria-label="Plan overview">
        <div ref={overviewRef} onScroll={(event) => { const el = event.currentTarget; setOverview(el.scrollLeft > el.clientWidth / 2 ? "repayment" : "plan"); }} className="relative flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3" aria-label="Scroll to see plan and debt summary">
        <article className="grid min-w-[94%] snap-start overflow-hidden rounded-lg border bg-card md:grid-cols-[1.3fr_1fr]">
          <div className="bg-primary p-6 text-primary-foreground sm:p-8">
                    <p className="mt-5 text-xs font-medium uppercase opacity-80">Your most recent plan</p>
                    <h2 className="editorial-title mt-4 text-3xl sm:text-4xl">{latestResult.status === "ok" ? <>A fresh start.<br />{monthLong(latestResult.months)}.</> : "Let’s find your next step."}</h2>
                    <Link to="/scenario/$id" params={{ id: latest.id }} className="mt-6 inline-flex items-center gap-2 border-b border-primary-foreground/40 pb-1 text-sm">{latest.name} <ArrowUpRight className="h-4 w-4" /></Link>
            <Link to="/scenario/$id" params={{ id: latest.id }} hash="record-payment" className="mt-6 inline-flex items-center gap-2 border-b border-primary-foreground/40 pb-1 text-sm font-medium">Record payment <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-2 gap-5 p-6 sm:p-8">
            <div className="col-span-2"><p className="text-xs text-muted-foreground">Starting balance</p><p className="mt-1 text-4xl font-medium tabular-nums">{formatInr(Math.round(latestTotal * 100))}</p></div>
            <div><p className="text-xs text-muted-foreground">Monthly budget</p><p className="mt-1 text-xl tabular-nums">{formatInr(Math.round(Number(latest.budget) * 100))}</p></div>
            <div><p className="text-xs text-muted-foreground">Your approach</p><p className="mt-1 text-xl capitalize">{latest.strategy}</p></div>
            <div className="col-span-2 border-t pt-4">
              <p className="text-xs text-muted-foreground">Actual repayment progress</p>
              {paymentsQuery.isLoading ? (
                <p className="mt-1 text-sm">Loading repayment progress…</p>
              ) : paymentsQuery.isError ? (
                <p className="mt-1 text-sm">{isMissingPaymentsTable(paymentsQuery.error) ? "Repayment tracking isn't available in this database yet." : "Repayment progress couldn't be loaded."}</p>
              ) : latestRepayment ? (
                <>
                  <p className="mt-1 text-sm font-medium tabular-nums">{formatInr(latestRepayment.totalRepaidCents)} repaid · {formatInr(latestRepayment.remainingDebtCents)} remaining</p>
                  <Progress className="mt-2" value={latestRepayment.percentRepaid} aria-label={`${latestRepayment.percentRepaid.toFixed(1)} percent of tracked debt repaid`} />
                </>
              ) : null}
            </div>
            {latestResult.status === "ok" && latestResult.months > 0 && <div className="col-span-2 border-t pt-4"><ProgressBar elapsed={monthsElapsed(latest.created_at)} total={latestResult.months} /></div>}
          </div>
        </article>
        <article className="min-w-[94%] snap-start overflow-hidden rounded-lg border bg-card p-6 sm:p-8" aria-label="Debt summary">
          <p className="text-xs font-medium uppercase text-muted-foreground">My Cards</p>
          <h2 className="editorial-title mt-3 text-3xl">Total card balances</h2>
          {savedCardsQuery.isLoading ? <p className="mt-6">Loading your cards…</p> : savedCardsQuery.isError ? <p className="mt-6">Card balances couldn’t be loaded.</p> : <p className="mt-6 text-4xl tabular-nums">{formatInr(savedTotal)}</p>}
          <p className="mt-6 text-sm text-muted-foreground">Sum of the balances saved in My Cards. Plan payments do not update these balances.</p>
          <Link to="/cards" className="mt-5 inline-flex items-center gap-2 border-b border-primary/40 pb-1 text-sm font-medium">View My Cards <ArrowUpRight className="h-4 w-4" /></Link>
        </article>
        </div>
        <div className="mt-2 flex items-center gap-4 text-sm">
          <button type="button" onClick={() => showOverview(0)} aria-pressed={overview === "plan"} className={overview === "plan" ? "font-semibold text-foreground" : "text-muted-foreground"}>Recent plan</button>
          <button type="button" onClick={() => showOverview(1)} aria-pressed={overview === "repayment"} className={overview === "repayment" ? "font-semibold text-foreground" : "text-muted-foreground"}>Debt summary →</button>
          <span className="text-xs text-muted-foreground">Swipe or scroll sideways</span>
        </div>
        </section>
      )}
      {!isLoading && !latest && <section className="mt-9 rounded-lg border bg-card p-6 sm:p-8"><h2 className="editorial-title text-2xl">Total card balances</h2>{savedCardsQuery.isLoading ? <p className="mt-3">Loading your cards…</p> : savedCardsQuery.isError ? <p className="mt-3">Card balances couldn’t be loaded.</p> : <p className="mt-3 text-3xl tabular-nums">{formatInr(savedTotal)}</p>}<p className="mt-3 text-sm text-muted-foreground">Sum of balances saved in My Cards.</p><Link to="/cards" className="mt-4 inline-block underline">View My Cards</Link></section>}
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
            id: c.id, name: c.name, balance: Number(c.balance), apr: Number(c.apr), min_pct: Number(c.min_pct), min_floor: Number(c.min_floor),
          }));
          const r = simulate(cards, Number(s.budget), s.budget_mode as BudgetMode, s.strategy as Strategy);
          const total = cards.reduce((a, c) => a + c.balance, 0);
          const repayment = paymentsQuery.data
            ? calculateScenarioRepayment(cards, paymentsQuery.data, user.id, s.id)
            : null;
          return (
            <motion.div key={s.id} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: Math.min(idx, 10) * 0.06, ease: [0.22, 1, 0.36, 1] }} className="ledger-row group flex items-center gap-3 p-4 transition-colors sm:p-5">
              <Link to="/scenario/$id" params={{ id: s.id }} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">{s.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formatInr(Math.round(total * 100))} across {cards.length} card{cards.length === 1 ? "" : "s"} · edited{" "}
                    {new Date(s.updated_at).toLocaleDateString()}
                  </div>
                  <div className="mt-2 max-w-xs">
                    {paymentsQuery.isLoading ? (
                      <p className="text-xs text-muted-foreground">Loading repayment progress…</p>
                    ) : paymentsQuery.isError ? (
                      <p className="text-xs text-muted-foreground">Repayment progress unavailable</p>
                    ) : repayment ? (
                      <>
                        <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
                          <span>{repayment.percentRepaid.toFixed(1)}% repaid</span>
                          <span>{formatInr(repayment.remainingDebtCents)} remaining</span>
                        </div>
                        <Progress value={repayment.percentRepaid} aria-label={`${repayment.percentRepaid.toFixed(1)} percent of ${s.name} debt repaid`} />
                      </>
                    ) : null}
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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{s.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the scenario, its cards, and any repayment history recorded for it.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => remove(s.id, s.name)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete scenario
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </motion.div>
          );
        })}
      </div>
      </Reveal>
    </div>
  );
}
