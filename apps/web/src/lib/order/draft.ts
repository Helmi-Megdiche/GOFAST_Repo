import { z } from "zod";
import type { ParcelTypeCode, ServiceCode } from "../data/services";
import type { ZoneResult } from "../data/zones";
import { normalizePhone } from "../phone";
import { readJson, removeKey, writeJson } from "../storage";
import { now } from "./clock";
import { DRAFT_RETENTION_MS } from "./constants";
import { PRICE_LINES, type Quote } from "./pricing";
import type { Slot } from "./slots";

/**
 * The order draft (CMD-07, decision 3): the only module that touches it, one localStorage key.
 * Addresses and names never go in the URL. Nothing here is a password or a code.
 */
export const DRAFT_KEY = "fg.order.draft.v1";
const VERSION = 1;

export type AddressDraft = {
  text: string;
  /** True once the visitor picked a suggestion or placed the pin. Free text alone is not enough. */
  confirmed: boolean;
  pin: { x: number; y: number } | null;
  zone: ZoneResult | null;
  landmark: string;
};

export type PaymentCode = "cashPickup" | "cashDelivery" | "account";

export type OrderDraft = {
  version: typeof VERSION;
  updatedAt: number;
  /** updatedAt + 24 h, frozen once a submit was attempted (later edits never extend it). */
  expiresAt: number;
  /** One idempotency key per order attempt (R202). Lives as long as the draft. */
  idempotencyKey: string;
  /** Set when "Valider" was pressed: the key is now in use on the server side. */
  submitAttemptedAt: number | null;
  /** A submit whose answer never came back: only "Réessayer" with the same payload is allowed. */
  pendingSubmit: { fingerprint: string } | null;
  sender: { address: AddressDraft; name: string; phone: string; slot: Slot | null };
  recipient: {
    address: AddressDraft;
    name: string;
    phone: string;
    instructions: string;
    smsLanguage: "fr" | "ar" | "en";
    save: boolean;
  };
  parcel: {
    type: ParcelTypeCode | null;
    count: string;
    weightKg: string;
    content: string;
    /** Parsed once, in the language it was typed in (never re-read in another language). */
    declaredValueMillimes: number | null;
    fragile: boolean;
  };
  service: { code: ServiceCode | null; slot: Slot | null };
  quote: Quote | null;
  /** Id of the quote the customer accepted after a recalculation (R205). */
  acceptedQuoteId: string | null;
  /** Total of the accepted quote that a recalculation replaced ("Avant : …" on W15, R205). */
  previousTotalMillimes: number | null;
  payment: PaymentCode | null;
  /** The CGV and forbidden-items box on W15 (decision 11). */
  termsAccepted: boolean;
  /** Full phone (+216XXXXXXXX) whose SMS code was verified. Cleared when the sender phone changes. */
  verifiedPhone: string | null;
};

const emptyAddress = (): AddressDraft => ({
  text: "",
  confirmed: false,
  pin: null,
  zone: null,
  landmark: "",
});

export function emptyDraft(at: number = now()): OrderDraft {
  return {
    version: VERSION,
    updatedAt: at,
    expiresAt: at + DRAFT_RETENTION_MS,
    idempotencyKey: crypto.randomUUID(),
    submitAttemptedAt: null,
    pendingSubmit: null,
    sender: { address: emptyAddress(), name: "", phone: "", slot: null },
    recipient: {
      address: emptyAddress(),
      name: "",
      phone: "",
      instructions: "",
      smsLanguage: "fr",
      save: false,
    },
    parcel: {
      type: null,
      count: "1",
      weightKg: "",
      content: "",
      declaredValueMillimes: null,
      fragile: false,
    },
    service: { code: null, slot: null },
    quote: null,
    acceptedQuoteId: null,
    previousTotalMillimes: null,
    payment: null,
    termsAccepted: false,
    verifiedPhone: null,
  };
}

// The shape a saved draft must have to be used (CMD-07). Anything else in storage (edited by hand,
// an older build, a broken write) is deleted on read, so a page never reads a missing field.
const pinShape = z.object({ x: z.number(), y: z.number() }).nullable();
const serviceCode = z.enum(["express", "standard", "scheduled"]);
const zoneShape = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("in-zone"), services: z.array(serviceCode), zone: z.string() }),
    z.object({ status: z.literal("out-of-zone") }),
    z.object({ status: z.literal("unknown") }),
  ])
  .nullable();
const addressShape = z.object({
  text: z.string(),
  confirmed: z.boolean(),
  pin: pinShape,
  zone: zoneShape,
  landmark: z.string(),
});
const slotShape = z.object({ id: z.string(), startUtc: z.string(), endUtc: z.string() }).nullable();
const millimes = z.number().int();
const quoteShape = z
  .object({
    id: z.string(),
    input: z.object({
      service: serviceCode,
      parcelType: z.enum(["document", "small", "medium", "large"]),
      weightKg: z.number(),
      fragile: z.boolean(),
      zone: z.string(),
      from: z.string(),
      to: z.string(),
    }),
    lines: z.record(z.enum(PRICE_LINES), millimes),
    totalMillimes: millimes,
    surcharge: z.object({ code: z.literal("rain"), ceilingMillimes: millimes.nullable() }),
    quotedAt: z.string(),
    expiresAt: z.string(),
  })
  .nullable();

const draftShape = z.object({
  version: z.literal(VERSION),
  updatedAt: z.number(),
  expiresAt: z.number(),
  idempotencyKey: z.string().min(1),
  submitAttemptedAt: z.number().nullable(),
  pendingSubmit: z.object({ fingerprint: z.string() }).nullable(),
  sender: z.object({
    address: addressShape,
    name: z.string(),
    phone: z.string(),
    slot: slotShape,
  }),
  recipient: z.object({
    address: addressShape,
    name: z.string(),
    phone: z.string(),
    instructions: z.string(),
    smsLanguage: z.enum(["fr", "ar", "en"]),
    save: z.boolean(),
  }),
  parcel: z.object({
    type: z.enum(["document", "small", "medium", "large"]).nullable(),
    count: z.string(),
    weightKg: z.string(),
    content: z.string(),
    declaredValueMillimes: millimes.nonnegative().nullable(),
    fragile: z.boolean(),
  }),
  service: z.object({ code: serviceCode.nullable(), slot: slotShape }),
  quote: quoteShape,
  acceptedQuoteId: z.string().nullable(),
  previousTotalMillimes: millimes.nullable(),
  payment: z.enum(["cashPickup", "cashDelivery", "account"]).nullable(),
  termsAccepted: z.boolean(),
  verifiedPhone: z.string().nullable(),
});

function isDraft(value: unknown): value is OrderDraft {
  return draftShape.safeParse(value).success;
}

/**
 * The saved draft, or null. A corrupted, unknown-version or expired draft is deleted and read as
 * null, so the flow starts again instead of breaking.
 */
export function loadDraft(at: number = now()): OrderDraft | null {
  const value = readJson(DRAFT_KEY);
  if (value == null) return null;
  if (!isDraft(value) || at >= value.expiresAt) {
    removeKey(DRAFT_KEY);
    return null;
  }
  return value;
}

/** Saves a change. The 24 h window restarts on each edit, until a submit was attempted. */
export function saveDraft(draft: OrderDraft, at: number = now()): OrderDraft {
  const next: OrderDraft = {
    ...draft,
    updatedAt: at,
    expiresAt: draft.submitAttemptedAt == null ? at + DRAFT_RETENTION_MS : draft.expiresAt,
  };
  writeJson(DRAFT_KEY, next);
  return next;
}

/** Applies an update to the saved draft (or a new one) and saves it. */
export function updateDraft(
  change: (draft: OrderDraft) => OrderDraft,
  at: number = now(),
): OrderDraft {
  return saveDraft(change(loadDraft(at) ?? emptyDraft(at)), at);
}

/**
 * A step's edit (two tabs): applied to the latest saved draft, not to the copy the tab loaded.
 * Refused (null, nothing written) when the draft the tab shows was cleared or replaced elsewhere, or
 * waits for an order answer (R202): a stale tab never restores a used key or lifts the expiry freeze.
 */
export function editDraft(
  shownKey: string,
  change: (draft: OrderDraft) => OrderDraft,
  at: number = now(),
): OrderDraft | null {
  const stored = loadDraft(at);
  if (!stored || stored.idempotencyKey !== shownKey || stored.pendingSubmit) return null;
  return saveDraft(change(stored), at);
}

/** After the order is validated, or on "Annuler". */
export function clearDraft(): void {
  removeKey(DRAFT_KEY);
}

/**
 * "Voir le prix" on the home page (decision 3): a typed address replaces the draft's address and
 * clears its confirmed state and zone result; an empty field keeps what the draft had.
 */
export function seedFromHome(departure: string, arrival: string, at: number = now()): OrderDraft {
  const replace = (address: AddressDraft, text: string): AddressDraft =>
    text.trim() === ""
      ? address
      : { ...emptyAddress(), text: text.trim(), landmark: address.landmark };
  return updateDraft(
    (draft) => ({
      ...draft,
      sender: { ...draft.sender, address: replace(draft.sender.address, departure) },
      recipient: { ...draft.recipient, address: replace(draft.recipient.address, arrival) },
    }),
    at,
  );
}

/** The phone the code was checked for stays verified only while the draft keeps that phone. */
export function withSenderPhone(draft: OrderDraft, phone: string): OrderDraft {
  const verifiedPhone =
    draft.verifiedPhone != null && draft.verifiedPhone === normalizePhone(phone)
      ? draft.verifiedPhone
      : null;
  return { ...draft, sender: { ...draft.sender, phone }, verifiedPhone };
}
