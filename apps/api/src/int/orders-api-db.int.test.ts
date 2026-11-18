import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db } from "../db/index.ts";
import type { Actor } from "../http/session.ts";
import { expectDbError, seedMerchants, startTestDb, type TestDb } from "./harness.ts";

// GH-22 (PR 4b-2a): migration 0011 at the database level: the order columns of the API, the CHECKs, the
// definer functions (record_order_created, sms_tracking_payload, tracking), the history sequence and the
// quote purge delay. The HTTP behaviour is in orders.api.int.test.ts.

let db: TestDb;
let ids: Awaited<ReturnType<typeof seedMerchants>>;
let zoneA: string;
let zoneB: string;
const opened: Db[] = [];
const open = (url: string) => {
  const d = new Db(url, 2);
  opened.push(d);
  return d;
};
const merchant = (user: string, company: string): Actor => ({ userId: user, accountId: company, role: "merchant" });
const q = (text: string, values: unknown[] = []) => db.superClient.query(text, values);

const LINES = [
  { kind: "base", unit_millimes: 6000, count: 1, millimes: 6000 },
  { kind: "discount", unit_millimes: -1000, count: 1, millimes: -1000 },
  { kind: "vat", unit_millimes: null, count: 1, millimes: null },
];

let seq = 0;
/** An order made the way the API will make it; `extra` overrides a column. Superuser, so the RLS is out of the way. */
async function insertOrder(extra: Record<string, unknown> = {}): Promise<string> {
  seq += 1;
  const id = randomUUID();
  const recipient = randomUUID();
  await q(`insert into core.recipients (id, owner_company_id, name, phone_e164) values ($1, $2, 'Destinataire Test', '+21620000099')`, [
    recipient,
    ids.companyA,
  ]);
  const row: Record<string, unknown> = {
    id,
    tracking_number: `FG-T${String(seq).padStart(3, "0")}-0000`,
    owner_company_id: ids.companyA,
    created_by: ids.userA,
    service: "standard",
    payment_mode: "cashPickup",
    freight_payer: "sender",
    total_millimes: 5000,
    pickup_address_id: ids.addressA,
    recipient_id: recipient,
    quote_id: randomUUID(),
    lines: JSON.stringify(LINES),
    null_lines: ["vat"],
    price_list_valid_from: "2026-11-06T00:00:00Z",
    departure_zone_id: zoneA,
    arrival_zone_id: zoneB,
    sender_name: "Expéditeur Test",
    sender_phone: "+21620000098",
    pickup_slot_start: "2026-11-20T08:00:00Z",
    pickup_slot_end: "2026-11-20T10:00:00Z",
    content: "Documents",
    terms_accepted_at: "2026-11-18T09:00:00Z",
    ...extra,
  };
  const cols = Object.keys(row);
  await q(
    `insert into core.orders (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
    cols.map((c) => row[c]),
  );
  return id;
}

beforeAll(async () => {
  db = await startTestDb();
  ids = await seedMerchants(db);
  const zones = (await q("select id from core.zones where active order by name limit 2")).rows as { id: string }[];
  zoneA = zones[0]!.id;
  zoneB = zones[1]!.id;
});
afterAll(async () => {
  await Promise.all(opened.map((d) => d.close()));
  await db?.stop();
});

describe("GH-22 R204 R206: the order columns and their CHECKs", () => {
  it("an order made by the API is accepted; an old-style row (no quote) still is", async () => {
    await insertOrder();
    const legacy = randomUUID();
    await q(
      `insert into core.recipients (id, owner_company_id, name, phone_e164) values ($1, $2, 'D', '+21620000097')`,
      [legacy, ids.companyA],
    );
    await q(
      `insert into core.orders (tracking_number, owner_company_id, service, payment_mode, freight_payer, total_millimes, pickup_address_id, recipient_id)
       values ('FG-LEGA-0001', $1, 'standard', 'cashPickup', 'sender', 100, $2, $3)`,
      [ids.companyA, ids.addressA, legacy],
    );
  });

  it("total_millimes is the sum of the lines: the discount counts, a null line is skipped", async () => {
    await expectDbError(insertOrder({ total_millimes: 6000 }), /total/i); // 6000 - 1000 = 5000
    await expectDbError(insertOrder({ total_millimes: 4999 }), /total/i);
  });

  it("null_lines is the set of lines with no amount (Q11)", async () => {
    await expectDbError(insertOrder({ null_lines: [] }), /null_lines/i);
    await expectDbError(insertOrder({ null_lines: ["vat", "stamp"] }), /null_lines/i);
  });

  it("an order with a quote needs every column the API fills", async () => {
    for (const col of ["lines", "price_list_valid_from", "departure_zone_id", "arrival_zone_id", "sender_name", "sender_phone", "pickup_slot_start", "content", "terms_accepted_at", "null_lines"])
      await expectDbError(insertOrder({ [col]: null }), /order/i);
  });

  it("R607: cash on delivery needs the freight-payer acceptance", async () => {
    await expectDbError(insertOrder({ payment_mode: "cashDelivery", freight_payer: "recipient" }), /freight/i);
    await insertOrder({ payment_mode: "cashDelivery", freight_payer: "recipient", freight_payer_accepted: true });
  });

  it("slots: an end after the start; a scheduled order has a delivery window, the others have none", async () => {
    await expectDbError(insertOrder({ pickup_slot_end: "2026-11-20T08:00:00Z" }), /slot/i);
    await expectDbError(insertOrder({ service: "scheduled" }), /slot/i);
    await expectDbError(insertOrder({ delivery_slot_start: "2026-11-21T08:00:00Z", delivery_slot_end: "2026-11-21T10:00:00Z" }), /slot/i);
    await insertOrder({
      service: "scheduled",
      delivery_slot_start: "2026-11-21T08:00:00Z",
      delivery_slot_end: "2026-11-21T10:00:00Z",
    });
  });
});

describe("GH-22 RV-21 R406: what a customer or merchant login may write", () => {
  const draft = (tracking: string, extra = "") =>
    sql.raw(`insert into core.orders (tracking_number, owner_company_id, created_by, service, payment_mode, freight_payer,
        total_millimes, pickup_address_id, recipient_id, quote_id, lines, null_lines, price_list_valid_from,
        departure_zone_id, arrival_zone_id, sender_name, sender_phone, pickup_slot_start, pickup_slot_end,
        content, terms_accepted_at ${extra})
      select '${tracking}', '${ids.companyA}', '${ids.userA}', 'standard', 'cashPickup', 'sender', 5000,
        '${ids.addressA}', r.id, gen_random_uuid(), '${JSON.stringify(LINES)}'::jsonb, array['vat'], now(),
        '${zoneA}', '${zoneB}', 'Expéditeur', '+21620000098', now(), now() + interval '2 hours', 'Documents', now() ${extra ? ", now()" : ""}
        from core.recipients r where r.owner_company_id = '${ids.companyA}' limit 1`);

  it("the merchant login inserts the order with the new columns, and cannot set created_at", async () => {
    const app = open(db.url("fastgo_app"));
    await app.withActor(merchant(ids.userA, ids.companyA), (tx) => tx.execute(draft("FG-APP1-0001")));
    await expectDbError(
      app.withActor(merchant(ids.userA, ids.companyA), (tx) => tx.execute(draft("FG-APP1-0002", ", created_at"))),
      /permission denied/i,
    );
  });

  it("the merchant login cannot update an order: not the status, not the money, not the new columns", async () => {
    const app = open(db.url("fastgo_app"));    // Scoped to customer and merchant: staff may move the status through the 0004:73 grant. A column with no
    // UPDATE grant is refused; `status` has one, so a merchant's UPDATE is refused by the RLS and touches no row.
    for (const set of ["status = 'confirmed'", "total_millimes = 1", "content = 'x'", "lines = '[]'::jsonb", "address_unconfirmed = true"])
      await app
        .withActor(merchant(ids.userA, ids.companyA), (tx) => tx.execute(sql.raw(`update core.orders set ${set} where tracking_number = 'FG-APP1-0001'`)))
        .catch(() => undefined);
    const r = await q("select status, total_millimes, content, address_unconfirmed, lines from core.orders where tracking_number = 'FG-APP1-0001'");
    expect(r.rows[0]).toMatchObject({ status: "received", total_millimes: "5000", content: "Documents", address_unconfirmed: false });
    expect(r.rows[0].lines).toHaveLength(3);
  });
});

describe("GH-22 R202: core.record_order_created writes the history of a new order", () => {
  it("writes the order event and one event per parcel, with the actor and a rising seq; a second call is refused", async () => {
    const id = await insertOrder({ tracking_number: "FG-HIST-0001" });
    await q(
      `insert into core.parcels (order_id, size, weight_declared_g, proof_level) values ($1, 'small', 800, 'codeOrPhotoWithPosition'), ($1, 'small', 900, 'codeOrPhotoWithPosition')`,
      [id],
    );
    const app = open(db.url("fastgo_app"));
    await app.withActor(merchant(ids.userA, ids.companyA), (tx) => tx.execute(sql`select core.record_order_created(${id}::uuid)`));
    const rows = (
      await q(`select subject_type, from_status, to_status, actor_id, seq from core.status_events where order_id = $1 order by seq`, [id])
    ).rows as { subject_type: string; from_status: string | null; to_status: string; actor_id: string; seq: string }[];
    expect(rows.map((r) => [r.subject_type, r.from_status, r.to_status])).toEqual([
      ["order", null, "received"],
      ["parcel", null, "to_collect"],
      ["parcel", null, "to_collect"],
    ]);
    expect(new Set(rows.map((r) => r.actor_id))).toEqual(new Set([ids.userA]));
    expect(rows.map((r) => Number(r.seq))).toEqual([...rows.map((r) => Number(r.seq))].sort((a, b) => a - b));
    await expectDbError(
      app.withActor(merchant(ids.userA, ids.companyA), (tx) => tx.execute(sql`select core.record_order_created(${id}::uuid)`)),
      /not found|already/i,
    );
  });

  it("refuses a caller who is not the creator, and the app login cannot insert into the history itself", async () => {
    const id = await insertOrder({ tracking_number: "FG-HIST-0002" });
    const app = open(db.url("fastgo_app"));
    await expectDbError(
      app.withActor(merchant(ids.userB, ids.companyB), (tx) => tx.execute(sql`select core.record_order_created(${id}::uuid)`)),
      /not found/i,
    );
    await expectDbError(
      app.withActor(merchant(ids.userA, ids.companyA), (tx) =>
        tx.execute(sql`insert into core.status_events (order_id, subject_type, subject_id, to_status) values (${id}::uuid, 'order', ${id}::uuid, 'confirmed')`),
      ),
      /row-level security|permission denied/i,
    );
  });

  it("the definer functions belong to fastgo_order_writer; only the app may run record_order_created", async () => {
    const r = (
      await q(`select p.proname, pg_get_userbyid(p.proowner) as owner,
                      has_function_privilege('fastgo_app', p.oid, 'execute') as app,
                      has_function_privilege('fastgo_worker', p.oid, 'execute') as worker,
                      has_function_privilege('public', p.oid, 'execute') as pub
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'core' and p.proname in ('record_order_created', 'sms_tracking_payload') order by 1`)
    ).rows;
    expect(r).toEqual([
      { proname: "record_order_created", owner: "fastgo_order_writer", app: true, worker: false, pub: false },
      { proname: "sms_tracking_payload", owner: "fastgo_order_writer", app: false, worker: true, pub: false },
    ]);
  });
});

describe("GH-22 R405: core.tracking(number, locale)", () => {
  it("answers the contract keys, the city names in the asked language, and nothing personal", async () => {
    const id = await insertOrder({ tracking_number: "FG-TRAC-0001" });
    await q(`insert into core.parcels (order_id, size, weight_declared_g, proof_level, status) values ($1, 'small', 800, 'codeOrPhotoWithPosition', 'to_collect'), ($1, 'small', 900, 'codeOrPhotoWithPosition', 'canceled')`, [id]);
    const app = open(db.url("fastgo_app"));
    const get = async (locale: string) =>
      (
        (await app.withNoActor((tx) => tx.execute(sql`select core.tracking('FG-TRAC-0001', ${locale}) as t`))).rows[0] as { t: Record<string, unknown> }
      ).t;
    const names = (await q("select name, name_ar, name_en from core.zones where id = any($1)", [[zoneA, zoneB]])).rows;
    const fr = await get("fr");
    expect(Object.keys(fr).sort()).toEqual(["eta_at", "from_city", "history", "parcel_count", "parcel_outcomes", "status", "to_city"]);
    expect(fr).toMatchObject({ status: "received", eta_at: null, parcel_count: 1, parcel_outcomes: ["to_collect"] });
    const zA = (await q("select name, name_ar, name_en from core.zones where id = $1", [zoneA])).rows[0] as Record<string, string>;
    expect(fr.from_city).toBe(zA.name);
    expect((await get("ar")).from_city).toBe(zA.name_ar);
    expect((await get("en")).from_city).toBe(zA.name_en);
    expect((await get("xx")).from_city).toBe(zA.name); // an unknown language falls back to French
    expect(names).toHaveLength(2);
    const text = JSON.stringify([fr, await get("ar"), await get("en")]);
    for (const secret of ["Expéditeur", "Destinataire", "+216", "Rue Test", "Documents", "5000", "6000", String(id)]) expect(text).not.toContain(secret);
    const none = await app.withNoActor((tx) => tx.execute(sql`select core.tracking('FG-ZZZZ-9999', 'fr') as t`));
    expect((none.rows[0] as { t: unknown }).t).toBeNull(); // an unknown number: nothing (the API answers 404)
  });
});

describe("GH-22 R903 R105: core.sms_tracking_payload(order)", () => {
  it("gives the worker the recipient phone, the number and the language, and nothing when the account is closed", async () => {
    const id = await insertOrder({ tracking_number: "FG-SMS0-0001", recipient_locale: "ar" });
    const worker = open(db.url("fastgo_worker"));
    const read = async () =>
      (await worker.withWorker((tx) => tx.execute(sql`select core.sms_tracking_payload(${id}::uuid) as p`))).rows[0] as { p: Record<string, string> | null };
    expect((await read()).p).toEqual({ phone: "+21620000099", tracking_number: "FG-SMS0-0001", locale: "ar" });
    const app = open(db.url("fastgo_app"));
    await expectDbError(app.withNoActor((tx) => tx.execute(sql`select core.sms_tracking_payload(${id}::uuid)`)), /permission denied/i);
  });
});

describe("GH-22 RV-04: the quote purge waits 24 h after the expiry", () => {
  it("the worker deletes a quote expired more than 24 h ago, and not one expired an hour ago", async () => {
    const quote = async (expiresAt: string) => {
      const id = randomUUID();
      await q(
        `insert into core.quotes (id, departure_key_hash, arrival_key_hash, service_code, parcel_type, parcels, packaging, fragile,
           departure_zone_id, arrival_zone_id, departure_pinned, arrival_pinned, lines, total_millimes, price_list_valid_from, quoted_at, expires_at)
         values ($1, 'a', 'b', 'standard', 'small', '[]', false, false, $2, $3, true, true, '[]', 0, now(), now() - interval '3 days', $4)`,
        [id, zoneA, zoneB, expiresAt],
      );
      return id;
    };
    const recent = await quote(new Date(Date.now() - 3_600_000).toISOString());
    const old = await quote(new Date(Date.now() - 25 * 3_600_000).toISOString());
    const worker = open(db.url("fastgo_worker"));
    const del = async (id: string) =>
      (await worker.withWorker((tx) => tx.execute(sql`delete from core.quotes where id = ${id}::uuid returning id`))).rows.length;
    expect(await del(recent)).toBe(0);
    expect(await del(old)).toBe(1);
  });
});
