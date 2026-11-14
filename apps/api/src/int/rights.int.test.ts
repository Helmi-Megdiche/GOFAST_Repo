import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db, type Tx } from "../db/index.ts";
import type { Actor } from "../http/session.ts";
import { expectDbError, startTestDb, type TestDb } from "./harness.ts";

let db: TestDb;
const opened: Db[] = [];
const open = (url: string) => {
  const d = new Db(url, 2);
  opened.push(d);
  return d;
};
const USER = "00000000-0000-4000-8000-0000000000aa";
const staff = (role: Actor["role"]): Actor => ({ userId: USER, accountId: USER, role });

beforeAll(async () => {
  db = await startTestDb();
});
afterAll(async () => {
  await Promise.all(opened.map((d) => d.close()));
  await db?.stop();
});

// Every table of core and gestion must be listed here: a new table without a decision fails.
// app = rights of fastgo_app; ro = what fastgo_readonly may read; rls = false only for reference
// tables and idempotency_keys (no row of a person).
type Expect = { app: string[]; ro: "no-hash" | "all" | "none"; rls: boolean };
const SIGN_UP_TABLES = ["core.accounts", "core.companies", "core.company_members"];
const REFERENCE: Expect = { app: ["SELECT"], ro: "all", rls: false };
const OWNED: Expect = { app: ["INSERT", "SELECT", "UPDATE"], ro: "no-hash", rls: true };
const EXPECTED: Record<string, Expect> = {
  "core.zones": REFERENCE,
  "core.services": REFERENCE,
  "core.prices": REFERENCE,
  // Column grants only (no table-level right): hash hidden from the app, 4 columns updatable.
  "core.accounts": { app: [], ro: "no-hash", rls: true },
  "core.companies": OWNED,
  "core.company_members": OWNED,
  "core.addresses": OWNED,
  "core.recipients": OWNED,
  "core.orders": OWNED,
  "core.parcels": OWNED,
  "core.missions": OWNED,
  "core.status_events": { app: ["INSERT", "SELECT"], ro: "none", rls: true },
  "core.proofs": { app: ["INSERT", "SELECT"], ro: "none", rls: true },
  // Hash columns are hidden from the app: column grants only, so no table-level SELECT.
  "core.delivery_codes": { app: ["INSERT"], ro: "none", rls: true },
  "core.recipient_links": { app: ["INSERT"], ro: "none", rls: true },
  "core.outbox": { app: ["INSERT"], ro: "none", rls: true },
  "core.tickets": { app: ["INSERT", "SELECT", "UPDATE"], ro: "none", rls: true },
  "core.ticket_messages": { app: ["INSERT", "SELECT"], ro: "none", rls: true },
  "core.idempotency_keys": { app: ["DELETE", "INSERT", "SELECT", "UPDATE"], ro: "none", rls: false },
  "gestion.audit_events": { app: ["INSERT", "SELECT"], ro: "none", rls: true },
};

describe("grant test: every table, as it is in the database", () => {
  it("has RLS on and forced, no right for PUBLIC, and exactly the expected rights", async () => {
    const tables = (
      await db.superClient.query<{ name: string; oid: number; rls: boolean; force: boolean }>(
        `select n.nspname || '.' || c.relname as name, c.oid, c.relrowsecurity as rls, c.relforcerowsecurity as force
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname in ('core', 'gestion') and c.relkind in ('r', 'p') order by 1`,
      )
    ).rows;
    expect(tables.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED).sort());

    for (const t of tables) {
      const want = EXPECTED[t.name]!;
      if (want.rls) expect([t.rls, t.force], `${t.name}: RLS enabled and forced`).toEqual([true, true]);
      const grants = (
        await db.superClient.query<{ grantee: string; privilege_type: string }>(
          `select grantee, privilege_type from information_schema.role_table_grants
            where table_schema || '.' || table_name = $1`,
          [t.name],
        )
      ).rows;
      expect(
        grants.filter((g) => g.grantee === "PUBLIC"),
        `${t.name}: nothing for PUBLIC`,
      ).toEqual([]);
      expect(
        grants
          .filter((g) => g.grantee === "fastgo_app")
          .map((g) => g.privilege_type)
          .sort(),
        `${t.name}: rights of fastgo_app`,
      ).toEqual(want.app);
      expect(
        grants.filter((g) => g.grantee === "fastgo_readonly" && g.privilege_type !== "SELECT"),
        `${t.name}: no write right for fastgo_readonly`,
      ).toEqual([]);
      // fastgo_public_reader owns the definer functions: read-only, except sign-up (core.create_account)
      // which inserts into these three identity tables and nowhere else.
      expect(
        grants
          .filter((g) => g.grantee === "fastgo_public_reader" && g.privilege_type !== "SELECT")
          .map((g) => g.privilege_type),
        `${t.name}: writes of fastgo_public_reader`,
      ).toEqual(SIGN_UP_TABLES.includes(t.name) ? ["INSERT"] : []);

      const cols = (
        await db.superClient.query<{ attname: string; ro: boolean }>(
          `select attname, has_column_privilege('fastgo_readonly', $1::oid, attname, 'select') as ro
             from pg_attribute where attrelid = $1::oid and attnum > 0 and not attisdropped`,
          [t.oid],
        )
      ).rows;
      for (const c of cols) {
        const allowed = want.ro === "all" || (want.ro === "no-hash" && !c.attname.endsWith("_hash"));
        expect(c.ro, `${t.name}.${c.attname} for fastgo_readonly`).toBe(allowed);
      }
    }
  });

  it("only the migrator owns tables", async () => {
    const owners = (
      await db.superClient.query<{ owner: string }>(
        `select distinct pg_get_userbyid(c.relowner) as owner from pg_class c
           join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('core', 'gestion') and c.relkind = 'r'`,
      )
    ).rows;
    expect(owners).toEqual([{ owner: "fastgo_migrator" }]);
  });
});

describe("accounts: column rights of fastgo_app", () => {
  it("cannot read a *_hash column, and can change only name, language and e-mail", async () => {
    const app = open(db.url("fastgo_app"));
    await db.superClient.query(
      "insert into core.accounts (id, kind, role, full_name) values ($1, 'customer', 'individual', 'Test') on conflict do nothing",
      [USER],
    );
    const me: Actor = { userId: USER, accountId: USER, role: "individual" };
    await expectDbError(
      app.withActor(me, (tx) => tx.execute(sql`select password_hash from core.accounts`)),
      /permission denied/,
    );
    await expectDbError(
      app.withActor(me, (tx) => tx.execute(sql`update core.accounts set role = 'admin' where id = ${USER}`)),
      /permission denied/,
    );
    await app.withActor(me, (tx) => tx.execute(sql`update core.accounts set full_name = 'Nouveau' where id = ${USER}`));
    const rows = await db.superClient.query("select full_name from core.accounts where id = $1", [USER]);
    expect(rows.rows[0].full_name).toBe("Nouveau");
  });
});

describe("audit_events is append-only", () => {
  const event = (actor: Actor) => (tx: Tx) =>
    tx.execute(
      sql`insert into gestion.audit_events (actor_id, actor_role, action, entity, entity_id)
          values (${actor.userId}, ${actor.role}, 'order.cancel', 'order', 'x')`,
    );
  const all = (tx: Tx) => tx.execute(sql`select * from gestion.audit_events`);

  it("anyone may add an event as themselves; only management and admin read them", async () => {
    const app = open(db.url("fastgo_app"));
    await app.withActor(staff("agent"), event(staff("agent")));
    await app.withActor(staff("admin"), event(staff("admin")));
    expect((await app.withActor(staff("agent"), all)).rows).toHaveLength(0);
    expect((await app.withActor(staff("management"), all)).rows).toHaveLength(2);
  });

  it("refuses an event written in the name of someone else", async () => {
    const app = open(db.url("fastgo_app"));
    await expectDbError(
      app.withActor(staff("agent"), (tx) =>
        tx.execute(sql`insert into gestion.audit_events (actor_id, action, entity)
                       values ('00000000-0000-4000-8000-0000000000bb', 'a', 'b')`),
      ),
      /row-level security/,
    );
  });

  it("refuses UPDATE, DELETE and TRUNCATE for the app, and even for a superuser (trigger)", async () => {
    const app = open(db.url("fastgo_app"));
    await expectDbError(
      app.withActor(staff("admin"), (tx) => tx.execute(sql`update gestion.audit_events set action = 'x'`)),
      /permission denied/,
    );
    await expectDbError(
      app.withActor(staff("admin"), (tx) => tx.execute(sql`delete from gestion.audit_events`)),
      /permission denied/,
    );
    const su = db.superClient;
    await expect(su.query("update gestion.audit_events set action = 'x'")).rejects.toThrow(/append-only/);
    await expect(su.query("delete from gestion.audit_events")).rejects.toThrow(/append-only/);
    await expect(su.query("truncate gestion.audit_events")).rejects.toThrow(/append-only/);
  });

  it("the worker may add an event for the system, not for a person", async () => {
    const w = new pg.Client({ connectionString: db.url("fastgo_worker") });
    await w.connect();
    try {
      await w.query("insert into gestion.audit_events (action, entity) values ('purge', 'idempotency_keys')");
      await expect(
        w.query("insert into gestion.audit_events (actor_id, action, entity) values (gen_random_uuid(), 'a', 'b')"),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await w.end();
    }
  });
});
