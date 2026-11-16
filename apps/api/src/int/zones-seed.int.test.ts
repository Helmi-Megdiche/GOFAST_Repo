import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "./harness.ts";

// Step 4 of GH-10: the one-time OpenStreetMap extract of the délégations, loaded by a seed. Data and
// script live in infra/data/zones/ (ODbL, © OpenStreetMap contributors).
const ZONES_DIR = new URL("../../../../infra/data/zones/", import.meta.url);
const read = (name: string) => readFileSync(fileURLToPath(new URL(name, ZONES_DIR)), "utf8");

let db: TestDb;
let migrator: pg.Client;
const zoneAt = async (lon: number, lat: number) =>
  (await db.superClient.query("select z.name, z.governorate from core.zones z where z.id = core.zone_at($1, $2)", [lon, lat])).rows[0] as
    | { name: string; governorate: string }
    | undefined;

beforeAll(async () => {
  db = await startTestDb();
  // The seed runs as the migrator, as on a real host.
  migrator = new pg.Client({ connectionString: db.url("fastgo_migrator") });
  await migrator.connect();
  await migrator.query(read("delegations.seed.sql"));
});
afterAll(async () => {
  await migrator?.end();
  await db?.stop();
});

describe("R201_T04 the délégations of the Grand Tunis (OSM seed)", () => {
  it("loads the 48 délégations of the four governorates, all switched on", async () => {
    const rows = (
      await db.superClient.query(
        "select governorate, count(*)::int as n, bool_and(active) as active from core.zones group by 1 order by 1",
      )
    ).rows;
    expect(rows).toEqual([
      { governorate: "Ariana", n: 7, active: true },
      { governorate: "Ben Arous", n: 12, active: true },
      { governorate: "Manouba", n: 8, active: true },
      { governorate: "Tunis", n: 21, active: true },
    ]);
  });

  it("every zone has a valid, non-empty multipolygon", async () => {
    const bad = (
      await db.superClient.query(
        `select name from core.zones
          where area is null or not public.ST_IsValid(area::public.geometry)
             or public.ST_IsEmpty(area::public.geometry) or public.GeometryType(area::public.geometry) <> 'MULTIPOLYGON'`,
      )
    ).rows;
    expect(bad).toEqual([]);
  });

  it("a point inside, a point outside, and a point of each governorate", async () => {
    expect(await zoneAt(10.1815, 36.8065)).toMatchObject({ governorate: "Tunis" }); // centre of Tunis
    expect(await zoneAt(10.1647, 36.8665)).toMatchObject({ governorate: "Ariana" }); // Ariana ville
    expect(await zoneAt(10.2189, 36.7531)).toMatchObject({ governorate: "Ben Arous" });
    expect(await zoneAt(10.0986, 36.8081)).toMatchObject({ governorate: "Manouba" });
    expect(await zoneAt(10.76, 34.74)).toBeUndefined(); // Sfax: outside the Grand Tunis
    expect(await zoneAt(2.35, 48.85)).toBeUndefined(); // Paris
  });

  it("two délégations do not overlap by more than a sliver (shared borders are shared points)", async () => {
    const r = await db.superClient.query(
      `select a.name as a, b.name as b,
              public.ST_Area(public.ST_Intersection(a.area::public.geometry, b.area::public.geometry)::public.geography) as m2
         from core.zones a join core.zones b on a.id < b.id and public.ST_Intersects(a.area, b.area)
        where public.ST_Area(public.ST_Intersection(a.area::public.geometry, b.area::public.geometry)::public.geography) > 1000
        order by m2 desc`,
    );
    expect(r.rows).toEqual([]);
  });

  it("is idempotent, and never switches a paused délégation back on", async () => {
    const some = (await db.superClient.query("select id, name from core.zones order by name limit 1")).rows[0];
    await db.superClient.query("update core.zones set active = false where id = $1", [some.id]);
    await migrator.query(read("delegations.seed.sql"));
    const after = (await db.superClient.query("select count(*)::int as n, count(*) filter (where active)::int as on_ from core.zones")).rows[0];
    expect(after).toEqual({ n: 48, on_: 47 });
    expect((await db.superClient.query("select active from core.zones where id = $1", [some.id])).rows[0].active).toBe(false);
  });

  it("carries the ODbL credit in the data, the seed and the attribution file", () => {
    for (const name of ["delegations.geojson", "delegations.seed.sql", "ATTRIBUTION.md"])
      expect(read(name), name).toContain("© OpenStreetMap contributors");
    expect(read("ATTRIBUTION.md")).toContain("ODbL");
  });
});
