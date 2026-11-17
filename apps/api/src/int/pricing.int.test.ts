import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createRedis, type Redis } from "../auth/redis.ts";
import { Db } from "../db/index.ts";
import { pricingOptions } from "../pricing/wiring.ts";
import { startRedis, startTestDb, type TestDb } from "./harness.ts";

let testDb: TestDb;
let stopRedis: () => Promise<void>;
let redis: Redis;
let db: Db;
let app: NestFastifyApplication;
let clock = Date.parse("2026-11-20T10:00:00.000Z");

// Same squares as pricing-db.int.test.ts (not real délégations).
const square = (lon: number, lat: number) =>
  `ST_Multi(ST_GeomFromText('POLYGON((${lon} ${lat}, ${lon + 0.1} ${lat}, ${lon + 0.1} ${lat + 0.1}, ${lon} ${lat + 0.1}, ${lon} ${lat}))', 4326))::geography`;
const ZONES = { alpha: randomUUID(), bravo: randomUUID(), paused: randomUUID() };
const q = (text: string, values: unknown[] = []) => testDb.superClient.query(text, values);

beforeAll(async () => {
  testDb = await startTestDb();
  const r = await startRedis();
  stopRedis = r.stop;
  redis = createRedis(r.url);
  db = new Db(testDb.url("fastgo_app"), 4);
  await q(
    `insert into core.zones (id, name, governorate, area, active) values
       ($1, 'Alpha', 'Tunis', ${square(10, 36)}, true),
       ($2, 'Bravo', 'Ariana', ${square(10.1, 36)}, true),
       ($3, 'Charlie', 'Manouba', ${square(10.3, 36)}, false)`,
    [ZONES.alpha, ZONES.bravo, ZONES.paused],
  );
  app = await createApp(
    { trustProxy: false },
    pricingOptions({ db, redis, authSecret: "s".repeat(40), now: () => new Date(clock) }),
  );
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  redis?.disconnect();
  await stopRedis?.();
  await testDb?.stop();
});

const post = (url: string, payload: unknown, ip = "198.51.100.1") =>
  app.inject({ method: "POST", url, payload: payload as object, remoteAddress: ip });
const quoteBody = (over: Record<string, unknown> = {}) => ({
  service: "standard",
  parcel_type: "small",
  parcels: [{ weight_g: 1000 }],
  departure: { text: "12 Rue Secrète du Test", pin: { x: 10.05, y: 36.05 } },
  arrival: { text: "34 Avenue Confidentielle", pin: { x: 10.15, y: 36.05 } },
  ...over,
});
const count = async () => Number((await q("select count(*) as n from core.quotes")).rows[0].n);

describe("GET /v1/services", () => {
  it("lists the offers in force, the zones of the picker and the extras, with nulls where GOFAST gave nothing", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/services" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.offers).toEqual([
      { code: "express", from_price_millimes: 15000, packaging_price_millimes: 2000, cutoff_time: null },
      { code: "standard", from_price_millimes: 10000, packaging_price_millimes: 2000, cutoff_time: null },
    ]);
    // The 48 real délégations (migration 0009) and the two active synthetic squares; the paused one is absent.
    const names = body.zones.map((z: { name: string }) => z.name);
    expect(names).toHaveLength(50);
    expect(names).toEqual(expect.arrayContaining(["Alpha", "Bravo"]));
    expect(names).not.toContain("Charlie");
    expect(body.zones.filter((z: { governorate: string }) => z.governorate === "Manouba")).toHaveLength(8);
    expect(body.extras).toContainEqual({ code: "fragile", fee_millimes: null });
  });
});

describe("R201_T04 POST /v1/zone-checks", () => {
  it("in zone from a pin, out of zone from a pin, from a picked zone, and a paused délégation", async () => {
    let res = await post("/v1/zone-checks", { pin: { x: 10.05, y: 36.05 } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "in_zone",
      zone_id: ZONES.alpha,
      zone_name: "Alpha",
      services: ["express", "standard"],
      reason: null,
    });
    res = await post("/v1/zone-checks", { pin: { x: 11, y: 37 } });
    expect(res.json()).toEqual({ status: "out_of_zone", zone_id: null, zone_name: null, services: [], reason: "outOfZone" });
    expect((await post("/v1/zone-checks", { zone_id: ZONES.bravo })).json().zone_name).toBe("Bravo");
    expect((await post("/v1/zone-checks", { pin: { x: 10.35, y: 36.05 } })).json().status).toBe("out_of_zone");
    expect((await post("/v1/zone-checks", { zone_id: ZONES.paused })).json().status).toBe("out_of_zone");
  });
  it("takes exactly one of pin or zone_id, and never returns a polygon", async () => {
    expect((await post("/v1/zone-checks", {})).statusCode).toBe(400);
    expect((await post("/v1/zone-checks", { pin: { x: 10, y: 36 }, zone_id: ZONES.alpha })).statusCode).toBe(400);
    const body = (await post("/v1/zone-checks", { zone_id: ZONES.alpha })).body;
    expect(body).not.toMatch(/coordinates|POLYGON|area/i);
  });
  it("answers 429 with Retry-After after 120 requests from one address, and counts another address apart", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < 120; i++) expect((await post("/v1/zone-checks", { zone_id: ZONES.alpha }, ip)).statusCode).toBe(200);
    const limited = await post("/v1/zone-checks", { zone_id: ZONES.alpha }, ip);
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("TOO_MANY_ATTEMPTS");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect((await post("/v1/zone-checks", { zone_id: ZONES.alpha }, "198.51.100.78")).statusCode).toBe(200);
  });
});

describe("POST /v1/quotes and GET /v1/quotes/{id}", () => {
  it("R204_T01: prices a pinned quote, keeps it, and reads it back", async () => {
    clock = Date.parse("2026-11-20T10:00:00.000Z");
    const res = await post("/v1/quotes", quoteBody({ packaging: true }));
    expect(res.statusCode).toBe(201);
    const quote = res.json();
    expect(quote.total_millimes).toBe(12000);
    expect(quote.lines.map((l: { kind: string }) => l.kind)).toEqual([
      "base", "distance", "weight", "options", "packaging", "surcharge", "discount", "vat", "stamp",
    ]);
    expect(quote).toMatchObject({ tax_basis: null, amount_ht_millimes: null, amount_ttc_millimes: null, departure_pinned: true, arrival_pinned: true });
    const read = await app.inject({ method: "GET", url: `/v1/quotes/${quote.id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(quote);
  });
  it("R201_T04: out of zone is 422 with one entry per address, before any price, and no row is written", async () => {
    const before = await count();
    const res = await post("/v1/quotes", quoteBody({ departure: { text: "Ailleurs", pin: { x: 11, y: 37 } }, service: "scheduled" }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: "RULE_REFUSED", fields: [{ name: "departure", reason: "outOfZone" }] });
    expect(await count()).toBe(before);
  });
  it("R204: 20 parcels is 422 tooManyParcels, never 500, and nothing is stored", async () => {
    const before = await count();
    const res = await post("/v1/quotes", quoteBody({ parcels: Array.from({ length: 20 }, () => ({ weight_g: 1000 })) }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.fields).toEqual([{ name: "parcels", reason: "tooManyParcels" }]);
    expect(await count()).toBe(before);
  });
  it("R201_T04: a picked délégation works without a pin, and an unpinned address is flagged", async () => {
    const res = await post("/v1/quotes", quoteBody({ departure: { text: "Rue sans pin", zone_id: ZONES.alpha } }));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ departure_pinned: false, arrival_pinned: true });
  });
  it("R201_T04: the pin wins over a zone_id that disagrees; no pin and no zone is addressUnconfirmed", async () => {
    const res = await post("/v1/quotes", quoteBody({ departure: { text: "Rue", pin: { x: 10.05, y: 36.05 }, zone_id: ZONES.bravo } }));
    expect(res.statusCode).toBe(201);
    const row = (await q("select departure_zone_id from core.quotes where id = $1", [res.json().id])).rows[0];
    expect(row.departure_zone_id).toBe(ZONES.alpha);
    const bad = await post("/v1/quotes", quoteBody({ arrival: { text: "Quelque part" } }));
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.fields).toEqual([{ name: "arrival", reason: "addressUnconfirmed" }]);
  });
  it("RV-18: no address text is stored anywhere in the quote row", async () => {
    await post("/v1/quotes", quoteBody());
    const rows = (await q("select row_to_json(c)::text as t from core.quotes c")).rows.map((r) => r.t as string);
    expect(rows.length).toBeGreaterThan(0);
    for (const t of rows) {
      expect(t).not.toContain("Secrète");
      expect(t).not.toContain("Confidentielle");
    }
  });
  it("R205_T05: 200 until the last millisecond, 410 QUOTE_EXPIRED from expires_at on", async () => {
    clock = Date.parse("2026-11-20T10:00:00.000Z");
    const quote = (await post("/v1/quotes", quoteBody())).json();
    clock = Date.parse(quote.expires_at) - 1;
    expect((await app.inject({ method: "GET", url: `/v1/quotes/${quote.id}` })).statusCode).toBe(200);
    clock = Date.parse(quote.expires_at);
    const gone = await app.inject({ method: "GET", url: `/v1/quotes/${quote.id}` });
    expect(gone.statusCode).toBe(410);
    expect(gone.json().error.code).toBe("QUOTE_EXPIRED");
  });
  it("404 for an unknown id and 400 for a malformed one", async () => {
    expect((await app.inject({ method: "GET", url: `/v1/quotes/${randomUUID()}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/v1/quotes/not-a-uuid" })).statusCode).toBe(400);
  });
  it("R206_T52: a price that starts later does not apply early (read from core.prices)", async () => {
    clock = Date.parse("2026-11-20T10:00:00.000Z");
    await q(
      `insert into core.prices (service_code, with_packaging, millimes, zone_id, valid_from)
       values ('standard', false, 11000, null, '2026-12-01T00:00:00Z'),
              ('standard', false, 9000, $1, '2026-11-06T00:00:00Z')`,
      [ZONES.bravo],
    );
    // arrival in Bravo: the zone row beats the default
    expect((await post("/v1/quotes", quoteBody())).json().total_millimes).toBe(9000);
    // arrival in Alpha: the default, and the later 11000 is not in force yet
    const toAlpha = quoteBody({ arrival: { text: "Rue", pin: { x: 10.05, y: 36.05 } } });
    expect((await post("/v1/quotes", toAlpha)).json().total_millimes).toBe(10000);
    clock = Date.parse("2026-12-01T00:00:00.000Z");
    expect((await post("/v1/quotes", toAlpha)).json().total_millimes).toBe(11000);
    clock = Date.parse("2026-11-20T10:00:00.000Z");
  });
});
