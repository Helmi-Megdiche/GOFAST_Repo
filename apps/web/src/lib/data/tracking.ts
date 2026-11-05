import { isValidTrackingCode, normalizeTrackingCode } from "../tracking-code";
import { mockDelay } from "./delay";
import { FOUND_PARCEL, FOUND_TRACKING_CODE } from "./fixtures/tracking";
import { publicParcelOf } from "./orders";

export type TrackingStep = "created" | "confirmed" | "picked_up" | "out_for_delivery" | "delivered";

/** Public tracking (SUI-01): status, dated history, estimated time, cities. No personal data. */
export type PublicParcel = {
  currentStep: TrackingStep;
  /** null until a delivery time is known (a new order): the page shows [HEURE]. */
  etaUtc: string | null;
  fromCity: string | null;
  toCity: string | null;
  history: { step: TrackingStep; atUtc: string }[];
};

export type TrackingResult =
  | { status: "found"; parcel: PublicParcel }
  | { status: "not-found" }
  | { status: "invalid-format" };

/** Mock of GET /v1/tracking/:code. Codes and ISO dates only: the page owns every word. */
export async function lookupTracking(code: string): Promise<TrackingResult> {
  await mockDelay();
  if (!isValidTrackingCode(code)) return { status: "invalid-format" };
  if (normalizeTrackingCode(code) === FOUND_TRACKING_CODE) {
    return { status: "found", parcel: FOUND_PARCEL };
  }
  // Orders created with the mock order flow on this device.
  const created = publicParcelOf(code);
  if (created) return { status: "found", parcel: created };
  return { status: "not-found" };
}
