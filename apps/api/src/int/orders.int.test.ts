import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { Db, tables } from "../db/index.ts";
import type { Actor } from "../http/session.ts";
import { expectDbError, seedMerchants, startTestDb, type TestDb } from "./harness.ts";

let db: TestDb;
let ids: Awaited<ReturnType<typeof seedMerchants>>;
const opened: Db[] = [];
const open = (url: string) => {
  const d = new Db(url, 2);
  opened.push(d);
  return d;
};
const merchant = (user: string, company: string): Actor => ({ userId: user, accountId: company, role: "merchant" });

const staffId = randomUUID();
const staff = (role: Actor["role"]): Actor => ({ userId: staffId, accountId: staffId, role });
const recipientA = randomUUID();
const recipientB = randomUUID();
const orderA = randomUUID();
const orderB = randomUUID();
const parcelA = randomUUID();

const q = (text: string, values: unknown[] = []) => db.superClient.query(text, values);

beforeAll(async () => {
  db = await startTestDb();
  ids = await seedMerchants(db);
  await q("insert into core.accounts (id, kind, role, full_name) values ($1, 'staff', 'agent', 'Agent Test')", [staffId]);
  await q(
    `insert into core.recipients (id, owner_company_id, name, phone_e164, address_id) values
       ($1, $2, 'Destinataire Test A', '+21620000011', null), ($3, $4, 'Destinataire Test B', '+21620000012', null)`,
    [recipientA, ids.companyA, recipientB, ids.companyB],
  );
  const order = (id: string, company: string, address: string, recipient: string, tracking: string) =>
    q(
      `insert into core.orders (id, tracking_number, owner_company_id, service, payment_mode, freight_payer,
                                total_millimes, pickup_address_id, recipient_id)
       values ($1, $5, $2, 'standard', 'cashPickup', 'sender', 48500, $3, $4)`,
      [id, company, address, recipient, tracking],
    );
  await order(orderA, ids.companyA, ids.addressA, recipientA, "FG-AAAA-0001");
  await order(orderB, ids.companyB, ids.addressB, recipientB, "FG-BBBB-0002");
  await q(
    `insert into core.parcels (id, order_id, size, weight_declared_g, proof_level)
     values ($1, $2, 'small', 800, 'codeOrPhotoWithPosition')`,
    [parcelA, orderA],
  );
});

afterAll(async () => {
  await Promise.all(opened.map((d) => d.close()));
  await db?.stop();
});

describe("CHECK enums match packages/contract/schemas/common.yaml", () => {
  const common = parse(
    readFileSync(new URL("../../../../packages/contract/schemas/common.yaml", import.meta.url), "utf8"),
  ) as Record<string, { enum: string[] }>;
  const cases: Array<[string, string, string]> = [
    ["core.orders", "status", "OrderStatus"],
    ["core.orders", "service", "ServiceCode"],
    ["core.orders", "payment_mode", "PaymentMode"],
    ["core.orders", "freight_payer", "FreightPayer"],
    ["core.parcels", "status", "ParcelStatus"],
    ["core.parcels", "size", "ParcelTypeCode"],
  ];
  it.each(cases)("%s.%s = %s", async (table, column, schema) => {
    const r = await db.superClient.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where contype = 'c' and conrelid = $1::regclass`,
      [table],
    );
    const def = r.rows.map((x) => x.def).find((d) => d.includes(`${column} = ANY`));
    expect(def, `a CHECK on ${table}.${column}`).toBeDefined();
    const values = [...def!.matchAll(/'([^']+)'::text/g)].map((m) => m[1]!);
    expect(values.sort()).toEqual([...common[schema]!.enum].sort());
  });
});

describe("orders: a merchant sees their own and cannot point at another tenant's rows", () => {
  it("reads only their own order, parcel and history", async () => {
    const app = open(db.url("fastgo_app"));
    const seen = await app.withActor(merchant(ids.userA, ids.companyA), (tx) =>
      tx.execute(sql`select tracking_number, (select count(*) from core.parcels) as parcels from core.orders`),
    );
    expect(seen.rows).toEqual([{ tracking_number: "FG-AAAA-0001", parcels: "1" }]);
  });

  it("refuses an order whose pickup address belongs to another company", async () => {
    const app = open(db.url("fastgo_app"));
    await expectDbError(
      app.withActor(merchant(ids.userA, ids.companyA), (tx) =>
        tx.execute(sql`insert into core.orders (tracking_number, owner_company_id, created_by, service, payment_mode,
                         freight_payer, total_millimes, pickup_address_id, recipient_id)
                       values ('FG-AAAA-0003', ${ids.companyA}, ${ids.userA}, 'standard', 'cashPickup', 'sender', 0,
                               ${ids.addressB}, ${recipientA})`),
      ),
      /foreign key/,
    );
  });

  it("refuses a negative amount and a malformed tracking number", async () => {
    await expect(
      q(`insert into core.orders (tracking_number, owner_company_id, service, payment_mode, freight_payer,
                total_millimes, pickup_address_id, recipient_id)
         values ('FG-AAAA-0004', $1, 'standard', 'cashPickup', 'sender', -1, $2, $3)`, [ids.companyA, ids.addressA, recipientA]),
    ).rejects.toThrow(/total_millimes/);
    await expect(
      q(`insert into core.orders (tracking_number, owner_company_id, service, payment_mode, freight_payer,
                total_millimes, pickup_address_id, recipient_id)
         values ('fg-1', $1, 'standard', 'cashPickup', 'sender', 0, $2, $3)`, [ids.companyA, ids.addressA, recipientA]),
    ).rejects.toThrow(/tracking_number/);
  });
});

describe("T30: an internal ticket note is never visible to the customer", () => {
  it("the customer reads the public message only; the agent reads both", async () => {
    const app = open(db.url("fastgo_app"));
    const me = merchant(ids.userA, ids.companyA);
    const ticket = await app.withActor(me, async (tx) => {
      const t = await tx.execute(
        sql`insert into core.tickets (order_id, opened_by, category) values (${orderA}, ${ids.userA}, 'delay') returning id`,
      );
      const id = (t.rows[0] as { id: string }).id;
      await tx.execute(sql`insert into core.ticket_messages (ticket_id, author_id, body)
                           values (${id}, ${ids.userA}, 'Mon colis est en retard')`);
      return id;
    });
    await app.withActor(staff("agent"), (tx) =>
      tx.execute(sql`insert into core.ticket_messages (ticket_id, author_id, body, is_internal)
                     values (${ticket}, ${staffId}, 'Chauffeur contacté', true)`),
    );
    const mine = await app.withActor(me, (tx) => tx.execute(sql`select body from core.ticket_messages`));
    expect(mine.rows).toEqual([{ body: "Mon colis est en retard" }]);
    const theirs = await app.withActor(staff("agent"), (tx) => tx.execute(sql`select body from core.ticket_messages`));
    expect(theirs.rows).toHaveLength(2);
    // The other merchant sees neither the ticket nor its messages.
    const other = await app.withActor(merchant(ids.userB, ids.companyB), (tx) =>
      tx.execute(sql`select (select count(*) from core.tickets) as t, (select count(*) from core.ticket_messages) as m`),
    );
    expect(other.rows).toEqual([{ t: "0", m: "0" }]);
    // The customer cannot write an internal note either.
    await expectDbError(
      app.withActor(me, (tx) =>
        tx.execute(sql`insert into core.ticket_messages (ticket_id, author_id, body, is_internal)
                       values (${ticket}, ${ids.userA}, 'note', true)`),
      ),
      /row-level security/,
    );
  });
});

describe("status_events: append-only, the worker may only empty the position (D9)", () => {
  const eventId = randomUUID();
  it("the app adds an event as itself and cannot change or delete it", async () => {
    const app = open(db.url("fastgo_app"));
    await app.withActor(staff("agent"), (tx) =>
      tx.execute(sql`insert into core.status_events (event_id, order_id, subject_type, subject_id, from_status,
                       to_status, actor_id, location)
                     values (${eventId}, ${orderA}, 'order', ${orderA}, 'received', 'confirmed', ${staffId},
                             'SRID=4326;POINT(10.18 36.8)')`),
    );
    await expectDbError(
      app.withActor(staff("admin"), (tx) => tx.execute(sql`update core.status_events set to_status = 'x'`)),
      /permission denied/,
    );
    await expectDbError(
      app.withActor(staff("admin"), (tx) => tx.execute(sql`delete from core.status_events`)),
      /permission denied/,
    );
  });
  it("the same event_id is stored once", async () => {
    await expect(
      q(`insert into core.status_events (event_id, order_id, subject_type, subject_id, to_status)
         values ($1, $2, 'order', $2, 'confirmed')`, [eventId, orderA]),
    ).rejects.toThrow(/event_id/);
  });
  it("the worker empties the location and nothing else; a superuser cannot change a row", async () => {
    const w = new pg.Client({ connectionString: db.url("fastgo_worker") });
    await w.connect();
    try {
      await expect(w.query("update core.status_events set to_status = 'x'")).rejects.toThrow(/permission denied/);
      await w.query("update core.status_events set location = null");
      const row = (await q("select to_status, location from core.status_events where event_id = $1", [eventId])).rows[0];
      expect(row).toEqual({ to_status: "confirmed", location: null });
    } finally {
      await w.end();
    }
    await expect(q("update core.status_events set to_status = 'x'")).rejects.toThrow(/append-only/);
    await expect(q("delete from core.status_events")).rejects.toThrow(/append-only/);
    await expect(q("truncate core.status_events")).rejects.toThrow(/append-only/);
  });
});

describe("hashes of codes and links are not readable by the app", () => {
  it("refuses SELECT of code_hash and token_hash, allows the other columns", async () => {
    await q(
      `insert into core.delivery_codes (parcel_id, code_hash, expires_at) values ($1, 'hmac-test', now() + interval '1 day')`,
      [parcelA],
    );
    await q(
      `insert into core.recipient_links (order_id, token_hash, expires_at) values ($1, 'token-test', now() + interval '1 day')`,
      [orderA],
    );
    const app = open(db.url("fastgo_app"));
    const me = staff("agent");
    await expectDbError(app.withActor(me, (tx) => tx.execute(sql`select code_hash from core.delivery_codes`)), /permission denied/);
    await expectDbError(app.withActor(me, (tx) => tx.execute(sql`select token_hash from core.recipient_links`)), /permission denied/);
    const ok = await app.withActor(me, (tx) => tx.execute(sql`select failed_attempts from core.delivery_codes`));
    expect(ok.rows).toEqual([{ failed_attempts: 0 }]);
  });
});

describe("definer functions", () => {
  const app = () => open(db.url("fastgo_app"));
  const nobody: Actor = { userId: "", accountId: "", role: "individual" };

  it("are owned by fastgo_public_reader, with a fixed search_path, and only fastgo_app may call them", async () => {
    const r = await q(
      `select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig::text as cfg,
              has_function_privilege('fastgo_app', p.oid, 'execute') as app,
              has_function_privilege('fastgo_readonly', p.oid, 'execute') as ro,
              has_function_privilege('fastgo_worker', p.oid, 'execute') as worker
         from pg_proc p where p.pronamespace = 'core'::regnamespace and p.prosecdef order by 1`,
    );
    expect(r.rows.map((x) => x.proname)).toEqual([
      "account_for_login",
      "can_reset_password",
      "create_account",
      "login_account",
      "mark_phone_verified",
      "recipient_link",
      "record_order_created",
      "rehash_password",
      "session_account",
      "set_password",
      "sms_tracking_payload",
      "tracking",
    ]);
    for (const f of r.rows) {
      // GH-10 round 2: account_for_login was replaced by login_account (0006); the app may no longer call it.
      // GH-22: the two order definers belong to fastgo_order_writer; the worker (not the app) reads the SMS payload.
      const orderWriter = f.proname === "record_order_created" || f.proname === "sms_tracking_payload";
      expect(f, f.proname).toMatchObject({
        owner: orderWriter ? "fastgo_order_writer" : "fastgo_public_reader",
        app: f.proname !== "account_for_login" && f.proname !== "sms_tracking_payload",
        ro: false,
        worker: f.proname === "sms_tracking_payload",
      });
      expect(f.cfg, f.proname).toContain("search_path=pg_catalog, core");
    }
  });

  it("R101: fastgo_app cannot execute account_for_login (login_account is the door, migration 0010)", async () => {
    const r = await q(
      "select has_function_privilege('fastgo_app', 'core.account_for_login(text,text)', 'EXECUTE') as app, has_function_privilege('fastgo_app', 'core.login_account(text,text)', 'EXECUTE') as door",
    );
    expect(r.rows).toEqual([{ app: false, door: true }]);
  });

  it("R405: tracking returns state, dates and zone names, and nothing personal", async () => {
    const zone = randomUUID();
    await q("insert into core.zones (id, name, name_ar, name_en) values ($1, 'Tunis', 'تونس', 'Tunis')", [zone]);
    await q("update core.addresses set zone_id = $1 where id = $2", [zone, ids.addressA]);
    const res = await app().withActor(nobody, (tx) => tx.execute(sql`select core.tracking('FG-AAAA-0001', 'fr') as t`));
    const t = (res.rows[0] as { t: Record<string, unknown> }).t;
    // GH-22: the keys of the contract's PublicTracking (the zones come from the addresses of an order with no quote).
    expect(Object.keys(t).sort()).toEqual(["eta_at", "from_city", "history", "parcel_count", "parcel_outcomes", "status", "to_city"]);
    expect(t).toMatchObject({ status: "received", from_city: "Tunis", to_city: null, eta_at: null });
    const text = JSON.stringify(t);
    for (const secret of ["Rue Test A", "Destinataire", "+216", "48500", "POINT"]) expect(text).not.toContain(secret);
    const none = await app().withActor(nobody, (tx) => tx.execute(sql`select core.tracking('FG-ZZZZ-9999', 'fr') as t`));
    expect((none.rows[0] as { t: unknown }).t).toBeNull();
  });

  it("R406: recipient_link finds a live link and returns nothing once it has expired", async () => {
    await q(`insert into core.recipient_links (order_id, token_hash, locale, expires_at) values
               ($1, 'live-hash', 'ar', now() + interval '1 hour'), ($1, 'dead-hash', 'fr', now() - interval '1 second')`, [orderB]);
    const at = new Date();
    const live = await app().withActor(nobody, (tx) =>
      tx.execute(sql`select * from core.recipient_link('live-hash', ${at}::timestamptz)`),
    );
    expect(live.rows).toMatchObject([{ tracking_number: "FG-BBBB-0002", locale: "ar" }]);
    const dead = await app().withActor(nobody, (tx) =>
      tx.execute(sql`select * from core.recipient_link('dead-hash', ${at}::timestamptz)`),
    );
    expect(dead.rows).toEqual([]);
  });

  // The trigger stamps ended_at with now() when the status enters an end state; the test moves that
  // stamp to a fixed date (status unchanged, so the trigger leaves it alone) to test the 24 h rule.
  async function deliveredOrder(tracking: string, hash: string, endedAt: Date) {
    const order = randomUUID();
    await q(
      `insert into core.orders (id, tracking_number, owner_company_id, service, payment_mode, freight_payer,
                                total_millimes, pickup_address_id, recipient_id)
       values ($1, $2, $3, 'standard', 'cashPickup', 'sender', 0, $4, $5)`,
      [order, tracking, ids.companyA, ids.addressA, recipientA],
    );
    await q("update core.orders set status = 'delivered' where id = $1", [order]);
    await q("update core.orders set ended_at = $2 where id = $1", [order, endedAt]);
    await q(`insert into core.recipient_links (order_id, token_hash, expires_at) values ($1, $2, $3)`, [
      order,
      hash,
      new Date("2027-01-01T00:00:00Z"),
    ]);
    return order;
  }
  const findLink = (hash: string, when: Date) =>
    app().withActor(nobody, (tx) => tx.execute(sql`select * from core.recipient_link(${hash}, ${when}::timestamptz)`));

  it("R406: a delivered order with a live link returns no row once 24 h have passed", async () => {
    const delivered = new Date("2026-11-10T10:00:00Z");
    await deliveredOrder("FG-DLVR-0001", "delivered-hash", delivered);
    const at = (h: number) => new Date(delivered.getTime() + h * 3_600_000);
    expect((await findLink("delivered-hash", at(23))).rows).toMatchObject([{ tracking_number: "FG-DLVR-0001" }]);
    expect((await findLink("delivered-hash", at(25))).rows).toEqual([]);
  });

  it("R406: a staff edit after delivery does not reopen the link", async () => {
    const delivered = new Date("2026-11-10T10:00:00Z");
    const order = await deliveredOrder("FG-DLVR-0002", "edited-hash", delivered);
    const later = new Date(delivered.getTime() + 25 * 3_600_000);
    expect((await findLink("edited-hash", later)).rows).toEqual([]);
    // An agent edits the order after delivery: updated_at moves to now, ended_at must not.
    await app().withActor(staff("agent"), (tx) =>
      tx.execute(sql`update core.orders set recipient_id = recipient_id where id = ${order}`),
    );
    const row = (await q("select ended_at, updated_at from core.orders where id = $1", [order])).rows[0];
    expect(row.ended_at).toEqual(delivered);
    expect(row.updated_at.getTime()).toBeGreaterThan(delivered.getTime());
    expect((await findLink("edited-hash", later)).rows).toEqual([]);
    // Right after the edit's own clock the link is still closed: the 24 h count from ended_at, not updated_at.
    expect((await findLink("edited-hash", new Date(row.updated_at.getTime() + 1000))).rows).toEqual([]);
  });

  it("account_for_login (no longer callable by the app) takes exactly one identifier and returns phone_verified_at", async () => {
    const a = app();
    await expectDbError(q("select * from core.account_for_login('+21620000051', 'c@example.test')"), /exactly one/);
    await expectDbError(q("select * from core.account_for_login(null, null)"), /exactly one/);
    await a.withActor(nobody, (tx) =>
      tx.execute(sql`select * from core.create_account('individual', 'Client Test D', '+21620000051', null, 'h')`),
    );
    const r = await q("select * from core.account_for_login('+21620000051', null)");
    expect(r.rows).toHaveLength(1);
    expect(Object.keys(r.rows[0] as object)).toContain("phone_verified_at");
  });

  it("create_account needs a role and a phone number", async () => {
    const a = app();
    await expectDbError(
      a.withActor(nobody, (tx) => tx.execute(sql`select * from core.create_account(null, 'Z', '+21620000041', null, 'h')`)),
      /cannot sign up/,
    );
    await expectDbError(
      a.withActor(nobody, (tx) => tx.execute(sql`select * from core.create_account('individual', 'Z', null, null, 'h')`)),
      /phone number is required/,
    );
  });

  it("create_account signs up an individual or a merchant, refuses staff roles, and login finds them", async () => {
    const a = app();
    const made = await a.withActor(nobody, (tx) =>
      tx.execute(sql`select * from core.create_account('merchant', 'Marchand Test C', '+21620000031',
                       'C@Example.test', 'argon2-test', 'fr', 'Boutique Test C')`),
    );
    const row = made.rows[0] as { new_account_id: string; new_company_id: string };
    expect(row.new_company_id).toBeTruthy();
    const login = await a.withActor(nobody, (tx) =>
      tx.execute(sql`select * from core.login_account(null, 'c@example.test')`),
    );
    expect(login.rows).toMatchObject([{ id: row.new_account_id, role: "merchant", company_id: row.new_company_id, password_hash: "argon2-test" }]);
    await expectDbError(
      a.withActor(nobody, (tx) => tx.execute(sql`select * from core.create_account('admin', 'X', '+21620000032', null, 'h')`)),
      /cannot sign up/,
    );
    await expectDbError(
      a.withActor(nobody, (tx) => tx.execute(sql`select * from core.create_account('individual', 'Y', '+21620000031', null, 'h')`)),
      /unique|duplicate/,
    );
    // Nothing was left behind by the refused calls.
    expect((await q("select count(*)::int as n from core.accounts where phone_e164 in ('+21620000032')")).rows[0].n).toBe(0);
  });
});

// RV-21: a customer or merchant never gets a raw write on a status, money, owner or tracking column.
describe("RV-21: protected columns", () => {
  let n = 0;
  /** A fresh order and parcel, written as the superuser, so a test can change them without touching the others. */
  const fresh = async (status = "received", company = ids.companyA, address = ids.addressA, recipient = recipientA) => {
    n += 1;
    const order = randomUUID();
    const parcel = randomUUID();
    const tracking = `FG-F${String(n).padStart(3, "0")}-0000`;
    await q(
      `insert into core.orders (id, tracking_number, owner_company_id, service, payment_mode, freight_payer,
                                total_millimes, pickup_address_id, recipient_id, status)
       values ($1, $2, $3, 'standard', 'cashPickup', 'sender', 48500, $4, $5, $6)`,
      [order, tracking, company, address, recipient, status],
    );
    await q(
      `insert into core.parcels (id, order_id, size, weight_declared_g, cod_millimes, declared_value_millimes, proof_level)
       values ($1, $2, 'small', 800, 20000, 30000, 'codeOrPhotoWithPosition')`,
      [parcel, order],
    );
    return { order, parcel, tracking };
  };
  const orderRow = async (id: string) => (await q("select * from core.orders where id = $1", [id])).rows[0];
  const parcelRow = async (id: string) => (await q("select * from core.parcels where id = $1", [id])).rows[0];
  const rowCount = (r: unknown) => (r as { rowCount: number | null }).rowCount;
  const app = () => open(db.url("fastgo_app"));
  const A = () => merchant(ids.userA, ids.companyA);

  describe("orders", () => {
    // [column, a valid value for it, granted to the app login?]
    const columns: Array<[string, string, boolean]> = [
      ["id", "gen_random_uuid()", false],
      ["tracking_number", "'FG-HACK-0001'", false],
      ["owner_account_id", "null::uuid", false],
      ["owner_company_id", `'${randomUUID()}'::uuid`, false],
      ["created_by", "null::uuid", false],
      ["idempotency_scope", "'x'", false],
      ["service", "'standard'", false],
      ["payment_mode", "'cashPickup'", false],
      ["freight_payer", "'recipient'", false],
      ["recipient_locale", "'ar'", false],
      ["total_millimes", "1", false],
      ["created_at", "now()", false],
      ["updated_at", "now() + interval '1 day'", false],
      ["ended_at", "now()", false],
      ["status", "'delivered'", true],
      ["pickup_address_id", "null::uuid", true],
      ["recipient_id", "null::uuid", true],
      // GH-22 (migration 0011): written once at creation, by nobody afterwards.
      ["quote_id", "gen_random_uuid()", false],
      ["lines", "'[]'::jsonb", false],
      ["null_lines", "'{}'::text[]", false],
      ["price_list_valid_from", "now()", false],
      ["departure_zone_id", "null::uuid", false],
      ["arrival_zone_id", "null::uuid", false],
      ["address_unconfirmed", "true", false],
      ["sender_name", "'X'", false],
      ["sender_phone", "'+21620000000'", false],
      ["pickup_slot_start", "now()", false],
      ["pickup_slot_end", "now()", false],
      ["delivery_slot_start", "now()", false],
      ["delivery_slot_end", "now()", false],
      ["delivery_instructions", "'X'", false],
      ["content", "'X'", false],
      ["fragile", "true", false],
      ["packaging", "true", false],
      ["declared_value_millimes", "1", false],
      ["freight_payer_accepted", "true", false],
      ["terms_accepted_at", "now()", false],
      ["idempotency_body_hash", "'x'", false],
    ];
    it("lists every column of the table, so a new column cannot be forgotten", async () => {
      const r = await q(
        "select column_name from information_schema.columns where table_schema = 'core' and table_name = 'orders'",
      );
      expect(r.rows.map((c) => c.column_name).sort()).toEqual(columns.map(([c]) => c).sort());
    });
    it.each(columns)("a merchant cannot update %s on their own order (%s, granted: %s)", async (column, value, granted) => {
      const { order } = await fresh();
      const before = await orderRow(order);
      const update = app().withActor(A(), (tx) =>
        tx.execute(sql.raw(`update core.orders set ${column} = ${value} where id = '${order}'`)),
      );
      if (granted) {
        // The column is granted to the login but the policy is staff only: no error, no row.
        expect(rowCount(await update)).toBe(0);
      } else {
        await expectDbError(update, /permission denied/);
      }
      expect(await orderRow(order)).toEqual(before);
    });
    it("an agent cannot re-point an order to another company's recipient or address", async () => {
      const { order } = await fresh();
      const before = await orderRow(order);
      await expectDbError(
        app().withActor(staff("agent"), (tx) =>
          tx.execute(sql`update core.orders set recipient_id = ${recipientB} where id = ${order}`),
        ),
        /foreign key/,
      );
      await expectDbError(
        app().withActor(staff("agent"), (tx) =>
          tx.execute(sql`update core.orders set pickup_address_id = ${ids.addressB} where id = ${order}`),
        ),
        /foreign key/,
      );
      expect(await orderRow(order)).toEqual(before);
    });
    it("CONTROL: an agent can move the status of the same order", async () => {
      const { order } = await fresh();
      const r = await app().withActor(staff("agent"), (tx) =>
        tx.execute(sql`update core.orders set status = 'confirmed' where id = ${order}`),
      );
      expect(rowCount(r)).toBe(1);
      expect((await orderRow(order)).status).toBe("confirmed");
    });
    it("tracking number, owner and creator never change, whoever writes", async () => {
      const { order } = await fresh();
      for (const set of [
        "tracking_number = 'FG-NEW0-0001'",
        `owner_company_id = '${ids.companyB}'`,
        `created_by = '${staffId}'`,
      ]) {
        await expect(q(`update core.orders set ${set} where id = $1`, [order]), set).rejects.toThrow(/never change/);
      }
    });
    it("a merchant inserts an order with themselves as creator, and nobody else", async () => {
      const insert = (tracking: string, createdBy: string) =>
        app().withActor(A(), (tx) =>
          tx.execute(sql`insert into core.orders (tracking_number, owner_company_id, created_by, service, payment_mode,
                           freight_payer, total_millimes, pickup_address_id, recipient_id)
                         values (${tracking}, ${ids.companyA}, ${createdBy}, 'standard', 'cashPickup', 'sender', 0,
                                 ${ids.addressA}, ${recipientA})`),
        );
      await expectDbError(insert("FG-INSR-0002", ids.userB), /row-level security/);
      expect(rowCount(await insert("FG-INSR-0003", ids.userA))).toBe(1);
      expect((await q("select count(*)::int as n from core.orders where tracking_number = 'FG-INSR-0002'")).rows[0].n).toBe(0);
    });
    // RV-21 round 2: INSERT is granted by column too, so a merchant cannot backdate an order or pick its status.
    it.each([
      ["id", "gen_random_uuid()"],
      ["status", "'received'"],
      ["created_at", "now() - interval '30 days'"],
      ["updated_at", "now() - interval '30 days'"],
      ["ended_at", "now()"],
    ])("a merchant cannot set %s when creating an order (%s)", async (column, value) => {
      const tracking = `FG-INS${column.length}-${String(n++).padStart(4, "0")}`.toUpperCase().slice(0, 12);
      await expectDbError(
        app().withActor(A(), (tx) =>
          tx.execute(
            sql.raw(`insert into core.orders (tracking_number, owner_company_id, created_by, service, payment_mode,
                       freight_payer, total_millimes, pickup_address_id, recipient_id, ${column})
                     values ('${tracking}', '${ids.companyA}', '${ids.userA}', 'standard', 'cashPickup', 'sender', 0,
                             '${ids.addressA}', '${recipientA}', ${value})`),
          ),
        ),
        /permission denied/,
      );
      expect((await q("select count(*)::int as n from core.orders where tracking_number = $1", [tracking])).rows[0].n).toBe(0);
    });
    it("CONTROL: the granted columns insert, the others take their default (a fresh status and clock)", async () => {
      const r = await app().withActor(A(), (tx) =>
        tx.execute(sql`insert into core.orders (tracking_number, owner_company_id, created_by, service, payment_mode,
                         freight_payer, total_millimes, pickup_address_id, recipient_id)
                       values ('FG-CTRL-0001', ${ids.companyA}, ${ids.userA}, 'standard', 'cashPickup', 'sender', 0,
                               ${ids.addressA}, ${recipientA})
                       returning status, ended_at, created_at = updated_at as same_clock`),
      );
      expect(r.rows).toEqual([{ status: "received", ended_at: null, same_clock: true }]);
    });
    it("updated_at moves on every update and ended_at is set by the trigger when the status ends", async () => {
      const { order } = await fresh("confirmed");
      const before = await orderRow(order);
      expect(before.ended_at).toBeNull();
      await app().withActor(staff("agent"), (tx) =>
        tx.execute(sql`update core.orders set status = 'delivered' where id = ${order}`),
      );
      const after = await orderRow(order);
      expect(after.ended_at).not.toBeNull();
      expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
      // A later edit moves updated_at, never ended_at.
      await app().withActor(staff("agent"), (tx) =>
        tx.execute(sql`update core.orders set recipient_id = recipient_id where id = ${order}`),
      );
      const edited = await orderRow(order);
      expect(edited.ended_at).toEqual(after.ended_at);
      expect(edited.updated_at.getTime()).toBeGreaterThan(after.updated_at.getTime());
    });
    it("a merchant listing reads orders through the owner indexes", async () => {
      // Enough rows for the planner to prefer an index, and the sequential scan switched off so the test
      // fails only if the policy hides the owner test from the planner.
      await q(
        `insert into core.orders (tracking_number, owner_company_id, service, payment_mode, freight_payer,
                                  total_millimes, pickup_address_id, recipient_id)
         select 'FG-X' || lpad(g::text, 3, '0') || '-0000', $1, 'standard', 'cashPickup', 'sender', 0, $2, $3
           from generate_series(1, 300) g`,
        [ids.companyB, ids.addressB, recipientB],
      );
      await q("analyze core.orders");
      const plan = await app().withActor(merchant(ids.userB, ids.companyB), async (tx) => {
        await tx.execute(sql`set local enable_seqscan = off`);
        const r = await tx.execute(sql`explain select id from core.orders where owner_company_id = ${ids.companyB} order by created_at desc limit 10`);
        return (r.rows as Array<Record<string, string>>).map((x) => x["QUERY PLAN"]).join("\n");
      });
      expect(plan).toMatch(/orders_owner_company/);
    });
  });

  describe("parcels", () => {
    const columns: Array<[string, string, boolean]> = [
      ["id", "gen_random_uuid()", false],
      ["order_id", `'${randomUUID()}'::uuid`, false],
      ["created_at", "now()", false],
      ["barcode", "'GF000001'", true],
      ["size", "'large'", true],
      ["weight_declared_g", "1", true],
      ["weight_measured_g", "1", true],
      ["declared_value_millimes", "1", true],
      ["cod_millimes", "1", true],
      ["proof_level", "'codeOrPhotoWithPosition'", true],
      ["attempts", "1", true],
      ["updated_at", "now() + interval '1 day'", false],
      ["status", "'delivered'", true],
      ["position", "9", false], // GH-22: set once, at creation
    ];
    it("lists every column of the table", async () => {
      const r = await q("select column_name from information_schema.columns where table_schema = 'core' and table_name = 'parcels'");
      expect(r.rows.map((c) => c.column_name).sort()).toEqual(columns.map(([c]) => c).sort());
    });
    it.each(columns)("a merchant cannot update %s on a parcel of their order (granted to the login: %s)", async (column, value, granted) => {
      const { parcel } = await fresh();
      const before = await parcelRow(parcel);
      const update = app().withActor(A(), (tx) =>
        tx.execute(sql.raw(`update core.parcels set ${column} = ${value} where id = '${parcel}'`)),
      );
      if (granted) expect(rowCount(await update)).toBe(0);
      else await expectDbError(update, /permission denied/);
      expect(await parcelRow(parcel)).toEqual(before);
    });
    it("a merchant adds a parcel while the order is received, never after, and never sets the status", async () => {
      const open1 = await fresh("received");
      const done = await fresh("delivered");
      const insert = (order: string, extra = "") =>
        app().withActor(A(), (tx) =>
          tx.execute(sql.raw(`insert into core.parcels (order_id, size, weight_declared_g, proof_level${extra ? ", status" : ""})
                              values ('${order}', 'small', 500, 'codeOrPhotoWithPosition'${extra ? `, ${extra}` : ""})`)),
        );
      expect(rowCount(await insert(open1.order))).toBe(1);
      await expectDbError(insert(done.order), /row-level security/);
      await expectDbError(insert(open1.order, "'delivered'"), /permission denied/);
      expect((await q("select count(*)::int as n from core.parcels where order_id = $1", [done.order])).rows[0].n).toBe(1);
    });
    it("GH-96 RV-21: only the owner or staff who move orders add a parcel to a received order", async () => {
      const insert = (actor: Actor, order: string) =>
        app().withActor(actor, (tx) =>
          tx.execute(sql`insert into core.parcels (order_id, size, weight_declared_g, proof_level)
                         values (${order}, 'small', 500, 'codeOrPhotoWithPosition')`),
        );
      const count = async (order: string) =>
        (await q("select count(*)::int as n from core.parcels where order_id = $1", [order])).rows[0].n;
      // Customer service reads every order but does not move them: refused.
      const cs = await fresh("received");
      await expectDbError(insert(staff("customer_service"), cs.order), /row-level security/);
      expect(await count(cs.order)).toBe(1);
      // Another merchant: refused (the order is not even visible to them).
      const other = await fresh("received");
      await expectDbError(insert(merchant(ids.userB, ids.companyB), other.order), /row-level security/);
      expect(await count(other.order)).toBe(1);
      // CONTROL: the owner and operations are allowed.
      const own = await fresh("received");
      expect(rowCount(await insert(A(), own.order))).toBe(1);
      expect(rowCount(await insert(staff("operations"), own.order))).toBe(1);
      expect(await count(own.order)).toBe(3);
    });
    it("staff cannot change the money of a parcel once the order is confirmed, and a parcel never changes order", async () => {
      const { order, parcel } = await fresh("confirmed");
      const before = await parcelRow(parcel);
      for (const set of ["cod_millimes = 5", "declared_value_millimes = 5"]) {
        await expectDbError(
          app().withActor(staff("agent"), (tx) => tx.execute(sql.raw(`update core.parcels set ${set} where id = '${parcel}'`))),
          /frozen/,
        );
      }
      const other = await fresh("received");
      await expect(q("update core.parcels set order_id = $1 where id = $2", [other.order, parcel])).rejects.toThrow(
        /stays on its order/,
      );
      expect(await parcelRow(parcel)).toEqual(before);
      // CONTROL: before confirmation the same change is allowed.
      const open1 = await fresh("received");
      const ok = await app().withActor(staff("agent"), (tx) =>
        tx.execute(sql`update core.parcels set cod_millimes = 5 where id = ${open1.parcel}`),
      );
      expect(rowCount(ok)).toBe(1);
      expect(order).toBeTruthy();
    });
  });

  describe("status_events", () => {
    it("GH-96: the app reads status and time of an event, never the driver position or the actor", async () => {
      const { order } = await fresh();
      await q(
        `insert into core.status_events (order_id, subject_type, subject_id, to_status, actor_id, location)
         values ($1, 'order', $1, 'confirmed', $2, 'SRID=4326;POINT(10.18 36.8)')`,
        [order, staffId],
      );
      for (const column of ["location", "actor_id"]) {
        for (const actor of [A(), staff("admin")]) {
          await expectDbError(
            app().withActor(actor, (tx) =>
              tx.execute(sql.raw(`select ${column} from core.status_events where order_id = '${order}'`)),
            ),
            /permission denied/,
          );
        }
      }
      // CONTROL: status and time stay readable by the owner.
      const ok = await app().withActor(A(), (tx) =>
        tx.execute(sql`select to_status, occurred_at from core.status_events where order_id = ${order}`),
      );
      expect((ok.rows as { to_status: string }[]).map((r) => r.to_status)).toContain("confirmed");
    });
    it("a merchant cannot write a `delivered` event, and the tracking does not move", async () => {
      const { order, tracking } = await fresh();
      await expectDbError(
        app().withActor(A(), (tx) =>
          tx.execute(sql`insert into core.status_events (order_id, subject_type, subject_id, to_status, actor_id)
                         values (${order}, 'order', ${order}, 'delivered', ${ids.userA})`),
        ),
        /row-level security/,
      );
      expect((await q("select count(*)::int as n from core.status_events where order_id = $1", [order])).rows[0].n).toBe(0);
      const t = await app().withActor({ userId: "", accountId: "", role: "individual" }, (tx) =>
        tx.execute(sql`select core.tracking(${tracking}, 'fr') as t`),
      );
      expect((t.rows[0] as { t: { status: string } }).t.status).toBe("received");
    });
  });

  describe("companies", () => {
    it("a merchant cannot change the status or the tax number of their company", async () => {
      const before = (await q("select status, tax_number from core.companies where id = $1", [ids.companyA])).rows[0];
      for (const set of ["status = 'suspended'", "tax_number = '1234567/A/M/000'"]) {
        await expectDbError(
          app().withActor(A(), (tx) => tx.execute(sql.raw(`update core.companies set ${set} where id = '${ids.companyA}'`))),
          /staff only/,
        );
      }
      expect((await q("select status, tax_number from core.companies where id = $1", [ids.companyA])).rows[0]).toEqual(before);
    });
  });

  describe("delivery codes", () => {
    it("the owner creates the code while the order is received, not after; the hash is never readable", async () => {
      const open1 = await fresh("received");
      const done = await fresh("delivered");
      const insert = (parcel: string) =>
        app().withActor(A(), (tx) =>
          tx.execute(sql`insert into core.delivery_codes (parcel_id, code_hash, expires_at)
                         values (${parcel}, 'hmac-owner', now() + interval '1 day')`),
        );
      expect(rowCount(await insert(open1.parcel))).toBe(1);
      await expectDbError(insert(done.parcel), /row-level security/);
      // Customer service reads and helps, but does not mint the owner's delivery code.
      const cs = await fresh("received");
      await expectDbError(
        app().withActor(staff("customer_service"), (tx) =>
          tx.execute(sql`insert into core.delivery_codes (parcel_id, code_hash, expires_at)
                         values (${cs.parcel}, 'hmac-cs', now() + interval '1 day')`),
        ),
        /row-level security/,
      );
      expect((await q("select count(*)::int as n from core.delivery_codes where parcel_id = $1", [cs.parcel])).rows[0].n).toBe(0);
      // The Drizzle column set leaves the hash out; a plain select of the table does not work as the app.
      const ok = await app().withActor(staff("agent"), (tx) =>
        tx.select(tables.deliveryCodeColumns).from(tables.deliveryCodes).where(sql`parcel_id = ${open1.parcel}`),
      );
      expect(ok).toHaveLength(1);
      expect(ok[0]).not.toHaveProperty("codeHash");
      await expectDbError(
        app().withActor(staff("agent"), (tx) => tx.select().from(tables.deliveryCodes)),
        /permission denied/,
      );
    });
  });

  describe("hash-free column sets", () => {
    it("accountColumns and recipientLinkColumns select as the app, the full table does not", async () => {
      const admin = staff("admin");
      const accounts = await app().withActor(admin, (tx) => tx.select(tables.accountColumns).from(tables.accounts));
      expect(accounts.length).toBeGreaterThan(0);
      for (const a of accounts) expect(a).not.toHaveProperty("passwordHash");
      const links = await app().withActor(admin, (tx) => tx.select(tables.recipientLinkColumns).from(tables.recipientLinks));
      for (const l of links) expect(l).not.toHaveProperty("tokenHash");
      await expectDbError(app().withActor(admin, (tx) => tx.select().from(tables.accounts)), /permission denied/);
    });
  });
});
