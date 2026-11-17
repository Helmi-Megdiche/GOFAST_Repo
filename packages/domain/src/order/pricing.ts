import type { ParcelTypeCode, ServiceCode } from "../services";
import type { ZoneResult } from "../zones";
import { QUOTE_VALIDITY_MS } from "./constants";

/**
 * One row of the grid. `packaging` is the amount GOFAST packaging adds per parcel on this row
 * (reponses-gofast.md: Standard 10 to 12 DT, Express 15 to 17 DT), or null while the row has no
 * packaging price ([PRIX], e.g. the scheduled offer): packaging is then refused, never guessed.
 */
export type PriceRow = { base: number; vat: number; packaging: number | null };

/**
 * The amounts the price is made of, in millimes. The rules below do not hold any amount: GOFAST
 * sets them and an admin edits them, so the caller passes the table in (the web app passes its
 * example table, the API will read the real one).
 */
export type PriceTable = {
  rows: Record<ServiceCode, Record<ParcelTypeCode, PriceRow>>;
  distance: number;
  weight: { includedKg: number; perKg: number };
  optionsFragile: number;
  surcharge: { code: "rain"; amount: number; ceiling: number | null };
  discount: number;
  stamp: number;
};

/**
 * R204: every element of the price, in this order. Each one is always shown, even at 0. GOFAST
 * packaging is its own line (lead, 16 Nov): the same totals as the "avec emballage" prices.
 */
export const PRICE_LINES = [
  "base",
  "distance",
  "weight",
  "options",
  "packaging",
  "surcharge",
  "discount",
  "vat",
  "stamp",
] as const;
export type PriceLine = (typeof PRICE_LINES)[number];

/** Up to 10 parcels in one order (provisional, GOFAST's setting). The count is the list length. */
export const MIN_PARCELS = 1;
export const MAX_PARCELS = 10;
/** Heaviest parcel the order form accepts (999.9 kg), so no weight total can leave the safe integers. */
export const MAX_PARCEL_WEIGHT_G = 999_900;

/** True when this service and parcel type has a packaging price in the table. */
export function packagingPriced(
  table: PriceTable,
  service: ServiceCode,
  parcelType: ParcelTypeCode,
): boolean {
  return table.rows[service][parcelType].packaging != null;
}

/**
 * One line of the price: `totalMillimes` is the sum over the parcels. A per-parcel line has
 * `count` = the number of parcels and `unitMillimes` = the price of one parcel, null when the
 * parcels differ (weight). A once-per-order line has `count` 1.
 */
export type LineAmount = { unitMillimes: number | null; count: number; totalMillimes: number };
export type PriceLines = Record<PriceLine, LineAmount>;

/** One parcel of the order: its declared weight in whole grams. */
export type ParcelWeight = { weightG: number };

export type PriceInput = {
  service: ServiceCode;
  parcelType: ParcelTypeCode;
  /** One entry per parcel, 1 to 10. Each has its own weight; 2 kg are included per parcel. */
  parcels: ParcelWeight[];
  /** Apply to every parcel. */
  fragile: boolean;
  packaging: boolean;
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
  lines: PriceLines;
  totalMillimes: number;
  /** R207: name and ceiling (null = [PLAFOND]) of the surcharge, shown before validation. */
  surcharge: { code: "rain"; ceilingMillimes: number | null };
  quotedAt: string;
  /** R205: quotedAt + 15 minutes. */
  expiresAt: string;
};

const perParcel = (unit: number, count: number): LineAmount => ({
  unitMillimes: unit,
  count,
  totalMillimes: unit * count,
});
const oncePerOrder = (amount: number): LineAmount => perParcel(amount, 1);

/**
 * The lines of a price, all integers in millimes. Per parcel (times the count): base, weight,
 * options (fragile), packaging. Once per order: distance, surcharge (R207), discount, VAT and
 * stamp (VAT and stamp are the table's amounts as they are: no rate is calculated).
 * Throws on a count outside 1 to 10, a weight that is not a whole number of grams between 1 and
 * 999,900, or packaging on a row that has no packaging price: callers validate before pricing.
 */
export function priceLines(input: PriceInput, table: PriceTable): PriceLines {
  const count = input.parcels.length;
  if (count < MIN_PARCELS || count > MAX_PARCELS)
    throw new RangeError(`priceLines: ${MIN_PARCELS} to ${MAX_PARCELS} parcels, got ${count}`);
  for (const { weightG } of input.parcels)
    if (!Number.isSafeInteger(weightG) || weightG < 1 || weightG > MAX_PARCEL_WEIGHT_G)
      throw new RangeError(
        `priceLines: a parcel weight is a whole number of grams, 1 to ${MAX_PARCEL_WEIGHT_G}`,
      );
  const row = table.rows[input.service][input.parcelType];
  if (input.packaging && row.packaging == null)
    throw new RangeError("priceLines: no packaging price for this service and parcel type");
  // 2 kg are included per parcel; every started kilogram above costs perKg (ceil, per parcel).
  const weights = input.parcels.map(
    ({ weightG }) =>
      Math.max(0, Math.ceil(weightG / 1000) - table.weight.includedKg) * table.weight.perKg,
  );
  const sameWeight = weights.every((amount) => amount === weights[0]);
  const optionsUnit = input.fragile ? table.optionsFragile : 0;
  const packagingUnit = input.packaging ? (row.packaging ?? 0) : 0;
  return {
    base: perParcel(row.base, count),
    distance: oncePerOrder(table.distance),
    weight: {
      unitMillimes: sameWeight ? weights[0]! : null,
      count,
      totalMillimes: weights.reduce((sum, amount) => sum + amount, 0),
    },
    options: perParcel(optionsUnit, count),
    packaging: perParcel(packagingUnit, count),
    surcharge: oncePerOrder(table.surcharge.amount),
    discount: oncePerOrder(table.discount === 0 ? 0 : -table.discount),
    vat: oncePerOrder(row.vat),
    stamp: oncePerOrder(table.stamp),
  };
}

/** The quote total: the sum of the line totals. */
export function sumLines(lines: PriceLines): number {
  return PRICE_LINES.reduce((total, line) => total + lines[line].totalMillimes, 0);
}

/** Same priced inputs give the same key: a change to any of them needs a new quote. */
export function priceKey(input: PriceInput): string {
  return JSON.stringify([
    input.service,
    input.parcelType,
    input.parcels.map((parcel) => parcel.weightG),
    input.fragile,
    input.packaging,
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
  makeId: () => string,
): QuoteResult {
  if (departure?.status === "out-of-zone" || arrival?.status === "out-of-zone")
    return { status: "outOfZone" };
  if (departure?.status !== "in-zone" || arrival?.status !== "in-zone")
    return { status: "addressUnconfirmed" };
  return { status: "ok", quote: makeQuote({ ...input, zone: arrival.zone }, at, table, makeId()) };
}
