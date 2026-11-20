import { describe, expect, it } from "vitest";
import {
  availableSlots as availableSlotsWith,
  checkOrderSlots,
  isStorableTimestamp,
  isSlotInFuture,
  slotDay,
  tunisTimeToUtc,
  type PickupWindow,
} from "./slots";

// The example windows of the web app (decision 7), copied: the rule takes the table as an argument.
const WINDOWS: PickupWindow[] = [
  { dayOffset: 0, start: "09:00", end: "11:00" },
  { dayOffset: 0, start: "11:00", end: "13:00" },
  { dayOffset: 0, start: "14:00", end: "16:00" },
  { dayOffset: 0, start: "16:00", end: "18:00" },
  { dayOffset: 1, start: "09:00", end: "11:00" },
  { dayOffset: 1, start: "11:00", end: "13:00" },
  { dayOffset: 1, start: "14:00", end: "16:00" },
  { dayOffset: 1, start: "16:00", end: "18:00" },
];
const availableSlots = (at: number) => availableSlotsWith(at, WINDOWS);

// 4 November 2026, 09:30 in Tunis (UTC+1).
const MORNING = Date.parse("2026-11-04T08:30:00Z");

describe("pickup slots", () => {
  it("stores Tunis windows as UTC instants", () => {
    expect(new Date(tunisTimeToUtc(MORNING, 0, "11:00")).toISOString()).toBe(
      "2026-11-04T10:00:00.000Z",
    );
    expect(new Date(tunisTimeToUtc(MORNING, 1, "09:00")).toISOString()).toBe(
      "2026-11-05T08:00:00.000Z",
    );
  });

  it("uses the Tunis date, not the UTC date, just after midnight in Tunis", () => {
    const justAfterMidnight = Date.parse("2026-11-04T23:30:00Z"); // 5 Nov, 00:30 in Tunis
    expect(new Date(tunisTimeToUtc(justAfterMidnight, 0, "09:00")).toISOString()).toBe(
      "2026-11-05T08:00:00.000Z",
    );
  });

  it("never lists a slot that has started (fake clock)", () => {
    const morning = availableSlots(MORNING).map((slot) => slot.startUtc);
    expect(morning[0]).toBe("2026-11-04T10:00:00.000Z"); // 09:00 already started, 11:00 is first
    expect(morning).toHaveLength(7);

    const evening = availableSlots(Date.parse("2026-11-04T17:30:00Z")); // 18:30 in Tunis
    expect(evening.every((slot) => slot.startUtc.startsWith("2026-11-05"))).toBe(true);
    expect(evening).toHaveLength(4);
  });

  it("a chosen slot becomes past when its start time comes", () => {
    const [slot] = availableSlots(MORNING);
    expect(isSlotInFuture(slot, MORNING)).toBe(true);
    expect(isSlotInFuture(slot, Date.parse(slot!.startUtc))).toBe(false);
    expect(isSlotInFuture(null, MORNING)).toBe(false);
  });
});

describe("slot day label", () => {
  it("is computed from the instant in Tunis, so tomorrow's slot reads today the next day", () => {
    const tomorrow = availableSlots(MORNING).find((slot) =>
      slot.startUtc.startsWith("2026-11-05"),
    )!;
    expect(slotDay(tomorrow, MORNING)).toBe("tomorrow");
    expect(slotDay(tomorrow, Date.parse("2026-11-05T07:00:00Z"))).toBe("today");
    // 5 Nov 00:30 in Tunis is still 4 Nov in UTC.
    expect(slotDay(tomorrow, Date.parse("2026-11-04T23:30:00Z"))).toBe("today");
    expect(slotDay(tomorrow, Date.parse("2026-11-03T08:30:00Z"))).toBe("other");
  });
});

// GH-22 R503 R504: the slots of an order, refused before anything is written (a CHECK of the database never has to).
describe("checkOrderSlots: the pickup window and the delivery slot of an order", () => {
  const AT = Date.UTC(2026, 10, 20, 10, 0);
  const iso = (ms: number) => new Date(ms).toISOString();
  const win = (fromH: number, toH: number) => ({ start_at: iso(AT + fromH * 3_600_000), end_at: iso(AT + toH * 3_600_000) });
  const input = (over: Partial<Parameters<typeof checkOrderSlots>[0]> = {}) => ({
    serviceCode: "standard",
    serviceSlot: null,
    pickupSlot: win(24, 26),
    ...over,
  });

  it("accepts a standard order with a future pickup window, and a scheduled one with its delivery slot", () => {
    expect(checkOrderSlots(input(), AT)).toEqual([]);
    expect(checkOrderSlots(input({ serviceCode: "scheduled", serviceSlot: win(48, 50) }), AT)).toEqual([]);
  });

  it("scheduled without a delivery slot is refused on service.slot", () => {
    expect(checkOrderSlots(input({ serviceCode: "scheduled" }), AT)).toEqual([{ name: "service.slot", reason: "slotInvalid" }]);
  });

  it("a delivery slot with any other service code is refused on service.slot", () => {
    for (const serviceCode of ["standard", "express"])
      expect(checkOrderSlots(input({ serviceCode, serviceSlot: win(48, 50) }), AT), serviceCode).toEqual([{ name: "service.slot", reason: "slotInvalid" }]);
  });

  it("a window that ends at or before its start is refused, for the delivery slot and for the pickup window", () => {
    expect(checkOrderSlots(input({ serviceCode: "scheduled", serviceSlot: win(50, 50) }), AT)).toEqual([{ name: "service.slot", reason: "slotInvalid" }]);
    expect(checkOrderSlots(input({ serviceCode: "scheduled", serviceSlot: win(50, 49) }), AT)).toEqual([{ name: "service.slot", reason: "slotInvalid" }]);
    expect(checkOrderSlots(input({ pickupSlot: win(26, 26) }), AT)).toEqual([{ name: "sender.slot", reason: "slotInvalid" }]);
    expect(checkOrderSlots(input({ pickupSlot: win(26, 24) }), AT)).toEqual([{ name: "sender.slot", reason: "slotInvalid" }]);
  });

  it("a pickup window that has already ended is refused; one that is running (started, not ended) is not", () => {
    expect(checkOrderSlots(input({ pickupSlot: win(-3, -1) }), AT)).toEqual([{ name: "sender.slot", reason: "slotInvalid" }]);
    expect(checkOrderSlots(input({ pickupSlot: win(-1, 0) }), AT)).toEqual([{ name: "sender.slot", reason: "slotInvalid" }]); // end == now
    expect(checkOrderSlots(input({ pickupSlot: win(-1, 1) }), AT)).toEqual([]);
  });

  it("says every wrong slot at once, and a date that does not parse is wrong", () => {
    expect(checkOrderSlots(input({ serviceSlot: win(48, 50), pickupSlot: win(26, 24) }), AT)).toEqual([
      { name: "service.slot", reason: "slotInvalid" },
      { name: "sender.slot", reason: "slotInvalid" },
    ]);
    expect(checkOrderSlots(input({ pickupSlot: { start_at: "nope", end_at: "nope" } }), AT)).toEqual([{ name: "sender.slot", reason: "slotInvalid" }]);
  });
});

// GH-22 RV-22: an instant the database cannot store (PostgreSQL has no year 0000) is refused before it reaches it.
describe("isStorableTimestamp and the slots: the database's range", () => {
  it("year 0000, a month 13 and a day that does not exist are not storable; year 0001 and a normal date are", () => {
    for (const bad of ["0000-01-01T00:00:00.000Z", "2026-13-01T00:00:00Z", "2026-02-30T00:00:00Z", "nope", ""]) expect(isStorableTimestamp(bad), bad).toBe(false);
    for (const good of ["0001-01-01T00:00:00.000Z", "2026-11-20T10:00:00.000Z", "2026-11-20T10:00:00.123456Z"]) expect(isStorableTimestamp(good), good).toBe(true);
  });
  it("a window that starts in year 0000 is slotInvalid on sender.slot, even when it ends in the future", () => {
    const AT = Date.UTC(2026, 10, 20, 10);
    const slot = { start_at: "0000-01-01T00:00:00.000Z", end_at: new Date(AT + 26 * 3_600_000).toISOString() };
    expect(checkOrderSlots({ serviceCode: "standard", serviceSlot: null, pickupSlot: slot }, AT)).toEqual([{ name: "sender.slot", reason: "slotInvalid" }]);
    expect(checkOrderSlots({ serviceCode: "scheduled", serviceSlot: slot, pickupSlot: { start_at: new Date(AT + 3_600_000).toISOString(), end_at: slot.end_at } }, AT)).toEqual([{ name: "service.slot", reason: "slotInvalid" }]);
  });
});
