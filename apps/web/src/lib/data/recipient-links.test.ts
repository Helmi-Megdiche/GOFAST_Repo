import { beforeEach, describe, expect, it } from "vitest";
import { RECIPIENT_LINK_AFTER_DELIVERY_MS } from "../order/constants";
import { useMemoryStorage } from "../storage";
import { readTable } from "./mock-db";
import { RECIPIENT_LINKS } from "./order-model";
import { expireRecipientLink, mintRecipientLink, mintRecipientToken } from "./recipient-links";

beforeEach(() => {
  useMemoryStorage();
});

describe("mintRecipientToken", () => {
  it("gives 22 base64url characters from 16 bytes", () => {
    let asked = 0;
    const token = mintRecipientToken((n) => {
      asked = n;
      return Uint8Array.from({ length: n }, (_, i) => 250 - i);
    });
    expect(asked).toBe(16);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("is different on each call with real randomness", () => {
    expect(mintRecipientToken()).not.toBe(mintRecipientToken());
    expect(mintRecipientToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("never contains the tracking code", () => {
    const code = "FG-7K2M9QX4";
    for (let i = 0; i < 50; i++) {
      expect(mintRecipientToken().toUpperCase()).not.toContain(code);
    }
  });
});

describe("mintRecipientLink and expireRecipientLink", () => {
  it("stores the link by token with no expiry, then sets it 24 h after the end", () => {
    const token = mintRecipientLink("FG-TEST-0001", "ar");
    const row = readTable<{ orderCode: string; locale: string; expiresAt: string | null }>(
      RECIPIENT_LINKS,
    )[token];
    expect(row).toMatchObject({ orderCode: "FG-TEST-0001", locale: "ar", expiresAt: null });
    const at = Date.parse("2026-11-05T08:00:00Z");
    expireRecipientLink("FG-TEST-0001", at);
    expect(readTable<{ expiresAt: string }>(RECIPIENT_LINKS)[token]!.expiresAt).toBe(
      new Date(at + RECIPIENT_LINK_AFTER_DELIVERY_MS).toISOString(),
    );
  });
});
