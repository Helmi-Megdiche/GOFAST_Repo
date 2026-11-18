import { describe, expect, it } from "vitest";
import { afterSignInPath, guardDecision, type MeLike } from "./guard";

// GH-25 25b: the decision of the shell, as a pure function. The API is the authority; this only decides what the browser shows.

const staff = (role: string | null, over: Partial<MeLike> = {}): MeLike => ({ kind: "staff", role, name: "Test", ...over });

describe("the shell guard: one answer per case of the brief", () => {
  it("401 (no session): go to the sign-in page, keeping the way back", () => {
    expect(guardDecision(null, { kind: "slug", slug: "factures" })).toEqual({ action: "signIn" });
    expect(guardDecision(null, { kind: "landing" })).toEqual({ action: "signIn" });
  });

  it("a customer or a merchant: sign the session out, then the sign-in page with the neutral message", () => {
    expect(guardDecision({ kind: "customer", role: "individual", name: "C" }, { kind: "landing" })).toEqual({ action: "refuse" });
    expect(guardDecision({ kind: "merchant", role: "merchant", name: "M" }, { kind: "slug", slug: "commandes" })).toEqual({ action: "refuse" });
  });

  it("a driver (a staff account of the driver app): refused like a customer", () => {
    expect(guardDecision(staff("driver"), { kind: "landing" })).toEqual({ action: "refuse" });
  });

  it("a staff account with no back-office role (null, hr, anything unknown): the no-role page", () => {
    for (const role of [null, "hr", "root", "", "Admin"]) expect(guardDecision(staff(role), { kind: "landing" }), String(role)).toEqual({ action: "noRole" });
  });

  it("a route the role may not see: no access, in place (no redirect)", () => {
    expect(guardDecision(staff("cashier"), { kind: "slug", slug: "dispatch" })).toEqual({ action: "noAccess" });
    expect(guardDecision(staff("admin"), { kind: "slug", slug: "caisses" })).toEqual({ action: "noAccess" });
    expect(guardDecision(staff("agent"), { kind: "slug", slug: "reglements" })).toEqual({ action: "noAccess" });
  });

  it("a route the role may see is allowed", () => {
    expect(guardDecision(staff("accountant"), { kind: "slug", slug: "reglements" })).toEqual({ action: "allow" });
    expect(guardDecision(staff("cashier"), { kind: "slug", slug: "caisses" })).toEqual({ action: "allow" });
  });

  it("a slug that is not a screen: not found", () => {
    expect(guardDecision(staff("admin"), { kind: "slug", slug: "nope" })).toEqual({ action: "notFound" });
  });

  it("the landing target goes to the landing page of the role (Cpt Factures, Cai Caisses, the others the dashboard)", () => {
    expect(guardDecision(staff("accountant"), { kind: "landing" })).toEqual({ action: "landing", slug: "factures" });
    expect(guardDecision(staff("cashier"), { kind: "landing" })).toEqual({ action: "landing", slug: "caisses" });
    for (const role of ["management", "operations", "agent", "logistics", "customer_service", "admin"])
      expect(guardDecision(staff(role), { kind: "landing" }), role).toEqual({ action: "landing", slug: "tableau-de-bord" });
  });
});

describe("afterSignInPath: ?next= is honoured only for a same-site path the role may see", () => {
  it("honours a screen of the role", () => {
    expect(afterSignInPath("accountant", "/reglements")).toBe("/reglements");
    expect(afterSignInPath("admin", "/utilisateurs")).toBe("/utilisateurs");
    expect(afterSignInPath("admin", "/utilisateurs/")).toBe("/utilisateurs");
  });
  it("goes to the landing page when the role may not see it, or when there is nothing to honour", () => {
    expect(afterSignInPath("cashier", "/dispatch")).toBe("/caisses");
    expect(afterSignInPath("admin", "/caisses")).toBe("/tableau-de-bord");
    expect(afterSignInPath("accountant", null)).toBe("/factures");
    expect(afterSignInPath("agent", undefined)).toBe("/tableau-de-bord");
    expect(afterSignInPath("agent", "")).toBe("/tableau-de-bord");
  });
  it("refuses anything that is not a same-site path to a screen: another site, a protocol-relative URL, a backslash, a script, no leading slash, no such screen", () => {
    // the agent sees /commandes, so a refusal shows as the landing page, never as the path that was asked for
    for (const bad of ["https://evil.example/commandes", "//evil.example/commandes", "/\\evil.example/commandes", "javascript:alert(1)", "commandes", "/nope", "/compte"])
      expect(afterSignInPath("agent", bad), bad).toBe("/tableau-de-bord");
  });
  it("drops a language prefix (the router adds it back)", () => {
    expect(afterSignInPath("agent", "/ar/commandes")).toBe("/commandes");
  });
  it("ignores a query or a fragment on a screen of the role", () => {
    expect(afterSignInPath("accountant", "/reglements?x=1#top")).toBe("/reglements");
  });
});
