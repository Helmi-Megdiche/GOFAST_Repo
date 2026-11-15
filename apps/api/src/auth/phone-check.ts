import { createHash, randomUUID } from "node:crypto";
import {
  CODE_LOCK_MS,
  CODE_MAX_ATTEMPTS,
  CODE_MAX_SENDS,
  CODE_RESEND_DELAY_MS,
  CODE_SEND_WINDOW_MS,
  CODE_VALIDITY_MS,
  CODE_VERIFIED_WINDOW_MS,
} from "@fastgo/domain";
import type { Redis } from "ioredis";
import type { Keys } from "./crypto.ts";

export type Purpose = "order" | "signUp" | "reset" | "googlePhone";

export type SendResult =
  | { ok: true; expiresAt: number; resendAt: number }
  | { ok: false; retryAfterMs: number };

export type VerifyResult =
  | { ok: true; checkId: string; validUntil: number }
  | { ok: false; reason: "wrong" | "expired" | "noCode"; attemptsLeft: number }
  | { ok: false; reason: "locked"; retryAfterMs: number };

/**
 * Send: refuse while locked, while the last send is under the resend delay, or after too many sends
 * in the window. Otherwise store the HMAC of the new code (never the code).
 * KEYS: hash, lock, sends. ARGV: now, codeMac, validity, resend, maxSends, sendWindow.
 */
const SEND = `
local now = tonumber(ARGV[1])
local lock = redis.call('PTTL', KEYS[2])
if lock > 0 then return {'blocked', lock} end
local sentAt = tonumber(redis.call('HGET', KEYS[1], 'sentAt'))
if sentAt and now - sentAt < tonumber(ARGV[4]) then return {'blocked', tonumber(ARGV[4]) - (now - sentAt)} end
local sends = tonumber(redis.call('GET', KEYS[3]) or '0')
if sends >= tonumber(ARGV[5]) then
  local ttl = redis.call('PTTL', KEYS[3])
  if ttl < 1 then ttl = tonumber(ARGV[6]) end
  return {'blocked', ttl}
end
if redis.call('INCR', KEYS[3]) == 1 then redis.call('PEXPIRE', KEYS[3], ARGV[6]) end
local exp = now + tonumber(ARGV[3])
redis.call('HSET', KEYS[1], 'code', ARGV[2], 'exp', exp, 'tries', 0, 'sentAt', now)
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return {'ok', exp, now + tonumber(ARGV[4])}
`;

/**
 * Verify. The tries counter is raised BEFORE the compare and in the same script, so parallel wrong
 * codes cannot get more than the allowed tries: the (max+1)th and later find the lock.
 * KEYS: hash, lock, verified. ARGV: now, codeMac, maxTries, lockMs, verifiedTtl, binding.
 */
const VERIFY = `
local now = tonumber(ARGV[1])
local lock = redis.call('PTTL', KEYS[2])
if lock > 0 then return {'locked', lock} end
if redis.call('EXISTS', KEYS[1]) == 0 then return {'noCode'} end
if now >= tonumber(redis.call('HGET', KEYS[1], 'exp')) then
  redis.call('DEL', KEYS[1])
  return {'expired'}
end
local tries = redis.call('HINCRBY', KEYS[1], 'tries', 1)
local max = tonumber(ARGV[3])
if tries > max then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[4])
  redis.call('DEL', KEYS[1])
  return {'locked', tonumber(ARGV[4])}
end
if redis.call('HGET', KEYS[1], 'code') == ARGV[2] then
  redis.call('DEL', KEYS[1])
  redis.call('SET', KEYS[3], ARGV[6], 'PX', ARGV[5])
  return {'ok'}
end
if tries >= max then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[4])
  redis.call('DEL', KEYS[1])
end
return {'wrong', max - tries}
`;

/** Phone checks (R101, R102): the code lives as an HMAC in Redis, bound to phone and purpose. */
export class PhoneChecks {
  constructor(
    private readonly redis: Redis,
    private readonly keys: Keys,
    private readonly now: () => number = Date.now,
  ) {}

  private slot(phone: string, purpose: Purpose) {
    const m = this.keys.mac("phone-check", `${phone}|${purpose}`);
    return { hash: `pc:${m}`, lock: `pcl:${m}`, sends: `pcs:${m}`, binding: m };
  }

  private codeMac(phone: string, purpose: Purpose, code: string): string {
    return this.keys.mac("code", `${phone}|${purpose}|${code}`);
  }

  async send(phone: string, purpose: Purpose, code: string): Promise<SendResult> {
    const s = this.slot(phone, purpose);
    const r = (await this.redis.eval(
      SEND,
      3,
      s.hash,
      s.lock,
      s.sends,
      this.now(),
      this.codeMac(phone, purpose, code),
      CODE_VALIDITY_MS,
      CODE_RESEND_DELAY_MS,
      CODE_MAX_SENDS,
      CODE_SEND_WINDOW_MS,
    )) as [string, number, number?];
    if (r[0] === "ok") return { ok: true, expiresAt: Number(r[1]), resendAt: Number(r[2]) };
    return { ok: false, retryAfterMs: Number(r[1]) };
  }

  async verify(phone: string, purpose: Purpose, code: string): Promise<VerifyResult> {
    const s = this.slot(phone, purpose);
    const checkId = randomUUID();
    const now = this.now();
    const r = (await this.redis.eval(
      VERIFY,
      3,
      s.hash,
      s.lock,
      verifiedKey(checkId),
      now,
      this.codeMac(phone, purpose, code),
      CODE_MAX_ATTEMPTS,
      CODE_LOCK_MS,
      CODE_VERIFIED_WINDOW_MS,
      s.binding,
    )) as [string, number?];
    switch (r[0]) {
      case "ok":
        return { ok: true, checkId, validUntil: now + CODE_VERIFIED_WINDOW_MS };
      case "locked":
        return { ok: false, reason: "locked", retryAfterMs: Number(r[1]) };
      case "wrong":
        return { ok: false, reason: "wrong", attemptsLeft: Number(r[1]) };
      case "expired":
        return { ok: false, reason: "expired", attemptsLeft: 0 };
      default:
        return { ok: false, reason: "noCode", attemptsLeft: 0 };
    }
  }

  /**
   * Uses a verified check, once. It is burnt even when it does not match this phone and purpose
   * (a `signUp` check cannot reset a password, and cannot be tried again for something else).
   */
  async consume(checkId: string, phone: string, purpose: Purpose): Promise<boolean> {
    const stored = await this.redis.getdel(verifiedKey(checkId));
    return stored !== null && stored === this.slot(phone, purpose).binding;
  }
}

function verifiedKey(checkId: string): string {
  return `pcv:${createHash("sha256").update(checkId).digest("base64url")}`;
}
