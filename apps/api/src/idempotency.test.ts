import { describe, expect, it } from "vitest";
import { MemoryIdempotencyStore, canonical, fingerprint } from "./http/idempotency.ts";
import { idempotencyContract } from "./idempotency.contract.ts";

idempotencyContract("memory store (one process only)", (clock, lockMs) => new MemoryIdempotencyStore(() => clock.now, lockMs));

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
