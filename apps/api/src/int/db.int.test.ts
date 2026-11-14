import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db, tables } from "../db/index.ts";
import type { Actor } from "../http/session.ts";
import { DbIdempotencyStore } from "../http/idempotency-db.ts";
import { idempotencyContract } from "../idempotency.contract.ts";
import { seedMerchants, startPgBouncer, startTestDb, type TestDb } from "./harness.ts";

let db: TestDb;
let ids: Awaited<ReturnType<typeof seedMerchants>>;
let bouncer: Awaited<ReturnType<typeof startPgBouncer>>;
const opened: Array<{ close: () => Promise<void> }> = [];

const open = (url: string, max = 4) => {
  const d = new Db(url, max);
  opened.push(d);
  return d;
};
const merchant = (user: string, company: string): Actor => ({ userId: user, accountId: company, role: "merchant" });

beforeAll(async () => {
  db = await startTestDb();
  ids = await seedMerchants(db);
  bouncer = await startPgBouncer(db);
});

afterAll(async () => {
  await Promise.all(opened.map((d) => d.close()));
  await bouncer?.stop();
  await db?.stop();
});

describe("boot check (RLS cannot be skipped by the login)", () => {
  it("accepts fastgo_app and fastgo_worker", async () => {
    await expect(open(db.url("fastgo_app")).assertSafeRole()).resolves.toBeUndefined();
    await expect(open(db.url("fastgo_worker")).assertSafeRole()).resolves.toBeUndefined();
  });
  it("refuses a superuser and the table owner", async () => {
    await expect(open(db.url("postgres")).assertSafeRole()).rejects.toThrow(/superuser/);
    await expect(open(db.url("fastgo_migrator")).assertSafeRole()).rejects.toThrow(/owns a table/);
  });
});

describe("fail closed: no actor, no rows", () => {
  it("reads nothing and refuses an INSERT when the identity is never set", async () => {
    const c = new pg.Client({ connectionString: db.url("fastgo_app") });
    await c.connect();
    try {
      expect((await c.query("select * from core.addresses")).rowCount).toBe(0);
      expect((await c.query("select id from core.accounts")).rowCount).toBe(0);
      await expect(
        c.query("insert into core.addresses (owner_company_id, line) values ($1, 'x')", [ids.companyA]),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await c.end();
    }
  });
  it("still reads nothing after a transaction-local identity ended (the setting reads '', not NULL)", async () => {
    const c = new pg.Client({ connectionString: db.url("fastgo_app") });
    await c.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('app.company_id', $1, true), set_config('app.role', 'merchant', true)", [
        ids.companyA,
      ]);
      expect((await c.query("select * from core.addresses")).rowCount).toBe(1);
      await c.query("commit");
      expect((await c.query("select * from core.addresses")).rowCount).toBe(0);
    } finally {
      await c.end();
    }
  });
});

describe("owner rows (R104 style isolation)", () => {
  it("a merchant sees only the rows of their company and cannot write for another", async () => {
    const app = open(db.url("fastgo_app"));
    const mine = await app.withActor(merchant(ids.userA, ids.companyA), (tx) =>
      tx.execute(sql`select line from core.addresses`),
    );
    expect(mine.rows).toEqual([{ line: "Rue Test A" }]);
    await expect(
      app.withActor(merchant(ids.userA, ids.companyA), (tx) =>
        tx.execute(sql`insert into core.addresses (owner_company_id, line) values (${ids.companyB}, 'intrus')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("fastgo_readonly reads rows but not a *_hash column", async () => {
    const ro = new pg.Client({ connectionString: db.url("fastgo_readonly") });
    await ro.connect();
    try {
      expect((await ro.query("select id, full_name from core.accounts")).rowCount).toBe(2);
      await expect(ro.query("select password_hash from core.accounts")).rejects.toThrow(/permission denied/);
    } finally {
      await ro.end();
    }
  });
});

describe("T55: identity does not leak between merchants behind PgBouncer (transaction mode, 1 server connection)", () => {
  const probe = (tx: Parameters<Parameters<Db["withActor"]>[1]>[0]) =>
    tx.execute(sql`select pg_backend_pid() as pid, current_setting('app.company_id') as company,
                          (select string_agg(line, ',') from core.addresses) as lines, pg_sleep(0.3)`);

  it("both merchants share ONE backend and each sees only their own rows", async () => {
    const app = open(bouncer.url, 2);
    const runs: Array<{ pid: number; company: string; lines: string }> = [];
    for (let i = 0; i < 5; i++) {
      const [a, b] = await Promise.all([
        app.withActor(merchant(ids.userA, ids.companyA), probe),
        app.withActor(merchant(ids.userB, ids.companyB), probe),
      ]);
      expect(a.rows[0]).toMatchObject({ company: ids.companyA, lines: "Rue Test A" });
      expect(b.rows[0]).toMatchObject({ company: ids.companyB, lines: "Rue Test B" });
      runs.push(a.rows[0] as never, b.rows[0] as never);
    }
    // The test can fail: if PgBouncer gave each merchant their own backend, this would not prove anything.
    expect(new Set(runs.map((r) => r.pid)).size).toBe(1);
  });

  it("CONTROL: set_config(..., false) DOES leak through the same PgBouncer", async () => {
    const one = new pg.Client({ connectionString: bouncer.url });
    const two = new pg.Client({ connectionString: bouncer.url });
    await Promise.all([one.connect(), two.connect()]);
    try {
      const pidOne = (await one.query("select pg_backend_pid() as pid")).rows[0].pid;
      await one.query("select set_config('app.company_id', $1, false)", [ids.companyA]);
      const seen = (await two.query("select pg_backend_pid() as pid, current_setting('app.company_id', true) as c")).rows[0];
      expect(seen.pid).toBe(pidOne);
      expect(seen.c).toBe(ids.companyA); // the leak: the other client inherits the identity
      // What the leak would cost: a person who set nothing reads the company's rows.
      const rows = (await two.query("select line from core.addresses")).rows;
      expect(rows).toEqual([{ line: "Rue Test A" }]);
    } finally {
      await one.query("select set_config('app.company_id', '', false)").catch(() => undefined);
      await Promise.all([one.end(), two.end()]);
    }
  });
});

describe("drift: the Drizzle schema matches the migrated database", () => {
  it("has the same columns, table by table", async () => {
    for (const table of Object.values(tables)) {
      if (!is(table, PgTable)) continue;
      const cfg = getTableConfig(table);
      const r = await db.superClient.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema = $1 and table_name = $2",
        [cfg.schema, cfg.name],
      );
      expect(r.rows.map((c) => c.column_name).sort(), `${cfg.schema}.${cfg.name}`).toEqual(
        cfg.columns.map((c) => c.name).sort(),
      );
    }
  });
});

idempotencyContract(
  "database store",
  (clock, lockMs) => new DbIdempotencyStore(open(db.url("fastgo_app")), () => clock.now, lockMs),
  async () => {
    await db.superClient.query("truncate core.idempotency_keys");
  },
);
