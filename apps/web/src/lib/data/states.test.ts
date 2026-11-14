import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { RECIPIENT_LINK_AFTER_DELIVERY_MS } from "@fastgo/domain";
import { readTable, writeRow } from "./mock-db";
import {
  ACCOUNT_ORDERS,
  MISSIONS,
  PARCELS,
  RECIPIENT_LINKS,
  STATUS_EVENTS,
  type AccountOrder,
  type Mission,
  type Parcel,
  type StatusEvent,
} from "./order-model";
import {
  activePickupMission,
  createMission,
  DERIVED_ORDER_STATES,
  deriveOrderOutcome,
  FINAL_ORDER_STATES,
  FINAL_PARCEL_STATES,
  MISSION_NEXT,
  ORDER_NEXT,
  PARCEL_NEXT,
  transition,
  type MissionStatus,
  type OrderStatus,
  type ParcelStatus,
} from "./states";
import { useMemoryStorage } from "../storage";

const T0 = Date.parse("2026-11-05T08:00:00Z");
const CODE = "FG-TEST-0001";
const ORDER_STATES = Object.keys(ORDER_NEXT) as OrderStatus[];
const PARCEL_STATES = Object.keys(PARCEL_NEXT) as ParcelStatus[];
const MISSION_STATES = Object.keys(MISSION_NEXT) as MissionStatus[];

// ---- helpers (fake data only) ----

function makeOrder(n: number): { order: AccountOrder; parcels: Parcel[] } {
  const order: AccountOrder = {
    code: CODE,
    ownerAccountId: "acc-test-1",
    createdByUserId: "usr-test-1",
    createdAt: new Date(T0).toISOString(),
    service: "standard",
    sender: { name: "Amel B.", phone: "+216 20 000 001", address: "Rue Test 1", city: null },
    recipient: { name: "Sami T.", phone: "+216 20 000 002", address: "Rue Test 2", city: null },
    pickupPointId: null,
    recipientLocale: "fr",
    status: "received",
    lossReported: false,
    totalMillimes: 7000,
    priceLines: [{ kind: "base", millimes: 7000 }],
    paymentMode: "cashPickup",
    freightPayer: "sender",
    freightPayerAccepted: false,
    strongerProofRequested: false,
    cancel: null,
    etaUtc: null,
  };
  writeRow(ACCOUNT_ORDERS, order.code, order);
  const parcels: Parcel[] = [];
  for (let i = 0; i < n; i++) {
    const parcel: Parcel = {
      id: `${CODE}-p${i + 1}`,
      orderCode: CODE,
      index: i + 1,
      barcode: `${CODE}-${i + 1}`,
      size: "small",
      weightDeclaredG: 1000,
      weightMeasuredG: null,
      declaredValueMillimes: null,
      codMillimes: null,
      fragile: false,
      proofLevel: "codeOrPhotoWithPosition",
      attempts: 0,
      status: "to_collect",
      failure: null,
      proof: null,
    };
    writeRow(PARCELS, parcel.id, parcel);
    parcels.push(parcel);
  }
  return { order, parcels };
}

const order = () => readTable<AccountOrder>(ACCOUNT_ORDERS)[CODE]!;
const parcel = (i: number) => readTable<Parcel>(PARCELS)[`${CODE}-p${i}`]!;
const mission = (id: string) => readTable<Mission>(MISSIONS)[id]!;
const events = () => Object.values(readTable<StatusEvent>(STATUS_EVENTS));
const eventsOf = (type: StatusEvent["subjectType"], id: string) =>
  events().filter((e) => e.subjectType === type && e.subjectId === id);

const P = (i: number) => ({ type: "parcel" as const, id: `${CODE}-p${i}` });
const O = { type: "order" as const, id: CODE };
const M = (id: string) => ({ type: "mission" as const, id });

function ok(result: ReturnType<typeof transition>) {
  expect(result).toEqual({ ok: true });
}

function setOrderStatus(status: OrderStatus) {
  writeRow(ACCOUNT_ORDERS, CODE, { ...order(), status });
}
function setParcelStatus(i: number, status: ParcelStatus) {
  writeRow(PARCELS, `${CODE}-p${i}`, { ...parcel(i), status });
}

/** received → confirmed → (pickup mission) → assigned, through transition. */
function toAssigned(): Mission {
  ok(transition(O, "confirmed", "staff-1"));
  const m = createMission(CODE, "pickup");
  ok(transition(O, "assigned", "staff-1"));
  return m;
}

beforeEach(() => {
  useMemoryStorage();
  setClock(() => T0);
  makeOrder(3);
});

// ---- generated matrices ----

describe("order table", () => {
  for (const from of ORDER_STATES) {
    for (const to of ORDER_STATES) {
      const expected = DERIVED_ORDER_STATES.includes(to)
        ? "derivedState"
        : ORDER_NEXT[from].includes(to)
          ? "ok"
          : "illegalTransition";
      it(`${from} → ${to}: ${expected}`, () => {
        setOrderStatus(from);
        const result = transition(O, to, "staff-1");
        if (expected === "ok") {
          ok(result);
          expect(order().status).toBe(to);
        } else {
          expect(result).toMatchObject({ refused: expected });
          expect(order().status).toBe(from);
        }
      });
    }
  }
});

describe("parcel table", () => {
  for (const from of PARCEL_STATES) {
    for (const to of PARCEL_STATES) {
      const allowed = PARCEL_NEXT[from].includes(to);
      it(`${from} → ${to}: ${allowed ? "ok" : "illegalTransition"}`, () => {
        // The order must match the parcel it holds (a derived move outside ORDER_NEXT throws):
        // assigned before the scan, picked_up while the parcel is taken, in_transit afterwards.
        setOrderStatus(
          from === "to_collect" ? "assigned" : from === "taken" ? "picked_up" : "in_transit",
        );
        setParcelStatus(1, from);
        const result = transition(P(1), to, "driver-1");
        if (allowed) {
          ok(result);
          expect(parcel(1).status).toBe(to);
        } else {
          expect(result).toMatchObject({ refused: "illegalTransition", from, to });
          expect(parcel(1).status).toBe(from);
        }
      });
    }
  }
});

describe("mission table", () => {
  for (const from of MISSION_STATES) {
    for (const to of MISSION_STATES) {
      const allowed = MISSION_NEXT[from].includes(to);
      it(`${from} → ${to}: ${allowed ? "ok" : "illegalTransition"}`, () => {
        const m = createMission(CODE, "pickup");
        writeRow(MISSIONS, m.id, { ...m, status: from });
        // Called directly, `finished` is a normal finish: it needs `arrived` and a scanned parcel.
        // The early ends from proposed and accepted exist only through the order cascade (below).
        const direct = to === "finished" ? from === "arrived" : allowed;
        if (to === "finished" && from === "arrived") {
          setOrderStatus("picked_up");
          setParcelStatus(1, "taken");
        }
        const result = transition(M(m.id), to, "driver-1");
        if (direct) {
          ok(result);
          expect(mission(m.id).status).toBe(to);
        } else {
          expect(result).toMatchObject({ refused: "illegalTransition", from, to });
          expect(mission(m.id).status).toBe(from);
        }
      });
    }
  }

  // The early ends are the result of an order change, never a call of their own (ruling, 5 Nov 2026).
  describe("early end of the pickup mission, through the order cascade only", () => {
    type Reason = "driverRemoved" | "pickupFailed" | "orderCanceled";
    const CASES: { reason: Reason; orderTo: OrderStatus; orderToStatus: OrderStatus }[] = [
      { reason: "driverRemoved", orderTo: "confirmed", orderToStatus: "confirmed" },
      { reason: "pickupFailed", orderTo: "pickup_failed", orderToStatus: "pickup_failed" },
      { reason: "orderCanceled", orderTo: "canceled", orderToStatus: "canceled" },
    ];
    const FROM: MissionStatus[] = ["proposed", "accepted", "arrived"];

    for (const { reason, orderTo, orderToStatus } of CASES) {
      for (const from of FROM) {
        it(`${from} → finished with ${reason}, when the order goes assigned → ${orderTo}`, () => {
          const m = toAssigned();
          if (from !== "proposed") ok(transition(M(m.id), "accepted", "driver-1"));
          if (from === "arrived") ok(transition(M(m.id), "arrived", "driver-1"));
          expect(mission(m.id).status).toBe(from);
          ok(transition(O, orderTo, "staff-1", { at: T0 + 5 }));
          expect(order().status).toBe(orderToStatus);
          expect(mission(m.id)).toMatchObject({
            status: "finished",
            endReason: reason,
            finishedAt: new Date(T0 + 5).toISOString(),
          });
          expect(eventsOf("mission", m.id).at(-1)).toMatchObject({
            fromStatus: from,
            toStatus: "finished",
            actorId: "system",
            endReason: reason,
          });
          expect(activePickupMission(CODE)).toBeNull();
        });
      }
    }

    for (const reason of ["driverRemoved", "pickupFailed", "orderCanceled"] as const) {
      for (const from of FROM) {
        it(`a direct ${from} → finished with ${reason} is refused with endReasonInternal and changes nothing`, () => {
          const m = toAssigned();
          if (from !== "proposed") ok(transition(M(m.id), "accepted", "driver-1"));
          if (from === "arrived") ok(transition(M(m.id), "arrived", "driver-1"));
          const tables = () =>
            JSON.stringify([
              readTable(ACCOUNT_ORDERS),
              readTable(PARCELS),
              readTable(MISSIONS),
              readTable(STATUS_EVENTS),
            ]);
          const before = tables();
          expect(transition(M(m.id), "finished", "driver-1", { endReason: reason })).toEqual({
            refused: "endReasonInternal",
          });
          expect(tables()).toBe(before);
          expect(mission(m.id).status).toBe(from);
          expect(order().status).toBe("assigned");
          expect(activePickupMission(CODE)?.id).toBe(m.id);
        });
      }
    }

    it("a direct normal finish (endReason null) stays public", () => {
      const m = toAssigned();
      ok(transition(M(m.id), "accepted", "driver-1"));
      ok(transition(M(m.id), "arrived", "driver-1"));
      ok(transition(P(1), "taken", "driver-1"));
      ok(transition(M(m.id), "finished", "driver-1", { endReason: null }));
      expect(mission(m.id)).toMatchObject({ status: "finished", endReason: null });
    });
  });

  it("a normal finish (endReason null) is only allowed from arrived", () => {
    const m = createMission(CODE, "pickup");
    expect(transition(M(m.id), "finished", "driver-1")).toMatchObject({
      refused: "illegalTransition",
    });
    ok(transition(M(m.id), "accepted", "driver-1"));
    expect(transition(M(m.id), "finished", "driver-1")).toMatchObject({
      refused: "illegalTransition",
    });
  });

  it("sets arrivedAt on arrived and finishedAt on finished", () => {
    const m = toAssigned();
    ok(transition(M(m.id), "accepted", "driver-1"));
    ok(transition(M(m.id), "arrived", "driver-1", { at: T0 + 1000 }));
    expect(mission(m.id).arrivedAt).toBe(new Date(T0 + 1000).toISOString());
    ok(transition(P(1), "taken", "driver-1"));
    ok(transition(M(m.id), "finished", "driver-1", { at: T0 + 2000 }));
    expect(mission(m.id).finishedAt).toBe(new Date(T0 + 2000).toISOString());
    expect(mission(m.id).endReason).toBeNull();
  });

  it("unknown subjects are notFound", () => {
    expect(transition({ type: "order", id: "nope" }, "confirmed", "x")).toEqual({
      refused: "notFound",
    });
    expect(transition({ type: "parcel", id: "nope" }, "taken", "x")).toEqual({
      refused: "notFound",
    });
    expect(transition({ type: "mission", id: "nope" }, "accepted", "x")).toEqual({
      refused: "notFound",
    });
  });
});

// ---- scenarios ----

describe("derived order state", () => {
  it("first scan writes picked_up", () => {
    toAssigned();
    ok(transition(P(1), "taken", "driver-1"));
    expect(order().status).toBe("picked_up");
    const orderEvents = eventsOf("order", CODE).filter((e) => e.toStatus === "picked_up");
    expect(orderEvents).toHaveLength(1);
    expect(orderEvents[0]).toMatchObject({ fromStatus: "assigned", actorId: "system" });
  });

  it("change that keeps the outcome writes no order event", () => {
    toAssigned();
    ok(transition(P(1), "taken", "driver-1"));
    const before = eventsOf("order", CODE).length;
    ok(transition(P(2), "taken", "driver-1"));
    expect(eventsOf("order", CODE)).toHaveLength(before);
    expect(order().status).toBe("picked_up");
  });

  it("a change that alters the outcome writes exactly one order event", () => {
    toAssigned();
    ok(transition(P(1), "taken", "driver-1"));
    const before = eventsOf("order", CODE).length;
    ok(transition(P(1), "in_transit", "driver-1"));
    expect(eventsOf("order", CODE)).toHaveLength(before + 1);
    expect(order().status).toBe("in_transit");
  });

  // Ruling (Helmi, 5 Nov 2026): `picked_up → lost` is a listed move, never through `in_transit`,
  // because the customer would see a delivery that never happened. `taken → lost` is a parcel
  // transition, so an order whose only counted parcel is lost right after the scan derives `lost`
  // directly. A direct order transition to `lost` stays refused (`derivedState`, see the order table).
  // To confirm in the cahier v2 (umbrella section 18, item 15).
  it("ORDER_NEXT lists lost as a next state of picked_up, reached only by derivation", () => {
    expect(ORDER_NEXT.picked_up).toEqual(["in_transit", "lost"]);
    setOrderStatus("picked_up");
    expect(transition(O, "lost", "staff-1")).toMatchObject({
      refused: "derivedState",
      from: "picked_up",
      to: "lost",
    });
    expect(order().status).toBe("picked_up");
  });

  it("an only counted parcel lost right after the scan gives picked_up → lost", () => {
    const m = toAssigned();
    ok(transition(M(m.id), "accepted", "driver-1"));
    ok(transition(M(m.id), "arrived", "driver-1"));
    ok(transition(P(1), "taken", "driver-1"));
    ok(transition(M(m.id), "finished", "driver-1"));
    ok(transition(P(1), "lost", "staff-1"));
    expect(order()).toMatchObject({ status: "lost", lossReported: true });
    const last = eventsOf("order", CODE).at(-1);
    expect(last).toMatchObject({ fromStatus: "picked_up", toStatus: "lost", actorId: "system" });
  });
});

describe("pickup mission finish", () => {
  it("normal finish cancels to_collect", () => {
    const m = toAssigned();
    ok(transition(M(m.id), "accepted", "driver-1"));
    ok(transition(M(m.id), "arrived", "driver-1"));
    ok(transition(P(1), "taken", "driver-1"));
    ok(transition(M(m.id), "finished", "driver-1"));
    expect(parcel(1).status).toBe("taken");
    expect(parcel(2).status).toBe("canceled");
    expect(parcel(3).status).toBe("canceled");
    expect(eventsOf("parcel", `${CODE}-p2`).at(-1)).toMatchObject({
      fromStatus: "to_collect",
      toStatus: "canceled",
      actorId: "system",
    });
    expect(order().status).toBe("picked_up");
  });

  it("noParcelTaken", () => {
    const m = toAssigned();
    ok(transition(M(m.id), "accepted", "driver-1"));
    ok(transition(M(m.id), "arrived", "driver-1"));
    expect(transition(M(m.id), "finished", "driver-1")).toMatchObject({
      refused: "noParcelTaken",
    });
    expect(mission(m.id).status).toBe("arrived");
    for (const i of [1, 2, 3]) expect(parcel(i).status).toBe("to_collect");
    expect(order().status).toBe("assigned");
  });

  // Ruling (5 Nov 2026): a normal finish passes once at least one parcel was scanned, i.e. its status
  // is neither to_collect nor canceled. Checking `taken` alone left pickups stuck as soon as the
  // scanned parcel had moved on.
  describe("a normal finish needs a scanned parcel, not a taken one", () => {
    function arrivedMission(): Mission {
      const m = toAssigned();
      ok(transition(M(m.id), "accepted", "driver-1"));
      ok(transition(M(m.id), "arrived", "driver-1"));
      return m;
    }
    const orderEventCount = () => eventsOf("order", CODE).length;

    it("P1 taken then in_transit: passes, cancels P2 and P3, order stays in_transit", () => {
      const m = arrivedMission();
      ok(transition(P(1), "taken", "driver-1"));
      ok(transition(P(1), "in_transit", "driver-1"));
      const before = orderEventCount();
      ok(transition(M(m.id), "finished", "driver-1"));
      expect(mission(m.id).status).toBe("finished");
      expect(parcel(1).status).toBe("in_transit");
      expect(parcel(2).status).toBe("canceled");
      expect(parcel(3).status).toBe("canceled");
      expect(order().status).toBe("in_transit");
      expect(orderEventCount()).toBe(before);
    });

    it("P1 taken then lost: the order stays picked_up, then one picked_up -> lost event at the finish", () => {
      const m = arrivedMission();
      ok(transition(P(1), "taken", "driver-1"));
      ok(transition(P(1), "lost", "staff-1"));
      expect(order()).toMatchObject({ status: "picked_up", lossReported: true });
      const before = orderEventCount();
      ok(transition(M(m.id), "finished", "driver-1"));
      expect(parcel(2).status).toBe("canceled");
      expect(parcel(3).status).toBe("canceled");
      expect(order()).toMatchObject({ status: "lost", lossReported: true });
      expect(orderEventCount()).toBe(before + 1);
      expect(eventsOf("order", CODE).at(-1)).toMatchObject({
        fromStatus: "picked_up",
        toStatus: "lost",
        actorId: "system",
      });
    });

    it("P1 and P2 taken, P1 lost: the order stays picked_up", () => {
      arrivedMission();
      ok(transition(P(1), "taken", "driver-1"));
      ok(transition(P(2), "taken", "driver-1"));
      ok(transition(P(1), "lost", "staff-1"));
      expect(order().status).toBe("picked_up");
    });

    it("P1 lost while P2 is in_transit: the order is in_transit", () => {
      arrivedMission();
      ok(transition(P(1), "taken", "driver-1"));
      ok(transition(P(2), "taken", "driver-1"));
      ok(transition(P(2), "at_depot", "driver-1"));
      ok(transition(P(2), "in_transit", "driver-1"));
      ok(transition(P(1), "lost", "staff-1"));
      expect(order().status).toBe("in_transit");
    });

    it("P1 in_transit after the finish, then P1 lost: the order stays in_transit, no backward event", () => {
      const m = arrivedMission();
      for (const i of [1, 2, 3]) ok(transition(P(i), "taken", "driver-1"));
      ok(transition(M(m.id), "finished", "driver-1"));
      ok(transition(P(1), "in_transit", "driver-1"));
      expect(order().status).toBe("in_transit");
      ok(transition(P(1), "lost", "staff-1"));
      expect(order()).toMatchObject({ status: "in_transit", lossReported: true });
      const pairs = eventsOf("order", CODE).map((e) => `${e.fromStatus} -> ${e.toStatus}`);
      expect(pairs).not.toContain("in_transit -> picked_up");
    });

    it("P1 handed over: passes, cancels P2 and P3, the order reaches delivered with one event", () => {
      const m = arrivedMission();
      ok(transition(P(1), "taken", "driver-1"));
      ok(transition(P(1), "at_depot", "driver-1"));
      ok(transition(P(1), "in_transit", "driver-1"));
      ok(transition(P(1), "handed_over", "driver-1"));
      expect(order().status).toBe("in_transit");
      const before = orderEventCount();
      ok(transition(M(m.id), "finished", "driver-1"));
      expect(parcel(2).status).toBe("canceled");
      expect(parcel(3).status).toBe("canceled");
      expect(order().status).toBe("delivered");
      expect(orderEventCount()).toBe(before + 1);
      expect(eventsOf("order", CODE).at(-1)).toMatchObject({
        fromStatus: "in_transit",
        toStatus: "delivered",
        actorId: "system",
      });
    });

    it("P1, P2 and P3 taken then at_depot: passes, nothing to cancel, order stays in_transit", () => {
      const m = arrivedMission();
      for (const i of [1, 2, 3]) ok(transition(P(i), "taken", "driver-1"));
      for (const i of [1, 2, 3]) ok(transition(P(i), "at_depot", "driver-1"));
      const before = orderEventCount();
      ok(transition(M(m.id), "finished", "driver-1"));
      expect(mission(m.id).status).toBe("finished");
      for (const i of [1, 2, 3]) expect(parcel(i).status).toBe("at_depot");
      expect(order().status).toBe("in_transit");
      expect(orderEventCount()).toBe(before);
    });

    it("still refused when no parcel was scanned: parcels, order and mission unchanged", () => {
      const m = arrivedMission();
      const eventsBefore = events().length;
      expect(transition(M(m.id), "finished", "driver-1")).toMatchObject({
        refused: "noParcelTaken",
      });
      expect(mission(m.id).status).toBe("arrived");
      for (const i of [1, 2, 3]) expect(parcel(i).status).toBe("to_collect");
      expect(order().status).toBe("assigned");
      expect(events()).toHaveLength(eventsBefore);
    });

    it("still refused when the only non-to_collect parcels are canceled", () => {
      const m = arrivedMission();
      setParcelStatus(1, "canceled");
      expect(transition(M(m.id), "finished", "driver-1")).toMatchObject({
        refused: "noParcelTaken",
      });
      expect(mission(m.id).status).toBe("arrived");
    });
  });

  it("retry after driver removed", () => {
    const first = toAssigned();
    ok(transition(M(first.id), "accepted", "driver-1"));
    ok(transition(O, "confirmed", "staff-1"));
    expect(mission(first.id)).toMatchObject({ status: "finished", endReason: "driverRemoved" });
    expect(mission(first.id).finishedAt).not.toBeNull();
    for (const i of [1, 2, 3]) expect(parcel(i).status).toBe("to_collect");
    expect(activePickupMission(CODE)).toBeNull();
    const second = createMission(CODE, "pickup");
    expect(activePickupMission(CODE)?.id).toBe(second.id);
    ok(transition(O, "assigned", "staff-1"));
    for (const i of [1, 2, 3]) ok(transition(P(i), "taken", "driver-2"));
    expect(order().status).toBe("picked_up");
  });

  it("retry after failed pickup", () => {
    const first = toAssigned();
    ok(transition(M(first.id), "accepted", "driver-1"));
    ok(transition(M(first.id), "arrived", "driver-1"));
    ok(transition(O, "pickup_failed", "driver-1"));
    expect(mission(first.id)).toMatchObject({ status: "finished", endReason: "pickupFailed" });
    for (const i of [1, 2, 3]) expect(parcel(i).status).toBe("to_collect");
    ok(transition(O, "confirmed", "staff-1")); // new slot
    const second = createMission(CODE, "pickup");
    ok(transition(O, "assigned", "staff-1"));
    expect(activePickupMission(CODE)?.id).toBe(second.id);
    for (const i of [1, 2, 3]) ok(transition(P(i), "taken", "driver-2"));
    expect(order().status).toBe("picked_up");
  });
});

describe("scan checks the order first", () => {
  it("is refused in received, confirmed and pickup_failed", () => {
    expect(transition(P(1), "taken", "driver-1")).toEqual({ refused: "orderNotAssigned" });
    ok(transition(O, "confirmed", "staff-1"));
    expect(transition(P(1), "taken", "driver-1")).toEqual({ refused: "orderNotAssigned" });
    createMission(CODE, "pickup");
    ok(transition(O, "assigned", "staff-1"));
    ok(transition(O, "pickup_failed", "driver-1"));
    expect(transition(P(1), "taken", "driver-1")).toEqual({ refused: "orderNotAssigned" });
    expect(parcel(1).status).toBe("to_collect");
  });

  it("after a cancel returns orderNotAssigned, never illegalTransition", () => {
    const m = toAssigned();
    ok(transition(O, "canceled", "client-1"));
    expect(parcel(1).status).toBe("canceled");
    expect(transition(P(1), "taken", "driver-1")).toEqual({ refused: "orderNotAssigned" });
    expect(mission(m.id)).toMatchObject({ status: "finished", endReason: "orderCanceled" });
  });
});

describe("cancel cascade", () => {
  it("cancels every to_collect parcel with actor system, in the same call", () => {
    ok(transition(O, "canceled", "client-1"));
    expect(order().status).toBe("canceled");
    for (const i of [1, 2, 3]) {
      expect(parcel(i).status).toBe("canceled");
      expect(eventsOf("parcel", `${CODE}-p${i}`)).toEqual([
        expect.objectContaining({
          fromStatus: "to_collect",
          toStatus: "canceled",
          actorId: "system",
        }),
      ]);
    }
    // the order is final: no derived event after the cancel
    expect(eventsOf("order", CODE).map((e) => e.toStatus)).toEqual(["canceled"]);
  });

  it("expires the recipient link when the order becomes final", () => {
    writeRow(RECIPIENT_LINKS, "tok-1", { orderCode: CODE, locale: "fr", expiresAt: null });
    writeRow(RECIPIENT_LINKS, "tok-2", {
      orderCode: "FG-OTHR-0002",
      locale: "fr",
      expiresAt: null,
    });
    ok(transition(O, "canceled", "client-1", { at: T0 + 5000 }));
    const links = readTable<{ expiresAt: string | null }>(RECIPIENT_LINKS);
    expect(links["tok-1"]!.expiresAt).toBe(
      new Date(T0 + 5000 + RECIPIENT_LINK_AFTER_DELIVERY_MS).toISOString(),
    );
    expect(links["tok-2"]!.expiresAt).toBeNull();
  });

  it("expires the recipient link when a derived outcome is final", () => {
    writeRow(RECIPIENT_LINKS, "tok-1", { orderCode: CODE, locale: "fr", expiresAt: null });
    toAssigned();
    for (const i of [1, 2, 3]) ok(transition(P(i), "taken", "driver-1"));
    for (const i of [1, 2, 3]) ok(transition(P(i), "in_transit", "driver-1"));
    ok(transition(P(1), "handed_over", "driver-1"));
    ok(transition(P(2), "handed_over", "driver-1"));
    expect(readTable<{ expiresAt: string | null }>(RECIPIENT_LINKS)["tok-1"]!.expiresAt).toBeNull();
    ok(transition(P(3), "handed_over", "driver-1", { at: T0 + 9000 }));
    expect(order().status).toBe("delivered");
    expect(readTable<{ expiresAt: string | null }>(RECIPIENT_LINKS)["tok-1"]!.expiresAt).toBe(
      new Date(T0 + 9000 + RECIPIENT_LINK_AFTER_DELIVERY_MS).toISOString(),
    );
  });
});

describe("deriveOrderOutcome", () => {
  it("picked_up while every counted parcel is taken", () => {
    expect(deriveOrderOutcome(["taken", "taken"])).toBe("picked_up");
  });

  for (const s of [
    "in_transit",
    "at_depot",
    "delivery_failed",
    "returning",
    "handed_over",
  ] as const) {
    it(`in_transit with ${s} and the other taken`, () => {
      expect(deriveOrderOutcome([s, "taken"])).toBe("in_transit");
    });
  }

  it("the four outcomes", () => {
    expect(deriveOrderOutcome(["handed_over", "handed_over", "handed_over"])).toBe("delivered");
    expect(deriveOrderOutcome(["handed_over", "handed_over", "returned"])).toBe(
      "partially_delivered",
    ); // T19
    expect(deriveOrderOutcome(["handed_over", "lost"])).toBe("partially_delivered");
    expect(deriveOrderOutcome(["returned", "lost"])).toBe("returned");
    expect(deriveOrderOutcome(["lost", "lost"])).toBe("lost");
  });

  it("ignores canceled parcels", () => {
    expect(deriveOrderOutcome(["handed_over", "canceled"])).toBe("delivered");
  });
});

describe("lossReported", () => {
  function deliverWith(outcomes: ParcelStatus[]) {
    toAssigned();
    outcomes.forEach((_, k) => ok(transition(P(k + 1), "taken", "driver-1")));
    outcomes.forEach((target, k) => {
      const i = k + 1;
      if (target === "lost") return ok(transition(P(i), "lost", "driver-1"));
      ok(transition(P(i), "in_transit", "driver-1"));
      if (target === "handed_over") return ok(transition(P(i), "handed_over", "driver-1"));
      ok(transition(P(i), "delivery_failed", "driver-1"));
      ok(transition(P(i), "returning", "driver-1"));
      ok(transition(P(i), "returned", "driver-1"));
    });
  }

  it("is true for returned + lost", () => {
    writeRow(PARCELS, `${CODE}-p3`, { ...parcel(3), status: "canceled" });
    deliverWith(["returned", "lost"]);
    expect(order()).toMatchObject({ status: "returned", lossReported: true });
  });

  it("is true for handed_over + lost", () => {
    writeRow(PARCELS, `${CODE}-p3`, { ...parcel(3), status: "canceled" });
    deliverWith(["handed_over", "lost"]);
    expect(order()).toMatchObject({ status: "partially_delivered", lossReported: true });
  });

  it("H4: a final order stays final when a lost parcel turns up", () => {
    writeRow(PARCELS, `${CODE}-p3`, { ...parcel(3), status: "canceled" });
    deliverWith(["lost", "lost"]);
    expect(order()).toMatchObject({ status: "lost", lossReported: true });
    const before = eventsOf("order", CODE).length;
    ok(transition(P(1), "at_depot", "staff-1"));
    ok(transition(P(2), "at_depot", "staff-1"));
    expect(parcel(1).status).toBe("at_depot");
    expect(order()).toMatchObject({ status: "lost", lossReported: false });
    expect(eventsOf("order", CODE)).toHaveLength(before);
  });
});

describe("event log", () => {
  it("each change writes one event with from, to, actor and time", () => {
    ok(transition(O, "confirmed", "staff-1", { at: T0 + 1 }));
    expect(eventsOf("order", CODE)).toEqual([
      expect.objectContaining({
        fromStatus: "received",
        toStatus: "confirmed",
        actorId: "staff-1",
        occurredAt: new Date(T0 + 1).toISOString(),
      }),
    ]);
    const m = createMission(CODE, "pickup", T0 + 2);
    expect(eventsOf("mission", m.id)).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: "proposed", actorId: "system" }),
    ]);
    expect(m).toMatchObject({ status: "proposed", offeredAt: new Date(T0 + 2).toISOString() });
    ok(transition(M(m.id), "accepted", "driver-1"));
    expect(eventsOf("mission", m.id)).toHaveLength(2);
    expect(eventsOf("mission", m.id)[1]).toMatchObject({
      fromStatus: "proposed",
      toStatus: "accepted",
      actorId: "driver-1",
      occurredAt: new Date(T0).toISOString(),
    });
  });

  it("a refused change writes no event", () => {
    const before = events().length;
    expect(transition(O, "delivered", "staff-1")).toMatchObject({ refused: "derivedState" });
    expect(transition(O, "assigned", "staff-1")).toMatchObject({ refused: "illegalTransition" });
    expect(events()).toHaveLength(before);
  });

  it("an early end records its endReason on the event", () => {
    const m = toAssigned();
    ok(transition(O, "confirmed", "staff-1"));
    expect(eventsOf("mission", m.id).at(-1)).toMatchObject({
      fromStatus: "proposed",
      toStatus: "finished",
      endReason: "driverRemoved",
    });
  });

  it("final parcel states are handed_over returned lost canceled", () => {
    expect([...FINAL_PARCEL_STATES].sort()).toEqual(
      ["canceled", "handed_over", "lost", "returned"].sort(),
    );
  });
});

describe("recomputeOrder refuses a derived move the order table does not list", () => {
  it("an assigned order whose parcel is at_depot throws instead of writing assigned -> in_transit", () => {
    setOrderStatus("assigned");
    setParcelStatus(1, "at_depot");
    expect(() => transition(P(1), "in_transit", "driver-1")).toThrow(/not in ORDER_NEXT/);
  });
});

// ---- walk test (RV-03): every order event is a pair of the order table ----

// Not a React hook: an alias keeps the hooks lint rule away from the loop below.
const freshStorage = useMemoryStorage;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("walk: random legal parcel moves keep every order event in ORDER_NEXT", () => {
  const SEEDS = Array.from({ length: 150 }, (_, i) => 1000 + i);
  for (const n of [2, 3]) {
    it(`${n} parcels, ${SEEDS.length} seeded sequences (seeds ${SEEDS[0]}..${SEEDS.at(-1)})`, () => {
      for (const seed of SEEDS) {
        freshStorage();
        setClock(() => T0);
        makeOrder(n);
        const rnd = mulberry32(seed);
        const log: string[] = [];
        const fail = (msg: string) => {
          throw new Error(`seed ${seed}, ${n} parcels: ${msg}
steps: ${log.join(" | ")}`);
        };
        const m = toAssigned();
        ok(transition(M(m.id), "accepted", "driver-1"));
        ok(transition(M(m.id), "arrived", "driver-1"));
        let finished = false;
        for (let step = 0; step < 40; step++) {
          const moves: { label: string; run: () => unknown }[] = [];
          for (let i = 1; i <= n; i++) {
            for (const to of PARCEL_NEXT[parcel(i).status])
              moves.push({
                label: `p${i}:${parcel(i).status}->${to}`,
                run: () => transition(P(i), to, "driver-1"),
              });
          }
          if (!finished)
            moves.push({ label: "finish", run: () => transition(M(m.id), "finished", "driver-1") });
          if (moves.length === 0) break;
          const pick = moves[Math.floor(rnd() * moves.length)]!;
          log.push(pick.label);
          let result: unknown;
          try {
            result = pick.run();
          } catch (e) {
            fail(`threw ${(e as Error).message}`);
          }
          if (pick.label === "finish" && (result as { ok?: true }).ok) finished = true;
          let last: string | null = null;
          for (const e of eventsOf("order", CODE)) {
            if (
              !e.fromStatus ||
              !ORDER_NEXT[e.fromStatus as OrderStatus].includes(e.toStatus as OrderStatus)
            )
              fail(`order event ${e.fromStatus} -> ${e.toStatus} is not in ORDER_NEXT`);
            if (last !== null && FINAL_ORDER_STATES.includes(last as OrderStatus))
              fail(`order left the final state ${last}`);
            last = e.toStatus;
          }
        }
      }
    });
  }
});
