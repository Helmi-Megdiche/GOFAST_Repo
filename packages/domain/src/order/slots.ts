import { DISPLAY_TIME_ZONE } from "@fastgo/i18n/format";

/** A pickup window in Tunis local time, `dayOffset` days after today. The caller passes the table. */
export type PickupWindow = { dayOffset: 0 | 1; start: string; end: string };

/** A pickup window, stored as UTC instants (CLAUDE.md: store UTC, show Africa/Tunis). */
export type Slot = { id: string; startUtc: string; endUtc: string };

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
export function availableSlots(at: number, windows: readonly PickupWindow[]): Slot[] {
  return windows
    .map((window) => {
      const start = tunisTimeToUtc(at, window.dayOffset, window.start);
      const end = tunisTimeToUtc(at, window.dayOffset, window.end);
      return {
        id: new Date(start).toISOString(),
        startUtc: new Date(start).toISOString(),
        endUtc: new Date(end).toISOString(),
      };
    })
    .filter((slot) => Date.parse(slot.startUtc) > at);
}

/** A slot is usable while it has not started. */
export function isSlotInFuture(
  slot: Pick<Slot, "startUtc"> | null | undefined,
  at: number,
): boolean {
  return slot != null && Date.parse(slot.startUtc) > at;
}

/**
 * "today" or "tomorrow" for the label of a slot, from its start instant and the Tunis date of
 * `at` (never a stored offset: a slot picked for tomorrow reads today on the next day).
 */
export function slotDay(slot: Pick<Slot, "startUtc">, at: number): "today" | "tomorrow" | "other" {
  const day = (instant: number) => {
    const { year, month, day } = tunisDate(instant);
    return Date.UTC(year, month - 1, day) / 86_400_000;
  };
  const offset = day(Date.parse(slot.startUtc)) - day(at);
  return offset === 0 ? "today" : offset === 1 ? "tomorrow" : "other";
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * True when the string is a real instant the database can store: PostgreSQL has no year 0000 and refuses a day that does not exist
 * (JavaScript rolls 30 February over to March, so Date.parse alone says yes). The date-time of the contract allows year 0000, and a
 * cursor is only matched by a pattern: without this such a value would reach the database and be a 500.
 */
export function isStorableTimestamp(value: string): boolean {
  const m = TIMESTAMP.exec(value);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const daysInMonth = new Date(Date.UTC(2000 + (year % 400), month, 0)).getUTCDate(); // same leap-year rule as the real year
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return false;
  return Number.isFinite(Date.parse(value));
}

export type SlotFieldError = { name: "service.slot" | "sender.slot"; reason: "slotInvalid" };
type WindowIn = { start_at: string; end_at: string };

/**
 * The slots of an order, checked before anything is written (the CHECKs of the database are only the last net):
 * the delivery slot exists for the `scheduled` service and for no other; every window ends after it starts; the
 * pickup window has not ended at `at`. One error per wrong field, so the form can show them all.
 */
export function checkOrderSlots(
  order: { serviceCode: string; serviceSlot: WindowIn | null | undefined; pickupSlot: WindowIn },
  at: number,
): SlotFieldError[] {
  const wrong: SlotFieldError[] = [];
  // false for a date that does not parse, or that the database cannot store
  const endsAfterStart = (w: WindowIn) => isStorableTimestamp(w.start_at) && isStorableTimestamp(w.end_at) && Date.parse(w.end_at) > Date.parse(w.start_at);
  const service = order.serviceSlot ?? null;
  if (order.serviceCode === "scheduled" ? service === null || !endsAfterStart(service) : service !== null)
    wrong.push({ name: "service.slot", reason: "slotInvalid" });
  if (!endsAfterStart(order.pickupSlot) || !(Date.parse(order.pickupSlot.end_at) > at))
    wrong.push({ name: "sender.slot", reason: "slotInvalid" });
  return wrong;
}
