import { normalizeTrackingCode } from "../tracking-code";
import { seedOrderFixtures } from "./fixtures/orders";
import { readTable } from "./mock-db";
import {
  ACCOUNT_ORDERS,
  PARCELS,
  STATUS_EVENTS,
  type AccountOrder,
  type Parcel,
  type StatusEvent,
} from "./order-model";
import type { Session } from "./session";
import type { OrderStatus } from "./states";

/**
 * Readers of the account orders table (ADR-1, R405). The orders of an account are scoped by
 * `session.accountId`: another account's order answers exactly like an unknown code. Every reader
 * seeds the fixture orders first (once per device).
 */

/** The account's orders, newest first. */
export function listAccountOrders(session: Session): AccountOrder[] {
  seedOrderFixtures();
  return Object.values(readTable<AccountOrder>(ACCOUNT_ORDERS))
    .filter((order) => order.ownerAccountId === session.accountId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code));
}

export function getAccountOrder(session: Session, code: string): AccountOrder | { notFound: true } {
  seedOrderFixtures();
  const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[normalizeTrackingCode(code)];
  return order && order.ownerAccountId === session.accountId ? order : { notFound: true };
}

/** The parcels of an order, in index order. The caller has already checked the order is hers. */
export function parcelsOf(orderCode: string): Parcel[] {
  seedOrderFixtures();
  return Object.values(readTable<Parcel>(PARCELS))
    .filter((parcel) => parcel.orderCode === orderCode)
    .sort((a, b) => a.index - b.index);
}

/** The order's own events (not its parcels' or missions'), oldest first. */
export function orderHistory(orderCode: string): { status: OrderStatus; atUtc: string }[] {
  seedOrderFixtures();
  return Object.values(readTable<StatusEvent>(STATUS_EVENTS))
    .filter((event) => event.subjectType === "order" && event.subjectId === orderCode)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((event) => ({ status: event.toStatus as OrderStatus, atUtc: event.occurredAt }));
}
