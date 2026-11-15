import type { Redis } from "ioredis";

/**
 * Fixed-window counters in Redis. The caller passes a key already hashed with `Keys.mac`, so no
 * phone, e-mail or IP is readable in Redis (RV-18).
 */
export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  /** Counts one hit and says whether the limit is passed. `retryAfterMs` is the rest of the window. */
  async hit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; count: number; retryAfterMs: number }> {
    const res = await this.redis
      .multi()
      .set(key, 0, "PX", windowMs, "NX")
      .incr(key)
      .pttl(key)
      .exec();
    const count = Number(res?.[1]?.[1] ?? 0);
    const ttl = Number(res?.[2]?.[1] ?? windowMs);
    return { allowed: count <= limit, count, retryAfterMs: ttl > 0 ? ttl : windowMs };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /** Takes a hit back (a successful sign-in does not count against the IP). */
  async undo(key: string): Promise<void> {
    await this.redis.eval("if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('DECR', KEYS[1]) end return 0", 1, key);
  }
}
