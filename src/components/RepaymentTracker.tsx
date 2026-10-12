import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Award, CalendarDays, Flame, RefreshCw, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CardInput } from "@/lib/simulate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TrackedCard = CardInput & { id: string };

const MAX_AMOUNT_CENTS = 999_999_999_999;

function parseCents(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_AMOUNT_CENTS ? cents : null;
}

function formatInr(cents: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function utcDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function isValidPaymentDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
}

function isMissingPaymentsTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "PGRST205" || candidate.code === "42P01" ||
    /could not find.*debt_payments|debt_payments.*(not found|does not exist|schema cache)/i.test(candidate.message ?? "");
}

function formatPaymentDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type AchievementDefinition = {
  key: string;
  label: string;
  earned: (paid: number, baseline: number, count: number, remaining: number) => boolean;
};

function reachedDebtPercent(paid: number, baseline: number, percent: bigint) {
  return baseline > 0 && BigInt(paid) * 100n >= BigInt(baseline) * percent;
}

const achievementDefinitions: AchievementDefinition[] = [
  { key: "first_payment", label: "First payment", earned: (_paid, _baseline, count) => count > 0 },
  { key: "repaid_500", label: "₹500 repaid", earned: (paid) => paid >= 50_000 },
  { key: "repaid_1000", label: "₹1,000 repaid", earned: (paid) => paid >= 100_000 },
  { key: "repaid_10_percent", label: "10% of debt repaid", earned: (paid, baseline) => reachedDebtPercent(paid, baseline, 10n) },
  { key: "repaid_25_percent", label: "25% of debt repaid", earned: (paid, baseline) => reachedDebtPercent(paid, baseline, 25n) },
  { key: "repaid_50_percent", label: "50% of debt repaid", earned: (paid, baseline) => reachedDebtPercent(paid, baseline, 50n) },
  { key: "repaid_75_percent", label: "75% of debt repaid", earned: (paid, baseline) => reachedDebtPercent(paid, baseline, 75n) },
  { key: "debt_free", label: "Debt-free", earned: (_paid, baseline, _count, remaining) => baseline > 0 && remaining === 0 },
];

function getPaymentMonth(paymentDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paymentDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validDate = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || validDate.getUTCFullYear() !== year || validDate.getUTCMonth() !== month - 1 || validDate.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}`;
}

function formatMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonthKey(month: string) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function RepaymentTracker({
  scenarioId,
  userId,
  cards,
}: {
  scenarioId: string;
  userId: string;
  cards: TrackedCard[];
}) {
  const queryClient = useQueryClient();
  const queryKey = ["debt_payments", userId, scenarioId];
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(utcDateInputValue);
  const [saving, setSaving] = useState(false);

  const paymentsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debt_payments")
        .select("id, card_id, amount, payment_date, created_at")
        .eq("user_id", userId)
        .eq("scenario_id", scenarioId)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    retry: (failureCount, error) => !isMissingPaymentsTable(error) && failureCount < 2,
  });

  const payments = useMemo(() => paymentsQuery.data ?? [], [paymentsQuery.data]);
  const paidCentsByCard = useMemo(() => {
    const totals = new Map<string, number>();
    for (const payment of payments) {
      const cents = parseCents(String(payment.amount));
      if (cents === null || cents <= 0) continue;
      totals.set(payment.card_id, (totals.get(payment.card_id) ?? 0) + cents);
    }
    return totals;
  }, [payments]);

  const originalDebtCents = cards.reduce((total, card) => total + Math.max(0, parseCents(String(card.balance)) ?? 0), 0);
  const validPayments = payments.flatMap((payment) => {
    const cents = parseCents(String(payment.amount));
    const month = getPaymentMonth(payment.payment_date);
    return cents !== null && cents > 0 && month ? [{ cents, month }] : [];
  });
  const totalRepaidCents = validPayments.reduce((total, payment) => total + payment.cents, 0);
  const remainingDebtCents = Math.max(0, originalDebtCents - totalRepaidCents);
  const percentRepaid = originalDebtCents > 0 ? Math.min(100, (totalRepaidCents / originalDebtCents) * 100) : 0;

  const monthlyTotals = new Map<string, { cents: number; count: number }>();
  for (const payment of validPayments) {
    const summary = monthlyTotals.get(payment.month) ?? { cents: 0, count: 0 };
    summary.cents += payment.cents;
    summary.count += 1;
    monthlyTotals.set(payment.month, summary);
  }
  const monthlyProgress = [...monthlyTotals.entries()].sort(([a], [b]) => b.localeCompare(a));
  const qualifyingMonths = new Set(monthlyTotals.keys());
  const sortedMonthsAscending = [...qualifyingMonths].sort();
  let longestStreak = 0;
  let run = 0;
  let priorMonth: string | null = null;
  for (const month of sortedMonthsAscending) {
    run = priorMonth && previousMonthKey(month) === priorMonth ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    priorMonth = month;
  }
  const thisMonth = currentMonthKey();
  const currentStreakStart = qualifyingMonths.has(thisMonth) ? thisMonth : previousMonthKey(thisMonth);
  let currentStreak = 0;
  let streakMonth = currentStreakStart;
  while (qualifyingMonths.has(streakMonth)) {
    currentStreak += 1;
    streakMonth = previousMonthKey(streakMonth);
  }
  const achievements = achievementDefinitions.map((achievement) => ({
    ...achievement,
    isEarned: achievement.earned(totalRepaidCents, originalDebtCents, validPayments.length, remainingDebtCents),
  }));

  async function recordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedCard = cards.find((card) => card.id === cardId);
    const amountCents = parseCents(amount);
    if (!selectedCard) {
      toast.error("Choose a card from this scenario.");
      return;
    }
    if (amountCents === null || amountCents <= 0) {
      toast.error("Enter a positive amount with no more than two decimal places.");
      return;
    }
    if (!isValidPaymentDate(paymentDate)) {
      toast.error("Choose a valid payment date.");
      return;
    }
    if (paymentDate > utcDateInputValue()) {
      toast.error("Payment date can't be in the future.");
      return;
    }

    setSaving(true);
    try {
      const startingCents = parseCents(String(selectedCard.balance));
      if (startingCents === null) {
        toast.error("This card's starting balance is invalid, so a payment can't be recorded.");
        return;
      }

      const { error } = await supabase.rpc("record_debt_payment", {
        p_scenario_id: scenarioId,
        p_card_id: selectedCard.id,
        p_amount: amountCents / 100,
        p_payment_date: paymentDate,
      });
      if (error) {
        if (error.code === "PGRST202" || /record_debt_payment.*(not found|schema cache)|could not find.*record_debt_payment/i.test(error.message)) {
          toast.error("Secure payment recording is unavailable until database migration 0004 is applied.");
          return;
        }
        if (error.message.includes("payment_exceeds_remaining_balance")) {
          toast.error("Payment exceeds this card's current remaining balance. Enter a smaller amount or choose another card.");
          return;
        }
        if (error.message.includes("invalid_payment_date")) {
          toast.error("Payment date can't be in the future.");
          return;
        }
        if (error.message.includes("invalid_payment_amount")) {
          toast.error("Enter a positive payment amount with no more than two decimal places.");
          return;
        }
        throw error;
      }

      setAmount("");
      toast.success("Payment recorded");
      void queryClient.invalidateQueries({ queryKey });
    } catch {
      toast.error("Couldn't save this payment. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const missingTable = isMissingPaymentsTable(paymentsQuery.error);
  const historyReady = !paymentsQuery.isLoading && !paymentsQuery.isError;

  return (
    <Card className="mt-10 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-xl">Repayment tracker</CardTitle>
        <CardDescription>
          Record payments for this scenario. Starting card balances stay unchanged; remaining balances are calculated from your recorded payments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {paymentsQuery.isLoading && (
          <p className="text-sm text-muted-foreground" role="status">Loading payment history…</p>
        )}

        {paymentsQuery.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{missingTable ? "Payment tracking isn't available yet" : "Payment history couldn't be loaded"}</AlertTitle>
            <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <span>
                {missingTable
                  ? "This database did not return the debt_payments table required by migration 0002. No payment data was changed."
                  : "Your payment history is unavailable right now. Balances are hidden until the history can be checked."}
              </span>
              {!missingTable && (
                <Button type="button" variant="outline" size="sm" onClick={() => paymentsQuery.refetch()}>
                  <RefreshCw className="h-4 w-4" /> Retry
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {historyReady && (
          <>
            <section aria-labelledby="repayment-progress-heading" className="space-y-4">
              <div>
                <h3 id="repayment-progress-heading" className="font-semibold text-foreground">Repayment progress</h3>
                <p className="text-sm text-muted-foreground">Based on this scenario’s original card balances and recorded payments.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Original tracked debt", value: formatInr(originalDebtCents), icon: Target },
                  { label: "Total repaid", value: formatInr(totalRepaidCents), icon: Award },
                  { label: "Remaining debt", value: formatInr(remainingDebtCents), icon: Target },
                  { label: "Debt repaid", value: `${percentRepaid.toFixed(1)}%`, icon: Award },
                ].map(({ label, value, icon: Icon }) => (
                  <Card key={label} className="border bg-background/60 shadow-none">
                    <CardContent className="flex items-center gap-3 p-4">
                      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="truncate font-semibold tabular-nums">{value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section aria-labelledby="monthly-progress-heading" className="rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 id="monthly-progress-heading" className="font-semibold">Monthly repayments</h3>
                </div>
                {monthlyProgress.length ? (
                  <ul className="mt-3 divide-y">
                    {monthlyProgress.map(([month, summary]) => (
                      <li key={month} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span>{formatMonth(month)}</span>
                        <span className="text-right font-medium tabular-nums">{formatInr(summary.cents)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No qualifying repayments yet. Monthly totals use payment dates.</p>
                )}
              </section>

              <section aria-labelledby="repayment-streak-heading" className="rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 id="repayment-streak-heading" className="font-semibold">Monthly repayment streak</h3>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground">Current streak</p><p className="text-xl font-semibold">{currentStreak} {currentStreak === 1 ? "month" : "months"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Longest streak</p><p className="text-xl font-semibold">{longestStreak} {longestStreak === 1 ? "month" : "months"}</p></div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">The current month is a grace month: if it has no payment yet, the current streak is counted through the most recent completed month until this month ends.</p>
              </section>
            </div>

            <section aria-labelledby="achievements-heading" className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 id="achievements-heading" className="font-semibold">Achievements</h3>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Derived from payments · not saved</span>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {achievements.map((achievement) => (
                  <li key={achievement.key} className={`rounded-lg border px-3 py-2 text-sm ${achievement.isEarned ? "border-primary/40 bg-primary/5" : "text-muted-foreground"}`}>
                    <span className="font-medium">{achievement.isEarned ? "✓ " : "○ "}{achievement.label}</span>
                    <span className="sr-only"> — {achievement.isEarned ? "earned" : "not earned"}</span>
                  </li>
                ))}
              </ul>
            </section>

            <form onSubmit={recordPayment} className="grid gap-4 rounded-xl border bg-background/60 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="repayment-card">Card</Label>
                <Select value={cardId} onValueChange={setCardId} disabled={!cards.length}>
                  <SelectTrigger id="repayment-card" aria-label="Card for payment">
                    <SelectValue placeholder="Choose a card" />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>{card.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repayment-amount">Payment amount</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                  <Input
                    id="repayment-amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="pl-8 tabular-nums"
                    placeholder="0.00"
                    required
                  />
                </div>
                {(() => {
                  const selectedCard = cards.find((card) => card.id === cardId);
                  const startingCents = selectedCard ? parseCents(String(selectedCard.balance)) : null;
                  const remainingCents = startingCents === null ? null : Math.max(0, startingCents - (paidCentsByCard.get(cardId) ?? 0));
                  return (
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      {remainingCents === null ? "Select a card to see its remaining balance." : `Remaining balance: ${formatInr(remainingCents)}`}
                      {remainingCents === 0 && " — this card is paid off."}
                    </p>
                  );
                })()}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repayment-date">Payment date</Label>
                <Input id="repayment-date" type="date" max={utcDateInputValue()} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required />
              </div>
              <Button type="submit" disabled={saving || !cards.length} className="w-full lg:w-auto">
                 {saving ? "Saving…" : "Record payment"}
              </Button>
              {!cards.length && <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Add and save a card in this scenario before recording a payment.</p>}
            </form>

            <section aria-labelledby="remaining-balances-heading">
              <h3 id="remaining-balances-heading" className="font-semibold text-foreground">Remaining balances</h3>
              <ul className="mt-3 divide-y rounded-xl border">
                {cards.map((card) => {
                  const startingCents = Math.max(0, parseCents(String(card.balance)) ?? 0);
                  const remainingCents = Math.max(0, startingCents - (paidCentsByCard.get(card.id) ?? 0));
                  return (
                    <li key={card.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <span className="font-medium">{card.name}</span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {formatInr(remainingCents)} remaining <span className="px-1">·</span> starting {formatInr(startingCents)}
                      </span>
                    </li>
                  );
                })}
                {!cards.length && <li className="px-4 py-3 text-sm text-muted-foreground">No saved cards in this scenario yet.</li>}
              </ul>
            </section>

            <section aria-labelledby="payment-history-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="payment-history-heading" className="font-semibold text-foreground">Payment history</h3>
                {payments.length > 0 && <span className="text-sm text-muted-foreground">{payments.length} payment{payments.length === 1 ? "" : "s"}</span>}
              </div>
              {payments.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No payments recorded for this scenario yet. Your starting balances are shown above.
                </p>
              ) : (
                <ul className="mt-3 divide-y rounded-xl border">
                  {payments.map((payment) => {
                    const cardName = cards.find((card) => card.id === payment.card_id)?.name ?? "Removed card";
                    return (
                      <li key={payment.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                        <span className="text-muted-foreground">{formatPaymentDate(payment.payment_date)}</span>
                        <span className="font-medium">{cardName}</span>
                        <span className="font-semibold tabular-nums sm:text-right">{formatInr(parseCents(String(payment.amount)) ?? 0)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
