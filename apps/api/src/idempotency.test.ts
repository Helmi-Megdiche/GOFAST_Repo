import { describe, expect, it } from "vitest";
import { MemoryIdempotencyStore, canonical, fingerprint } from "./http/idempotency.ts";

const HOUR = 3_600_000;
const ans = { status: 201, body: { ok: true } };

describe("memory idempotency store (one process only)", () => {
  it("gives new once, then running, then replay, then conflict for other content", async () => {
    const s = new MemoryIdempotencyStore();
    expect(await s.begin("a|k", "fp1")).toEqual({ kind: "new" });
    expect(await s.begin("a|k", "fp1")).toEqual({ kind: "running" });
    await s.complete("a|k", ans);
    expect(await s.begin("a|k", "fp1")).toEqual({ kind: "replay", answer: ans });
    expect(await s.begin("a|k", "fp2")).toEqual({ kind: "conflict" });
  });

  it("lets the same key be tried again after abort", async () => {
    const s = new MemoryIdempotencyStore();
    await s.begin("a|k", "fp");
    await s.abort("a|k");
    expect(await s.begin("a|k", "fp")).toEqual({ kind: "new" });
  });

  it("RV-08: forgets an answer after 24 h, with a fixed clock", async () => {
    let t = Date.UTC(2026, 10, 14, 10);
    const s = new MemoryIdempotencyStore(() => t);
    await s.begin("a|k", "fp");
    await s.complete("a|k", ans);
    t += 24 * HOUR - 1;
    expect((await s.begin("a|k", "fp")).kind).toBe("replay");
    t += 2;
    expect(await s.begin("a|k", "other")).toEqual({ kind: "new" });
  });

  it("hands an abandoned running key (crashed process) to the next caller", async () => {
    let t = 0;
    const s = new MemoryIdempotencyStore(() => t, 1000);
    await s.begin("a|k", "fp");
    t += 1001;
    expect(await s.begin("a|k", "fp")).toEqual({ kind: "new" });
  });

  it("purgeExpired removes only what is past 24 h", async () => {
    let t = 0;
    const s = new MemoryIdempotencyStore(() => t);
    await s.begin("a|old", "fp");
    t += 23 * HOUR;
    await s.begin("a|young", "fp");
    await s.complete("a|young", ans);
    t += 2 * HOUR;
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
      await s.begin(scope, "fp");
      await s.complete(scope, ans);
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
