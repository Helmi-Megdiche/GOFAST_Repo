import { describe, expect, it } from "vitest";
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
});
