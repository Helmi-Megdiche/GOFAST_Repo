import { describe, expect, it } from "vitest";
import { availableSlots, isSlotInFuture, tunisTimeToUtc } from "./slots";

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
    expect(evening.every((slot) => slot.dayOffset === 1)).toBe(true);
    expect(evening).toHaveLength(4);
  });

  it("a chosen slot becomes past when its start time comes", () => {
    const [slot] = availableSlots(MORNING);
    expect(isSlotInFuture(slot, MORNING)).toBe(true);
    expect(isSlotInFuture(slot, Date.parse(slot!.startUtc))).toBe(false);
    expect(isSlotInFuture(null, MORNING)).toBe(false);
  });
});
