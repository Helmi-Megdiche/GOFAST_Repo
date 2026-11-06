import type { OrderFilter, OrdersQuery } from "../data/account-orders";

/**
 * The C02 filters live in the URL (`?statut=&mois=&q=&page=`): the URL is the source of truth, so a
 * reload or a shared link shows the same list. Anything unreadable falls back to the default.
 */
const SLUG_TO_FILTER: Record<string, Exclude<OrderFilter, "all">> = {
  "en-cours": "inProgress",
  livrees: "delivered",
  echecs: "failed",
};
const FILTER_TO_SLUG: Record<Exclude<OrderFilter, "all">, string> = {
  inProgress: "en-cours",
  delivered: "livrees",
  failed: "echecs",
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_SEARCH_LENGTH = 60;
const MAX_PAGE = 9999;

export function parseOrdersQuery(params: { get(name: string): string | null }): OrdersQuery {
  const month = params.get("mois") ?? "";
  const page = Number(params.get("page") ?? "1");
  return {
    filter: SLUG_TO_FILTER[params.get("statut") ?? ""] ?? "all",
    month: MONTH.test(month) ? month : null,
    q: (params.get("q") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The URL parameters of a query: defaults are left out, so "all orders" is a clean URL. */
export function ordersQueryToParams(query: OrdersQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.filter !== "all") params.statut = FILTER_TO_SLUG[query.filter];
  if (query.month) params.mois = query.month;
  if (query.q) params.q = query.q;
  if (query.page > 1) params.page = String(query.page);
  return params;
}
