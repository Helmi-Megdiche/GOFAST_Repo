import { describe, expect, it } from "vitest";
import { homeFor, type Session } from "../data/session";
import { guardDecision } from "./guard";

const base = { phoneVerified: true, maskedPhone: "", contract: null } as const;
const customer: Session = { ...base, accountId: "a", userId: "a", role: null, kind: "customer" };
const admin: Session = {
  ...base,
  accountId: "m",
  userId: "u1",
  role: "admin",
  kind: "merchant",
  contract: "validated",
};
const user: Session = { ...admin, userId: "u2", role: "user" };

describe("space guard", () => {
  it("no session: sign in, and come back", () => {
    expect(guardDecision(null, { kind: "customer" })).toEqual({ action: "signIn" });
    expect(guardDecision(null, { kind: "merchant", role: "admin" })).toEqual({ action: "signIn" });
  });

  it("the wrong kind goes to the person's own home", () => {
    expect(guardDecision(customer, { kind: "merchant" })).toEqual({
      action: "redirect",
      to: homeFor(customer),
    });
    expect(guardDecision(admin, { kind: "customer" })).toEqual({
      action: "redirect",
      to: "/pro",
    });
  });

  it("the right kind is allowed; a role-restricted page needs that role", () => {
    expect(guardDecision(customer, { kind: "customer" })).toEqual({ action: "allow" });
    expect(guardDecision(user, { kind: "merchant" })).toEqual({ action: "allow" });
    expect(guardDecision(admin, { kind: "merchant", role: "admin" })).toEqual({ action: "allow" });
    expect(guardDecision(user, { kind: "merchant", role: "admin" })).toEqual({
      action: "notAllowed",
    });
  });
});
