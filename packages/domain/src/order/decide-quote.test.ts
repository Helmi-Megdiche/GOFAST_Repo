import { describe, expect, it, vi } from "vitest";
import type { ZoneResult } from "../zones";
import { decideQuote, type PriceInput, type PriceTable } from "./pricing";

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
const T0 = Date.parse("2026-11-04T10:00:00Z");
const INPUT: Omit<PriceInput, "zone"> = {
  service: "standard",
  parcelType: "small",
  parcels: [{ weightG: 2_000 }],
  fragile: false,
  packaging: false,
  from: "Avenue Habib Bourguiba",
  to: "Rue Ibn Khaldoun",
};
const IN_ZONE: ZoneResult = { status: "in-zone", services: ["standard"], zone: "A" };
const ARRIVAL_ZONE: ZoneResult = { status: "in-zone", services: ["standard"], zone: "B" };
const OUT: ZoneResult = { status: "out-of-zone" };
const UNKNOWN: ZoneResult = { status: "unknown" };

describe("decideQuote (R201)", () => {
  const decide = (departure: ZoneResult | null, arrival: ZoneResult | null) => {
    const makeId = vi.fn(() => "quote-1");
    return { result: decideQuote(INPUT, departure, arrival, T0, TABLE, makeId), makeId };
  };

  it.each([
    ["departure", OUT, IN_ZONE],
    ["arrival", IN_ZONE, OUT],
    ["both", OUT, OUT],
    ["departure, arrival unknown", OUT, UNKNOWN],
    ["arrival, departure missing", null, OUT],
  ])("refuses an out-of-zone address (%s) and never makes an id", (_, departure, arrival) => {
    const { result, makeId } = decide(departure, arrival);
    expect(result).toEqual({ status: "outOfZone" });
    expect(makeId).not.toHaveBeenCalled();
  });

  it.each([
    ["departure unknown", UNKNOWN, IN_ZONE],
    ["arrival unknown", IN_ZONE, UNKNOWN],
    ["departure not checked", null, IN_ZONE],
    ["arrival not checked", IN_ZONE, null],
    ["nothing checked", null, null],
  ])("gives no price when an address is not confirmed (%s)", (_, departure, arrival) => {
    const { result, makeId } = decide(departure, arrival);
    expect(result).toEqual({ status: "addressUnconfirmed" });
    expect(makeId).not.toHaveBeenCalled();
  });

  it("prices two in-zone addresses, with the zone of the arrival and one new id", () => {
    const { result, makeId } = decide(IN_ZONE, ARRIVAL_ZONE);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.quote.input.zone).toBe("B");
    expect(result.quote.id).toBe("quote-1");
    expect(result.quote.totalMillimes).toBe(6_000 + 2_500 + 0 + 1_000 + 1_805);
    expect(makeId).toHaveBeenCalledTimes(1);
  });
});
