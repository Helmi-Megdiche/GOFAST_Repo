import { describe, expect, it } from "vitest";
import { Keys, newSessionId, sessionKeyOf, sixDigitCode } from "./crypto.ts";

const secret = "x".repeat(32);

describe("Keys (HMAC with AUTH_SECRET)", () => {
  const keys = new Keys(secret);
  it("is stable, depends on the purpose and never contains the value", () => {
    const a = keys.mac("phone", "+21620000001");
    expect(a).toBe(keys.mac("phone", "+21620000001"));
    expect(a).not.toBe(keys.mac("identifier", "+21620000001"));
    expect(a).not.toContain("21620000001");
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("depends on the secret", () => {
    expect(new Keys("y".repeat(32)).mac("phone", "a")).not.toBe(keys.mac("phone", "a"));
  });
  it("refuses a short secret", () => {
    expect(() => new Keys("short")).toThrow();
  });
});

describe("session ids and codes", () => {
  it("makes a fresh 256-bit id and stores only its hash", () => {
    const a = newSessionId();
    expect(a).not.toBe(newSessionId());
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionKeyOf(a)).not.toContain(a);
    expect(sessionKeyOf(a)).toBe(sessionKeyOf(a));
  });
  it("makes a 6-digit code, zero padded", () => {
    for (let i = 0; i < 200; i++) expect(sixDigitCode(6)).toMatch(/^[0-9]{6}$/);
  });
});
