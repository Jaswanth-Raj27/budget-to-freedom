import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Pause, Play } from "lucide-react";
import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, type CardInput, type SimResult } from "@/lib/simulate";
import { cardColor, clearEvents, monthLabel, monthLong, niceTicks } from "@/lib/plan-utils";
import { Button } from "@/components/ui/button";

interface Props {
  cards: CardInput[];
  plan: SimResult;
  base: SimResult; // minimums only
  boosted?: SimResult | null; // what-if series
  compact?: boolean;
}

type Row = Record<string, number | undefined | [number, number]>;

export function PayoffLandscape({ cards, plan, base, boosted, compact }: Props) {
  const reduce = useReducedMotion();
  const n = cards.length;
  const planLen = plan.rows.length;
  const boostLen = boosted?.status === "ok" ? boosted.rows.length : 0;
  // Show the minimums ghost far enough to see the gap without squashing the plan
  const len = Math.max(planLen, Math.min(base.rows.length, Math.ceil(planLen * 1.6) + 6));
  const total0 = cards.reduce((a, c) => a + c.balance, 0);
  const saved = base.status === "ok" ? base.totalInterest - plan.totalInterest : null;

  const data = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (let m = 0; m <= len; m++) {
      const r = m === 0 ? null : plan.rows[m - 1];
      const inPlan = m <= planLen;
      const row: Row = { m };
      let planTotal: number | undefined;
      if (inPlan) {
        planTotal = 0;
        cards.forEach((c, i) => {
          const v = m === 0 ? c.balance : (r?.balances[i] ?? 0);
          row[`c${i}`] = v;
          planTotal! += v;
        });
        row.plan = planTotal;
      }
      const b = m === 0 ? total0 : base.rows[m - 1]?.remaining;
      row.min = b;
      if (b !== undefined) row.gap = [planTotal ?? 0, b];
      if (boosted && boosted.status === "ok" && m <= boostLen) row.boost = m === 0 ? total0 : boosted.rows[m - 1]?.remaining;
      out.push(row);
    }
    return out;
  }, [cards, plan, base, boosted, len, planLen, boostLen, total0]);

  const events = useMemo(() => clearEvents(cards, plan.rows), [cards, plan.rows]);

  // Playback / scrubber
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCursor((c) => {
        const next = (c ?? 0) + 1;
        if (next >= planLen) { setPlaying(false); return planLen; }
        return next;
      });
    }, reduce ? 400 : Math.max(60, 3000 / Math.max(planLen, 1)));
    return () => clearInterval(id);
  }, [playing, planLen, reduce]);

  const shown = cursor === null ? data : data.map((r) => (Number(r.m) <= cursor ? r : { m: r.m, min: r.min }));
  const cursorLeft = cursor === null ? null : Number(data[Math.min(cursor, planLen)]?.plan ?? 0);

  const yMax = Math.max(total0, ...data.map((d) => Number(d.min ?? 0)));
  const yTicks = niceTicks(yMax, compact ? 3 : 4);
  const xCount = compact ? 4 : 6;
  const xStep = Math.max(1, Math.ceil(len / xCount));
  const xTicks = Array.from(new Set(Array.from({ length: Math.floor(len / xStep) + 1 }, (_, k) => k * xStep)));
  const fmtY = (v: number) => (yMax >= 10000 ? `$${(v / 1000).toLocaleString()}k` : money(v));

  const gapMid = Math.min(len, Math.round(planLen * 0.9));
  const gapY = data[gapMid] ? (Number((data[gapMid]!.min as number) ?? 0) + Number(data[gapMid]!.plan ?? 0)) / 2 : 0;

  return (
    <div>
      <div className={compact ? "h-56" : "h-80"}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={shown} margin={{ top: 28, right: 16, left: 0, bottom: 0 }}>
            <defs>
              {cards.map((_, i) => (
                <linearGradient key={i} id={`lg-c${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: cardColor(i, n), stopOpacity: 0.55 }} />
                  <stop offset="100%" style={{ stopColor: cardColor(i, n), stopOpacity: 0.08 }} />
                </linearGradient>
              ))}
              <linearGradient id="lg-gap" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--primary)", stopOpacity: 0.22 }} />
                <stop offset="100%" style={{ stopColor: "var(--primary)", stopOpacity: 0.02 }} />
              </linearGradient>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <XAxis dataKey="m" type="number" domain={[0, len]} ticks={xTicks} tickFormatter={(m) => monthLabel(m)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]!]} tickFormatter={fmtY} width={compact ? 52 : 60}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            {yTicks.slice(1).map((t) => <ReferenceLine key={t} y={t} stroke="var(--border)" strokeOpacity={0.6} />)}
            <Tooltip content={<GlassTip cards={cards} />} cursor={{ stroke: "var(--accent)", strokeOpacity: 0.35, strokeWidth: 1 }} />

            {saved !== null && <Area dataKey="gap" stroke="none" fill="url(#lg-gap)" isAnimationActive={!reduce && cursor === null} animationDuration={1200} activeDot={false} />}
            {cards.map((_, i) => (
              <Area key={i} dataKey={`c${i}`} stackId="plan" type="monotone" stroke={cardColor(i, n)} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" fill={`url(#lg-c${i})`}
                isAnimationActive={!reduce && cursor === null} animationDuration={1200} animationEasing="ease-out" activeDot={false} />
            ))}
            <Line dataKey="min" type="monotone" stroke="var(--accent)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="5 5" dot={false}
              isAnimationActive={!reduce && cursor === null} animationDuration={1200} activeDot={false} />
            {boosted?.status === "ok" && (
              <Line dataKey="boost" type="monotone" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" dot={false} filter="url(#glow)"
                isAnimationActive={false} activeDot={false} />
            )}

            {saved !== null && saved > 0 && !compact && data[gapMid] && (
              <ReferenceDot x={gapMid} y={gapY} r={0} label={{ value: `${money(saved)} saved`, fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />
            )}
            {events.filter((e) => e.month < planLen).map((e, k) => (
              <ReferenceLine key={e.card} x={e.month} stroke="var(--accent)" strokeOpacity={0.25}
                label={compact ? undefined : { value: `${e.name} cleared`, position: "top", fill: "var(--muted-foreground)", fontSize: 10, dy: (k % 2) * 12 }} />
            ))}
            {events.filter((e) => e.month < planLen).map((e) => (
              <ReferenceDot key={`d${e.card}`} x={e.month} y={Number(data[e.month]?.plan ?? 0)} r={4} fill="var(--primary)" stroke="var(--background)" strokeWidth={2} filter="url(#glow)" />
            ))}
            <ReferenceDot x={planLen} y={0} r={7} fill="var(--primary)" stroke="var(--foreground)" strokeWidth={2} filter="url(#glow)"
              label={{ value: `Debt-free · ${monthLabel(planLen)}`, position: "top", fill: "var(--foreground)", fontSize: 11, fontWeight: 600, dy: -6 }} />
            {cursor !== null && <ReferenceLine x={cursor} stroke="var(--primary)" strokeWidth={1.5} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => {
          if (playing) { setPlaying(false); return; }
          if (cursor === null || cursor >= planLen) setCursor(0);
          setPlaying(true);
        }}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? "Pause" : "Play"}
        </Button>
        <input type="range" min={0} max={planLen} value={cursor ?? planLen} aria-label="Timeline scrubber"
          onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }}
          className="h-1.5 min-w-[140px] flex-1 cursor-pointer accent-[var(--primary)]" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {cursor === null ? `${planLen} months · ${monthLabel(planLen)}` : `Month ${cursor} · ${money(cursorLeft ?? 0)} left`}
        </span>
        {cursor !== null && !playing && (
          <button className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setCursor(null)}>Reset</button>
        )}
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {cards.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: cardColor(i, n) }} />{c.name}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-accent/60" />Minimums only</span>
          {boosted?.status === "ok" && <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-primary" />With extra payment</span>}
        </div>
      )}
      <p className="sr-only">Debt-free {monthLong(planLen)}.</p>
    </div>
  );
}

function GlassTip({ active, payload, label, cards }: { active?: boolean; payload?: { payload: Row }[]; label?: number; cards: CardInput[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0]!.payload;
  if (r.plan === undefined) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-xs shadow-card backdrop-blur-md">
        <div className="font-medium text-foreground">{monthLabel(Number(label))}</div>
        <div className="mt-1 text-muted-foreground">Paid off ✓ · minimums only: <span className="tabular-nums">{money(Number(r.min ?? 0))}</span></div>
      </div>
    );
  }
  return (
    <div className="min-w-[180px] rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-xs shadow-card backdrop-blur-md">
      <div className="font-medium text-foreground">{monthLabel(Number(label))}</div>
      {cards.length > 1 && (
        <div className="mt-1.5 space-y-0.5">
          {cards.map((c, i) => (
            <div key={i} className="flex justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{ background: cardColor(i, cards.length) }} />{c.name}</span>
              <span className="tabular-nums text-foreground">{money(Number(r[`c${i}`] ?? 0))}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex justify-between gap-4 border-t border-border/60 pt-1.5 font-medium">
        <span className="text-foreground">Total</span><span className="tabular-nums text-foreground">{money(Number(r.plan))}</span>
      </div>
      {r.boost !== undefined && <div className="flex justify-between gap-4 text-primary"><span>With extra</span><span className="tabular-nums">{money(Number(r.boost))}</span></div>}
    </div>
  );
}
