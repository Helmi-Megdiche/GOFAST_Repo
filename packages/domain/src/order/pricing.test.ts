import { describe, expect, it } from "vitest";
import type { ParcelTypeCode, ServiceCode } from "../services";
import { QUOTE_VALIDITY_MS } from "./constants";
import {
  isQuoteValid,
  makeQuote as makeQuoteWith,
  MAX_PARCEL_WEIGHT_G,
  msLeft,
  packagingPriced,
  PRICE_LINES,
  priceKey,
  priceLines as priceLinesWith,
  sumLines,
  type PriceInput,
  type PriceTable,
} from "./pricing";

// The example amounts of the mockup (W14, W15), copied here: the rules take the table as an
// argument, so these tests do not depend on the web app's fixtures.
const TABLE: PriceTable = {
  rows: {
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
  },
  distance: 2_500,
  weight: { includedKg: 2, perKg: 500 },
  optionsFragile: 0,
  surcharge: { code: "rain", amount: 1_000, ceiling: null },
  discount: 0,
  stamp: 0,
};

let counter = 0;
const makeQuote = (input: PriceInput, at: number) =>
  makeQuoteWith(input, at, TABLE, `quote-${++counter}`);
const priceLines = (input: PriceInput) => priceLinesWith(input, TABLE);

const SERVICES: ServiceCode[] = ["express", "standard", "scheduled"];
const SIZES: ParcelTypeCode[] = ["document", "small", "medium", "large"];
const T0 = Date.parse("2026-11-04T10:00:00Z");

const ROUTE = { from: "Avenue Habib Bourguiba", to: "Rue Ibn Khaldoun" };

const input = (over: Partial<PriceInput> = {}): PriceInput => ({
  service: "standard",
  parcelType: "small",
  parcels: [{ weightG: 2_000 }],
  fragile: false,
  packaging: false,
  zone: "A",
  ...ROUTE,
  ...over,
});
const parcels = (...kg: number[]) => kg.map((value) => ({ weightG: Math.round(value * 1000) }));
const same = (n: number, kg: number) => parcels(...Array.from({ length: n }, () => kg));

describe("example pricing (R204)", () => {
  it("every line is an integer and the lines are listed in order, for every combination", () => {
    for (const service of SERVICES) {
      for (const parcelType of SIZES) {
        for (const weights of [[0.5], [1], [2.1], [7], [30], [1, 3], [0.5, 2.1, 7]]) {
          for (const fragile of [true, false]) {
            for (const packaging of service === "scheduled" ? [false] : [true, false]) {
              const quote = makeQuote(
                input({ service, parcelType, parcels: parcels(...weights), fragile, packaging }),
                T0,
              );
              for (const line of PRICE_LINES) {
                const amount = quote.lines[line];
                expect(Number.isSafeInteger(amount.totalMillimes)).toBe(true);
                expect(Number.isSafeInteger(amount.count)).toBe(true);
              }
              expect(Object.keys(quote.lines)).toEqual([...PRICE_LINES]);
            }
          }
        }
      }
    }
  });

  // Expected totals worked out by hand from the example fixtures: base + distance 2,500 +
  // 0,500 per started kg above 2 kg + rain 1,000 + the row's VAT (options, discount, stamp at 0).
  it.each([
    ["express", "document", 0.5, 9_000 + 2_500 + 0 + 1_000 + 2_375, 0],
    ["standard", "small", 2, 6_000 + 2_500 + 0 + 1_000 + 1_805, 0],
    ["standard", "small", 2.1, 6_000 + 2_500 + 500 + 1_000 + 1_805, 500],
    ["scheduled", "medium", 3, 9_000 + 2_500 + 500 + 1_000 + 2_375, 500],
    ["express", "large", 7, 14_500 + 2_500 + 2_500 + 1_000 + 3_420, 2_500],
    ["standard", "large", 30, 10_000 + 2_500 + 14_000 + 1_000 + 2_565, 14_000],
  ] as const)(
    "one parcel: %s %s %d kg costs %i millimes (weight line %i)",
    (service, parcelType, weightKg, total, weight) => {
      const quote = makeQuote(input({ service, parcelType, parcels: parcels(weightKg) }), T0);
      expect(quote.lines.weight).toEqual({ unitMillimes: weight, count: 1, totalMillimes: weight });
      expect(quote.totalMillimes).toBe(total);
      expect(sumLines(quote.lines)).toBe(total);
    },
  );

  it("reproduces the mockup amounts for a small parcel of 2 kg", () => {
    const total = (service: ServiceCode) =>
      makeQuote(input({ service, fragile: true }), T0).totalMillimes;
    expect(total("express")).toBe(16_660);
    expect(total("standard")).toBe(11_305);
    expect(total("scheduled")).toBe(12_495);
  });

  it("keeps the zero lines (discount, stamp) instead of dropping them", () => {
    const lines = priceLines(input());
    expect(lines.discount).toEqual({ unitMillimes: 0, count: 1, totalMillimes: 0 });
    expect(lines.stamp).toEqual({ unitMillimes: 0, count: 1, totalMillimes: 0 });
    expect(lines.weight.totalMillimes).toBe(0);
  });

  it("names the surcharge and leaves its ceiling unknown (R207: [PLAFOND])", () => {
    const quote = makeQuote(input(), T0);
    expect(quote.surcharge).toEqual({ code: "rain", ceilingMillimes: null });
    expect(quote.lines.surcharge.totalMillimes).toBeGreaterThan(0);
  });

  it("a change to any priced field changes the price key", () => {
    const base = input();
    const key = priceKey(base);
    expect(priceKey({ ...base, service: "express" })).not.toBe(key);
    expect(priceKey({ ...base, parcelType: "large" })).not.toBe(key);
    expect(priceKey({ ...base, parcels: parcels(3) })).not.toBe(key);
    expect(priceKey({ ...base, parcels: parcels(2, 2) })).not.toBe(key);
    expect(priceKey({ ...base, fragile: true })).not.toBe(key);
    expect(priceKey({ ...base, packaging: true })).not.toBe(key);
    expect(priceKey({ ...base, zone: "B" })).not.toBe(key);
    expect(priceKey({ ...base, from: "Rue Ibn Khaldoun" })).not.toBe(key);
    expect(priceKey({ ...base, to: "Avenue Habib Bourguiba" })).not.toBe(key);
  });
});

// A table with a stamp and a discount, so a line multiplied by the count cannot go unseen.
const LOADED: PriceTable = { ...TABLE, stamp: 300, discount: 400 };

describe("parcel count (PR 1b)", () => {
  it.each([1, 3, 10])("%i parcels: stamp and discount are charged once, not per parcel", (n) => {
    const lines = priceLinesWith(input({ parcels: same(n, 1) }), LOADED);
    expect(lines.stamp).toEqual({ unitMillimes: 300, count: 1, totalMillimes: 300 });
    expect(lines.discount).toEqual({ unitMillimes: -400, count: 1, totalMillimes: -400 });
    expect(sumLines(lines)).toBe(n * 6_000 + 2_500 + 1_000 - 400 + 1_805 + 300);
  });

  it.each([1, 3, 10])(
    "%i identical parcels: per-parcel lines times the count, others once",
    (n) => {
      const lines = priceLines(input({ parcels: same(n, 3), packaging: true }));
      expect(lines.base).toEqual({ unitMillimes: 6_000, count: n, totalMillimes: 6_000 * n });
      expect(lines.weight).toEqual({ unitMillimes: 500, count: n, totalMillimes: 500 * n });
      expect(lines.options).toEqual({ unitMillimes: 0, count: n, totalMillimes: 0 });
      expect(lines.packaging).toEqual({ unitMillimes: 2_000, count: n, totalMillimes: 2_000 * n });
      // once per order: never multiplied
      expect(lines.distance).toEqual({ unitMillimes: 2_500, count: 1, totalMillimes: 2_500 });
      expect(lines.surcharge).toEqual({ unitMillimes: 1_000, count: 1, totalMillimes: 1_000 });
      expect(lines.stamp.count).toBe(1);
      // VAT is untouched: the row's example amount, once
      expect(lines.vat).toEqual({ unitMillimes: 1_805, count: 1, totalMillimes: 1_805 });
      expect(sumLines(lines)).toBe(2_500 + 1_000 + 1_805 + n * (6_000 + 500 + 2_000));
    },
  );

  it("mixed weights: ceil per parcel, 2 kg included per parcel, unit price of weight is null", () => {
    // 1 kg and 2 kg are inside the 2 kg; 2.1 kg starts a 3rd kg (+500); 7 kg adds 5 kg (+2,500)
    const lines = priceLines(input({ parcels: parcels(1, 2, 2.1, 7) }));
    expect(lines.weight).toEqual({ unitMillimes: null, count: 4, totalMillimes: 500 + 2_500 });
    expect(lines.base).toEqual({ unitMillimes: 6_000, count: 4, totalMillimes: 24_000 });
  });

  it("the weight of the parcels is not pooled: 2 x 1.5 kg costs nothing, 3 kg in one parcel does", () => {
    expect(priceLines(input({ parcels: parcels(1.5, 1.5) })).weight.totalMillimes).toBe(0);
    expect(priceLines(input({ parcels: parcels(3) })).weight.totalMillimes).toBe(500);
  });

  it("different weights that cost the same keep a unit price", () => {
    const lines = priceLines(input({ parcels: parcels(0.5, 2) }));
    expect(lines.weight).toEqual({ unitMillimes: 0, count: 2, totalMillimes: 0 });
  });

  it("R204: packaging is its own line (the table's amount per parcel); options holds fragile only", () => {
    const plain = priceLines(input({ parcels: parcels(1, 1, 1) }));
    const packed = priceLines(input({ parcels: parcels(1, 1, 1), packaging: true }));
    expect(plain.packaging).toEqual({ unitMillimes: 0, count: 3, totalMillimes: 0 });
    expect(packed.packaging).toEqual({ unitMillimes: 2_000, count: 3, totalMillimes: 6_000 });
    expect(packed.options).toEqual({ unitMillimes: 0, count: 3, totalMillimes: 0 });
    const both = priceLinesWith(input({ parcels: parcels(1, 1), fragile: true, packaging: true }), {
      ...TABLE,
      optionsFragile: 700,
    });
    expect(both.options).toEqual({ unitMillimes: 700, count: 2, totalMillimes: 1_400 });
    expect(both.packaging).toEqual({ unitMillimes: 2_000, count: 2, totalMillimes: 4_000 });
  });

  it("R204: packaging comes right after options in the line order", () => {
    expect(PRICE_LINES.indexOf("packaging")).toBe(PRICE_LINES.indexOf("options") + 1);
  });

  it("the quote total is the sum of the line totals", () => {
    const quote = makeQuote(input({ parcels: parcels(1, 3, 8), packaging: true }), T0);
    expect(quote.totalMillimes).toBe(
      PRICE_LINES.reduce((sum, line) => sum + quote.lines[line].totalMillimes, 0),
    );
  });

  it("refuses 0 or more than 10 parcels and a weight that is not whole grams", () => {
    const price = (list: { weightG: number }[]) => priceLines(input({ parcels: list }));
    expect(() => price([])).toThrow(RangeError);
    expect(() => price(same(11, 1))).toThrow(RangeError);
    expect(() => price([{ weightG: 0 }])).toThrow(RangeError);
    expect(() => price([{ weightG: 1.5 }])).toThrow(RangeError);
    expect(() => price(same(10, 1))).not.toThrow();
  });

  it("refuses a weight above the 999.9 kg the form accepts, so no total leaves the safe integers", () => {
    const price = (weightG: number) => priceLines(input({ parcels: [{ weightG }] }));
    expect(() => price(MAX_PARCEL_WEIGHT_G + 1)).toThrow(RangeError);
    expect(() => price(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    const heaviest = priceLines(input({ parcels: same(10, 999.9) }));
    expect(Number.isSafeInteger(sumLines(heaviest))).toBe(true);
  });

  it("packaging is the row's own amount; a row without a price refuses it", () => {
    const priced = (service: ServiceCode) =>
      priceLines(input({ service, packaging: true, parcels: same(2, 1) })).packaging;
    expect(priced("standard")).toEqual({ unitMillimes: 2_000, count: 2, totalMillimes: 4_000 });
    const table: PriceTable = {
      ...TABLE,
      rows: {
        ...TABLE.rows,
        express: { ...TABLE.rows.express, small: { base: 10_500, vat: 2_660, packaging: 3_000 } },
      },
    };
    expect(
      priceLinesWith(input({ service: "express", packaging: true }), table).packaging.unitMillimes,
    ).toBe(3_000);
    // Scheduled has no packaging price ([PRIX]): refused, and the same order without it is fine.
    expect(packagingPriced(TABLE, "scheduled", "small")).toBe(false);
    expect(packagingPriced(TABLE, "standard", "small")).toBe(true);
    expect(() => priced("scheduled")).toThrow(RangeError);
    expect(() => priceLines(input({ service: "scheduled" }))).not.toThrow();
  });
});

describe("price guarantee (R205, fake clock)", () => {
  const quote = makeQuote(input(), T0);

  it("is valid for exactly 15 minutes", () => {
    expect(Date.parse(quote.expiresAt) - Date.parse(quote.quotedAt)).toBe(QUOTE_VALIDITY_MS);
    expect(QUOTE_VALIDITY_MS).toBe(15 * 60_000);
    expect(isQuoteValid(quote, T0 + 14 * 60_000 + 59_999)).toBe(true);
    expect(isQuoteValid(quote, T0 + 15 * 60_000)).toBe(false);
  });

  it("counts the time left down to zero, never below", () => {
    expect(msLeft(quote, T0)).toBe(15 * 60_000);
    expect(msLeft(quote, T0 + 7 * 60_000)).toBe(8 * 60_000);
    expect(msLeft(quote, T0 + 20 * 60_000)).toBe(0);
  });

  it("a recalculated quote has a new id and a new expiry", () => {
    const later = makeQuote(quote.input, T0 + 15 * 60_000);
    expect(later.id).not.toBe(quote.id);
    expect(Date.parse(later.expiresAt)).toBe(T0 + 30 * 60_000);
  });
});
