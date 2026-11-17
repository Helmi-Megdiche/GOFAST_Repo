import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";

/** PROVISIONAL (not in the cahier): the worker purges the expired quotes every hour. */
export const QUOTE_PURGE_EVERY_MS = 60 * 60 * 1000;

/**
 * Deletes the quotes whose `expires_at` is in the past (login `fastgo_worker`; the policy of 0008 lets it
 * delete an expired quote and nothing else). Returns how many it deleted.
 */
export async function purgeExpiredQuotes(db: Db, now: () => Date = () => new Date()): Promise<number> {
  return db.withWorker(async (tx) => {
    const r = await tx.execute(sql`delete from core.quotes where expires_at < ${now().toISOString()}::timestamptz returning id`);
    return r.rows.length;
  });
}
