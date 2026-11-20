import type { ServiceCode } from "@fastgo/domain";
import type { OrderStatus } from "./states";

/**
 * The paging of the client's order list (C02), as one pure function: the mock and the api adapter
 * both feed it rows and get the same page (same filters, search, months and counts).
 */

/** Chips of C02: "en cours", "livrées", "échecs et retours". A canceled order shows under "all" only. */
export type OrderFilter = "all" | "inProgress" | "delivered" | "failed";

export const IN_PROGRESS: readonly OrderStatus[] = [
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
  service: ServiceCode;
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

/** `all` is every order of the account, newest first. */
export function buildOrdersPage(all: OrderRow[], query: OrdersQuery): OrdersPage {
  const needle = plain(query.q);
  const matching = all.filter(
    (row) =>
      (query.filter === "all" || FILTER_STATES[query.filter].includes(row.status)) &&
      (!query.month || monthOf(row.createdAt) === query.month) &&
      (!needle || plain(row.code).includes(needle) || plain(row.recipientName).includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(matching.length / ORDERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page), pages);
  return {
    rows: matching.slice((page - 1) * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE),
    total: matching.length,
    accountTotal: all.length,
    inProgressCount: all.filter((row) => IN_PROGRESS.includes(row.status)).length,
    months: [...new Set(all.map((row) => monthOf(row.createdAt)))],
    page,
    pages,
  };
}
