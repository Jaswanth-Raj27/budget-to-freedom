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

/** Tint for card i: steel blue → silver. */
export function cardColor(i: number, n: number) {
  const t = n <= 1 ? 0 : Math.round((i / (n - 1)) * 100);
  return `color-mix(in oklab, var(--primary) ${100 - t}%, var(--accent))`;
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
