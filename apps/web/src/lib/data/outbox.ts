import type { Locale } from "@fastgo/i18n";
import { now } from "../order/clock";
import { writeRow } from "./mock-db";
import { OUTBOX } from "./order-model";

/**
 * A message the platform would send (mock). Stored as a template name, its parameters and a
 * locale, never as rendered text: the SMS gateway renders it from the catalogs.
 */
export type OutboxMessage = {
  id: string;
  ownerAccountId: string | null;
  orderCode: string;
  channel: "sms";
  template: "trackingLink";
  params: {
    /** Both erased when the sender closes their account (R105): the template and the locale stay. */
    senderName?: string;
    senderPhone?: string | null;
    trackingCode: string;
    linkToken: string;
  };
  locale: Locale;
  /** ISO UTC. */
  createdAt: string;
};

export function writeOutbox(message: Omit<OutboxMessage, "id" | "createdAt">): void {
  const id = crypto.randomUUID();
  writeRow<OutboxMessage>(OUTBOX, id, {
    ...message,
    id,
    createdAt: new Date(now()).toISOString(),
  });
}
