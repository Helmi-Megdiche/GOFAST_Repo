import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { useMemoryStorage } from "../storage";
import { listAccountOrders, orderHistory, parcelsOf } from "./account-orders";
import { FIXTURE_ACCOUNTS } from "./fixtures/accounts";
import { FIXTURE_ORDER_CODES, seedOrderFixtures } from "./fixtures/orders";
import { FOUND_TRACKING_CODE } from "./fixtures/tracking";
import { readTable } from "./mock-db";
import {
  MISSIONS,
  PARCELS,
  STATUS_EVENTS,
  type Mission,
  type Parcel,
  type StatusEvent,
} from "./order-model";
import type { Session } from "./session";
import { activePickupMission, MISSION_NEXT, ORDER_NEXT, PARCEL_NEXT } from "./states";

const customer: Session = {
  accountId: "acc-customer",
  kind: "customer",
  contract: null,
  phoneVerified: true,
  maskedPhone: "",
};
const merchant: Session = { ...customer, accountId: "acc-merchant-validated", kind: "merchant" };

beforeEach(() => {
  useMemoryStorage();
  // Any date: the fixtures carry their own fixed Nov 2026 times and never read the clock.
  setClock(() => Date.parse("2031-02-03T04:05:06Z"));
  seedOrderFixtures();
});

const events = () => Object.values(readTable<StatusEvent>(STATUS_EVENTS));

describe("order fixtures are built through the transition tables", () => {
  it("replays every event as an allowed pair, in an unbroken chain", () => {
    const allowed = {
      order: ORDER_NEXT as Record<string, readonly string[]>,
      parcel: PARCEL_NEXT as Record<string, readonly string[]>,
      mission: MISSION_NEXT as Record<string, readonly string[]>,
    };
    const initial = { order: "received", parcel: "to_collect", mission: "proposed" };
    const bySubject = new Map<string, StatusEvent[]>();
    for (const event of events()) {
      const key = `${event.subjectType}:${event.subjectId}`;
      bySubject.set(key, [...(bySubject.get(key) ?? []), event]);
    }
    expect(bySubject.size).toBeGreaterThan(30);
    for (const [key, list] of bySubject) {
      // Stable sort: events written in the same minute keep their writing order.
      const sorted = [...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const type = sorted[0]!.subjectType;
      expect(sorted[0]!.fromStatus, key).toBeNull();
      expect(sorted[0]!.toStatus, key).toBe(initial[type]);
      for (let i = 1; i < sorted.length; i++) {
        const event = sorted[i]!;
        expect(event.fromStatus, `${key} chain`).toBe(sorted[i - 1]!.toStatus);
        expect(allowed[type][event.fromStatus!], `${key} ${event.fromStatus}`).toContain(
          event.toStatus,
        );
      }
    }
  });

  it("uses fixed Nov 2026 times only", () => {
    for (const event of events()) {
      expect(event.occurredAt >= "2026-11-01" && event.occurredAt < "2026-11-05", event.id).toBe(
        true,
      );
    }
  });

  it("ends every order on the state its last order event says", () => {
    for (const order of listAccountOrders(customer)) {
      expect(orderHistory(order.code).at(-1)?.status, order.code).toBe(order.status);
    }
  });

  it("R401: every handed_over parcel has a proof matching its proof level", () => {
    let handed = 0;
    for (const account of [customer, merchant]) {
      for (const order of listAccountOrders(account)) {
        for (const parcel of parcelsOf(order.code)) {
          if (parcel.status !== "handed_over") continue;
          handed += 1;
          expect(parcel.proof?.kind, parcel.id).toBe(parcel.proofLevel);
          expect(parcel.proof?.capturedAt, parcel.id).toMatch(/^2026-11-0\dT.*Z$/);
        }
      }
    }
    expect(handed).toBeGreaterThanOrEqual(5);
  });

  it("gives acc-customer an order in each listed state", () => {
    const orders = listAccountOrders(customer);
    const byStatus = (s: string) => orders.filter((o) => o.status === s);
    for (const status of [
      "received",
      "confirmed",
      "assigned",
      "pickup_failed",
      "picked_up",
      "in_transit",
      "delivered",
      "canceled",
      "returned",
      "partially_delivered",
    ]) {
      expect(byStatus(status).length, status).toBeGreaterThanOrEqual(1);
    }
    const assigned = byStatus("assigned").map((o) => activePickupMission(o.code));
    expect(assigned.some((m) => m?.arrivedAt === null)).toBe(true);
    expect(assigned.some((m) => m?.arrivedAt != null)).toBe(true);
    expect(byStatus("in_transit").map((o) => o.code)).toContain(FOUND_TRACKING_CODE);
  });

  it("T19: 2 handed_over and 1 returned give partially_delivered", () => {
    const order = listAccountOrders(customer).find((o) => o.status === "partially_delivered")!;
    expect(
      parcelsOf(order.code)
        .map((p) => p.status)
        .sort(),
    ).toEqual(["handed_over", "handed_over", "returned"]);
    expect(order.lossReported).toBe(false);
  });

  it("returned + lost: a returned order that reports a loss", () => {
    const order = listAccountOrders(customer).find((o) => o.status === "returned")!;
    expect(order.lossReported).toBe(true);
    const statuses = parcelsOf(order.code).map((p) => p.status);
    expect(statuses).toContain("returned");
    expect(statuses).toContain("lost");
  });

  it("gives the validated merchant two orders, one with COD on each of its 2 parcels", () => {
    const orders = listAccountOrders(merchant);
    expect(orders).toHaveLength(2);
    const cod = orders.filter((o) => parcelsOf(o.code).every((p) => p.codMillimes != null));
    expect(cod).toHaveLength(1);
    expect(parcelsOf(cod[0]!.code)).toHaveLength(2);
    for (const p of parcelsOf(cod[0]!.code)) {
      expect(p.proofLevel).toBe("codeOrAgentPhoneWithSignatureAndPhoto");
    }
  });

  it("ends pickup missions the way the order cascades say", () => {
    const reasons = Object.values(readTable<Mission>(MISSIONS)).map((m) => m.endReason);
    expect(reasons).toContain("pickupFailed");
    expect(reasons).toContain("orderCanceled");
  });

  it("has the new fake accounts, with Tunisian-format fake phones", () => {
    const byId = (id: string) => FIXTURE_ACCOUNTS.find((a) => a.id === id)!;
    expect(byId("acc-customer-empty")).toMatchObject({ name: "Lina M.", phone: "+21698000003" });
    expect(byId("acc-customer-other")).toMatchObject({ name: "Karim S.", phone: "+21698000004" });
    expect(byId("acc-customer-return-due")).toMatchObject({
      name: "Hana R.",
      phone: "+21698000005",
      returnBalanceMillimes: 7000,
    });
  });

  it("lists every fixture code once, and writes only those orders", () => {
    expect(new Set(FIXTURE_ORDER_CODES).size).toBe(FIXTURE_ORDER_CODES.length);
    expect(FIXTURE_ORDER_CODES).toContain(FOUND_TRACKING_CODE);
    expect(Object.values(readTable<Parcel>(PARCELS)).length).toBeGreaterThan(15);
  });
});
