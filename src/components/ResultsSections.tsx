import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Download, Link2, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { simulate, money, formatMonths, type BudgetMode, type CardInput, type SimResult, type Strategy } from "@/lib/simulate";
import { clearEvents, progressMilestones, downloadCsv, monthDate, monthLabel, monthLong } from "@/lib/plan-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogoMark } from "@/components/AppHeader";
import { cn } from "@/lib/utils";

export function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? value : 0);
  const prev = useRef(0);
  useEffect(() => {
    if (reduce) { setV(value); return; }
    const c = animate(prev.current, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1], onUpdate: (x) => { prev.current = x; setV(x); } });
    return () => c.stop();
  }, [value, reduce]);
  return <>{format(Math.round(v))}</>;
}

/* ---------------- What if I paid more? ---------------- */
export function WhatIf(p: {
  cards: CardInput[]; budget: number; mode: BudgetMode; strategy: Strategy; plan: SimResult;
  extra: number; setExtra: (n: number) => void; boosted: SimResult | null; onApply: (newBudget: number) => void;
}) {
  const better = p.boosted?.status === "ok" ? { months: p.plan.months - p.boosted.months, interest: p.plan.totalInterest - p.boosted.totalInterest } : null;
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">What if I paid more?</h3>
        {p.extra > 0 && (
          <Button size="sm" variant="outline" onClick={() => p.onApply(p.budget + p.extra)}>
            Apply to this scenario
          </Button>
        )}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <span className="text-xs text-muted-foreground">+$0</span>
        <input type="range" min={0} max={500} step={10} value={p.extra} aria-label="Extra per month"
          onChange={(e) => p.setExtra(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-[var(--primary)]" />
        <span className="text-xs text-muted-foreground">+$500</span>
        <div className="relative w-28">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+$</span>
          <Input type="number" min={0} max={5000} step={10} value={p.extra} aria-label="Extra per month amount"
            onChange={(e) => p.setExtra(Math.max(0, Number(e.target.value) || 0))} className="pl-8 tabular-nums" />
        </div>
      </div>
      <div className="mt-5 min-h-[64px]">
        {p.extra === 0 || !better ? (
          <p className="text-sm text-muted-foreground">Drag the slider to see how an extra payment each month changes your debt-free date.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-2xl font-semibold tracking-tight text-primary tabular-nums sm:text-3xl">
                Debt-free <CountUp value={better.months} format={(v) => `${v} month${v === 1 ? "" : "s"}`} /> sooner
              </div>
              <div className="text-xs text-muted-foreground">New date: {monthLong(p.boosted!.months)}</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">
                <CountUp value={better.interest} format={(v) => money(v)} /> less interest
              </div>
              <div className="text-xs text-muted-foreground">Paying {money(p.extra)} more each month</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Snowball vs Avalanche ---------------- */
export function CompareStrategies(p: { cards: CardInput[]; budget: number; mode: BudgetMode; strategy: Strategy; onUse: (s: Strategy) => void }) {
  const res = useMemo(() => {
    const one = (s: Strategy) => {
      const r = simulate(p.cards, p.budget, p.mode, s);
      return { s, r, order: clearEvents(p.cards, r.rows) };
    };
    return { snowball: one("snowball"), avalanche: one("avalanche") };
  }, [p.cards, p.budget, p.mode]);
  const a = res.avalanche, s = res.snowball;
  if (a.r.status !== "ok" || s.r.status !== "ok") return null;

  const firstA = a.order[0]?.month ?? a.r.months, firstS = s.order[0]?.month ?? s.r.months;
  const dI = s.r.totalInterest - a.r.totalInterest; // >0 avalanche cheaper
  const dM = s.r.months - a.r.months;
  let verdict: string;
  if (Math.abs(dI) < 5 && Math.abs(dM) <= 1) verdict = "Both strategies land almost the same here — pick whichever keeps you motivated.";
  else {
    const cheaper = dI >= 0 ? "Avalanche" : "Snowball";
    const other = cheaper === "Avalanche" ? "Snowball" : "Avalanche";
    const firstDiff = cheaper === "Avalanche" ? firstA - firstS : firstS - firstA;
    verdict = `${cheaper} saves you ${money(Math.abs(dI))} in interest`;
    verdict += firstDiff > 0 ? `, but ${other} clears your first card ${firstDiff} month${firstDiff === 1 ? "" : "s"} sooner.` : ` and clears your first card just as fast.`;
  }
  const best = (x: number, y: number) => (Math.abs(x - y) < 0.5 ? "tie" : x < y ? "a" : "b");
  const rows: { label: string; get: (c: typeof a) => string; win: "a" | "b" | "tie" }[] = [
    { label: "Months to debt-free", get: (c) => formatMonths(c.r.months), win: best(s.r.months, a.r.months) },
    { label: "Debt-free date", get: (c) => monthLabel(c.r.months), win: best(s.r.months, a.r.months) },
    { label: "Total interest", get: (c) => money(c.r.totalInterest), win: best(s.r.totalInterest, a.r.totalInterest) },
    { label: "Total paid", get: (c) => money(c.r.totalPaid), win: best(s.r.totalPaid, a.r.totalPaid) },
  ];
  const col = (c: typeof a, side: "a" | "b", title: string, blurb: string) => (
    <div className={cn("rounded-xl border p-4", p.strategy === c.s ? "border-primary/60 bg-primary/10" : "bg-background/40")}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">{blurb}</div>
        </div>
        {p.strategy === c.s ? <span className="text-xs font-medium text-primary">Current</span> :
          <Button size="sm" variant="outline" onClick={() => p.onUse(c.s)}>Use this strategy</Button>}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="flex items-center gap-1.5 font-medium tabular-nums text-foreground">
              {r.get(c)}
              {r.win === side && <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/25"><Check className="h-3 w-3 text-primary" /></span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 text-xs text-muted-foreground">Payoff order</div>
      <ol className="mt-1.5 space-y-1 text-sm">
        {c.order.map((e, k) => (
          <li key={e.card} className="flex justify-between gap-2"><span className="truncate text-foreground">{k + 1}. {e.name}</span><span className="tabular-nums text-muted-foreground">{monthLabel(e.month)}</span></li>
        ))}
      </ol>
    </div>
  );
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
      <h3 className="font-semibold text-foreground">Compare strategies</h3>
      <p className="mt-1 text-sm text-foreground/90">{verdict}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {col(s, "a", "Snowball", "Smallest balance first")}
        {col(a, "b", "Avalanche", "Highest APR first")}
      </div>
    </div>
  );
}

/* ---------------- Payment timeline ---------------- */
export function PaymentTimeline({ cards, plan, name }: { cards: CardInput[]; plan: SimResult; name: string }) {
  const reduce = useReducedMotion();
  const [view, setView] = useState<"timeline" | "table">("timeline");
  const [filter, setFilter] = useState<number | null>(null);
  const multi = cards.length > 1;
  const events = useMemo(() => clearEvents(cards, plan.rows), [cards, plan.rows]);
  const marks = useMemo(() => progressMilestones(cards.reduce((a, c) => a + c.balance, 0), plan.rows), [cards, plan.rows]);

  const rows = plan.rows.map((r) => {
    const prevBal = r.month === 1 ? cards.map((c) => c.balance) : plan.rows[r.month - 2]!.balances;
    const remaining = filter === null ? r.remaining : r.balances[filter] ?? 0;
    const cleared = events.filter((e) => e.month === r.month && (filter === null || e.card === filter));
    const paid = filter === null ? r.payment : Math.max(0, (prevBal[filter] ?? 0) - (r.balances[filter] ?? 0)); // net principal for card
    const interest = filter === null ? r.interest : 0;
    return { ...r, remaining, cleared, paid, interestShown: interest, date: monthDate(r.month) };
  });
  const maxRemain = Math.max(1, ...rows.map((r) => r.remaining), filter === null ? cards.reduce((a, c) => a + c.balance, 0) : cards[filter]?.balance ?? 1);

  const years = useMemo(() => {
    const g = new Map<number, typeof rows>();
    rows.forEach((r) => { const y = r.date.getFullYear(); g.set(y, [...(g.get(y) ?? []), r]); });
    return [...g.entries()];
  }, [rows]);
  const [openYears, setOpenYears] = useState<Set<number>>(() => new Set(years.length ? [years[0]![0]] : []));

  function csv() {
    downloadCsv(`${name || "payoff-plan"}-schedule.csv`, [
      ["Month", "Date", "Paid", "Interest", ...(multi ? cards.map((c) => c.name) : []), "Remaining"],
      ...plan.rows.map((r) => [r.month, monthLabel(r.month), r.payment.toFixed(2), r.interest.toFixed(2), ...(multi ? r.balances.map((b) => b.toFixed(2)) : []), r.remaining.toFixed(2)]),
    ]);
    toast.success("Schedule downloaded");
  }

  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs transition-colors", active ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="rounded-2xl border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
        <h3 className="font-semibold text-foreground">Payment timeline</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5 text-xs">
            {(["timeline", "table"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-3 py-1 capitalize", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{v}</button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={csv}><Download className="h-4 w-4" /> Download CSV</Button>
        </div>
      </div>
      {multi && (
        <div className="flex flex-wrap gap-2 border-t px-4 py-3 sm:px-6">
          <button className={chip(filter === null)} onClick={() => setFilter(null)}>All cards</button>
          {cards.map((c, i) => <button key={i} className={chip(filter === i)} onClick={() => setFilter(i)}>{c.name}</button>)}
        </div>
      )}

      {view === "table" ? (
        <div className="max-h-[28rem] overflow-auto border-t">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 z-10 bg-card/95 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Month</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Interest</th>
                {multi && filter === null && cards.map((c, i) => <th key={i} className="hidden px-3 py-2 text-right font-medium md:table-cell">{c.name}</th>)}
                <th className="px-3 py-2 text-right font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className={cn("border-t hover:bg-primary/5", r.cleared.length && "bg-primary/10")}>
                  <td className="px-3 py-2">{monthLabel(r.month)}{filter === null && marks.filter((mk) => mk.month === r.month).map((mk) => <span key={mk.pct} className="ml-2 rounded-full border border-accent/30 px-1.5 text-[10px] text-accent">{mk.pct}%</span>)}</td>
                  <td className="px-3 py-2 text-right">{money(r.paid, true)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{filter === null ? money(r.interest, true) : "—"}</td>
                  {multi && filter === null && r.balances.map((b, i) => <td key={i} className="hidden px-3 py-2 text-right md:table-cell">{money(b, true)}</td>)}
                  <td className="px-3 py-2 text-right font-medium">{money(r.remaining, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t">
          {years.map(([year, list]) => {
            const open = openYears.has(year);
            const paid = list.reduce((a, r) => a + r.paid, 0);
            const interest = list.reduce((a, r) => a + r.interestShown, 0);
            return (
              <div key={year} className="border-b last:border-b-0">
                <button className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-left hover:bg-primary/5 sm:px-6"
                  onClick={() => setOpenYears((s) => { const n = new Set(s); if (n.has(year)) n.delete(year); else n.add(year); return n; })}>
                  <span className="w-12 font-semibold text-foreground">{year}</span>
                  <span className="text-xs text-muted-foreground">Paid <span className="tabular-nums text-foreground">{money(paid)}</span></span>
                  {filter === null && <span className="text-xs text-muted-foreground">Interest <span className="tabular-nums text-foreground">{money(interest)}</span></span>}
                  <span className="text-xs text-muted-foreground">Year-end <span className="tabular-nums text-foreground">{money(list[list.length - 1]!.remaining)}</span></span>
                  <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.ul initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                      {list.map((r, k) => {
                        const principal = Math.max(0, r.paid - r.interestShown);
                        const tot = Math.max(r.paid, 0.01);
                        return (
                          <motion.li key={r.month} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(k, 12) * 0.03 }}
                            className={cn("relative ml-6 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-l py-2.5 pl-5 pr-4 sm:ml-9 sm:grid-cols-[90px_110px_1fr_auto] sm:pr-6",
                              r.cleared.length && "rounded-r-lg bg-primary/10 shadow-[0_0_24px_-8px_var(--primary)]")}>
                            <span className="absolute -left-[4px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-border" />
                            <span className="text-sm text-foreground">{r.date.toLocaleDateString("en-US", { month: "long" })}</span>
                            <span className="text-right text-sm tabular-nums text-foreground sm:text-left">{money(r.paid, true)}</span>
                            <div className="col-span-2 sm:col-span-1">
                              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" title={`Principal ${money(principal, true)} · Interest ${money(r.interestShown, true)}`}>
                                <div className="bg-primary" style={{ width: `${(principal / tot) * 100}%` }} />
                                <div className="bg-accent/70" style={{ width: `${(r.interestShown / tot) * 100}%` }} />
                              </div>
                              {filter === null && marks.filter((mk) => mk.month === r.month).map((mk) => (
                                <span key={mk.pct} className="mt-1.5 mr-1.5 inline-flex items-center rounded-full border border-accent/30 px-2 py-0.5 text-[11px] font-medium text-accent">{mk.pct}% paid off</span>
                              ))}
                              {r.cleared.map((e) => (
                                <span key={e.card} className="mt-1.5 mr-1.5 inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-medium text-foreground">
                                  <Check className="h-3 w-3 text-primary" /> {e.name} paid off
                                </span>
                              ))}
                            </div>
                            <span className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                              <span className="h-1 w-10 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-accent/60" style={{ width: `${(r.remaining / maxRemain) * 100}%` }} /></span>
                              <span className="w-24 text-right text-sm font-medium tabular-nums text-foreground">{money(r.remaining, true)}</span>
                            </span>
                          </motion.li>
                        );
                      })}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          <div className="flex gap-4 px-4 py-3 text-xs text-muted-foreground sm:px-6">
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-primary" />Principal</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-accent/70" />Interest</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Share ---------------- */
export function ShareButton({ plan, saved }: { plan: SimResult; saved: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  async function download() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a"); a.href = url; a.download = "debt-free-plan.png"; a.click();
      toast.success("Image downloaded");
    } catch { toast.error("Couldn't create the image"); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(window.location.origin + "/"); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy the link"); }
  }
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Share2 className="h-4 w-4" /> Share</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Share your plan</DialogTitle></DialogHeader>
        <div ref={ref} className="overflow-hidden rounded-2xl border bg-background p-6" style={{ backgroundImage: "radial-gradient(400px 240px at 90% 0%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%)" }}>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><LogoMark size={24} /> Debt Free Buddy</div>
          <div className="mt-6 text-xs uppercase tracking-widest text-primary">My debt-free date</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{monthLong(plan.months)}</div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">Months to go</div><div className="text-xl font-semibold tabular-nums text-foreground">{plan.months}</div></div>
            <div className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">Interest saved</div><div className="text-xl font-semibold tabular-nums text-foreground">{saved !== null && saved > 0 ? money(saved) : "—"}</div></div>
          </div>
          <div className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-accent" /> Plan yours free at Debt Free Buddy</div>
        </div>
        <p className="text-xs text-muted-foreground">No card names or balances are shown, so it's safe to post.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={download} disabled={busy}><Download className="h-4 w-4" /> {busy ? "Creating…" : "Download image"}</Button>
          <Button variant="outline" onClick={copy}><Link2 className="h-4 w-4" /> Copy link</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
