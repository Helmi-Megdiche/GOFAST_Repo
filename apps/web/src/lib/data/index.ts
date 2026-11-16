import { createApiClient } from "../api/client";
import { usesApi } from "../api/domains";
import { createApiOrders } from "../api/orders";
import { createApiPricing } from "../api/pricing";
import { createMockOrders, createMockPricing } from "./mock-adapters";
import type { OrdersPort, PricingPort } from "./ports";

/** `flag` is NEXT_PUBLIC_API_DOMAINS. Empty or unset: mock. An unknown name throws. */
export function ordersPort(
  flag: string | undefined = process.env.NEXT_PUBLIC_API_DOMAINS,
): OrdersPort {
  return usesApi("orders", flag) ? createApiOrders(createApiClient()) : createMockOrders();
}

export function pricingPort(
  flag: string | undefined = process.env.NEXT_PUBLIC_API_DOMAINS,
): PricingPort {
  return usesApi("pricing", flag) ? createApiPricing() : createMockPricing();
}
