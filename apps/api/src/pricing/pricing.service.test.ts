import { describe, expect, it, beforeEach } from "vitest";
import { Keys } from "../auth/crypto.ts";
import { ApiError } from "../http/errors.ts";
import {
  type PriceRow,
  type PricingStore,
  type Settings,
  type ZoneRow,
  PricingService,
  PRICING_LIMITS,
} from "./pricing.service.ts";

const ALPHA: ZoneRow = { id: "11111111-1111-4111-8111-111111111111", name: "Alpha", nameAr: "ألفا", nameEn: "Alpha", governorate: "Tunis" };
const BRAVO: ZoneRow = { id: "22222222-2222-4222-8222-222222222222", name: "Bravo", nameAr: "برافو", nameEn: "Bravo", governorate: "Ariana" };
const PAUSED_ID = "33333333-3333-4333-8333-333333333333";

const SETTINGS: Settings = {
  distanceMillimes: 0,
  weightIncludedG: 2000,
  weightPerKgMillimes: 0,
  retryFeeMillimes: 0,
  returnFeeMillimes: 5000,
  quoteValidityMs: 900_000,
  maxParcels: 10,
  maxParcelWeightG: null,
  taxBasis: null,
  vatMillimes: null,
  stampMillimes: null,
  fragileFeeMillimes: null,
  declaredValueFeeMillimes: null,
  rainActive: false,
  rainSurchargeMillimes: null,
  rainCeilingMillimes: null,
};
const T0 = Date.parse("2026-11-20T10:00:00.000Z");
const d = (s: string) => new Date(s);
const row = (service: string, withPackaging: boolean, millimes: number | null, zoneId: string | null = null, validFrom = "2026-11-06T00:00:00Z"): PriceRow => ({
  serviceCode: service as PriceRow["serviceCode"],
  withPackaging,
  millimes,
  zoneId,
  validFrom: new Date(validFrom),
});
const GRID = [
  row("standard", false, 10000),
  row("standard", true, 2000),
  row("express", false, 15000),
  row("express", true, 2000),
  row("scheduled", false, null),
  row("scheduled", true, null),
];

/** A store in memory: pins are looked up in `pins`, quotes are kept. */
class FakeStore implements PricingStore {
  settings: Settings = { ...SETTINGS };
  grid: PriceRow[] = GRID;
  zonesList: ZoneRow[] = [ALPHA, BRAVO];
  pins = new Map<string, ZoneRow>([
    ["10.05,36.05", ALPHA],
    ["10.15,36.05", BRAVO],
  ]);
  saved: Record<string, unknown>[] = [];
  priceListCalls: { at: Date; zoneId: string }[] = [];
  async run<T>(fn: (tx: never) => Promise<T>): Promise<T> {
    return fn(undefined as never);
  }
  async zones() {
    return this.zonesList;
  }
  async zoneAt(_tx: never, pin: { x: number; y: number }) {
    return this.pins.get(`${pin.x},${pin.y}`) ?? null;
  }
  async activeZone(_tx: never, id: string) {
    return this.zonesList.find((z) => z.id === id) ?? null;
  }
  async settingsRow() {
    return this.settings;
  }
  async priceList(_tx: never, at: Date, zoneId: string | null) {
    this.priceListCalls.push({ at, zoneId: zoneId ?? "" });
    // the rule of the SQL: rows in force at `at`; a zone row beats the default; the latest start wins.
    const inForce = this.grid.filter((r) => r.validFrom <= at && (r.zoneId === null || r.zoneId === zoneId));
    const best = new Map<string, PriceRow>();
    for (const r of inForce) {
      const key = `${r.serviceCode}/${r.withPackaging}`;
      const cur = best.get(key);
      const better =
        !cur ||
        (r.zoneId !== null && cur.zoneId === null) ||
        (r.zoneId === cur.zoneId && r.validFrom > cur.validFrom);
      if (better) best.set(key, r);
    }
    return [...best.values()];
  }
  async saveQuote(_tx: never, q: Record<string, unknown>) {
    this.saved.push(q);
  }
  async readQuote(_tx: never, id: string) {
    const q = this.saved.find((x) => x.id === id) as { arrivalZoneId: string } | undefined;
    if (!q) return null;
    // as the SQL does: the name is joined on read, it is not stored
    const named = (zid: string) => this.zonesList.find((z) => z.id === zid)?.name ?? "";
    const r = q as { arrivalZoneId: string; departureZoneId: string };
    return { ...q, departureZoneName: named(r.departureZoneId), arrivalZoneName: named(r.arrivalZoneId) } as never;
  }
}

class FakeLimiter {
  hits = new Map<string, number>();
  async hit(key: string, limit: number) {
    const n = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, n);
    return { allowed: n <= limit, count: n, retryAfterMs: 30_000 };
  }
}

let store: FakeStore;
let now = T0;
let ids = 0;
let limiter: FakeLimiter;
const service = () =>
  new PricingService({
    store,
    keys: new Keys("k".repeat(40)),
    limiter: limiter as never,
    now: () => new Date(now),
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
  });

const pinned = (x: number, y: number) => ({ text: "Rue Test 1", pin: { x, y } });
const request = (over: Record<string, unknown> = {}) => ({
  service: "standard" as const,
  parcel_type: "small" as const,
  parcels: [{ weight_g: 1000 }],
  departure: pinned(10.05, 36.05),
  arrival: pinned(10.15, 36.05),
  ...over,
});
const ctx = { ip: "203.0.113.9", requestId: "r1" };
const refusal = async (work: Promise<unknown>) => {
  const e = await work.then(
    () => null,
    (error: unknown) => error,
  );
  expect(e).toBeInstanceOf(ApiError);
  return e as ApiError;
};

beforeEach(() => {
  store = new FakeStore();
  limiter = new FakeLimiter();
  now = T0;
  ids = 0;
});

describe("R204_T01 the quote lines", () => {
  it("R204_T01_one_parcel: 9 lines in order, packaging its own line, VAT and stamp null", async () => {
    const q = await service().createQuote(request({ packaging: true }), ctx);
    expect(q.lines.map((l) => l.kind)).toEqual([
      "base", "distance", "weight", "options", "packaging", "surcharge", "discount", "vat", "stamp",
    ]);
    const by = Object.fromEntries(q.lines.map((l) => [l.kind, l]));
    expect(by.base).toEqual({ kind: "base", unit_millimes: 10000, count: 1, millimes: 10000 });
    expect(by.packaging).toEqual({ kind: "packaging", unit_millimes: 2000, count: 1, millimes: 2000 });
    expect(by.options).toEqual({ kind: "options", unit_millimes: 0, count: 1, millimes: 0 });
    expect(by.vat).toEqual({ kind: "vat", unit_millimes: null, count: 1, millimes: null });
    expect(by.stamp).toEqual({ kind: "stamp", unit_millimes: null, count: 1, millimes: null });
    expect(q.total_millimes).toBe(12000);
  });
  it("R204_T01_three_parcels: per-parcel lines are multiplied by the count", async () => {
    const q = await service().createQuote(
      request({ parcels: [{ weight_g: 500 }, { weight_g: 1500 }, { weight_g: 5000 }], packaging: true }),
      ctx,
    );
    const by = Object.fromEntries(q.lines.map((l) => [l.kind, l]));
    expect(by.base).toEqual({ kind: "base", unit_millimes: 10000, count: 3, millimes: 30000 });
    expect(by.packaging).toEqual({ kind: "packaging", unit_millimes: 2000, count: 3, millimes: 6000 });
    // no weight supplement (Helmi): 0 for every parcel
    expect(by.weight).toEqual({ kind: "weight", unit_millimes: 0, count: 3, millimes: 0 });
    expect(q.total_millimes).toBe(36000);
  });
  it("R204_T01_zone: the quote names the zone of the departure and of the arrival (the arrival one is priced), created and read back", async () => {
    const svc = service();
    const q = await svc.createQuote(request(), ctx);
    const both = {
      departure: { zone_id: ALPHA.id, zone_name: "Alpha" },
      arrival: { zone_id: BRAVO.id, zone_name: "Bravo" },
    };
    expect(q).toMatchObject(both);
    expect(q).not.toHaveProperty("zone_id");
    expect(await svc.getQuote(q.id)).toMatchObject(both);
    // only the ids are kept in the row
    expect(JSON.stringify(store.saved[0])).not.toContain("Bravo");
    const back = await svc.createQuote(request({ departure: pinned(10.15, 36.05), arrival: pinned(10.05, 36.05) }), ctx);
    expect(back).toMatchObject({ departure: { zone_id: BRAVO.id }, arrival: { zone_id: ALPHA.id, zone_name: "Alpha" } });
  });
  it("R201_T04: when a pin and a zone_id disagree, the RESPONSE shows the pin's zone, for the quote and for the read-back", async () => {
    const svc = service();
    const q = await svc.createQuote(
      request({
        departure: { text: "Rue", pin: { x: 10.05, y: 36.05 }, zone_id: BRAVO.id }, // pin in Alpha, picked Bravo
        arrival: { text: "Rue", pin: { x: 10.15, y: 36.05 }, zone_id: ALPHA.id }, // pin in Bravo, picked Alpha
      }),
      ctx,
    );
    const pinZones = { departure: { zone_id: ALPHA.id, zone_name: "Alpha" }, arrival: { zone_id: BRAVO.id, zone_name: "Bravo" } };
    expect(q).toMatchObject(pinZones);
    expect(await svc.getQuote(q.id)).toMatchObject(pinZones);
    expect(q).toMatchObject({ departure_pinned: true, arrival_pinned: true });
  });
  it("R206_T52: price_list_valid_from is the latest start of every row the price used", async () => {
    const svc = service();
    store.grid = [...GRID, row("standard", true, 2000, null, "2026-11-10T00:00:00Z")];
    // packaging used: its row (10 Nov) is newer than the base row (6 Nov)
    expect((await svc.createQuote(request({ packaging: true }), ctx)).quoted_at).toBeDefined();
    expect(store.saved.at(-1)!.priceListValidFrom).toEqual(new Date("2026-11-10T00:00:00Z"));
    // packaging not asked: only the base row counts
    await svc.createQuote(request({ packaging: false }), ctx);
    expect(store.saved.at(-1)!.priceListValidFrom).toEqual(new Date("2026-11-06T00:00:00Z"));
    // a newer base row wins as well
    store.grid = [...GRID.filter((r) => !(r.serviceCode === "standard" && !r.withPackaging)), row("standard", false, 10500, null, "2026-11-12T00:00:00Z")];
    await svc.createQuote(request({ packaging: true }), ctx);
    expect(store.saved.at(-1)!.priceListValidFrom).toEqual(new Date("2026-11-12T00:00:00Z"));
  });
  it("tax_basis null gives HT and TTC null, and the quote says which addresses were pinned", async () => {
    const q = await service().createQuote(
      request({ arrival: { text: "Rue Sans Pin", zone_id: BRAVO.id } }),
      ctx,
    );
    expect(q).toMatchObject({
      tax_basis: null,
      amount_ht_millimes: null,
      amount_ttc_millimes: null,
      departure_pinned: true,
      arrival_pinned: false,
      surcharge: null,
    });
  });
  it("express is 15000, and the quote is stored with the zones, never an address text (RV-18)", async () => {
    const q = await service().createQuote(request({ service: "express" }), ctx);
    expect(q.total_millimes).toBe(15000);
    const saved = store.saved[0]!;
    expect(saved.departureZoneId).toBe(ALPHA.id);
    expect(saved.arrivalZoneId).toBe(BRAVO.id);
    expect(JSON.stringify(saved)).not.toContain("Rue Test 1");
    expect(String(saved.departureKeyHash)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(saved.departureKeyHash).not.toBe(saved.arrivalKeyHash);
  });
});

describe("R201_T04 the zone comes first", () => {
  it("outside the zone: 422 outOfZone for each address, before any price, with nothing saved", async () => {
    const e = await refusal(
      service().createQuote(request({ departure: pinned(11, 37), arrival: pinned(12, 38), service: "scheduled" }), ctx),
    );
    expect(e.code).toBe("RULE_REFUSED");
    expect(e.fields).toEqual([
      { name: "departure", reason: "outOfZone" },
      { name: "arrival", reason: "outOfZone" },
    ]);
    expect(store.saved).toEqual([]);
    expect(store.priceListCalls).toEqual([]);
  });
  it("no pin and no picked zone: addressUnconfirmed", async () => {
    const e = await refusal(service().createQuote(request({ departure: { text: "Quelque part" } }), ctx));
    expect(e.fields).toEqual([{ name: "departure", reason: "addressUnconfirmed" }]);
    expect(store.saved).toEqual([]);
  });
  it("a picked délégation that is paused or unknown is out of zone", async () => {
    const e = await refusal(
      service().createQuote(request({ departure: { text: "Rue", zone_id: PAUSED_ID } }), ctx),
    );
    expect(e.fields).toEqual([{ name: "departure", reason: "outOfZone" }]);
  });
  it("the pin wins over a zone_id that disagrees", async () => {
    const q = await service().createQuote(
      request({ departure: { text: "Rue", pin: { x: 10.05, y: 36.05 }, zone_id: BRAVO.id } }),
      ctx,
    );
    expect(q.id).toBeTruthy();
    expect(store.saved[0]!.departureZoneId).toBe(ALPHA.id);
  });
  it("a pin outside the zone is refused even when a zone_id is sent", async () => {
    const e = await refusal(
      service().createQuote(request({ departure: { text: "Rue", pin: { x: 11, y: 37 }, zone_id: ALPHA.id } }), ctx),
    );
    expect(e.fields).toEqual([{ name: "departure", reason: "outOfZone" }]);
  });
  it("the zone is refused before the parcel limits", async () => {
    const e = await refusal(
      service().createQuote(
        request({ departure: pinned(11, 37), parcels: Array.from({ length: 11 }, () => ({ weight_g: 1 })) }),
        ctx,
      ),
    );
    expect(e.fields.map((f) => f.reason)).toEqual(["outOfZone"]);
  });
});

describe("parcel limits and unavailable prices", () => {
  it("tooManyParcels above the setting", async () => {
    store.settings = { ...SETTINGS, maxParcels: 2 };
    const e = await refusal(
      service().createQuote(request({ parcels: [{ weight_g: 1 }, { weight_g: 1 }, { weight_g: 1 }] }), ctx),
    );
    expect(e.fields).toEqual([{ name: "parcels", reason: "tooManyParcels" }]);
  });
  it("tooHeavy over the maximum weight when it is set, and over 999.9 kg when it is not", async () => {
    store.settings = { ...SETTINGS, maxParcelWeightG: 30_000 };
    let e = await refusal(service().createQuote(request({ parcels: [{ weight_g: 1000 }, { weight_g: 30_001 }] }), ctx));
    expect(e.fields).toEqual([{ name: "parcels.1.weight_g", reason: "tooHeavy" }]);
    expect((await service().createQuote(request({ parcels: [{ weight_g: 30_000 }] }), ctx)).id).toBeTruthy();
    store.settings = { ...SETTINGS };
    e = await refusal(service().createQuote(request({ parcels: [{ weight_g: 999_901 }] }), ctx));
    expect(e.fields).toEqual([{ name: "parcels.0.weight_g", reason: "tooHeavy" }]);
  });
  it("priceUnavailable: Programmée has no price", async () => {
    const e = await refusal(service().createQuote(request({ service: "scheduled" }), ctx));
    expect(e.fields).toEqual([{ name: "service", reason: "priceUnavailable" }]);
    expect(store.saved).toEqual([]);
  });
  it("priceUnavailable: fragile has no fee, packaging has no price", async () => {
    let e = await refusal(service().createQuote(request({ fragile: true }), ctx));
    expect(e.fields).toEqual([{ name: "fragile", reason: "priceUnavailable" }]);
    store.grid = GRID.filter((r) => !(r.serviceCode === "standard" && r.withPackaging));
    e = await refusal(service().createQuote(request({ packaging: true }), ctx));
    expect(e.fields).toEqual([{ name: "packaging", reason: "priceUnavailable" }]);
  });
  it("R204_T01_declared_value: a declared value is not a price element: it is kept, and the total does not change (R802)", async () => {
    const without = await service().createQuote(request({ declared_value_millimes: 0 }), ctx);
    const withValue = await service().createQuote(request({ declared_value_millimes: 50_000 }), ctx);
    expect(withValue.total_millimes).toBe(without.total_millimes);
    expect(withValue.lines.map((l) => l.millimes)).toEqual(without.lines.map((l) => l.millimes));
    expect(store.saved[1]!.declaredValueMillimes).toBe(50_000);
    expect(store.saved[0]!.declaredValueMillimes).toBe(0);
  });
  it("a fragile fee that is set is a line of the price", async () => {
    store.settings = { ...SETTINGS, fragileFeeMillimes: 1500 };
    const q = await service().createQuote(request({ fragile: true }), ctx);
    expect(q.lines.find((l) => l.kind === "options")).toEqual({ kind: "options", unit_millimes: 1500, count: 1, millimes: 1500 });
    expect(q.total_millimes).toBe(11500);
  });
  it("the checks keep their order: zone, then parcels, then price", async () => {
    store.settings = { ...SETTINGS, maxParcels: 1 };
    const e = await refusal(
      service().createQuote(request({ service: "scheduled", parcels: [{ weight_g: 1 }, { weight_g: 1 }] }), ctx),
    );
    expect(e.fields.map((f) => f.reason)).toEqual(["tooManyParcels"]);
  });
});

describe("R206_T52 the price list in force", () => {
  it("a later valid_from does not apply early, and applies from its instant", async () => {
    store.grid = [...GRID, row("standard", false, 11000, null, "2026-12-01T00:00:00Z")];
    expect((await service().createQuote(request(), ctx)).total_millimes).toBe(10000);
    now = Date.parse("2026-12-01T00:00:00.000Z") - 1;
    expect((await service().createQuote(request(), ctx)).total_millimes).toBe(10000);
    now = Date.parse("2026-12-01T00:00:00.000Z");
    expect((await service().createQuote(request(), ctx)).total_millimes).toBe(11000);
  });
  it("a zone row beats the default, and the arrival zone is the one priced", async () => {
    store.grid = [...GRID, row("standard", false, 9000, BRAVO.id)];
    expect((await service().createQuote(request(), ctx)).total_millimes).toBe(9000);
    expect(store.priceListCalls.at(-1)).toEqual({ at: new Date(T0), zoneId: BRAVO.id });
    // departure in Bravo, arrival in Alpha: no zone row for Alpha, so the default
    const back = request({ departure: pinned(10.15, 36.05), arrival: pinned(10.05, 36.05) });
    expect((await service().createQuote(back, ctx)).total_millimes).toBe(10000);
  });
});

describe("R205_T05 the quote lives 15 minutes", () => {
  it("is valid until the last millisecond, then 410 QUOTE_EXPIRED from expires_at on", async () => {
    const svc = service();
    const q = await svc.createQuote(request(), ctx);
    expect(q.quoted_at).toBe("2026-11-20T10:00:00.000Z");
    expect(q.expires_at).toBe("2026-11-20T10:15:00.000Z");
    now = Date.parse(q.expires_at) - 1;
    expect((await svc.getQuote(q.id)).id).toBe(q.id);
    now = Date.parse(q.expires_at);
    const e = await refusal(svc.getQuote(q.id));
    expect(e.code).toBe("QUOTE_EXPIRED");
  });
  it("uses the validity of the settings", async () => {
    store.settings = { ...SETTINGS, quoteValidityMs: 60_000 };
    expect((await service().createQuote(request(), ctx)).expires_at).toBe("2026-11-20T10:01:00.000Z");
  });
  it("an unknown quote is 404", async () => {
    const e = await refusal(service().getQuote("99999999-9999-4999-8999-999999999999"));
    expect(e.code).toBe("NOT_FOUND");
  });
  it("reads back what was quoted", async () => {
    const svc = service();
    const q = await svc.createQuote(request({ packaging: true }), ctx);
    expect(await svc.getQuote(q.id)).toEqual(q);
  });
});

describe("the catalog and the zone check", () => {
  it("R204: the catalog never advertises a declared-value fee, even when the settings hold a value (it is not a price element)", async () => {
    store.settings = { ...SETTINGS, declaredValueFeeMillimes: 1500 };
    const c = await service().listServices();
    expect(c.extras.find((e) => e.code === "declaredValue")).toEqual({ code: "declaredValue", fee_millimes: null });
  });
  it("offers a service only when it is active and has a base price in force", async () => {
    const c = await service().listServices();
    expect(c.offers).toEqual([
      { code: "express", from_price_millimes: 15000, packaging_price_millimes: 2000, cutoff_time: null },
      { code: "standard", from_price_millimes: 10000, packaging_price_millimes: 2000, cutoff_time: null },
    ]);
    expect(c.zones).toEqual([
      { id: ALPHA.id, name: "Alpha", name_ar: "ألفا", name_en: "Alpha", governorate: "Tunis" },
      { id: BRAVO.id, name: "Bravo", name_ar: "برافو", name_en: "Bravo", governorate: "Ariana" },
    ]);
    expect(c.extras).toEqual([
      { code: "fragile", fee_millimes: null },
      { code: "declaredValue", fee_millimes: null },
      { code: "retry", fee_millimes: 0 },
      { code: "return", fee_millimes: 5000 },
    ]);
    expect(c.parcel_types.map((p) => p.code)).toEqual(["document", "small", "medium", "large"]);
  });
  it("a price that starts later is not offered yet", async () => {
    store.grid = GRID.map((r) => (r.serviceCode === "express" ? { ...r, validFrom: d("2027-01-01T00:00:00Z") } : r));
    expect((await service().listServices()).offers.map((o) => o.code)).toEqual(["standard"]);
  });
  it("R201_T04_zone_check: a pin in zone, a pin out of zone, a picked zone, a paused zone", async () => {
    const svc = service();
    expect(await svc.createZoneCheck({ pin: { x: 10.05, y: 36.05 } }, ctx)).toEqual({
      status: "in_zone", zone_id: ALPHA.id, zone_name: "Alpha", services: ["express", "standard"], reason: null,
    });
    expect(await svc.createZoneCheck({ pin: { x: 11, y: 37 } }, ctx)).toEqual({
      status: "out_of_zone", zone_id: null, zone_name: null, services: [], reason: "outOfZone",
    });
    expect((await svc.createZoneCheck({ zone_id: BRAVO.id }, ctx)).zone_name).toBe("Bravo");
    expect((await svc.createZoneCheck({ zone_id: PAUSED_ID }, ctx)).status).toBe("out_of_zone");
  });
});

describe("per-IP limits (PROVISIONAL 120 per minute)", () => {
  it("answers 429 with Retry-After after the limit, for the zone check and for the quote, by IP", async () => {
    expect(PRICING_LIMITS.perIp).toEqual({ limit: 120, windowMs: 60_000 });
    const svc = service();
    for (let i = 0; i < 120; i++) await svc.createZoneCheck({ zone_id: ALPHA.id }, ctx);
    const e = await refusal(svc.createZoneCheck({ zone_id: ALPHA.id }, ctx));
    expect(e).toMatchObject({ code: "TOO_MANY_ATTEMPTS", retryAfterSeconds: 30 });
    // another address is not affected, and the quote has its own counter
    await svc.createZoneCheck({ zone_id: ALPHA.id }, { ...ctx, ip: "203.0.113.10" });
    await svc.createQuote(request(), ctx);
    for (let i = 0; i < 119; i++) await svc.createQuote(request(), ctx);
    expect((await refusal(svc.createQuote(request(), ctx))).code).toBe("TOO_MANY_ATTEMPTS");
  });
});
