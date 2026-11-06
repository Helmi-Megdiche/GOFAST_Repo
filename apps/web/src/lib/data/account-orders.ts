import type { ProofLevel } from "../order/proof";
import { exceedsWeightTolerance } from "../order/weight";
import { normalizeTrackingCode } from "../tracking-code";
import { findById, returnBalanceMillimes } from "./accounts";
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

/** Chips of C02: "en cours", "livrées", "échecs et retours". A canceled order shows under "all" only. */
export type OrderFilter = "all" | "inProgress" | "delivered" | "failed";

const IN_PROGRESS: readonly OrderStatus[] = [
  "received",
  "confirmed",
  "assigned",
  "picked_up",
  "in_transit",
];
const FILTER_STATES: Record<Exclude<OrderFilter, "all">, readonly OrderStatus[]> = {
  inProgress: IN_PROGRESS,
  delivered: ["delivered"],
  failed: ["pickup_failed", "partially_delivered", "returned", "lost"],
};

export const ORDERS_PAGE_SIZE = 10;

export type OrderRow = {
  code: string;
  recipientName: string;
  service: AccountOrder["service"];
  status: OrderStatus;
  createdAt: string;
  totalMillimes: number;
};

export type OrdersQuery = {
  filter: OrderFilter;
  /** "YYYY-MM" in Africa/Tunis, or null for every month. */
  month: string | null;
  /** Search text: part of the tracking code or of the recipient's name. */
  q: string;
  /** 1-based. */
  page: number;
};

export type OrdersPage = {
  rows: OrderRow[];
  /** Orders matching the filter, month and search (every page). */
  total: number;
  /** Orders of the account, whatever the filter. */
  accountTotal: number;
  inProgressCount: number;
  /** Months with at least one order, newest first, "YYYY-MM". */
  months: string[];
  page: number;
  pages: number;
};

const tunisMonth = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Tunis",
  year: "numeric",
  month: "2-digit",
});

/** The month of an instant in Africa/Tunis, "YYYY-MM". */
export function monthOf(isoUtc: string): string {
  const parts = tunisMonth.formatToParts(new Date(isoUtc));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}`;
}

/** Lower case, no accents, no spaces or dashes: "fg-5a1c 0002" finds FG-5A1C-0002. */
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "");

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
  const all = listAccountOrders(session);
  const needle = plain(query.q);
  const matching = all.filter(
    (order) =>
      (query.filter === "all" || FILTER_STATES[query.filter].includes(order.status)) &&
      (!query.month || monthOf(order.createdAt) === query.month) &&
      (!needle ||
        plain(order.code).includes(needle) ||
        plain(order.recipient.name).includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(matching.length / ORDERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page), pages);
  return {
    rows: matching.slice((page - 1) * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE).map(rowOf),
    total: matching.length,
    accountTotal: all.length,
    inProgressCount: all.filter((order) => IN_PROGRESS.includes(order.status)).length,
    months: [...new Set(all.map((order) => monthOf(order.createdAt)))],
    page,
    pages,
  };
}

export type Dashboard = {
  /** First name only, for the greeting. */
  firstName: string;
  inProgress: (OrderRow & { etaUtc: string | null; parcelCount: number })[];
  /** The last three orders that ended (not canceled), newest first. */
  lastDeliveries: OrderRow[];
  /** R605: what the account owes for returned parcels. */
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
      .filter((order) => IN_PROGRESS.includes(order.status))
      .map((order) => ({
        ...rowOf(order),
        etaUtc: order.etaUtc,
        parcelCount: parcelsOf(order.code).filter((p) => p.status !== "canceled").length,
      })),
    lastDeliveries: all
      .filter((order) => FINAL_ORDER_STATES.includes(order.status) && order.status !== "canceled")
      .slice(0, 3)
      .map(rowOf),
    amountDueMillimes: returnBalanceMillimes(session.accountId),
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

export type OrderDetail = {
  code: string;
  createdAt: string;
  service: AccountOrder["service"];
  status: OrderStatus;
  etaUtc: string | null;
  lossReported: boolean;
  /** Names and addresses only: a phone is never shown in the client space (privacy rule). */
  sender: { name: string; address: string };
  recipient: { name: string; address: string };
  /** The price fixed at creation (R204, R206), never priced again. */
  totalMillimes: number;
  priceLines: AccountOrder["priceLines"];
  paymentMode: AccountOrder["paymentMode"];
  cancel: AccountOrder["cancel"];
  cancelOption: CancelOption;
  parcels: ParcelView[];
  timeline: TimelineEntry[];
  slipHref: string;
};

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
        reason: parcel.failure?.reason ?? null,
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
