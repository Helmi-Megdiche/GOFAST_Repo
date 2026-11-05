import type { Locale } from "@fastgo/i18n";
import { consumeVerification } from "../data/otp";
import { createOrder, findOrderByKey, NetworkError, type OrderError } from "../data/orders";
import { now } from "./clock";
import { clearDraft, loadDraft, saveDraft, type OrderDraft } from "./draft";
import { buildOrderRequest, fingerprint } from "./request";

export type SubmitResult =
  | { status: "created"; code: string }
  | { status: "refused"; error: OrderError }
  | { status: "lost" }
  | { status: "incomplete" };

/**
 * Sends the order once (R202). The idempotency key comes from the draft; before the call the draft
 * records the attempt and the request fingerprint, so after a lost answer (even after a reload)
 * only a retry of the same payload is offered. The draft is cleared once the order exists.
 */
export async function submitOrder(draft: OrderDraft, locale: Locale): Promise<SubmitResult> {
  const request = buildOrderRequest(draft, draft.termsAccepted, locale);
  if (!request) return { status: "incomplete" };
  const print = fingerprint(request);
  if (draft.pendingSubmit && draft.pendingSubmit.fingerprint !== print) {
    return { status: "refused", error: "idempotencyConflict" };
  }

  saveDraft({
    ...draft,
    submitAttemptedAt: draft.submitAttemptedAt ?? now(),
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

  // Refused: no order exists for this key, so the customer may change the draft again.
  const latest = loadDraft() ?? draft;
  saveDraft({ ...latest, pendingSubmit: null });
  return { status: "refused", error: result.error };
}

/**
 * After a lost answer, a new idempotency key is allowed only when the server proves that no order
 * exists for the old one. Returns the order code if it does exist.
 */
export async function resolveLostSubmit(
  draft: OrderDraft,
): Promise<{ code: string } | { draft: OrderDraft }> {
  const code = await findOrderByKey(draft.idempotencyKey);
  if (code) return { code };
  return {
    draft: saveDraft({ ...draft, idempotencyKey: crypto.randomUUID(), pendingSubmit: null }),
  };
}
