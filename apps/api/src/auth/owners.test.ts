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
    for (const id of ["getOrder", "listOrders", "createOrder", ""]) expect(await owners.allows(actor, op(id))).toBe(false);
  });

  it("allows exactly three of the operations of the contract, whatever the contract grows to", async () => {
    const owners = new AuthOwners();
    const allowed: string[] = [];
    for (const id of loadOperations().keys()) if (await owners.allows(actor, op(id))) allowed.push(id);
    expect(allowed.sort()).toEqual(["deleteSession", "getMe", "updateMe"]);
  });
});
