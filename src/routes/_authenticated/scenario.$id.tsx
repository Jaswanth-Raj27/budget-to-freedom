import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, Plus, Save, Trash2, CreditCard, Check } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CsvHelpNote, CsvImportButton } from "@/components/CsvImport";
import { cn } from "@/lib/utils";
import { simulate, money, formatMonths, type BudgetMode, type CardInput, type Strategy } from "@/lib/simulate";

const stepMotion = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
};

export const Route = createFileRoute("/_authenticated/scenario/$id")({
  head: () => ({ meta: [{ title: "Payoff plan — Debt Free Buddy" }] }),
  component: ScenarioPage,
});

const emptyDraft = { name: "", balance: "", apr: "", min_pct: "2", min_floor: "25" };

function ScenarioPage() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [loading, setLoading] = useState(!isNew);
  const [step, setStep] = useState(1);
  const [cards, setCards] = useState<CardInput[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [name, setName] = useState("My payoff plan");
  const [budget, setBudget] = useState("");
  const [mode, setMode] = useState<BudgetMode>("fixed_total");
  const [strategy, setStrategy] = useState<Strategy>("avalanche");
  const [saving, setSaving] = useState(false);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const { data: savedCards } = useQuery({
    queryKey: ["saved_cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("saved_cards").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  function addFromLibrary(s: NonNullable<typeof savedCards>[number]) {
    const c: CardInput = { name: s.name, balance: Number(s.balance), apr: Number(s.apr), min_pct: Number(s.min_pct), min_floor: Number(s.min_floor) };
    setCards((cs) => [...cs, c]);
    toast.success(`${c.name} added`);
  }

  async function importCsv(list: CardInput[], dest: "saved" | "scenario" | "both") {
    if (dest !== "scenario") {
      const { error } = await supabase.from("saved_cards").insert(list);
      if (error) { toast.error(error.message); throw error; }
      qc.invalidateQueries({ queryKey: ["saved_cards"] });
    }
    if (dest !== "saved") setCards((cs) => [...cs, ...list]);
    toast.success(`${list.length} card${list.length === 1 ? "" : "s"} imported`);
  }

  // Load a saved scenario exactly as it was left
  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data, error } = await supabase.from("scenarios").select("*, cards(*)").eq("id", id).maybeSingle();
      if (error || !data) {
        toast.error("Scenario not found");
        navigate({ to: "/dashboard" });
        return;
      }
      setName(data.name);
      setBudget(String(Number(data.budget)));
      setMode(data.budget_mode as BudgetMode);
      setStrategy(data.strategy as Strategy);
      setCards(
        [...data.cards].sort((a, b) => a.position - b.position).map((c) => ({
          name: c.name, balance: Number(c.balance), apr: Number(c.apr), min_pct: Number(c.min_pct), min_floor: Number(c.min_floor),
        })),
      );
      setStep(3);
      setLoading(false);
    })();
  }, [id, isNew, navigate]);

  const totalDebt = cards.reduce((a, c) => a + c.balance, 0);
  const budgetNum = Number(budget) || 0;

  const draftValid = draft.name.trim() && Number(draft.balance) > 0 && draft.apr !== "" && Number(draft.apr) >= 0;
  function addCard() {
    if (!draftValid) { toast.error("Add a name, balance and APR for this card"); return; }
    const c: CardInput = {
      name: draft.name.trim(),
      balance: Math.round(Number(draft.balance) * 100) / 100,
      apr: Number(draft.apr),
      min_pct: Number(draft.min_pct) || 0,
      min_floor: Number(draft.min_floor) || 0,
    };
    setCards((cs) => [...cs, c]);
    setDraft(emptyDraft);
    toast.success(`${c.name} added`);
    if (saveToLibrary) {
      supabase.from("saved_cards").insert(c).then(({ error }) => {
        if (error) toast.error(error.message);
        else { toast.success(`${c.name} saved to My Cards`); qc.invalidateQueries({ queryKey: ["saved_cards"] }); }
      });
    }
  }
  function removeCard(i: number) {
    const c = cards[i];
    if (!c) return;
    setCards((cs) => cs.filter((_, j) => j !== i));
    toast(`${c.name} removed`);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = { name: name.trim() || "My payoff plan", budget: budgetNum, budget_mode: mode, strategy, updated_at: new Date().toISOString() };
      let sid = id;
      if (isNew) {
        const { data, error } = await supabase.from("scenarios").insert(payload).select("id").single();
        if (error) throw error;
        sid = data.id;
      } else {
        const { error } = await supabase.from("scenarios").update(payload).eq("id", id);
        if (error) throw error;
        const { error: de } = await supabase.from("cards").delete().eq("scenario_id", id);
        if (de) throw de;
      }
      const { error: ce } = await supabase.from("cards").insert(cards.map((c, i) => ({ ...c, scenario_id: sid, position: i })));
      if (ce) throw ce;
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      toast.success("Scenario saved to your dashboard");
      if (isNew) navigate({ to: "/scenario/$id", params: { id: sid }, replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;

  return (
    <div>
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      <StepIndicator step={step} onJump={(s) => (s < step || (s === 2 && cards.length) || (s === 3 && cards.length && budgetNum > 0)) && setStep(s)} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 shadow-card">
        <span className="text-sm text-muted-foreground">
          Total debt: <strong className="text-foreground">{money(totalDebt, true)}</strong> across {cards.length} card{cards.length === 1 ? "" : "s"}
        </span>
        {step === 3 && <span className="text-xs text-muted-foreground">Budget {money(budgetNum)}{mode === "fixed_extra" ? " extra" : ""}/mo · <span className="capitalize">{strategy}</span></span>}
      </div>

      <AnimatePresence mode="wait" initial={false}>
      {step === 1 && (
        <motion.section key="s1" {...stepMotion} className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {savedCards && savedCards.length > 0 && (
              <div className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
                <h2 className="text-lg font-semibold text-foreground">Choose from my cards</h2>
                <p className="mt-1 text-sm text-muted-foreground">Tap a card to copy it into this scenario. You can still edit it here without changing your library.</p>
                <ul className="mt-4 space-y-2">
                  {savedCards.map((s) => {
                    const used = cards.some((c) => c.name === s.name && c.balance === Number(s.balance));
                    return (
                      <li key={s.id}>
                        <button type="button" onClick={() => addFromLibrary(s)}
                          className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left hover:border-primary/60 hover:bg-primary/5 active:scale-[0.99]">
                          <CreditCard className="h-4 w-4 shrink-0 text-accent" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">{money(Number(s.balance), true)} · {Number(s.apr)}%</span>
                          {used ? <Check className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          <div className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Add your cards</h2>
                <p className="mt-1 text-sm text-muted-foreground">One card at a time. Minimum payment defaults are already filled in.</p>
              </div>
              <CsvImportButton size="sm" onImport={importCsv} destinations={[
                { value: "scenario", label: "This scenario only" },
                { value: "both", label: "This scenario + My Cards" },
                { value: "saved", label: "My Cards only" },
              ]} />
            </div>
            <div className="mt-3"><CsvHelpNote /></div>
            <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); addCard(); }}>
              <Field label="Card nickname" id="cname" className="sm:col-span-2">
                <Input id="cname" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Chase Freedom" />
              </Field>
              <Field label="Current balance" id="cbal" prefix="$">
                <Input id="cbal" type="number" inputMode="decimal" min="0" step="0.01" value={draft.balance} onChange={(e) => setDraft({ ...draft, balance: e.target.value })} className="pl-7" />
              </Field>
              <Field label="Interest rate (APR)" id="capr" suffix="%">
                <Input id="capr" type="number" inputMode="decimal" min="0" step="0.01" value={draft.apr} onChange={(e) => setDraft({ ...draft, apr: e.target.value })} className="pr-8" />
              </Field>
              <Field label="Minimum payment (% of balance)" id="cpct" suffix="%">
                <Input id="cpct" type="number" inputMode="decimal" min="0" step="0.1" value={draft.min_pct} onChange={(e) => setDraft({ ...draft, min_pct: e.target.value })} className="pr-8" />
              </Field>
              <Field label="Minimum payment floor" id="cfloor" prefix="$">
                <Input id="cfloor" type="number" inputMode="decimal" min="0" step="1" value={draft.min_floor} onChange={(e) => setDraft({ ...draft, min_floor: e.target.value })} className="pl-7" />
              </Field>
              <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                <Checkbox checked={saveToLibrary} onCheckedChange={(v) => setSaveToLibrary(!!v)} />
                Save this card to My Cards for next time
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" variant="outline" className="w-full sm:w-auto">
                  <Plus className="h-4 w-4" /> {cards.length ? "Add another card" : "Add this card"}
                </Button>
              </div>
            </form>
          </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Your cards</h3>
            <ul className="mt-3 space-y-2">
              {cards.length === 0 && <li className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No cards added yet.</li>}
              <AnimatePresence initial={true}>
              {cards.map((c, i) => (
                <motion.li key={`${c.name}-${i}`} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.04 }}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-card">
                  <CreditCard className="h-4 w-4 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{money(c.balance, true)} · {c.apr}% APR</div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`} onClick={() => removeCard(i)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </motion.li>
              ))}
              </AnimatePresence>
            </ul>
            <Button className="mt-4 w-full" disabled={!cards.length} onClick={() => setStep(2)}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.section>
      )}

      {step === 2 && (
        <motion.div key="s2" {...stepMotion}>
        <BudgetStep
          {...{ name, setName, budget, setBudget, mode, setMode, strategy, setStrategy, cards }}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
        </motion.div>
      )}

      {step === 3 && (
        <motion.div key="s3" {...stepMotion}>
        <Results cards={cards} budget={budgetNum} mode={mode} strategy={strategy} name={name} saving={saving}
          onSave={save} onEdit={() => setStep(1)} onBudget={() => setStep(2)} />
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function StepIndicator({ step, onJump }: { step: number; onJump: (s: number) => void }) {
  const labels = ["Add your cards", "Budget & strategy", "Review results"];
  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Step {step} of 3</p>
      <ol className="mt-2 grid grid-cols-3 gap-2">
        {labels.map((l, i) => (
          <li key={l}>
            <button type="button" onClick={() => onJump(i + 1)} className="w-full text-left">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full bg-primary transition-all duration-500", i + 1 <= step ? "w-full" : "w-0")} />
              </div>
              <span className={cn("mt-1.5 block text-xs sm:text-sm", i + 1 === step ? "font-medium text-foreground" : "text-muted-foreground")}>{l}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Field({ label, id, prefix, suffix, className, children }: { label: string; id: string; prefix?: string; suffix?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
        {children}
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function BudgetStep(p: {
  name: string; setName: (v: string) => void; budget: string; setBudget: (v: string) => void;
  mode: BudgetMode; setMode: (m: BudgetMode) => void; strategy: Strategy; setStrategy: (s: Strategy) => void;
  cards: CardInput[]; onBack: () => void; onNext: () => void;
}) {
  const mins = useMemo(() => simulate(p.cards, 0, "fixed_extra", "avalanche", true).firstMonthMinimums, [p.cards]);
  const b = Number(p.budget) || 0;
  const tooLow = p.mode === "fixed_total" && b > 0 && b < mins;
  const opt = (active: boolean) => cn("rounded-xl border p-4 text-left transition-colors", active ? "border-accent bg-accent/10 ring-1 ring-accent" : "bg-card hover:bg-muted/50");
  return (
    <section className="mt-6 space-y-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-primary">Set your budget and strategy</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your minimums this month add up to <strong>{money(mins, true)}</strong>.</p>
      </div>
      <Field label="Scenario name" id="sname"><Input id="sname" value={p.name} onChange={(e) => p.setName(e.target.value)} /></Field>
      <div className="space-y-2">
        <Label>How do you want to set your budget?</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" className={opt(p.mode === "fixed_total")} onClick={() => p.setMode("fixed_total")}>
            <div className="font-medium text-primary">Total monthly payment</div>
            <div className="text-sm text-muted-foreground">The full amount you'll pay across all cards each month.</div>
          </button>
          <button type="button" className={opt(p.mode === "fixed_extra")} onClick={() => p.setMode("fixed_extra")}>
            <div className="font-medium text-primary">Extra on top of minimums</div>
            <div className="text-sm text-muted-foreground">Pay every minimum, plus this much more each month.</div>
          </button>
        </div>
      </div>
      <Field label={p.mode === "fixed_total" ? "Total monthly payment" : "Extra per month"} id="budget" prefix="$">
        <Input id="budget" type="number" inputMode="decimal" min="0" step="1" value={p.budget} onChange={(e) => p.setBudget(e.target.value)} className="pl-7" />
      </Field>
      {tooLow && (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" /> That's below your {money(mins, true)} in minimums — raise it to see a plan.
        </p>
      )}
      <div className="space-y-2">
        <Label>Payoff strategy</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" className={opt(p.strategy === "snowball")} onClick={() => p.setStrategy("snowball")}>
            <div className="font-medium text-primary">Snowball</div>
            <div className="text-sm text-muted-foreground">Pay off the smallest balance first for quick, motivating wins.</div>
          </button>
          <button type="button" className={opt(p.strategy === "avalanche")} onClick={() => p.setStrategy("avalanche")}>
            <div className="font-medium text-primary">Avalanche</div>
            <div className="text-sm text-muted-foreground">Pay off the highest interest rate first to save the most money.</div>
          </button>
        </div>
      </div>
      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={p.onBack}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Button disabled={b <= 0} onClick={p.onNext}>See results <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </section>
  );
}

function Results(p: { cards: CardInput[]; budget: number; mode: BudgetMode; strategy: Strategy; name: string; saving: boolean; onSave: () => void; onEdit: () => void; onBudget: () => void }) {
  const plan = useMemo(() => simulate(p.cards, p.budget, p.mode, p.strategy), [p]);
  const base = useMemo(() => simulate(p.cards, 0, p.mode, p.strategy, true), [p.cards, p.mode, p.strategy]);
  const [open, setOpen] = useState(false);

  const chart = useMemo(() => {
    const total = p.cards.reduce((a, c) => a + c.balance, 0);
    const len = Math.max(plan.rows.length, base.rows.length);
    const out = [{ month: 0, plan: total, minimums: total }];
    for (let i = 0; i < len; i++) {
      out.push({ month: i + 1, plan: plan.rows[i]?.remaining ?? 0, minimums: base.rows[i]?.remaining ?? (base.status === "ok" ? 0 : NaN) });
    }
    return out;
  }, [plan, base, p.cards]);

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={p.onEdit}>Edit cards</Button>
      <Button variant="outline" size="sm" onClick={p.onBudget}>Change budget</Button>
    </div>
  );

  if (plan.status !== "ok") {
    return (
      <section className="mt-6 space-y-4 rounded-2xl border border-destructive/30 bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <h2 className="font-semibold text-primary">
              {plan.status === "below_minimums" ? "This budget doesn't cover your minimum payments" : "This budget will never pay off your debt"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan.status === "below_minimums"
                ? `Your minimums add up to ${money(plan.firstMonthMinimums, true)} per month. Increase your budget to at least that amount.`
                : "Interest is growing as fast as you're paying it down. Try a higher monthly budget."}
            </p>
          </div>
        </div>
        {actions}
      </section>
    );
  }

  const saved = base.status === "ok" ? base.totalInterest - plan.totalInterest : null;
  const sorted = plan.rows;

  return (
    <section className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">{p.name}</h2>
        <div className="flex flex-wrap gap-2">
          {actions}
          <Button size="sm" onClick={p.onSave} disabled={p.saving}><Save className="h-4 w-4" /> {p.saving ? "Saving…" : "Save this scenario"}</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Debt-free in" value={plan.months} format={formatMonths} sub={`${plan.months} payments`} highlight />
        <Stat label="Interest saved vs. minimums" value={saved === null ? null : Math.max(0, saved)} format={(v) => money(v)}
          sub={base.status === "ok" ? `Minimums only: ${formatMonths(base.months)}` : "Minimums alone never pay it off"} />
        <Stat label="Total paid" value={plan.totalPaid} format={(v) => money(v)} sub={`${money(plan.totalInterest)} of that is interest`} />
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-card sm:p-6">
        <h3 className="text-sm font-medium text-muted-foreground">Balance over time</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
              <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} stroke="var(--border)" width={48} />
              <Tooltip formatter={(v: number) => money(v)} labelFormatter={(m) => `Month ${m}`}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} />
              <Legend />
              <Line type="monotone" dataKey="plan" name={`Your plan (${p.strategy})`} stroke="var(--primary)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="minimums" name="Minimums only" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border bg-card shadow-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-sm font-medium text-foreground sm:px-6">
          Month-by-month breakdown
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="max-h-96 overflow-auto border-t">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Interest</th>
                  {p.cards.map((c, i) => <th key={i} className="hidden px-3 py-2 text-right md:table-cell">{c.name}</th>)}
                  <th className="px-3 py-2 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.month} className="border-t tabular-nums">
                    <td className="px-3 py-2">{r.month}</td>
                    <td className="px-3 py-2 text-right">{money(r.payment, true)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{money(r.interest, true)}</td>
                    {r.balances.map((b, i) => <td key={i} className="hidden px-3 py-2 text-right md:table-cell">{money(b, true)}</td>)}
                    <td className="px-3 py-2 text-right font-medium">{money(r.remaining, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setV(value); return; }
    const c = animate(0, value, { duration: 1, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    return () => c.stop();
  }, [value, reduce]);
  return <>{format(Math.round(v))}</>;
}

function Stat({ label, value, format, sub, highlight }: { label: string; value: number | null; format: (v: number) => string; sub: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-5 shadow-card", highlight ? "border-primary/40 bg-primary/15" : "bg-card")}>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value === null ? "—" : <CountUp value={value} format={format} />}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
