import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";

/** PROVISIONAL (not in the cahier): the worker purges the expired quotes every hour. */
export const QUOTE_PURGE_EVERY_MS = 60 * 60 * 1000;
/** PROVISIONAL (supervisor, #22): a quote is kept this long after its expiry, so an order placed across the expiry answers 410, not 404. 0011 holds the same delay in the policy. */
export const QUOTE_KEEP_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes the quotes that expired more than `QUOTE_KEEP_AFTER_EXPIRY_MS` ago (login `fastgo_worker`; the policy of
 * 0011 lets it delete such a quote and nothing else). Returns how many it deleted.
 */
export async function purgeExpiredQuotes(db: Db, now: () => Date = () => new Date()): Promise<number> {
  return db.withWorker(async (tx) => {
    const r = await tx.execute(sql`delete from core.quotes where expires_at < ${new Date(now().getTime() - QUOTE_KEEP_AFTER_EXPIRY_MS).toISOString()}::timestamptz returning id`);
    return r.rows.length;
  });
}
