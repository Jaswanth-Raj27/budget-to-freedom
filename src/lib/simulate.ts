// Debt payoff simulation — pure, client-side, all math done in integer cents.

export type Strategy = "snowball" | "avalanche";
export type BudgetMode = "fixed_total" | "fixed_extra";

export interface CardInput {
  name: string;
  balance: number; // dollars
  apr: number; // percent, e.g. 22.9
  min_pct: number; // percent, e.g. 2
  min_floor: number; // dollars, e.g. 25
}

export interface MonthRow {
  month: number;
  payment: number; // dollars paid this month
  interest: number; // dollars of interest accrued this month
  remaining: number; // dollars left across all cards at month end
  balances: number[]; // per-card balance at month end (dollars)
}

export interface SimResult {
  status: "ok" | "below_minimums" | "never" | "empty";
  months: number;
  totalInterest: number;
  totalPaid: number;
  firstMonthMinimums: number;
  rows: MonthRow[];
}

const MAX_MONTHS = 1200; // 100 years — hard safety cap

/**
 * Simulate paying off a set of cards month by month.
 *
 * Each month:
 *  1. Accrue interest on every open card: balance × APR / 12 (rounded to the cent).
 *  2. Pay each card's minimum: max(balance × min_pct, min_floor), capped at the balance.
 *  3. Send whatever budget is left to the target card chosen by strategy
 *     (snowball = smallest balance, avalanche = highest APR). If that card clears,
 *     the rest cascades to the next target in the same month.
 *
 * Budget modes:
 *  - fixed_total: `budget` is the whole monthly payment.
 *  - fixed_extra: `budget` is paid on top of that month's minimums.
 *  - minimumsOnly: ignore the budget and pay only minimums (for comparison).
 *
 * Stops at zero, flags "below_minimums" if the budget can't cover minimums,
 * and "never" if a full month passes with no reduction in total debt.
 */
export function simulate(
  cards: CardInput[],
  budget: number,
  mode: BudgetMode,
  strategy: Strategy,
  minimumsOnly = false,
): SimResult {
  const bal = cards.map((c) => Math.max(0, Math.round(c.balance * 100)));
  const result: SimResult = {
    status: "ok",
    months: 0,
    totalInterest: 0,
    totalPaid: 0,
    firstMonthMinimums: 0,
    rows: [],
  };
  if (cards.length === 0 || bal.every((b) => b === 0)) {
    result.status = cards.length === 0 ? "empty" : "ok";
    return result;
  }
  const budgetCents = Math.max(0, Math.round(budget * 100));
  let interestTotal = 0;
  let paidTotal = 0;

  for (let month = 1; month <= MAX_MONTHS; month++) {
    const startTotal = bal.reduce((a, b) => a + b, 0);

    // 1. Interest
    let monthInterest = 0;
    cards.forEach((c, i) => {
      if (bal[i] <= 0) return;
      const interest = Math.round((bal[i] * (c.apr / 100)) / 12);
      bal[i] += interest;
      monthInterest += interest;
    });

    // 2. Minimums (capped at remaining balance)
    const mins = cards.map((c, i) => {
      if (bal[i] <= 0) return 0;
      const pct = Math.round(bal[i] * (c.min_pct / 100));
      const floor = Math.round(c.min_floor * 100);
      return Math.min(bal[i], Math.max(pct, floor));
    });
    const sumMins = mins.reduce((a, b) => a + b, 0);
    if (month === 1) result.firstMonthMinimums = sumMins / 100;

    let available = minimumsOnly
      ? sumMins
      : mode === "fixed_total"
        ? budgetCents
        : sumMins + budgetCents;

    if (available < sumMins) {
      result.status = "below_minimums";
      break;
    }

    let monthPaid = 0;
    mins.forEach((m, i) => {
      bal[i] -= m;
      available -= m;
      monthPaid += m;
    });

    // 3. Extra payment cascades through targets by strategy
    while (available > 0) {
      let target = -1;
      for (let i = 0; i < cards.length; i++) {
        if (bal[i] <= 0) continue;
        if (target === -1) { target = i; continue; }
        const better =
          strategy === "snowball"
            ? bal[i] < bal[target] || (bal[i] === bal[target] && cards[i].apr > cards[target].apr)
            : cards[i].apr > cards[target].apr || (cards[i].apr === cards[target].apr && bal[i] < bal[target]);
        if (better) target = i;
      }
      if (target === -1) break; // everything paid off
      const pay = Math.min(available, bal[target]);
      bal[target] -= pay;
      available -= pay;
      monthPaid += pay;
    }

    for (let i = 0; i < bal.length; i++) if (bal[i] < 0) bal[i] = 0; // never negative

    interestTotal += monthInterest;
    paidTotal += monthPaid;
    const endTotal = bal.reduce((a, b) => a + b, 0);
    result.rows.push({
      month,
      payment: monthPaid / 100,
      interest: monthInterest / 100,
      remaining: endTotal / 100,
      balances: bal.map((b) => b / 100),
    });

    if (endTotal === 0) {
      result.months = month;
      break;
    }
    if (endTotal >= startTotal) {
      result.status = "never";
      break;
    }
    if (month === MAX_MONTHS) result.status = "never";
  }

  result.totalInterest = interestTotal / 100;
  result.totalPaid = paidTotal / 100;
  return result;
}

export const money = (n: number, cents = false) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });

export const formatMonths = (m: number) => {
  const y = Math.floor(m / 12);
  const r = m % 12;
  if (y === 0) return `${r} month${r === 1 ? "" : "s"}`;
  return `${y} yr${y === 1 ? "" : "s"}${r ? ` ${r} mo` : ""}`;
};
