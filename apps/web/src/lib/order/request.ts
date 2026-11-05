import type { Locale } from "@fastgo/i18n";
import type { ServiceCode, ParcelTypeCode } from "../data/services";
import type { ZoneResult } from "../data/zones";
import { normalizePhone } from "../phone";
import type { OrderDraft, PaymentCode } from "./draft";
import type { Quote } from "./pricing";
import { parseCount, parseWeightKg } from "./schemas";
import type { Slot } from "./slots";
import { declaredValueValid } from "./steps";

/** What "Valider la commande" sends (mock of POST /v1/orders). Built from the draft only. */
export type OrderRequest = {
  sender: {
    address: string;
    landmark: string;
    pin: { x: number; y: number } | null;
    zone: ZoneResult;
    name: string;
    phone: string;
    slot: Slot;
  };
  recipient: {
    address: string;
    landmark: string;
    pin: { x: number; y: number } | null;
    zone: ZoneResult;
    name: string;
    phone: string;
    instructions: string;
    smsLanguage: Locale;
  };
  parcel: {
    type: ParcelTypeCode;
    count: number;
    weightKg: number;
    content: string;
    declaredValueMillimes: number | null;
    fragile: boolean;
  };
  service: { code: ServiceCode; slot: Slot | null };
  quote: Quote;
  acceptedQuoteId: string | null;
  payment: PaymentCode;
  termsAccepted: boolean;
};

/** Builds the request, or null when a field the server needs is missing. */
export function buildOrderRequest(draft: OrderDraft, termsAccepted: boolean): OrderRequest | null {
  const { sender, recipient, parcel, service } = draft;
  const senderPhone = normalizePhone(sender.phone);
  const recipientPhone = normalizePhone(recipient.phone);
  const count = parseCount(parcel.count);
  const weightKg = parseWeightKg(parcel.weightKg);
  if (
    !senderPhone ||
    !recipientPhone ||
    !sender.address.zone ||
    !recipient.address.zone ||
    !sender.slot ||
    !parcel.type ||
    count == null ||
    weightKg == null ||
    !declaredValueValid(parcel.declaredValueMillimes) ||
    !service.code ||
    !draft.quote ||
    !draft.payment
  ) {
    return null;
  }
  return {
    sender: {
      address: sender.address.text,
      landmark: sender.address.landmark,
      pin: sender.address.pin,
      zone: sender.address.zone,
      name: sender.name.trim(),
      phone: senderPhone,
      slot: sender.slot,
    },
    recipient: {
      address: recipient.address.text,
      landmark: recipient.address.landmark,
      pin: recipient.address.pin,
      zone: recipient.address.zone,
      name: recipient.name.trim(),
      phone: recipientPhone,
      instructions: recipient.instructions.trim(),
      smsLanguage: recipient.smsLanguage,
    },
    parcel: {
      type: parcel.type,
      count,
      weightKg,
      content: parcel.content.trim(),
      declaredValueMillimes: parcel.declaredValueMillimes,
      fragile: parcel.fragile,
    },
    service: { code: service.code, slot: service.code === "scheduled" ? service.slot : null },
    quote: draft.quote,
    acceptedQuoteId: draft.acceptedQuoteId,
    payment: draft.payment,
    termsAccepted,
  };
}

/** Stable text of a value (object keys sorted), used as the request fingerprint. */
export function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : 1,
    );
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${fingerprint(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
