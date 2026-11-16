import { beforeEach, describe, expect, it } from "vitest";
import { findOrderByKey } from "../data/orders";
import { FIXTURE_CODES } from "../data/fixtures/accounts";
import { FAIL_NEXT_ORDER_REQUEST_KEY, FAIL_NEXT_ORDER_RESPONSE_KEY } from "../data/mock-db";
import { sendCode, verifyCode } from "../data/otp";
import { useMemoryStorage, writeJson } from "../storage";
import { setClock } from "./clock";
import { CODE_VERIFIED_WINDOW_MS } from "@fastgo/domain";
import { DRAFT_KEY, loadDraft, saveDraft, type OrderDraft } from "./draft";
import { buildOrderRequest, fingerprint } from "./request";
import { resolveLostSubmit, submitOrder } from "./submit";
import { readyDraft, TEST_PHONE } from "./test-draft";

const T0 = Date.parse("2026-11-04T08:30:00Z"); // 09:30 in Tunis
let clock = T0;

beforeEach(async () => {
  useMemoryStorage();
  clock = T0;
  setClock(() => clock);
  await sendCode({ channel: "sms", value: TEST_PHONE }, "order");
  await verifyCode({ channel: "sms", value: TEST_PHONE }, FIXTURE_CODES[0], "order");
});

const saved = (): OrderDraft => saveDraft(readyDraft(T0), T0);

describe("submitOrder (R202)", () => {
  it("creates the order and clears the draft", async () => {
    const result = await submitOrder(saved());
    expect(result.status).toBe("created");
    expect(loadDraft()).toBeNull();
  });

  it("a lost answer keeps the draft with its key and the request fingerprint", async () => {
    const draft = saved();
    writeJson(FAIL_NEXT_ORDER_RESPONSE_KEY, true);
    expect(await submitOrder(draft)).toEqual({ status: "lost" });
    const pending = loadDraft();
    expect(pending?.idempotencyKey).toBe(draft.idempotencyKey);
    expect(pending?.pendingSubmit).not.toBeNull();
    expect(pending?.submitAttemptedAt).toBe(T0);
  });

  it("never restores a draft another tab cleared, and finds the order it placed", async () => {
    const stale = saved();
    const other = await submitOrder(structuredClone(stale));
    if (other.status !== "created") throw new Error();
    const changed = { ...stale, payment: "cashDelivery" as const };
    expect(await submitOrder(changed)).toEqual({ status: "created", code: other.code });
    expect(loadDraft()).toBeNull();
  });

  it("a stale tab never sends, nor writes back, what another tab changed since", async () => {
    const stale = saved();
    saveDraft({ ...stale, parcel: { ...stale.parcel, weights: ["5"] } }, T0);
    expect(await submitOrder(stale)).toEqual({ status: "changed" });
    expect(await findOrderByKey(stale.idempotencyKey)).toBeNull();
    expect(loadDraft()?.parcel.weights).toEqual(["5"]);
    expect(loadDraft()?.pendingSubmit).toBeNull();
  });

  it("a stale tab whose draft was cancelled elsewhere places nothing", async () => {
    const stale = saved();
    saveDraft({ ...readyDraft(T0), idempotencyKey: "another-draft" }, T0);
    expect(await submitOrder(stale)).toEqual({ status: "incomplete" });
    expect(await findOrderByKey(stale.idempotencyKey)).toBeNull();
    expect(loadDraft()?.idempotencyKey).toBe("another-draft");
  });

  it("a server conflict looks the order up and clears the draft", async () => {
    const draft = saved();
    writeJson(FAIL_NEXT_ORDER_RESPONSE_KEY, true);
    await submitOrder(draft);
    // Same key, a different payload than the one the server keeps (an older build, another device).
    const pending = loadDraft()!;
    const different = { ...pending, pendingSubmit: null, payment: "cashDelivery" as const };
    saveDraft(different);
    const code = await findOrderByKey(draft.idempotencyKey);
    expect(await submitOrder(different)).toEqual({ status: "created", code });
    expect(loadDraft()).toBeNull();
  });
});

describe("a lost submit whose quote lacks a price line (GH-10-D7, RV-18)", () => {
  // A v1 draft saved before PRICE_LINES gained a key: the fingerprint was made from that quote.
  const pendingWithMissingLine = (withBody: boolean) => {
    const ready = readyDraft(T0);
    const quote = structuredClone(ready.quote!);
    delete (quote.lines as Record<string, unknown>).stamp;
    const request = buildOrderRequest({ ...ready, quote }, ready.termsAccepted)!;
    const body = withBody ? "stored-bytes" : undefined;
    const pendingSubmit =
      body === undefined
        ? { fingerprint: fingerprint(request) }
        : { fingerprint: fingerprint(request), body };
    return { ...ready, quote, pendingSubmit, submitAttemptedAt: T0, version: 1 };
  };

  it.each([false, true])(
    "re-sends the same fingerprint, no conflict (body stored: %s)",
    async (withBody) => {
      const stored = pendingWithMissingLine(withBody);
      writeJson(DRAFT_KEY, stored);
      const loaded = loadDraft(T0)!;
      expect(loaded.quote).toEqual(stored.quote);
      expect(loaded.pendingSubmit).toEqual(stored.pendingSubmit);
      const result = await submitOrder(loaded);
      expect(result.status).toBe("created");
      expect(await findOrderByKey(stored.idempotencyKey)).not.toBeNull();
    },
  );
});

describe("resolveLostSubmit", () => {
  it("an order that exists clears the draft and its pending answer", async () => {
    const draft = saved();
    writeJson(FAIL_NEXT_ORDER_RESPONSE_KEY, true);
    await submitOrder(draft);
    const resolved = await resolveLostSubmit(loadDraft()!);
    expect("code" in resolved && resolved.code).toBe(await findOrderByKey(draft.idempotencyKey));
    expect(loadDraft()).toBeNull();
  });

  it("a request lost before creation: a refused retry gives a new key, then one order", async () => {
    const draft = saved();
    writeJson(FAIL_NEXT_ORDER_REQUEST_KEY, true);
    expect(await submitOrder(draft)).toEqual({ status: "lost" });
    expect(await findOrderByKey(draft.idempotencyKey)).toBeNull();

    clock = T0 + 15 * 60_000; // the retry comes after the price guarantee
    // and after the verification window (CODE_VERIFIED_WINDOW_MS): the phone is checked again.
    await sendCode({ channel: "sms", value: TEST_PHONE }, "order");
    await verifyCode({ channel: "sms", value: TEST_PHONE }, FIXTURE_CODES[1], "order");
    const pending = loadDraft()!;
    expect(await submitOrder(pending)).toEqual({ status: "refused", error: "quoteExpired" });
    const resolved = await resolveLostSubmit(loadDraft()!);
    if ("code" in resolved) throw new Error("no order exists for the old key");
    expect(resolved.draft.idempotencyKey).not.toBe(draft.idempotencyKey);
    expect(resolved.draft.pendingSubmit).toBeNull();
    expect(loadDraft()?.idempotencyKey).toBe(resolved.draft.idempotencyKey);
  });
});

describe("a verification older than CODE_VERIFIED_WINDOW_MS (final review I1)", () => {
  const verified = (): OrderDraft =>
    saveDraft({ ...readyDraft(T0), verifiedPhone: "+21620000000" }, T0);

  it("a phoneNotVerified refusal forgets the draft's verified phone, so the code step comes back", async () => {
    const draft = verified();
    clock = T0 + CODE_VERIFIED_WINDOW_MS;
    expect(await submitOrder(draft)).toEqual({ status: "refused", error: "phoneNotVerified" });
    expect(loadDraft()?.verifiedPhone).toBeNull();
    expect(loadDraft()?.idempotencyKey).toBe(draft.idempotencyKey);
  });

  it("after a lost request, the new key does not bring the stale verified phone back", async () => {
    const draft = verified();
    writeJson(FAIL_NEXT_ORDER_REQUEST_KEY, true);
    expect(await submitOrder(draft)).toEqual({ status: "lost" });
    clock = T0 + CODE_VERIFIED_WINDOW_MS + 60_000;
    expect(await submitOrder(loadDraft()!)).toEqual({
      status: "refused",
      error: "phoneNotVerified",
    });
    // The tab still holds its copy with verifiedPhone set, as review-step.tsx does.
    const resolved = await resolveLostSubmit(draft);
    if ("code" in resolved) throw new Error("no order exists for the old key");
    expect(resolved.draft.verifiedPhone).toBeNull();
    expect(loadDraft()?.verifiedPhone).toBeNull();
    expect(loadDraft()?.idempotencyKey).not.toBe(draft.idempotencyKey);
  });
});
