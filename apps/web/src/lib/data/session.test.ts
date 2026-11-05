import { beforeEach, describe, expect, it } from "vitest";
import { afterSignInPath } from "../auth/next";
import { DRAFT_KEY } from "../order/draft";
import { readJson, useMemoryStorage, writeJson } from "../storage";
import { sessionFor } from "./accounts";
import { signIn } from "./auth";
import { FIXTURE_ACCOUNTS, FIXTURE_PASSWORD, FIXTURE_TEAM_MEMBERS } from "./fixtures/accounts";
import { seedOrderFixtures } from "./fixtures/orders";
import { ACCOUNT_ORDERS } from "./order-model";
import { getSession, homeFor, SESSION_KEY, setSession, signOut, type Session } from "./session";

const [customer, merchant] = FIXTURE_ACCOUNTS as [
  (typeof FIXTURE_ACCOUNTS)[0],
  (typeof FIXTURE_ACCOUNTS)[0],
];
let store: Map<string, string>;

beforeEach(() => {
  store = useMemoryStorage();
});

const oldSession = (kind: "customer" | "merchant", accountId: string) => ({
  accountId,
  kind,
  contract: kind === "merchant" ? "validated" : null,
  phoneVerified: true,
  maskedPhone: "+216 •• ••• 001",
});

describe("session with a user and a role", () => {
  it("getSession upgrades an old session: userId = accountId, role null for a customer, admin for a merchant", () => {
    writeJson(SESSION_KEY, oldSession("customer", customer.id));
    expect(getSession()).toMatchObject({ userId: customer.id, role: null });
    writeJson(SESSION_KEY, oldSession("merchant", merchant.id));
    expect(getSession()).toMatchObject({ userId: merchant.id, role: "admin" });
  });

  it("getSession keeps a stored userId and role, and drops an unknown role", () => {
    writeJson(SESSION_KEY, {
      ...oldSession("merchant", merchant.id),
      userId: "usr-x",
      role: "user",
    });
    expect(getSession()).toMatchObject({ userId: "usr-x", role: "user" });
    writeJson(SESSION_KEY, { ...oldSession("customer", customer.id), role: "root" });
    expect(getSession()?.role).toBeNull();
  });

  it("sessionFor an account: userId is the account, no role for a customer, admin for a merchant", () => {
    expect(sessionFor({ ...customer, google: false })).toMatchObject({
      userId: customer.id,
      role: null,
    });
    expect(sessionFor({ ...merchant, google: false })).toMatchObject({
      userId: merchant.id,
      role: "admin",
    });
  });

  it("has two fake team members on the validated merchant, one admin and one user", () => {
    expect(FIXTURE_TEAM_MEMBERS).toEqual([
      expect.objectContaining({
        userId: "usr-yasmine-admin",
        accountId: "acc-merchant-validated",
        name: "Yasmine K.",
        phone: "+21671000011",
        role: "admin",
      }),
      expect.objectContaining({
        userId: "usr-yasmine-user",
        accountId: "acc-merchant-validated",
        name: "Walid H.",
        phone: "+21671000012",
        role: "user",
      }),
    ]);
  });

  it("signing in with a member's phone gives the merchant account with the member's user and role", async () => {
    for (const member of FIXTURE_TEAM_MEMBERS) {
      const result = await signIn(member.phone, FIXTURE_PASSWORD);
      expect(result).toMatchObject({
        status: "ok",
        session: {
          accountId: "acc-merchant-validated",
          userId: member.userId,
          role: member.role,
          kind: "merchant",
          contract: "validated",
        },
      });
      expect(getSession()).toMatchObject({ userId: member.userId, role: member.role });
    }
    expect(await signIn(FIXTURE_TEAM_MEMBERS[0]!.phone, "wrong-password")).toEqual({
      status: "invalidCredentials",
    });
  });
});

describe("homeFor and the redirect after sign-in", () => {
  const session = (kind: Session["kind"]): Session => ({
    ...sessionFor({ ...(kind === "merchant" ? merchant : customer), google: false }),
  });

  it("a customer goes to /compte, a merchant to /pro", () => {
    expect(homeFor(session("customer"))).toBe("/compte");
    expect(homeFor(session("merchant"))).toBe("/pro");
  });

  it("with no next (or a refused one) the redirect is homeFor, a safe next is honoured", () => {
    const m = session("merchant");
    expect(afterSignInPath(null, m)).toBe("/pro");
    expect(afterSignInPath("", m)).toBe("/pro");
    expect(afterSignInPath("//evil.example", m)).toBe("/pro");
    expect(afterSignInPath("https://evil.example", m)).toBe("/pro");
    expect(afterSignInPath("/commande/recapitulatif", m)).toBe("/commande/recapitulatif");
    expect(afterSignInPath("/fr/suivi?code=x", session("customer"))).toBe("/suivi?code=x");
    expect(afterSignInPath(null, session("customer"))).toBe("/compte");
  });
});

describe("signOut", () => {
  it("removes the session and the order draft, and never touches the fg.mock tables", () => {
    seedOrderFixtures();
    setSession(sessionFor({ ...customer, google: false }));
    writeJson(DRAFT_KEY, { version: 1 });
    const orders = JSON.stringify(readJson(ACCOUNT_ORDERS));
    const mockKeys = [...store.keys()].filter(
      (key) => key.startsWith("fg.mock.") && key !== SESSION_KEY,
    );
    expect(mockKeys.length).toBeGreaterThan(0);
    signOut();
    expect(store.has(SESSION_KEY)).toBe(false);
    expect(store.has(DRAFT_KEY)).toBe(false);
    for (const key of mockKeys) expect(store.has(key)).toBe(true);
    expect(JSON.stringify(readJson(ACCOUNT_ORDERS))).toBe(orders);
  });
});
