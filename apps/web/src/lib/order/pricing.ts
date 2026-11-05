import type { ParcelTypeCode, ServiceCode } from "../data/services";
import {
  EXAMPLE_DISCOUNT,
  EXAMPLE_DISTANCE,
  EXAMPLE_OPTIONS_FRAGILE,
  EXAMPLE_PRICE_ROWS,
  EXAMPLE_STAMP,
  EXAMPLE_SURCHARGE,
  EXAMPLE_WEIGHT,
} from "../data/fixtures/pricing";
import { QUOTE_VALIDITY_MS } from "./constants";

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
};

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
export function priceLines(input: PriceInput): Record<PriceLine, number> {
  const row = EXAMPLE_PRICE_ROWS[input.service][input.parcelType];
  const extraKg = Math.max(0, Math.ceil(input.weightKg) - EXAMPLE_WEIGHT.includedKg);
  return {
    base: row.base,
    distance: EXAMPLE_DISTANCE,
    weight: extraKg * EXAMPLE_WEIGHT.perKg,
    options: input.fragile ? EXAMPLE_OPTIONS_FRAGILE : 0,
    surcharge: EXAMPLE_SURCHARGE.amount,
    discount: EXAMPLE_DISCOUNT === 0 ? 0 : -EXAMPLE_DISCOUNT,
    vat: row.vat,
    stamp: EXAMPLE_STAMP,
  };
}

export function sumLines(lines: Record<PriceLine, number>): number {
  return PRICE_LINES.reduce((total, line) => total + lines[line], 0);
}

/** Same priced inputs give the same key: a change to any of them needs a new quote. */
export function priceKey(input: PriceInput): string {
  return [input.service, input.parcelType, input.weightKg, input.fragile, input.zone].join("|");
}

function randomId(): string {
  return crypto.randomUUID();
}

export function makeQuote(input: PriceInput, at: number, id: string = randomId()): Quote {
  const lines = priceLines(input);
  return {
    id,
    input,
    lines,
    totalMillimes: sumLines(lines),
    surcharge: { code: EXAMPLE_SURCHARGE.code, ceilingMillimes: EXAMPLE_SURCHARGE.ceiling },
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
