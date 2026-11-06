import { isTargetVerified } from "../data/otp";
import { isSlotInFuture } from "./slots";
import { addressPriceKey, isQuoteValid, priceKey, type PriceInput, type Quote } from "./pricing";
import { normalizePhone } from "../phone";
import type { ServiceCode } from "../data/services";
import type { ZoneResult } from "../data/zones";
import type { AddressDraft, OrderDraft } from "./draft";
import { parseCount, parseWeightKg, personSchema, requiredText } from "./schemas";

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

/** No declared value, or a stored integer number of millimes (parsed once, on W13). */
export function declaredValueValid(millimes: number | null | undefined): boolean {
  return (
    millimes === null ||
    (typeof millimes === "number" && Number.isSafeInteger(millimes) && millimes >= 0)
  );
}

function parcelDone(draft: OrderDraft): boolean {
  const { parcel } = draft;
  return (
    parcel.type != null &&
    parseCount(parcel.count) != null &&
    parseWeightKg(parcel.weightKg) != null &&
    requiredText.safeParse(parcel.content).success &&
    declaredValueValid(parcel.declaredValueMillimes) &&
    parcel.declaredValueInvalid !== true
  );
}

/** The services both the departure and the arrival zones offer (W14, the guard and createOrder). */
export function servicesOffered(
  departure: ZoneResult | null | undefined,
  arrival: ZoneResult | null | undefined,
): ServiceCode[] {
  if (departure?.status !== "in-zone" || arrival?.status !== "in-zone") return [];
  return arrival.services.filter((code) => departure.services.includes(code));
}

export function offeredServices(draft: OrderDraft): ServiceCode[] {
  return servicesOffered(draft.sender.address.zone, draft.recipient.address.zone);
}

function serviceDone(draft: OrderDraft, at: number): boolean {
  // A priced field changed since the quote (e.g. the weight on W13): W14 prices it again (R205).
  if (draft.service.code == null || !quoteMatches(draft)) return false;
  // An address changed since W14 to a zone without this service (e.g. Programmée).
  if (!offeredServices(draft).includes(draft.service.code)) return false;
  if (draft.service.code === "scheduled" && !isSlotInFuture(draft.service.slot, at)) return false;
  return true;
}

/** What the visitor sees if the quote no longer matches what they ordered. */
export function priceInputOf(draft: OrderDraft): PriceInput | null {
  const weightKg = parseWeightKg(draft.parcel.weightKg);
  const zone = draft.recipient.address.zone;
  // Distance is priced: both addresses are part of the input.
  if (!draft.service.code || !draft.parcel.type || weightKg == null || zone?.status !== "in-zone")
    return null;
  return {
    service: draft.service.code,
    parcelType: draft.parcel.type,
    weightKg,
    fragile: draft.parcel.fragile,
    zone: zone.zone,
    from: addressPriceKey(draft.sender.address),
    to: addressPriceKey(draft.recipient.address),
  };
}

/**
 * A recalculated quote (R205), waiting for the customer to accept it. The total of the accepted
 * quote it replaces is kept in the draft, so "Avant : …" survives a reload.
 */
export function withNewQuote(draft: OrderDraft, quote: Quote): OrderDraft {
  const replacedAccepted = draft.quote != null && draft.acceptedQuoteId === draft.quote.id;
  return {
    ...draft,
    quote,
    // R607: the box names the freight amount, which is the old quote's: it has to be ticked again.
    freightPayerAccepted: false,
    previousTotalMillimes: replacedAccepted
      ? (draft.quote?.totalMillimes ?? null)
      : draft.previousTotalMillimes,
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
  // R202: an order whose answer never came back only offers "Réessayer" on W15, before any other
  // check (a pickup slot that started since must not hide it).
  if (draft.pendingSubmit) return wanted === "review" ? null : "review";
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

/**
 * The draft's verified phone is still accepted by the server: same phone, and its order code was
 * verified less than CODE_VERIFIED_WINDOW_MS ago and not used yet (final review I1). The draft flag
 * alone is not proof: past the window the code step must be offered again.
 */
export function draftPhoneProven(draft: OrderDraft): boolean {
  return (
    draftPhoneVerified(draft) &&
    isTargetVerified({ channel: "sms", value: draft.sender.phone }, "order")
  );
}

export { isQuoteValid };
