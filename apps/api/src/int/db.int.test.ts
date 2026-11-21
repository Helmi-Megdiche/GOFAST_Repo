import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db, tables } from "../db/index.ts";
import type { Actor } from "../http/session.ts";
import { DbIdempotencyStore } from "../http/idempotency-db.ts";
import { idempotencyContract } from "../idempotency.contract.ts";
import { expectDbError, seedMerchants, startPgBouncer, startTestDb, type TestDb } from "./harness.ts";

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
  it("refuses a login with CREATEROLE or a membership of the migrator or the definer owner", async () => {
    const make = async (name: string, attrs: string, after = "") => {
      await db.superClient.query(`create role ${name} login password 'pw' ${attrs}`);
      if (after) await db.superClient.query(after);
    };
    await make("rv_createrole", "createrole");
    await make("rv_in_migrator", "", "grant fastgo_migrator to rv_in_migrator");
    await make("rv_in_reader", "", "grant fastgo_public_reader to rv_in_reader");
    // S3 (GH-25): the owners of the newer definers count too: a login in either could read every ciphertext of core.staff_totp
    // (fastgo_staff_auth) or write the order history (fastgo_order_writer).
    await make("rv_in_staff_auth", "", "grant fastgo_staff_auth to rv_in_staff_auth");
    await make("rv_in_order_writer", "", "grant fastgo_order_writer to rv_in_order_writer");
    try {
      const url = (user: string) => db.url("fastgo_app").replace(/\/\/[^:]+:[^@]+@/, `//${user}:pw@`);
      await expect(open(url("rv_createrole")).assertSafeRole()).rejects.toThrow(/CREATEROLE/);
      await expect(open(url("rv_in_migrator")).assertSafeRole()).rejects.toThrow(/member of fastgo_migrator/);
      await expect(open(url("rv_in_reader")).assertSafeRole()).rejects.toThrow(/member of fastgo_migrator, fastgo_public_reader/);
      await expect(open(url("rv_in_staff_auth")).assertSafeRole()).rejects.toThrow(/fastgo_staff_auth/);
      await expect(open(url("rv_in_order_writer")).assertSafeRole()).rejects.toThrow(/fastgo_order_writer/);
      // CONTROL: the same helper builds a url the check accepts for a clean login.
      await db.superClient.query("create role rv_clean login password 'pw'");
      await expect(open(url("rv_clean")).assertSafeRole()).resolves.toBeUndefined();
    } finally {
      for (const r of ["rv_createrole", "rv_in_migrator", "rv_in_reader", "rv_in_staff_auth", "rv_in_order_writer", "rv_clean"]) {
        await db.superClient.query(`drop role if exists ${r}`);
      }
    }
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
    await expectDbError(
      app.withActor(merchant(ids.userA, ids.companyA), (tx) =>
        tx.execute(sql`insert into core.addresses (owner_company_id, line) values (${ids.companyB}, 'intrus')`),
      ),
      /row-level security/,
    );
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

describe("R202: an expired key frees the idempotency scope of its order", () => {
  it("purgeExpired nulls orders.idempotency_scope, so the same key can create an order again", async () => {
    const clock = { now: Date.UTC(2026, 10, 14, 10) };
    const store = new DbIdempotencyStore(
      open(db.url("fastgo_app")),
      () => clock.now,
      300_000,
      open(db.url("fastgo_worker")),
    );
    const scope = `${ids.companyA}|POST /v1/orders|purge-key`;
    const address = (await db.superClient.query("select id from core.addresses where owner_company_id = $1", [ids.companyA])).rows[0].id;
    const recipient = (
      await db.superClient.query(
        "insert into core.recipients (owner_company_id, name, phone_e164) values ($1, 'Destinataire Purge', '+21620000061') returning id",
        [ids.companyA],
      )
    ).rows[0].id;
    const order = (tracking: string) =>
      db.superClient.query(
        `insert into core.orders (tracking_number, owner_company_id, idempotency_scope, service, payment_mode,
                                  freight_payer, total_millimes, pickup_address_id, recipient_id)
         values ($1, $2, $3, 'standard', 'cashPickup', 'sender', 0, $4, $5)`,
        [tracking, ids.companyA, scope, address, recipient],
      );
    await db.superClient.query("truncate core.idempotency_keys");
    await store.begin(scope, "fp");
    await order("FG-PRG1-0001");
    // While the key lives the scope is taken.
    await expect(order("FG-PRG1-0002")).rejects.toThrow(/idempotency_scope/);
    clock.now += 25 * 3_600_000;
    expect(await store.purgeExpired()).toBe(1);
    await order("FG-PRG1-0002");
    const r = await db.superClient.query("select tracking_number, idempotency_scope from core.orders where tracking_number like 'FG-PRG1-%' order by 1");
    expect(r.rows).toEqual([
      { tracking_number: "FG-PRG1-0001", idempotency_scope: null },
      { tracking_number: "FG-PRG1-0002", idempotency_scope: scope },
    ]);
  });
});

idempotencyContract(
  "database store",
  (clock, lockMs) =>
    new DbIdempotencyStore(open(db.url("fastgo_app")), () => clock.now, lockMs, open(db.url("fastgo_worker"))),
  async () => {
    await db.superClient.query("truncate core.idempotency_keys");
  },
);
