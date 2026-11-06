import { describe, expect, it } from "vitest";
import { formatDate } from "./date";

describe("formatDate", () => {
  // Tunisia is UTC+1 all year (no daylight saving time).
  it("shows time in Africa/Tunis, not UTC", () => {
    const utc = "2026-11-04T23:30:00Z";
    expect(formatDate(utc, "fr", "time")).toBe("00\u00a0h\u00a030");
    expect(formatDate(utc, "en", "time")).toBe("00:30");
    expect(formatDate(utc, "ar", "time")).toBe("00:30");
  });

  it("writes the French time as 14 h 20 and keeps 14:20 in en and ar", () => {
    const utc = "2026-11-04T13:20:00Z"; // 14:20 in Tunis
    expect(formatDate(utc, "fr", "time")).toBe("14\u00a0h\u00a020");
    expect(formatDate(utc, "fr", "dateTime").endsWith("14\u00a0h\u00a020")).toBe(true);
    expect(formatDate(utc, "en", "time")).toBe("14:20");
    expect(formatDate(utc, "ar", "time")).toBe("14:20");
    expect(formatDate(utc, "fr", "date")).not.toContain("\u00a0h\u00a0");
  });

  it("rolls the date over with the time zone", () => {
    const utc = "2026-11-04T23:30:00Z"; // 5 November, 00:30 in Tunis
    expect(formatDate(utc, "fr")).toContain("5");
    expect(formatDate(utc, "fr")).toContain("2026");
    expect(formatDate(utc, "en")).toContain("5");
  });

  it("uses Latin digits in Arabic", () => {
    expect(formatDate("2026-11-04T10:00:00Z", "ar", "dateTime")).toMatch(/2026/);
    expect(formatDate("2026-11-04T10:00:00Z", "ar", "dateTime")).not.toMatch(/[٠-٩]/);
  });

  it("shows a month and year, in the Tunis time zone", () => {
    // 23:30 UTC on 31 October is 00:30 on 1 November in Tunis.
    expect(formatDate("2026-10-31T23:30:00Z", "fr", "month")).toBe("novembre 2026");
    expect(formatDate("2026-10-15T10:00:00Z", "en", "month")).toBe("October 2026");
    expect(formatDate("2026-10-15T10:00:00Z", "ar", "month")).toMatch(/2026/);
  });

  it("accepts Date and epoch milliseconds", () => {
    const ms = Date.UTC(2026, 10, 4, 10, 0, 0);
    expect(formatDate(new Date(ms), "fr", "time")).toBe("11\u00a0h\u00a000");
    expect(formatDate(ms, "fr", "time")).toBe("11\u00a0h\u00a000");
  });

  it("rejects invalid dates", () => {
    expect(() => formatDate("not a date", "fr")).toThrow(RangeError);
  });
});
