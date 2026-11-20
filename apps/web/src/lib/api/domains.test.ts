import { describe, expect, it } from "vitest";
import { API_DOMAINS, apiDomains, usesApi } from "./domains";

describe("API domain flag (#20)", () => {
  it("empty or unset means everything stays on the mock", () => {
    expect(apiDomains(undefined)).toEqual([]);
    expect(apiDomains("")).toEqual([]);
    expect(apiDomains(" , ")).toEqual([]);
    for (const name of API_DOMAINS) expect(usesApi(name, "")).toBe(false);
  });

  it("switches only the domains listed: auth alone", () => {
    expect(usesApi("auth", "auth")).toBe(true);
    expect(usesApi("orders", "auth")).toBe(false);
    expect(usesApi("pricing", "auth")).toBe(false);
  });

  it("accepts spaces, repeats and several names", () => {
    expect(apiDomains(" auth, orders ,auth")).toEqual(["auth", "orders"]);
  });

  it("refuses account without auth: the profile needs a real session", () => {
    expect(() => apiDomains("account")).toThrow(/auth/);
    expect(apiDomains("auth,account")).toEqual(["auth", "account"]);
  });

  it("fails on a name it does not know (a typo must not silently stay on the mock)", () => {
    expect(() => apiDomains("auth,ordres")).toThrow(/ordres/);
  });
});
