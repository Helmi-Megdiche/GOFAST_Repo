import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoryStorage } from "../storage";
import type { Session } from "../data/session";
import { AuthRequiredError, NetworkError, ServerError } from "./errors";
import { createApiClient } from "./client";
import { createApiOrders } from "./orders";
import { CLOSED_ACCOUNT_NAME } from "../data/order-model";

/**
 * GH-20 (20-c): the client's orders on the real API. Fake fetch, no network. Every status code the
 * contract lists for GET /v1/orders, GET /v1/orders/{id}, POST /v1/orders/{id}/cancel and
 * GET /v1/tracking/{number} has a case. Values are distinct on purpose (sender vs recipient, created
 * vs eta) so a swapped mapping fails a test.
 */

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const err = (code: string, fields: { name: string; reason: string }[] = []) => ({
  error: { code, message: "x", fields, trace_id: "tr-9" },
});

const SESSION = { accountId: "acc-1", userId: "usr-1" } as unknown as Session;
const CODE = "FG-5A1C-0002";
const ID = "0b6f7f0e-1111-4222-8333-444455556666";

type Status =
  | "received"
  | "confirmed"
  | "assigned"
  | "pickup_failed"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "canceled";

function apiOrder(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    tracking_number: CODE,
    address_unconfirmed: false,
    departure: { zone_id: "z1", zone_name: "Tunis" },
    arrival: { zone_id: "z2", zone_name: "Sfax" },
    status: "confirmed" as Status,
    service: "express",
    payment_mode: "cashPickup",
    freight_payer: "sender",
    total_millimes: 12500,
    lines: [
      { kind: "base", unit_millimes: 8000, count: 1, millimes: 8000 },
      { kind: "vat", unit_millimes: null, count: 1, millimes: null },
    ],
    created_at: "2026-11-10T08:00:00Z",
    eta_at: "2026-11-10T12:00:00Z",
    sender: { name: "Amel Test", phone: "+21698000001", address: "1 rue A", city: "Tunis" },
    recipient: { name: "Sami Test", phone: "+21698000002", address: "2 rue B", city: "Sfax" },
    parcels: [
      {
        id: "p1",
        index: 1,
        barcode: "BC-1",
        type: "medium",
        weight_declared_g: 1500,
        status: "to_collect",
        attempts: 0,
      },
    ],
    loss_reported: false,
    cancel: null,
    ...over,
  };
}

const apiTracking = (over: Record<string, unknown> = {}) => ({
  status: "confirmed",
  eta_at: "2026-11-10T12:00:00Z",
  history: [
    { status: "received", at: "2026-11-10T08:00:00Z" },
    { status: "confirmed", at: "2026-11-10T08:05:00Z" },
  ],
  from_city: "Tunis",
  to_city: "Sfax",
  parcel_count: 1,
  parcel_outcomes: ["to_collect"],
  ...over,
});

type Call = { method: string; path: string; search: URLSearchParams; headers: Headers; body: string };

function setup(respond: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    const call: Call = {
      method: request.method,
      path: url.pathname,
      search: url.searchParams,
      headers: request.headers,
      body: await request.text(),
    };
    calls.push(call);
    return respond(call);
  });
  const orders = createApiOrders(createApiClient({ fetch: fetchImpl, baseUrl: "http://web.test" }));
  return { calls, orders };
}

/** Answers the id lookup, the order and the tracking history the way the API does. */
const happy =
  (order = apiOrder(), tracking = apiTracking()) =>
  (call: Call) => {
    if (call.path === "/v1/orders") return json(200, { items: [order], next_cursor: null });
    if (call.path === `/v1/orders/${ID}`) return json(200, order);
    if (call.path === `/v1/tracking/${CODE}`) return json(200, tracking);
    return json(404, err("NOT_FOUND"));
  };

beforeEach(() => useMemoryStorage());

const FAILURES: [number, string][] = [
  [400, "VALIDATION_FAILED"],
  [403, "ACCESS_DENIED"],
  [500, "INTERNAL_ERROR"],
];

describe("api orders adapter, list (GET /v1/orders)", () => {
  const query = { filter: "all", month: null, q: "", page: 1 } as const;

  it("maps an order to a row, with the code, recipient, service, status, date and total", async () => {
    const { orders } = setup(() => json(200, { items: [apiOrder()], next_cursor: null }));
    const page = await orders.listOrders(SESSION, query);
    expect(page.rows).toEqual([
      {
        code: CODE,
        recipientName: "Sami Test",
        service: "express",
        status: "confirmed",
        createdAt: "2026-11-10T08:00:00Z",
        totalMillimes: 12500,
      },
    ]);
    expect(page).toMatchObject({ total: 1, accountTotal: 1, pages: 1, page: 1 });
    expect(page.months).toEqual(["2026-11"]);
  });

  it("follows next_cursor until the last page, asking 100 at a time", async () => {
    const { calls, orders } = setup((call) =>
      call.search.get("cursor") === "c2"
        ? json(200, { items: [apiOrder({ id: "b", tracking_number: "FG-5A1C-0003" })], next_cursor: null })
        : json(200, { items: [apiOrder()], next_cursor: "c2" }),
    );
    const page = await orders.listOrders(SESSION, query);
    expect(page.accountTotal).toBe(2);
    expect(calls.map((c) => c.search.get("cursor"))).toEqual([null, "c2"]);
    expect(calls.every((c) => c.search.get("limit") === "100")).toBe(true);
  });

  it("filters, searches and pages the same way as the mock (shared function)", async () => {
    const items = [
      apiOrder({ id: "a", tracking_number: "FG-5A1C-0001", status: "delivered" }),
      apiOrder({ id: "b", tracking_number: "FG-5A1C-0002", status: "confirmed" }),
    ];
    const { orders } = setup(() => json(200, { items, next_cursor: null }));
    const inProgress = await orders.listOrders(SESSION, { ...query, filter: "inProgress" });
    expect(inProgress.rows.map((r) => r.code)).toEqual(["FG-5A1C-0002"]);
    expect(inProgress).toMatchObject({ total: 1, accountTotal: 2, inProgressCount: 1 });
    const found = await orders.listOrders(SESSION, { ...query, q: "fg 5a1c 0001" });
    expect(found.rows.map((r) => r.code)).toEqual(["FG-5A1C-0001"]);
  });

  it("an empty account is an empty page, not an error", async () => {
    const { orders } = setup(() => json(200, { items: [], next_cursor: null }));
    expect(await orders.listOrders(SESSION, query)).toMatchObject({
      rows: [],
      total: 0,
      accountTotal: 0,
      pages: 1,
    });
  });

  it("S4: a closed account (null recipient name) is a row with the closed-account marker, never a blank", async () => {
    const closed = apiOrder({
      recipient: { name: null, phone: null, address: null, city: null },
    });
    const { orders } = setup(() => json(200, { items: [closed], next_cursor: null }));
    expect((await orders.listOrders(SESSION, query)).rows[0]?.recipientName).toBe(
      CLOSED_ACCOUNT_NAME,
    );
  });

  it("S6: keeps the full list for the life of the screen; only fresh:true reads it again", async () => {
    const { calls, orders } = setup(() => json(200, { items: [apiOrder()], next_cursor: null }));
    await orders.listOrders(SESSION, query);
    await orders.listOrders(SESSION, { ...query, filter: "delivered" });
    await orders.listOrders(SESSION, { ...query, q: "sami" });
    expect(calls).toHaveLength(1);
    await orders.listOrders(SESSION, query, { fresh: true });
    expect(calls).toHaveLength(2);
  });

  it("S6: a failed read is not kept: the next call asks again", async () => {
    let failing = true;
    const { calls, orders } = setup(() =>
      failing
        ? json(500, err("INTERNAL_ERROR"))
        : json(200, { items: [apiOrder()], next_cursor: null }),
    );
    await expect(orders.listOrders(SESSION, query)).rejects.toBeInstanceOf(ServerError);
    failing = false;
    expect((await orders.listOrders(SESSION, query)).rows).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it("S6: a list that never ends is an error, not a silently cut list", async () => {
    const { calls, orders } = setup(() => json(200, { items: [apiOrder()], next_cursor: "again" }));
    await expect(orders.listOrders(SESSION, query)).rejects.toBeInstanceOf(ServerError);
    expect(calls).toHaveLength(100);
  });

  it("401 throws the sign-in signal", async () => {
    const { orders } = setup(() => json(401, err("AUTH_REQUIRED")));
    await expect(orders.listOrders(SESSION, query)).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it.each(FAILURES)("%i throws a server error with the trace id", async (status, code) => {
    const { orders } = setup(() => json(status, err(code)));
    await expect(orders.listOrders(SESSION, query)).rejects.toMatchObject({
      name: "ServerError",
      traceId: "tr-9",
    });
  });

  it("a cut connection throws NetworkError", async () => {
    const { orders } = setup(() => {
      throw new TypeError("offline");
    });
    await expect(orders.listOrders(SESSION, query)).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("api orders adapter, detail (GET /v1/orders/{id})", () => {
  it("finds the id by tracking number, reads the order and the history, and maps them", async () => {
    const { calls, orders } = setup(happy());
    const result = await orders.getOrderDetail(SESSION, CODE);
    expect(calls[0]?.search.get("tracking")).toBe(CODE);
    expect(calls.map((c) => c.path)).toEqual([
      "/v1/orders",
      `/v1/orders/${ID}`,
      `/v1/tracking/${CODE}`,
    ]);
    if (result.status !== "found") throw new Error("not found");
    expect(result.order).toMatchObject({
      code: CODE,
      createdAt: "2026-11-10T08:00:00Z",
      etaUtc: "2026-11-10T12:00:00Z",
      service: "express",
      status: "confirmed",
      lossReported: false,
      slipHref: null,
      sender: { name: "Amel Test", address: "1 rue A" },
      recipient: { name: "Sami Test", address: "2 rue B" },
      totalMillimes: 12500,
      paymentMode: "cashPickup",
      cancel: null,
      cancelOption: "free",
    });
    expect(result.order.priceLines).toEqual([
      { kind: "base", unitMillimes: 8000, count: 1, millimes: 8000 },
      { kind: "vat", unitMillimes: null, count: 1, millimes: null },
    ]);
    expect(result.order.timeline).toEqual([
      { kind: "order", status: "received", atUtc: "2026-11-10T08:00:00Z" },
      { kind: "order", status: "confirmed", atUtc: "2026-11-10T08:05:00Z" },
    ]);
    expect(result.order.parcels).toEqual([
      {
        index: 1,
        barcode: "BC-1",
        size: "medium",
        fragile: false,
        status: "to_collect",
        attempts: 0,
        weightDeclaredG: 1500,
        weightMeasuredG: null,
        weightOverTolerance: false,
        failureReason: null,
        proof: null,
      },
    ]);
  });

  it.each([
    ["received", "free"],
    ["confirmed", "free"],
    ["assigned", "freeUnlessArrived"],
    ["pickup_failed", "mayHaveFee"],
    ["picked_up", "claimOnly"],
    ["in_transit", "claimOnly"],
    ["delivered", "none"],
    ["canceled", "none"],
  ] as [Status, string][])("status %s gives the cancel option %s", async (status, option) => {
    const { orders } = setup(happy(apiOrder({ status })));
    const result = await orders.getOrderDetail(SESSION, CODE);
    expect(result.status === "found" && result.order.cancelOption).toBe(option);
  });

  it("S7: loss_reported and attempts are read from the order, not left at their default", async () => {
    const order = apiOrder({
      loss_reported: true,
      parcels: [{ ...apiOrder().parcels[0], attempts: 2 }],
    });
    const { orders } = setup(happy(order));
    const result = await orders.getOrderDetail(SESSION, CODE);
    if (result.status !== "found") throw new Error("not found");
    expect(result.order.lossReported).toBe(true);
    expect(result.order.parcels[0]?.attempts).toBe(2);
  });

  it("S7: a lower-case number is normalized before the id lookup", async () => {
    const { calls, orders } = setup(happy());
    const result = await orders.getOrderDetail(SESSION, CODE.toLowerCase());
    expect(result.status).toBe("found");
    expect(calls[0]?.search.get("tracking")).toBe(CODE);
  });

  it("S1: a malformed number is notFound and nothing is sent (the API would answer 400)", async () => {
    const { calls, orders } = setup(() => json(400, err("VALIDATION_FAILED")));
    expect(await orders.getOrderDetail(SESSION, "nope")).toEqual({ status: "notFound" });
    expect(await orders.cancelOrder(SESSION, "nope", { acceptedFee: "none" })).toEqual({
      status: "notFound",
    });
    expect(calls).toHaveLength(0);
  });

  it("S4: a closed account (null names and addresses) shows the marker and no blank address", async () => {
    const closed = { name: null, phone: null, address: null, city: null };
    const { orders } = setup(happy(apiOrder({ sender: closed, recipient: closed })));
    const result = await orders.getOrderDetail(SESSION, CODE);
    if (result.status !== "found") throw new Error("not found");
    expect(result.order.sender).toEqual({ name: CLOSED_ACCOUNT_NAME, address: null });
    expect(result.order.recipient).toEqual({ name: CLOSED_ACCOUNT_NAME, address: null });
  });

  it("B3: the API order has no slip, so there is no link (never an empty href)", async () => {
    const { orders } = setup(happy());
    const result = await orders.getOrderDetail(SESSION, CODE);
    expect(result.status === "found" && result.order.slipHref).toBeNull();
  });

  it("a canceled order carries the cancel record", async () => {
    const cancel = { at: "2026-11-10T09:00:00Z", fee: "applies" };
    const { orders } = setup(happy(apiOrder({ status: "canceled", cancel })));
    const result = await orders.getOrderDetail(SESSION, CODE);
    expect(result.status === "found" && result.order.cancel).toEqual(cancel);
  });

  it("an unknown number (empty list) is notFound, and nothing else is asked", async () => {
    const { calls, orders } = setup(() => json(200, { items: [], next_cursor: null }));
    expect(await orders.getOrderDetail(SESSION, CODE)).toEqual({ status: "notFound" });
    expect(calls).toHaveLength(1);
  });

  it("404 on the order is notFound", async () => {
    const { orders } = setup((call) =>
      call.path === "/v1/orders"
        ? json(200, { items: [apiOrder()], next_cursor: null })
        : json(404, err("NOT_FOUND")),
    );
    expect(await orders.getOrderDetail(SESSION, CODE)).toEqual({ status: "notFound" });
  });

  it("401 throws the sign-in signal", async () => {
    const { orders } = setup(() => json(401, err("AUTH_REQUIRED")));
    await expect(orders.getOrderDetail(SESSION, CODE)).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it.each(FAILURES)("%i on the order throws a server error with the trace id", async (status, code) => {
    const { orders } = setup((call) =>
      call.path === "/v1/orders"
        ? json(200, { items: [apiOrder()], next_cursor: null })
        : json(status, err(code)),
    );
    await expect(orders.getOrderDetail(SESSION, CODE)).rejects.toMatchObject({
      name: "ServerError",
      traceId: "tr-9",
    });
  });

  it("a failing history read is an error, not a page without a timeline", async () => {
    const { orders } = setup((call) =>
      call.path === `/v1/tracking/${CODE}` ? json(500, err("INTERNAL_ERROR")) : happy()(call),
    );
    await expect(orders.getOrderDetail(SESSION, CODE)).rejects.toBeInstanceOf(ServerError);
  });

  it("a cut connection throws NetworkError", async () => {
    const { orders } = setup(() => {
      throw new TypeError("offline");
    });
    await expect(orders.getOrderDetail(SESSION, CODE)).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("api orders adapter, cancel (POST /v1/orders/{id}/cancel)", () => {
  const cancelOk = (fee: string) => (call: Call) =>
    call.method === "POST" ? json(200, { status: "canceled", fee }) : happy()(call);

  it("sends accepted_fee in the body and no Idempotency-Key (replay by state), answers canceled with the fee", async () => {
    const { calls, orders } = setup(cancelOk("none"));
    const result = await orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" });
    expect(result).toEqual({ status: "canceled", fee: "none" });
    const post = calls.find((c) => c.method === "POST");
    expect(post?.path).toBe(`/v1/orders/${ID}/cancel`);
    expect(JSON.parse(post?.body ?? "{}")).toEqual({ accepted_fee: "none" });
    expect(post?.headers.get("idempotency-key")).toBeNull();
  });

  it.each(["none", "applies", "backOfficeDecides"] as const)(
    "sends the fee the customer accepted (%s) as accepted_fee, unchanged",
    async (fee) => {
      const { calls, orders } = setup(cancelOk(fee));
      await orders.cancelOrder(SESSION, CODE, { acceptedFee: fee });
      const post = calls.find((c) => c.method === "POST");
      expect(JSON.parse(post?.body ?? "{}")).toEqual({ accepted_fee: fee });
    },
  );

  it("409 claimOnly on a field other than status is notCancellable", async () => {
    const { orders } = setup((call) =>
      call.method === "POST"
        ? json(409, err("STATE_CONFLICT", [{ name: "other", reason: "claimOnly" }]))
        : happy()(call),
    );
    expect(await orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" })).toEqual({
      status: "notCancellable",
    });
  });

  it("an order already canceled answers 200 again: still canceled, with the recorded fee", async () => {
    const { orders } = setup(cancelOk("applies"));
    expect(await orders.cancelOrder(SESSION, CODE, { acceptedFee: "applies" })).toEqual({
      status: "canceled",
      fee: "applies",
    });
  });

  it("an unknown number is notFound without a POST", async () => {
    const { calls, orders } = setup(() => json(200, { items: [], next_cursor: null }));
    expect(await orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" })).toEqual({
      status: "notFound",
    });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("404 on the cancel is notFound", async () => {
    const { orders } = setup((call) =>
      call.method === "POST" ? json(404, err("NOT_FOUND")) : happy()(call),
    );
    expect(await orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" })).toEqual({
      status: "notFound",
    });
  });

  it.each([
    ["claimOnly", "claimOnly"],
    ["notCancellable", "notCancellable"],
  ])("409 with the reason %s is %s", async (reason, status) => {
    const { orders } = setup((call) =>
      call.method === "POST"
        ? json(409, err("STATE_CONFLICT", [{ name: "status", reason }]))
        : happy()(call),
    );
    expect(await orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" })).toEqual({ status });
  });

  it("409 with a reason we do not know is notCancellable (the page then shows the real state)", async () => {
    const { orders } = setup((call) =>
      call.method === "POST" ? json(409, err("STATE_CONFLICT")) : happy()(call),
    );
    expect(await orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" })).toEqual({
      status: "notCancellable",
    });
  });

  it("B2, RV-01, RV-12: every state x every accepted fee terminates in at most three POSTs against a strict server", async () => {
    // The API demands an exact match (accepted === fee). The driver's arrival is not in the order,
    // so `assigned` is tried with and without it.
    const statuses: Status[] = [
      "received",
      "confirmed",
      "assigned",
      "pickup_failed",
      "picked_up",
      "in_transit",
      "delivered",
      "canceled",
    ];
    const fees = ["none", "applies", "backOfficeDecides"] as const;
    let cases = 0;
    for (const status of statuses) {
      for (const arrived of status === "assigned" ? [false, true] : [false]) {
        for (const first of fees) {
          const serverFee =
            status === "received" || status === "confirmed" || (status === "assigned" && !arrived)
              ? "none"
              : status === "assigned"
                ? "applies"
                : "backOfficeDecides";
          const post = (call: Call) => {
            const body = JSON.parse(call.body) as { accepted_fee: string };
            if (status === "canceled") return json(200, { status: "canceled", fee: "none" });
            if (status === "picked_up" || status === "in_transit")
              return json(409, err("STATE_CONFLICT", [{ name: "status", reason: "claimOnly" }]));
            if (status === "delivered")
              return json(409, err("STATE_CONFLICT", [{ name: "status", reason: "notCancellable" }]));
            if (body.accepted_fee !== serverFee)
              return json(422, err("RULE_REFUSED", [{ name: "accepted_fee", reason: "feeRequired" }]));
            return json(200, { status: "canceled", fee: serverFee });
          };
          const { calls, orders } = setup((call) =>
            call.method === "POST" ? post(call) : happy(apiOrder({ status }))(call),
          );
          const label = `${status} arrived=${arrived} first=${first}`;
          let result = await orders.cancelOrder(SESSION, CODE, { acceptedFee: first });
          let rounds = 1;
          // What the dialog does: show the answered fee, the customer accepts it, send it.
          while (result.status === "feeRequired" && rounds < 4) {
            result = await orders.cancelOrder(SESSION, CODE, { acceptedFee: result.fee });
            rounds += 1;
          }
          expect(result.status, label).not.toBe("feeRequired");
          expect(calls.filter((c) => c.method === "POST").length, label).toBeLessThanOrEqual(3);
          cases += 1;
        }
      }
    }
    expect(cases).toBe(27);
  });

  it.each([
    ["claimOnly", "picked_up", "none", { status: "claimOnly" }],
    ["notCancellable", "delivered", "none", { status: "notCancellable" }],
    ["backOfficeDecides", "pickup_failed", "none", { status: "feeRequired", fee: "backOfficeDecides" }],
    ["applies (the driver arrived)", "assigned", "none", { status: "feeRequired", fee: "applies" }],
    ["none (the fee was dropped)", "assigned", "applies", { status: "feeRequired", fee: "none" }],
    ["applies (a stale may-have-fee)", "assigned", "backOfficeDecides", { status: "feeRequired", fee: "applies" }],
    ["none (a free state)", "confirmed", "applies", { status: "feeRequired", fee: "none" }],
  ] as [string, Status, "none" | "applies" | "backOfficeDecides", unknown][])(
    "B2: 422 then a re-read gives %s",
    async (_name, status, acceptedFee, expected) => {
      const { calls, orders } = setup((call) =>
        call.method === "POST"
          ? json(422, err("RULE_REFUSED", [{ name: "accepted_fee", reason: "feeRequired" }]))
          : happy(apiOrder({ status }))(call),
      );
      expect(await orders.cancelOrder(SESSION, CODE, { acceptedFee })).toEqual(expected);
      expect(calls.filter((c) => c.path === `/v1/orders/${ID}` && c.method === "GET")).toHaveLength(1);
    },
  );

  it("B2: a 422 on a free state that was sent 'none' is a server error, not a guess", async () => {
    const { orders } = setup((call) =>
      call.method === "POST"
        ? json(422, err("RULE_REFUSED", [{ name: "accepted_fee", reason: "feeRequired" }]))
        : happy(apiOrder({ status: "confirmed" }))(call),
    );
    await expect(orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" })).rejects.toBeInstanceOf(
      ServerError,
    );
  });

  it("422 with another reason is a server error, not a fee prompt", async () => {
    const { orders } = setup((call) =>
      call.method === "POST"
        ? json(422, err("RULE_REFUSED", [{ name: "x", reason: "other" }]))
        : happy()(call),
    );
    await expect(orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" })).rejects.toBeInstanceOf(
      ServerError,
    );
  });

  it("401 throws the sign-in signal", async () => {
    const { orders } = setup((call) =>
      call.method === "POST" ? json(401, err("AUTH_REQUIRED")) : happy()(call),
    );
    await expect(
      orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" }),
    ).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it.each(FAILURES)("%i throws a server error with the trace id", async (status, code) => {
    const { orders } = setup((call) =>
      call.method === "POST" ? json(status, err(code)) : happy()(call),
    );
    await expect(orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" })).rejects.toMatchObject({
      name: "ServerError",
      traceId: "tr-9",
    });
  });

  it("a cut connection throws NetworkError (the page offers to try again and reads the state)", async () => {
    const { orders } = setup((call) => {
      if (call.method === "POST") throw new TypeError("offline");
      return happy()(call);
    });
    await expect(orders.cancelOrder(SESSION, CODE, { acceptedFee: "none" })).rejects.toBeInstanceOf(
      NetworkError,
    );
  });
});

describe("api orders adapter, public tracking (GET /v1/tracking/{number})", () => {
  it("maps the allowlist: status, eta, history, cities, counted parcels, outcomes", async () => {
    const { calls, orders } = setup(() => json(200, apiTracking({ parcel_outcomes: ["delivered"] })));
    const result = await orders.lookupTracking(CODE);
    expect(calls[0]?.path).toBe(`/v1/tracking/${CODE}`);
    expect(result).toEqual({
      status: "found",
      tracking: {
        status: "confirmed",
        etaUtc: "2026-11-10T12:00:00Z",
        history: [
          { status: "received", atUtc: "2026-11-10T08:00:00Z" },
          { status: "confirmed", atUtc: "2026-11-10T08:05:00Z" },
        ],
        fromCity: "Tunis",
        toCity: "Sfax",
        parcelCount: 1,
        parcelOutcomes: ["delivered"],
      },
    });
  });

  it("normalizes a lower-case number before asking", async () => {
    const { calls, orders } = setup(() => json(200, apiTracking()));
    await orders.lookupTracking("fg-5a1c-0002");
    expect(calls[0]?.path).toBe(`/v1/tracking/${CODE}`);
  });

  it("a badly formed number is invalid-format and nothing is sent", async () => {
    const { calls, orders } = setup(() => json(200, apiTracking()));
    expect(await orders.lookupTracking("nope")).toEqual({ status: "invalid-format" });
    expect(calls).toHaveLength(0);
  });

  it("404 is not-found", async () => {
    const { orders } = setup(() => json(404, err("NOT_FOUND")));
    expect(await orders.lookupTracking(CODE)).toEqual({ status: "not-found" });
  });

  it("400 (the server refuses the number) is invalid-format", async () => {
    const { orders } = setup(() => json(400, err("VALIDATION_FAILED")));
    expect(await orders.lookupTracking(CODE)).toEqual({ status: "invalid-format" });
  });

  it.each([
    [429, "TOO_MANY_ATTEMPTS"],
    [500, "INTERNAL_ERROR"],
  ])("%i is unavailable, never an exception on this public page", async (status, code) => {
    const { orders } = setup(() => json(status, err(code)));
    expect(await orders.lookupTracking(CODE)).toEqual({ status: "unavailable" });
  });

  it("a cut connection is unavailable", async () => {
    const { orders } = setup(() => {
      throw new TypeError("offline");
    });
    expect(await orders.lookupTracking(CODE)).toEqual({ status: "unavailable" });
  });
});
