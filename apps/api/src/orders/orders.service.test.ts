import { addressPriceKey } from "@fastgo/domain";
import { describe, expect, it, vi } from "vitest";
import { Keys } from "../auth/crypto.ts";
import { ApiError } from "../http/errors.ts";
import type { Actor } from "../http/session.ts";
import type { ReadQuote, Settings } from "../pricing/pricing.service.ts";
import { bodyHashOf, type CancelDecision, fieldsWithNul, type LockedOrder, type OrderCreate, type OrderOut, type OrdersPort, OrdersService, ScopeTaken, TRACKING_LIMITS } from "./orders.service.ts";

// GH-22 (PR 4b-2a): the order of the checks of createOrder, with a fake database. The real one is in orders.api.int.test.ts.

const keys = new Keys("k".repeat(40));
// RV-08: `pnpm test` runs this suite twice, the second time with the system date 40 days ahead (src/test-setup.ts, as in packages/domain).
// The service reads the real clock here (no injected `now`), and every date of the fixtures is built from it: a date written as a
// literal (a quote that expires on 2026-11-25, a slot on 2026-11-21) is expired, or in the past, in the shifted run, and the run fails.
const NOW = new Date();
const actor: Actor = { accountId: "acc", userId: "acc", role: "individual" };
const settings = { maxParcels: 10 } as Settings;
const mac = (text: string, pin: { x: number; y: number } | null) => keys.mac("quote-address", addressPriceKey({ text, pin }));
const FROM = { text: "12 rue A", landmark: "", pin: { x: 10.05, y: 36.05 } };
const TO = { text: "34 rue B", landmark: "", pin: { x: 10.15, y: 36.05 } };

const quote = (over: Partial<ReadQuote> = {}): ReadQuote =>
  ({
    id: "q1",
    departureKeyHash: mac(FROM.text, FROM.pin),
    arrivalKeyHash: mac(TO.text, TO.pin),
    service: "standard",
    parcelType: "small",
    parcels: [{ weight_g: 1000 }],
    packaging: false,
    fragile: false,
    declaredValueMillimes: null,
    departureZoneId: "z1",
    arrivalZoneId: "z2",
    departurePinned: true,
    arrivalPinned: true,
    lines: [
      { kind: "base", unit_millimes: 6000, count: 1, millimes: 6000 },
      { kind: "vat", unit_millimes: null, count: 1, millimes: null },
    ],
    totalMillimes: 6000,
    priceListValidFrom: new Date("2026-11-06T00:00:00.000Z"),
    quotedAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 600_000),
    departureZoneName: "Alpha",
    arrivalZoneName: "Bravo",
    ...over,
  }) as ReadQuote;

const win = (fromH: number, toH: number) => ({ start_at: new Date(NOW.getTime() + fromH * 3_600_000).toISOString(), end_at: new Date(NOW.getTime() + toH * 3_600_000).toISOString() });

const body = (over: Partial<OrderCreate> = {}): OrderCreate =>
  ({
    quote_id: "q1",
    accepted_total_millimes: 6000,
    sender: { name: "S", phone: "+21620000001", address: FROM, slot: win(22, 24) },
    recipient: { name: "R", phone: "+21620000002", address: TO },
    parcel: { type: "small", parcels: [{ weight_g: 1000 }], content: "Documents" },
    service: { code: "standard" },
    payment_mode: "cashPickup",
    terms_accepted: true,
    ...over,
  }) as OrderCreate;

function build(opts: { account?: { status: string; phone: string | null; phoneVerified: boolean } | null; q?: ReadQuote | null; priced?: { totalMillimes: number; priceListValidFrom: Date }; proofOk?: boolean } = {}) {
  const inserted: unknown[] = [];
  const port: OrdersPort = {
    findByScope: vi.fn(async () => null),
    readQuote: vi.fn(async () => (opts.q === undefined ? quote() : opts.q)),
    readAccount: vi.fn(async () => (opts.account === undefined ? { status: "active", phone: "+21620000001", phoneVerified: false } : opts.account)),
    settings: vi.fn(async () => settings),
    insert: vi.fn(async (plan) => {
      inserted.push(plan);
      return { id: "o1" } as OrderOut;
    }),
    list: vi.fn(),
    get: vi.fn(),
    tracking: vi.fn(async () => null),
    cancel: vi.fn(),
    confirm: vi.fn(),
  };
  const consume = vi.fn(async () => opts.proofOk ?? true);
  const counts = new Map<string, number>();
  const limiter = {
    hit: vi.fn(async (k: string, limit: number) => {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return { allowed: (counts.get(k) ?? 0) <= limit, count: counts.get(k) ?? 0, retryAfterMs: 1000 };
    }),
    peek: vi.fn(async (k: string) => ({ count: counts.get(k) ?? 0, retryAfterMs: 1000 })),
  };
  const priceAt = vi.fn(async () => ({
    lines: [],
    totalMillimes: opts.priced?.totalMillimes ?? 6000,
    priceListValidFrom: opts.priced?.priceListValidFrom ?? new Date("2026-11-06T00:00:00.000Z"),
  }));
  const service = new OrdersService({ port, priceAt, keys, checks: { consume } as never, limiter: limiter as never, newTrackingNumber: () => "FG-AAAA-0001" });
  return { service, port, consume, priceAt, inserted, limiter };
}

const reasonOf = async (p: Promise<unknown>) => {
  const e = (await p.catch((x) => x)) as ApiError;
  expect(e).toBeInstanceOf(ApiError);
  return { code: e.code, fields: e.fields };
};

describe("GH-22 RV-05 R202: createOrder spends the phone proof last, once", () => {
  it("a refusal of any kind before the proof leaves it unspent and writes nothing", async () => {
    const cases: Array<[string, Partial<OrderCreate>, Parameters<typeof build>[0]]> = [
      ["accepted total", { accepted_total_millimes: 5999 }, {}],
      ["address", { recipient: { ...body().recipient, address: { text: "ailleurs", landmark: "", pin: TO.pin } } }, {}],
      ["service", { service: { code: "express" } }, {}],
      ["account payment", { payment_mode: "account" }, {}],
      ["freight due without acceptance", { payment_mode: "cashDelivery" }, {}],
      ["grid moved", {}, { priced: { totalMillimes: 7000, priceListValidFrom: new Date("2026-11-06T00:00:00.000Z") } }],
      ["grid date moved", {}, { priced: { totalMillimes: 6000, priceListValidFrom: new Date("2026-11-19T00:00:00.000Z") } }],
      ["closed account", {}, { account: { status: "closed", phone: "+21620000001", phoneVerified: false } }],
    ];
    for (const [name, over, opts] of cases) {
      const t = build(opts);
      await expect(t.service.create(actor, { ...body(over), phone_check_id: "11111111-1111-4111-8111-111111111111" }, { scope: null }), name).rejects.toBeInstanceOf(ApiError);
      expect(t.consume, name).not.toHaveBeenCalled();
      expect(t.inserted, name).toEqual([]);
    }
  });

  it("an expired quote is 410 and an unknown one 404, before anything else", async () => {
    const old = build({ q: quote({ expiresAt: new Date(NOW.getTime() - 1) }) });
    expect((await reasonOf(old.service.create(actor, body(), { scope: null }))).code).toBe("QUOTE_EXPIRED");
    const none = build({ q: null });
    expect((await reasonOf(none.service.create(actor, body(), { scope: null }))).code).toBe("NOT_FOUND");
    expect(old.priceAt).not.toHaveBeenCalled();
  });

  it("an unverified phone with no proof is phoneRequired; with a proof the proof is consumed once, for the sender phone, and the order is inserted", async () => {
    const t = build();
    expect((await reasonOf(t.service.create(actor, body(), { scope: null }))).fields).toEqual([{ name: "phone_check_id", reason: "phoneRequired" }]);
    await t.service.create(actor, { ...body(), phone_check_id: "11111111-1111-4111-8111-111111111111" }, { scope: "s" });
    expect(t.consume).toHaveBeenCalledTimes(1);
    expect(t.consume).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "+21620000001", "order");
    expect(t.inserted).toHaveLength(1);
    expect(t.inserted[0]).toMatchObject({ markPhoneVerified: true, freightPayer: "sender", addressUnconfirmed: false, nullLines: ["vat"] });
  });

  it("a proof for another sender phone lets the order through and marks no account verified", async () => {
    const t = build();
    const other = { ...body().sender, phone: "+21620000009" };
    await t.service.create(actor, { ...body(), sender: other, phone_check_id: "11111111-1111-4111-8111-111111111111" }, { scope: null });
    expect(t.inserted[0]).toMatchObject({ markPhoneVerified: false });
  });

  it("(a) a verified account, the sender is the account phone, no proof: the order is created and no proof is spent", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    await t.service.create(actor, body(), { scope: null });
    expect(t.consume).not.toHaveBeenCalled();
    expect(t.inserted).toHaveLength(1);
    // a proof sent for the account's own verified phone is not needed either, so it is not spent
    await t.service.create(actor, { ...body(), phone_check_id: "11111111-1111-4111-8111-111111111111" }, { scope: null });
    expect(t.consume).not.toHaveBeenCalled();
  });

  it("(b) a verified account, another sender phone, no proof: phoneRequired, nothing written (the contract: while THAT phone is not verified)", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    const other = { ...body().sender, phone: "+21620000009" };
    expect((await reasonOf(t.service.create(actor, { ...body(), sender: other }, { scope: null }))).fields).toEqual([
      { name: "phone_check_id", reason: "phoneRequired" },
    ]);
    expect(t.inserted).toEqual([]);
  });

  it("(c) a verified account, another sender phone, a valid proof for it: created, the proof spent for that phone, the account is not touched", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    const other = { ...body().sender, phone: "+21620000009" };
    await t.service.create(actor, { ...body(), sender: other, phone_check_id: "11111111-1111-4111-8111-111111111111" }, { scope: null });
    expect(t.consume).toHaveBeenCalledTimes(1);
    expect(t.consume).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "+21620000009", "order");
    expect(t.inserted[0]).toMatchObject({ markPhoneVerified: false });
  });

  it("a spent or wrong proof is invalid on phone_check_id and nothing is written", async () => {
    const t = build({ proofOk: false });
    expect((await reasonOf(t.service.create(actor, { ...body(), phone_check_id: "11111111-1111-4111-8111-111111111111" }, { scope: null }))).fields).toEqual([
      { name: "phone_check_id", reason: "invalid" },
    ]);
    expect(t.inserted).toEqual([]);
  });

  it("freight due, accepted, makes the recipient the freight payer; an unpinned address is flagged", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true }, q: quote({ arrivalPinned: false }) });
    await t.service.create(actor, { ...body(), payment_mode: "cashDelivery", freight_payer_accepted: true }, { scope: null });
    expect(t.inserted[0]).toMatchObject({ freightPayer: "recipient", addressUnconfirmed: true });
  });

  const hashOf = (b: OrderCreate) => bodyHashOf(keys, b);
  const found = (b: OrderCreate, id = "o0") => ({ order: { id } as OrderOut, bodyHash: hashOf(b) });

  it("R202: a call whose scope already has the order of the same body answers it again, with no check and no proof spent", async () => {
    const t = build();
    (t.port.findByScope as ReturnType<typeof vi.fn>).mockResolvedValueOnce(found(body()));
    expect(await t.service.create(actor, body(), { scope: "s" })).toEqual({ id: "o0" });
    expect(t.port.readQuote).not.toHaveBeenCalled();
    expect(t.consume).not.toHaveBeenCalled();
  });

  it("R202: the order of the scope was made from ANOTHER body (its key expired, the scope is not freed yet): never answered, KEY_REUSED, nothing written, no proof spent", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    const other = body({ parcel: { ...body().parcel, content: "Autre contenu" } });
    (t.port.findByScope as ReturnType<typeof vi.fn>).mockResolvedValue(found(other));
    expect((await reasonOf(t.service.create(actor, body(), { scope: "s" }))).code).toBe("KEY_REUSED");
    expect(t.consume).not.toHaveBeenCalled();
    expect(t.port.readQuote).not.toHaveBeenCalled();
    expect(t.inserted).toEqual([]);
  });

  it("R202: a ScopeTaken from the insert answers the order of the other call when it is the same body; if there is none, 409", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    (t.port.insert as ReturnType<typeof vi.fn>).mockRejectedValue(new ScopeTaken());
    (t.port.findByScope as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null).mockResolvedValueOnce(found(body(), "o9"));
    expect(await t.service.create(actor, body(), { scope: "s" })).toEqual({ id: "o9" });
    (t.port.findByScope as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await reasonOf(t.service.create(actor, body(), { scope: "s" }))).code).toBe("STATE_CONFLICT");
  });

  it("R202: the plan carries the print of the body, which does not depend on the order of the keys", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    await t.service.create(actor, body(), { scope: "s" });
    expect(t.inserted[0]).toMatchObject({ bodyHash: hashOf(body()) });
    const b = body();
    expect(hashOf({ ...b, recipient: Object.fromEntries(Object.entries(b.recipient).reverse()) as OrderCreate["recipient"] })).toBe(hashOf(b));
    expect(hashOf({ ...b, parcel: { ...b.parcel, content: "x" } })).not.toBe(hashOf(b));
  });

  it("too many parcels is tooManyParcels before the quote is compared", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    const eleven = { ...body().parcel, parcels: Array.from({ length: 11 }, () => ({ weight_g: 100 })) };
    expect((await reasonOf(t.service.create(actor, { ...body(), parcel: eleven }, { scope: null }))).fields).toEqual([{ name: "parcel.parcels", reason: "tooManyParcels" }]);
  });
});

describe("GH-22 RV-22: text the database cannot hold, and dates it cannot read, are 400 before anything", () => {
  it("fieldsWithNul names each text field with a NUL character, and only those", () => {
    const b = body();
    expect(fieldsWithNul(b)).toEqual([]);
    const bad = { ...b, sender: { ...b.sender, name: "a\u0000" }, parcel: { ...b.parcel, content: "\u0000" }, recipient: { ...b.recipient, instructions: "x\u0000y" } } as OrderCreate;
    expect(fieldsWithNul(bad).map((f) => f.name)).toEqual(["sender.name", "recipient.instructions", "parcel.content"]);
  });
  it("create refuses it with 400 VALIDATION_FAILED, no proof spent, nothing written", async () => {
    const t = build();
    const res = await reasonOf(t.service.create(actor, { ...body({ sender: { ...body().sender, name: "a\u0000b" } }), phone_check_id: "11111111-1111-4111-8111-111111111111" }, { scope: null }));
    expect(res).toEqual({ code: "VALIDATION_FAILED", fields: [{ name: "sender.name", reason: "invalid" }] });
    expect(t.consume).not.toHaveBeenCalled();
    expect(t.inserted).toEqual([]);
  });
  it("list refuses a from or to the database cannot read (year 0000, a day that does not exist) with 400, before any query", async () => {
    const t = build();
    for (const q of [{ from: "0000-01-01" }, { to: "0000-12-31" }, { from: "2026-02-30" }]) {
      const res = await reasonOf(t.service.list(actor, { limit: 10, ...q }));
      expect(res.code).toBe("VALIDATION_FAILED");
      expect(res.fields[0]?.name).toBe(Object.keys(q)[0]);
    }
    expect(t.port.list).not.toHaveBeenCalled();
  });
});

describe("GH-22 R503 R504: the slots are checked before the proof is spent and before any write", () => {
  const PROOF = "11111111-1111-4111-8111-111111111111";
  const cases: Array<[string, Partial<OrderCreate>, string]> = [
    ["scheduled with no slot", { service: { code: "scheduled" } }, "service.slot"],
    ["a slot with the standard service", { service: { code: "standard", slot: win(48, 50) } }, "service.slot"],
    ["a delivery slot that ends before it starts", { service: { code: "scheduled", slot: win(50, 48) } }, "service.slot"],
    ["a pickup window that ends before it starts", { sender: { ...body().sender, slot: win(26, 24) } }, "sender.slot"],
    ["a pickup window that ends where it starts", { sender: { ...body().sender, slot: win(26, 26) } }, "sender.slot"],
    ["a pickup window that has already ended", { sender: { ...body().sender, slot: win(-3, -1) } }, "sender.slot"],
  ];
  for (const [name, over, field] of cases) {
    it(`${name}: 422 slotInvalid on ${field}, no proof spent, nothing written`, async () => {
      // scheduled needs the quote to be of that service: the slots are checked first, so the quote is never compared
      const t = build();
      const res = await reasonOf(t.service.create(actor, { ...body(over), phone_check_id: PROOF }, { scope: null }));
      expect(res).toEqual({ code: "RULE_REFUSED", fields: [{ name: field, reason: "slotInvalid" }] });
      expect(t.consume).not.toHaveBeenCalled();
      expect(t.inserted).toEqual([]);
    });
  }
  it("a scheduled order with a good slot goes through the slot check", async () => {
    const t = build({ q: quote({ service: "scheduled" }), account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    await t.service.create(actor, body({ service: { code: "scheduled", slot: win(48, 50) } }), { scope: null });
    expect(t.inserted).toHaveLength(1);
  });
});

describe("GH-22 T11 R405: the public tracking limits", () => {
  it("counts a miss only when the number does not exist, and refuses every call of the IP after the limit", async () => {
    const t = build();
    for (let i = 0; i < TRACKING_LIMITS.misses.limit; i += 1)
      expect((await reasonOf(t.service.tracking("FG-NOPE-0000", "fr", { ip: "1.1.1.1" }))).code).toBe("NOT_FOUND");
    const blocked = await reasonOf(t.service.tracking("FG-NOPE-0000", "fr", { ip: "1.1.1.1" }));
    expect(blocked.code).toBe("TOO_MANY_ATTEMPTS");
    // another IP is not affected; a found number does not count as a miss
    (t.port.tracking as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "received" });
    expect(await t.service.tracking("FG-OKOK-0000", "fr", { ip: "2.2.2.2" })).toEqual({ status: "received" });
  });

  it("the 121st call of an IP in a minute is 429 with a wait, found numbers included; another IP is not affected", async () => {
    const t = build();
    (t.port.tracking as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "received" });
    for (let i = 0; i < TRACKING_LIMITS.perIp.limit; i += 1) await t.service.tracking("FG-OKOK-0000", "fr", { ip: "3.3.3.3" });
    const blocked = (await t.service.tracking("FG-OKOK-0000", "fr", { ip: "3.3.3.3" }).catch((e) => e)) as ApiError;
    expect([blocked.code, blocked.status, blocked.retryAfterSeconds]).toEqual(["TOO_MANY_ATTEMPTS", 429, 1]);
    expect(await t.service.tracking("FG-OKOK-0000", "fr", { ip: "4.4.4.4" })).toEqual({ status: "received" });
  });

  it("a malformed number (refused by the guard before the route) is counted in the 120 a minute and as a miss", async () => {
    const t = build();
    // 19 malformed numbers are 19 misses: one more miss is allowed, the next call is refused
    for (let i = 0; i < TRACKING_LIMITS.misses.limit - 1; i += 1) await t.service.malformedTracking({ ip: "5.5.5.5" });
    expect(t.limiter.hit).toHaveBeenCalledWith(expect.stringMatching(/^rl:tracking:/), 120, 60_000);
    expect((await reasonOf(t.service.tracking("FG-NOPE-0000", "fr", { ip: "5.5.5.5" }))).code).toBe("NOT_FOUND"); // the 20th miss
    expect((await reasonOf(t.service.tracking("FG-NOPE-0000", "fr", { ip: "5.5.5.5" }))).code).toBe("TOO_MANY_ATTEMPTS");
    // and the other way round: past the limit, a malformed number is a 429 too, not a 400
    expect((await reasonOf(t.service.malformedTracking({ ip: "5.5.5.5" }))).code).toBe("TOO_MANY_ATTEMPTS");
    // another IP is not affected
    await expect(t.service.malformedTracking({ ip: "6.6.6.6" })).resolves.toBeUndefined();
  });
});

// ---- GH-22 PR 4b-2b: cancel, confirm, auto-confirm ----------------------------------------------------------------------------

const facts = (over: Partial<LockedOrder> = {}): LockedOrder => ({
  status: "received",
  totalMillimes: 6000,
  addressUnconfirmed: false,
  lines: [{ kind: "base", millimes: 6000 }, { kind: "vat", millimes: null }],
  pickupArrivedAt: null,
  cancelFee: null,
  cancelFeeMillimes: null,
  canceledAt: null,
  settings: { cancelFeeMillimes: 5000, autoConfirmMaxMillimes: 100_000 },
  ...over,
});
const staffActor: Actor = { accountId: "st", userId: "st", role: "agent" };

/** Runs `cancel` with a port whose lock returns `f`; gives what the service decided, or the refusal. */
async function decideCancel(f: LockedOrder, accepted: "none" | "applies" | "backOfficeDecides", who: Actor = actor) {
  const t = build();
  let decision: CancelDecision | undefined;
  (t.port.cancel as ReturnType<typeof vi.fn>).mockImplementation(async (_a: Actor, _id: string, decide: (x: LockedOrder) => CancelDecision) => {
    decision = decide(f);
    return { status: "canceled", fee: decision.kind === "replay" ? decision.fee : decision.fee };
  });
  const res = await t.service.cancel(who, "o1", { accepted_fee: accepted }).then((r) => ({ ok: r })).catch((e) => ({ err: e as ApiError }));
  return { res, decision };
}

describe("GH-22 R212 RV-05: cancelOrder decides from the domain rule, under the lock", () => {
  const arrived = "2026-11-20T09:00:00.000Z";
  it.each([
    ["received", null, "none", null],
    ["confirmed", null, "none", null],
    ["assigned", null, "none", null],
    ["assigned", arrived, "applies", 5000],
    ["pickup_failed", null, "backOfficeDecides", null],
  ] as const)("a customer who accepts the fee of %s (arrived %s) cancels with %s", async (status, at, fee, amount) => {
    const { res, decision } = await decideCancel(facts({ status, pickupArrivedAt: at }), fee);
    expect(res).toHaveProperty("ok");
    expect(decision).toEqual({ kind: "cancel", expectedStatus: status, fee, feeMillimes: amount });
  });

  it("a customer who accepts another fee gets feeRequired, even a fee that became free (Q4)", async () => {
    for (const [f, accepted] of [
      [facts({ status: "assigned", pickupArrivedAt: "2026-11-20T09:00:00.000Z" }), "none"],
      [facts({ status: "received" }), "applies"],
      [facts({ status: "pickup_failed" }), "applies"],
    ] as const) {
      const { res } = await decideCancel(f, accepted);
      expect((res as { err: ApiError }).err.code).toBe("RULE_REFUSED");
      expect((res as { err: ApiError }).err.fields).toEqual([{ name: "accepted_fee", reason: "feeRequired" }]);
    }
  });

  it("from the pickup on it is claimOnly, in a final state notCancellable (409, field status)", async () => {
    for (const [status, reason] of [["picked_up", "claimOnly"], ["in_transit", "claimOnly"], ["delivered", "notCancellable"], ["lost", "notCancellable"], ["returned", "notCancellable"]] as const) {
      const { res } = await decideCancel(facts({ status }), "none");
      expect((res as { err: ApiError }).err.code).toBe("STATE_CONFLICT");
      expect((res as { err: ApiError }).err.fields).toEqual([{ name: "status", reason }]);
    }
  });

  it("R202 replay by state: a canceled order answers its STORED fee, whatever accepted_fee says, and writes nothing", async () => {
    const { res, decision } = await decideCancel(facts({ status: "canceled", cancelFee: "applies", cancelFeeMillimes: 5000, canceledAt: "2026-11-20T09:30:00.000Z" }), "none");
    expect(decision).toEqual({ kind: "replay", fee: "applies" });
    expect(res).toEqual({ ok: { status: "canceled", fee: "applies" } });
  });

  it("Q10: staff cancel free by default, may record the fee that applies on purpose, nothing else", async () => {
    const arrivedFacts = facts({ status: "assigned", pickupArrivedAt: "2026-11-20T09:00:00.000Z" });
    expect((await decideCancel(arrivedFacts, "none", staffActor)).decision).toEqual({ kind: "cancel", expectedStatus: "assigned", fee: "none", feeMillimes: null });
    expect((await decideCancel(arrivedFacts, "applies", staffActor)).decision).toEqual({ kind: "cancel", expectedStatus: "assigned", fee: "applies", feeMillimes: 5000 });
    expect(((await decideCancel(arrivedFacts, "backOfficeDecides", staffActor)).res as { err: ApiError }).err.fields).toEqual([{ name: "accepted_fee", reason: "feeRequired" }]);
    // a free order: the only fee a staff member can record is none
    expect(((await decideCancel(facts(), "applies", staffActor)).res as { err: ApiError }).err.code).toBe("RULE_REFUSED");
  });
});

describe("GH-22 R209: confirmOrder", () => {
  async function decideConfirm(f: LockedOrder) {
    const t = build();
    let decision: string | undefined;
    (t.port.confirm as ReturnType<typeof vi.fn>).mockImplementation(async (_a: Actor, _id: string, decide: (x: LockedOrder) => string) => {
      decision = decide(f);
      return { id: "o1", status: decision === "replay" ? "confirmed" : "confirmed" };
    });
    const res = await t.service.confirm(staffActor, "o1").then((r) => ({ ok: r })).catch((e) => ({ err: e as ApiError }));
    return { res, decision };
  }
  it("a received order is confirmed; a confirmed one answers 200 with no new event; any other state is 409 notWaitingForConfirmation", async () => {
    expect((await decideConfirm(facts({ status: "received" }))).decision).toBe("confirm");
    expect((await decideConfirm(facts({ status: "confirmed" }))).decision).toBe("replay");
    for (const status of ["canceled", "assigned", "delivered", "pickup_failed"] as const) {
      const { res } = await decideConfirm(facts({ status }));
      expect((res as { err: ApiError }).err.code).toBe("STATE_CONFLICT");
      expect((res as { err: ApiError }).err.fields).toEqual([{ name: "status", reason: "notWaitingForConfirmation" }]);
    }
  });
});

describe("GH-22 R209 Q1: createOrder gives the insert a way to auto-confirm, decided by the domain rule", () => {
  async function autoDecision(f: LockedOrder, phoneVerified: boolean) {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified } });
    await t.service.create(actor, { ...body(), ...(phoneVerified ? {} : { phone_check_id: "11111111-1111-4111-8111-111111111111" }) }, { scope: null });
    return (t.inserted[0] as { autoConfirm: (x: LockedOrder) => boolean }).autoConfirm(f);
  }
  it("confirms a verified customer under the cap with pinned addresses", async () => {
    expect(await autoDecision(facts(), true)).toBe(true);
  });
  it("R209: an account that was NOT verified before this order stays received, even with a valid proof for its own phone (the rule reads phone_verified_at as it was)", async () => {
    expect(await autoDecision(facts(), false)).toBe(false);
  });
  it("stays received over the cap, with an unconfirmed address, or with a null line other than vat and stamp", async () => {
    expect(await autoDecision(facts({ totalMillimes: 100_001 }), true)).toBe(false);
    expect(await autoDecision(facts({ addressUnconfirmed: true }), true)).toBe(false);
    expect(await autoDecision(facts({ lines: [{ kind: "base", millimes: null }] }), true)).toBe(false);
    expect(await autoDecision(facts({ lines: [{ kind: "vat", millimes: null }, { kind: "stamp", millimes: null }] }), true)).toBe(true);
  });
  it("an unverified account with a proof for ANOTHER sender phone: not confirmed either", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: false } });
    await t.service.create(actor, { ...body(), sender: { ...body().sender, phone: "+21620000009" }, phone_check_id: "11111111-1111-4111-8111-111111111111" }, { scope: null });
    expect((t.inserted[0] as { autoConfirm: (x: LockedOrder) => boolean }).autoConfirm(facts())).toBe(false);
  });
});
