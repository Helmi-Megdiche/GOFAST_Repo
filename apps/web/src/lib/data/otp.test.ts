import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import {
  CODE_LOCK_MS,
  CODE_MAX_ATTEMPTS,
  CODE_RESEND_DELAY_MS,
  CODE_MAX_SENDS,
  CODE_VALIDITY_MS,
  CODE_VERIFIED_WINDOW_MS,
} from "@fastgo/domain";
import { useMemoryStorage } from "../storage";
import { FIXTURE_ACCOUNTS, FIXTURE_CODES } from "./fixtures/accounts";
import { consumeVerification, isTargetVerified, mockCodeFor, sendCode, verifyCode } from "./otp";

const T0 = Date.parse("2026-11-04T10:00:00Z");
let clock = T0;
const phone = { channel: "sms", value: "+216 20 000 000" } as const;

beforeEach(() => {
  useMemoryStorage();
  clock = T0;
  setClock(() => clock);
});

describe("sendCode (R102)", () => {
  it("answers the same for a known and an unknown phone (no enumeration)", async () => {
    const known = await sendCode({ channel: "sms", value: FIXTURE_ACCOUNTS[0]!.phone }, "order");
    const unknown = await sendCode({ channel: "sms", value: "+216 55 123 456" }, "order");
    expect(known).toEqual(unknown);
    expect(known.status).toBe("sent");
  });

  it("refuses a resend before the timer, then accepts it", async () => {
    await sendCode(phone, "order");
    clock = T0 + CODE_RESEND_DELAY_MS - 1;
    expect((await sendCode(phone, "order")).status).toBe("tooSoon");
    clock = T0 + CODE_RESEND_DELAY_MS;
    expect((await sendCode(phone, "order")).status).toBe("sent");
  });

  it("stops after 5 sends in 15 minutes, for known and unknown phones alike", async () => {
    for (const value of [FIXTURE_ACCOUNTS[0]!.phone, "+216 55 123 456"]) {
      clock = T0;
      for (let i = 0; i < 5; i += 1) {
        expect((await sendCode({ channel: "sms", value }, "order")).status).toBe("sent");
        clock += CODE_RESEND_DELAY_MS;
      }
      expect((await sendCode({ channel: "sms", value }, "order")).status).toBe("tooMany");
    }
  });

  it("refuses an invalid phone or e-mail", async () => {
    expect((await sendCode({ channel: "sms", value: "123" }, "order")).status).toBe(
      "invalidTarget",
    );
    expect((await sendCode({ channel: "email", value: "nope" }, "googleEmail")).status).toBe(
      "invalidTarget",
    );
  });
});

describe("verifyCode", () => {
  it("accepts the right code (fixture, mock only), with Arabic-Indic digits too", async () => {
    await sendCode(phone, "order");
    expect(mockCodeFor(phone)).toBe(FIXTURE_CODES[0]);
    expect(await verifyCode(phone, "٤٨٢٦١٥", "order")).toEqual({ status: "ok" });
    expect(isTargetVerified(phone, "order")).toBe(true);
    expect(isTargetVerified(phone, "signUp")).toBe(false);
  });

  it("counts wrong codes, then locks for 15 minutes after 5", async () => {
    await sendCode(phone, "order");
    for (let left = CODE_MAX_ATTEMPTS - 1; left > 0; left -= 1) {
      expect(await verifyCode(phone, "000000", "order")).toEqual({
        status: "wrong",
        attemptsLeft: left,
      });
    }
    expect((await verifyCode(phone, "000000", "order")).status).toBe("locked");
    expect((await verifyCode(phone, FIXTURE_CODES[0], "order")).status).toBe("locked"); // even the right one
    clock = T0 + CODE_LOCK_MS;
    expect((await sendCode(phone, "order")).status).toBe("sent");
  });

  it("an expired code is refused (fake clock, 5 minutes)", async () => {
    await sendCode(phone, "order");
    clock = T0 + CODE_VALIDITY_MS;
    expect(await verifyCode(phone, FIXTURE_CODES[0], "order")).toEqual({ status: "expired" });
  });

  it("a resend invalidates the previous code and does not reset the attempts", async () => {
    await sendCode(phone, "order");
    await verifyCode(phone, "000000", "order");
    await verifyCode(phone, "111111", "order");
    clock = T0 + CODE_RESEND_DELAY_MS;
    await sendCode(phone, "order");
    expect(await verifyCode(phone, FIXTURE_CODES[0], "order")).toEqual({
      status: "wrong",
      attemptsLeft: 2,
    });
    expect(await verifyCode(phone, FIXTURE_CODES[1], "order")).toEqual({ status: "ok" });
  });

  it("a resend during a lock does not lift it", async () => {
    await sendCode(phone, "order");
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i += 1) await verifyCode(phone, "000000", "order");
    clock = T0 + CODE_RESEND_DELAY_MS;
    expect((await sendCode(phone, "order")).status).toBe("tooMany");
  });

  it("there is nothing to verify before a code was sent", async () => {
    expect(await verifyCode(phone, "482615", "order")).toEqual({ status: "noCode" });
  });
});

describe("one code per target and purpose (PR #5 review, item 16)", () => {
  it("a reset right after a sign-up code gets its own code, verified for the reset", async () => {
    expect((await sendCode(phone, "signUp")).status).toBe("sent");
    // Before: "tooSoon", the sign-up code stayed the only one and verified as "signUp".
    expect((await sendCode(phone, "reset")).status).toBe("sent");
    expect(await verifyCode(phone, mockCodeFor(phone)!, "reset")).toEqual({ status: "ok" });
    expect(isTargetVerified(phone, "reset")).toBe(true);
    expect(isTargetVerified(phone, "signUp")).toBe(false);
  });

  it("the resend delay applies per purpose", async () => {
    await sendCode(phone, "reset");
    expect((await sendCode(phone, "reset")).status).toBe("tooSoon");
  });

  it("the send limit and the lock still count every purpose of the target together (R102)", async () => {
    const purposes = ["order", "signUp", "reset", "googlePhone", "order"] as const;
    for (const purpose of purposes) {
      expect((await sendCode(phone, purpose)).status).toBe("sent");
      clock += CODE_RESEND_DELAY_MS;
    }
    expect(purposes).toHaveLength(CODE_MAX_SENDS);
    expect((await sendCode(phone, "reset")).status).toBe("tooMany");

    // An hour later the earlier state is out of every window and removed (R105): a live code for each
    // purpose is needed again, and the lock then counts both together.
    clock = T0 + 60 * 60_000;
    await sendCode(phone, "order");
    await sendCode(phone, "signUp");
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i += 1) await verifyCode(phone, "000000", "order");
    expect((await sendCode(phone, "reset")).status).toBe("tooMany");
    expect((await verifyCode(phone, "000000", "signUp")).status).toBe("locked");
  });

  it("a code verified for one purpose does not verify another one", async () => {
    await sendCode(phone, "signUp");
    expect(await verifyCode(phone, FIXTURE_CODES[0], "reset")).toEqual({ status: "noCode" });
    expect(isTargetVerified(phone, "reset")).toBe(false);
  });
});

describe("an already verified code (PR #5 review, item 16)", () => {
  it("typed again answers ok and burns no attempt", async () => {
    await sendCode(phone, "order");
    expect(await verifyCode(phone, FIXTURE_CODES[0], "order")).toEqual({ status: "ok" });
    expect(await verifyCode(phone, FIXTURE_CODES[0], "order")).toEqual({ status: "ok" });
    // No attempt was used: 4 wrong codes still leave one.
    for (let left = CODE_MAX_ATTEMPTS - 1; left > 0; left -= 1) {
      expect(await verifyCode(phone, "000000", "order")).toEqual({
        status: "wrong",
        attemptsLeft: left,
      });
    }
  });

  it("is no longer ok once used", async () => {
    await sendCode(phone, "order");
    await verifyCode(phone, FIXTURE_CODES[0], "order");
    consumeVerification(phone, "order");
    expect((await verifyCode(phone, FIXTURE_CODES[0], "order")).status).not.toBe("ok");
    expect(isTargetVerified(phone, "order")).toBe(false);
  });

  it("counts as verified only for a short window after verifiedAt (unsourced, constants.ts)", async () => {
    await sendCode(phone, "order");
    clock = T0 + 1000;
    await verifyCode(phone, FIXTURE_CODES[0], "order");
    clock = T0 + 1000 + CODE_VERIFIED_WINDOW_MS - 1;
    expect(isTargetVerified(phone, "order")).toBe(true);
    clock = T0 + 1000 + CODE_VERIFIED_WINDOW_MS;
    expect(isTargetVerified(phone, "order")).toBe(false);
    expect((await verifyCode(phone, FIXTURE_CODES[0], "order")).status).not.toBe("ok");
  });
});
