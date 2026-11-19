import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db } from "../db/index.ts";
import type { Actor } from "../http/session.ts";
import { expectDbError, seedMerchants, startTestDb, type TestDb } from "./harness.ts";

// GH-22 (PR 4b-2b): migration 0012 at the database level: the cancel columns and their CHECKs, the two settings, the definers
// (lock_order, cancel_order, confirm_order, auto_confirm_order), the caller checks, the compare-and-set, the API clock in the
// triggers, and `status` no longer updatable by the app. The HTTP behaviour is in orders.cancel.int.test.ts.

let db: TestDb;
let ids: Awaited<ReturnType<typeof seedMerchants>>;
let zoneA: string;
let zoneB: string;
const opened: Db[] = [];
const open = (role: "fastgo_app" | "fastgo_worker") => {
  const d = new Db(db.url(role), 4);
  opened.push(d);
  return d;
};
const owner = (): Actor => ({ userId: ids.userA, accountId: ids.companyA, role: "merchant" });
const stranger = (): Actor => ({ userId: ids.userB, accountId: ids.companyB, role: "merchant" });
const staffId = randomUUID();
const serviceId = randomUUID();
const staff = (role: Actor["role"] = "agent"): Actor =>
  role === "customer_service" ? { userId: serviceId, accountId: serviceId, role } : { userId: staffId, accountId: staffId, role };
const q = (text: string, values: unknown[] = []) => db.superClient.query(text, values);
const AT = "2026-12-30T10:00:00.000Z";

let seq = 0;
/** A received order of company A with two to_collect parcels, made as 4b-2a makes it. */
async function newOrder(extra: Record<string, unknown> = {}): Promise<string> {
  seq += 1;
  const id = randomUUID();
  const recipient = randomUUID();
  await q(`insert into core.recipients (id, owner_company_id, name, phone_e164) values ($1, $2, 'D', '+21620000099')`, [recipient, ids.companyA]);
  const row: Record<string, unknown> = {
    id,
    tracking_number: `FG-C${String(seq).padStart(3, "0")}-0000`,
    owner_company_id: ids.companyA,
    created_by: ids.userA,
    service: "standard",
    payment_mode: "cashPickup",
    freight_payer: "sender",
    total_millimes: 5000,
    pickup_address_id: ids.addressA,
    recipient_id: recipient,
    ...extra,
  };
  const cols = Object.keys(row);
  await q(`insert into core.orders (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => row[c]));
  await q(`insert into core.parcels (order_id, size, weight_declared_g, proof_level, position) values ($1, 'small', 800, 'codeOrPhotoWithPosition', 1), ($1, 'small', 900, 'codeOrPhotoWithPosition', 2)`, [id]);
  return id;
}
const mission = (order: string, status: string, arrived = false) =>
  q(`insert into core.missions (order_id, kind, status, arrived_at) values ($1, 'pickup', $2, ${arrived ? "now()" : "null"}) returning id`, [order, status]);
const one = async (text: string, values: unknown[] = []) => (await q(text, values)).rows[0];
const cancel = (a: Actor, order: string, status: string, fee: string, millimes: number | null, at = AT) =>
  open("fastgo_app").withActor(a, (tx) => tx.execute(sql`select core.cancel_order(${order}::uuid, ${status}, ${fee}, ${millimes}::bigint, ${at}::timestamptz)`));

beforeAll(async () => {
  db = await startTestDb();
  ids = await seedMerchants(db);
  const zones = (await q("select id from core.zones where active order by name limit 2")).rows as { id: string }[];
  zoneA = zones[0]!.id;
  zoneB = zones[1]!.id;
  void zoneA;
  void zoneB;
  await q("insert into core.accounts (id, kind, role, full_name) values ($1, 'staff', 'agent', 'Agent Test'), ($2, 'staff', 'customer_service', 'Service Test')", [staffId, serviceId]);
});
afterAll(async () => {
  await Promise.all(opened.map((d) => d.close()));
  await db?.stop();
});

describe("GH-22 R212 R504: the cancel columns, their CHECKs and the two settings", () => {
  it("the fee is one of the three, and its amount is set exactly when it applies", async () => {
    const id = await newOrder();
    const set = (cols: string) => q(`update core.orders set ${cols} where id = $1`, [id]);
    await expectDbError(set("canceled_at = now(), cancel_fee = 'free'"), /cancel_fee/i);
    await expectDbError(set("canceled_at = now(), cancel_fee = 'applies'"), /cancel_fee/i);
    await expectDbError(set("canceled_at = now(), cancel_fee = 'none', cancel_fee_millimes = 5000"), /cancel_fee/i);
    await expectDbError(set("cancel_fee = 'none'"), /cancel/i); // a fee with no date
    // The NULL hole: no date, no fee, but an amount. `null = 'applies'` is null, which a CHECK lets through.
    await expectDbError(set("canceled_at = null, cancel_fee = null, cancel_fee_millimes = 5000"), /orders_cancel_fee/i);
    await expectDbError(set("cancel_fee_millimes = 0"), /orders_cancel_fee/i);
    await set("status = 'canceled', canceled_at = now(), cancel_fee = 'applies', cancel_fee_millimes = 5000");
  });

  it("D7 D8: 5 DT and 100 DT are the settings, and a negative one is refused", async () => {
    expect(await one("select cancel_fee_millimes, auto_confirm_max_millimes from core.pricing_settings")).toEqual({ cancel_fee_millimes: "5000", auto_confirm_max_millimes: "100000" });
    await expectDbError(q("update core.pricing_settings set cancel_fee_millimes = -1"), /cancel_fee_millimes/i);
    await expectDbError(q("update core.pricing_settings set auto_confirm_max_millimes = -1"), /auto_confirm/i);
  });
});

describe("GH-22 RV-21: no login but the definers writes a status", () => {
  it("the app login cannot update `status` or the cancel columns, even as staff; it still updates the two keys", async () => {
    const id = await newOrder();
    const app = open("fastgo_app");
    for (const set of ["status = 'confirmed'", "canceled_at = now()", "cancel_fee = 'none'", "canceled_by = null"])
      await expectDbError(app.withActor(staff("admin"), (tx) => tx.execute(sql.raw(`update core.orders set ${set} where id = '${id}'`))), /permission denied/i);
    await app.withActor(staff("admin"), (tx) => tx.execute(sql.raw(`update core.orders set pickup_address_id = pickup_address_id where id = '${id}'`)));
    expect((await one("select status from core.orders where id = $1", [id])).status).toBe("received");
  });
});

describe("GH-22 RV-01 RV-21: the app login no longer writes the status of a parcel or a mission", () => {
  it("update parcels.status is refused to staff of every kind, and the other parcel columns still work", async () => {
    const id = await newOrder();
    const parcel = (await one("select id from core.parcels where order_id = $1 order by position limit 1", [id])).id as string;
    const app = open("fastgo_app");
    for (const who of [staff("admin"), staff("agent"), staff("operations"), owner()])
      await expectDbError(app.withActor(who, (tx) => tx.execute(sql.raw(`update core.parcels set status = 'canceled' where id = '${parcel}'`))), /permission denied/i);
    await app.withActor(staff("agent"), (tx) => tx.execute(sql.raw(`update core.parcels set weight_declared_g = 801 where id = '${parcel}'`)));
    expect(await one("select status, weight_declared_g from core.parcels where id = $1", [parcel])).toEqual({ status: "to_collect", weight_declared_g: 801 });
  });

  it("no policy lets the app login update a mission: staff update 0 rows, whatever they set", async () => {
    const id = await newOrder();
    await mission(id, "proposed");
    const app = open("fastgo_app");
    for (const who of [staff("admin"), staff("operations"), staff("logistics")]) {
      const r = await app.withActor(who, (tx) => tx.execute(sql.raw(`update core.missions set status = 'finished', end_reason = 'orderCanceled' where order_id = '${id}'`)));
      expect(r.rowCount, who.role).toBe(0);
    }
    expect(await one("select status, end_reason from core.missions where order_id = $1", [id])).toEqual({ status: "proposed", end_reason: null });
    expect((await q("select count(*)::int as n from pg_policies where schemaname = 'core' and tablename = 'missions' and cmd in ('UPDATE', 'ALL') and 'fastgo_app' = any (roles)")).rows[0].n).toBe(0);
  });

  it("lock_order takes the order row FOR NO KEY UPDATE: a parcel added meanwhile (a foreign-key check) does not wait for it, so lock order cannot deadlock with it", async () => {
    const id = await newOrder();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const holding = open("fastgo_app").withActor(owner(), async (tx) => {
      await tx.execute(sql`select core.lock_order(${id}::uuid) as f`);
      await gate;
    });
    await new Promise((r) => setTimeout(r, 600));
    try {
      await q("begin");
      await q("set local lock_timeout = '1500ms'");
      await q("insert into core.parcels (order_id, size, weight_declared_g, proof_level, position) values ($1, 'small', 700, 'codeOrPhotoWithPosition', 3)", [id]);
      await q("commit");
    } finally {
      await q("rollback").catch(() => undefined);
      release();
      await holding;
    }
    expect((await one("select count(*)::int as n from core.parcels where order_id = $1", [id])).n).toBe(3);
  });
});

describe("GH-22 R212 RV-05 RV-19: core.cancel_order", () => {
  it("cancels as the owner: order, parcels and the proposed pickup mission, an event each with the actor, the dates from p_at", async () => {
    const id = await newOrder();
    await mission(id, "proposed");
    const app = open("fastgo_app");
    const facts = (await app.withActor(owner(), (tx) => tx.execute(sql`select core.lock_order(${id}::uuid) as f`))).rows[0] as { f: Record<string, unknown> };
    expect(facts.f).toMatchObject({ status: "received", pickup_arrived_at: null, cancel_fee: null });
    await cancel(owner(), id, "received", "none", null);
    expect(await one("select status, cancel_fee, cancel_fee_millimes, canceled_by, canceled_at, updated_at, ended_at from core.orders where id = $1", [id])).toMatchObject({
      status: "canceled",
      cancel_fee: "none",
      cancel_fee_millimes: null,
      canceled_by: ids.userA,
      canceled_at: new Date(AT),
      updated_at: new Date(AT),
      ended_at: new Date(AT),
    });
    expect((await q("select status from core.parcels where order_id = $1", [id])).rows).toEqual([{ status: "canceled" }, { status: "canceled" }]);
    expect(await one("select status, end_reason, finished_at from core.missions where order_id = $1", [id])).toMatchObject({ status: "finished", end_reason: "orderCanceled", finished_at: new Date(AT) });
    const events = (await q("select subject_type, from_status, to_status, actor_id, occurred_at from core.status_events where order_id = $1 order by seq", [id])).rows;
    expect(events.map((e) => [e.subject_type, e.from_status, e.to_status])).toEqual([
      ["order", "received", "canceled"],
      ["parcel", "to_collect", "canceled"],
      ["parcel", "to_collect", "canceled"],
      ["mission", "proposed", "finished"],
    ]);
    expect(new Set(events.map((e) => e.actor_id))).toEqual(new Set([ids.userA]));
    expect(events.every((e) => e.occurred_at.getTime() === Date.parse(AT))).toBe(true);
  });

  it("a fee that applies carries the setting's amount; another amount, an unknown fee or a stale status writes nothing", async () => {
    const id = await newOrder({ status: "assigned" });
    await mission(id, "arrived", true);
    const before = await one("select status, updated_at from core.orders where id = $1", [id]);
    await expectDbError(cancel(owner(), id, "assigned", "applies", 4000), /fee/i);
    await expectDbError(cancel(owner(), id, "assigned", "applies", null), /fee/i);
    await expectDbError(cancel(owner(), id, "assigned", "free", null), /fee/i);
    await expectDbError(cancel(owner(), id, "confirmed", "none", null), /conflict|state/i); // the status moved: compare-and-set
    expect(await one("select status, updated_at from core.orders where id = $1", [id])).toEqual(before);
    expect((await q("select count(*)::int as n from core.status_events where order_id = $1", [id])).rows[0].n).toBe(0);
    await cancel(owner(), id, "assigned", "applies", 5000);
    expect(await one("select cancel_fee, cancel_fee_millimes from core.orders where id = $1", [id])).toEqual({ cancel_fee: "applies", cancel_fee_millimes: "5000" });
    expect((await one("select status, end_reason from core.missions where order_id = $1", [id]))).toMatchObject({ status: "finished", end_reason: "orderCanceled" });
  });

  it("RV-19 RV-20: another company's order is not found, a closed account and a role that does not move orders are refused, staff may cancel", async () => {
    const id = await newOrder();
    await expectDbError(cancel(stranger(), id, "received", "none", null), /not found/i);
    await expectDbError(cancel(staff("customer_service"), id, "received", "none", null), /not found|forbidden/i);
    await q("update core.accounts set status = 'closed', closed_at = now() where id = $1", [ids.userA]);
    await expectDbError(cancel(owner(), id, "received", "none", null), /forbidden|closed|permission/i);
    await q("update core.accounts set status = 'active', closed_at = null where id = $1", [ids.userA]);
    await cancel(staff("agent"), id, "received", "none", null);
    expect(await one("select status, canceled_by from core.orders where id = $1", [id])).toEqual({ status: "canceled", canceled_by: staffId });
  });
});

describe("GH-22 R406: the time of a change is never before the last event of the order", () => {
  const LAST = "2026-12-30T10:00:00.000Z";
  const BEFORE = "2026-12-30T09:00:00.000Z";
  const confirm = (a: Actor, id: string, at: string) => open("fastgo_app").withActor(a, (tx) => tx.execute(sql`select core.confirm_order(${id}::uuid, ${at}::timestamptz)`));
  const withEvent = async () => {
    const id = await newOrder();
    await q("insert into core.status_events (order_id, subject_type, subject_id, to_status, occurred_at) values ($1, 'order', $1, 'received', $2)", [id, LAST]);
    return id;
  };

  it("cancel_order raises a p_at before the last event to it: the events, canceled_at and updated_at all carry that instant", async () => {
    const id = await withEvent();
    await mission(id, "proposed");
    await cancel(owner(), id, "received", "none", null, BEFORE);
    const events = (await q("select subject_type, occurred_at from core.status_events where order_id = $1 order by seq", [id])).rows;
    expect(events.every((e) => e.occurred_at.getTime() === Date.parse(LAST))).toBe(true);
    expect(await one("select canceled_at, updated_at, ended_at from core.orders where id = $1", [id])).toEqual({ canceled_at: new Date(LAST), updated_at: new Date(LAST), ended_at: new Date(LAST) });
    expect((await one("select finished_at from core.missions where order_id = $1", [id])).finished_at).toEqual(new Date(LAST));
  });

  it("confirm_order does the same, and a later p_at is kept as it is", async () => {
    const id = await withEvent();
    await confirm(staff("agent"), id, BEFORE);
    expect((await one("select occurred_at from core.status_events where order_id = $1 and to_status = 'confirmed'", [id])).occurred_at).toEqual(new Date(LAST));
    const other = await withEvent();
    await confirm(staff("agent"), other, "2026-12-30T11:00:00.000Z");
    expect((await one("select occurred_at from core.status_events where order_id = $1 and to_status = 'confirmed'", [other])).occurred_at).toEqual(new Date("2026-12-30T11:00:00.000Z"));
  });
});

describe("GH-22 R209 R212: core.confirm_order and core.auto_confirm_order", () => {
  const confirm = (a: Actor, id: string, at = AT) => open("fastgo_app").withActor(a, (tx) => tx.execute(sql`select core.confirm_order(${id}::uuid, ${at}::timestamptz)`));
  const auto = (a: Actor, id: string, at = AT) => open("fastgo_app").withActor(a, (tx) => tx.execute(sql`select core.auto_confirm_order(${id}::uuid, ${at}::timestamptz)`));

  it("an agent confirms a received order once, with an event and the actor; a customer cannot; a canceled order is a state conflict", async () => {
    const id = await newOrder();
    await expectDbError(confirm(owner(), id), /not found|forbidden/i);
    await confirm(staff("agent"), id);
    expect(await one("select status, updated_at from core.orders where id = $1", [id])).toMatchObject({ status: "confirmed", updated_at: new Date(AT) });
    expect((await one("select from_status, to_status, actor_id from core.status_events where order_id = $1", [id]))).toEqual({ from_status: "received", to_status: "confirmed", actor_id: staffId });
    await expectDbError(confirm(staff("agent"), id), /conflict|state/i);
    const canceled = await newOrder();
    await cancel(owner(), canceled, "received", "none", null);
    await expectDbError(confirm(staff("operations"), canceled), /conflict|state/i);
  });

  it("the auto path is the creator's only, writes an event with no actor at the later of p_at and created_at, and does nothing twice", async () => {
    const id = await newOrder();
    await expectDbError(auto(stranger(), id), /not found/i);
    await expectDbError(auto(staff("agent"), id), /not found/i);
    await auto(owner(), id, "2020-01-01T00:00:00.000Z"); // a p_at before created_at: the event is not before the order
    const e = await one("select from_status, to_status, actor_id, occurred_at from core.status_events where order_id = $1", [id]);
    const created = (await one("select created_at from core.orders where id = $1", [id])).created_at as Date;
    expect(e).toMatchObject({ from_status: "received", to_status: "confirmed", actor_id: null });
    expect((e.occurred_at as Date).getTime()).toBe(created.getTime());
    await expectDbError(auto(owner(), id), /conflict|state/i);
  });

  it("a cancel and a confirm racing on one received order: exactly one wins, one event set", async () => {
    const id = await newOrder();
    const results = await Promise.allSettled([confirm(staff("agent"), id), cancel(owner(), id, "received", "none", null)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const status = (await one("select status from core.orders where id = $1", [id])).status as string;
    expect(["confirmed", "canceled"]).toContain(status);
    const events = (await q("select subject_type, to_status from core.status_events where order_id = $1 and subject_type = 'order'", [id])).rows;
    expect(events).toEqual([{ subject_type: "order", to_status: status }]);
  });
});

describe("GH-22 R406: the API clock in the triggers, for the order writer only", () => {
  it("another login cannot backdate updated_at with the setting", async () => {
    const id = await newOrder();
    const app = open("fastgo_app");
    await app.withActor(staff("admin"), async (tx) => {
      await tx.execute(sql`select set_config('app.at', '2001-01-01T00:00:00Z', true)`);
      await tx.execute(sql.raw(`update core.orders set pickup_address_id = pickup_address_id where id = '${id}'`));
    });
    expect((await one("select updated_at from core.orders where id = $1", [id])).updated_at.getTime()).toBeGreaterThan(Date.parse("2020-01-01"));
  });
});

describe("GH-22: the definers belong to the order writer, and only the app calls them", () => {
  it("lock_order, cancel_order, confirm_order and auto_confirm_order: owner fastgo_order_writer, execute for the app, not for PUBLIC or the worker", async () => {
    const r = await q(`select p.proname, pg_get_userbyid(p.proowner) as owner, has_function_privilege('fastgo_app', p.oid, 'execute') as app,
                              has_function_privilege('fastgo_worker', p.oid, 'execute') as worker, has_function_privilege('public', p.oid, 'execute') as pub
                         from pg_proc p where p.pronamespace = 'core'::regnamespace
                          and p.proname in ('lock_order', 'cancel_order', 'confirm_order', 'auto_confirm_order', 'assert_order_actor') order by 1`);
    expect(r.rows).toEqual([
      { proname: "assert_order_actor", owner: "fastgo_order_writer", app: false, worker: false, pub: false },
      { proname: "auto_confirm_order", owner: "fastgo_order_writer", app: true, worker: false, pub: false },
      { proname: "cancel_order", owner: "fastgo_order_writer", app: true, worker: false, pub: false },
      { proname: "confirm_order", owner: "fastgo_order_writer", app: true, worker: false, pub: false },
      { proname: "lock_order", owner: "fastgo_order_writer", app: true, worker: false, pub: false },
    ]);
  });
});
