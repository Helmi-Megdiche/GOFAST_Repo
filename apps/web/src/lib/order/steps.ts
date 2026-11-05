import { isSlotInFuture } from "./slots";
import { isQuoteValid, priceKey, type PriceInput } from "./pricing";
import { normalizePhone } from "../phone";
import type { AddressDraft, OrderDraft } from "./draft";
import { parcelSchema, parseWeightKg, personSchema } from "./schemas";

/** The five steps, in order, with their path under /commander. */
export const STEPS = ["sender", "recipient", "parcel", "service", "review"] as const;
export type StepId = (typeof STEPS)[number];

export const STEP_PATHS: Record<StepId | "outOfZone" | "code", string> = {
  sender: "/commander/expediteur",
  recipient: "/commander/destinataire",
  parcel: "/commander/colis",
  service: "/commander/service",
  review: "/commander/verification",
  code: "/commander/code",
  outOfZone: "/commander/hors-zone",
};

/** In zone only once confirmed (suggestion or pin) and checked: "unknown" never reaches a price. */
export function addressInZone(address: AddressDraft): boolean {
  return address.confirmed && address.zone?.status === "in-zone";
}

export function addressOutOfZone(address: AddressDraft): boolean {
  return address.confirmed && address.zone?.status === "out-of-zone";
}

function senderDone(draft: OrderDraft, at: number): boolean {
  return (
    addressInZone(draft.sender.address) &&
    personSchema.safeParse(draft.sender).success &&
    isSlotInFuture(draft.sender.slot, at)
  );
}

function recipientDone(draft: OrderDraft): boolean {
  return addressInZone(draft.recipient.address) && personSchema.safeParse(draft.recipient).success;
}

function parcelDone(draft: OrderDraft): boolean {
  // fr accepts both separators, so it validates whatever was typed in any language.
  return parcelSchema("fr").safeParse(draft.parcel).success;
}

function serviceDone(draft: OrderDraft, at: number): boolean {
  if (draft.service.code == null || draft.quote == null) return false;
  if (draft.service.code === "scheduled" && !isSlotInFuture(draft.service.slot, at)) return false;
  return true;
}

/** What the visitor sees if the quote no longer matches what they ordered. */
export function priceInputOf(draft: OrderDraft): PriceInput | null {
  const weightKg = parseWeightKg(draft.parcel.weightKg);
  const zone = draft.recipient.address.zone;
  if (!draft.service.code || !draft.parcel.type || weightKg == null || zone?.status !== "in-zone")
    return null;
  return {
    service: draft.service.code,
    parcelType: draft.parcel.type,
    weightKg,
    fragile: draft.parcel.fragile,
    zone: zone.zone,
  };
}

export function quoteMatches(draft: OrderDraft): boolean {
  const input = priceInputOf(draft);
  return input != null && draft.quote != null && priceKey(input) === priceKey(draft.quote.input);
}

/**
 * The step guard (plan section 2): where someone who opens `wanted` directly must go instead.
 * Out of zone goes to W17 before any price (R201). Returns null when `wanted` is reachable.
 */
export function redirectFor(
  draft: OrderDraft | null,
  wanted: StepId,
  at: number,
): keyof typeof STEP_PATHS | null {
  if (!draft) return wanted === "sender" ? null : "sender";
  if (addressOutOfZone(draft.sender.address) || addressOutOfZone(draft.recipient.address)) {
    return wanted === "sender" || wanted === "recipient" ? null : "outOfZone";
  }
  const done: Record<StepId, boolean> = {
    sender: senderDone(draft, at),
    recipient: recipientDone(draft),
    parcel: parcelDone(draft),
    service: serviceDone(draft, at),
    review: false,
  };
  for (const step of STEPS) {
    if (step === wanted) return null;
    if (!done[step]) return step;
  }
  return null;
}

/** Same full phone as the one verified for this draft. */
export function draftPhoneVerified(draft: OrderDraft): boolean {
  const phone = normalizePhone(draft.sender.phone);
  return phone != null && draft.verifiedPhone === phone;
}

export { isQuoteValid };
