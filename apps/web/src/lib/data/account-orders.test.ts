import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { buildOrderRequest } from "../order/request";
import { readyDraft } from "../order/test-draft";
import { readJson, useMemoryStorage } from "../storage";
import { getAccountOrder, listAccountOrders, orderHistory, parcelsOf } from "./account-orders";
import { FIXTURE_ORDER_CODES, seedOrderFixtures } from "./fixtures/orders";
import { readTable } from "./mock-db";
import { ACCOUNT_ORDERS, type AccountOrder } from "./order-model";
import { createOrder } from "./orders";
import { mockCodeFor, sendCode, verifyCode } from "./otp";
import { setSession, type Session } from "./session";

const T0 = Date.parse("2026-11-04T08:30:00Z");
const session = (accountId: string): Session => ({
  accountId,
  userId: accountId,
  role: null,
  kind: "customer",
  contract: null,
  phoneVerified: true,
  maskedPhone: "",
});

beforeEach(() => {
  useMemoryStorage();
  setClock(() => T0);
});

describe("seedOrderFixtures", () => {
  it("runs once, sets fg.mock.seed and keeps created orders", async () => {
    // The first reader call seeds.
    const before = listAccountOrders(session("acc-customer"));
    expect(readJson("fg.mock.seed")).toBe("orders-v1");
    const fixtureCount = Object.keys(readTable<AccountOrder>(ACCOUNT_ORDERS)).length;
    expect(fixtureCount).toBe(FIXTURE_ORDER_CODES.length);

    const target = { channel: "sms", value: "+216 20 000 000" } as const;
    await sendCode(target, "order");
    await verifyCode(target, mockCodeFor(target, "order")!, "order");
    setSession(session("acc-customer"));
    const created = await createOrder(buildOrderRequest(readyDraft(T0), true)!, "seed-k1");
    if (created.status !== "created") throw new Error("expected created");

    const after = listAccountOrders(session("acc-customer"));
    expect(after).toHaveLength(before.length + 1);
    expect(after.map((o) => o.code)).toContain(created.code);
    // Seeding again changes nothing.
    seedOrderFixtures();
    expect(Object.keys(readTable<AccountOrder>(ACCOUNT_ORDERS))).toHaveLength(fixtureCount + 1);
  });
});

describe("scoped readers", () => {
  it("lists only the account's orders, newest first", () => {
    const orders = listAccountOrders(session("acc-customer"));
    expect(orders.length).toBeGreaterThanOrEqual(11);
    expect(orders.every((o) => o.ownerAccountId === "acc-customer")).toBe(true);
    const dates = orders.map((o) => o.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("is empty for an account with no order", () => {
    expect(listAccountOrders(session("acc-customer-empty"))).toEqual([]);
  });

  it("returns the order for its owner, normalizing the code", () => {
    const [first] = listAccountOrders(session("acc-customer"));
    const found = getAccountOrder(session("acc-customer"), ` ${first!.code.toLowerCase()} `);
    expect(found).toEqual(first);
  });

  it("answers another account's code like an unknown code", () => {
    const [mine] = listAccountOrders(session("acc-customer"));
    const other = getAccountOrder(session("acc-customer-other"), mine!.code);
    expect(other).toEqual({ notFound: true });
    expect(getAccountOrder(session("acc-customer-other"), "FG-0000-0000")).toEqual(other);
  });

  it("reads parcels in index order and order events only", () => {
    const partial = listAccountOrders(session("acc-customer")).find(
      (o) => o.status === "partially_delivered",
    )!;
    expect(parcelsOf(partial.code).map((p) => p.index)).toEqual([1, 2, 3]);
    const history = orderHistory(partial.code);
    expect(history[0]?.status).toBe("received");
    expect(history.at(-1)?.status).toBe("partially_delivered");
    // Order events only: no parcel state leaks in.
    for (const entry of history) {
      expect(["taken", "handed_over", "to_collect", "delivery_failed"]).not.toContain(entry.status);
    }
    expect(Object.keys(history[0]!).sort()).toEqual(["atUtc", "status"]);
  });
});
