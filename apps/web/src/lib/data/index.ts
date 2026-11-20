import { isLocale, type Locale } from "@fastgo/i18n";
import { createApiClient } from "../api/client";
import { usesApi } from "../api/domains";
import { createApiAuth } from "../api/auth";
import { createApiOrders } from "../api/orders";
import { createApiPricing } from "../api/pricing";
import { createApiProfile } from "../api/profile";
import {
  createMockAuth,
  createMockOrders,
  createMockPricing,
  createMockProfile,
} from "./mock-adapters";
import type { AuthPort, OrdersPort, PricingPort, ProfilePort } from "./ports";

/** The page language: <html lang> in the browser, undefined on the server (the client then sends no Accept-Language of its own). */
function pageLocale(): Locale | undefined {
  if (typeof document === "undefined") return undefined;
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : undefined;
}

// One api adapter per language, so its list cache lives as long as the screen does (S6).
const apiOrders = new Map<string, OrdersPort>();

/** `flag` is NEXT_PUBLIC_API_DOMAINS. Empty or unset: mock. An unknown name throws. */
export function ordersPort(
  flag: string | undefined = process.env.NEXT_PUBLIC_API_DOMAINS,
  locale: Locale | undefined = pageLocale(),
): OrdersPort {
  if (!usesApi("orders", flag)) return createMockOrders();
  const key = locale ?? "";
  let port = apiOrders.get(key);
  if (!port) {
    port = createApiOrders(createApiClient({ locale }));
    apiOrders.set(key, port);
  }
  return port;
}

const apiProfiles = new Map<string, ProfilePort>();

/** The client space profile (C09) and the capabilities of the `account` flag. One api adapter per language. */
export function profilePort(
  flag: string | undefined = process.env.NEXT_PUBLIC_API_DOMAINS,
  locale: Locale | undefined = pageLocale(),
): ProfilePort {
  if (!usesApi("account", flag)) return createMockProfile();
  const key = locale ?? "";
  let port = apiProfiles.get(key);
  if (!port) {
    port = createApiProfile(createApiClient({ locale }));
    apiProfiles.set(key, port);
  }
  return port;
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
