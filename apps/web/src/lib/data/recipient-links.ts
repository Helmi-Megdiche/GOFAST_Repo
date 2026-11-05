import { RECIPIENT_LINK_AFTER_DELIVERY_MS } from "../order/constants";
import { readTable, writeRow } from "./mock-db";
import { RECIPIENT_LINKS } from "./order-model";

/** Row of fg.mock.recipientLinks, keyed by the token (ADR-3). */
type RecipientLinkRow = { orderCode: string; expiresAt: string | null };

/**
 * R406: once the order is final, its recipient link works for RECIPIENT_LINK_AFTER_DELIVERY_MS more.
 * Sets `expiresAt` on the order's link row, if there is one. `at` is epoch milliseconds.
 */
export function expireRecipientLink(orderCode: string, at: number): void {
  const links = readTable<RecipientLinkRow>(RECIPIENT_LINKS);
  for (const [token, row] of Object.entries(links)) {
    if (row.orderCode !== orderCode) continue;
    writeRow(RECIPIENT_LINKS, token, {
      ...row,
      expiresAt: new Date(at + RECIPIENT_LINK_AFTER_DELIVERY_MS).toISOString(),
    });
  }
}
