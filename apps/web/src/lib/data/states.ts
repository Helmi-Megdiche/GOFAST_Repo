import {
  cascadesOf,
  checkMissionMove,
  checkOrderMove,
  checkParcelMove,
  nextOrderOutcome,
  MISSION_ACTIVE,
  type CancelFee,
  type EndReason,
  type MissionStatus,
  type MoveResult,
  type OrderStatus,
  type ParcelStatus,
} from "@fastgo/domain";
import { now } from "../order/clock";
import { readTable, writeRow } from "./mock-db";
import {
  ACCOUNT_ORDERS,
  MISSIONS,
  PARCELS,
  STATUS_EVENTS,
  type AccountOrder,
  type FailureReason,
  type Mission,
  type Parcel,
  type StatusEvent,
} from "./order-model";
import { expireRecipientLink } from "./recipient-links";

// The rules (tables, refusals, cascades) are in @fastgo/domain; they are re-exported here until the
// importers move (GH-75, PR 3).
export {
  DERIVED_ORDER_STATES,
  deriveOrderOutcome,
  FINAL_ORDER_STATES,
  FINAL_PARCEL_STATES,
  MISSION_NEXT,
  ORDER_NEXT,
  PARCEL_NEXT,
  type CancelFee,
  type DerivedOutcome,
  type EndReason,
  type MissionStatus,
  type OrderStatus,
  type ParcelStatus,
  type Refusal,
} from "@fastgo/domain";

/**
 * The storage side of the order, parcel and mission states (ADR-1). One transition function; every
 * change writes one event to fg.mock.statusEvents. The decisions (what is legal, what is refused,
 * what cascades) are the pure functions of @fastgo/domain.
 */

export type TransitionResult = MoveResult;

type Subject = { type: "order" | "parcel" | "mission"; id: string };
/** `endReason` is accepted only to be refused (`endReasonInternal`): the order cascades set it. */
type Options = { endReason?: EndReason; at?: number };

const SYSTEM = "system";

const iso = (at: number) => new Date(at).toISOString();

function writeEvent(
  subjectType: StatusEvent["subjectType"],
  subjectId: string,
  fromStatus: string | null,
  toStatus: string,
  actorId: string,
  at: number,
  endReason?: EndReason,
  reason?: FailureReason,
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
    ...(reason ? { reason } : {}),
  };
  writeRow(STATUS_EVENTS, id, event);
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
    // Internal call: the public `transition` refuses a non-null endReason.
    transitionMission(mission.id, "finished", SYSTEM, endReason, at, "cascade");
  }
}

/** Runs what an accepted change sets off (cascadesOf): the storage side of the cascades. */
function runCascades(orderCode: string, cascades: ReturnType<typeof cascadesOf>, at: number): void {
  if (cascades.endPickupMission) endActivePickupMission(orderCode, cascades.endPickupMission, at);
  if (cascades.cancelToCollectParcels) cancelParcelsToCollect(orderCode, at);
  if (cascades.expireRecipientLink) expireRecipientLink(orderCode, at);
}

function transitionOrder(
  id: string,
  to: OrderStatus,
  actorId: string,
  at: number,
  cancelFee?: CancelFee,
): TransitionResult {
  const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[id];
  if (!order) return { refused: "notFound" };
  const from = order.status;
  const verdict = checkOrderMove(from, to);
  if (!("ok" in verdict)) return verdict;

  // CMD-08: a client cancel records its fee in the same write as the state.
  const cancel = to === "canceled" && cancelFee ? { at: iso(at), fee: cancelFee } : order.cancel;
  writeRow(ACCOUNT_ORDERS, id, { ...order, status: to, cancel });
  writeEvent("order", id, from, to, actorId, at);
  runCascades(id, cascadesOf({ type: "order", from, to }), at);
  return { ok: true };
}

/** After a parcel change: recompute lossReported, then the derived outcome unless the order is final (H4). */
function recomputeOrder(orderCode: string, at: number): void {
  const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[orderCode];
  if (!order) return;
  const { status, lossReported } = nextOrderOutcome(
    order.status,
    parcelsOf(orderCode).map((p) => p.status),
  );
  writeRow(ACCOUNT_ORDERS, orderCode, { ...order, lossReported, status });
  if (status !== order.status) {
    writeEvent("order", orderCode, order.status, status, SYSTEM, at);
    // A derived move sets off only the link expiry (on a final outcome).
    runCascades(orderCode, cascadesOf({ type: "order", from: order.status, to: status }), at);
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
  // A scan reads the order before the parcel (ADR-1).
  const order = to === "taken" ? readTable<AccountOrder>(ACCOUNT_ORDERS)[parcel.orderCode] : null;
  const from = parcel.status;
  const verdict = checkParcelMove(from, to, order?.status ?? null);
  if (!("ok" in verdict)) return verdict;

  writeRow(PARCELS, id, { ...parcel, status: to });
  // R502: the reason of this failure stays with its event, so a second attempt cannot rewrite it.
  writeEvent(
    "parcel",
    id,
    from,
    to,
    actorId,
    at,
    undefined,
    to === "delivery_failed" ? parcel.failure?.reason : undefined,
  );
  recomputeOrder(parcel.orderCode, at);
  return { ok: true };
}

function transitionMission(
  id: string,
  to: MissionStatus,
  actorId: string,
  endReason: EndReason,
  at: number,
  origin: "public" | "cascade",
): TransitionResult {
  const mission = readTable<Mission>(MISSIONS)[id];
  if (!mission) return { refused: "notFound" };
  const from = mission.status;
  const verdict = checkMissionMove(
    mission,
    to,
    endReason,
    parcelsOf(mission.orderCode).map((p) => p.status),
    origin,
  );
  if (!("ok" in verdict)) return verdict;

  const updated: Mission = { ...mission, status: to };
  if (to === "arrived") updated.arrivedAt = iso(at);
  if (to === "finished") {
    updated.finishedAt = iso(at);
    updated.endReason = endReason;
  }
  writeRow(MISSIONS, id, updated);
  writeEvent("mission", id, from, to, actorId, at, to === "finished" ? endReason : undefined);

  runCascades(
    mission.orderCode,
    cascadesOf({ type: "mission", kind: mission.kind, to, endReason }),
    at,
  );
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
  // The three end reasons are the result of an order change (assigned → confirmed, assigned →
  // pickup_failed, → canceled), never a call of their own: a mission ended alone would leave an
  // `assigned` order with no active mission. A public call that sets one is refused by
  // checkMissionMove (origin "public") before anything is read or written.
  // An order or a parcel has no end reason at all: asking for one is the same refusal.
  if (subject.type !== "mission" && options.endReason != null)
    return { refused: "endReasonInternal" };
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
        "public",
      );
  }
}

/**
 * The client cancel (CMD-08): the order goes to `canceled` and its fee is recorded in the same
 * write; the mission end, the parcel cancel and the link expiry cascade as for any cancel. The
 * caller (cancel.ts) has already checked the state and the pickup mission.
 */
export function cancelOrderWithFee(
  orderCode: string,
  fee: CancelFee,
  actorId: string,
  at: number = now(),
): TransitionResult {
  return transitionOrder(orderCode, "canceled", actorId, at, fee);
}
