import { type ProofLevel, exceedsWeightTolerance, normalizeTrackingCode } from "@fastgo/domain";
import { findById } from "./accounts";
import { amountDueMillimes } from "./amount-due";
import { cancelOption, type CancelOption } from "./cancel-option";
import { mockDelay } from "./delay";
import { seedOrderFixtures } from "./fixtures/orders";
import { consumeFailNext, readTable } from "./mock-db";
import {
  ACCOUNT_ORDERS,
  PARCELS,
  STATUS_EVENTS,
  type AccountOrder,
  type FailureReason,
  type Parcel,
  type StatusEvent,
} from "./order-model";
import { NetworkError, ORDER_SLIP_EXAMPLE_PATH } from "./orders";
import {
  buildOrdersPage,
  type OrderFilter,
  type OrderRow,
  type OrdersPage,
  type OrdersQuery,
} from "./orders-page";
import type { Session } from "./session";
import {
  activePickupMission,
  FINAL_ORDER_STATES,
  type OrderStatus,
  type ParcelStatus,
} from "./states";

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

// ── Async readers of the client space (C01 to C03). Codes, millimes and ISO dates only. ──────────

export { ORDERS_PAGE_SIZE, monthOf } from "./orders-page";
export type { OrderFilter, OrderRow, OrdersPage, OrdersQuery };

/** What C01 calls "en cours": every order that is not over, including a failed pickup the client may still act on. */
const isOpen = (status: OrderStatus) => !FINAL_ORDER_STATES.includes(status);

const rowOf = (order: AccountOrder): OrderRow => ({
  code: order.code,
  recipientName: order.recipient.name,
  service: order.service,
  status: order.status,
  createdAt: order.createdAt,
  totalMillimes: order.totalMillimes,
});

/** Mock of GET /v1/orders: the account's orders, filtered and paged. `consumeFailNext("listOrders")` cuts it. */
export async function listOrders(session: Session, query: OrdersQuery): Promise<OrdersPage> {
  await mockDelay();
  if (consumeFailNext("listOrders")) throw new NetworkError();
  return buildOrdersPage(listAccountOrders(session).map(rowOf), query);
}

export type Dashboard = {
  /** First name only, for the greeting. */
  firstName: string;
  inProgress: (OrderRow & { etaUtc: string | null; parcelCount: number })[];
  /** The last three orders that ended (not canceled), newest first. */
  lastDeliveries: OrderRow[];
  /** What the account owes: its unpaid invoices and its return balance (R605), from `amountDueMillimes`. */
  amountDueMillimes: number;
};

/** Mock of the data behind C01 (ESP-03). */
export async function getDashboard(session: Session): Promise<Dashboard> {
  await mockDelay();
  if (consumeFailNext("listOrders")) throw new NetworkError();
  const all = listAccountOrders(session);
  return {
    firstName: (findById(session.accountId)?.name ?? "").split(" ")[0] ?? "",
    inProgress: all
      .filter((order) => isOpen(order.status))
      .map((order) => ({
        ...rowOf(order),
        etaUtc: order.etaUtc,
        parcelCount: parcelsOf(order.code).filter((p) => p.status !== "canceled").length,
      })),
    lastDeliveries: all
      .filter((order) => FINAL_ORDER_STATES.includes(order.status) && order.status !== "canceled")
      .slice(0, 3)
      .map(rowOf),
    amountDueMillimes: amountDueMillimes(session.accountId),
  };
}

export type TimelineEntry =
  | { kind: "order"; status: OrderStatus; atUtc: string }
  | { kind: "deliveryFailed"; parcelIndex: number; reason: FailureReason | null; atUtc: string };

export type ParcelView = {
  index: number;
  barcode: string;
  size: Parcel["size"];
  fragile: boolean;
  status: ParcelStatus;
  attempts: number;
  weightDeclaredG: number;
  weightMeasuredG: number | null;
  /** R208: the measured weight is above the declared weight plus the tolerance. */
  weightOverTolerance: boolean;
  failureReason: FailureReason | null;
  /** SUI-05: the proof of delivery, once the parcel is handed over. */
  proof: { level: ProofLevel; capturedAt: string } | null;
};

export type PriceLineView = Omit<AccountOrder["priceLines"][number], "millimes"> & {
  millimes: number | null;
};

export type OrderDetail = {
  code: string;
  createdAt: string;
  service: AccountOrder["service"];
  status: OrderStatus;
  etaUtc: string | null;
  lossReported: boolean;
  /** Names and addresses only: a phone is never shown in the client space (privacy rule). */
  sender: { name: string; address: string | null };
  recipient: { name: string; address: string | null };
  /** The price fixed at creation (R204, R206), never priced again. */
  totalMillimes: number;
  /** `millimes` is null for a VAT or stamp line the server has not confirmed yet (shown as [PRIX]). */
  priceLines: PriceLineView[];
  paymentMode: AccountOrder["paymentMode"];
  cancel: AccountOrder["cancel"];
  /** `freeUnlessArrived`: the API order carries no mission, so the driver's arrival is unknown (RV-28). */
  cancelOption: DetailCancelOption;
  parcels: ParcelView[];
  timeline: TimelineEntry[];
  /** Null when the source has no slip (the API path): the button is hidden, never an empty link. */
  slipHref: string | null;
};

export type DetailCancelOption = CancelOption | "freeUnlessArrived";

export type OrderDetailResult = { status: "found"; order: OrderDetail } | { status: "notFound" };

/** Mock of GET /v1/orders/{code}. Another account's order answers exactly like an unknown code. */
export async function getOrderDetail(session: Session, code: string): Promise<OrderDetailResult> {
  await mockDelay();
  if (consumeFailNext("getOrder")) throw new NetworkError();
  const order = getAccountOrder(session, code);
  if ("notFound" in order) return { status: "notFound" };
  const parcels = parcelsOf(order.code);
  const failures = Object.values(readTable<StatusEvent>(STATUS_EVENTS)).filter(
    (event) =>
      event.subjectType === "parcel" &&
      event.toStatus === "delivery_failed" &&
      parcels.some((p) => p.id === event.subjectId),
  );
  const timeline: TimelineEntry[] = [
    ...orderHistory(order.code).map((e): TimelineEntry => ({ kind: "order", ...e })),
    ...failures.map((event): TimelineEntry => {
      const parcel = parcels.find((p) => p.id === event.subjectId)!;
      return {
        kind: "deliveryFailed",
        parcelIndex: parcel.index,
        reason: event.reason ?? null,
        atUtc: event.occurredAt,
      };
    }),
  ].sort((a, b) => a.atUtc.localeCompare(b.atUtc));
  return {
    status: "found",
    order: {
      code: order.code,
      createdAt: order.createdAt,
      service: order.service,
      status: order.status,
      etaUtc: order.etaUtc,
      lossReported: order.lossReported,
      sender: { name: order.sender.name, address: order.sender.address },
      recipient: { name: order.recipient.name, address: order.recipient.address },
      totalMillimes: order.totalMillimes,
      priceLines: order.priceLines,
      paymentMode: order.paymentMode,
      cancel: order.cancel,
      cancelOption: cancelOption(order, activePickupMission(order.code)),
      parcels: parcels.map((p) => ({
        index: p.index,
        barcode: p.barcode,
        size: p.size,
        fragile: p.fragile,
        status: p.status,
        attempts: p.attempts,
        weightDeclaredG: p.weightDeclaredG,
        weightMeasuredG: p.weightMeasuredG,
        weightOverTolerance: exceedsWeightTolerance(p.weightDeclaredG, p.weightMeasuredG),
        failureReason: p.failure?.reason ?? null,
        proof: p.proof ? { level: p.proof.kind, capturedAt: p.proof.capturedAt } : null,
      })),
      timeline,
      slipHref: ORDER_SLIP_EXAMPLE_PATH,
    },
  };
}
