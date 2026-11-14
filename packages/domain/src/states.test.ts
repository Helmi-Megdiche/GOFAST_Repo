import { describe, expect, it } from "vitest";
import {
  cascadesOf,
  checkMissionMove,
  checkOrderMove,
  checkParcelMove,
  DERIVED_ORDER_STATES,
  deriveOrderOutcome,
  FINAL_ORDER_STATES,
  FINAL_PARCEL_STATES,
  MISSION_NEXT,
  nextOrderOutcome,
  ORDER_NEXT,
  PARCEL_NEXT,
  SCAN_ALLOWED,
  type EndReason,
  type MissionStatus,
  type OrderStatus,
  type ParcelStatus,
} from "./states";

const ORDERS = Object.keys(ORDER_NEXT) as OrderStatus[];
const PARCELS = Object.keys(PARCEL_NEXT) as ParcelStatus[];
const MISSIONS = Object.keys(MISSION_NEXT) as MissionStatus[];
const OK = { ok: true };

describe("checkOrderMove (ADR-1, regles.md: États d'une commande)", () => {
  for (const from of ORDERS) {
    for (const to of ORDERS) {
      const expected = DERIVED_ORDER_STATES.includes(to)
        ? { refused: "derivedState", from, to }
        : ORDER_NEXT[from].includes(to)
          ? OK
          : { refused: "illegalTransition", from, to };
      it(`${from} → ${to}`, () => {
        expect(checkOrderMove(from, to)).toEqual(expected);
      });
    }
  }

  it("the legal direct moves are exactly the table minus the derived states", () => {
    const legal = ORDERS.flatMap((from) =>
      ORDERS.filter((to) => "ok" in checkOrderMove(from, to)).map((to) => `${from}>${to}`),
    );
    expect(legal.sort()).toEqual(
      [
        "received>confirmed",
        "received>canceled",
        "confirmed>assigned",
        "confirmed>canceled",
        "assigned>pickup_failed",
        "assigned>canceled",
        "assigned>confirmed",
        "pickup_failed>confirmed",
        "pickup_failed>canceled",
      ].sort(),
    );
  });
});

describe("checkParcelMove (ADR-1, regles.md: États d'un colis)", () => {
  for (const from of PARCELS) {
    for (const to of PARCELS) {
      // A scan is checked against an order that accepts it, so only the parcel table is tested here.
      const expected = PARCEL_NEXT[from].includes(to)
        ? OK
        : { refused: "illegalTransition", from, to };
      it(`${from} → ${to}`, () => {
        expect(checkParcelMove(from, to, "assigned")).toEqual(expected);
      });
    }
  }

  it("a scan reads the order first: orderNotAssigned, never illegalTransition", () => {
    for (const order of ORDERS) {
      const expected = SCAN_ALLOWED.includes(order) ? OK : { refused: "orderNotAssigned" };
      expect(checkParcelMove("to_collect", "taken", order)).toEqual(expected);
      // Even from a state that cannot be scanned, the order is looked at first.
      if (!SCAN_ALLOWED.includes(order))
        expect(checkParcelMove("canceled", "taken", order)).toEqual({
          refused: "orderNotAssigned",
        });
    }
    expect(checkParcelMove("to_collect", "taken", null)).toEqual({ refused: "orderNotAssigned" });
    expect(checkParcelMove("canceled", "taken", "assigned")).toEqual({
      refused: "illegalTransition",
      from: "canceled",
      to: "taken",
    });
  });

  it("only a scan depends on the order: other moves ignore it", () => {
    expect(checkParcelMove("taken", "at_depot", "canceled")).toEqual(OK);
    expect(checkParcelMove("lost", "at_depot", null)).toEqual(OK);
  });
});

describe("checkMissionMove (H1, endReasonInternal)", () => {
  const mission = (status: MissionStatus, kind: "pickup" | "delivery" = "pickup") => ({
    kind,
    status,
  });
  const SCANNED: ParcelStatus[] = ["taken", "to_collect"];

  for (const from of MISSIONS) {
    for (const to of MISSIONS) {
      if (to === "finished") continue; // a finish has its own rules, below
      const expected = MISSION_NEXT[from].includes(to)
        ? OK
        : { refused: "illegalTransition", from, to };
      it(`${from} → ${to}`, () => {
        expect(checkMissionMove(mission(from), to, null, SCANNED, "public")).toEqual(expected);
      });
    }
  }

  it("a public call that sets an endReason is refused first, before any other check", () => {
    for (const reason of ["driverRemoved", "pickupFailed", "orderCanceled"] as const) {
      for (const from of MISSIONS) {
        expect(checkMissionMove(mission(from), "finished", reason, SCANNED, "public")).toEqual({
          refused: "endReasonInternal",
        });
      }
      // Even a move that would be illegal anyway.
      expect(checkMissionMove(mission("refused"), "accepted", reason, [], "public")).toEqual({
        refused: "endReasonInternal",
      });
    }
  });

  it("a public normal finish (endReason null) stays allowed", () => {
    expect(checkMissionMove(mission("arrived"), "finished", null, SCANNED, "public")).toEqual(OK);
  });

  it("only a cascade ends a mission early, from proposed, accepted or arrived", () => {
    for (const from of ["proposed", "accepted", "arrived"] as const) {
      for (const reason of ["driverRemoved", "pickupFailed", "orderCanceled"] as const) {
        expect(checkMissionMove(mission(from), "finished", reason, [], "cascade")).toEqual(OK);
      }
    }
    expect(
      checkMissionMove(mission("finished"), "finished", "orderCanceled", [], "cascade"),
    ).toEqual({
      refused: "illegalTransition",
      from: "finished",
      to: "finished",
    });
    expect(
      checkMissionMove(mission("refused"), "finished", "orderCanceled", [], "cascade"),
    ).toEqual({
      refused: "illegalTransition",
      from: "refused",
      to: "finished",
    });
  });

  it("a normal finish is only allowed from arrived", () => {
    for (const from of ["proposed", "accepted"] as const) {
      expect(checkMissionMove(mission(from), "finished", null, SCANNED, "public")).toEqual({
        refused: "illegalTransition",
        from,
        to: "finished",
      });
    }
  });

  it("a pickup finish needs a parcel that left to_collect and was not canceled (noParcelTaken)", () => {
    const finish = (parcels: ParcelStatus[], kind: "pickup" | "delivery" = "pickup") =>
      checkMissionMove(mission("arrived", kind), "finished", null, parcels, "public");
    const refused = { refused: "noParcelTaken", from: "arrived", to: "finished" };
    expect(finish(["to_collect", "to_collect"])).toEqual(refused);
    expect(finish(["canceled", "to_collect"])).toEqual(refused);
    expect(finish([])).toEqual(refused);
    // Any other state counts as scanned, even once the parcel has moved on.
    for (const s of PARCELS.filter((p) => p !== "to_collect" && p !== "canceled")) {
      expect(finish(["to_collect", s]), s).toEqual(OK);
    }
    // A delivery mission has no scan rule.
    expect(finish(["to_collect"], "delivery")).toEqual(OK);
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

  it("ignores canceled parcels (H3) and throws when none counts", () => {
    expect(deriveOrderOutcome(["handed_over", "canceled"])).toBe("delivered");
    expect(() => deriveOrderOutcome(["canceled"])).toThrow();
    expect(() => deriveOrderOutcome([])).toThrow();
  });

  it("never moves backward: an in_transit order stays in_transit while a parcel is not final", () => {
    expect(deriveOrderOutcome(["taken", "lost"], "in_transit")).toBe("in_transit");
    expect(deriveOrderOutcome(["taken", "lost"], "picked_up")).toBe("picked_up");
  });

  it("final parcel states are handed_over returned lost canceled", () => {
    expect([...FINAL_PARCEL_STATES].sort()).toEqual(
      ["canceled", "handed_over", "lost", "returned"].sort(),
    );
  });
});

describe("nextOrderOutcome (ADR-1, H4, lossReported)", () => {
  it("before pickup the order keeps its own state, whatever the parcels", () => {
    for (const status of ["received", "confirmed", "pickup_failed"] as const) {
      expect(nextOrderOutcome(status, ["to_collect", "to_collect"])).toEqual({
        status,
        lossReported: false,
      });
    }
    expect(nextOrderOutcome("assigned", ["to_collect", "canceled"]).status).toBe("assigned");
  });

  it("the first scan on an assigned order gives picked_up", () => {
    expect(nextOrderOutcome("assigned", ["taken", "to_collect"])).toEqual({
      status: "picked_up",
      lossReported: false,
    });
  });

  it("a change that keeps the outcome keeps the state", () => {
    expect(nextOrderOutcome("picked_up", ["taken", "taken"]).status).toBe("picked_up");
    expect(nextOrderOutcome("in_transit", ["in_transit", "taken"]).status).toBe("in_transit");
  });

  it("an only counted parcel lost right after the scan gives picked_up → lost (ruling of 5 Nov)", () => {
    expect(nextOrderOutcome("picked_up", ["lost", "canceled"])).toEqual({
      status: "lost",
      lossReported: true,
    });
  });

  it("the outcomes, and lossReported is true while any counted parcel is lost", () => {
    expect(nextOrderOutcome("in_transit", ["handed_over", "handed_over"])).toEqual({
      status: "delivered",
      lossReported: false,
    });
    expect(nextOrderOutcome("in_transit", ["returned", "lost"])).toEqual({
      status: "returned",
      lossReported: true,
    });
    expect(nextOrderOutcome("in_transit", ["handed_over", "lost"])).toEqual({
      status: "partially_delivered",
      lossReported: true,
    });
  });

  it("H4: a final order stays final when a lost parcel turns up", () => {
    for (const status of FINAL_ORDER_STATES) {
      expect(nextOrderOutcome(status, ["at_depot", "handed_over"]).status).toBe(status);
    }
    expect(nextOrderOutcome("lost", ["at_depot"])).toEqual({ status: "lost", lossReported: false });
  });

  it("throws on a derived move the order table does not list, instead of returning it", () => {
    // assigned → in_transit is not in ORDER_NEXT (a bad fixture or a bug in the derivation).
    expect(() => nextOrderOutcome("assigned", ["at_depot", "to_collect"])).toThrow(
      /not in ORDER_NEXT/,
    );
  });
});

describe("cascadesOf (ADR-1, H1)", () => {
  const order = (from: OrderStatus, to: OrderStatus) => cascadesOf({ type: "order", from, to });
  const none = {
    endPickupMission: null,
    cancelToCollectParcels: false,
    expireRecipientLink: false,
  };

  it("assigned → confirmed ends the pickup mission: driverRemoved", () => {
    expect(order("assigned", "confirmed")).toEqual({ ...none, endPickupMission: "driverRemoved" });
  });

  it("assigned → pickup_failed ends the pickup mission: pickupFailed", () => {
    expect(order("assigned", "pickup_failed")).toEqual({
      ...none,
      endPickupMission: "pickupFailed",
    });
  });

  it("every cancel ends the mission, cancels the to_collect parcels and expires the link", () => {
    for (const from of ["received", "confirmed", "assigned", "pickup_failed"] as const) {
      expect(order(from, "canceled")).toEqual({
        endPickupMission: "orderCanceled",
        cancelToCollectParcels: true,
        expireRecipientLink: true,
      });
    }
  });

  it("the link expires on every final order state, derived ones included", () => {
    for (const to of FINAL_ORDER_STATES) {
      expect(order("in_transit", to).expireRecipientLink, to).toBe(true);
    }
    expect(order("in_transit", "delivered")).toEqual({ ...none, expireRecipientLink: true });
    expect(order("picked_up", "lost")).toEqual({ ...none, expireRecipientLink: true });
  });

  it("a move to a state that is not final expires nothing and ends nothing", () => {
    expect(order("received", "confirmed")).toEqual(none);
    expect(order("confirmed", "assigned")).toEqual(none);
    expect(order("assigned", "picked_up")).toEqual(none);
    expect(order("picked_up", "in_transit")).toEqual(none);
    expect(order("pickup_failed", "confirmed")).toEqual(none);
  });

  it("a normal pickup finish cancels the parcels never handed to the driver", () => {
    const mission = (kind: "pickup" | "delivery", to: MissionStatus, endReason: EndReason) =>
      cascadesOf({ type: "mission", kind, to, endReason });
    expect(mission("pickup", "finished", null)).toEqual({ ...none, cancelToCollectParcels: true });
    // Not an early end, not a delivery, not another state.
    expect(mission("pickup", "finished", "orderCanceled")).toEqual(none);
    expect(mission("delivery", "finished", null)).toEqual(none);
    expect(mission("pickup", "arrived", null)).toEqual(none);
  });
});

describe("walk: random legal parcel moves keep every order event in ORDER_NEXT", () => {
  // A small deterministic generator: the domain has no random source.
  function rng(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return state / 4_294_967_296;
    };
  }

  it("from an assigned order of three parcels, 300 walks of legal moves never throw", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = rng(seed);
      let order: OrderStatus = "assigned";
      const parcels: ParcelStatus[] = ["to_collect", "to_collect", "to_collect"];
      for (let step = 0; step < 40; step++) {
        const i = Math.floor(next() * parcels.length);
        const from = parcels[i]!;
        const options = PARCEL_NEXT[from].filter((to) => "ok" in checkParcelMove(from, to, order));
        if (options.length === 0) continue;
        const to = options[Math.floor(next() * options.length)]!;
        parcels[i] = to;
        const outcome = nextOrderOutcome(order, parcels);
        if (outcome.status !== order) {
          expect(ORDER_NEXT[order]).toContain(outcome.status);
          order = outcome.status;
        }
      }
    }
  });
});
