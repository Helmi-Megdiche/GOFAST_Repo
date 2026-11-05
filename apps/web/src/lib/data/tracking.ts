import { isValidTrackingCode, normalizeTrackingCode } from "../tracking-code";
import { orderHistory, parcelsOf } from "./account-orders";
import { mockDelay } from "./delay";
import { seedOrderFixtures } from "./fixtures/orders";
import { readTable } from "./mock-db";
import { ACCOUNT_ORDERS, type AccountOrder } from "./order-model";
import type { OrderStatus, ParcelStatus } from "./states";

/**
 * Public tracking (SUI-01, R405): the allowlist of what anyone holding the code may see. No name,
 * phone, address, driver, position or code of a parcel. `etaUtc` stays because SUI-01 shows the
 * estimated time and it is not personal data (listed in the PR).
 */
export type PublicTracking = {
  status: OrderStatus;
  /** null until a delivery time is known (a new order): the page shows [HEURE]. */
  etaUtc: string | null;
  /** The order's own events, oldest first. */
  history: { status: OrderStatus; atUtc: string }[];
  fromCity: string | null;
  toCity: string | null;
  /** Counted parcels: the canceled ones (never handed to the driver) are left out. */
  parcelCount: number;
  parcelOutcomes: ParcelStatus[];
};

export type TrackingResult =
  | { status: "found"; tracking: PublicTracking }
  | { status: "not-found" }
  | { status: "invalid-format" };

export function publicTrackingOf(code: string): PublicTracking | null {
  seedOrderFixtures();
  const order = readTable<AccountOrder>(ACCOUNT_ORDERS)[normalizeTrackingCode(code)];
  if (!order) return null;
  const counted = parcelsOf(order.code).filter((parcel) => parcel.status !== "canceled");
  return {
    status: order.status,
    etaUtc: order.etaUtc,
    history: orderHistory(order.code),
    fromCity: order.sender.city,
    toCity: order.recipient.city,
    parcelCount: counted.length,
    parcelOutcomes: counted.map((parcel) => parcel.status),
  };
}

/** Mock of GET /v1/tracking/:code. Codes and ISO dates only: the page owns every word. */
export async function lookupTracking(code: string): Promise<TrackingResult> {
  await mockDelay();
  if (!isValidTrackingCode(code)) return { status: "invalid-format" };
  const tracking = publicTrackingOf(code);
  return tracking ? { status: "found", tracking } : { status: "not-found" };
}
