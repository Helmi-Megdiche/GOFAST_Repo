import { consumeVerification } from "../data/otp";
import { createOrder, findOrderByKey, NetworkError, type OrderError } from "../data/orders";
import { now } from "./clock";
import { clearDraft, loadDraft, saveDraft, type OrderDraft } from "./draft";
import { buildOrderRequest, fingerprint } from "./request";

export type SubmitResult =
  | { status: "created"; code: string }
  | { status: "refused"; error: OrderError }
  | { status: "lost" }
  | { status: "incomplete" }
  /** Another tab changed the order since this tab showed it: nothing was sent, show what is saved. */
  | { status: "changed" };

/** An order exists for this key (placed here or in another tab): the draft is done. */
async function existingOrder(idempotencyKey: string): Promise<SubmitResult | null> {
  const code = await findOrderByKey(idempotencyKey);
  if (!code) return null;
  clearDraft();
  return { status: "created", code };
}

/**
 * Sends the order once (R202). The idempotency key comes from the draft; before the call the draft
 * records the attempt and the request fingerprint, so after a lost answer (even after a reload)
 * only a retry of the same payload is offered. The draft is cleared once the order exists.
 * A tab whose draft was cleared or replaced elsewhere never writes it back: it looks the order up.
 * A tab whose draft was changed elsewhere sends nothing ("changed") and shows the saved draft.
 */
export async function submitOrder(draft: OrderDraft): Promise<SubmitResult> {
  const stored = loadDraft();
  if (!stored || stored.idempotencyKey !== draft.idempotencyKey) {
    return (await existingOrder(draft.idempotencyKey)) ?? { status: "incomplete" };
  }

  const request = buildOrderRequest(draft, draft.termsAccepted);
  if (!request) return { status: "incomplete" };
  const print = fingerprint(request);
  const pending = stored.pendingSubmit ?? draft.pendingSubmit;
  if (pending && pending.fingerprint !== print) {
    return { status: "refused", error: "idempotencyConflict" };
  }
  // What this tab shows must be what is saved: a stale tab never sends (nor writes back) an order
  // that another tab has changed since, e.g. a new weight that needs a new price.
  const saved = buildOrderRequest(stored, stored.termsAccepted);
  if (!pending && (!saved || fingerprint(saved) !== print)) return { status: "changed" };

  saveDraft({
    ...stored,
    submitAttemptedAt: stored.submitAttemptedAt ?? draft.submitAttemptedAt ?? now(),
    expiresAt: stored.expiresAt,
    pendingSubmit: { fingerprint: print },
  });

  let result;
  try {
    result = await createOrder(request, draft.idempotencyKey);
  } catch (error) {
    if (error instanceof NetworkError) return { status: "lost" };
    throw error;
  }

  if (result.status === "created") {
    consumeVerification({ channel: "sms", value: request.sender.phone });
    clearDraft();
    return { status: "created", code: result.code };
  }

  // The key is already used with another payload: the order exists, show it.
  if (result.error === "idempotencyConflict") {
    const found = await existingOrder(draft.idempotencyKey);
    if (found) return found;
  }

  // Refused: no order exists for this key, so the customer may change the draft again.
  const latest = loadDraft() ?? draft;
  saveDraft({ ...latest, pendingSubmit: null });
  return { status: "refused", error: result.error };
}

/**
 * After a lost answer, a new idempotency key is allowed only when the server proves that no order
 * exists for the old one. Returns the order code if it does exist (the draft is then cleared).
 */
export async function resolveLostSubmit(
  draft: OrderDraft,
): Promise<{ code: string } | { draft: OrderDraft }> {
  const code = await findOrderByKey(draft.idempotencyKey);
  if (code) {
    clearDraft();
    return { code };
  }
  return {
    draft: saveDraft({ ...draft, idempotencyKey: crypto.randomUUID(), pendingSubmit: null }),
  };
}

// A refusal from the order code step (W20), shown by W15 after the client-side navigation. Kept in
// memory only: a reload shows W15 without it, as after any other answer.
let handedOff: OrderError | null = null;

export function handOffRefusal(error: OrderError): void {
  handedOff = error;
}

export function peekRefusal(): OrderError | null {
  return handedOff;
}

export function clearRefusal(): void {
  handedOff = null;
}
