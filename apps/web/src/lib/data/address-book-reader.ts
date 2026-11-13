import {
  listAddresses,
  savedRecipients,
  type SavedAddress,
  type SavedRecipient,
} from "./address-book";
import { mockDelay } from "./delay";
import { consumeFailNext } from "./mock-db";
import { NetworkError } from "./orders";
import type { Session } from "./session";

/** Mock of GET /v1/addresses and GET /v1/recipients, for C08. Apart from address-book.ts so orders.ts can save recipients without a cycle. */
export async function loadAddressBook(
  session: Session,
): Promise<{ addresses: SavedAddress[]; recipients: SavedRecipient[] }> {
  await mockDelay();
  if (consumeFailNext("loadAddressBook")) throw new NetworkError();
  return { addresses: listAddresses(session), recipients: savedRecipients(session) };
}
