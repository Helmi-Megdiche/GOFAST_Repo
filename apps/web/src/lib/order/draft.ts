import { z } from "zod";
import {
  type ParcelTypeCode,
  type ServiceCode,
  type ZoneResult,
  normalizePhone,
  DRAFT_RETENTION_MS,
  PRICE_LINES,
  MAX_PARCELS,
  type Quote,
  type Slot,
  type PaymentCode,
} from "@fastgo/domain";
import { readJson, removeKey, writeJson } from "../storage";
import { now } from "./clock";

/**
 * The order draft (CMD-07, decision 3): the only module that touches it, one localStorage key.
 * Addresses and names never go in the URL. Nothing here is a password or a code.
 */
export const DRAFT_KEY = "fg.order.draft.v1";
// v2 (GH-10): a quote may lack a price line that PRICE_LINES gained later (e.g. "packaging").
// The storage key keeps its name so a stored v1 draft is found and migrated, never dropped.
const VERSION = 2;

export type AddressDraft = {
  text: string;
  /** True once the visitor picked a suggestion or placed the pin. Free text alone is not enough. */
  confirmed: boolean;
  pin: { x: number; y: number } | null;
  zone: ZoneResult | null;
  landmark: string;
};

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
  /** `body`: the exact bytes sent with the key (api adapter), re-sent unchanged on a retry (R202). */
  pendingSubmit: { fingerprint: string; body?: string } | null;
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
    /** Number of parcels as typed: 1 to 10. The weights list has one entry per parcel. */
    count: string;
    /** One weight in kg per parcel, as typed ("2,5"). Each parcel has its own (2 kg included each). */
    weights: string[];
    content: string;
    /** Parsed once, in the language it was typed in (never re-read in another language). */
    declaredValueMillimes: number | null;
    /**
     * True while the declared-value text does not parse (final review I2). The last valid amount
     * stays in declaredValueMillimes but is never sent: the guard keeps the order on W13.
     */
    declaredValueInvalid?: boolean;
    /** Applies to every parcel. */
    fragile: boolean;
    /** GOFAST packaging, applies to every parcel. */
    packaging: boolean;
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
  /**
   * R607: the sender accepts that the freight and the return are theirs if the recipient refuses
   * (W15, only with "cashDelivery"). Absent in a draft saved before this field: read as false.
   */
  freightPayerAccepted?: boolean;
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
      weights: [""],
      content: "",
      declaredValueMillimes: null,
      declaredValueInvalid: false,
      fragile: false,
      packaging: false,
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
      parcels: z
        .array(z.object({ weightG: z.number().int() }))
        .min(1)
        .max(MAX_PARCELS),
      fragile: z.boolean(),
      packaging: z.boolean(),
      zone: z.string(),
      from: z.string(),
      to: z.string(),
    }),
    // partialRecord: a key missing from PRICE_LINES is allowed (older quote), an unknown key is not.
    lines: z.partialRecord(
      z.enum(PRICE_LINES),
      z.object({
        unitMillimes: millimes.nullable(),
        count: z.number().int(),
        totalMillimes: millimes,
      }),
    ),
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
  pendingSubmit: z.object({ fingerprint: z.string(), body: z.string().optional() }).nullable(),
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
    weights: z.array(z.string()).max(MAX_PARCELS),
    content: z.string(),
    declaredValueMillimes: millimes.nonnegative().nullable(),
    // Optional: a draft saved before this field is read as readable (it was checked by Continue).
    declaredValueInvalid: z.boolean().optional(),
    fragile: z.boolean(),
    packaging: z.boolean(),
  }),
  service: z.object({ code: serviceCode.nullable(), slot: slotShape }),
  quote: quoteShape,
  acceptedQuoteId: z.string().nullable(),
  previousTotalMillimes: millimes.nullable(),
  payment: z.enum(["cashPickup", "cashDelivery", "account"]).nullable(),
  termsAccepted: z.boolean(),
  freightPayerAccepted: z.boolean().optional(),
  verifiedPhone: z.string().nullable(),
});

/**
 * A draft saved before the parcel count (PR 1b) has one `weightKg`. A one-parcel draft keeps it as
 * the weight of its parcel; its quote (priced the old way) is dropped, so W14 prices it again.
 * Any other old draft is not migrated: it fails the shape check and is cleared.
 */
function migrateWeights(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const draft = value as { parcel?: Record<string, unknown> };
  const parcel = draft.parcel;
  if (!parcel || typeof parcel.weightKg !== "string" || "weights" in parcel) return value;
  if (parcel.count !== "1") return value;
  const { weightKg, ...rest } = parcel;
  return {
    ...draft,
    parcel: { ...rest, weights: [weightKg], packaging: false },
    quote: null,
    acceptedQuoteId: null,
    previousTotalMillimes: null,
  };
}

/** v1 to v2: everything the customer typed is kept, only the version number moves. */
function migrateVersion(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  return (value as { version?: unknown }).version === 1 ? { ...value, version: 2 } : value;
}

function migrate(value: unknown): unknown {
  return migrateVersion(migrateWeights(value));
}

/**
 * A quote that lacks a price line (saved before the line existed) is dropped so W14 prices the order
 * again; no value is invented for the missing line. Never while a submit waits for its answer: the
 * retry (R202, RV-18) must send the same quote, and the order may already exist on the server. The
 * screens skip a line the quote does not have (presentPriceLines).
 */
function dropIncompleteQuote(draft: OrderDraft): OrderDraft {
  if (draft.pendingSubmit) return draft;
  const lines = draft.quote?.lines as Record<string, unknown> | undefined;
  if (!draft.quote || PRICE_LINES.every((line) => lines?.[line] !== undefined)) return draft;
  return { ...draft, quote: null, acceptedQuoteId: null, previousTotalMillimes: null };
}

function isDraft(value: unknown): value is OrderDraft {
  return draftShape.safeParse(value).success;
}

/**
 * The saved draft, or null. A corrupted, unknown-version or expired draft is deleted and read as
 * null, so the flow starts again instead of breaking.
 */
export function loadDraft(at: number = now()): OrderDraft | null {
  const stored = readJson(DRAFT_KEY);
  if (stored == null) return null;
  const migrated = migrate(stored);
  if (!isDraft(migrated) || at >= migrated.expiresAt) {
    removeKey(DRAFT_KEY);
    return null;
  }
  const value = dropIncompleteQuote(migrated);
  if (value !== stored) writeJson(DRAFT_KEY, value);
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
