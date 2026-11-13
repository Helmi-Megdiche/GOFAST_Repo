import { now } from "../order/clock";
import { writeManyJson } from "../storage";
import { ACCOUNTS_TABLE, findById } from "./accounts";
import { listAccountOrders } from "./account-orders";
import { addressBookWithout } from "./address-book";
import { amountDueMillimes } from "./amount-due";
import { mockDelay } from "./delay";
import { readTable } from "./mock-db";
import { ACCOUNT_ORDERS, CLOSED_ACCOUNT_NAME, OUTBOX, type AccountOrder } from "./order-model";
import type { OutboxMessage } from "./outbox";
import { signOut, type Session } from "./session";
import { FINAL_ORDER_STATES } from "./states";

export { CLOSED_ACCOUNT_NAME };

export type CloseBlocker = "activeOrder" | "amountDue";

/**
 * Why this session cannot close its account right now, or null. Also "notAllowed": only an
 * individual customer closes an account here (closing a company is back-office work, R105).
 */
export function closeBlocker(session: Session): CloseBlocker | "notAllowed" | null {
  // The stored account decides, never the fields the session carries (RV-19): an individual's active
  // customer row, called by that person themselves.
  const stored = findById(session.accountId);
  if (
    !stored ||
    stored.kind !== "customer" ||
    stored.status !== "active" ||
    session.userId !== session.accountId ||
    session.role !== null
  ) {
    return "notAllowed";
  }
  if (listAccountOrders(session).some((order) => !FINAL_ORDER_STATES.includes(order.status))) {
    return "activeOrder";
  }
  // The one reader C01 and C04 show (RV-15): unpaid invoices and the return balance.
  return amountDueMillimes(session.accountId) > 0 ? "amountDue" : null;
}

export type CloseResult =
  { status: "closed" } | { status: "refused"; reason: CloseBlocker } | { status: "notAllowed" };

/**
 * Mock of closing an account (R105, T37). "Fermer un compte efface l'identité de la personne ; les
 * pièces comptables restent conservées." Every refusal comes before the first write; then one write
 * sets the account closed and erases the identity (which frees the phone and the e-mail, R101), turns
 * the person's own order copies and their outbox messages anonymous, and empties the address book.
 * Recipient copies are not the person's identity and stay. No order, parcel, invoice, credit note,
 * claim or event is deleted. Then the session ends.
 */
export async function closeAccount(session: Session): Promise<CloseResult> {
  await mockDelay();
  const blocker = closeBlocker(session);
  if (blocker === "notAllowed") return { status: "notAllowed" };
  if (blocker) return { status: "refused", reason: blocker };
  const account = findById(session.accountId);
  if (!account || account.status !== "active") return { status: "notAllowed" };

  const orders = readTable<AccountOrder>(ACCOUNT_ORDERS);
  const anonymousOrders = Object.fromEntries(
    Object.entries(orders).map(([code, order]) => [
      code,
      order.ownerAccountId === account.id
        ? { ...order, sender: { ...order.sender, name: CLOSED_ACCOUNT_NAME, phone: null } }
        : order,
    ]),
  );
  const outbox = readTable<OutboxMessage>(OUTBOX);
  const anonymousOutbox = Object.fromEntries(
    Object.entries(outbox).map(([id, message]) => {
      if (message.ownerAccountId !== account.id) return [id, message];
      // The sender's name and phone leave the params; the template and the locale stay.
      const params = { ...message.params };
      delete params.senderName;
      delete params.senderPhone;
      return [id, { ...message, params }];
    }),
  );
  const closed = {
    ...account,
    status: "closed" as const,
    closedAt: new Date(now()).toISOString(),
    name: null,
    phone: null,
    email: null,
    google: false,
  };

  writeManyJson([
    [ACCOUNTS_TABLE, { ...readTable(ACCOUNTS_TABLE), [account.id]: closed }],
    [ACCOUNT_ORDERS, anonymousOrders],
    [OUTBOX, anonymousOutbox],
    ...addressBookWithout(account.id),
  ]);
  signOut();
  return { status: "closed" };
}
