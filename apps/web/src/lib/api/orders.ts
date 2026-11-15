import type { OrdersPort } from "../data/ports";
import type { OrderRequest } from "../order/request";
import type { createApiClient } from "./client";
import { AuthRequiredError, ServerError, mapOrderFailure } from "./errors";
import { serializeOrderBody, type OrderCreate } from "./order-create";

/** The API forgets an Idempotency-Key after 24 h (contract, `x-replay: key`). */
export const KEY_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function createApiOrders(client: ReturnType<typeof createApiClient>): OrdersPort {
  return {
    kind: "api",
    keyLifetimeMs: KEY_LIFETIME_MS,
    prepare: (request: OrderRequest) => serializeOrderBody(request),

    async createOrder(request, key, body) {
      const payload = body ?? serializeOrderBody(request);
      const { data, error, response } = await client.POST("/v1/orders", {
        params: { header: { "Idempotency-Key": key } },
        body: JSON.parse(payload) as OrderCreate,
        // The stored bytes, not a new serialization: a replay must carry the same content (R202).
        bodySerializer: () => payload,
      });
      if (response.ok && data) {
        return { status: "created", code: data.tracking_number, replay: false };
      }
      const failure = mapOrderFailure(response.status, error);
      if (failure.kind === "refused") return { status: "refused", error: failure.error };
      if (failure.kind === "signIn") throw new AuthRequiredError();
      if (failure.kind === "tooManyAttempts") throw new ServerError(null, "tooManyAttempts");
      throw new ServerError(failure.traceId);
    },

    // No lookup route: a lost answer is settled by replaying the POST with the same key and bytes.
    async findOrderByKey() {
      return null;
    },
  };
}
