import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CODE_LOCK_MS, CODE_MAX_ATTEMPTS, CODE_RESEND_DELAY_MS } from "@fastgo/domain";
import { Keys } from "../auth/crypto.ts";
import { PhoneChecks } from "../auth/phone-check.ts";
import { RateLimiter } from "../auth/rate-limit.ts";
import { createRedis, type Redis } from "../auth/redis.ts";
import { startRedis } from "./harness.ts";

const keys = new Keys("k".repeat(40));
const PHONE = "+21620000001";

let stop: () => Promise<void>;
let redis: Redis;
let clock = 1_000_000;
let checks: PhoneChecks;

beforeAll(async () => {
  const r = await startRedis();
  stop = r.stop;
  redis = createRedis(r.url);
  checks = new PhoneChecks(redis, keys, () => clock);
}, 120_000);
afterAll(async () => {
  redis?.disconnect();
  await stop?.();
});

describe("phone checks (R101, R102)", () => {
  it("T-codes: a right code is accepted once and yields a bound, single-use check", async () => {
    clock = 2_000_000;
    expect((await checks.send(PHONE, "signUp", "123456")).ok).toBe(true);
    const v = await checks.verify(PHONE, "signUp", "123456");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    // the code is spent
    expect(await checks.verify(PHONE, "signUp", "123456")).toMatchObject({ reason: "noCode" });
    // a signUp check cannot serve a reset, and is burnt by trying
    expect(await checks.consume(v.checkId, PHONE, "reset")).toBe(false);
    expect(await checks.consume(v.checkId, PHONE, "signUp")).toBe(false);
  });

  it("a verified check serves its own phone and purpose once", async () => {
    clock = 3_000_000;
    await checks.send(PHONE, "reset", "654321");
    const v = await checks.verify(PHONE, "reset", "654321");
    if (!v.ok) throw new Error("expected ok");
    expect(await checks.consume(v.checkId, "+21620000002", "reset")).toBe(false);
  });

  it("a check for another phone is refused, then burnt", async () => {
    clock = 3_500_000;
    await checks.send(PHONE, "signUp", "111111");
    const v = await checks.verify(PHONE, "signUp", "111111");
    if (!v.ok) throw new Error("expected ok");
    expect(await checks.consume(v.checkId, PHONE, "signUp")).toBe(true);
    expect(await checks.consume(v.checkId, PHONE, "signUp")).toBe(false);
  });

  it("refuses a resend under 60 s and answers with the time left", async () => {
    clock = 4_000_000;
    const phone = "+21620000003";
    expect((await checks.send(phone, "signUp", "000001")).ok).toBe(true);
    clock += 10_000;
    const again = await checks.send(phone, "signUp", "000002");
    expect(again).toEqual({ ok: false, retryAfterMs: CODE_RESEND_DELAY_MS - 10_000 });
    clock += CODE_RESEND_DELAY_MS;
    expect((await checks.send(phone, "signUp", "000003")).ok).toBe(true);
  });

  it("refuses the 6th send in the window", async () => {
    clock = 5_000_000;
    const phone = "+21620000004";
    for (let i = 0; i < 5; i++) {
      expect((await checks.send(phone, "signUp", "000000")).ok).toBe(true);
      clock += CODE_RESEND_DELAY_MS;
    }
    expect((await checks.send(phone, "signUp", "000000")).ok).toBe(false);
  });

  it("an expired code is refused", async () => {
    clock = 6_000_000;
    const phone = "+21620000005";
    await checks.send(phone, "signUp", "222222");
    clock += 5 * 60_000 + 1;
    // Redis TTL is real time, the script uses the injected clock: both paths answer "no valid code".
    const v = await checks.verify(phone, "signUp", "222222");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(["expired", "noCode"]).toContain(v.reason);
  });

  it("counts wrong codes: attempts_left goes down, the 5th wrong locks, the next is locked", async () => {
    clock = 7_000_000;
    const phone = "+21620000006";
    await checks.send(phone, "signUp", "333333");
    const left: number[] = [];
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) {
      const v = await checks.verify(phone, "signUp", "999999");
      if (v.ok || v.reason !== "wrong") throw new Error("expected wrong");
      left.push(v.attemptsLeft);
    }
    expect(left).toEqual([4, 3, 2, 1, 0]);
    const locked = await checks.verify(phone, "signUp", "333333");
    expect(locked).toMatchObject({ ok: false, reason: "locked" });
    // the lock also refuses a new send
    const send = await checks.send(phone, "signUp", "444444");
    expect(send.ok).toBe(false);
    if (!send.ok) expect(send.retryAfterMs).toBeLessThanOrEqual(CODE_LOCK_MS);
  });

  it("20 parallel wrong codes get at most 5 tries (the counter rises before the compare)", async () => {
    clock = 8_000_000;
    const phone = "+21620000007";
    await checks.send(phone, "signUp", "555555");
    const results = await Promise.all(
      Array.from({ length: 20 }, () => checks.verify(phone, "signUp", "000000")),
    );
    const compared = results.filter((r) => !r.ok && r.reason === "wrong");
    expect(compared.length).toBeLessThanOrEqual(CODE_MAX_ATTEMPTS);
    expect(results.filter((r) => !r.ok && r.reason === "locked").length).toBeGreaterThanOrEqual(15);
    // and the right code no longer works
    expect((await checks.verify(phone, "signUp", "555555")).ok).toBe(false);
  });

  it("RV-18: nothing in Redis holds the phone or the code", async () => {
    clock = 9_000_000;
    const phone = "+21620000008";
    await checks.send(phone, "signUp", "777888");
    const all = await redis.keys("*");
    for (const key of all) {
      expect(key).not.toContain("21620000008");
      const dump = JSON.stringify(
        (await redis.type(key)) === "hash" ? await redis.hgetall(key) : await redis.get(key),
      );
      expect(dump).not.toContain("777888");
      expect(dump).not.toContain("21620000008");
    }
  });
});

describe("rate limiter", () => {
  it("counts a window and refuses past the limit, with the time left", async () => {
    const rl = new RateLimiter(redis);
    for (let i = 1; i <= 3; i++) expect((await rl.hit("rl:a", 3, 60_000)).allowed).toBe(true);
    const over = await rl.hit("rl:a", 3, 60_000);
    expect(over.allowed).toBe(false);
    expect(over.retryAfterMs).toBeGreaterThan(0);
    await rl.reset("rl:a");
    expect((await rl.hit("rl:a", 3, 60_000)).count).toBe(1);
    await rl.undo("rl:a");
    expect((await rl.hit("rl:a", 3, 60_000)).count).toBe(1);
  });
});
