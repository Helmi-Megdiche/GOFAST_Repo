/**
 * Order, parcel and mission states (ADR-1, regles.md "États"). The tables, the refusals and the
 * cascades are rules, so they live here and the web and the API both use them. These functions
 * read nothing and write nothing: the caller passes the current states and does the storage.
 * "Le serveur refuse tout autre changement d'état."
 */

export type OrderStatus =
  | "received"
  | "confirmed"
  | "assigned"
  | "pickup_failed"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "partially_delivered"
  | "returned"
  | "lost"
  | "canceled";

export type ParcelStatus =
  | "to_collect"
  | "taken"
  | "at_depot"
  | "in_transit"
  | "delivery_failed"
  | "returning"
  | "handed_over"
  | "returned"
  | "lost"
  | "canceled";

export type MissionStatus =
  "proposed" | "accepted" | "refused" | "expired" | "arrived" | "finished";

export type EndReason = null | "driverRemoved" | "pickupFailed" | "orderCanceled";

export type DerivedOutcome =
  "picked_up" | "in_transit" | "delivered" | "partially_delivered" | "returned" | "lost";

export const ORDER_NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  received: ["confirmed", "canceled"],
  confirmed: ["assigned", "canceled"],
  assigned: ["picked_up", "pickup_failed", "canceled", "confirmed"],
  pickup_failed: ["confirmed", "canceled"],
  // `lost` only by derivation (a parcel lost right after the scan, ruling of 5 Nov 2026): a direct order
  // transition to it is refused with derivedState, and it never passes through in_transit.
  picked_up: ["in_transit", "lost"],
  in_transit: ["delivered", "partially_delivered", "returned", "lost"],
  delivered: [],
  partially_delivered: [],
  returned: [],
  lost: [],
  canceled: [],
};

export const PARCEL_NEXT: Record<ParcelStatus, readonly ParcelStatus[]> = {
  to_collect: ["taken", "canceled"],
  taken: ["at_depot", "in_transit", "lost"],
  at_depot: ["in_transit", "returning", "lost"],
  in_transit: ["handed_over", "delivery_failed", "lost"],
  delivery_failed: ["at_depot", "in_transit", "returning", "lost"],
  returning: ["returned", "lost"],
  handed_over: [],
  returned: [],
  lost: ["at_depot"],
  canceled: [],
};

/** `finished` from `proposed` or `accepted` is an early end: reachable only through the order cascades (H1). */
export const MISSION_NEXT: Record<MissionStatus, readonly MissionStatus[]> = {
  proposed: ["accepted", "refused", "expired", "finished"],
  accepted: ["arrived", "finished"],
  refused: [],
  expired: [],
  arrived: ["finished"],
  finished: [],
};

/** Reached only through parcel changes, never by a direct order transition. */
export const DERIVED_ORDER_STATES: readonly OrderStatus[] = [
  "picked_up",
  "in_transit",
  "delivered",
  "partially_delivered",
  "returned",
  "lost",
];

export const FINAL_ORDER_STATES: readonly OrderStatus[] = [
  "delivered",
  "partially_delivered",
  "returned",
  "lost",
  "canceled",
];

export const FINAL_PARCEL_STATES: readonly ParcelStatus[] = [
  "handed_over",
  "returned",
  "lost",
  "canceled",
];

/** A mission that is still running: the early end of the order cascades applies to it. */
export const MISSION_ACTIVE: readonly MissionStatus[] = ["proposed", "accepted", "arrived"];

/** Order states in which a parcel scan (`to_collect → taken`) is accepted. */
export const SCAN_ALLOWED: readonly OrderStatus[] = ["assigned", ...DERIVED_ORDER_STATES];

export type Refusal =
  | "illegalTransition"
  | "derivedState"
  | "orderNotAssigned"
  | "noParcelTaken"
  | "endReasonInternal"
  | "notFound";

export type MoveResult = { ok: true } | { refused: Refusal; from?: string; to?: string };

const OK: MoveResult = { ok: true };
const illegal = (from: string, to: string): MoveResult => ({
  refused: "illegalTransition",
  from,
  to,
});

/**
 * Pure: the order outcome from its parcels' states. Canceled parcels are ignored (H3). The set that
 * counts is never empty after pickup; an empty set is a bug and throws. A derived state never moves
 * backward: once the order is `in_transit` (`current`), it stays there until a final state.
 */
export function deriveOrderOutcome(
  parcels: readonly ParcelStatus[],
  current?: OrderStatus,
): DerivedOutcome {
  const counted = parcels.filter((s) => s !== "canceled");
  if (counted.length === 0) throw new Error("deriveOrderOutcome: no counted parcel");
  const allFinal = counted.every((s) => FINAL_PARCEL_STATES.includes(s));
  // `to_collect` and `lost` do not count as "moved on": while every other parcel is still taken, the
  // order stays picked_up, so a loss never shows a delivery that did not happen (ruling of 5 Nov:
  // picked_up -> lost directly). `to_collect` parcels are canceled at the normal finish.
  if (!allFinal) {
    if (current === "in_transit") return "in_transit";
    return counted.every((s) => s === "taken" || s === "to_collect" || s === "lost")
      ? "picked_up"
      : "in_transit";
  }
  const handed = counted.filter((s) => s === "handed_over").length;
  if (handed === counted.length) return "delivered";
  if (handed > 0) return "partially_delivered";
  if (counted.includes("returned")) return "returned";
  return "lost";
}

/** A direct order change (a client, an agent): derived states are never set by hand. */
export function checkOrderMove(from: OrderStatus, to: OrderStatus): MoveResult {
  if (DERIVED_ORDER_STATES.includes(to)) return { refused: "derivedState", from, to };
  if (!ORDER_NEXT[from]?.includes(to)) return illegal(from, to);
  return OK;
}

/**
 * A parcel change. A scan (`to_collect → taken`) reads the order first (ADR-1): `orderStatus` is the
 * state of the parcel's order, null when it is unknown (refused as `orderNotAssigned`).
 */
export function checkParcelMove(
  from: ParcelStatus,
  to: ParcelStatus,
  orderStatus: OrderStatus | null,
): MoveResult {
  if (to === "taken" && (orderStatus == null || !SCAN_ALLOWED.includes(orderStatus)))
    return { refused: "orderNotAssigned" };
  if (!PARCEL_NEXT[from]?.includes(to)) return illegal(from, to);
  return OK;
}

/**
 * A mission change. `origin` says who asks: a `"public"` call (a driver, an agent) can never set an
 * `endReason`, which is refused first, before anything else is looked at; only the order cascades
 * (`"cascade"`) end a mission early. A normal finish (no endReason) needs `arrived` and, for a
 * pickup, at least one parcel scanned (not `to_collect`, not `canceled`): `parcelStatuses` are the
 * order's parcels.
 */
export function checkMissionMove(
  mission: { kind: "pickup" | "delivery"; status: MissionStatus },
  to: MissionStatus,
  endReason: EndReason,
  parcelStatuses: readonly ParcelStatus[],
  origin: "public" | "cascade",
): MoveResult {
  if (origin === "public" && endReason != null) return { refused: "endReasonInternal" };
  const from = mission.status;
  if (!MISSION_NEXT[from]?.includes(to)) return illegal(from, to);
  if (to === "finished" && endReason === null) {
    if (from !== "arrived") return illegal(from, to);
    // Ruling: "scanned" means the parcel left to_collect and was not canceled. Testing for `taken`
    // alone refused the finish once the scanned parcel had moved on (in_transit, lost, handed_over...).
    if (
      mission.kind === "pickup" &&
      !parcelStatuses.some((s) => s !== "to_collect" && s !== "canceled")
    )
      return { refused: "noParcelTaken", from, to };
  }
  return OK;
}

/**
 * After a parcel change: the order's state and its `lossReported` flag. The order carries its own
 * state before pickup: it derives only once a parcel left `to_collect` (or it is already derived),
 * and never when it is final (H4: a lost parcel that turns up does not reopen a final order).
 * A derived move the table does not list is a bug in the derivation or a bad fixture: it throws.
 */
export function nextOrderOutcome(
  orderStatus: OrderStatus,
  parcelStatuses: readonly ParcelStatus[],
): { status: OrderStatus; lossReported: boolean } {
  const lossReported = parcelStatuses.some((s) => s === "lost");
  let status = orderStatus;
  const final = FINAL_ORDER_STATES.includes(orderStatus);
  const pickedUp =
    DERIVED_ORDER_STATES.includes(orderStatus) ||
    (orderStatus === "assigned" &&
      parcelStatuses.some((s) => s !== "to_collect" && s !== "canceled"));
  if (!final && pickedUp) status = deriveOrderOutcome(parcelStatuses, orderStatus);
  if (status !== orderStatus && !ORDER_NEXT[orderStatus].includes(status))
    throw new Error(`nextOrderOutcome: ${orderStatus} -> ${status} is not in ORDER_NEXT`);
  return { status, lossReported };
}

/** What a change that went through sets off, besides its own write. */
export type Cascades = {
  /** The active pickup mission ends early with this reason (null: it does not end). */
  endPickupMission: EndReason;
  /** Every parcel still `to_collect` is canceled (actor system). */
  cancelToCollectParcels: boolean;
  /** The recipient link expires (the order reached a final state, whichever way). */
  expireRecipientLink: boolean;
};

export type Move =
  | { type: "order"; from: OrderStatus; to: OrderStatus }
  | { type: "mission"; kind: "pickup" | "delivery"; to: MissionStatus; endReason: EndReason };

/**
 * The cascades of a change that was accepted. An order change: `assigned → confirmed` ends the
 * pickup mission (driverRemoved), `assigned → pickup_failed` (pickupFailed), `→ canceled`
 * (orderCanceled) and cancels the `to_collect` parcels; the recipient link expires on every final
 * order state, a derived one (delivered, returned...) as well as `canceled`. A mission change: a
 * normal pickup finish cancels the parcels never handed to the driver.
 */
export function cascadesOf(move: Move): Cascades {
  if (move.type === "mission") {
    return {
      endPickupMission: null,
      cancelToCollectParcels:
        move.kind === "pickup" && move.to === "finished" && move.endReason === null,
      expireRecipientLink: false,
    };
  }
  const { from, to } = move;
  let endPickupMission: EndReason = null;
  if (to === "canceled") endPickupMission = "orderCanceled";
  else if (from === "assigned" && to === "confirmed") endPickupMission = "driverRemoved";
  else if (from === "assigned" && to === "pickup_failed") endPickupMission = "pickupFailed";
  return {
    endPickupMission,
    cancelToCollectParcels: to === "canceled",
    expireRecipientLink: FINAL_ORDER_STATES.includes(to),
  };
}
