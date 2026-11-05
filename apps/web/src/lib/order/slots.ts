import { DISPLAY_TIME_ZONE } from "@fastgo/i18n";
import { PICKUP_WINDOWS } from "../data/fixtures/slots";

/** A pickup window, stored as UTC instants (CLAUDE.md: store UTC, show Africa/Tunis). */
export type Slot = { id: string; startUtc: string; endUtc: string; dayOffset: 0 | 1 };

/** Calendar date (year, month 1-12, day) of an instant in Africa/Tunis. */
function tunisDate(at: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Offset of Africa/Tunis from UTC at an instant, in minutes (read from Intl, not hard-coded). */
function tunisOffsetMinutes(at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000);
}

/** A Tunis wall-clock time ("11:00", n days after the Tunis date of `at`) as a UTC instant. */
export function tunisTimeToUtc(at: number, dayOffset: number, time: string): number {
  const { year, month, day } = tunisDate(at);
  const [hours, minutes] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day + dayOffset, hours ?? 0, minutes ?? 0);
  return guess - tunisOffsetMinutes(guess) * 60_000;
}

/** Pickup slots that start after `at`. A past slot is never listed. */
export function availableSlots(at: number): Slot[] {
  return PICKUP_WINDOWS.map((window) => {
    const start = tunisTimeToUtc(at, window.dayOffset, window.start);
    const end = tunisTimeToUtc(at, window.dayOffset, window.end);
    return {
      id: new Date(start).toISOString(),
      startUtc: new Date(start).toISOString(),
      endUtc: new Date(end).toISOString(),
      dayOffset: window.dayOffset,
    };
  }).filter((slot) => Date.parse(slot.startUtc) > at);
}

/** A slot is usable while it has not started. */
export function isSlotInFuture(
  slot: Pick<Slot, "startUtc"> | null | undefined,
  at: number,
): boolean {
  return slot != null && Date.parse(slot.startUtc) > at;
}
