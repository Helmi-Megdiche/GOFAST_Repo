import { describe, expect, it } from "vitest";
import { formatDate } from "./date";

describe("formatDate", () => {
  // Tunisia is UTC+1 all year (no daylight saving time).
  it("shows time in Africa/Tunis, not UTC", () => {
    const utc = "2026-11-04T23:30:00Z";
    expect(formatDate(utc, "fr", "time")).toBe("00:30");
    expect(formatDate(utc, "en", "time")).toBe("00:30");
    expect(formatDate(utc, "ar", "time")).toBe("00:30");
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

  it("accepts Date and epoch milliseconds", () => {
    const ms = Date.UTC(2026, 10, 4, 10, 0, 0);
    expect(formatDate(new Date(ms), "fr", "time")).toBe("11:00");
    expect(formatDate(ms, "fr", "time")).toBe("11:00");
  });

  it("rejects invalid dates", () => {
    expect(() => formatDate("not a date", "fr")).toThrow(RangeError);
  });
});
