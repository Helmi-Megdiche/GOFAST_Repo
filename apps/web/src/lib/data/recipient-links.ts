import type { Locale } from "@fastgo/i18n";
import { RECIPIENT_LINK_AFTER_DELIVERY_MS } from "../order/constants";
import { readTable, writeRow } from "./mock-db";
import { RECIPIENT_LINKS } from "./order-model";

/** Row of fg.mock.recipientLinks, keyed by the token (ADR-3). */
type RecipientLinkRow = { orderCode: string; locale: Locale; expiresAt: string | null };

function systemRandomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/**
 * The recipient link token: 16 random bytes as 22 base64url characters. Random only, so it never
 * contains the tracking code and cannot be guessed from it.
 */
export function mintRecipientToken(
  randomBytes: (n: number) => Uint8Array = systemRandomBytes,
): string {
  const bytes = randomBytes(16);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < 15; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      alphabet[(n >> 18) & 63]! +
      alphabet[(n >> 12) & 63]! +
      alphabet[(n >> 6) & 63]! +
      alphabet[n & 63]!;
  }
  // The 16th byte: 8 bits, two characters (the last 4 bits are padding zeros).
  const last = bytes[15]!;
  return out + alphabet[last >> 2]! + alphabet[(last & 3) << 4]!;
}

/** Creates the recipient link of an order (no expiry until the order is final) and returns its token. */
export function mintRecipientLink(orderCode: string, locale: Locale): string {
  const links = readTable<RecipientLinkRow>(RECIPIENT_LINKS);
  let token = mintRecipientToken();
  while (links[token]) token = mintRecipientToken();
  writeRow<RecipientLinkRow>(RECIPIENT_LINKS, token, { orderCode, locale, expiresAt: null });
  return token;
}

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
