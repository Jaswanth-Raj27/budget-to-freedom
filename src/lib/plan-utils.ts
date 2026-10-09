// Presentation helpers built on top of simulate() — no payoff math lives here.
import type { BudgetMode, CardInput, MonthRow, Strategy } from "./simulate";

/** Calendar date for month offset m (month 1 = next month). */
export function monthDate(m: number, start = new Date()) {
  return new Date(start.getFullYear(), start.getMonth() + m, 1);
}
export const monthLabel = (m: number) => monthDate(m).toLocaleDateString("en-US", { month: "short", year: "numeric" });
export const monthLong = (m: number) => monthDate(m).toLocaleDateString("en-US", { month: "long", year: "numeric" });

export interface ClearEvent { card: number; name: string; month: number }

/** The month each card first reaches $0, in order. */
export function clearEvents(cards: CardInput[], rows: MonthRow[]): ClearEvent[] {
  const out: ClearEvent[] = [];
  cards.forEach((c, i) => {
    if (c.balance <= 0) return;
    const r = rows.find((row) => (row.balances[i] ?? 0) <= 0);
    if (r) out.push({ card: i, name: c.name || `Card ${i + 1}`, month: r.month });
  });
  return out.sort((a, b) => a.month - b.month || a.card - b.card);
}

/** Distinct semantic tints keep each card readable on paper surfaces. */
export function cardColor(i: number, _n: number) {
  return `var(--chart-${(i % 5) + 1})`;
}

/** Nice round axis ticks from 0 to >= max. */
export function niceTicks(max: number, count = 5) {
  if (max <= 0) return [0];
  const raw = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v));
  return ticks;
}

// ---- Guest plan hand-off (browser-only, never sent anywhere until the user signs up) ----
export interface GuestPlan { cards: CardInput[]; budget: number; mode: BudgetMode; strategy: Strategy }
const KEY = "dfb_guest_plan";
export function stashGuestPlan(p: GuestPlan) {
  try { sessionStorage.setItem(KEY, JSON.stringify(p)); localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
export function takeGuestPlan(): GuestPlan | null {
  try {
    const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
    sessionStorage.removeItem(KEY); localStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as GuestPlan) : null;
  } catch { return null; }
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => (typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Months since a plan was started (created). */
export function monthsElapsed(createdAt: string, now = new Date()) {
  const d = new Date(createdAt);
  return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth());
}

export interface Milestone { pct: 25 | 50 | 75; month: number }
/** First month total remaining drops by 25/50/75% of the starting total. */
export function progressMilestones(start: number, rows: MonthRow[]): Milestone[] {
  const out: Milestone[] = [];
  for (const pct of [25, 50, 75] as const) {
    const r = rows.find((row) => row.remaining > 0 && row.remaining <= start * (1 - pct / 100));
    if (r) out.push({ pct, month: r.month });
  }
  return out;
}
