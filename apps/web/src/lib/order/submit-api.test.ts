import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoryStorage } from "../storage";
import { setClock } from "./clock";
import { loadDraft, saveDraft, type OrderDraft } from "./draft";
import { resolveLostSubmit, submitOrder } from "./submit";
import { readyDraft } from "./test-draft";

// R202 over the api adapter (#20): the retry re-sends the stored bytes, and a key the server has
// purged (24 h) never creates a second order.
const T0 = Date.parse("2026-11-04T08:30:00Z");
const DAY = 24 * 60 * 60 * 1000;
let clock = T0;
let calls: { key: string | null; body: string }[] = [];
let answer: () => Response | Promise<Response>;

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  useMemoryStorage();
  clock = T0;
  setClock(() => clock);
  calls = [];
  vi.stubEnv("NEXT_PUBLIC_API_DOMAINS", "orders");
  vi.stubEnv("API_ORIGIN", "http://api.test");
  vi.stubGlobal("fetch", async (request: Request) => {
    calls.push({ key: request.headers.get("Idempotency-Key"), body: await request.text() });
    return answer();
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const saved = (): OrderDraft => saveDraft(readyDraft(T0), T0);
// The draft itself lives 24 h (DRAFT_RETENTION_MS); extended here so the key rule is what is tested.
function keepDraftAlive() {
  const stored = loadDraft();
  if (!stored) throw new Error("draft");
  saveDraft({ ...stored, expiresAt: T0 + 10 * DAY }, clock);
}
const cut = () => Promise.reject(new TypeError("network"));

describe("submitOrder on the api adapter (R202, #20)", () => {
  it("stores the exact body with the key, and a retry re-sends the same bytes and key", async () => {
    const draft = saved();
    answer = cut;
    expect(await submitOrder(draft)).toEqual({ status: "lost" });
    const stored = loadDraft()?.pendingSubmit?.body;
    expect(stored).toBeTruthy();
    expect(calls[0]).toEqual({ key: draft.idempotencyKey, body: stored });

    // Even if the tab's copy changes meanwhile, the stored bytes are what goes out again.
    answer = () => json(201, { tracking_number: "FG-5A1C-0001" });
    expect(await submitOrder(draft)).toEqual({ status: "created", code: "FG-5A1C-0001" });
    expect(calls[1]).toEqual(calls[0]);
    expect(loadDraft()).toBeNull();
  });

  it("after 24 h the key is purged: nothing is sent and the lost message stays (no second order)", async () => {
    const draft = saved();
    answer = cut;
    await submitOrder(draft);
    calls = [];
    keepDraftAlive();
    clock = T0 + DAY + 1;
    answer = () => json(201, { tracking_number: "FG-NEW-0002" });
    expect(await submitOrder(draft)).toEqual({ status: "lost" });
    expect(calls).toHaveLength(0);
    expect(loadDraft()?.idempotencyKey).toBe(draft.idempotencyKey);
    expect(loadDraft()?.pendingSubmit).not.toBeNull();
  });

  it("just inside 24 h the replay is still sent", async () => {
    const draft = saved();
    answer = cut;
    await submitOrder(draft);
    keepDraftAlive();
    clock = T0 + DAY;
    answer = () => json(201, { tracking_number: "FG-5A1C-0001" });
    expect((await submitOrder(draft)).status).toBe("created");
  });

  it("401 asks for sign-in and keeps the draft", async () => {
    const draft = saved();
    answer = () =>
      json(401, { error: { code: "AUTH_REQUIRED", message: "x", fields: [], trace_id: "t" } });
    expect(await submitOrder(draft)).toEqual({ status: "signIn" });
    expect(loadDraft()?.idempotencyKey).toBe(draft.idempotencyKey);
  });

  it("a 500 may hide a created order: it stays lost, same key", async () => {
    const draft = saved();
    answer = () =>
      json(500, { error: { code: "INTERNAL_ERROR", message: "x", fields: [], trace_id: "t" } });
    expect(await submitOrder(draft)).toEqual({ status: "lost" });
    expect(loadDraft()?.pendingSubmit).not.toBeNull();
  });

  it("a refused order resets the pending state; resolveLostSubmit then mints a new key", async () => {
    const draft = saved();
    answer = () =>
      json(410, { error: { code: "QUOTE_EXPIRED", message: "x", fields: [], trace_id: "t" } });
    expect(await submitOrder(draft)).toEqual({ status: "refused", error: "quoteExpired" });
    expect(loadDraft()?.pendingSubmit).toBeNull();
    const resolved = await resolveLostSubmit(draft);
    expect("draft" in resolved && resolved.draft.idempotencyKey).not.toBe(draft.idempotencyKey);
  });
});
