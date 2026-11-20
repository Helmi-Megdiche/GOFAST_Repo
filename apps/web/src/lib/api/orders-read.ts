import { cancelOption, isValidTrackingCode, normalizeTrackingCode } from "@fastgo/domain";
import type { components } from "@fastgo/contract";
import {
  type DetailCancelOption,
  type OrderDetail,
  type OrderDetailResult,
  type TimelineEntry,
} from "../data/account-orders";
import { CLOSED_ACCOUNT_NAME } from "../data/order-model";
import type { CancelResult } from "../data/cancel";
import type { OrdersPort } from "../data/ports";
import { buildOrdersPage, type OrderRow } from "../data/orders-page";
import type { TrackingResult } from "../data/tracking";
import type { createApiClient } from "./client";
import { AuthRequiredError, ServerError, asErrorBody, traceIdOf } from "./errors";

type Client = ReturnType<typeof createApiClient>;
type ApiOrder = components["schemas"]["Order"];
type ApiTracking = components["schemas"]["PublicTracking"];

/** Rows asked per page: the client space filters and pages locally (shared with the mock). */
const PAGE = 100;
/** A stop for a cursor that never ends. 100 pages of 100 is 10 000 orders. */
const MAX_PAGES = 100;

/** 401 means the session is gone; every other refusal has no message of its own here. */
function fail(status: number, error: unknown): never {
  if (status === 401) throw new AuthRequiredError();
  throw new ServerError(traceIdOf(error));
}

const rowOf = (order: ApiOrder): OrderRow => ({
  code: order.tracking_number,
  recipientName: order.recipient.name ?? CLOSED_ACCOUNT_NAME,
  service: order.service,
  status: order.status,
  createdAt: order.created_at,
  totalMillimes: order.total_millimes,
});

async function listAll(client: Client): Promise<ApiOrder[]> {
  const all: ApiOrder[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const { data, error, response } = await client.GET("/v1/orders", {
      params: { query: { limit: PAGE, ...(cursor ? { cursor } : {}) } },
    });
    if (!response.ok || !data) fail(response.status, error);
    all.push(...data.items);
    if (!data.next_cursor) return all;
    cursor = data.next_cursor;
  }
  // A list that never ends is an error: a silently cut list would hide orders.
  throw new ServerError(null);
}

/** The API addresses an order by id; the screens by tracking number. */
async function idOf(client: Client, code: string): Promise<string | null> {
  // A malformed number is "not found" (the API would answer 400, which is not a server fault).
  if (!isValidTrackingCode(code)) return null;
  const tracking = normalizeTrackingCode(code);
  const { data, error, response } = await client.GET("/v1/orders", {
    params: { query: { tracking, limit: 1 } },
  });
  if (!response.ok || !data) fail(response.status, error);
  return data.items[0]?.id ?? null;
}

async function readOrder(client: Client, id: string): Promise<ApiOrder | null> {
  const { data, error, response } = await client.GET("/v1/orders/{id}", {
    params: { path: { id } },
  });
  if (response.status === 404) return null;
  if (!response.ok || !data) fail(response.status, error);
  return data;
}

async function readHistory(client: Client, code: string): Promise<ApiTracking> {
  const { data, error, response } = await client.GET("/v1/tracking/{number}", {
    params: { path: { number: code } },
  });
  if (!response.ok || !data) fail(response.status, error);
  return data;
}

/**
 * The detail screen also shows what the API order does not carry (measured weight, failure reason,
 * proof, fragile flag): those stay at their empty value until the contract adds them.
 */
/**
 * The driver's arrival (R-cancel) is on the mission, which the API order does not carry: for
 * `assigned` the screen says "free unless the driver has arrived" instead of a fact (RV-28).
 */
function cancelOptionOf(status: ApiOrder["status"]): DetailCancelOption {
  return status === "assigned" ? "freeUnlessArrived" : cancelOption({ status }, null);
}

function detailOf(order: ApiOrder, history: ApiTracking): OrderDetail {
  const timeline: TimelineEntry[] = history.history.map((e) => ({
    kind: "order",
    status: e.status,
    atUtc: e.at,
  }));
  return {
    code: order.tracking_number,
    createdAt: order.created_at,
    service: order.service,
    status: order.status,
    etaUtc: order.eta_at,
    lossReported: order.loss_reported,
    sender: { name: order.sender.name ?? CLOSED_ACCOUNT_NAME, address: order.sender.address },
    recipient: { name: order.recipient.name ?? CLOSED_ACCOUNT_NAME, address: order.recipient.address },
    totalMillimes: order.total_millimes,
    priceLines: order.lines.map((line) => ({
      kind: line.kind,
      unitMillimes: line.unit_millimes,
      count: line.count,
      millimes: line.millimes,
    })),
    paymentMode: order.payment_mode,
    cancel: order.cancel,
    cancelOption: cancelOptionOf(order.status),
    parcels: order.parcels.map((p) => ({
      index: p.index,
      barcode: p.barcode,
      size: p.type,
      fragile: false,
      status: p.status,
      attempts: p.attempts,
      weightDeclaredG: p.weight_declared_g,
      weightMeasuredG: null,
      weightOverTolerance: false,
      failureReason: null,
      proof: null,
    })),
    timeline,
    slipHref: null,
  };
}

type OrdersRead = Pick<
  OrdersPort,
  "listOrders" | "getOrderDetail" | "cancelOrder" | "lookupTracking"
>;

export function createApiOrdersRead(client: Client): OrdersRead {
  // The full list lives as long as the screen: chips, months, search and pages filter it locally.
  let cached: { userId: string; list: Promise<ApiOrder[]> } | null = null;
  return {
    async listOrders(session, query, options) {
      if (!cached || cached.userId !== session.userId || options?.fresh) {
        const entry = { userId: session.userId, list: listAll(client) };
        cached = entry;
        // A failed read is not kept: the next call asks again.
        entry.list.catch(() => {
          if (cached === entry) cached = null;
        });
      }
      const orders = await cached.list;
      return buildOrdersPage(orders.map(rowOf), query);
    },

    async getOrderDetail(_session, code): Promise<OrderDetailResult> {
      const id = await idOf(client, code);
      if (!id) return { status: "notFound" };
      const order = await readOrder(client, id);
      if (!order) return { status: "notFound" };
      // Not in the order: the events come from the public tracking, which has no personal data.
      const history = await readHistory(client, order.tracking_number);
      return { status: "found", order: detailOf(order, history) };
    },

    async cancelOrder(_session, code, { acceptedFee }): Promise<CancelResult> {
      const id = await idOf(client, code);
      if (!id) return { status: "notFound" };
      cached = null; // the list changes with a cancel
      // Replay by state (x-replay: state): no Idempotency-Key, the server answers 200 again.
      const { data, error, response } = await client.POST("/v1/orders/{id}/cancel", {
        params: { path: { id } },
        body: { accepted_fee: acceptedFee },
      });
      if (response.ok && data) return { status: "canceled", fee: data.fee };
      if (response.status === 404) return { status: "notFound" };
      const fields = asErrorBody(error)?.error.fields ?? [];
      if (response.status === 409) {
        const claimOnly = fields.some((f) => f.name === "status" && f.reason === "claimOnly");
        return { status: claimOnly ? "claimOnly" : "notCancellable" };
      }
      if (
        response.status === 422 &&
        fields.some((f) => f.name === "accepted_fee" && f.reason === "feeRequired")
      ) {
        // The API wants the exact fee. Read the order again and say what to accept now (B2).
        const current = await readOrder(client, id);
        if (!current) return { status: "notFound" };
        const option = cancelOptionOf(current.status);
        if (option === "claimOnly") return { status: "claimOnly" };
        if (option === "none") return { status: "notCancellable" };
        if (option === "mayHaveFee") return { status: "feeRequired", fee: "backOfficeDecides" };
        if (option === "freeUnlessArrived") {
          // The driver's arrival is unknown here: toggle between the two fees it can be.
          return { status: "feeRequired", fee: acceptedFee === "applies" ? "none" : "applies" };
        }
        // free (received, confirmed): a fee can only be "none". Refused after "none" is a fault.
        if (acceptedFee === "none") throw new ServerError(traceIdOf(error));
        return { status: "feeRequired", fee: "none" };
      }
      return fail(response.status, error);
    },

    async lookupTracking(code): Promise<TrackingResult> {
      if (!isValidTrackingCode(code)) return { status: "invalid-format" };
      try {
        const { data, response } = await client.GET("/v1/tracking/{number}", {
          params: { path: { number: normalizeTrackingCode(code) } },
        });
        if (response.status === 404) return { status: "not-found" };
        if (response.status === 400) return { status: "invalid-format" };
        if (!response.ok || !data) return { status: "unavailable" };
        return {
          status: "found",
          tracking: {
            status: data.status,
            etaUtc: data.eta_at,
            history: data.history.map((e) => ({ status: e.status, atUtc: e.at })),
            fromCity: data.from_city,
            toCity: data.to_city,
            parcelCount: data.parcel_count,
            parcelOutcomes: data.parcel_outcomes,
          },
        };
      } catch {
        return { status: "unavailable" };
      }
    },
  };
}
