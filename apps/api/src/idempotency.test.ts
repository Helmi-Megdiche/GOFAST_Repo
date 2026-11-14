import { describe, expect, it } from "vitest";
import { type Begin, MemoryIdempotencyStore, canonical, fingerprint } from "./http/idempotency.ts";

const HOUR = 3_600_000;
const ans = { status: 201, body: { ok: true } };
const token = (b: Begin): string => {
  if (b.kind !== "new") throw new Error(`expected new, got ${b.kind}`);
  return b.token;
};

describe("memory idempotency store (one process only)", () => {
  it("gives new once, then running, then replay, then conflict for other content", async () => {
    const s = new MemoryIdempotencyStore();
    const t = token(await s.begin("a|k", "fp1"));
    expect((await s.begin("a|k", "fp1")).kind).toBe("running");
    await s.complete("a|k", t, ans);
    expect(await s.begin("a|k", "fp1")).toEqual({ kind: "replay", answer: ans });
    expect(await s.begin("a|k", "fp2")).toEqual({ kind: "conflict" });
  });

  it("lets the same key be tried again after abort", async () => {
    const s = new MemoryIdempotencyStore();
    await s.abort("a|k", token(await s.begin("a|k", "fp")));
    expect((await s.begin("a|k", "fp")).kind).toBe("new");
  });

  it("RV-08: forgets an answer after 24 h, with a fixed clock", async () => {
    let now = Date.UTC(2026, 10, 14, 10);
    const s = new MemoryIdempotencyStore(() => now);
    await s.complete("a|k", token(await s.begin("a|k", "fp")), ans);
    now += 24 * HOUR - 1;
    expect((await s.begin("a|k", "fp")).kind).toBe("replay");
    now += 2;
    expect((await s.begin("a|k", "other")).kind).toBe("new");
  });

  it("hands an abandoned running key to the next caller, and the slow first call cannot clobber it", async () => {
    let now = 0;
    const s = new MemoryIdempotencyStore(() => now, 1000);
    const slow = token(await s.begin("a|k", "fp"));
    now += 1001;
    const second = token(await s.begin("a|k", "fp"));
    expect(second).not.toBe(slow);
    await s.complete("a|k", second, ans);
    // the slow call ends late: neither its answer nor its abort changes the row
    await s.complete("a|k", slow, { status: 500, body: "late" });
    await s.abort("a|k", slow);
    expect(await s.begin("a|k", "fp")).toEqual({ kind: "replay", answer: ans });
  });

  it("purgeExpired removes only what is past 24 h", async () => {
    let now = 0;
    const s = new MemoryIdempotencyStore(() => now);
    await s.begin("a|old", "fp");
    now += 23 * HOUR;
    await s.complete("a|young", token(await s.begin("a|young", "fp")), ans);
    now += 2 * HOUR;
    expect(await s.purgeExpired()).toBe(1);
    expect((await s.begin("a|young", "fp")).kind).toBe("replay");
  });

  it("RV-18: purgeAccount erases one account's keys and no other", async () => {
    const s = new MemoryIdempotencyStore();
    for (const scope of [
      "acc-1|POST /v1/orders|k1",
      "acc-1|POST /v1/orders|k2",
      "acc-2|POST /v1/orders|k1",
    ]) {
      await s.complete(scope, token(await s.begin(scope, "fp")), ans);
    }
    expect(await s.purgeAccount("acc-1")).toBe(2);
    expect((await s.begin("acc-1|POST /v1/orders|k1", "fp")).kind).toBe("new");
    expect((await s.begin("acc-2|POST /v1/orders|k1", "fp")).kind).toBe("replay");
  });
});

describe("fingerprint is canonical", () => {
  const r = "POST /v1/orders";
  it("ignores the order of keys at any depth and of query parameters", () => {
    const a = fingerprint(r, {}, { b: "2", a: "1" }, { x: 1, y: { p: 1, q: [1, { m: 1, n: 2 }] } });
    const b = fingerprint(r, {}, { a: "1", b: "2" }, { y: { q: [1, { n: 2, m: 1 }], p: 1 }, x: 1 });
    expect(a).toBe(b);
  });
  it("still tells apart other values, other array order and other routes", () => {
    const base = fingerprint(r, {}, {}, { x: [1, 2] });
    expect(fingerprint(r, {}, {}, { x: [2, 1] })).not.toBe(base);
    expect(fingerprint(r, {}, {}, { x: [1, 3] })).not.toBe(base);
    expect(fingerprint("POST /v1/quotes", {}, {}, { x: [1, 2] })).not.toBe(base);
    expect(canonical(undefined)).toBe("null");
  });
});
