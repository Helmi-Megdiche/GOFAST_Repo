import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db } from "../db/index.ts";
import { PricingRepo } from "../pricing/pricing.repo.ts";
import { expectDbError, startTestDb, type TestDb } from "./harness.ts";

let db: TestDb;
let app: Db;
const q = (text: string, values: unknown[] = []) => db.superClient.query(text, values);

// Three squares of 0.1 degree. Alpha and Bravo share the meridian 10.1 (a geodesic, so a point on it
// is exactly on both edges). Charlie is paused. Not real délégations: the real ones come in step 4.
const square = (lon: number, lat: number) =>
  `ST_Multi(ST_GeomFromText('POLYGON((${lon} ${lat}, ${lon + 0.1} ${lat}, ${lon + 0.1} ${lat + 0.1}, ${lon} ${lat + 0.1}, ${lon} ${lat}))', 4326))::geography`;
const ZONES = { alpha: randomUUID(), bravo: randomUUID(), charlie: randomUUID() };

beforeAll(async () => {
  db = await startTestDb();
  app = new Db(db.url("fastgo_app"), 2);
  await q(
    `insert into core.zones (id, name, governorate, area, active) values
       ($1, 'Alpha', 'Tunis', ${square(10, 36)}, true),
       ($2, 'Bravo', 'Tunis', ${square(10.1, 36)}, true),
       ($3, 'Charlie', 'Ariana', ${square(10.3, 36)}, false)`,
    [ZONES.alpha, ZONES.bravo, ZONES.charlie],
  );
});
afterAll(async () => {
  await app?.close();
  await db?.stop();
});

const zoneAt = async (lon: number, lat: number) =>
  (await q("select core.zone_at($1, $2) as id", [lon, lat])).rows[0].id as string | null;

describe("R201_T04 core.zone_at (PostGIS edges)", () => {
  it("R201_T04_inside: a point inside a zone gives that zone", async () => {
    expect(await zoneAt(10.05, 36.05)).toBe(ZONES.alpha);
    expect(await zoneAt(10.15, 36.05)).toBe(ZONES.bravo);
  });
  it("R201_T04_outside: a point outside every zone gives null", async () => {
    expect(await zoneAt(11, 37)).toBeNull();
    expect(await zoneAt(10.25, 36.05)).toBeNull();
  });
  it("R201_T04_border: a point on the border of a zone counts as in zone", async () => {
    expect(await zoneAt(10.0, 36.05)).toBe(ZONES.alpha);
    expect(await zoneAt(10.2, 36.05)).toBe(ZONES.bravo);
  });
  it("R201_T04_shared_border: a point on a shared border gives one zone, the first by name", async () => {
    expect(await zoneAt(10.1, 36.05)).toBe(ZONES.alpha);
  });
  it("R201_T04_paused: a paused délégation is out of zone, and its area is served again once active", async () => {
    expect(await zoneAt(10.35, 36.05)).toBeNull();
    await q("update core.zones set active = true where id = $1", [ZONES.charlie]);
    expect(await zoneAt(10.35, 36.05)).toBe(ZONES.charlie);
    await q("update core.zones set active = false where id = $1", [ZONES.charlie]);
    expect(await zoneAt(10.35, 36.05)).toBeNull();
  });
  it("a zone without area never matches, and the index on the area exists", async () => {
    await q("insert into core.zones (name, governorate, active) values ('Sans polygone', 'Tunis', true)");
    expect(await zoneAt(10.05, 36.05)).toBe(ZONES.alpha);
    const idx = await q(
      `select indexdef from pg_indexes where schemaname = 'core' and tablename = 'zones' and indexdef ilike '%gist%'`,
    );
    expect(idx.rows).toHaveLength(1);
  });
  it("only the four governorates of D1 are accepted", async () => {
    await expectDbError(
      q("insert into core.zones (name, governorate) values ('Hors', 'Sfax')"),
      /zones_governorate_check|violates check/,
    );
  });
  it("the app may call zone_at and read the zones, not write them", async () => {
    const ids = await app.withNoActor((tx) => tx.execute(sql`select core.zone_at(10.05, 36.05) as id`));
    expect(ids.rows[0]!.id).toBe(ZONES.alpha);
    await expectDbError(
      app.withNoActor((tx) => tx.execute(sql`update core.zones set active = false`)),
      /permission denied/,
    );
  });
});

describe("R206_T52 core.prices: versioned and per zone", () => {
  it("seeds Standard 10000, Express 15000, Programmée null and packaging +2000 per parcel", async () => {
    const rows = (
      await q(
        `select service_code, with_packaging, millimes::int as millimes, zone_id from core.prices
          where zone_id is null order by service_code, with_packaging`,
      )
    ).rows;
    expect(rows).toEqual([
      { service_code: "express", with_packaging: false, millimes: 15000, zone_id: null },
      { service_code: "express", with_packaging: true, millimes: 2000, zone_id: null },
      { service_code: "scheduled", with_packaging: false, millimes: null, zone_id: null },
      { service_code: "scheduled", with_packaging: true, millimes: null, zone_id: null },
      { service_code: "standard", with_packaging: false, millimes: 10000, zone_id: null },
      { service_code: "standard", with_packaging: true, millimes: 2000, zone_id: null },
    ]);
  });
  it("keeps a later price for the same service beside the one in force, and refuses a duplicate", async () => {
    await q(
      `insert into core.prices (service_code, with_packaging, millimes, zone_id, valid_from)
       values ('standard', false, 11000, null, '2099-01-01T00:00:00Z'),
              ('standard', false, 9000, $1, '2026-11-06T00:00:00Z')`,
      [ZONES.alpha],
    );
    await expectDbError(
      q(
        `insert into core.prices (service_code, with_packaging, millimes, zone_id, valid_from)
         values ('standard', false, 1, null, '2099-01-01T00:00:00Z')`,
      ),
      /duplicate key|unique/,
    );
    await expectDbError(
      q(
        `insert into core.prices (service_code, with_packaging, millimes, zone_id, valid_from)
         values ('standard', false, 1, $1, '2026-11-06T00:00:00Z')`,
        [ZONES.alpha],
      ),
      /duplicate key|unique/,
    );
  });
  it("R206_T52_precedence: an OLD zone row beats a NEWER default row that is already in force", async () => {
    // express: the Bravo row dates from 6 Nov, the default row from 10 Nov, the quote is made on 12 Nov.
    await q(
      `insert into core.prices (service_code, with_packaging, millimes, zone_id, valid_from) values
         ('express', false, 14000, $1, '2026-11-06T00:00:00Z'), ('express', false, 16000, null, '2026-11-10T00:00:00Z')`,
      [ZONES.bravo],
    );
    try {
      const repo = new PricingRepo(app);
      const at = new Date("2026-11-12T10:00:00Z");
      const express = (rows: { serviceCode: string; withPackaging: boolean; millimes: number | null; zoneId: string | null }[]) =>
        rows.find((r) => r.serviceCode === "express" && !r.withPackaging);
      expect(express(await app.withNoActor((tx) => repo.priceList(tx, at, ZONES.bravo)))).toMatchObject({ millimes: 14000, zoneId: ZONES.bravo });
      // another zone has no row of its own: the default in force (the newer one) applies
      expect(express(await app.withNoActor((tx) => repo.priceList(tx, at, ZONES.alpha)))).toMatchObject({ millimes: 16000, zoneId: null });
    } finally {
      await q("delete from core.prices where service_code = 'express' and not with_packaging and millimes in (14000, 16000)");
    }
  });
  it("the app reads prices and cannot change them", async () => {
    const r = await app.withNoActor((tx) => tx.execute(sql`select count(*)::int as n from core.prices`));
    expect(r.rows[0]!.n).toBeGreaterThanOrEqual(6);
    await expectDbError(
      app.withNoActor((tx) => tx.execute(sql`update core.prices set millimes = 1`)),
      /permission denied/,
    );
  });
});

describe("core.pricing_settings: one typed row, the values of the plan", () => {
  it("holds the values GOFAST gave and null for the rest", async () => {
    const rows = (await q("select * from core.pricing_settings")).rows;
    expect(rows).toHaveLength(1);
    const s = rows[0];
    const n = (v: unknown) => (v === null ? null : Number(v));
    expect({
      distance_millimes: n(s.distance_millimes),
      weight_included_g: n(s.weight_included_g),
      weight_per_kg_millimes: n(s.weight_per_kg_millimes),
      retry_fee_millimes: n(s.retry_fee_millimes),
      return_fee_millimes: n(s.return_fee_millimes),
      quote_validity_ms: n(s.quote_validity_ms),
      max_parcels: n(s.max_parcels),
      rain_active: s.rain_active,
    }).toEqual({
      distance_millimes: 0,
      weight_included_g: 2000,
      weight_per_kg_millimes: 0,
      retry_fee_millimes: 0,
      return_fee_millimes: 5000,
      quote_validity_ms: 900000,
      max_parcels: 10,
      rain_active: false,
    });
    for (const key of [
      "max_parcel_weight_g",
      "tax_basis",
      "vat_millimes",
      "stamp_millimes",
      "fragile_fee_millimes",
      "declared_value_fee_millimes",
      "rain_surcharge_millimes",
      "rain_ceiling_millimes",
    ])
      expect(s[key], key).toBeNull();
  });
  it("can never have a second row, and a tax basis is ttc, ht or null", async () => {
    await expectDbError(q("insert into core.pricing_settings default values"), /duplicate key|unique/);
    await expectDbError(q("update core.pricing_settings set tax_basis = 'both'"), /violates check/);
  });
  it("the app reads the settings and cannot write them", async () => {
    const r = await app.withNoActor((tx) => tx.execute(sql`select max_parcels from core.pricing_settings`));
    expect(Number(r.rows[0]!.max_parcels)).toBe(10);
    await expectDbError(
      app.withNoActor((tx) => tx.execute(sql`update core.pricing_settings set max_parcels = 99`)),
      /permission denied/,
    );
  });
});

describe("core.quotes: public, insert and select only, no address text (RV-18)", () => {
  const id = randomUUID();
  const insert = (quoteId: string) =>
    sql`insert into core.quotes
          (id, departure_key_hmac, arrival_key_hmac, service_code, parcel_type, parcels, packaging, fragile,
           departure_zone_id, arrival_zone_id, departure_pinned, arrival_pinned, lines, total_millimes,
           tax_basis, price_list_valid_from, quoted_at, expires_at)
        values (${quoteId}, 'hmac-a', 'hmac-b', 'standard', 'small', '[{"weight_g":1000}]'::jsonb, false, false,
                ${ZONES.alpha}, ${ZONES.bravo}, true, false, '[]'::jsonb, 10000,
                null, '2026-11-06T00:00:00Z', now(), now() + interval '15 minutes')`;

  it("the app with nobody behind the request inserts and reads a quote", async () => {
    await app.withNoActor((tx) => tx.execute(insert(id)));
    const r = await app.withNoActor((tx) => tx.execute(sql`select total_millimes from core.quotes where id = ${id}`));
    expect(r.rows).toHaveLength(1);
  });
  it("the app can neither update nor delete a quote, and a read-back shows it unchanged (RV-21)", async () => {
    await expectDbError(
      app.withNoActor((tx) => tx.execute(sql`update core.quotes set total_millimes = 1 where id = ${id}`)),
      /permission denied/,
    );
    await expectDbError(
      app.withNoActor((tx) => tx.execute(sql`delete from core.quotes where id = ${id}`)),
      /permission denied/,
    );
    const r = await q("select total_millimes::int as t from core.quotes where id = $1", [id]);
    expect(r.rows[0].t).toBe(10000);
  });
  it("has no column that could hold an address text", async () => {
    const cols = (
      await q(`select column_name from information_schema.columns where table_schema = 'core' and table_name = 'quotes'`)
    ).rows.map((c) => c.column_name as string);
    expect(cols.filter((c) => /text|line|address|landmark|label/.test(c) && !/^lines$/.test(c))).toEqual([]);
    expect(cols).toEqual(expect.arrayContaining(["departure_key_hmac", "arrival_key_hmac"]));
  });
});
