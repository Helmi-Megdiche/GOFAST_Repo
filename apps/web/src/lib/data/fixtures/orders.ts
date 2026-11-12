import { proofLevelFor } from "../../order/proof";
import { readJson, writeJson } from "../../storage";
import { readTable, writeRow } from "../mock-db";
import {
  ACCOUNT_ORDERS,
  DELIVERY_CODES,
  PARCELS,
  STATUS_EVENTS,
  type AccountOrder,
  type DeliveryCode,
  type Parcel,
  type StatusEvent,
} from "../order-model";
import { mintRecipientLink } from "../recipient-links";
import type { ParcelTypeCode, ServiceCode } from "../services";
import {
  activePickupMission,
  createMission,
  transition,
  type OrderStatus,
  type ParcelStatus,
} from "../states";
import { FOUND_TRACKING_CODE } from "./tracking";

/**
 * Fake orders for the mock (ESP-00). Every state is reached through `createMission` and
 * `transition`, with fixed Nov 2026 times, so an illegal fixture throws when it is seeded and the
 * tests replay the events through the transition tables. Only the first state of a row (`received`,
 * `to_collect`) and a parcel's `proof` are written directly. Fake names, phones and addresses.
 */
export const SEED_KEY = "fg.mock.seed";
export const SEED_VERSION = "orders-v2";

type ParcelSpec = {
  codMillimes?: number;
  declaredValueMillimes?: number;
  fragile?: boolean;
  size?: ParcelTypeCode;
  weightDeclaredG?: number;
  weightMeasuredG?: number;
};

type OrderSpec = {
  code: string;
  ownerAccountId: string;
  createdAt: number;
  parcels: ParcelSpec[];
  etaUtc?: string;
  service?: ServiceCode;
  paymentMode?: AccountOrder["paymentMode"];
  recipient: { name: string; phone: string; address: string };
};

const ACTOR = "fixture";
const DRIVER = "driver-fixture";
const DAY = (day: number, hour: number, minute: number) => Date.UTC(2026, 10, day, hour, minute);
const iso = (at: number) => new Date(at).toISOString();
const MINUTE = 60_000;

/** A fixed clock for one order: every step is one minute after the previous. */
function stepper(start: number) {
  let at = start;
  return () => (at += MINUTE);
}
type Next = () => number;

function must(result: ReturnType<typeof transition>, what: string): void {
  if (!("ok" in result)) throw new Error(`order fixture: ${what} refused (${result.refused})`);
}

const orderStep = (code: string, to: OrderStatus, next: Next) =>
  must(transition({ type: "order", id: code }, to, ACTOR, { at: next() }), `${code} -> ${to}`);

const parcelStep = (id: string, to: ParcelStatus, next: Next, proof = false) => {
  const at = next();
  if (proof) {
    // The proof of a handover (R401), written just before the parcel reaches handed_over.
    const parcel = readTable<Parcel>(PARCELS)[id]!;
    writeRow<Parcel>(PARCELS, id, {
      ...parcel,
      proof: { kind: parcel.proofLevel, capturedAt: iso(at) },
    });
  }
  must(transition({ type: "parcel", id }, to, DRIVER, { at }), `${id} -> ${to}`);
};

/** Writes fields of a parcel row directly (a failure reason, an attempt count): they are not states. */
const patchParcel = (id: string, patch: Partial<Parcel>) =>
  writeRow<Parcel>(PARCELS, id, { ...readTable<Parcel>(PARCELS)[id]!, ...patch });

const missionStep = (code: string, to: "accepted" | "arrived" | "finished", next: Next) => {
  const mission = activePickupMission(code);
  if (!mission) throw new Error(`order fixture: ${code} has no pickup mission`);
  must(
    transition({ type: "mission", id: mission.id }, to, DRIVER, { at: next() }),
    `${code} ${to}`,
  );
};

function createFixtureOrder(spec: OrderSpec): { ids: string[]; next: Next } {
  const created = iso(spec.createdAt);
  const total = 12_000;
  const order: AccountOrder = {
    code: spec.code,
    ownerAccountId: spec.ownerAccountId,
    createdByUserId: spec.ownerAccountId,
    createdAt: created,
    service: spec.service ?? "standard",
    sender: {
      name: "Sami T.",
      phone: "+21698000001",
      address: "12 rue Fixture, Tunis",
      city: null,
    },
    recipient: { ...spec.recipient, city: null },
    pickupPointId: null,
    recipientLocale: "fr",
    status: "received",
    lossReported: false,
    totalMillimes: total,
    priceLines: [
      { kind: "base", millimes: 9000 },
      { kind: "distance", millimes: 3000 },
    ],
    paymentMode: spec.paymentMode ?? "cashPickup",
    freightPayer: spec.paymentMode === "cashDelivery" ? "recipient" : "sender",
    freightPayerAccepted: false,
    strongerProofRequested: false,
    cancel: null,
    etaUtc: spec.etaUtc ?? null,
  };
  writeRow(ACCOUNT_ORDERS, spec.code, order);
  writeEvent("order", spec.code, null, "received", spec.ownerAccountId, spec.createdAt);

  const ids: string[] = [];
  spec.parcels.forEach((p, i) => {
    const id = `${spec.code}-p${i + 1}`;
    ids.push(id);
    const codMillimes = p.codMillimes ?? null;
    const fragile = p.fragile ?? false;
    const parcel: Parcel = {
      id,
      orderCode: spec.code,
      index: i + 1,
      barcode: `${spec.code}-${i + 1}`,
      size: p.size ?? "small",
      weightDeclaredG: p.weightDeclaredG ?? 1500,
      weightMeasuredG: p.weightMeasuredG ?? null,
      declaredValueMillimes: p.declaredValueMillimes ?? null,
      codMillimes,
      fragile,
      proofLevel: proofLevelFor(
        { fragile, codMillimes },
        { totalDeclaredValueMillimes: null, strongerProofRequested: false },
      ),
      attempts: 0,
      status: "to_collect",
      failure: null,
      proof: null,
    };
    writeRow(PARCELS, id, parcel);
    writeEvent("parcel", id, null, "to_collect", spec.ownerAccountId, spec.createdAt);
    writeRow<DeliveryCode>(DELIVERY_CODES, id, {
      parcelId: id,
      code: "4827",
      failedAttempts: 0,
      expiresAt: null,
    });
  });
  mintRecipientLink(spec.code, "fr");
  return { ids, next: stepper(spec.createdAt) };
}

function writeEvent(
  subjectType: StatusEvent["subjectType"],
  subjectId: string,
  fromStatus: string | null,
  toStatus: string,
  actorId: string,
  at: number,
): void {
  const id = `fixture-${subjectType}-${subjectId}-${toStatus}`;
  writeRow<StatusEvent>(STATUS_EVENTS, id, {
    id,
    subjectType,
    subjectId,
    fromStatus,
    toStatus,
    actorId,
    occurredAt: iso(at),
  });
}

/** received -> confirmed -> assigned, with the pickup mission accepted (and arrived on request). */
function assign(code: string, next: Next, arrived: boolean): void {
  orderStep(code, "confirmed", next);
  createMission(code, "pickup", next());
  orderStep(code, "assigned", next);
  missionStep(code, "accepted", next);
  if (arrived) missionStep(code, "arrived", next);
}

/** The driver scans every parcel, then closes the pickup. The order becomes picked_up by derivation. */
function pickUp(code: string, ids: string[], next: Next): void {
  assign(code, next, true);
  for (const id of ids) parcelStep(id, "taken", next);
  missionStep(code, "finished", next);
}

const RECIPIENTS = {
  a: { name: "Nadia K.", phone: "+21620000011", address: "5 avenue Test, Sfax" },
  b: { name: "Omar B.", phone: "+21620000012", address: "8 rue Exemple, Sousse" },
  c: { name: "Salma D.", phone: "+21620000013", address: "3 impasse Maquette, Tunis" },
} as const;

const CUSTOMER = "acc-customer";
const MERCHANT = "acc-merchant-validated";

type Builder = (code: string) => void;
const one: ParcelSpec[] = [{}];

const customerOrder = (
  code: string,
  createdAt: number,
  recipient: OrderSpec["recipient"],
  parcels: ParcelSpec[] = one,
  extra: Partial<OrderSpec> = {},
) =>
  createFixtureOrder({ code, ownerAccountId: CUSTOMER, createdAt, recipient, parcels, ...extra });

/** Code, builder. The builder creates the order and drives it to its state. */
const BUILDERS: [string, Builder][] = [
  [
    "FG-5A1R-0001",
    (code) => {
      customerOrder(code, DAY(3, 16, 0), RECIPIENTS.a);
    },
  ],
  [
    "FG-5A1C-0002",
    (code) => {
      const { next } = customerOrder(code, DAY(3, 14, 0), RECIPIENTS.b);
      orderStep(code, "confirmed", next);
    },
  ],
  [
    "FG-5A1A-0003",
    (code) => {
      const { next } = customerOrder(code, DAY(3, 12, 0), RECIPIENTS.c);
      assign(code, next, false);
    },
  ],
  [
    "FG-5A1B-0004",
    (code) => {
      const { next } = customerOrder(code, DAY(3, 10, 0), RECIPIENTS.a);
      assign(code, next, true);
    },
  ],
  [
    "FG-5A1F-0005",
    (code) => {
      const { next } = customerOrder(code, DAY(3, 8, 0), RECIPIENTS.b);
      assign(code, next, true);
      orderStep(code, "pickup_failed", next);
    },
  ],
  [
    "FG-5A1P-0006",
    (code) => {
      const { ids, next } = customerOrder(code, DAY(2, 16, 0), RECIPIENTS.c, [{}, {}]);
      pickUp(code, ids, next);
    },
  ],
  [
    FOUND_TRACKING_CODE,
    (code) => {
      // The old Prompt 3 fixture: created 09:58Z, confirmed 10:05Z, in transit 12:52Z.
      const { ids } = customerOrder(code, DAY(4, 9, 58), RECIPIENTS.a, one, {
        etaUtc: "2026-11-04T13:20:00Z",
      });
      const at = [DAY(4, 10, 5), DAY(4, 10, 30), DAY(4, 10, 31), DAY(4, 10, 32), DAY(4, 10, 33)];
      const next = () => at.shift() ?? DAY(4, 11, 0);
      orderStep(code, "confirmed", next);
      createMission(code, "pickup", next());
      orderStep(code, "assigned", next);
      missionStep(code, "accepted", next);
      missionStep(code, "arrived", () => DAY(4, 11, 39));
      parcelStep(ids[0]!, "taken", () => DAY(4, 11, 40));
      missionStep(code, "finished", () => DAY(4, 11, 45));
      parcelStep(ids[0]!, "in_transit", () => DAY(4, 12, 52));
    },
  ],
  [
    "FG-5A1D-0008",
    (code) => {
      // Declared value 120 DT (ESP-06: C07 shows it, R802).
      const { ids, next } = customerOrder(code, DAY(2, 10, 0), RECIPIENTS.b, [
        { declaredValueMillimes: 120_000 },
      ]);
      pickUp(code, ids, next);
      parcelStep(ids[0]!, "in_transit", next);
      parcelStep(ids[0]!, "handed_over", next, true);
    },
  ],
  [
    "FG-5A1X-0009",
    (code) => {
      const { next } = customerOrder(code, DAY(2, 8, 0), RECIPIENTS.c);
      assign(code, next, false);
      orderStep(code, "canceled", next);
      const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[code]!;
      writeRow<AccountOrder>(ACCOUNT_ORDERS, code, {
        ...order,
        cancel: { at: iso(DAY(2, 8, 5)), fee: "none" },
      });
    },
  ],
  [
    "FG-5A1T-0010",
    (code) => {
      // Returned + lost: one parcel comes back, the other is lost on the way.
      const { ids, next } = customerOrder(code, DAY(1, 16, 0), RECIPIENTS.a, [{}, {}]);
      pickUp(code, ids, next);
      for (const id of ids) parcelStep(id, "in_transit", next);
      parcelStep(ids[1]!, "lost", next);
      parcelStep(ids[0]!, "delivery_failed", next);
      parcelStep(ids[0]!, "returning", next);
      parcelStep(ids[0]!, "returned", next);
    },
  ],
  [
    "FG-5A1Y-0011",
    (code) => {
      // T19: two parcels handed over, one returned.
      const { ids, next } = customerOrder(code, DAY(1, 10, 0), RECIPIENTS.b, [{}, {}, {}]);
      pickUp(code, ids, next);
      for (const id of ids) parcelStep(id, "in_transit", next);
      parcelStep(ids[0]!, "handed_over", next, true);
      parcelStep(ids[1]!, "handed_over", next, true);
      parcelStep(ids[2]!, "delivery_failed", next);
      parcelStep(ids[2]!, "returning", next);
      parcelStep(ids[2]!, "returned", next);
    },
  ],
  [
    "FG-5A1W-0013",
    (code) => {
      // R208: measured weights. P1 is above declared + 500 g, P2 is inside the tolerance.
      const { ids, next } = customerOrder(code, DAY(1, 8, 0), RECIPIENTS.c, [
        { weightMeasuredG: 2300 },
        { weightMeasuredG: 1900 },
      ]);
      pickUp(code, ids, next);
      for (const id of ids) parcelStep(id, "in_transit", next);
      for (const id of ids) parcelStep(id, "handed_over", next, true);
    },
  ],
  [
    "FG-5A1Z-0012",
    (code) => {
      // R502: both parcels failed their first attempt, with a reason each. The order stays in transit.
      const { ids, next } = customerOrder(code, DAY(3, 6, 0), RECIPIENTS.b, [{}, {}]);
      pickUp(code, ids, next);
      for (const id of ids) parcelStep(id, "in_transit", next);
      patchParcel(ids[0]!, {
        attempts: 1,
        failure: { reason: "recipientAbsent", photo: "fixture-photo-1" },
      });
      parcelStep(ids[0]!, "delivery_failed", next);
      patchParcel(ids[1]!, {
        attempts: 1,
        failure: { reason: "phoneUnreachable", photo: "fixture-photo-2" },
      });
      parcelStep(ids[1]!, "delivery_failed", next);
    },
  ],
  [
    "FG-5A1M-0014",
    (code) => {
      // An October order, for the month filter.
      const { ids, next } = customerOrder(code, Date.UTC(2026, 9, 28, 10, 0), RECIPIENTS.a);
      pickUp(code, ids, next);
      parcelStep(ids[0]!, "in_transit", next);
      parcelStep(ids[0]!, "handed_over", next, true);
    },
  ],
  [
    "FG-5B2A-0001",
    (code) => {
      const { next } = createFixtureOrder({
        code,
        ownerAccountId: "acc-customer-other",
        createdAt: DAY(3, 9, 0),
        recipient: RECIPIENTS.c,
        parcels: one,
      });
      orderStep(code, "confirmed", next);
    },
  ],
  [
    "FG-5C3A-0001",
    (code) => {
      // COD on each of the 2 parcels: the strongest proof level, delivered with proofs.
      const { ids, next } = createFixtureOrder({
        code,
        ownerAccountId: MERCHANT,
        createdAt: DAY(2, 12, 0),
        recipient: RECIPIENTS.a,
        parcels: [{ codMillimes: 30_000 }, { codMillimes: 45_000 }],
        paymentMode: "account",
      });
      pickUp(code, ids, next);
      for (const id of ids) parcelStep(id, "in_transit", next);
      for (const id of ids) parcelStep(id, "handed_over", next, true);
    },
  ],
  [
    "FG-5C3B-0002",
    (code) => {
      const { next } = createFixtureOrder({
        code,
        ownerAccountId: MERCHANT,
        createdAt: DAY(3, 11, 0),
        recipient: RECIPIENTS.b,
        parcels: one,
        paymentMode: "account",
      });
      orderStep(code, "confirmed", next);
    },
  ],
];

export const FIXTURE_ORDER_CODES: readonly string[] = BUILDERS.map(([code]) => code);

/**
 * Writes the fixture orders once per device: runs only when `fg.mock.seed` is not "orders-v2", then
 * sets it. It writes only rows of its own codes, so orders created later are never touched. Every
 * reader in account-orders.ts and tracking.ts calls it first.
 */
export function seedOrderFixtures(): void {
  if (readJson(SEED_KEY) === SEED_VERSION) return;
  // A device seeded by an older version keeps its orders (they may have been changed since): only
  // the missing fixture orders are built.
  const existing = readTable<AccountOrder>(ACCOUNT_ORDERS);
  for (const [code, build] of BUILDERS) if (!existing[code]) build(code);
  writeJson(SEED_KEY, SEED_VERSION);
}
