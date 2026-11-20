import { describe, expect, it } from "vitest";
import { suggestAddresses } from "./addresses";
import { getQuote } from "./pricing";
import { checkPoint, checkZone } from "./zones";
import type { PriceInput, ZoneResult } from "@fastgo/domain";

const T0 = Date.parse("2026-11-04T10:00:00Z");
const input: Omit<PriceInput, "zone"> = {
  service: "standard",
  parcelType: "small",
  parcels: [{ weightG: 2_000 }],
  fragile: false,
  packaging: false,
  from: "Avenue Habib Bourguiba",
  to: "Rue Ibn Khaldoun",
};
const inZone: ZoneResult = { status: "in-zone", services: ["express", "standard"], zone: "A" };

describe("getQuote (R201)", () => {
  it("refuses to price when an address is out of zone, and returns no amount", async () => {
    const result = await getQuote(input, inZone, { status: "out-of-zone" }, T0);
    expect(result).toEqual({ status: "outOfZone" });
    expect(JSON.stringify(result)).not.toMatch(/total|lines|Millimes/);
    expect(await getQuote(input, { status: "out-of-zone" }, inZone, T0)).toEqual({
      status: "outOfZone",
    });
  });

  it("never prices an unknown or unchecked address", async () => {
    expect(await getQuote(input, inZone, { status: "unknown" }, T0)).toEqual({
      status: "addressUnconfirmed",
    });
    expect(await getQuote(input, null, inZone, T0)).toEqual({ status: "addressUnconfirmed" });
  });

  it("prices two in-zone addresses, with the arrival zone on the base line", async () => {
    const result = await getQuote(input, inZone, inZone, T0);
    if (result.status !== "ok") throw new Error();
    expect(result.quote.input.zone).toBe("A");
    expect(result.quote.totalMillimes).toBe(11_305);
  });

  it("prices every parcel: 3 parcels of 2 kg, the distance, rain and VAT once", async () => {
    const three = {
      ...input,
      parcels: [{ weightG: 2_000 }, { weightG: 2_000 }, { weightG: 2_000 }],
    };
    const result = await getQuote(three, inZone, inZone, T0);
    if (result.status !== "ok") throw new Error();
    expect(result.quote.lines.base).toEqual({
      unitMillimes: 6_000,
      count: 3,
      totalMillimes: 18_000,
    });
    expect(result.quote.lines.distance.count).toBe(1);
    expect(result.quote.totalMillimes).toBe(18_000 + 2_500 + 1_000 + 1_805);
  });
});

describe("address mocks (CMD-02)", () => {
  it("suggests from 2 characters", async () => {
    expect(await suggestAddresses("a")).toEqual([]);
    expect(await suggestAddresses("ibn")).toEqual(["Rue Ibn Khaldoun"]);
  });

  it("offers the three services of the W14 mockup, and two at Rue de Marseille", async () => {
    const all = ["express", "standard", "scheduled"];
    for (const address of ["Avenue Habib Bourguiba", "Rue Ibn Khaldoun"]) {
      expect(await checkZone(address)).toEqual({ status: "in-zone", services: all, zone: "A" });
    }
    expect(await checkPoint({ x: 0.5, y: 0.5 })).toEqual({
      status: "in-zone",
      services: all,
      zone: "A",
    });
    expect(await checkZone("Rue de Marseille")).toEqual({
      status: "in-zone",
      services: ["express", "standard"],
      zone: "A",
    });
    expect(await suggestAddresses("marseille")).toEqual(["Rue de Marseille"]);
  });

  it("a pin is in zone near the centre and out of zone at the edge, never unknown", async () => {
    expect((await checkPoint({ x: 0.5, y: 0.5 })).status).toBe("in-zone");
    expect((await checkPoint({ x: 0.02, y: 0.05 })).status).toBe("out-of-zone");
  });
});
