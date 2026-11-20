import type { Locale } from "@fastgo/i18n/locales";
import type { PaymentCode } from "./payment";
import type { PriceLine } from "./pricing";
import type { ProofLevel } from "./proof";
import type { ParcelTypeCode, ServiceCode } from "../services";
import type { EndReason, MissionStatus, OrderStatus, ParcelStatus } from "../states";

/** The order model (ADR-1): the shapes of an order, its parcels, missions and events. Types only. */

/** CMD-08: what a client cancel costs, decided by the caller. */
export type CancelFee = "none" | "applies" | "backOfficeDecides";

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
  priceLines: {
    kind: PriceLine;
    /** Price of one parcel on a per-parcel line, null when the parcels differ (weight). */
    unitMillimes: number | null;
    /** Number of parcels on a per-parcel line, 1 on a line charged once per order. */
    count: number;
    millimes: number;
  }[];
  paymentMode: PaymentCode;
  freightPayer: "sender" | "recipient";
  freightPayerAccepted: boolean;
  strongerProofRequested: boolean;
  cancel: { at: string; fee: CancelFee } | null;
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
  /** R502: the reason of a `delivery_failed` parcel event, kept with the event (one per attempt). */
  reason?: FailureReason;
};

/** Handover code of a parcel (4 digits), keyed by the parcel id. */
export type DeliveryCode = {
  parcelId: string;
  code: string;
  failedAttempts: number;
  /** ISO UTC, null until the code expires. */
  expiresAt: string | null;
};
