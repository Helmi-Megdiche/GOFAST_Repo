import type { ParcelTypeCode, PriceRow, PriceTable, ServiceCode } from "@fastgo/domain";

/**
 * EXAMPLE amounts in millimes ("Montants d'exemple", decision 5). Not GOFAST prices: the real price
 * comes from the pricing API. The small-parcel rows reproduce the mockup (W14, W15): Standard
 * 6,000 + 2,500 + 1,000 + VAT 1,805 = 11,305 TND. VAT and fiscal stamp are fixed example amounts per
 * row: no rate is calculated here, so they do not follow the weight line. `packaging` is the GOFAST
 * packaging per parcel: +2 DT on Standard and on Express (reponses-gofast.md); Scheduled has no
 * price ([PRIX]), so it is null and packaging is refused there.
 */
export const EXAMPLE_PRICE_ROWS: Record<ServiceCode, Record<ParcelTypeCode, PriceRow>> = {
  express: {
    document: { base: 9_000, vat: 2_375, packaging: 2_000 },
    small: { base: 10_500, vat: 2_660, packaging: 2_000 },
    medium: { base: 12_500, vat: 3_040, packaging: 2_000 },
    large: { base: 14_500, vat: 3_420, packaging: 2_000 },
  },
  standard: {
    document: { base: 4_500, vat: 1_520, packaging: 2_000 },
    small: { base: 6_000, vat: 1_805, packaging: 2_000 },
    medium: { base: 8_000, vat: 2_185, packaging: 2_000 },
    large: { base: 10_000, vat: 2_565, packaging: 2_000 },
  },
  scheduled: {
    document: { base: 5_500, vat: 1_710, packaging: null },
    small: { base: 7_000, vat: 1_995, packaging: null },
    medium: { base: 9_000, vat: 2_375, packaging: null },
    large: { base: 11_000, vat: 2_755, packaging: null },
  },
};

/** Example distance line, the same for every in-zone pair of addresses. */
export const EXAMPLE_DISTANCE = 2_500;

/** Example weight line: nothing up to 2 kg, then 500 millimes per started kilogram. */
export const EXAMPLE_WEIGHT = { includedKg: 2, perKg: 500 };

/** Fragile has no fee from GOFAST yet (services catalog: null), so the options line is 0. */
export const EXAMPLE_OPTIONS_FRAGILE = 0;

/** Example surcharge (mockup W14: rain, 1,000 TND). Its ceiling is unknown: [PLAFOND] (R207). */
export const EXAMPLE_SURCHARGE = { code: "rain" as const, amount: 1_000, ceiling: null };

/** No promo code in L1 (CMD-10 is L2): the discount line is always 0. */
export const EXAMPLE_DISCOUNT = 0;

/** Fiscal stamp: example amount 0 until GOFAST gives the rule. */
export const EXAMPLE_STAMP = 0;

/** The example amounts above, in the shape the pricing rules of @fastgo/domain take. */
export const EXAMPLE_PRICE_TABLE: PriceTable = {
  rows: EXAMPLE_PRICE_ROWS,
  distance: EXAMPLE_DISTANCE,
  weight: EXAMPLE_WEIGHT,
  optionsFragile: EXAMPLE_OPTIONS_FRAGILE,
  surcharge: EXAMPLE_SURCHARGE,
  discount: EXAMPLE_DISCOUNT,
  stamp: EXAMPLE_STAMP,
};
