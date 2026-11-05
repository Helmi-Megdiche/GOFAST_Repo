import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import {
  CODE_LOCK_MS,
  CODE_MAX_ATTEMPTS,
  CODE_RESEND_DELAY_MS,
  CODE_VALIDITY_MS,
} from "../order/constants";
import { useMemoryStorage } from "../storage";
import { FIXTURE_ACCOUNTS, FIXTURE_CODES } from "./fixtures/accounts";
import { isTargetVerified, mockCodeFor, sendCode, verifyCode } from "./otp";

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
    expect(await verifyCode(phone, "٤٨٢٦١٥")).toEqual({ status: "ok" });
    expect(isTargetVerified(phone, "order")).toBe(true);
    expect(isTargetVerified(phone, "signUp")).toBe(false);
  });

  it("counts wrong codes, then locks for 15 minutes after 5", async () => {
    await sendCode(phone, "order");
    for (let left = CODE_MAX_ATTEMPTS - 1; left > 0; left -= 1) {
      expect(await verifyCode(phone, "000000")).toEqual({ status: "wrong", attemptsLeft: left });
    }
    expect((await verifyCode(phone, "000000")).status).toBe("locked");
    expect((await verifyCode(phone, FIXTURE_CODES[0])).status).toBe("locked"); // even the right one
    clock = T0 + CODE_LOCK_MS;
    expect((await sendCode(phone, "order")).status).toBe("sent");
  });

  it("an expired code is refused (fake clock, 5 minutes)", async () => {
    await sendCode(phone, "order");
    clock = T0 + CODE_VALIDITY_MS;
    expect(await verifyCode(phone, FIXTURE_CODES[0])).toEqual({ status: "expired" });
  });

  it("a resend invalidates the previous code and does not reset the attempts", async () => {
    await sendCode(phone, "order");
    await verifyCode(phone, "000000");
    await verifyCode(phone, "111111");
    clock = T0 + CODE_RESEND_DELAY_MS;
    await sendCode(phone, "order");
    expect(await verifyCode(phone, FIXTURE_CODES[0])).toEqual({ status: "wrong", attemptsLeft: 2 });
    expect(await verifyCode(phone, FIXTURE_CODES[1])).toEqual({ status: "ok" });
  });

  it("a resend during a lock does not lift it", async () => {
    await sendCode(phone, "order");
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i += 1) await verifyCode(phone, "000000");
    clock = T0 + CODE_RESEND_DELAY_MS;
    expect((await sendCode(phone, "order")).status).toBe("tooMany");
  });

  it("there is nothing to verify before a code was sent", async () => {
    expect(await verifyCode(phone, "482615")).toEqual({ status: "noCode" });
  });
});
