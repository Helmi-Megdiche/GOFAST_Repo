import { describe, expect, it } from "vitest";
import { ordersPort, pricingPort, profilePort } from "./index";
import { createMockOrders, createMockPricing } from "./mock-adapters";
import { createApiOrders } from "../api/orders";
import { createApiPricing } from "../api/pricing";
import { createApiClient } from "../api/client";
import type { OrdersPort, PricingPort } from "./ports";

describe("adapter selection and the shared interface (#20)", () => {
  it("defaults to the mock for every domain", () => {
    expect(ordersPort("").kind).toBe("mock");
    expect(ordersPort(undefined).kind).toBe("mock");
    expect(pricingPort("").kind).toBe("mock");
  });

  it("auth alone leaves orders and pricing on the mock", () => {
    expect(ordersPort("auth").kind).toBe("mock");
    expect(pricingPort("auth").kind).toBe("mock");
  });

  it("orders on the flag selects the api adapter; an unknown name fails", () => {
    expect(ordersPort("orders").kind).toBe("api");
    expect(pricingPort("pricing").kind).toBe("api");
    expect(() => ordersPort("order")).toThrow(/order/);
  });

  it("both adapters satisfy one interface type", () => {
    const api = createApiClient({ baseUrl: "http://web.test" });
    const orders: OrdersPort[] = [createMockOrders(), createApiOrders(api)];
    const pricing: PricingPort[] = [createMockPricing(), createApiPricing()];
    expect(orders).toHaveLength(2);
    expect(pricing).toHaveLength(2);
  });
});

describe("profilePort and the account flag (20-d)", () => {
  it("is the mock unless account is on the flag", () => {
    expect(profilePort("").kind).toBe("mock");
    expect(profilePort("auth,orders").kind).toBe("mock");
    expect(profilePort("account").kind).toBe("api");
  });

  it("the api adapter offers nothing it has no route for; the mock offers everything", () => {
    const api = profilePort("account");
    for (const flag of [
      api.emailAvailable,
      api.googleAvailable,
      api.closeAvailable,
      api.addressBookAvailable,
      api.invoicesAvailable,
      api.claimsAvailable,
      api.homeAvailable,
    ]) {
      expect(flag).toBe(false);
    }
    const mock = profilePort("");
    expect(mock.addressBookAvailable && mock.invoicesAvailable && mock.claimsAvailable).toBe(true);
  });
});

describe("packagingPriced (#20)", () => {
  it("the mock serves the example table", () => {
    const mock = createMockPricing();
    expect(typeof mock.packagingPriced("express", "small")).toBe("boolean");
  });

  it("the api adapter throws 'not available' behind the flag (no invented field)", () => {
    expect(() => createApiPricing().packagingPriced("express", "small")).toThrow(/not available/);
  });
});
