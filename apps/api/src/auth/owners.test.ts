import { describe, expect, it } from "vitest";
import { loadOperations } from "../http/spec.ts";
import { AuthOwners } from "./owners.ts";

const actor = { accountId: "a", userId: "a", role: "customer" } as never;
const op = (operationId: string) => ({ operationId }) as never;

describe("AuthOwners: deny by default (PR 4a)", () => {
  it("allows only the caller's own profile and session", async () => {
    const owners = new AuthOwners();
    for (const id of ["getMe", "updateMe", "deleteSession"]) expect(await owners.allows(actor, op(id))).toBe(true);
  });

  it("refuses every other operation until its PR binds a check", async () => {
    const owners = new AuthOwners();
    for (const id of ["cancelOrder", "confirmOrder", ""]) expect(await owners.allows(actor, op(id))).toBe(false);
  });

  it.each(["listServices", "createZoneCheck", "createQuote", "getQuote"])(
    "GH-10: %s (public pricing) is on the allow-list",
    async (id) => {
      expect(await new AuthOwners().allows(actor, op(id))).toBe(true);
    },
  );

  it.each(["createOrder", "listOrders", "getOrder"])("GH-22: %s is on the allow-list (the RLS and the service answer 404 for another's order)", async (id) => {
    expect(await new AuthOwners().allows(actor, op(id))).toBe(true);
  });

  it("allows exactly these ten of the operations of the contract, whatever the contract grows to", async () => {
    const owners = new AuthOwners();
    const allowed: string[] = [];
    for (const id of loadOperations().keys()) if (await owners.allows(actor, op(id))) allowed.push(id);
    expect(allowed.sort()).toEqual([
      "createOrder",
      "createQuote",
      "createZoneCheck",
      "deleteSession",
      "getMe",
      "getOrder",
      "getQuote",
      "listOrders",
      "listServices",
      "updateMe",
    ]);
  });
});
