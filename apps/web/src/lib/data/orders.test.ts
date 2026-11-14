import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { CODE_VERIFIED_WINDOW_MS, isValidTrackingCode } from "@fastgo/domain";
import { makeQuote, availableSlots } from "@/lib/order/example-data";
import type { OrderDraft } from "../order/draft";
import { priceInputOf } from "../order/steps";
import { buildOrderRequest, type OrderRequest } from "../order/request";
import { readyDraft as readyTestDraft } from "../order/test-draft";
import { readJson, useMemoryStorage, writeJson } from "../storage";
import { createAccount, returnBalanceMillimes, sessionFor } from "./accounts";
import { savedRecipients } from "./address-book";
import { signIn } from "./auth";
import { FIXTURE_ACCOUNTS, FIXTURE_PASSWORD, FIXTURE_TEAM_MEMBERS } from "./fixtures/accounts";
import { FOUND_TRACKING_CODE } from "./fixtures/tracking";
import { FAIL_NEXT_ORDER_REQUEST_KEY, FAIL_NEXT_ORDER_RESPONSE_KEY, readTable } from "./mock-db";
import {
  ACCOUNT_ORDERS,
  DELIVERY_CODES,
  OUTBOX,
  PARCELS,
  RECIPIENT_LINKS,
  STATUS_EVENTS,
  type AccountOrder,
  type DeliveryCode,
  type Parcel,
  type StatusEvent,
} from "./order-model";
import type { OutboxMessage } from "./outbox";
import {
  createOrder,
  findOrderByKey,
  getOrderConfirmation,
  getOrderSlip,
  NetworkError,
  uniqueTrackingCode,
} from "./orders";
import { mockCodeFor, sendCode, verifyCode } from "./otp";
import { setSession, signOut } from "./session";
import { lookupTracking } from "./tracking";

const T0 = Date.parse("2026-11-04T08:30:00Z"); // 09:30 in Tunis
let clock = T0;
const PHONE = "+216 20 000 000";

const readyDraft = (): OrderDraft => readyTestDraft(T0);

const request = (draft = readyDraft(), terms = true): OrderRequest =>
  buildOrderRequest(draft, terms)!;

async function verifyPhone() {
  await sendCode({ channel: "sms", value: PHONE }, "order");
  // The phone is verified "now": a verification counts only for CODE_VERIFIED_WINDOW_MS.
  const target = { channel: "sms", value: PHONE } as const;
  await verifyCode(target, mockCodeFor(target, "order")!, "order");
}

beforeEach(() => {
  useMemoryStorage();
  clock = T0;
  setClock(() => clock);
});

describe("createOrder: idempotency (R202)", () => {
  it("a double click with the same key creates one order", async () => {
    await verifyPhone();
    const req = request();
    const [first, second] = await Promise.all([
      createOrder(req, "key-1"),
      createOrder(req, "key-1"),
    ]);
    expect(first.status).toBe("created");
    expect(second).toMatchObject({ status: "created" });
    if (first.status !== "created" || second.status !== "created") throw new Error();
    expect(second.code).toBe(first.code);
  });

  it("a resend after a lost answer returns the same order", async () => {
    await verifyPhone();
    writeJson(FAIL_NEXT_ORDER_RESPONSE_KEY, true);
    const draft = readyDraft();
    await expect(createOrder(request(draft), "key-2")).rejects.toBeInstanceOf(NetworkError);
    const created = await findOrderByKey("key-2");
    expect(created).not.toBeNull();
    // the page reloads: the draft (and its key) are read again, same payload, same key
    const reloaded = JSON.parse(JSON.stringify(draft)) as OrderDraft;
    const retry = await createOrder(request(reloaded), "key-2");
    expect(retry).toEqual({ status: "created", code: created, replay: true });
    expect(readJson(FAIL_NEXT_ORDER_RESPONSE_KEY)).toBeNull();
  });

  it("the same key with a different payload is a conflict, not a second order", async () => {
    await verifyPhone();
    const first = readyDraft();
    await createOrder(request(first), "key-3");
    const other = structuredClone(first);
    other.parcel.content = "Livres";
    expect(await createOrder(request(other), "key-3")).toEqual({
      status: "refused",
      error: "idempotencyConflict",
    });
  });

  it("no order exists for a key that was never used", async () => {
    expect(await findOrderByKey("never")).toBeNull();
  });
});

describe("createOrder: checks at creation", () => {
  it("refuses before the phone is verified (R102)", async () => {
    expect(await createOrder(request(), "k")).toEqual({
      status: "refused",
      error: "phoneNotVerified",
    });
  });

  it("refuses once CODE_VERIFIED_WINDOW_MS has passed since the code was verified (I1)", async () => {
    await verifyPhone();
    clock = T0 + CODE_VERIFIED_WINDOW_MS - 1;
    expect((await createOrder(request(), "k-in")).status).toBe("created");
    useMemoryStorage();
    clock = T0;
    await verifyPhone();
    clock = T0 + CODE_VERIFIED_WINDOW_MS;
    expect(await createOrder(request(), "k-late")).toEqual({
      status: "refused",
      error: "phoneNotVerified",
    });
  });

  it("accepts a signed-in customer whose account phone is the draft phone", async () => {
    const created = createAccount({ kind: "customer", name: "Yasmine K.", phone: PHONE });
    if (created.status !== "created") throw new Error();
    setSession(sessionFor(created.account));
    expect((await createOrder(request(), "k")).status).toBe("created");
  });

  it("refuses an expired quote, or one that no longer matches the parcel (R205)", async () => {
    clock = T0 + 15 * 60_000;
    await verifyPhone();
    expect(await createOrder(request(), "k1")).toEqual({
      status: "refused",
      error: "quoteExpired",
    });
    clock = T0;
    const changed = readyDraft();
    changed.parcel.weightKg = "5";
    expect(await createOrder(request(changed), "k2")).toEqual({
      status: "refused",
      error: "quoteExpired",
    });
  });

  it("refuses a recalculated quote the customer did not accept", async () => {
    await verifyPhone();
    const draft = readyDraft();
    draft.quote = makeQuote(draft.quote!.input, T0);
    expect(await createOrder(request(draft), "k")).toEqual({
      status: "refused",
      error: "quoteNotAccepted",
    });
  });

  it("refuses an out-of-zone address (R201)", async () => {
    await verifyPhone();
    const draft = readyDraft();
    draft.recipient.address.zone = { status: "out-of-zone" };
    expect(await createOrder(request(draft), "k")).toEqual({
      status: "refused",
      error: "outOfZone",
    });
  });

  it("refuses 'Compte client' unless a merchant with a validated contract is signed in (R104)", async () => {
    await verifyPhone();
    const draft = { ...readyDraft(), payment: "account" as const };
    expect(await createOrder(request(draft), "k1")).toEqual({
      status: "refused",
      error: "paymentNotAllowed",
    });
    setSession(sessionFor({ ...FIXTURE_ACCOUNTS[2]!, google: false }));
    expect(await createOrder(request(draft), "k2")).toEqual({
      status: "refused",
      error: "paymentNotAllowed",
    });
    setSession(sessionFor({ ...FIXTURE_ACCOUNTS[1]!, google: false }));
    expect((await createOrder(request(draft), "k3")).status).toBe("created");
    signOut();
  });

  it("refuses a pickup slot that has started", async () => {
    const draft = readyDraft();
    clock = Date.parse(draft.sender.slot!.startUtc);
    await verifyPhone();
    draft.quote = makeQuote(draft.quote!.input, clock);
    draft.acceptedQuoteId = draft.quote.id;
    expect(await createOrder(request(draft), "k")).toEqual({
      status: "refused",
      error: "slotPast",
    });
  });

  it("refuses a scheduled delivery slot that has started", async () => {
    await verifyPhone();
    const draft = readyDraft();
    const slots = availableSlots(T0);
    draft.sender.slot = slots[slots.length - 1]!; // the pickup slot is still ahead
    draft.service = { code: "scheduled", slot: slots[0]! };
    draft.quote = makeQuote({ ...draft.quote!.input, service: "scheduled" }, T0);
    draft.acceptedQuoteId = draft.quote.id;
    expect((await createOrder(request(structuredClone(draft)), "k1")).status).toBe("created");
    clock = Date.parse(slots[0]!.startUtc);
    await verifyPhone();
    draft.quote = makeQuote(draft.quote.input, clock);
    draft.acceptedQuoteId = draft.quote.id;
    expect(await createOrder(request(draft), "k2")).toEqual({
      status: "refused",
      error: "slotPast",
    });
  });

  it("refuses a service the departure or the arrival zone does not offer (CMD-04)", async () => {
    await verifyPhone();
    const two = {
      status: "in-zone" as const,
      services: ["express" as const, "standard" as const],
      zone: "A",
    };
    const slots = availableSlots(T0);
    for (const side of ["sender", "recipient"] as const) {
      const draft = readyDraft();
      draft.sender.slot = slots[slots.length - 1]!;
      draft.service = { code: "scheduled", slot: slots[0]! };
      draft[side].address.zone = two;
      draft.quote = makeQuote({ ...draft.quote!.input, service: "scheduled" }, T0);
      draft.acceptedQuoteId = draft.quote.id;
      expect(await createOrder(request(draft), `k-${side}`)).toEqual({
        status: "refused",
        error: "serviceUnavailable",
      });
    }
  });

  it("refuses without the CGV box", async () => {
    await verifyPhone();
    expect(await createOrder(request(readyDraft(), false), "k")).toEqual({
      status: "refused",
      error: "termsRequired",
    });
  });
});

describe("tracking numbers (R203)", () => {
  it("are FG-XXXX-XXXX, random and never reused, fixtures included", async () => {
    await verifyPhone();
    const first = await createOrder(request(), "a");
    if (first.status !== "created") throw new Error();
    expect(isValidTrackingCode(first.code)).toBe(true);

    // An RNG that first gives the fixture code, then the code just issued, then a new one.
    const toBytes = (code: string) =>
      Uint8Array.from(
        [...code.replace(/^FG-|-/g, "")].map((c) =>
          "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".indexOf(c),
        ),
      );
    const sequence = [toBytes(FOUND_TRACKING_CODE), toBytes(first.code), toBytes("FG-ZZZZ-9999")];
    let call = 0;
    const code = uniqueTrackingCode(() => {
      const bytes = new Uint8Array(16);
      bytes.set(sequence[Math.min(call, 2)]!);
      call += 1;
      return bytes;
    });
    expect(code).toBe("FG-ZZZZ-9999");
    expect(call).toBe(3);
  });

  it("1 000 generated codes are all distinct", () => {
    const codes = new Set(Array.from({ length: 1000 }, () => uniqueTrackingCode()));
    expect(codes.size).toBe(1000);
  });
});

describe("after the order", () => {
  it("W16 finds the order and its slip; an unknown or invalid number finds nothing", async () => {
    await verifyPhone();
    const created = await createOrder(request(), "w16");
    if (created.status !== "created") throw new Error();
    expect(await getOrderConfirmation(created.code)).toMatchObject({ recipientName: "Amel B." });
    expect(await getOrderSlip(created.code)).toEqual({
      href: "/examples/bon-de-commande-exemple.pdf",
    });
    expect(await getOrderConfirmation("FG-0000-0000")).toBeNull();
    expect(await getOrderConfirmation("<script>")).toBeNull();
    expect(await getOrderSlip("FG-0000-0000")).toBeNull();
  });

  it("/suivi finds a new order with status and date only, no name, phone or address", async () => {
    await verifyPhone();
    const created = await createOrder(request(), "suivi");
    if (created.status !== "created") throw new Error();
    const result = await lookupTracking(created.code.toLowerCase());
    expect(result.status).toBe("found");
    if (result.status !== "found") throw new Error("expected found");
    expect(result.tracking.status).toBe("received");
    expect(result.tracking.history.map((entry) => entry.status)).toEqual(["received"]);
    expect(result.tracking.parcelCount).toBe(1);
    const text = JSON.stringify(result);
    for (const personal of ["Amel", "Yasmine", "Habib", "Khaldoun", "20000000", "50000000"]) {
      expect(text).not.toContain(personal);
    }
  });
});

describe("createOrder: account order, parcels, codes, link, outbox (ESP-00)", () => {
  function threeParcelDraft(): OrderDraft {
    const draft = readyDraft();
    draft.parcel.count = "3";
    draft.parcel.fragile = false;
    draft.parcel.weightKg = "2,5";
    draft.parcel.declaredValueMillimes = 100_000;
    const quote = makeQuote(priceInputOf(draft)!, T0);
    return { ...draft, quote, acceptedQuoteId: quote.id };
  }
  const parcelsOf = (code: string) =>
    Object.values(readTable<Parcel>(PARCELS))
      .filter((p) => p.orderCode === code)
      .sort((a, b) => a.index - b.index);

  it("writes the order as received and three to_collect parcels with shares that sum up", async () => {
    await verifyPhone();
    const draft = threeParcelDraft();
    const created = await createOrder(request(draft), "k-three");
    if (created.status !== "created") throw new Error();
    const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[created.code]!;
    expect(order.status).toBe("received");
    expect(order.totalMillimes).toBe(draft.quote!.totalMillimes);
    expect(order.priceLines.reduce((sum, line) => sum + line.millimes, 0)).toBe(
      order.totalMillimes,
    );
    expect(order.freightPayerAccepted).toBe(false);
    expect(order.ownerAccountId).toBeNull();
    const parcels = parcelsOf(created.code);
    expect(parcels.map((p) => p.weightDeclaredG)).toEqual([833, 833, 834]);
    expect(parcels.map((p) => p.declaredValueMillimes)).toEqual([33_333, 33_333, 33_334]);
    expect(parcels.map((p) => p.status)).toEqual(["to_collect", "to_collect", "to_collect"]);
    expect(parcels.map((p) => p.barcode)).toEqual([1, 2, 3].map((i) => `${created.code}-${i}`));
    expect(parcels.every((p) => p.codMillimes === null && p.size === "small")).toBe(true);
    expect(parcels.every((p) => p.proofLevel === "codeOrPhotoWithPosition")).toBe(true);
    // events: order null -> received (guest), one per parcel
    const events = Object.values(readTable<StatusEvent>(STATUS_EVENTS));
    expect(
      events.filter((e) => e.subjectType === "order" && e.subjectId === created.code),
    ).toMatchObject([{ fromStatus: null, toStatus: "received", actorId: "guest" }]);
    for (const parcel of parcels) {
      expect(events.filter((e) => e.subjectId === parcel.id)).toMatchObject([
        { fromStatus: null, toStatus: "to_collect" },
      ]);
    }
    // one delivery code per parcel, 4 digits
    const codes = Object.values(readTable<DeliveryCode>(DELIVERY_CODES)).filter((c) =>
      parcels.some((p) => p.id === c.parcelId),
    );
    expect(codes).toHaveLength(3);
    for (const row of codes) {
      expect(row.code).toMatch(/^\d{4}$/);
      expect(row.failedAttempts).toBe(0);
      expect(row.expiresAt).toBeNull();
    }
  });

  it("no declared value gives null on every parcel", async () => {
    await verifyPhone();
    const draft = threeParcelDraft();
    draft.parcel.declaredValueMillimes = null;
    const created = await createOrder(request(draft), "k-novalue");
    if (created.status !== "created") throw new Error();
    expect(parcelsOf(created.code).map((p) => p.declaredValueMillimes)).toEqual([null, null, null]);
  });

  it("freightPayer follows the payment mode", async () => {
    await verifyPhone();
    const orderOf = async (draft: OrderDraft, key: string) => {
      const created = await createOrder(request(draft), key);
      if (created.status !== "created") throw new Error(JSON.stringify(created));
      return readTable<AccountOrder>(ACCOUNT_ORDERS)[created.code]!;
    };
    expect(
      (
        await orderOf(
          { ...readyDraft(), payment: "cashDelivery", freightPayerAccepted: true },
          "p1",
        )
      ).freightPayer,
    ).toBe("recipient");
    expect((await orderOf({ ...readyDraft(), payment: "cashPickup" }, "p2")).freightPayer).toBe(
      "sender",
    );
    setSession(sessionFor({ ...FIXTURE_ACCOUNTS[1]!, google: false }));
    const mine = await orderOf({ ...readyDraft(), payment: "account" }, "p3");
    expect(mine.freightPayer).toBe("sender");
    expect(mine.ownerAccountId).toBe(FIXTURE_ACCOUNTS[1]!.id);
    signOut();
  });

  it("a team member's order: createdByUserId and the first event's actor are the user, the owner is the account", async () => {
    await verifyPhone();
    const result = await signIn(FIXTURE_TEAM_MEMBERS[1]!.phone, FIXTURE_PASSWORD);
    if (result.status !== "ok") throw new Error();
    const created = await createOrder(request({ ...readyDraft(), payment: "account" }), "k-member");
    if (created.status !== "created") throw new Error();
    const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[created.code]!;
    expect(order).toMatchObject({
      ownerAccountId: "acc-merchant-validated",
      createdByUserId: "usr-walid-user",
    });
    const first = Object.values(readTable<StatusEvent>(STATUS_EVENTS)).filter(
      (e) => e.subjectType === "order" && e.subjectId === created.code,
    );
    expect(first).toMatchObject([
      { fromStatus: null, toStatus: "received", actorId: "usr-walid-user" },
    ]);
    signOut();
  });

  it("smsLanguage en: the order and the outbox message are en, stored as template + params", async () => {
    await verifyPhone();
    const draft = readyDraft();
    draft.recipient.smsLanguage = "en";
    const created = await createOrder(request(draft), "k-en");
    if (created.status !== "created") throw new Error();
    const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[created.code]!;
    expect(order.recipientLocale).toBe("en");
    const messages = Object.values(readTable<OutboxMessage>(OUTBOX));
    expect(messages).toHaveLength(1);
    const [token] = Object.keys(readTable(RECIPIENT_LINKS));
    expect(messages[0]).toMatchObject({
      orderCode: created.code,
      channel: "sms",
      template: "trackingLink",
      locale: "en",
      params: { trackingCode: created.code, linkToken: token },
    });
    expect(token).not.toContain(created.code);
  });

  it("a replayed key writes no second order, parcel set, link or message", async () => {
    await verifyPhone();
    const req = request(threeParcelDraft());
    const first = await createOrder(req, "k-replay");
    const second = await createOrder(req, "k-replay");
    if (first.status !== "created" || second.status !== "created") throw new Error();
    expect(second.replay).toBe(true);
    expect(Object.keys(readTable(ACCOUNT_ORDERS))).toEqual([first.code]);
    expect(Object.keys(readTable(PARCELS))).toHaveLength(3);
    expect(Object.keys(readTable(RECIPIENT_LINKS))).toHaveLength(1);
    expect(Object.keys(readTable(OUTBOX))).toHaveLength(1);
    expect(Object.keys(readTable(DELIVERY_CODES))).toHaveLength(3);
  });

  it("legacy order still tracks: a row only in fg.mock.orders is found", async () => {
    writeJson("fg.mock.orders", {
      "FG-2345-6789": {
        code: "FG-2345-6789",
        idempotencyKey: "old",
        fingerprint: "{}",
        createdAt: "2026-11-04T08:30:00.000Z",
        pickup: { startUtc: "2026-11-04T09:00:00Z", endUtc: "2026-11-04T10:00:00Z" },
        recipientName: "Amel B.",
      },
    });
    const found = await getOrderConfirmation("FG-2345-6789");
    expect(found?.recipientName).toBe("Amel B.");
  });
});

describe("createOrder: failNext", () => {
  it.each(["createOrder.request", "createOrder.response"])(
    "%s makes it throw NetworkError once",
    async (op) => {
      await verifyPhone();
      const key = `fg.mock.failNext:${op}`;
      writeJson(key, true);
      await expect(createOrder(request(), "k-fn")).rejects.toBeInstanceOf(NetworkError);
      expect(readJson(key)).toBeNull();
    },
  );

  it("the request key loses the order, the response key keeps it", async () => {
    await verifyPhone();
    writeJson("fg.mock.failNext:createOrder.request", true);
    await expect(createOrder(request(), "k-a")).rejects.toBeInstanceOf(NetworkError);
    expect(await findOrderByKey("k-a")).toBeNull();
    writeJson("fg.mock.failNext:createOrder.response", true);
    await expect(createOrder(request(), "k-b")).rejects.toBeInstanceOf(NetworkError);
    expect(await findOrderByKey("k-b")).not.toBeNull();
  });

  it("the two Prompt 3 alias keys still make it throw", async () => {
    await verifyPhone();
    writeJson(FAIL_NEXT_ORDER_REQUEST_KEY, true);
    await expect(createOrder(request(), "k-c")).rejects.toBeInstanceOf(NetworkError);
    writeJson(FAIL_NEXT_ORDER_RESPONSE_KEY, true);
    await expect(createOrder(request(), "k-d")).rejects.toBeInstanceOf(NetworkError);
    expect(readJson(FAIL_NEXT_ORDER_RESPONSE_KEY)).toBeNull();
  });
});

describe("createOrder: R605 return balance and R607 port dû", () => {
  const returnDue = FIXTURE_ACCOUNTS.find((a) => a.id === "acc-customer-return-due")!;
  const settled = FIXTURE_ACCOUNTS.find((a) => a.id === "acc-customer")!;
  const asAccount = (account: typeof returnDue) =>
    setSession(sessionFor({ ...account, google: false }));

  it("R605: a balance for returned parcels refuses cashPickup and cashDelivery", async () => {
    await verifyPhone();
    asAccount(returnDue);
    const pickup = await createOrder(request({ ...readyDraft(), payment: "cashPickup" }), "r605-a");
    expect(pickup).toEqual({ status: "refused", error: "returnBalanceDue" });
    const delivery = await createOrder(
      request({ ...readyDraft(), payment: "cashDelivery", freightPayerAccepted: true }),
      "r605-b",
    );
    expect(delivery).toEqual({ status: "refused", error: "returnBalanceDue" });
    expect(Object.keys(readTable<AccountOrder>(ACCOUNT_ORDERS))).toHaveLength(0);
  });

  it("R605: with a zero balance both cash modes pass", async () => {
    await verifyPhone();
    asAccount(settled);
    const pickup = await createOrder(request({ ...readyDraft(), payment: "cashPickup" }), "r605-c");
    expect(pickup.status).toBe("created");
    const delivery = await createOrder(
      request({ ...readyDraft(), payment: "cashDelivery", freightPayerAccepted: true }),
      "r605-d",
    );
    expect(delivery.status).toBe("created");
  });

  it("R605: the amount owed is in millimes, and an account with none owes nothing", () => {
    expect(returnBalanceMillimes(returnDue.id)).toBe(7000);
    expect(returnBalanceMillimes("acc-customer")).toBe(0);
    expect(returnBalanceMillimes(null)).toBe(0);
  });

  it("R607: cashDelivery without the acceptance is refused, with it the order stores it", async () => {
    await verifyPhone();
    const refused = await createOrder(
      request({ ...readyDraft(), payment: "cashDelivery", freightPayerAccepted: false }),
      "r607-a",
    );
    expect(refused).toEqual({ status: "refused", error: "freightPayerNotAccepted" });
    expect(Object.keys(readTable<AccountOrder>(ACCOUNT_ORDERS))).toHaveLength(0);

    const accepted = await createOrder(
      request({ ...readyDraft(), payment: "cashDelivery", freightPayerAccepted: true }),
      "r607-b",
    );
    if (accepted.status !== "created") throw new Error(JSON.stringify(accepted));
    expect(readTable<AccountOrder>(ACCOUNT_ORDERS)[accepted.code]).toMatchObject({
      freightPayer: "recipient",
      freightPayerAccepted: true,
    });
  });

  it("R607: a box ticked and then a switch to cashPickup is not carried into the request", () => {
    const draft = { ...readyDraft(), payment: "cashPickup" as const, freightPayerAccepted: true };
    expect(request(draft).freightPayerAccepted).toBe(false);
  });

  it("R607: cashPickup needs no acceptance", async () => {
    await verifyPhone();
    const result = await createOrder(request({ ...readyDraft(), payment: "cashPickup" }), "r607-c");
    expect(result.status).toBe("created");
  });
});

describe("createOrder: Enregistrer ce destinataire (CMD-02)", () => {
  const sami = () => sessionFor({ ...FIXTURE_ACCOUNTS[0]!, google: false });
  const saveDraft = (save: boolean): OrderDraft => {
    const draft = readyDraft();
    return { ...draft, recipient: { ...draft.recipient, save } };
  };

  it("saves the recipient only when the order is created, once per phone", async () => {
    setSession(sami());
    const before = savedRecipients(sami());
    expect(before).toEqual([]);
    const draft = saveDraft(true);
    // A refused order saves nothing (phone not verified yet).
    expect((await createOrder(request(draft), "k0")).status).toBe("refused");
    expect(savedRecipients(sami())).toEqual([]);
    await verifyPhone();
    expect((await createOrder(request(draft), "k1")).status).toBe("created");
    const saved = savedRecipients(sami());
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      name: draft.recipient.name.trim(),
      locale: draft.recipient.smsLanguage,
    });
    // A replay of the same key writes nothing again; another order to the same phone updates it.
    expect(await createOrder(request(draft), "k1")).toMatchObject({ replay: true });
    expect((await createOrder(request(draft), "k2")).status).toBe("created");
    expect(savedRecipients(sami())).toHaveLength(1);
  });

  it("saves nothing when the box is not ticked, or when nobody is signed in", async () => {
    await verifyPhone();
    setSession(sami());
    expect((await createOrder(request(saveDraft(false)), "k1")).status).toBe("created");
    expect(savedRecipients(sami())).toEqual([]);
    signOut();
    expect((await createOrder(request(saveDraft(true)), "k2")).status).toBe("created");
    expect(savedRecipients(sami())).toEqual([]);
  });
});
