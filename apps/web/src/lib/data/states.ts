import { now } from "../order/clock";
import { readTable, writeRow } from "./mock-db";
import {
  ACCOUNT_ORDERS,
  MISSIONS,
  PARCELS,
  STATUS_EVENTS,
  type AccountOrder,
  type Mission,
  type Parcel,
  type StatusEvent,
} from "./order-model";
import { expireRecipientLink } from "./recipient-links";

/**
 * Order, parcel and mission states (ADR-1, regles.md "États"). One transition function; every
 * change writes one event to fg.mock.statusEvents. "Le serveur refuse tout autre changement d'état."
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
  picked_up: ["in_transit"],
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

/** `finished` from `proposed` or `accepted` only with an endReason (early end, H1). */
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

export type Refusal =
  "illegalTransition" | "derivedState" | "orderNotAssigned" | "noParcelTaken" | "notFound";

export type TransitionResult = { ok: true } | { refused: Refusal; from?: string; to?: string };

type Subject = { type: "order" | "parcel" | "mission"; id: string };
type Options = { endReason?: EndReason; at?: number };

const SYSTEM = "system";
const MISSION_ACTIVE: readonly MissionStatus[] = ["proposed", "accepted", "arrived"];
/** Order states in which a parcel scan (`to_collect → taken`) is accepted. */
const SCAN_ALLOWED: readonly OrderStatus[] = ["assigned", ...DERIVED_ORDER_STATES];

const iso = (at: number) => new Date(at).toISOString();

function writeEvent(
  subjectType: StatusEvent["subjectType"],
  subjectId: string,
  fromStatus: string | null,
  toStatus: string,
  actorId: string,
  at: number,
  endReason?: EndReason,
): void {
  const id = crypto.randomUUID();
  const event: StatusEvent = {
    id,
    subjectType,
    subjectId,
    fromStatus,
    toStatus,
    actorId,
    occurredAt: iso(at),
    ...(endReason ? { endReason } : {}),
  };
  writeRow(STATUS_EVENTS, id, event);
}

const illegal = (from: string, to: string): TransitionResult => ({
  refused: "illegalTransition",
  from,
  to,
});

/**
 * Pure: the order outcome from its parcels' states. Canceled parcels are ignored (H3). The set that
 * counts is never empty after pickup; an empty set is a bug and throws.
 */
export function deriveOrderOutcome(parcels: ParcelStatus[]): DerivedOutcome {
  const counted = parcels.filter((s) => s !== "canceled");
  if (counted.length === 0) throw new Error("deriveOrderOutcome: no counted parcel");
  const allFinal = counted.every((s) => FINAL_PARCEL_STATES.includes(s));
  if (!allFinal)
    return counted.every((s) => s === "taken" || s === "to_collect") ? "picked_up" : "in_transit";
  const handed = counted.filter((s) => s === "handed_over").length;
  if (handed === counted.length) return "delivered";
  if (handed > 0) return "partially_delivered";
  if (counted.includes("returned")) return "returned";
  return "lost";
}

/** The order's latest pickup mission that is not refused, expired, nor ended with an endReason. */
export function activePickupMission(orderCode: string): Mission | null {
  let latest: Mission | null = null;
  for (const m of Object.values(readTable<Mission>(MISSIONS))) {
    if (m.orderCode !== orderCode || m.kind !== "pickup") continue;
    if (m.status === "refused" || m.status === "expired" || m.endReason !== null) continue;
    if (!latest || m.offeredAt >= latest.offeredAt) latest = m;
  }
  return latest;
}

/** A new mission in `proposed`, with its creation event (`null → proposed`, actor system). */
export function createMission(
  orderCode: string,
  kind: "pickup" | "delivery",
  at: number = now(),
): Mission {
  const mission: Mission = {
    id: crypto.randomUUID(),
    orderCode,
    kind,
    status: "proposed",
    offeredAt: iso(at),
    expiresAt: null,
    arrivedAt: null,
    finishedAt: null,
    endReason: null,
  };
  writeRow(MISSIONS, mission.id, mission);
  writeEvent("mission", mission.id, null, "proposed", SYSTEM, at);
  return mission;
}

const parcelsOf = (orderCode: string) =>
  Object.values(readTable<Parcel>(PARCELS))
    .filter((p) => p.orderCode === orderCode)
    .sort((a, b) => a.index - b.index);

/** Moves every `to_collect` parcel of the order to `canceled`, actor system. */
function cancelParcelsToCollect(orderCode: string, at: number): void {
  for (const p of parcelsOf(orderCode)) {
    if (p.status === "to_collect")
      transition({ type: "parcel", id: p.id }, "canceled", SYSTEM, { at });
  }
}

/** Early end of the active pickup mission, if it is still running. */
function endActivePickupMission(orderCode: string, endReason: EndReason, at: number): void {
  const mission = activePickupMission(orderCode);
  if (mission && MISSION_ACTIVE.includes(mission.status)) {
    transition({ type: "mission", id: mission.id }, "finished", SYSTEM, { endReason, at });
  }
}

function transitionOrder(
  id: string,
  to: OrderStatus,
  actorId: string,
  at: number,
): TransitionResult {
  const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[id];
  if (!order) return { refused: "notFound" };
  const from = order.status;
  if (DERIVED_ORDER_STATES.includes(to)) return { refused: "derivedState", from, to };
  if (!ORDER_NEXT[from]?.includes(to)) return illegal(from, to);

  writeRow(ACCOUNT_ORDERS, id, { ...order, status: to });
  writeEvent("order", id, from, to, actorId, at);

  if (from === "assigned" && to === "confirmed") endActivePickupMission(id, "driverRemoved", at);
  if (from === "assigned" && to === "pickup_failed") endActivePickupMission(id, "pickupFailed", at);
  if (to === "canceled") {
    endActivePickupMission(id, "orderCanceled", at);
    cancelParcelsToCollect(id, at);
    expireRecipientLink(id, at);
  }
  return { ok: true };
}

/** After a parcel change: recompute lossReported, then the derived outcome unless the order is final (H4). */
function recomputeOrder(orderCode: string, at: number): void {
  const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[orderCode];
  if (!order) return;
  const statuses = parcelsOf(orderCode).map((p) => p.status);
  const lossReported = statuses.some((s) => s === "lost");
  let status = order.status;
  const final = FINAL_ORDER_STATES.includes(order.status);
  // Before pickup the order carries its own state: derive only once a parcel left to_collect.
  const pickedUp =
    DERIVED_ORDER_STATES.includes(order.status) ||
    (order.status === "assigned" && statuses.some((s) => s !== "to_collect" && s !== "canceled"));
  if (!final && pickedUp) status = deriveOrderOutcome(statuses);
  writeRow(ACCOUNT_ORDERS, orderCode, { ...order, lossReported, status });
  if (status !== order.status) {
    writeEvent("order", orderCode, order.status, status, SYSTEM, at);
    if (FINAL_ORDER_STATES.includes(status)) expireRecipientLink(orderCode, at);
  }
}

function transitionParcel(
  id: string,
  to: ParcelStatus,
  actorId: string,
  at: number,
): TransitionResult {
  const parcel = readTable<Parcel>(PARCELS)[id];
  if (!parcel) return { refused: "notFound" };
  if (to === "taken") {
    // A scan reads the order before the parcel (ADR-1).
    const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[parcel.orderCode];
    if (!order || !SCAN_ALLOWED.includes(order.status)) return { refused: "orderNotAssigned" };
  }
  const from = parcel.status;
  if (!PARCEL_NEXT[from]?.includes(to)) return illegal(from, to);

  writeRow(PARCELS, id, { ...parcel, status: to });
  writeEvent("parcel", id, from, to, actorId, at);
  recomputeOrder(parcel.orderCode, at);
  return { ok: true };
}

function transitionMission(
  id: string,
  to: MissionStatus,
  actorId: string,
  endReason: EndReason,
  at: number,
): TransitionResult {
  const mission = readTable<Mission>(MISSIONS)[id];
  if (!mission) return { refused: "notFound" };
  const from = mission.status;
  if (!MISSION_NEXT[from]?.includes(to)) return illegal(from, to);

  const normalFinish = to === "finished" && endReason === null;
  if (normalFinish) {
    if (from !== "arrived") return illegal(from, to);
    if (
      mission.kind === "pickup" &&
      !parcelsOf(mission.orderCode).some((p) => p.status === "taken")
    ) {
      return { refused: "noParcelTaken", from, to };
    }
  }

  const updated: Mission = { ...mission, status: to };
  if (to === "arrived") updated.arrivedAt = iso(at);
  if (to === "finished") {
    updated.finishedAt = iso(at);
    updated.endReason = endReason;
  }
  writeRow(MISSIONS, id, updated);
  writeEvent("mission", id, from, to, actorId, at, to === "finished" ? endReason : undefined);

  // Only a normal pickup finish cancels the parcels never handed to the driver.
  if (normalFinish && mission.kind === "pickup") cancelParcelsToCollect(mission.orderCode, at);
  return { ok: true };
}

/**
 * The one way to change a state. Uses only the tables above, plus the ADR-1 rules: derived order
 * states, the scan precondition, the pickup-finish rules and the cascades (mission early end, parcel
 * cancel, recipient link expiry). Times are `options.at` or now(); every time stored is ISO UTC.
 */
export function transition(
  subject: Subject,
  to: string,
  actorId: string,
  options: Options = {},
): TransitionResult {
  const at = options.at ?? now();
  switch (subject.type) {
    case "order":
      return transitionOrder(subject.id, to as OrderStatus, actorId, at);
    case "parcel":
      return transitionParcel(subject.id, to as ParcelStatus, actorId, at);
    case "mission":
      return transitionMission(
        subject.id,
        to as MissionStatus,
        actorId,
        options.endReason ?? null,
        at,
      );
  }
}
