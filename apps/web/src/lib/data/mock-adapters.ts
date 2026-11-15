import { packagingPriced } from "@fastgo/domain";
import { EXAMPLE_PRICE_TABLE } from "./fixtures/pricing";
import { createOrder, findOrderByKey } from "./orders";
import type { OrdersPort, PricingPort } from "./ports";

export function createMockOrders(): OrdersPort {
  return {
    kind: "mock",
    keyLifetimeMs: null,
    prepare: () => undefined,
    createOrder: (request, key) => createOrder(request, key),
    findOrderByKey,
  };
}

export function createMockPricing(): PricingPort {
  return {
    kind: "mock",
    packagingPriced: (service, parcelType) =>
      packagingPriced(EXAMPLE_PRICE_TABLE, service, parcelType),
  };
}
