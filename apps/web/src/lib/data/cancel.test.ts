import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { writeJson, useMemoryStorage } from "../storage";
import { getAccountOrder, getOrderDetail, parcelsOf } from "./account-orders";
import { cancelOption } from "./cancel-option";
import { cancelOrder } from "./cancel";
import { readTable } from "./mock-db";
import { MISSIONS, STATUS_EVENTS, type Mission, type StatusEvent } from "./order-model";
import { NetworkError } from "./orders";
import type { Session } from "./session";
import { activePickupMission, createMission, transition, type OrderStatus } from "./states";

const T0 = Date.parse("2026-11-04T08:30:00Z");

const session = (accountId: string, role: Session["role"] = null, userId = accountId): Session => ({
  accountId,
  userId,
  role,
  kind: role ? "merchant" : "customer",
  contract: role ? "validated" : null,
  phoneVerified: true,
  maskedPhone: "",
});
const customer = session("acc-customer");

// Fixture orders of acc-customer, one per state (fixtures/orders.ts).
const RECEIVED = "FG-5A1R-0001";
const CONFIRMED = "FG-5A1C-0002";
const ASSIGNED = "FG-5A1A-0003"; // the driver has not arrived
const ARRIVED = "FG-5A1B-0004"; // the pickup mission has arrivedAt
const PICKUP_FAILED = "FG-5A1F-0005";
const PICKED_UP = "FG-5A1P-0006";
const IN_TRANSIT = "FG-7K4M-2QXP";
const DELIVERED = "FG-5A1D-0008";
const CANCELED = "FG-5A1X-0009";
const OTHER_ACCOUNT = "FG-5B2A-0001";

beforeEach(() => {
  useMemoryStorage();
  setClock(() => T0);
});

const orderEvents = (code: string, to: string) =>
  Object.values(readTable<StatusEvent>(STATUS_EVENTS)).filter(
    (e) => e.subjectType === "order" && e.subjectId === code && e.toStatus === to,
  );

const statusOf = (code: string): OrderStatus => {
  const order = getAccountOrder(customer, code);
  if ("notFound" in order) throw new Error("not found");
  return order.status;
};

describe("cancelOption (CMD-08, R212)", () => {
  const mission = (arrivedAt: string | null) => ({ arrivedAt });
  const at = "2026-11-04T09:00:00.000Z";

  it("is free before the driver arrives", () => {
    expect(cancelOption({ status: "received" }, null)).toBe("free");
    expect(cancelOption({ status: "confirmed" }, null)).toBe("free");
    expect(cancelOption({ status: "assigned" }, mission(null))).toBe("free");
    expect(cancelOption({ status: "assigned" }, null)).toBe("free");
  });

  it("has a fee once the pickup mission has arrivedAt, before pickup", () => {
    expect(cancelOption({ status: "assigned" }, mission(at))).toBe("withFee");
  });

  it("may have a fee after a failed pickup, and is free again once confirmed with a new slot", () => {
    expect(cancelOption({ status: "pickup_failed" }, mission(at))).toBe("mayHaveFee");
    expect(cancelOption({ status: "pickup_failed" }, null)).toBe("mayHaveFee");
    expect(cancelOption({ status: "confirmed" }, null)).toBe("free");
  });

  it("is a claim from pickup on, and nothing once the order is over", () => {
    for (const status of ["picked_up", "in_transit"] as const) {
      expect(cancelOption({ status }, mission(at))).toBe("claimOnly");
    }
    for (const status of [
      "delivered",
      "partially_delivered",
      "returned",
      "lost",
      "canceled",
    ] as const) {
      expect(cancelOption({ status }, mission(at))).toBe("none");
    }
  });

  it("reads the real orders: every fixture state and the pickup mission", async () => {
    const option = async (code: string) => {
      const result = await getOrderDetail(customer, code);
      if (result.status !== "found") throw new Error("not found");
      return result.order.cancelOption;
    };
    expect(await option(RECEIVED)).toBe("free");
    expect(await option(CONFIRMED)).toBe("free");
    expect(await option(ASSIGNED)).toBe("free");
    expect(await option(ARRIVED)).toBe("withFee");
    expect(await option(PICKUP_FAILED)).toBe("mayHaveFee");
    expect(await option(PICKED_UP)).toBe("claimOnly");
    expect(await option(IN_TRANSIT)).toBe("claimOnly");
    expect(await option(DELIVERED)).toBe("none");
    expect(await option(CANCELED)).toBe("none");
  });

  it("is free again after pickup_failed then a new slot, even though the old mission arrived", async () => {
    await getOrderDetail(customer, PICKUP_FAILED); // seeds
    expect(transition({ type: "order", id: PICKUP_FAILED }, "confirmed", "bo", { at: T0 })).toEqual(
      {
        ok: true,
      },
    );
    const result = await getOrderDetail(customer, PICKUP_FAILED);
    if (result.status !== "found") throw new Error();
    expect(result.order.cancelOption).toBe("free");
    // A new mission, then assigned: it has no arrivedAt, so the cancel stays free (H6).
    createMission(PICKUP_FAILED, "pickup", T0);
    expect(transition({ type: "order", id: PICKUP_FAILED }, "assigned", "bo", { at: T0 })).toEqual({
      ok: true,
    });
    const again = await getOrderDetail(customer, PICKUP_FAILED);
    if (again.status !== "found") throw new Error();
    expect(again.order.cancelOption).toBe("free");
  });
});

describe("cancelOrder", () => {
  it("cancels for free before the driver arrives: fee none", async () => {
    expect(await cancelOrder(customer, CONFIRMED, { acceptedFee: "none" })).toEqual({
      status: "canceled",
      fee: "none",
    });
    expect(statusOf(CONFIRMED)).toBe("canceled");
    const order = getAccountOrder(customer, CONFIRMED);
    expect("cancel" in order && order.cancel).toMatchObject({ fee: "none" });
  });

  it("after arrival: feeRequired, nothing written, then canceled with the fee once accepted", async () => {
    expect(await cancelOrder(customer, ARRIVED, { acceptedFee: "none" })).toEqual({
      status: "feeRequired",
      fee: "applies",
    });
    expect(statusOf(ARRIVED)).toBe("assigned");
    expect(orderEvents(ARRIVED, "canceled")).toHaveLength(0);
    expect(await cancelOrder(customer, ARRIVED, { acceptedFee: "applies" })).toEqual({
      status: "canceled",
      fee: "applies",
    });
    expect(statusOf(ARRIVED)).toBe("canceled");
  });

  it("from pickup_failed: feeRequired, then canceled with backOfficeDecides", async () => {
    expect(await cancelOrder(customer, PICKUP_FAILED, { acceptedFee: "none" })).toEqual({
      status: "feeRequired",
      fee: "backOfficeDecides",
    });
    expect(
      await cancelOrder(customer, PICKUP_FAILED, { acceptedFee: "backOfficeDecides" }),
    ).toEqual({
      status: "canceled",
      fee: "backOfficeDecides",
    });
    const order = getAccountOrder(customer, PICKUP_FAILED);
    expect("cancel" in order && order.cancel).toMatchObject({ fee: "backOfficeDecides" });
  });

  it("accepting a fee that does not apply is harmless: a free cancel records none", async () => {
    expect(await cancelOrder(customer, RECEIVED, { acceptedFee: "applies" })).toEqual({
      status: "canceled",
      fee: "none",
    });
  });

  it("from pickup on it is a claim, and a finished order cannot be canceled", async () => {
    for (const code of [PICKED_UP, IN_TRANSIT]) {
      expect(await cancelOrder(customer, code, { acceptedFee: "applies" })).toEqual({
        status: "claimOnly",
      });
    }
    expect(await cancelOrder(customer, DELIVERED, { acceptedFee: "applies" })).toEqual({
      status: "notCancellable",
    });
    expect(statusOf(PICKED_UP)).toBe("picked_up");
    expect(statusOf(DELIVERED)).toBe("delivered");
  });

  it("cascades in one call: parcels canceled, pickup mission finished with orderCanceled, one event", async () => {
    await cancelOrder(customer, ARRIVED, { acceptedFee: "applies" });
    expect(parcelsOf(ARRIVED).map((p) => p.status)).toEqual(["canceled"]);
    const missions = Object.values(readTable<Mission>(MISSIONS)).filter(
      (m) => m.orderCode === ARRIVED,
    );
    expect(missions).toHaveLength(1);
    expect(missions[0]).toMatchObject({ status: "finished", endReason: "orderCanceled" });
    expect(activePickupMission(ARRIVED)).toBeNull();
    expect(orderEvents(ARRIVED, "canceled")).toHaveLength(1);
    const order = getAccountOrder(customer, ARRIVED);
    // The fee and the state were written together: cancel.at is the event time.
    expect("cancel" in order && order.cancel?.at).toBe(new Date(T0).toISOString());
  });

  it("replays by state: a canceled order answers canceled again, with no new event", async () => {
    await cancelOrder(customer, ARRIVED, { acceptedFee: "applies" });
    const before = Object.keys(readTable<StatusEvent>(STATUS_EVENTS)).length;
    expect(await cancelOrder(customer, ARRIVED, { acceptedFee: "none" })).toEqual({
      status: "canceled",
      fee: "applies",
    });
    expect(await cancelOrder(customer, CANCELED, { acceptedFee: "none" })).toEqual({
      status: "canceled",
      fee: "none",
    });
    expect(Object.keys(readTable<StatusEvent>(STATUS_EVENTS))).toHaveLength(before);
  });

  it("two cancels at once give one event", async () => {
    const [a, b] = await Promise.all([
      cancelOrder(customer, CONFIRMED, { acceptedFee: "none" }),
      cancelOrder(customer, CONFIRMED, { acceptedFee: "none" }),
    ]);
    expect(a).toEqual({ status: "canceled", fee: "none" });
    expect(b).toEqual({ status: "canceled", fee: "none" });
    expect(orderEvents(CONFIRMED, "canceled")).toHaveLength(1);
  });

  it("another account's order is not found, and nothing changes", async () => {
    expect(await cancelOrder(customer, OTHER_ACCOUNT, { acceptedFee: "applies" })).toEqual({
      status: "notFound",
    });
    expect(await cancelOrder(customer, "FG-NOPE-0000", { acceptedFee: "applies" })).toEqual({
      status: "notFound",
    });
    expect(orderEvents(OTHER_ACCOUNT, "canceled")).toHaveLength(0);
    expect(await getOrderDetail(customer, OTHER_ACCOUNT)).toEqual({ status: "notFound" });
    expect(await getOrderDetail(customer, "FG-NOPE-0000")).toEqual({ status: "notFound" });
  });

  it("an admin and a user of the company can both cancel a company order", async () => {
    const admin = session("acc-merchant-validated", "admin", "usr-yasmine-admin");
    const user = session("acc-merchant-validated", "user", "usr-walid-user");
    expect(await cancelOrder(admin, "FG-5C3B-0002", { acceptedFee: "none" })).toEqual({
      status: "canceled",
      fee: "none",
    });
    useMemoryStorage();
    expect(await cancelOrder(user, "FG-5C3B-0002", { acceptedFee: "none" })).toEqual({
      status: "canceled",
      fee: "none",
    });
    // Another company's customer cannot.
    useMemoryStorage();
    expect(await cancelOrder(customer, "FG-5C3B-0002", { acceptedFee: "none" })).toEqual({
      status: "notFound",
    });
  });

  it("a stale page: free when read, the driver arrives, then the confirm needs the fee", async () => {
    const read = await getOrderDetail(customer, ASSIGNED);
    if (read.status !== "found") throw new Error();
    expect(read.order.cancelOption).toBe("free");
    const mission = activePickupMission(ASSIGNED)!;
    expect(
      transition({ type: "mission", id: mission.id }, "arrived", "driver", { at: T0 }),
    ).toEqual({
      ok: true,
    });
    // The page still believed "free" and sent acceptedFee: "none".
    expect(await cancelOrder(customer, ASSIGNED, { acceptedFee: "none" })).toEqual({
      status: "feeRequired",
      fee: "applies",
    });
    expect(statusOf(ASSIGNED)).toBe("assigned");
  });

  it("a stale page: free when read, the pickup happens, then the confirm is a claim", async () => {
    await getOrderDetail(customer, ASSIGNED);
    const mission = activePickupMission(ASSIGNED)!;
    transition({ type: "mission", id: mission.id }, "arrived", "driver", { at: T0 });
    transition({ type: "parcel", id: `${ASSIGNED}-p1` }, "taken", "driver", { at: T0 });
    transition({ type: "mission", id: mission.id }, "finished", "driver", { at: T0 });
    expect(statusOf(ASSIGNED)).toBe("picked_up");
    expect(await cancelOrder(customer, ASSIGNED, { acceptedFee: "none" })).toEqual({
      status: "claimOnly",
    });
    expect(statusOf(ASSIGNED)).toBe("picked_up");
  });

  it("a cut connection throws NetworkError before any write, once", async () => {
    writeJson("fg.mock.failNext:cancelOrder", true);
    await expect(cancelOrder(customer, CONFIRMED, { acceptedFee: "none" })).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(statusOf(CONFIRMED)).toBe("confirmed");
    expect(await cancelOrder(customer, CONFIRMED, { acceptedFee: "none" })).toMatchObject({
      status: "canceled",
    });
  });
});

describe("cancelOrder: the consent carries the fee the client saw (RV-05)", () => {
  it("a may-apply consent does not become a certain fee after the driver arrived", async () => {
    const read = await getOrderDetail(customer, PICKUP_FAILED);
    if (read.status !== "found") throw new Error();
    expect(read.order.cancelOption).toBe("mayHaveFee");
    // Back-office: new slot, new mission, assigned, then the driver arrives.
    const step = (type: "order" | "mission", id: string, to: string) =>
      expect(transition({ type, id }, to, "bo", { at: T0 })).toEqual({ ok: true });
    step("order", PICKUP_FAILED, "confirmed");
    const mission = createMission(PICKUP_FAILED, "pickup", T0);
    step("order", PICKUP_FAILED, "assigned");
    step("mission", mission.id, "accepted");
    step("mission", mission.id, "arrived");
    expect(
      await cancelOrder(customer, PICKUP_FAILED, { acceptedFee: "backOfficeDecides" }),
    ).toEqual({
      status: "feeRequired",
      fee: "applies",
    });
    expect(statusOf(PICKUP_FAILED)).toBe("assigned");
    expect(orderEvents(PICKUP_FAILED, "canceled")).toHaveLength(0);
    expect(await cancelOrder(customer, PICKUP_FAILED, { acceptedFee: "applies" })).toEqual({
      status: "canceled",
      fee: "applies",
    });
  });

  it("a certain-fee consent is refused when the order goes back to a failed pickup", async () => {
    await getOrderDetail(customer, ARRIVED);
    expect(transition({ type: "order", id: ARRIVED }, "pickup_failed", "bo", { at: T0 })).toEqual({
      ok: true,
    });
    expect(await cancelOrder(customer, ARRIVED, { acceptedFee: "applies" })).toEqual({
      status: "feeRequired",
      fee: "backOfficeDecides",
    });
    expect(statusOf(ARRIVED)).toBe("pickup_failed");
  });

  it("a free cancel needs no consent whatever the client sends", async () => {
    expect(await cancelOrder(customer, RECEIVED, { acceptedFee: "applies" })).toEqual({
      status: "canceled",
      fee: "none",
    });
  });
});
