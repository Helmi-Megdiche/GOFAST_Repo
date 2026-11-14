import { beforeEach, describe, expect, it } from "vitest";
import type { Begin, IdempotencyStore } from "./http/idempotency.ts";

const HOUR = 3_600_000;
const ans = { status: 201, body: { ok: true } };
const token = (b: Begin): string => {
  if (b.kind !== "new") throw new Error(`expected new, got ${b.kind}`);
  return b.token;
};

/** The clock a store reads: the test moves it. */
export type Clock = { now: number };
export type MakeStore = (clock: Clock, lockMs: number) => IdempotencyStore;

/**
 * One behaviour for every store (memory, database): R202 replay, RV-08 24 h, the lease, RV-18
 * purge. `reset` empties the shared storage before each test.
 */
export function idempotencyContract(label: string, make: MakeStore, reset: () => Promise<void> = async () => {}) {
  describe(`${label}: idempotency contract`, () => {
    const clock: Clock = { now: 0 };
    beforeEach(async () => {
      clock.now = Date.UTC(2026, 10, 14, 10);
      await reset();
    });

    it("gives new once, then running, then replay, then conflict for other content", async () => {
      const s = make(clock, 300_000);
      const t = token(await s.begin("a|k", "fp1"));
      expect((await s.begin("a|k", "fp1")).kind).toBe("running");
      await s.complete("a|k", t, ans);
      expect(await s.begin("a|k", "fp1")).toEqual({ kind: "replay", answer: ans });
      expect(await s.begin("a|k", "fp2")).toEqual({ kind: "conflict" });
    });

    it("of two callers at the same time exactly one gets new", async () => {
      const s = make(clock, 300_000);
      const results = await Promise.all(Array.from({ length: 8 }, () => s.begin("a|k", "fp")));
      expect(results.filter((r) => r.kind === "new")).toHaveLength(1);
      expect(results.filter((r) => r.kind === "running")).toHaveLength(7);
    });

    it("lets the same key be tried again after abort", async () => {
      const s = make(clock, 300_000);
      await s.abort("a|k", token(await s.begin("a|k", "fp")));
      expect((await s.begin("a|k", "fp")).kind).toBe("new");
    });

    it("RV-08: forgets an answer after 24 h, with a fixed clock", async () => {
      const s = make(clock, 300_000);
      await s.complete("a|k", token(await s.begin("a|k", "fp")), ans);
      clock.now += 24 * HOUR - 1;
      expect((await s.begin("a|k", "fp")).kind).toBe("replay");
      clock.now += 2;
      expect((await s.begin("a|k", "other")).kind).toBe("new");
    });

    it("hands an abandoned running key to the next caller, and the slow first call cannot clobber it", async () => {
      const s = make(clock, 1000);
      const slow = token(await s.begin("a|k", "fp"));
      clock.now += 1001;
      const second = token(await s.begin("a|k", "fp"));
      expect(second).not.toBe(slow);
      await s.complete("a|k", second, ans);
      // the slow call ends late: neither its answer nor its abort changes the row
      await s.complete("a|k", slow, { status: 500, body: "late" });
      await s.abort("a|k", slow);
      expect(await s.begin("a|k", "fp")).toEqual({ kind: "replay", answer: ans });
    });

    it("does not hand an abandoned key to a caller with other content", async () => {
      const s = make(clock, 1000);
      await s.begin("a|k", "fp");
      clock.now += 1001;
      expect(await s.begin("a|k", "other")).toEqual({ kind: "conflict" });
    });

    it("purgeExpired removes only what is past 24 h", async () => {
      const s = make(clock, 300_000);
      await s.begin("a|old", "fp");
      clock.now += 23 * HOUR;
      await s.complete("a|young", token(await s.begin("a|young", "fp")), ans);
      clock.now += 2 * HOUR;
      expect(await s.purgeExpired()).toBe(1);
      expect((await s.begin("a|young", "fp")).kind).toBe("replay");
    });

    it("RV-18: purgeAccount erases one account's keys and no other", async () => {
      const s = make(clock, 300_000);
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
}
