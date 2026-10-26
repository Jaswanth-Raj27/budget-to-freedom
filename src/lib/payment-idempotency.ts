export type PendingPaymentAttempt = {
  fingerprint: string;
  idempotencyKey: string;
  scenarioId: string;
  cardId: string;
  amountCents: number;
  paymentDate: string;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const storagePrefix = "debt-free-buddy:pending-payments:v1:";

export function paymentRequestFingerprint(
  scenarioId: string,
  cardId: string,
  amountCents: number,
  paymentDate: string,
) {
  return JSON.stringify([scenarioId, cardId, amountCents, paymentDate]);
}

export function pendingPaymentStorageKey(userId: string) {
  return `${storagePrefix}${encodeURIComponent(userId)}`;
}

function isPendingPaymentAttempt(value: unknown): value is PendingPaymentAttempt {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Partial<PendingPaymentAttempt>;
  return typeof attempt.fingerprint === "string"
    && typeof attempt.idempotencyKey === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attempt.idempotencyKey)
    && typeof attempt.scenarioId === "string"
    && typeof attempt.cardId === "string"
    && Number.isSafeInteger(attempt.amountCents)
    && (attempt.amountCents ?? 0) > 0
    && typeof attempt.paymentDate === "string"
    && attempt.fingerprint === paymentRequestFingerprint(
      attempt.scenarioId,
      attempt.cardId,
      attempt.amountCents as number,
      attempt.paymentDate,
    );
}

export function loadPendingPaymentAttempts(storage: StorageLike, userId: string): PendingPaymentAttempt[] {
  const raw = storage.getItem(pendingPaymentStorageKey(userId));
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Pending payment storage has an invalid format.");
  if (!parsed.every(isPendingPaymentAttempt)) {
    throw new Error("Pending payment storage contains an invalid attempt and was preserved for recovery.");
  }
  return parsed;
}

export function savePendingPaymentAttempts(
  storage: StorageLike,
  userId: string,
  attempts: PendingPaymentAttempt[],
) {
  storage.setItem(pendingPaymentStorageKey(userId), JSON.stringify(attempts));
}

export function getOrCreatePaymentRequestKey(
  pendingKeys: Map<string, string>,
  fingerprint: string,
  createKey: () => string = () => crypto.randomUUID(),
) {
  const existing = pendingKeys.get(fingerprint);
  if (existing) return existing;
  const key = createKey();
  pendingKeys.set(fingerprint, key);
  return key;
}

export function upsertPendingPaymentAttempt(
  attempts: PendingPaymentAttempt[],
  attempt: PendingPaymentAttempt,
) {
  return [...attempts.filter((existing) => existing.fingerprint !== attempt.fingerprint), attempt];
}

export function removePendingPaymentAttempt(attempts: PendingPaymentAttempt[], fingerprint: string) {
  return attempts.filter((attempt) => attempt.fingerprint !== fingerprint);
}
