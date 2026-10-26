import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateScenarioRepayment,
  hasReachedDebtPercent,
  isValidPaymentAmount,
  isValidPaymentDate,
  parseCents,
} from "./repayment-utils.ts";
import {
  getOrCreatePaymentRequestKey,
  loadPendingPaymentAttempts,
  pendingPaymentStorageKey,
  paymentRequestFingerprint,
  removePendingPaymentAttempt,
  savePendingPaymentAttempts,
  upsertPendingPaymentAttempt,
} from "./payment-idempotency.ts";

test("payment amount validation uses integer paise and rejects invalid input", () => {
  assert.equal(parseCents("0.29"), 29);
  assert.equal(parseCents("10.5"), 1050);
  assert.equal(parseCents("NaN"), null);
  assert.equal(parseCents("Infinity"), null);
  assert.equal(parseCents("-0.01"), null);
  assert.equal(parseCents("1.001"), null);
  assert.equal(isValidPaymentAmount(29, 29), true);
  assert.equal(isValidPaymentAmount(30, 29), false);
  assert.equal(isValidPaymentAmount(0, 29), false);
});

test("repayment totals stay scoped to the selected user and scenario", () => {
  const cards = [{ id: "card-a", balance: "100.00" }];
  const payments = [
    { user_id: "user-a", scenario_id: "scenario-a", card_id: "card-a", amount: "20.10", payment_date: "2026-03-12" },
    { user_id: "user-a", scenario_id: "scenario-b", card_id: "card-a", amount: "50.00", payment_date: "2026-03-12" },
    { user_id: "user-b", scenario_id: "scenario-a", card_id: "card-a", amount: "30.00", payment_date: "2026-03-12" },
    { user_id: "user-a", scenario_id: "scenario-a", card_id: "card-b", amount: "40.00", payment_date: "2026-03-12" },
  ];

  const summary = calculateScenarioRepayment(cards, payments, "user-a", "scenario-a");
  assert.equal(summary.totalRepaidCents, 2010);
  assert.equal(summary.remainingDebtCents, 7990);
  assert.equal(summary.paidCentsByCard.get("card-a"), 2010);
});

test("remaining debt is clamped at zero and invalid dates do not count", () => {
  const cards = [{ id: "card-a", balance: "10.00" }];
  const payments = [
    { user_id: "user-a", scenario_id: "scenario-a", card_id: "card-a", amount: "10.00", payment_date: "2026-03-12" },
    { user_id: "user-a", scenario_id: "scenario-a", card_id: "card-a", amount: "5.00", payment_date: "2026-02-30" },
  ];

  const summary = calculateScenarioRepayment(cards, payments, "user-a", "scenario-a");
  assert.equal(summary.totalRepaidCents, 1000);
  assert.equal(summary.remainingDebtCents, 0);
  assert.equal(isValidPaymentDate("2026-02-30"), false);
});

test("percentage milestones use exact integer paise thresholds", () => {
  assert.equal(hasReachedDebtPercent(999, 10_000, 10), false);
  assert.equal(hasReachedDebtPercent(1_000, 10_000, 10), true);
  assert.equal(hasReachedDebtPercent(2_499, 10_000, 25), false);
  assert.equal(hasReachedDebtPercent(2_500, 10_000, 25), true);
  assert.equal(hasReachedDebtPercent(7_500, 10_000, 75), true);
  assert.equal(hasReachedDebtPercent(1, 0, 10), false);
});

test("pending retries reuse a key while distinct payment attempts get distinct keys", () => {
  const pending = new Map();
  let next = 0;
  const createKey = () => `request-${++next}`;
  const firstFingerprint = paymentRequestFingerprint("scenario-a", "card-a", 2_500, "2026-03-12");

  const firstKey = getOrCreatePaymentRequestKey(pending, firstFingerprint, createKey);
  assert.equal(getOrCreatePaymentRequestKey(pending, firstFingerprint, createKey), firstKey);

  const changedAmount = paymentRequestFingerprint("scenario-a", "card-a", 2_600, "2026-03-12");
  const secondKey = getOrCreatePaymentRequestKey(pending, changedAmount, createKey);
  assert.notEqual(secondKey, firstKey);

  pending.delete(firstFingerprint);
  assert.notEqual(getOrCreatePaymentRequestKey(pending, firstFingerprint, createKey), firstKey);
});

function makeAttempt(scenarioId, cardId, amountCents, paymentDate, idempotencyKey) {
  return {
    fingerprint: paymentRequestFingerprint(scenarioId, cardId, amountCents, paymentDate),
    idempotencyKey,
    scenarioId,
    cardId,
    amountCents,
    paymentDate,
  };
}

test("pending payment details and key restore after a simulated reload and retry unchanged", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const original = makeAttempt("scenario-a", "card-a", 12_345, "2026-03-12", "11111111-1111-4111-8111-111111111111");
  savePendingPaymentAttempts(storage, "user-a", [original]);

  const restoredAfterReload = loadPendingPaymentAttempts(storage, "user-a");
  assert.deepEqual(restoredAfterReload, [original]);
  const retry = restoredAfterReload[0];
  assert.equal(retry.idempotencyKey, original.idempotencyKey);
  assert.equal(retry.fingerprint, paymentRequestFingerprint("scenario-a", "card-a", 12_345, "2026-03-12"));
});

test("pending attempts are isolated by user, scenario, card, amount, and date", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const attempt = makeAttempt("scenario-a", "card-a", 1000, "2026-03-12", "11111111-1111-4111-8111-111111111111");
  savePendingPaymentAttempts(storage, "user-a", [attempt]);

  assert.deepEqual(loadPendingPaymentAttempts(storage, "user-b"), []);
  assert.notEqual(pendingPaymentStorageKey("user-a"), pendingPaymentStorageKey("user-b"));
  assert.notEqual(attempt.fingerprint, paymentRequestFingerprint("scenario-b", "card-a", 1000, "2026-03-12"));
  assert.notEqual(attempt.fingerprint, paymentRequestFingerprint("scenario-a", "card-b", 1000, "2026-03-12"));
  assert.notEqual(attempt.fingerprint, paymentRequestFingerprint("scenario-a", "card-a", 1001, "2026-03-12"));
  assert.notEqual(attempt.fingerprint, paymentRequestFingerprint("scenario-a", "card-a", 1000, "2026-03-13"));
});

test("confirmed success or explicit abandonment removes only that saved attempt", () => {
  const a = makeAttempt("scenario-a", "card-a", 1000, "2026-03-12", "11111111-1111-4111-8111-111111111111");
  const b = makeAttempt("scenario-a", "card-b", 2000, "2026-03-12", "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(removePendingPaymentAttempt([a, b], a.fingerprint), [b]);
  assert.deepEqual(upsertPendingPaymentAttempt([a, b], { ...a, idempotencyKey: "11111111-1111-4111-8111-111111111111" }), [b, a]);
});

test("storage read and write errors propagate so the UI can block unsafe submission", () => {
  const failingStorage = {
    getItem: () => { throw new Error("storage blocked"); },
    setItem: () => { throw new Error("quota exceeded"); },
    removeItem: () => {},
  };
  assert.throws(() => loadPendingPaymentAttempts(failingStorage, "user-a"), /storage blocked/);
  assert.throws(() => savePendingPaymentAttempts(failingStorage, "user-a", []), /quota exceeded/);
});

test("malformed stored attempts are not silently discarded or overwritten", () => {
  const values = new Map([[pendingPaymentStorageKey("user-a"), JSON.stringify([{ idempotencyKey: "invalid" }])]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const before = values.get(pendingPaymentStorageKey("user-a"));
  assert.throws(() => loadPendingPaymentAttempts(storage, "user-a"), /invalid attempt/);
  assert.equal(values.get(pendingPaymentStorageKey("user-a")), before);
});
