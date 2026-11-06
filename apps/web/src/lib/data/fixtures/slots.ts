/**
 * Example pickup windows in Tunis local time (decision 7). GOFAST has not given its hours: these are
 * example fixtures, listed in the PR. dayOffset 0 = today, 1 = tomorrow.
 */
export const PICKUP_WINDOWS: { dayOffset: 0 | 1; start: string; end: string }[] = [
  { dayOffset: 0, start: "09:00", end: "11:00" },
  { dayOffset: 0, start: "11:00", end: "13:00" },
  { dayOffset: 0, start: "14:00", end: "16:00" },
  { dayOffset: 0, start: "16:00", end: "18:00" },
  { dayOffset: 1, start: "09:00", end: "11:00" },
  { dayOffset: 1, start: "11:00", end: "13:00" },
  { dayOffset: 1, start: "14:00", end: "16:00" },
  { dayOffset: 1, start: "16:00", end: "18:00" },
];
