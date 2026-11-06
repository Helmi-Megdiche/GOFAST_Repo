import type { Locale } from "@fastgo/i18n";
import type { PaymentCode } from "../order/draft";
import type { PriceLine } from "../order/pricing";
import type { ProofLevel } from "../order/proof";
import type { ParcelTypeCode, ServiceCode } from "./services";
import type { EndReason, MissionStatus, OrderStatus, ParcelStatus } from "./states";

/** Mock tables (ADR-1). Read and written only from lib/data, through readTable / writeRow. */
export const ACCOUNT_ORDERS = "fg.mock.accountOrders";
export const PARCELS = "fg.mock.parcels";
export const MISSIONS = "fg.mock.missions";
export const STATUS_EVENTS = "fg.mock.statusEvents";
export const DELIVERY_CODES = "fg.mock.deliveryCodes";
export const RECIPIENT_LINKS = "fg.mock.recipientLinks";
export const OUTBOX = "fg.mock.outbox";

/** An order of an account, keyed by its tracking code. `status` is the order's own state until pickup, then derived. */
export type AccountOrder = {
  code: string;
  ownerAccountId: string | null;
  createdByUserId: string | null;
  /** ISO UTC. */
  createdAt: string;
  service: ServiceCode;
  sender: { name: string; phone: string | null; address: string; city: string | null };
  recipient: { name: string; phone: string; address: string; city: string | null };
  pickupPointId: string | null;
  recipientLocale: Locale;
  status: OrderStatus;
  /** True whenever any counted (not canceled) parcel is lost, recomputed on every parcel change. */
  lossReported: boolean;
  totalMillimes: number;
  priceLines: { kind: PriceLine; millimes: number }[];
  paymentMode: PaymentCode;
  freightPayer: "sender" | "recipient";
  freightPayerAccepted: boolean;
  strongerProofRequested: boolean;
  cancel: { at: string; fee: "none" | "applies" | "backOfficeDecides" } | null;
  etaUtc: string | null;
};

/** R502: the reasons a driver picks from when a delivery fails (GOFAST answers, 6 Nov 2026). */
export const FAILURE_REASONS = [
  "recipientAbsent",
  "phoneUnreachable",
  "recipientRefused",
  "addressIncorrect",
  "other",
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export type Parcel = {
  id: string;
  orderCode: string;
  index: number;
  barcode: string;
  size: ParcelTypeCode;
  weightDeclaredG: number;
  weightMeasuredG: number | null;
  declaredValueMillimes: number | null;
  codMillimes: number | null;
  fragile: boolean;
  proofLevel: ProofLevel;
  attempts: number;
  status: ParcelStatus;
  failure: { reason: FailureReason; photo: string } | null;
  proof: { kind: ProofLevel; capturedAt: string } | null;
};

export type Mission = {
  id: string;
  orderCode: string;
  kind: "pickup" | "delivery";
  status: MissionStatus;
  /** ISO UTC, like every time below. */
  offeredAt: string;
  expiresAt: string | null;
  arrivedAt: string | null;
  finishedAt: string | null;
  endReason: EndReason;
};

export type StatusEvent = {
  id: string;
  subjectType: "order" | "parcel" | "mission";
  subjectId: string;
  /** null only for a creation event: an order's or a parcel's first status, or a mission's `null → proposed`. */
  fromStatus: string | null;
  toStatus: string;
  actorId: string;
  occurredAt: string;
  endReason?: EndReason;
};

/** Handover code of a parcel (4 digits), keyed by the parcel id. */
export type DeliveryCode = {
  parcelId: string;
  code: string;
  failedAttempts: number;
  /** ISO UTC, null until the code expires. */
  expiresAt: string | null;
};
