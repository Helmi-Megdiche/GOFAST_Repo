import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildOrderRequest } from "../order/request";
import { readyDraft } from "../order/test-draft";
import { useMemoryStorage } from "../storage";
import { NetworkError } from "./errors";
import { createApiClient } from "./client";
import { createApiOrders } from "./orders";
import { serializeOrderBody } from "./order-create";

const T0 = Date.parse("2026-11-04T08:30:00Z");
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const err = (code: string, fields: { name: string; reason: string }[] = []) => ({
  error: { code, message: "x", fields, trace_id: "tr-9" },
});

function setup(respond: (request: Request) => Promise<Response> | Response) {
  const fetchImpl = vi.fn(async (request: Request) => respond(request));
  const orders = createApiOrders(createApiClient({ fetch: fetchImpl, baseUrl: "http://web.test" }));
  return { fetchImpl, orders };
}

const req = () => {
  const built = buildOrderRequest(readyDraft(T0), true);
  if (!built) throw new Error("request");
  return built;
};

beforeEach(() => useMemoryStorage());

describe("api orders adapter (fake fetch, no network)", () => {
  it("sends the Idempotency-Key and the exact stored body, answers created with the tracking number", async () => {
    const { fetchImpl, orders } = setup(() => json(201, { tracking_number: "FG-5A1C-0001" }));
    const request = req();
    const body = orders.prepare(request);
    expect(body).toBe(serializeOrderBody(request));
    const result = await orders.createOrder(request, "key-1", body);
    expect(result).toEqual({ status: "created", code: "FG-5A1C-0001", replay: false });
    const sent = (fetchImpl.mock.calls[0] as unknown as [Request])[0];
    expect(sent.headers.get("idempotency-key")).toBe("key-1");
    expect(await sent.text()).toBe(body);
  });

  it("a retry re-sends the stored bytes unchanged, even if the request object would serialize differently", async () => {
    const seen: string[] = [];
    const { orders } = setup(async (request) => {
      seen.push(await request.text());
      return json(201, { tracking_number: "FG-5A1C-0001" });
    });
    const stored = '{"stored":"bytes","order":1}';
    await orders.createOrder(req(), "key-1", stored);
    await orders.createOrder(req(), "key-1", stored);
    expect(seen).toEqual([stored, stored]);
  });

  it.each([
    [409, err("KEY_REUSED"), "idempotencyConflict"],
    [410, err("QUOTE_EXPIRED"), "quoteExpired"],
    [422, err("RULE_REFUSED", [{ name: "departure", reason: "outOfZone" }]), "outOfZone"],
  ])("%i refuses with %j mapped to %s", async (status, body, expected) => {
    const { orders } = setup(() => json(status, body));
    expect(await orders.createOrder(req(), "k", orders.prepare(req()))).toEqual({
      status: "refused",
      error: expected,
    });
  });

  it("a cut connection throws NetworkError (the lost path)", async () => {
    const { orders } = setup(() => {
      throw new TypeError("offline");
    });
    await expect(orders.createOrder(req(), "k", orders.prepare(req()))).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it("401 throws the sign-in signal, an unknown failure throws a server error with the trace id", async () => {
    const unauth = setup(() => json(401, err("AUTH_REQUIRED")));
    await expect(
      unauth.orders.createOrder(req(), "k", unauth.orders.prepare(req())),
    ).rejects.toMatchObject({ name: "AuthRequiredError" });
    const broken = setup(() => json(500, err("INTERNAL_ERROR")));
    await expect(
      broken.orders.createOrder(req(), "k", broken.orders.prepare(req())),
    ).rejects.toMatchObject({ name: "ServerError", traceId: "tr-9" });
  });

  it("there is no lookup route: findOrderByKey sends nothing and says nothing exists", async () => {
    const { orders, fetchImpl } = setup(() => json(500, {}));
    expect(await orders.findOrderByKey("k")).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
