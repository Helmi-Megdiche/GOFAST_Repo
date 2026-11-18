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
// app = table-level rights of fastgo_app; appCols = rights granted column by column (INSERT, UPDATE);
// ro = what fastgo_readonly may read; rls = false only for reference tables and idempotency_keys.
type Cols = Partial<Record<"SELECT" | "INSERT" | "UPDATE", string[]>>;
type Expect = { app: string[]; appCols?: Cols; ro: "no-hash" | "all" | "none"; rls: boolean };
const REFERENCE: Expect = { app: ["SELECT"], ro: "all", rls: false };
const OWNED: Expect = { app: ["INSERT", "SELECT", "UPDATE"], ro: "no-hash", rls: true };
const EXPECTED: Record<string, Expect> = {
  "core.zones": REFERENCE,
  "core.services": REFERENCE,
  "core.prices": REFERENCE,
  "core.pricing_settings": REFERENCE,
  // GH-10: a public quote has no owner; the app inserts and reads it, never updates or deletes (no hash column).
  "core.quotes": { app: ["INSERT", "SELECT"], ro: "no-hash", rls: true },
  // Column grants only (no table-level right): hash hidden from the app, 7 columns updatable.
  "core.accounts": { app: [], appCols: { UPDATE: ["email", "full_name", "locale", "notify_email", "notify_offers", "notify_sms", "updated_at"] }, ro: "no-hash", rls: true },
  "core.companies": OWNED,
  "core.company_members": OWNED,
  "core.addresses": OWNED,
  "core.recipients": OWNED,
  // RV-21: no table-level UPDATE on orders and no INSERT or UPDATE on parcels, only these columns.
  "core.orders": {
    app: ["SELECT"],
    // Insert: what the API sets (no status, created_at, updated_at, ended_at, id). Update: no updated_at (trigger).
    appCols: {
      INSERT: [
        "address_unconfirmed",
        "arrival_zone_id",
        "content",
        "created_by",
        "declared_value_millimes",
        "delivery_instructions",
        "delivery_slot_end",
        "delivery_slot_start",
        "departure_zone_id",
        "fragile",
        "freight_payer",
        "freight_payer_accepted",
        "idempotency_scope",
        "lines",
        "null_lines",
        "owner_account_id",
        "owner_company_id",
        "packaging",
        "payment_mode",
        "pickup_address_id",
        "pickup_slot_end",
        "pickup_slot_start",
        "price_list_valid_from",
        "quote_id",
        "recipient_id",
        "recipient_locale",
        "sender_name",
        "sender_phone",
        "service",
        "terms_accepted_at",
        "total_millimes",
        "tracking_number",
      ],
      UPDATE: ["pickup_address_id", "recipient_id", "status"],
    },
    ro: "no-hash",
    rls: true,
  },
  "core.parcels": {
    app: ["SELECT"],
    appCols: {
      INSERT: ["barcode", "cod_millimes", "declared_value_millimes", "order_id", "proof_level", "size", "weight_declared_g"],
      UPDATE: [
        "attempts",
        "barcode",
        "cod_millimes",
        "declared_value_millimes",
        "proof_level",
        "size",
        "status",
        "weight_declared_g",
        "weight_measured_g",
      ],
    },
    ro: "no-hash",
    rls: true,
  },
  "core.missions": OWNED,
  // GH-96: no table-level SELECT, so the driver's position and the actor stay hidden from the app.
  "core.status_events": {
    app: ["INSERT"],
    appCols: {
      SELECT: ["event_id", "from_status", "id", "occurred_at", "order_id", "received_at", "seq", "subject_id", "subject_type", "to_status"],
    },
    ro: "none",
    rls: true,
  },
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

// What the worker and the public reader (owner of the definer functions) may do. A table that is not
// listed gives them nothing.
type Rights = { t?: string[]; c?: Cols };
const WORKER: Record<string, Rights> = {
  "core.zones": { t: ["SELECT"] },
  "core.services": { t: ["SELECT"] },
  "core.prices": { t: ["SELECT"] },
  "core.pricing_settings": { t: ["SELECT"] },
  // GH-10: the purge of expired quotes (hourly): it reads the id and the expiry, and deletes; nothing else.
  "core.quotes": { t: ["DELETE"], c: { SELECT: ["expires_at", "id"] } },
  "core.idempotency_keys": { t: ["DELETE", "SELECT"] },
  "gestion.audit_events": { t: ["INSERT"] },
  "core.status_events": { t: ["SELECT"], c: { UPDATE: ["location"] } },
  "core.outbox": { t: ["SELECT"], c: { UPDATE: ["attempts", "payload", "processed_at"] } },
  // Frees the scope of an expired key (R202); the freeze trigger lets only the worker null it.
  "core.orders": { c: { SELECT: ["id", "idempotency_scope"], UPDATE: ["idempotency_scope"] } },
};
const PUBLIC_READER: Record<string, Rights> = {
  "core.orders": {
    c: {
      SELECT: [
        "arrival_zone_id",
        "created_at",
        "departure_zone_id",
        "ended_at",
        "id",
        "pickup_address_id",
        "recipient_id",
        "status",
        "tracking_number",
        "updated_at",
      ],
    },
  },
  "core.addresses": { c: { SELECT: ["id", "zone_id"] } },
  "core.recipients": { c: { SELECT: ["address_id", "id"] } },
  "core.zones": { c: { SELECT: ["id", "name", "name_ar", "name_en"] } },
  "core.status_events": { c: { SELECT: ["occurred_at", "order_id", "seq", "subject_type", "to_status"] } },
  // GH-22: the tracking counts and lists the states of the parcels (never a weight, a value or a barcode).
  "core.parcels": { c: { SELECT: ["id", "order_id", "status"] } },
  "core.recipient_links": { t: ["SELECT"] },
  // Sign-up (core.create_account) inserts into these three identity tables and nowhere else.
  // mark_phone_verified, set_password and rehash_password change only these four columns.
  "core.accounts": {
    t: ["INSERT", "SELECT"],
    c: { UPDATE: ["password_hash", "phone_verified_at", "sessions_valid_from", "updated_at"] },
  },
  "core.companies": { t: ["INSERT"] },
  "core.company_members": { t: ["INSERT", "SELECT"] },
};

// GH-22: the owner of record_order_created and sms_tracking_payload. It writes the history of a new order and reads
// what the SMS needs; nothing else (no price, no address, no name).
const ORDER_WRITER: Record<string, Rights> = {
  "core.orders": {
    c: {
      SELECT: ["created_at", "created_by", "id", "owner_account_id", "owner_company_id", "recipient_id", "recipient_locale", "status", "tracking_number"],
    },
  },
  "core.parcels": { c: { SELECT: ["id", "order_id", "status"] } },
  "core.accounts": { c: { SELECT: ["id", "status"] } },
  "core.recipients": { c: { SELECT: ["id", "phone_e164"] } },
  "core.status_events": {
    c: {
      SELECT: ["id", "order_id", "subject_type"],
      INSERT: ["actor_id", "from_status", "occurred_at", "order_id", "subject_id", "subject_type", "to_status"],
    },
  },
};

const TABLE_PRIVS = ["DELETE", "INSERT", "REFERENCES", "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"];

/** The rights of one login on every table, as the database computes them (table level, then column level). */
async function rightsOf(role: string): Promise<Record<string, Required<Rights>>> {
  const tables = (
    await db.superClient.query<{ name: string; oid: number }>(
      `select n.nspname || '.' || c.relname as name, c.oid from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('core', 'gestion') and c.relkind in ('r', 'p') order by 1`,
    )
  ).rows;
  const out: Record<string, Required<Rights>> = {};
  for (const t of tables) {
    const tableLevel = (
      await db.superClient.query<{ p: string }>(
        `select p from unnest($2::text[]) p where has_table_privilege($1, $3::oid, p) order by p`,
        [role, TABLE_PRIVS, t.oid],
      )
    ).rows.map((r) => r.p);
    const c: Cols = {};
    for (const priv of ["SELECT", "INSERT", "UPDATE"] as const) {
      if (tableLevel.includes(priv)) continue;
      const cols = (
        await db.superClient.query<{ attname: string }>(
          `select attname from pg_attribute where attrelid = $1::oid and attnum > 0 and not attisdropped
              and has_column_privilege($2, $1::oid, attname, $3) order by attname`,
          [t.oid, role, priv],
        )
      ).rows.map((r) => r.attname);
      if (cols.length > 0) c[priv] = cols;
    }
    out[t.name] = { t: tableLevel, c };
  }
  return out;
}

const roleList = async (names: string[]) =>
  (
    await db.superClient.query<{ rolname: string; members_of: string[] }>(
      `select r.rolname, coalesce(array(select g.rolname from pg_auth_members m join pg_roles g on g.oid = m.roleid
                                         where m.member = r.oid order by 1), '{}')::text[] as members_of
         from pg_roles r where r.rolname = any($1) order by 1`,
      [names],
    )
  ).rows;

describe("grant test: every table, as it is in the database", () => {
  it("has RLS on and forced, no right for PUBLIC, and exactly the expected rights for the app", async () => {
    const tables = (
      await db.superClient.query<{ name: string; oid: number; rls: boolean; force: boolean }>(
        `select n.nspname || '.' || c.relname as name, c.oid, c.relrowsecurity as rls, c.relforcerowsecurity as force
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname in ('core', 'gestion') and c.relkind in ('r', 'p') order by 1`,
      )
    ).rows;
    expect(tables.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED).sort());

    const app = await rightsOf("fastgo_app");
    for (const t of tables) {
      const want = EXPECTED[t.name]!;
      if (want.rls) expect([t.rls, t.force], `${t.name}: RLS enabled and forced`).toEqual([true, true]);
      const grants = (
        await db.superClient.query<{ grantee: string }>(
          `select grantee from information_schema.role_table_grants where table_schema || '.' || table_name = $1`,
          [t.name],
        )
      ).rows;
      expect(
        grants.filter((g) => g.grantee === "PUBLIC"),
        `${t.name}: nothing for PUBLIC`,
      ).toEqual([]);
      expect(app[t.name]!.t, `${t.name}: table rights of fastgo_app`).toEqual(want.app);
      // Column rights: the writes are compared in full; SELECT by column only has to hide the hashes.
      const { SELECT: selectCols = [], ...writes } = app[t.name]!.c;
      expect(writes, `${t.name}: column rights of fastgo_app`).toEqual(
        Object.fromEntries(Object.entries(want.appCols ?? {}).filter(([k]) => k !== "SELECT")),
      );
      expect(
        selectCols.filter((c) => c.endsWith("_hash")),
        `${t.name}: fastgo_app cannot read a hash`,
      ).toEqual([]);

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

  it("fastgo_readonly has no write right of any kind, by table or by column", async () => {
    for (const [table, r] of Object.entries(await rightsOf("fastgo_readonly"))) {
      expect(
        r.t.filter((p) => p !== "SELECT"),
        `${table}: table rights of fastgo_readonly`,
      ).toEqual([]);
      expect(Object.keys(r.c).filter((p) => p !== "SELECT"), `${table}: column rights of fastgo_readonly`).toEqual([]);
    }
  });

  it("fastgo_worker has exactly the rights of the map, and nothing on any other table", async () => {
    const got = await rightsOf("fastgo_worker");
    for (const [table, r] of Object.entries(got)) {
      const want = WORKER[table] ?? {};
      expect({ t: r.t, c: r.c }, `${table} for fastgo_worker`).toEqual({ t: want.t ?? [], c: want.c ?? {} });
    }
    expect(Object.keys(WORKER).filter((t) => !(t in got))).toEqual([]);
  });

  it("fastgo_public_reader (owner of the definer functions) has exactly the rights of the map", async () => {
    const got = await rightsOf("fastgo_public_reader");
    for (const [table, r] of Object.entries(got)) {
      const want = PUBLIC_READER[table] ?? {};
      expect({ t: r.t, c: r.c }, `${table} for fastgo_public_reader`).toEqual({ t: want.t ?? [], c: want.c ?? {} });
    }
    expect(Object.keys(PUBLIC_READER).filter((t) => !(t in got))).toEqual([]);
  });

  it("GH-22: fastgo_order_writer (owner of the history and SMS definers) has exactly the rights of the map", async () => {
    const got = await rightsOf("fastgo_order_writer");
    for (const [table, r] of Object.entries(got)) {
      const want = ORDER_WRITER[table] ?? {};
      expect({ t: r.t, c: r.c }, `${table} for fastgo_order_writer`).toEqual({ t: want.t ?? [], c: want.c ?? {} });
    }
    expect(Object.keys(ORDER_WRITER).filter((t) => !(t in got))).toEqual([]);
  });

  it("app, worker and readonly belong to no role; no login has a dangerous attribute", async () => {
    const members = await roleList(["fastgo_app", "fastgo_worker", "fastgo_readonly"]);
    expect(members).toEqual([
      { rolname: "fastgo_app", members_of: [] },
      { rolname: "fastgo_readonly", members_of: [] },
      { rolname: "fastgo_worker", members_of: [] },
    ]);
    const attrs = (
      await db.superClient.query(
        `select rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolcanlogin
           from pg_roles where rolname like 'fastgo\\_%' order by 1`,
      )
    ).rows;
    const safe = { rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, rolreplication: false };
    expect(attrs).toEqual([
      { rolname: "fastgo_app", rolcanlogin: true, ...safe },
      { rolname: "fastgo_migrator", rolcanlogin: true, ...safe },
      { rolname: "fastgo_order_writer", rolcanlogin: false, ...safe },
      { rolname: "fastgo_public_reader", rolcanlogin: false, ...safe },
      { rolname: "fastgo_readonly", rolcanlogin: true, ...safe },
      { rolname: "fastgo_worker", rolcanlogin: true, ...safe },
    ]);
  });

  it("the migrator may SET ROLE to the public reader but does not inherit its rights", async () => {
    const r = await db.superClient.query(
      `select pg_has_role('fastgo_migrator', 'fastgo_public_reader', 'SET') as can_set,
              pg_has_role('fastgo_migrator', 'fastgo_public_reader', 'USAGE') as inherits`,
    );
    expect(r.rows[0]).toEqual({ can_set: true, inherits: false });
  });

  it("GH-22: the migrator may SET ROLE to the order writer but does not inherit its rights", async () => {
    const r = await db.superClient.query(
      `select pg_has_role('fastgo_migrator', 'fastgo_order_writer', 'SET') as can_set,
              pg_has_role('fastgo_migrator', 'fastgo_order_writer', 'USAGE') as inherits`,
    );
    expect(r.rows[0]).toEqual({ can_set: true, inherits: false });
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

  it("the migration helpers (protect, reference, hide_hashes_from_app) are not executable by the app", async () => {
    const r = await db.superClient.query(
      `select p.proname, has_function_privilege('fastgo_app', p.oid, 'execute') as app,
              has_function_privilege('fastgo_worker', p.oid, 'execute') as worker
         from pg_proc p where p.pronamespace = 'core'::regnamespace
          and p.proname in ('protect', 'reference', 'hide_hashes_from_app') order by 1`,
    );
    expect(r.rows).toEqual([
      { proname: "hide_hashes_from_app", app: false, worker: false },
      { proname: "protect", app: false, worker: false },
      { proname: "reference", app: false, worker: false },
    ]);
  });
});

describe("core.zone_at (R201): only the app calls it", () => {
  it("fastgo_app may execute it; fastgo_readonly, fastgo_worker and PUBLIC may not", async () => {
    const r = await db.superClient.query(
      `select has_function_privilege('fastgo_app', p.oid, 'execute') as app,
              has_function_privilege('fastgo_readonly', p.oid, 'execute') as ro,
              has_function_privilege('fastgo_worker', p.oid, 'execute') as worker,
              has_function_privilege('fastgo_public_reader', p.oid, 'execute') as public_reader,
              coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a), false) as public_grant
         from pg_proc p where p.oid = 'core.zone_at(double precision, double precision)'::regprocedure`,
    );
    expect(r.rows).toEqual([{ app: true, ro: false, worker: false, public_reader: false, public_grant: false }]);
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

  it("refuses an event that claims another role than the actor's", async () => {
    const app = open(db.url("fastgo_app"));
    await expectDbError(
      app.withActor(staff("agent"), (tx) =>
        tx.execute(sql`insert into gestion.audit_events (actor_id, actor_role, action, entity)
                       values (${USER}, 'admin', 'a', 'b')`),
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
