import { createApiClient } from "../api/client";
import { usesApi } from "../api/domains";
import { createApiAuth } from "../api/auth";
import { createApiOrders } from "../api/orders";
import { createApiPricing } from "../api/pricing";
import { createMockAuth, createMockOrders, createMockPricing } from "./mock-adapters";
import type { AuthPort, OrdersPort, PricingPort } from "./ports";

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

/** The auth screens: sign-in, sign-up, phone code, password reset, sign-out. */
export function authPort(flag: string | undefined = process.env.NEXT_PUBLIC_API_DOMAINS): AuthPort {
  return usesApi("auth", flag) ? createApiAuth(createApiClient()) : createMockAuth();
}

let shared: AuthPort | undefined;
/**
 * The one auth port of this page load. The api adapter keeps a little state (a reset that ended
 * "unavailable", Change A), so the screens share one instance. Tests that pick a flag use authPort.
 */
export function sharedAuthPort(): AuthPort {
  shared ??= authPort();
  return shared;
}
