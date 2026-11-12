import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { buildOrderRequest } from "../order/request";
import { readyDraft } from "../order/test-draft";
import { readJson, useMemoryStorage, writeJson } from "../storage";
import {
  getAccountOrder,
  getDashboard,
  getOrderDetail,
  listAccountOrders,
  listOrders,
  monthOf,
  orderHistory,
  ORDERS_PAGE_SIZE,
  parcelsOf,
} from "./account-orders";
import { FIXTURE_ORDER_CODES, seedOrderFixtures } from "./fixtures/orders";
import { readTable, writeRow } from "./mock-db";
import {
  ACCOUNT_ORDERS,
  PARCELS,
  type AccountOrder,
  type FailureReason,
  type Parcel,
} from "./order-model";
import { createOrder, NetworkError } from "./orders";
import { mockCodeFor, sendCode, verifyCode } from "./otp";
import { setSession, type Session } from "./session";
import { transition } from "./states";

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
    expect(readJson("fg.mock.seed")).toBe("orders-v2");
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

describe("listOrders (C02)", () => {
  const all = { filter: "all", month: null, q: "", page: 1 } as const;
  const mine = session("acc-customer");
  const mineCount = () =>
    FIXTURE_ORDER_CODES.filter((c) => c.startsWith("FG-5A1") || c === "FG-7K4M-2QXP").length;

  it("pages the account's orders, newest first, with the counts the chips need", async () => {
    const first = await listOrders(mine, all);
    expect(first.accountTotal).toBe(mineCount());
    expect(first.rows).toHaveLength(ORDERS_PAGE_SIZE);
    expect(first.pages).toBe(Math.ceil(mineCount() / ORDERS_PAGE_SIZE));
    const second = await listOrders(mine, { ...all, page: 2 });
    expect(second.rows).toHaveLength(mineCount() - ORDERS_PAGE_SIZE);
    const dates = [...first.rows, ...second.rows].map((r) => r.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
    // A page past the end shows the last page, not an empty list.
    expect((await listOrders(mine, { ...all, page: 99 })).page).toBe(first.pages);
  });

  it("filters: in progress, delivered, failures and returns; a canceled order shows under all only", async () => {
    const statuses = async (filter: "inProgress" | "delivered" | "failed") =>
      [...new Set((await listOrders(mine, { ...all, filter })).rows.map((r) => r.status))].sort();
    expect(await statuses("inProgress")).toEqual(
      ["assigned", "confirmed", "in_transit", "picked_up", "received"].sort(),
    );
    expect(await statuses("delivered")).toEqual(["delivered"]);
    expect(await statuses("failed")).toEqual(["partially_delivered", "pickup_failed", "returned"]);
    const everything = [
      ...(await listOrders(mine, all)).rows,
      ...(await listOrders(mine, { ...all, page: 2 })).rows,
    ];
    expect(everything.some((r) => r.status === "canceled")).toBe(true);
    const inProgress = await listOrders(mine, { ...all, filter: "inProgress" });
    expect(inProgress.total).toBe(inProgress.inProgressCount);
  });

  it("filters by month in Africa/Tunis and lists the months present", async () => {
    const october = await listOrders(mine, { ...all, month: "2026-10" });
    expect(october.rows.map((r) => r.code)).toEqual(["FG-5A1M-0014"]);
    expect((await listOrders(mine, all)).months).toEqual(["2026-11", "2026-10"]);
    expect(monthOf("2026-10-31T23:30:00Z")).toBe("2026-11"); // 00:30 on 1 Nov in Tunis
    expect(monthOf("2026-11-30T22:59:00Z")).toBe("2026-11");
  });

  it("searches the code or the recipient, ignoring case, accents, spaces and dashes", async () => {
    const byCode = await listOrders(mine, { ...all, q: "fg 5a1c 0002" });
    expect(byCode.rows.map((r) => r.code)).toEqual(["FG-5A1C-0002"]);
    const nadia = await listOrders(mine, { ...all, q: "NADIA" });
    expect(nadia.total).toBeGreaterThan(0);
    expect(nadia.rows.every((r) => r.recipientName.startsWith("Nadia"))).toBe(true);
    expect((await listOrders(mine, { ...all, q: "zzz" })).total).toBe(0);
  });

  it("is scoped: another account sees none of these, an empty account sees nothing", async () => {
    const other = await listOrders(session("acc-customer-other"), all);
    expect(other.rows.map((r) => r.code)).toEqual(["FG-5B2A-0001"]);
    const empty = await listOrders(session("acc-customer-empty"), all);
    expect(empty).toMatchObject({ rows: [], total: 0, accountTotal: 0, pages: 1 });
    const probe = await listOrders(session("acc-customer-other"), { ...all, q: "FG-5A1C" });
    expect(probe.total).toBe(0);
  });

  it("a cut connection throws NetworkError once", async () => {
    writeJson("fg.mock.failNext:listOrders", true);
    await expect(listOrders(mine, all)).rejects.toBeInstanceOf(NetworkError);
    expect((await listOrders(mine, all)).rows.length).toBeGreaterThan(0);
  });
});

describe("getDashboard (C01)", () => {
  it("lists the orders in progress and the last three that ended, not the canceled", async () => {
    const dash = await getDashboard(session("acc-customer"));
    expect(dash.firstName).toBe("Sami");
    expect(dash.inProgress.length).toBeGreaterThan(0);
    expect(dash.inProgress.every((o) => o.parcelCount >= 1)).toBe(true);
    expect(dash.lastDeliveries).toHaveLength(3);
    expect(dash.lastDeliveries.some((o) => o.status === "canceled")).toBe(false);
    // The unpaid and the partly paid invoice of the billing fixtures (RV-15: same figure as C04).
    expect(dash.amountDueMillimes).toBe(29_000);
  });

  it("an account with nothing has empty lists, and the return balance is in millimes", async () => {
    const empty = await getDashboard(session("acc-customer-empty"));
    expect(empty).toMatchObject({ inProgress: [], lastDeliveries: [], amountDueMillimes: 0 });
    expect((await getDashboard(session("acc-customer-return-due"))).amountDueMillimes).toBe(7000);
  });
});

describe("getOrderDetail (C03)", () => {
  const mine = session("acc-customer");
  const detail = async (code: string) => {
    const result = await getOrderDetail(mine, code);
    if (result.status !== "found") throw new Error("not found");
    return result.order;
  };

  it("R204: the price lines and total stored at creation add up", async () => {
    const order = await detail("FG-5A1C-0002");
    expect(order.priceLines).toEqual([
      { kind: "base", millimes: 9000 },
      { kind: "distance", millimes: 3000 },
    ]);
    expect(order.priceLines.reduce((sum, line) => sum + line.millimes, 0)).toBe(
      order.totalMillimes,
    );
  });

  it("R206: a created order keeps the quote it was created with, whatever the clock says later", async () => {
    const target = { channel: "sms", value: "+216 20 000 000" } as const;
    await sendCode(target, "order");
    await verifyCode(target, mockCodeFor(target, "order")!, "order");
    setSession(mine);
    const request = buildOrderRequest(readyDraft(T0), true)!;
    const created = await createOrder(request, "detail-k1");
    if (created.status !== "created") throw new Error();
    setClock(() => T0 + 20 * 24 * 3_600_000);
    const order = await detail(created.code);
    expect(order.totalMillimes).toBe(request.quote.totalMillimes);
    expect(order.priceLines.reduce((sum, line) => sum + line.millimes, 0)).toBe(
      request.quote.totalMillimes,
    );
  });

  it("R208: both weights with the tolerance flag, in integer grams", async () => {
    const order = await detail("FG-5A1W-0013");
    expect(
      order.parcels.map((p) => [p.weightDeclaredG, p.weightMeasuredG, p.weightOverTolerance]),
    ).toEqual([
      [1500, 2300, true],
      [1500, 1900, false],
    ]);
    const plain = await detail("FG-5A1C-0002");
    expect(plain.parcels[0]).toMatchObject({ weightMeasuredG: null, weightOverTolerance: false });
  });

  it("R502: the failure reason of each parcel is in the parcel and in the timeline", async () => {
    const order = await detail("FG-5A1Z-0012");
    expect(order.parcels.map((p) => [p.status, p.attempts, p.failureReason])).toEqual([
      ["delivery_failed", 1, "recipientAbsent"],
      ["delivery_failed", 1, "phoneUnreachable"],
    ]);
    const failed = order.timeline.flatMap((e) =>
      e.kind === "deliveryFailed" ? [[e.parcelIndex, e.reason]] : [],
    );
    expect(failed).toEqual([
      [1, "recipientAbsent"],
      [2, "phoneUnreachable"],
    ]);
    const times = order.timeline.map((e) => e.atUtc);
    expect(times).toEqual([...times].sort());
  });

  it("SUI-05: a handed over parcel has its proof, and no phone is in the detail", async () => {
    const order = await detail("FG-5A1D-0008");
    expect(order.parcels[0]!.proof).toMatchObject({ level: "codeOrPhotoWithPosition" });
    expect(JSON.stringify(order)).not.toMatch(/\+216|2000001|phone/i);
  });

  it("the T19 order shows its 3 parcels with their own states", async () => {
    const order = await detail("FG-5A1Y-0011");
    expect(order.status).toBe("partially_delivered");
    expect(order.parcels.map((p) => p.status)).toEqual(["handed_over", "handed_over", "returned"]);
  });

  it("a cut connection throws NetworkError once", async () => {
    writeJson("fg.mock.failNext:getOrder", true);
    await expect(getOrderDetail(mine, "FG-5A1C-0002")).rejects.toBeInstanceOf(NetworkError);
    expect((await getOrderDetail(mine, "FG-5A1C-0002")).status).toBe("found");
  });
});

describe("C01 and C02 place every state (RV-14)", () => {
  const ALL_STATES = [
    "received",
    "confirmed",
    "assigned",
    "pickup_failed",
    "picked_up",
    "in_transit",
    "delivered",
    "partially_delivered",
    "returned",
    "lost",
    "canceled",
  ] as const;

  it("C01 lists every order that is not final as in progress, a failed pickup included", async () => {
    const dash = await getDashboard(session("acc-customer"));
    const open = listAccountOrders(session("acc-customer")).filter(
      (o) =>
        !["delivered", "partially_delivered", "returned", "lost", "canceled"].includes(o.status),
    );
    expect(open.some((o) => o.status === "pickup_failed")).toBe(true);
    expect(dash.inProgress.map((o) => o.code).sort()).toEqual(open.map((o) => o.code).sort());
  });

  it("C02: every state is under 'all', and under one chip at most; 'canceled' under none", async () => {
    const mine = session("acc-customer");
    const seen = new Map<string, number>();
    for (const filter of ["inProgress", "delivered", "failed"] as const) {
      for (let page = 1; page <= 2; page++) {
        for (const row of (await listOrders(mine, { filter, month: null, q: "", page })).rows) {
          seen.set(row.status, (seen.get(row.status) ?? 0) + 1);
        }
      }
    }
    // The states a fixture order has: each is in exactly one chip, except canceled.
    const present = new Set(listAccountOrders(mine).map((o) => o.status));
    for (const status of ALL_STATES) {
      if (!present.has(status)) continue;
      expect(seen.has(status), status).toBe(status !== "canceled");
    }
  });
});

describe("R502: the reason of each failure stays with its event", () => {
  it("a parcel that fails twice shows both reasons in the timeline", async () => {
    const mine = session("acc-customer");
    await getOrderDetail(mine, "FG-5A1Z-0012"); // seeds
    const parcelId = "FG-5A1Z-0012-p1";
    const patch = (reason: FailureReason) =>
      writeRow<Parcel>(PARCELS, parcelId, {
        ...readTable<Parcel>(PARCELS)[parcelId]!,
        attempts: 2,
        failure: { reason, photo: "p" },
      });
    const step = (to: string) =>
      expect(transition({ type: "parcel", id: parcelId }, to, "driver", { at: T0 })).toEqual({
        ok: true,
      });
    step("in_transit");
    patch("addressIncorrect");
    step("delivery_failed");
    const result = await getOrderDetail(mine, "FG-5A1Z-0012");
    if (result.status !== "found") throw new Error();
    const reasons = result.order.timeline.flatMap((e) =>
      e.kind === "deliveryFailed" && e.parcelIndex === 1 ? [e.reason] : [],
    );
    expect(reasons).toEqual(["recipientAbsent", "addressIncorrect"]);
  });
});
