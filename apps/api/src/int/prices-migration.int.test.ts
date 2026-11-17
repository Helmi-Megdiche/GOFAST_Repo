import { cpSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, migrate } from "../db/migrate.ts";
import { startTestDb, type TestDb } from "./harness.ts";

// R206_T52: a database that already holds prices from before 0008 (the table of 0001: one row per service
// and packaging option, `with_packaging = true` meaning the FULL price with packaging, 12000 and 17000).
// The migration dates those rows 6 Nov 2026 (the seeds' date, so a row written before is never "newer"
// than the grid) and turns each packaging row into the supplement per parcel (full minus base).
let db: TestDb;
const q = (text: string, values: unknown[] = []) => db.superClient.query(text, values);

beforeAll(async () => {
  const before = mkdtempSync(join(tmpdir(), "fastgo-mig-"));
  for (const f of readdirSync(MIGRATIONS_DIR))
    if (f.startsWith("R__") || /^000[1-7]_/.test(f)) cpSync(join(MIGRATIONS_DIR, f), join(before, f));
  db = await startTestDb({ migrationsDir: before });
  await q("insert into core.services (code, active) values ('standard', true), ('express', true), ('scheduled', true)");
  await q(`insert into core.prices (service_code, with_packaging, millimes) values
    ('standard', false, 10000), ('standard', true, 12000), ('express', false, 15000), ('express', true, 17000),
    ('scheduled', true, 9000)`); // scheduled: a packaging row and NO base row
  await migrate(db.url("fastgo_migrator"));
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe("R206_T52 0008 on a database that already has prices", () => {
  it("R206_T52: a packaging row with no base row of its service becomes null, never a supplement of its full price", async () => {
    const r = await q("select millimes from core.prices where service_code = 'scheduled' and with_packaging");
    expect(r.rows).toEqual([{ millimes: null }]);
  });
  it("dates the old rows 6 Nov 2026 and turns the full packaging prices into the +2000 supplement", async () => {
    const rows = (
      await q(
        `select service_code, with_packaging, millimes::int as millimes, valid_from::text as valid_from from core.prices
          order by service_code, with_packaging`,
      )
    ).rows;
    expect(rows.map((r) => [r.service_code, r.with_packaging, r.millimes])).toEqual([
      ["express", false, 15000],
      ["express", true, 2000],
      ["scheduled", false, null],
      ["scheduled", true, null],
      ["standard", false, 10000],
      ["standard", true, 2000],
    ]);
    for (const r of rows) expect(new Date(r.valid_from).toISOString(), r.service_code).toBe("2026-11-06T00:00:00.000Z");
  });
  it("has one row per version key even with a null zone, and a new row must say its valid_from", async () => {
    await expect(q("insert into core.prices (service_code, with_packaging, millimes, zone_id, valid_from) values ('standard', false, 1, null, '2026-11-06T00:00:00Z')")).rejects.toThrow(/unique|duplicate/);
    await expect(q("insert into core.prices (service_code, with_packaging, millimes) values ('standard', false, 1)")).rejects.toThrow(/valid_from/);
  });
});
