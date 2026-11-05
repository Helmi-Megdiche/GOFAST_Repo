import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { CODE_VERIFIED_WINDOW_MS } from "../order/constants";
import type { OrderDraft } from "../order/draft";
import { makeQuote } from "../order/pricing";
import { buildOrderRequest, type OrderRequest } from "../order/request";
import { availableSlots } from "../order/slots";
import { readyDraft as readyTestDraft } from "../order/test-draft";
import { isValidTrackingCode } from "../tracking-code";
import { readJson, useMemoryStorage, writeJson } from "../storage";
import { createAccount, sessionFor } from "./accounts";
import { FIXTURE_ACCOUNTS } from "./fixtures/accounts";
import { FOUND_TRACKING_CODE } from "./fixtures/tracking";
import { FAIL_NEXT_ORDER_RESPONSE_KEY } from "./mock-db";
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
    const text = JSON.stringify(result);
    for (const personal of ["Amel", "Yasmine", "Habib", "Khaldoun", "20000000", "50000000"]) {
      expect(text).not.toContain(personal);
    }
  });
});
