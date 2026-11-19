import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.ts";
import { ApiError } from "../http/errors.ts";
import { OrdersRepo } from "./orders.repo.ts";
import type { OrderPlan } from "./orders.service.ts";

// GH-22 R503: a CHECK of the database (23514) on the order row can no longer be reached by a request, because the service
// refuses the slots first. If one gets there anyway, it is a bug of ours: a logged 500, never a silent one, and never a 4xx.

const pgError = (code: string, constraint: string) => Object.assign(new Error("db"), { cause: { code, constraint } });

function planWith(fail: unknown): { repo: OrdersRepo; statements: string[] } {
  const statements: string[] = [];
  const tx = {
    execute: vi.fn(async (query: { queryChunks?: unknown[] }) => {
      const text = JSON.stringify(query.queryChunks ?? []);
      statements.push(text);
      if (text.includes("insert into core.orders")) throw fail;
      if (text.includes("insert into core.addresses") || text.includes("insert into core.recipients")) return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }] };
      return { rows: [] };
    }),
  };
  const db = { withActor: (_a: unknown, fn: (t: unknown) => unknown) => fn(tx), withNoActor: (fn: (t: unknown) => unknown) => fn(tx) } as unknown as Db;
  return { repo: new OrdersRepo(db), statements };
}

const plan = (): OrderPlan =>
  ({
    scope: null,
    at: new Date("2026-11-20T10:00:00Z"),
    actor: { accountId: "a", userId: "a", role: "individual" },
    quote: { id: "q", service: "standard", totalMillimes: 1, lines: [], priceListValidFrom: new Date(), departureZoneId: "z", arrivalZoneId: "z", fragile: false, packaging: false, declaredValueMillimes: null },
    body: {
      sender: { name: "S", phone: "+21620000001", address: { text: "a" }, slot: { start_at: "2026-11-21T10:00:00Z", end_at: "2026-11-21T09:00:00Z" } },
      recipient: { name: "R", phone: "+21620000002", address: { text: "b" } },
      parcel: { type: "small", parcels: [{ weight_g: 1 }], content: "x" },
      service: { code: "standard" },
      payment_mode: "cashPickup",
    },
    freightPayer: "sender",
    proofLevel: "none",
    addressUnconfirmed: false,
    nullLines: [],
    markPhoneVerified: false,
    newTrackingNumber: () => "FG-AAAA-0001",
  }) as unknown as OrderPlan;

describe("GH-22 R503: a CHECK violation on the order row is a logged 500", () => {
  it("23514 becomes INTERNAL_ERROR and is logged with the constraint name, and no other 4xx", async () => {
    const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { repo } = planWith(pgError("23514", "orders_pickup_slot"));
    const error = (await repo.insert(plan()).catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect([error.code, error.status]).toEqual(["INTERNAL_ERROR", 500]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain("orders_pickup_slot");
    log.mockRestore();
  });
});
