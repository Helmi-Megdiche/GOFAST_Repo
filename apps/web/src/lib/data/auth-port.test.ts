import { beforeEach, describe, expect, it } from "vitest";
import { createApiAuth } from "../api/auth";
import { createApiClient } from "../api/client";
import { setClock } from "../order/clock";
import { useMemoryStorage } from "../storage";
import { findByPhone } from "./accounts";
import { FIXTURE_ACCOUNTS, FIXTURE_PASSWORD } from "./fixtures/accounts";
import { authPort } from "./index";
import { createMockAuth } from "./mock-adapters";
import { mockCodeFor } from "./otp";
import type { AuthPort } from "./ports";
import { getSession } from "./session";

const T0 = Date.parse("2026-11-16T09:00:00Z");
const NEW_PHONE = "+216 55 123 456";
const NEW_PHONE_E164 = "+21655123456";

beforeEach(() => {
  useMemoryStorage();
  setClock(() => T0);
});

describe("adapter selection for auth (#20, PR 4a)", () => {
  it("defaults to the mock, with Google and the remember box", () => {
    for (const flag of ["", undefined]) {
      const port = authPort(flag);
      expect(port.kind).toBe("mock");
      expect(port.googleAvailable).toBe(true);
      expect(port.rememberMe).toBe(true);
    }
  });

  it("the auth flag selects the api adapter, with no Google and no remember box", () => {
    const port = authPort("auth");
    expect(port.kind).toBe("api");
    expect(port.googleAvailable).toBe(false);
    expect(port.rememberMe).toBe(false);
  });

  it("another domain alone leaves auth on the mock, and an unknown name fails", () => {
    expect(authPort("orders,pricing").kind).toBe("mock");
    expect(() => authPort("autth")).toThrow(/autth/);
  });

  it("both adapters satisfy one interface type", () => {
    const api = createApiClient({ baseUrl: "http://web.test" });
    const ports: AuthPort[] = [createMockAuth(), createApiAuth(api)];
    expect(ports.map((port) => port.kind)).toEqual(["mock", "api"]);
  });
});

describe("the mock auth adapter keeps today's behaviour", () => {
  const auth = createMockAuth();
  const account = FIXTURE_ACCOUNTS[0]!;

  it("signs in with the fixture password and writes the session", async () => {
    const result = await auth.signIn(account.phone, FIXTURE_PASSWORD);
    expect(result.status).toBe("ok");
    expect(getSession()?.accountId).toBe(account.id);
  });

  it("gives the same refusal for a wrong password and an unknown account", async () => {
    const wrong = await auth.signIn(account.phone, "wrong-password");
    const unknown = await auth.signIn("+216 55 999 999", FIXTURE_PASSWORD);
    expect(wrong).toEqual({ status: "invalidCredentials" });
    expect(unknown).toEqual(wrong);
    expect(getSession()).toBeNull();
  });

  it("verifies a code through the same port, with no proof id", async () => {
    await auth.sendCode(NEW_PHONE, "signUp");
    const code = mockCodeFor({ channel: "sms", value: NEW_PHONE }, "signUp")!;
    expect(await auth.verifyCode(NEW_PHONE, "signUp", "000000")).toMatchObject({ status: "wrong" });
    expect(await auth.verifyCode(NEW_PHONE, "signUp", code)).toEqual({ status: "ok" });
  });

  it("creates the account and the session after the code, and uses the proof once", async () => {
    await auth.sendCode(NEW_PHONE, "signUp");
    const code = mockCodeFor({ channel: "sms", value: NEW_PHONE }, "signUp")!;
    await auth.verifyCode(NEW_PHONE, "signUp", code);
    const input = {
      kind: "customer",
      name: "Test Client",
      phone: NEW_PHONE,
      password: "a-long-enough-password",
      locale: "ar",
    } as const;
    const result = await auth.signUp(input, undefined);
    expect(result.status).toBe("created");
    expect(findByPhone(NEW_PHONE_E164)?.locale).toBe("ar");
    expect(getSession()?.accountId).toBe(findByPhone(NEW_PHONE_E164)?.id);
    // the same phone again, verified once more (after the resend timer): taken
    setClock(() => T0 + 61_000);
    await auth.sendCode(NEW_PHONE, "signUp");
    await auth.verifyCode(
      NEW_PHONE,
      "signUp",
      mockCodeFor({ channel: "sms", value: NEW_PHONE }, "signUp")!,
    );
    expect(await auth.signUp(input, undefined)).toEqual({ status: "phoneTaken" });
  });

  it("refuses a sign-up that was not verified, and creates nothing", async () => {
    const result = await auth.signUp(
      {
        kind: "customer",
        name: "Test",
        phone: NEW_PHONE,
        password: "a-long-enough-password",
        locale: "fr",
      },
      undefined,
    );
    expect(result).toEqual({ status: "notVerified" });
    expect(findByPhone(NEW_PHONE_E164)).toBeNull();
  });

  it("resets a password only after the reset code, and a short one is refused", async () => {
    expect(await auth.resetPassword(NEW_PHONE, undefined, "a-long-enough-password")).toEqual({
      status: "notVerified",
    });
    await auth.sendCode(NEW_PHONE, "reset");
    await auth.verifyCode(
      NEW_PHONE,
      "reset",
      mockCodeFor({ channel: "sms", value: NEW_PHONE }, "reset")!,
    );
    expect(await auth.resetPassword(NEW_PHONE, undefined, "short")).toEqual({ status: "tooShort" });
    expect(await auth.resetPassword(NEW_PHONE, undefined, "a-long-enough-password")).toEqual({
      status: "ok",
    });
  });

  it("signs out, and refreshSession returns the stored session", async () => {
    await auth.signIn(account.phone, FIXTURE_PASSWORD);
    expect((await auth.refreshSession())?.accountId).toBe(account.id);
    await auth.signOut();
    expect(getSession()).toBeNull();
    expect(await auth.refreshSession()).toBeNull();
  });
});
