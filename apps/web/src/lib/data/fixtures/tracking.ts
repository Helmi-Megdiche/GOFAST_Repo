import type { PublicParcel } from "../tracking";

/** The tracking code that always answers "found". Fake data. */
export const FOUND_TRACKING_CODE = "FG-7K4M-2QXP";

/** Tunis is UTC+1: 13:20Z is 14 h 20, 12:52Z is 13 h 52. */
export const FOUND_PARCEL: PublicParcel = {
  currentStep: "out_for_delivery",
  etaUtc: "2026-11-04T13:20:00Z",
  // Cities stay null until FastGo gives the launch cities: the UI shows the placeholder.
  fromCity: null,
  toCity: null,
  history: [
    { step: "created", atUtc: "2026-11-04T09:58:00Z" },
    { step: "confirmed", atUtc: "2026-11-04T10:05:00Z" },
    { step: "picked_up", atUtc: "2026-11-04T11:40:00Z" },
    { step: "out_for_delivery", atUtc: "2026-11-04T12:52:00Z" },
  ],
};
