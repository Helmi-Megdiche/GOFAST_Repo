import { sql } from "drizzle-orm";
import ar from "@fastgo/i18n/messages/ar.json" with { type: "json" };
import en from "@fastgo/i18n/messages/en.json" with { type: "json" };
import fr from "@fastgo/i18n/messages/fr.json" with { type: "json" };
import type { Db } from "../db/index.ts";
import type { SmsSender } from "../auth/sms.ts";

export const TRACKING_SMS_TOPIC = "sms.tracking";
const MAX_ATTEMPTS = 3;
const templates = { fr: fr.apiSms.tracking, ar: ar.apiSms.tracking, en: en.apiSms.tracking } as const;

type Row = { id: string; attempts: number; payload: { order_id?: string } };

/** The text of the tracking SMS: the number and the link are the same in the three languages (R904). */
export function trackingText(locale: string, trackingNumber: string, webUrl: string): string {
  const t = templates[locale as keyof typeof templates] ?? templates.fr;
  const lang = locale in templates ? locale : "fr";
  return t.replace("{tracking_number}", trackingNumber).replace("{link}", `${webUrl}/${lang}/suivi?n=${trackingNumber}`);
}

/**
 * One pass over the tracking SMS of the outbox. The row holds a template key, the order and the language; the phone and
 * the number are read now, through `core.sms_tracking_payload` (nothing for a closed account, R105). After a send, or
 * after the last failed try, the payload is emptied. Returns how many rows were closed.
 */
export async function runTrackingSms(db: Db, sender: SmsSender, webUrl: string, now: () => Date = () => new Date()): Promise<number> {
  return db.withWorker(async (tx) => {
    const rows = (
      await tx.execute(sql`
        select id, attempts, payload from core.outbox
         where topic = ${TRACKING_SMS_TOPIC} and processed_at is null
         order by created_at limit 20 for update skip locked`)
    ).rows as Row[];
    let closed = 0;
    for (const row of rows) {
      let done = false;
      try {
        const found = (
          await tx.execute(sql`select core.sms_tracking_payload(${row.payload.order_id ?? null}::uuid) as p`)
        ).rows[0] as { p: { phone: string; tracking_number: string; locale: string } | null } | undefined;
        if (!found?.p) done = true; // nothing to send (a closed account): the row is closed and emptied
        else {
          await sender.send(found.p.phone, trackingText(found.p.locale, found.p.tracking_number, webUrl));
          done = true;
        }
      } catch {
        // the reason is not logged: it could hold a phone
      }
      const attempts = row.attempts + 1;
      if (done || attempts >= MAX_ATTEMPTS) {
        await tx.execute(sql`update core.outbox set attempts = ${attempts}, processed_at = ${now()}, payload = '{}'::jsonb where id = ${row.id}`);
        closed += 1;
      } else {
        await tx.execute(sql`update core.outbox set attempts = ${attempts} where id = ${row.id}`);
      }
    }
    return closed;
  });
}
