import type { Db } from "../db/index.ts";
import { DbIdempotencyStore } from "./idempotency-db.ts";

/** PROVISIONAL (not in the cahier): the worker purges the expired idempotency keys every hour, like the quotes. */
export const IDEMPOTENCY_PURGE_EVERY_MS = 60 * 60 * 1000;

/**
 * Deletes the idempotency keys that are past their 24 h (login `fastgo_worker`, which has select and delete on the table and may
 * only clear `orders.idempotency_scope`). The stored answer of an order holds names, phones and addresses, so it must not stay;
 * the scope of the order is freed with the key (R202). Returns how many keys it deleted.
 */
export async function purgeExpiredIdempotency(db: Db, now: () => Date = () => new Date()): Promise<number> {
  return new DbIdempotencyStore(db, () => now().getTime(), 300_000, db).purgeExpired();
}
