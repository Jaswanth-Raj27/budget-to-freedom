export type RepaymentCard = { id: string; balance: number | string };

export type RepaymentPayment = {
  user_id: string;
  scenario_id: string;
  card_id: string;
  amount: number | string;
  payment_date: string;
};

export type ValidRepayment = {
  cents: number;
  month: string;
  cardId: string;
};

export function parseCents(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 999_999_999_999 ? cents : null;
}

export function formatInr(cents: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function isValidPaymentDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
}

export function getPaymentMonth(paymentDate: string) {
  if (!isValidPaymentDate(paymentDate)) return null;
  return paymentDate.slice(0, 7);
}

export function isValidPaymentAmount(cents: number, remainingCents: number) {
  return Number.isSafeInteger(cents) && cents > 0 && cents <= remainingCents;
}

export function hasReachedDebtPercent(paidCents: number, baselineCents: number, percent: number) {
  if (!Number.isSafeInteger(paidCents) || paidCents < 0 ||
      !Number.isSafeInteger(baselineCents) || baselineCents <= 0 ||
      !Number.isInteger(percent) || percent <= 0 || percent > 100) return false;
  return BigInt(paidCents) * 100n >= BigInt(baselineCents) * BigInt(percent);
}

export function calculateScenarioRepayment(
  cards: RepaymentCard[],
  payments: RepaymentPayment[],
  userId: string,
  scenarioId: string,
) {
  const cardIds = new Set(cards.map((card) => card.id));
  const paidCentsByCard = new Map<string, number>();
  const validPayments: ValidRepayment[] = [];

  for (const payment of payments) {
    if (payment.user_id !== userId || payment.scenario_id !== scenarioId || !cardIds.has(payment.card_id)) continue;
    const cents = parseCents(String(payment.amount));
    const month = getPaymentMonth(payment.payment_date);
    if (cents === null || cents <= 0 || !month) continue;

    paidCentsByCard.set(payment.card_id, (paidCentsByCard.get(payment.card_id) ?? 0) + cents);
    validPayments.push({ cents, month, cardId: payment.card_id });
  }

  const originalDebtCents = cards.reduce(
    (total, card) => total + Math.max(0, parseCents(String(card.balance)) ?? 0),
    0,
  );
  const totalRepaidCents = validPayments.reduce((total, payment) => total + payment.cents, 0);
  const remainingDebtCents = Math.max(0, originalDebtCents - totalRepaidCents);
  const percentRepaid = originalDebtCents > 0
    ? Math.min(100, (totalRepaidCents / originalDebtCents) * 100)
    : 0;

  return {
    originalDebtCents,
    totalRepaidCents,
    remainingDebtCents,
    percentRepaid,
    paidCentsByCard,
    validPayments,
  };
}

export function isMissingPaymentsTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "PGRST205" || candidate.code === "42P01" ||
    /could not find.*debt_payments|debt_payments.*(not found|does not exist|schema cache)/i.test(candidate.message ?? "");
}
