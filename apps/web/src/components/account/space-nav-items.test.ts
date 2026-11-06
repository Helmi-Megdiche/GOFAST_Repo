import { describe, expect, it } from "vitest";
import { SPACE_NAV, visibleNav } from "./space-nav-items";

describe("space nav", () => {
  it("shows only the entries whose page exists (home and orders for a customer): no dead link", () => {
    expect(visibleNav("customer", null).map((e) => e.href)).toEqual([
      "/compte",
      "/compte/commandes",
    ]);
    expect(visibleNav("merchant", "admin").map((e) => e.href)).toEqual(["/pro"]);
  });

  it("lists every route of the umbrella, admin-only ones for the merchant admin", () => {
    expect(SPACE_NAV.customer.map((e) => e.href)).toEqual([
      "/compte",
      "/compte/commandes",
      "/compte/factures",
      "/compte/reclamations",
      "/compte/adresses",
      "/compte/profil",
    ]);
    expect(SPACE_NAV.merchant.map((e) => e.href)).toEqual([
      "/pro",
      "/pro/commandes",
      "/pro/import",
      "/pro/cod",
      "/pro/factures",
      "/pro/releves",
      "/pro/entreprise",
    ]);
    const adminOnly = SPACE_NAV.merchant.filter((e) => e.roles).map((e) => e.href);
    expect(adminOnly).toEqual(["/pro/cod", "/pro/factures", "/pro/releves", "/pro/entreprise"]);
  });

  it("a ready admin-only entry is hidden from a user and shown to an admin", () => {
    const ready = SPACE_NAV.merchant.map((e) => (e.key === "cod" ? { ...e, ready: true } : e));
    const saved = SPACE_NAV.merchant;
    SPACE_NAV.merchant = ready;
    try {
      expect(visibleNav("merchant", "user").map((e) => e.key)).not.toContain("cod");
      expect(visibleNav("merchant", "admin").map((e) => e.key)).toContain("cod");
    } finally {
      SPACE_NAV.merchant = saved;
    }
  });
});
