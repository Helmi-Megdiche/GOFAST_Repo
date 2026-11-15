import { sql } from "drizzle-orm";
import { CODE_VALIDITY_MS } from "@fastgo/domain";
import type { Db } from "../db/index.ts";
import { codeText, type SmsSender } from "./sms.ts";

export const SMS_TOPIC = "sms.code";
export const MAX_SMS_ATTEMPTS = 3;

type Row = { id: string; attempts: number; payload: { phone?: string; code?: string; locale?: string } };

/**
 * One pass over the SMS rows of the outbox. After a send, or after the last failed try, the payload
 * is emptied to `{}` (the policy of 0006 refuses a processed row that still holds a payload): the
 * table keeps no code and no phone. Returns how many rows were closed.
 */
export async function runSmsOutbox(db: Db, sender: SmsSender, now: () => Date = () => new Date()): Promise<number> {
  return db.withWorker(async (tx) => {
    const rows = (
      await tx.execute(sql`
        select id, attempts, payload from core.outbox
         where topic = ${SMS_TOPIC} and processed_at is null
         order by created_at limit 20 for update skip locked`)
    ).rows as Row[];
    let closed = 0;
    for (const row of rows) {
      let sent = false;
      try {
        const { phone, code, locale } = row.payload;
        if (!phone || !code) throw new Error("incomplete payload");
        await sender.send(phone, codeText(locale ?? "fr", code, CODE_VALIDITY_MS / 60_000));
        sent = true;
      } catch {
        // the reason is not logged: it could hold the phone
      }
      const attempts = row.attempts + 1;
      if (sent || attempts >= MAX_SMS_ATTEMPTS) {
        await tx.execute(
          sql`update core.outbox set attempts = ${attempts}, processed_at = ${now()}, payload = '{}'::jsonb where id = ${row.id}`,
        );
        closed += 1;
      } else {
        await tx.execute(sql`update core.outbox set attempts = ${attempts} where id = ${row.id}`);
      }
    }
    return closed;
  });
}
