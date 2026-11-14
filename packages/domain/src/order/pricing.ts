import type { ParcelTypeCode, ServiceCode } from "../services";
import type { ZoneResult } from "../zones";
import { QUOTE_VALIDITY_MS } from "./constants";

/**
 * The amounts the price is made of, in millimes. The rules below do not hold any amount: GOFAST
 * sets them and an admin edits them, so the caller passes the table in (the web app passes its
 * example table, the API will read the real one).
 */
export type PriceTable = {
  rows: Record<ServiceCode, Record<ParcelTypeCode, { base: number; vat: number }>>;
  distance: number;
  weight: { includedKg: number; perKg: number };
  optionsFragile: number;
  surcharge: { code: "rain"; amount: number; ceiling: number | null };
  discount: number;
  stamp: number;
};

/** R204: every element of the price, in this order. Each one is always shown, even at 0. */
export const PRICE_LINES = [
  "base",
  "distance",
  "weight",
  "options",
  "surcharge",
  "discount",
  "vat",
  "stamp",
] as const;
export type PriceLine = (typeof PRICE_LINES)[number];

export type PriceInput = {
  service: ServiceCode;
  parcelType: ParcelTypeCode;
  weightKg: number;
  fragile: boolean;
  /** Zone code of the departure and arrival addresses (both in zone, checked before pricing). */
  zone: string;
  /** Departure and arrival (addressPriceKey): the distance is priced, so a new address is a new price. */
  from: string;
  to: string;
};

/** What identifies an address for the price: its text and, when placed, the pin. */
export function addressPriceKey(address: { text: string; pin: { x: number; y: number } | null }) {
  return address.pin ? `${address.text}@${address.pin.x},${address.pin.y}` : address.text;
}

export type Quote = {
  id: string;
  input: PriceInput;
  lines: Record<PriceLine, number>;
  totalMillimes: number;
  /** R207: name and ceiling (null = [PLAFOND]) of the surcharge, shown before validation. */
  surcharge: { code: "rain"; ceilingMillimes: number | null };
  quotedAt: string;
  /** R205: quotedAt + 15 minutes. */
  expiresAt: string;
};

/** Lines of the example price, all integers in millimes. */
export function priceLines(input: PriceInput, table: PriceTable): Record<PriceLine, number> {
  const row = table.rows[input.service][input.parcelType];
  const extraKg = Math.max(0, Math.ceil(input.weightKg) - table.weight.includedKg);
  return {
    base: row.base,
    distance: table.distance,
    weight: extraKg * table.weight.perKg,
    options: input.fragile ? table.optionsFragile : 0,
    surcharge: table.surcharge.amount,
    discount: table.discount === 0 ? 0 : -table.discount,
    vat: row.vat,
    stamp: table.stamp,
  };
}

export function sumLines(lines: Record<PriceLine, number>): number {
  return PRICE_LINES.reduce((total, line) => total + lines[line], 0);
}

/** Same priced inputs give the same key: a change to any of them needs a new quote. */
export function priceKey(input: PriceInput): string {
  return JSON.stringify([
    input.service,
    input.parcelType,
    input.weightKg,
    input.fragile,
    input.zone,
    input.from,
    input.to,
  ]);
}

/** The id comes from the caller (a UUID in the browser and in the API): no random source here. */
export function makeQuote(input: PriceInput, at: number, table: PriceTable, id: string): Quote {
  const lines = priceLines(input, table);
  return {
    id,
    input,
    lines,
    totalMillimes: sumLines(lines),
    surcharge: { code: table.surcharge.code, ceilingMillimes: table.surcharge.ceiling },
    quotedAt: new Date(at).toISOString(),
    expiresAt: new Date(at + QUOTE_VALIDITY_MS).toISOString(),
  };
}

/** Valid until the last millisecond before expiresAt. */
export function isQuoteValid(
  quote: Pick<Quote, "expiresAt"> | null | undefined,
  at: number,
): boolean {
  return quote != null && at < Date.parse(quote.expiresAt);
}

export function msLeft(quote: Pick<Quote, "expiresAt">, at: number): number {
  return Math.max(0, Date.parse(quote.expiresAt) - at);
}

export type QuoteResult =
  { status: "ok"; quote: Quote } | { status: "outOfZone" } | { status: "addressUnconfirmed" };

/**
 * R201: an out-of-zone address is refused before any price is calculated, and an address that is
 * not confirmed ("unknown") never gets a price either.
 */
export function decideQuote(
  input: Omit<PriceInput, "zone">,
  departure: ZoneResult | null,
  arrival: ZoneResult | null,
  at: number,
  table: PriceTable,
  id: string,
): QuoteResult {
  if (departure?.status === "out-of-zone" || arrival?.status === "out-of-zone")
    return { status: "outOfZone" };
  if (departure?.status !== "in-zone" || arrival?.status !== "in-zone")
    return { status: "addressUnconfirmed" };
  return { status: "ok", quote: makeQuote({ ...input, zone: arrival.zone }, at, table, id) };
}
