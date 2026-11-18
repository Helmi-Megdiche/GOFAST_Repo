import { addressPriceKey } from "@fastgo/domain";
import { describe, expect, it, vi } from "vitest";
import { Keys } from "../auth/crypto.ts";
import { ApiError } from "../http/errors.ts";
import type { Actor } from "../http/session.ts";
import type { ReadQuote, Settings } from "../pricing/pricing.service.ts";
import { type OrderCreate, type OrderOut, type OrdersPort, OrdersService, ScopeTaken, TRACKING_LIMITS } from "./orders.service.ts";

// GH-22 (PR 4b-2a): the order of the checks of createOrder, with a fake database. The real one is in orders.api.int.test.ts.

const keys = new Keys("k".repeat(40));
const NOW = new Date("2026-11-20T10:00:00.000Z");
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

const body = (over: Partial<OrderCreate> = {}): OrderCreate =>
  ({
    quote_id: "q1",
    accepted_total_millimes: 6000,
    sender: { name: "S", phone: "+21620000001", address: FROM, slot: { start_at: "2026-11-21T08:00:00Z", end_at: "2026-11-21T10:00:00Z" } },
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
  const service = new OrdersService({ port, priceAt, keys, checks: { consume } as never, limiter: limiter as never, now: () => NOW, newTrackingNumber: () => "FG-AAAA-0001" });
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

  it("a verified phone needs no proof and spends none, even if one is sent", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    await t.service.create(actor, { ...body(), phone_check_id: "11111111-1111-4111-8111-111111111111" }, { scope: null });
    expect(t.consume).not.toHaveBeenCalled();
    expect(t.inserted).toHaveLength(1);
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

  it("R202: a call whose scope already has an order answers it again, with no check and no proof spent", async () => {
    const t = build();
    (t.port.findByScope as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "o0" });
    expect(await t.service.create(actor, body(), { scope: "s" })).toEqual({ id: "o0" });
    expect(t.port.readQuote).not.toHaveBeenCalled();
    expect(t.consume).not.toHaveBeenCalled();
  });

  it("R202: a ScopeTaken from the insert answers the order of the other call; if there is none, 409", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    (t.port.insert as ReturnType<typeof vi.fn>).mockRejectedValue(new ScopeTaken());
    (t.port.findByScope as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "o9" });
    expect(await t.service.create(actor, body(), { scope: "s" })).toEqual({ id: "o9" });
    (t.port.findByScope as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await reasonOf(t.service.create(actor, body(), { scope: "s" }))).code).toBe("STATE_CONFLICT");
  });

  it("too many parcels is tooManyParcels before the quote is compared", async () => {
    const t = build({ account: { status: "active", phone: "+21620000001", phoneVerified: true } });
    const eleven = { ...body().parcel, parcels: Array.from({ length: 11 }, () => ({ weight_g: 100 })) };
    expect((await reasonOf(t.service.create(actor, { ...body(), parcel: eleven }, { scope: null }))).fields).toEqual([{ name: "parcel.parcels", reason: "tooManyParcels" }]);
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
});
