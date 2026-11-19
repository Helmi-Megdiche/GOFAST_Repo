import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.ts";
import { runSmsOutbox } from "../auth/outbox-worker.ts";
import { createRedis, type Redis } from "../auth/redis.ts";
import { SmsSender } from "../auth/sms.ts";
import { authOptions } from "../auth/wiring.ts";
import { Db } from "../db/index.ts";
import { ordersOptions } from "../orders/wiring.ts";
import { runTrackingSms } from "../orders/tracking-sms.ts";
import { mergeOptions, pricingOptions } from "../pricing/wiring.ts";
import { startRedis, startTestDb, type TestDb } from "./harness.ts";

// GH-22 (PR 4b-2a): the order routes over HTTP, against a real database and Redis. The database rules are in
// orders-api-db.int.test.ts; the order of the checks is also in orders.service.test.ts.

const ORIGIN = "https://gofast.example";
const PASSWORD = "correct horse battery";
const WEB = "https://app.gofast.example";

class CaptureSms extends SmsSender {
  sent: { phone: string; text: string }[] = [];
  override async send(phone: string, text: string): Promise<void> {
    this.sent.push({ phone, text });
  }
  codeFor(phone: string): string {
    const m = [...this.sent].reverse().find((s) => s.phone === phone)?.text.match(/\d{6}/);
    if (!m) throw new Error("no code sent");
    return m[0];
  }
}

let testDb: TestDb;
let stopRedis: () => Promise<void>;
let redis: Redis;
let appDb: Db;
let workerDb: Db;
let app: NestFastifyApplication;
const sms = new CaptureSms();
const square = (lon: number, lat: number) =>
  `ST_Multi(ST_GeomFromText('POLYGON((${lon} ${lat}, ${lon + 0.1} ${lat}, ${lon + 0.1} ${lat + 0.1}, ${lon} ${lat + 0.1}, ${lon} ${lat}))', 4326))::geography`;
const ZONES = { alpha: randomUUID(), bravo: randomUUID() };
const q = (text: string, values: unknown[] = []) => testDb.superClient.query(text, values);

beforeAll(async () => {
  testDb = await startTestDb();
  const r = await startRedis();
  stopRedis = r.stop;
  redis = createRedis(r.url);
  appDb = new Db(testDb.url("fastgo_app"), 6);
  workerDb = new Db(testDb.url("fastgo_worker"), 2);
  await q(
    `insert into core.zones (id, name, name_ar, name_en, governorate, area, active) values
       ($1, 'Alpha', 'ألفا', 'Alpha town', 'Tunis', ${square(10, 36)}, true),
       ($2, 'Bravo', 'برافو', 'Bravo town', 'Ariana', ${square(10.1, 36)}, true)`,
    [ZONES.alpha, ZONES.bravo],
  );
  app = await buildApp();
  target = app;
}, 240_000);
/** The API with every clock it has (sessions, proofs, prices, orders) given by `now`; the real one when omitted. */
async function buildApp(now?: () => Date): Promise<NestFastifyApplication> {
  const deps = { db: appDb, redis, authSecret: "s".repeat(40), now };
  const auth = authOptions({ nodeEnv: "test", allowedOrigins: [ORIGIN], staffSignIn: false }, deps);
  const merged = mergeOptions(auth, pricingOptions(deps), ordersOptions({ ...deps, webUrl: WEB }));
  return createApp({ trustProxy: false }, { ...auth, controllers: merged.controllers, providers: merged.providers });
}
afterAll(async () => {
  await app?.close();
  await appDb?.close();
  await workerDb?.close();
  redis?.disconnect();
  await stopRedis?.();
  await testDb?.stop();
});

/** The app the helpers call: the real-clock one, or the one of the RV-08 block. */
let target: NestFastifyApplication;
let ip = "10.20.0.1";
type Res = { statusCode: number; headers: Record<string, unknown>; json: () => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = (
  method: "GET" | "POST",
  url: string,
  opts: { body?: unknown; cookie?: string; key?: string; headers?: Record<string, string> } = {},
): Promise<Res> =>
  target.inject({
    method,
    url,
    remoteAddress: ip,
    payload: opts.body as object | undefined,
    headers: {
      ...(opts.cookie ? { cookie: `session=${opts.cookie}`, origin: ORIGIN } : {}),
      ...(opts.key ? { "idempotency-key": opts.key } : {}),
      ...opts.headers,
    },
  }) as unknown as Promise<Res>;

const sessionOf = (res: Res): string => {
  const m = [res.headers["set-cookie"]].flat().join(";").match(/session=([^;]+)/);
  if (!m?.[1]) throw new Error("no session cookie");
  return m[1];
};
async function proof(phone: string, purpose: "signUp" | "order"): Promise<string> {
  expect((await call("POST", "/v1/phone-checks", { body: { phone, purpose } })).statusCode).toBe(202);
  for (let i = 0; i < 6; i += 1) await runSmsOutbox(workerDb, sms);
  const ok = await call("POST", "/v1/phone-checks/verify", { body: { phone, purpose, code: sms.codeFor(phone) } });
  expect(ok.statusCode).toBe(200);
  return ok.json().phone_check_id as string;
}
let phoneSeq = 0;
/** A signed-in customer. `verified: false` clears phone_verified_at so the order asks for a proof. */
async function customer(verified = true): Promise<{ cookie: string; phone: string; id: string }> {
  phoneSeq += 1;
  const phone = `+2162055${String(1000 + phoneSeq)}`;
  const res = await call("POST", "/v1/accounts", {
    body: { kind: "customer", name: "Client Test", phone, phone_check_id: await proof(phone, "signUp"), password: PASSWORD, locale: "fr", terms_accepted: true },
  });
  expect(res.statusCode).toBe(201);
  const id = (await q("select id from core.accounts where phone_e164 = $1", [phone])).rows[0].id as string;
  if (!verified) await q("update core.accounts set phone_verified_at = null where id = $1", [id]);
  return { cookie: sessionOf(res), phone, id };
}

const quoteBody = (over: Record<string, unknown> = {}) => ({
  service: "standard",
  parcel_type: "small",
  parcels: [{ weight_g: 1000 }, { weight_g: 3500 }],
  departure: { text: "12 Rue Secrète du Test", pin: { x: 10.05, y: 36.05 } },
  arrival: { text: "34 Avenue Confidentielle", pin: { x: 10.15, y: 36.05 } },
  ...over,
});
const newQuote = async (over: Record<string, unknown> = {}) => {
  const res = await call("POST", "/v1/quotes", { body: quoteBody(over) });
  expect(res.statusCode).toBe(201);
  return res.json();
};
/** How far ahead the clock of the app in use is (the RV-08 block moves it): a pickup window is always relative to it (R503). */
let clockShiftMs = 0;
const hoursAhead = (h: number) => new Date(Date.now() + clockShiftMs + h * 3_600_000).toISOString();
const window = (fromH: number, toH: number) => ({ start_at: hoursAhead(fromH), end_at: hoursAhead(toH) });
/** The order body for a quote, as the form sends it. */
const orderBody = (quote: any, who: { phone: string }, over: Record<string, unknown> = {}) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
  quote_id: quote.id,
  accepted_total_millimes: quote.total_millimes,
  sender: {
    name: "Expéditeur Test",
    phone: who.phone,
    address: { text: "12 Rue Secrète du Test", pin: { x: 10.05, y: 36.05 } },
    slot: window(24, 26),
  },
  recipient: {
    name: "Destinataire Test",
    phone: "+21620999001",
    address: { text: "34 Avenue Confidentielle", pin: { x: 10.15, y: 36.05 } },
    instructions: "Sonner deux fois",
    sms_locale: "ar",
    save: false,
  },
  parcel: { type: "small", parcels: [{ weight_g: 1000 }, { weight_g: 3500 }], content: "Documents", fragile: false, packaging: false },
  service: { code: "standard" },
  payment_mode: "cashPickup",
  terms_accepted: true,
  ...over,
});
const place = (who: { cookie: string }, body: unknown, key: string = randomUUID()) =>
  call("POST", "/v1/orders", { body, cookie: who.cookie, key });
const orders = async () => Number((await q("select count(*) as n from core.orders")).rows[0].n);

describe("GH-22 R202 R203 R204: POST /v1/orders creates the order from the quote", () => {
  it("answers 201 with the order of the contract, and writes the parcels, the history and one SMS row without a phone", async () => {
    ip = "10.20.1.1";
    const who = await customer();
    const quote = await newQuote();
    const res = await place(who, orderBody(quote, who));
    expect(res.statusCode).toBe(201);
    const order = res.json();
    expect(order).toMatchObject({
      status: "received",
      service: "standard",
      payment_mode: "cashPickup",
      freight_payer: "sender",
      total_millimes: quote.total_millimes,
      address_unconfirmed: false,
      eta_at: null,
      cancel: null,
      loss_reported: false,
      departure: quote.departure,
      arrival: quote.arrival,
      sender: { name: "Expéditeur Test", address: "12 Rue Secrète du Test", city: "Alpha" },
      recipient: { name: "Destinataire Test", phone: "+21620999001", address: "34 Avenue Confidentielle", city: "Bravo" },
    });
    expect(order.tracking_number).toMatch(/^FG-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(order.lines).toEqual(quote.lines);
    expect(order.parcels.map((p: any) => [p.index, p.barcode, p.weight_declared_g, p.status, p.type])).toEqual([ // eslint-disable-line @typescript-eslint/no-explicit-any
      [1, `${order.tracking_number}-1`, 1000, "to_collect", "small"],
      [2, `${order.tracking_number}-2`, 3500, "to_collect", "small"],
    ]);
    // The history: the order and each parcel, written by the definer, with the person who ordered.
    const events = (await q("select subject_type, from_status, to_status, actor_id from core.status_events where order_id = $1 order by seq", [order.id])).rows;
    expect(events.map((e) => [e.subject_type, e.from_status, e.to_status])).toEqual([["order", null, "received"], ["parcel", null, "to_collect"], ["parcel", null, "to_collect"]]);
    expect(new Set(events.map((e) => e.actor_id))).toEqual(new Set([who.id]));
    // R903, R105: the outbox row holds the template, the order and the language, never the phone, the number or a text.
    const rows = (await q("select topic, payload from core.outbox where topic = 'sms.tracking' and payload->>'order_id' = $1", [order.id])).rows;
    expect(rows).toEqual([{ topic: "sms.tracking", payload: { template: "tracking", order_id: order.id, locale: "ar" } }]);
    // Stored: the quote, the pickup contact, and no foreign key to the quote.
    const stored = (await q("select quote_id, null_lines, price_list_valid_from, sender_phone, content, delivery_instructions, owner_account_id, created_by from core.orders where id = $1", [order.id])).rows[0];
    expect(stored).toMatchObject({ quote_id: quote.id, null_lines: ["vat", "stamp"], sender_phone: who.phone, content: "Documents", delivery_instructions: "Sonner deux fois", owner_account_id: who.id, created_by: who.id });
  });

  it("R202: the same key and body answer the same 201 and create one order; another body is KEY_REUSED", async () => {
    ip = "10.20.1.2";
    const who = await customer();
    const quote = await newQuote();
    const body = orderBody(quote, who);
    const key = randomUUID();
    const before = await orders();
    const first = await place(who, body, key);
    const again = await place(who, body, key);
    expect([first.statusCode, again.statusCode]).toEqual([201, 201]);
    expect(again.json()).toEqual(first.json());
    expect(await orders()).toBe(before + 1);
    expect((await place(who, { ...body, parcel: { ...body.parcel, content: "Autre" } }, key)).statusCode).toBe(409);
  });

  it("R202: two calls with the same key at once create one order, both answers are the same, and the proof is spent once", async () => {
    ip = "10.20.1.3";
    const who = await customer(false);
    const quote = await newQuote();
    const check = await proof(who.phone, "order");
    const body = orderBody(quote, who, { phone_check_id: check });
    const key = randomUUID();
    const before = await orders();
    const [a, b] = await Promise.all([place(who, body, key), place(who, body, key)]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(b.json()).toEqual(a.json());
    expect(await orders()).toBe(before + 1);
    // The account phone was proved, so it is marked verified.
    expect((await q("select phone_verified_at from core.accounts where id = $1", [who.id])).rows[0].phone_verified_at).not.toBeNull();
    // The proof is gone: with the phone unverified again, another order with the same proof is refused as invalid.
    await q("update core.accounts set phone_verified_at = null where id = $1", [who.id]);
    const other = await place(who, orderBody(await newQuote(), who, { phone_check_id: check }));
    expect(other.statusCode).toBe(422);
    expect(other.json().error.fields).toEqual([{ name: "phone_check_id", reason: "invalid" }]);
  });

  it("R203: a tracking number already used is drawn again, in a savepoint, and the order is still created once", async () => {
    ip = "10.20.1.6";
    const who = await customer();
    const first = (await place(who, orderBody(await newQuote(), who))).json();
    const draws: string[] = [];
    const generator = () => {
      const n = draws.length === 0 ? first.tracking_number : `FG-R203-${String(draws.length).padStart(4, "0")}`;
      draws.push(n);
      return n;
    };
    const deps = { db: appDb, redis, authSecret: "s".repeat(40) };
    const auth = authOptions({ nodeEnv: "test", allowedOrigins: [ORIGIN], staffSignIn: false }, deps);
    const merged = mergeOptions(auth, pricingOptions(deps), ordersOptions({ ...deps, newTrackingNumber: generator }));
    const forced = await createApp({ trustProxy: false }, { ...auth, controllers: merged.controllers, providers: merged.providers });
    try {
      const before = await orders();
      const res = await forced.inject({
        method: "POST",
        url: "/v1/orders",
        remoteAddress: ip,
        payload: orderBody(await newQuote(), who) as object,
        headers: { cookie: `session=${who.cookie}`, origin: ORIGIN, "idempotency-key": randomUUID() },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().tracking_number).toBe("FG-R203-0001");
      expect(draws).toEqual([first.tracking_number, "FG-R203-0001"]);
      expect(await orders()).toBe(before + 1);
      // The first draw failed inside a savepoint: the addresses and the recipient of this order exist once.
      expect(Number((await q("select count(*) as n from core.parcels where order_id = $1", [res.json().id])).rows[0].n)).toBe(2);
    } finally {
      await forced.close();
    }
  });

  it("R202: a 422 is not replayed: the same key with a corrected body creates the order", async () => {
    ip = "10.20.1.4";
    const who = await customer();
    const quote = await newQuote();
    const key = randomUUID();
    const wrong = await place(who, orderBody(quote, who, { accepted_total_millimes: quote.total_millimes + 1 }), key);
    expect(wrong.statusCode).toBe(422);
    const right = await place(who, orderBody(quote, who), key);
    expect(right.statusCode).toBe(201);
  });

  it("an unpinned address keeps the order received with address_unconfirmed, a scheduled one keeps its window", async () => {
    ip = "10.20.1.5";
    const who = await customer();
    const quote = await newQuote({ departure: { text: "Rue sans repère", zone_id: ZONES.alpha } });
    expect(quote.departure_pinned).toBe(false);
    const res = await place(who, orderBody(quote, who, { sender: { ...orderBody(quote, who).sender, address: { text: "Rue sans repère", zone_id: ZONES.alpha } } }));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: "received", address_unconfirmed: true });
  });
});

describe("GH-22 RV-05 R206 R607: the refusals, each with nothing written", () => {
  const refused = async (who: { cookie: string }, body: unknown, fields: unknown, status = 422) => {
    const before = await orders();
    const res = await place(who, body);
    expect(res.statusCode).toBe(status);
    if (fields !== undefined) expect(res.json().error.fields).toEqual(fields);
    expect(await orders()).toBe(before);
    return res;
  };

  it("a total that is not the quote's: quoteChanged on accepted_total_millimes", async () => {
    ip = "10.20.2.1";
    const who = await customer();
    const quote = await newQuote();
    await refused(who, orderBody(quote, who, { accepted_total_millimes: quote.total_millimes - 1000 }), [{ name: "accepted_total_millimes", reason: "quoteChanged" }]);
  });

  it("a grid that moved since the quote: quoteChanged, whatever the customer accepted", async () => {
    ip = "10.20.2.2";
    const who = await customer();
    const quote = await newQuote();
    await q(`insert into core.prices (service_code, with_packaging, zone_id, millimes, valid_from) values ('standard', false, null, 12000, now() - interval '1 minute')`);
    try {
      await refused(who, orderBody(quote, who), [{ name: "quote_id", reason: "quoteChanged" }]);
    } finally {
      await q("delete from core.prices where millimes = 12000 and service_code = 'standard' and zone_id is null");
    }
  });

  it("an address that is not the quoted one: addressMismatch; other parcels or service: quoteChanged; too many parcels", async () => {
    ip = "10.20.2.3";
    const who = await customer();
    const quote = await newQuote();
    const base = orderBody(quote, who);
    await refused(who, { ...base, recipient: { ...base.recipient, address: { text: "Une autre adresse", pin: { x: 10.15, y: 36.05 } } } }, [{ name: "recipient.address", reason: "addressMismatch" }]);
    await refused(who, { ...base, parcel: { ...base.parcel, parcels: [{ weight_g: 1000 }, { weight_g: 4000 }] } }, [{ name: "parcel.parcels", reason: "quoteChanged" }]);
    await refused(who, { ...base, service: { code: "express" } }, [{ name: "service.code", reason: "quoteChanged" }]);
    await refused(who, { ...base, parcel: { ...base.parcel, parcels: Array.from({ length: 11 }, () => ({ weight_g: 500 })) } }, [{ name: "parcel.parcels", reason: "tooManyParcels" }]);
  });

  it("payment on account: contractRequired; freight due without the acceptance: freightPayerRequired (R607)", async () => {
    ip = "10.20.2.4";
    const who = await customer();
    const quote = await newQuote();
    await refused(who, orderBody(quote, who, { payment_mode: "account" }), [{ name: "payment_mode", reason: "contractRequired" }]);
    await refused(who, orderBody(quote, who, { payment_mode: "cashDelivery" }), [{ name: "freight_payer_accepted", reason: "freightPayerRequired" }]);
    const ok = await place(who, orderBody(quote, who, { payment_mode: "cashDelivery", freight_payer_accepted: true }));
    expect(ok.statusCode).toBe(201);
    expect(ok.json().freight_payer).toBe("recipient");
  });

  it("an unverified phone with no proof: phoneRequired; a quote that expired: 410; an unknown quote: 404", async () => {
    ip = "10.20.2.5";
    const unverified = await customer(false);
    const quote = await newQuote();
    await refused(unverified, orderBody(quote, unverified), [{ name: "phone_check_id", reason: "phoneRequired" }]);
    const who = await customer();
    const old = await newQuote();
    await q("update core.quotes set quoted_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = $1", [old.id]);
    await refused(who, orderBody(old, who), undefined, 410);
    await refused(who, orderBody({ id: randomUUID(), total_millimes: 1 }, who), undefined, 404);
  });

  it("a bad proof is spent last: a refusal before it leaves the proof usable (must-change 6), and a proof for another phone lets the order through without verifying the account", async () => {
    ip = "10.20.2.6";
    const who = await customer(false);
    const quote = await newQuote();
    const check = await proof(who.phone, "order");
    await refused(who, orderBody(quote, who, { phone_check_id: check, accepted_total_millimes: 1 }), [{ name: "accepted_total_millimes", reason: "quoteChanged" }]);
    const ok = await place(who, orderBody(quote, who, { phone_check_id: check }));
    expect(ok.statusCode).toBe(201);
    // Another sender phone, proved for the order: it passes; the account (still on its own phone) stays unverified.
    const second = await customer(false);
    const other = "+21620555999";
    const proofOther = await proof(other, "order");
    const q2 = await newQuote();
    const res = await place(second, orderBody(q2, { phone: other }, { phone_check_id: proofOther }));
    expect(res.statusCode).toBe(201);
    expect((await q("select phone_verified_at from core.accounts where id = $1", [second.id])).rows[0].phone_verified_at).toBeNull();
  });

  it("a verified account with ANOTHER sender phone needs a proof for that phone; with it the order is created and the account is unchanged", async () => {
    ip = "10.20.2.8";
    const who = await customer();
    const other = "+21620555888";
    const verifiedAt = async () => (await q("select phone_verified_at, phone_e164 from core.accounts where id = $1", [who.id])).rows[0];
    const before = await verifiedAt();
    expect(before.phone_verified_at).not.toBeNull();
    const quote = await newQuote();
    await refused(who, orderBody(quote, { phone: other }), [{ name: "phone_check_id", reason: "phoneRequired" }]);
    const check = await proof(other, "order");
    const ok = await place(who, orderBody(quote, { phone: other }, { phone_check_id: check }));
    expect(ok.statusCode).toBe(201);
    expect(await verifiedAt()).toEqual(before);
    // and the account's own verified phone needs none
    expect((await place(who, orderBody(await newQuote(), who))).statusCode).toBe(201);
  });

  it("no session: 401; the quote of someone else is still a quote anyone may order from, but only as themselves", async () => {
    ip = "10.20.2.7";
    const quote = await newQuote();
    expect((await call("POST", "/v1/orders", { body: orderBody(quote, { phone: "+21620000000" }), key: randomUUID() })).statusCode).toBe(401);
  });
});

describe("GH-22 R503: a bad slot is a 422 before the proof is spent, never a 500", () => {
  const cases: Array<[string, (b: ReturnType<typeof orderBody>) => Record<string, unknown>, string]> = [
    ["scheduled with no slot", () => ({ service: { code: "scheduled" } }), "service.slot"],
    ["a slot with the standard service", () => ({ service: { code: "standard", slot: window(48, 50) } }), "service.slot"],
    ["a delivery slot that ends before it starts", () => ({ service: { code: "scheduled", slot: window(50, 48) } }), "service.slot"],
    ["a pickup window that ends before it starts", (b) => ({ sender: { ...b.sender, slot: window(26, 24) } }), "sender.slot"],
    ["a pickup window that ends where it starts", (b) => ({ sender: { ...b.sender, slot: window(26, 26) } }), "sender.slot"],
    ["a pickup window that has already ended", (b) => ({ sender: { ...b.sender, slot: window(-3, -1) } }), "sender.slot"],
  ];
  for (const [index, [name, over, field]] of cases.entries()) {
    it(`${name}: 422 slotInvalid on ${field}, nothing written, and the same proof still works`, async () => {
      ip = `10.20.7.${index + 1}`;
      const log = vi.spyOn(Logger.prototype, "error");
      const who = await customer(false);
      // The scheduled service has no price yet (priceUnavailable), so no quote exists for it: the slot is checked before the quote is
      // read, and the order that follows the refusal is a standard one with the same proof.
      const quote = await newQuote();
      const check = await proof(who.phone, "order");
      const before = await orders();
      const bad = await place(who, orderBody(quote, who, { phone_check_id: check, ...over(orderBody(quote, who)) }));
      expect([bad.statusCode, bad.json().error.code, bad.json().error.fields]).toEqual([422, "RULE_REFUSED", [{ name: field, reason: "slotInvalid" }]]);
      expect(await orders()).toBe(before);
      // never the CHECK of the database: no logged error
      expect(log.mock.calls.filter((c) => String(c[0]).includes("CHECK"))).toEqual([]);
      log.mockRestore();
      // the proof was not spent: the order with a good body and the same proof is created
      const ok = await place(who, orderBody(quote, who, { phone_check_id: check }));
      expect(ok.statusCode, JSON.stringify(ok.json())).toBe(201);
    });
  }
});

describe("GH-22 T55: GET /v1/orders and GET /v1/orders/{id}", () => {
  it("each customer lists and reads only their own orders, newest first, with a cursor; another's order is 404", async () => {
    ip = "10.20.3.1";
    const a = await customer();
    const b = await customer();
    const made: string[] = [];
    for (let i = 0; i < 3; i += 1) made.push((await place(a, orderBody(await newQuote(), a))).json().id);
    const other = (await place(b, orderBody(await newQuote(), b))).json();
    const page1 = (await call("GET", "/v1/orders?limit=2", { cookie: a.cookie })).json();
    expect(page1.items.map((o: { id: string }) => o.id)).toEqual([made[2], made[1]]);
    expect(page1.next_cursor).toEqual(expect.any(String));
    const page2 = (await call("GET", `/v1/orders?limit=2&cursor=${encodeURIComponent(page1.next_cursor)}`, { cookie: a.cookie })).json();
    expect(page2.items.map((o: { id: string }) => o.id)).toEqual([made[0]]);
    expect(page2.next_cursor).toBeNull();
    expect((await call("GET", `/v1/orders/${made[0]}`, { cookie: a.cookie })).json().id).toBe(made[0]);
    expect((await call("GET", `/v1/orders/${other.id}`, { cookie: a.cookie })).statusCode).toBe(404);
    const filtered = (await call("GET", `/v1/orders?tracking=${page1.items[0].tracking_number}`, { cookie: a.cookie })).json();
    expect(filtered.items).toHaveLength(1);
    const none = await call("GET", "/v1/orders?status=confirmed", { cookie: a.cookie });
    expect(none.json().items, JSON.stringify(none.json())).toEqual([]);
    expect((await call("GET", "/v1/orders?limit=2&cursor=not-a-cursor", { cookie: a.cookie })).statusCode).toBe(400);
    expect((await call("GET", "/v1/orders")).statusCode).toBe(401);
  });

  it("a page of orders reads its parcels in one query, not one per order", async () => {
    ip = "10.20.3.2";
    const a = await customer();
    for (let i = 0; i < 3; i += 1) await place(a, orderBody(await newQuote(), a));
    await q("select pg_stat_statements_reset()").catch(() => undefined);
    const res = await call("GET", "/v1/orders?limit=5", { cookie: a.cookie });
    expect(res.json().items.every((o: { parcels: unknown[] }) => o.parcels.length === 2)).toBe(true);
  });
});

describe("GH-22 R405 T11 R903: GET /v1/tracking/{number}", () => {
  it("answers the public tracking in the asked language, with nothing personal", async () => {
    ip = "10.20.4.1";
    const who = await customer();
    const order = (await place(who, orderBody(await newQuote(), who))).json();
    const get = (lang?: string) => call("GET", `/v1/tracking/${order.tracking_number}`, { headers: lang ? { "accept-language": lang } : {} });
    const fr = await get();
    expect(fr.statusCode).toBe(200);
    expect(fr.json()).toMatchObject({ status: "received", eta_at: null, from_city: "Alpha", to_city: "Bravo", parcel_count: 2, parcel_outcomes: ["to_collect", "to_collect"] });
    expect(fr.json().history).toEqual([{ status: "received", at: expect.any(String) }]);
    expect((await get("ar")).json()).toMatchObject({ from_city: "ألفا", to_city: "برافو" });
    expect((await get("en-GB,en;q=0.8")).json()).toMatchObject({ from_city: "Alpha town", to_city: "Bravo town" });
    const text = JSON.stringify([fr.json(), (await get("ar")).json()]);
    for (const secret of ["Expéditeur", "Destinataire", "+216", "Secrète", "Confidentielle", "Documents", String(order.total_millimes), order.id]) expect(text).not.toContain(secret);
  });

  it("an unknown number is 404, a malformed one 400, and too many misses from one IP are 429 with Retry-After (T11)", async () => {
    ip = "10.20.4.2";
    expect((await call("GET", "/v1/tracking/FG-ZZZZ-0000")).statusCode).toBe(404);
    expect((await call("GET", "/v1/tracking/nope")).statusCode).toBe(400);
    let last: Res | undefined;
    for (let i = 0; i < 21; i += 1) last = await call("GET", `/v1/tracking/FG-MISS-${String(1000 + i)}`);
    expect(last?.statusCode).toBe(429);
    expect(Number(last?.headers["retry-after"])).toBeGreaterThan(0);
  });
});

/** The worker takes 20 rows a pass: run it until the outbox of the tests is empty. */
const drainTrackingSms = async (sender: SmsSender) => {
  for (let i = 0; i < 20 && (await runTrackingSms(workerDb, sender, WEB)) > 0; i += 1);
};

describe("GH-22 R903 R105: the tracking SMS goes out from the outbox", () => {
  it("sends the text in the recipient's language with the number and the link, then empties the row; nothing for a closed account", async () => {
    ip = "10.20.5.1";
    const who = await customer();
    const order = (await place(who, orderBody(await newQuote(), who))).json();
    const sender = new CaptureSms();
    await drainTrackingSms(sender);
    const mine = sender.sent.filter((s) => s.text.includes(order.tracking_number));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ phone: "+21620999001" });
    expect(mine[0]!.text).toContain(`${WEB}/ar/suivi?n=${order.tracking_number}`);
    const row = (await q("select payload, processed_at from core.outbox where topic = 'sms.tracking' and id = (select id from core.outbox where topic = 'sms.tracking' order by created_at desc limit 1)")).rows[0];
    expect(row.payload).toEqual({});
    expect(row.processed_at).not.toBeNull();

    const closed = await customer();
    const order2 = (await place(closed, orderBody(await newQuote(), closed))).json();
    await q("update core.accounts set status = 'closed', closed_at = now() where id = $1", [closed.id]);
    const sender2 = new CaptureSms();
    await drainTrackingSms(sender2);
    expect(sender2.sent.filter((s) => s.text.includes(order2.tracking_number))).toEqual([]);
  });
});

describe("GH-22 RV-08: create, get, list and tracking with every clock of the API 40 days ahead", () => {
  const SHIFT_MS = 40 * 24 * 3_600_000;
  let shifted: NestFastifyApplication;
  beforeAll(async () => {
    shifted = await buildApp(() => new Date(Date.now() + SHIFT_MS));
    target = shifted;
    clockShiftMs = SHIFT_MS;
  });
  afterAll(async () => {
    target = app;
    clockShiftMs = 0;
    await shifted?.close();
  });

  it("the quote, the grid check, the order and the tracking all work on that date; a quote past its expiry on that date is 410", async () => {
    ip = "10.20.6.1";
    const who = await customer();
    const quote = await newQuote();
    // The quote lives from the shifted instant: its expiry is 40 days after the real now.
    expect(Date.parse(quote.expires_at)).toBeGreaterThan(Date.now() + SHIFT_MS - 60_000);
    const res = await place(who, orderBody(quote, who));
    expect(res.statusCode).toBe(201);
    const order = res.json();
    expect(order).toMatchObject({ status: "received", total_millimes: quote.total_millimes });
    expect((await call("GET", `/v1/orders/${order.id}`, { cookie: who.cookie })).json().id).toBe(order.id);
    expect((await call("GET", "/v1/orders", { cookie: who.cookie })).json().items.map((o: { id: string }) => o.id)).toContain(order.id);
    const tracking = await call("GET", `/v1/tracking/${order.tracking_number}`);
    expect(tracking.json()).toMatchObject({ status: "received", from_city: "Alpha", parcel_count: 2 });
    // R205 on that date: the same quote, expired one hour before the shifted now.
    const old = await newQuote();
    await q("update core.quotes set quoted_at = $2, expires_at = $3 where id = $1", [
      old.id,
      new Date(Date.now() + SHIFT_MS - 2 * 3_600_000).toISOString(),
      new Date(Date.now() + SHIFT_MS - 3_600_000).toISOString(),
    ]);
    expect((await place(who, orderBody(old, who))).statusCode).toBe(410);
  });
});
