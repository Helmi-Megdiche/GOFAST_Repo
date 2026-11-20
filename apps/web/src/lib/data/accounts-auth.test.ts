import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { useMemoryStorage } from "../storage";
import { GOOGLE_PENDING_MAX_AGE_MS } from "@fastgo/domain";
import {
  attachPhone,
  claimOrderPhone,
  findById,
  createAccount,
  createLightAccount,
  isVerifiedPhoneForSession,
  sessionFor,
} from "./accounts";
import { requestPasswordReset, setNewPassword, signIn } from "./auth";
import { FIXTURE_ACCOUNTS, FIXTURE_CODES, FIXTURE_PASSWORD } from "./fixtures/accounts";
import { googleSignIn, pendingGoogle } from "./google";
import { sendCode, verifyCode } from "./otp";
import { canPayOnAccount, getSession, setSession, SESSION_KEY, signOut } from "./session";

const T0 = Date.parse("2026-11-04T10:00:00Z");
const [customer, merchantOk, merchantPending] = FIXTURE_ACCOUNTS as [
  (typeof FIXTURE_ACCOUNTS)[0],
  (typeof FIXTURE_ACCOUNTS)[0],
  (typeof FIXTURE_ACCOUNTS)[0],
];
let store: Map<string, string>;
let clock = T0;

beforeEach(() => {
  store = useMemoryStorage();
  clock = T0;
  setClock(() => clock);
});

describe("accounts (R101)", () => {
  it("refuses a second account with the same phone, whatever its format", () => {
    expect(createLightAccount({ name: "Test", phone: "+216 55 111 222" }).status).toBe("created");
    expect(createLightAccount({ name: "Other", phone: "0021655111222" }).status).toBe("phoneTaken");
    expect(createLightAccount({ name: "Fixture", phone: customer.phone }).status).toBe(
      "phoneTaken",
    );
  });

  it("refuses a second account with the same e-mail", () => {
    const result = createAccount({
      kind: "customer",
      name: "X",
      phone: "+216 55 111 333",
      email: "SAMI.T@example.tn",
    });
    expect(result.status).toBe("emailTaken");
  });

  it("never stores a password", () => {
    createAccount({ kind: "customer", name: "X", phone: "+216 55 111 444", email: "x@example.tn" });
    expect([...store.values()].join("")).not.toMatch(/password|motdepasse/i);
  });
});

describe("session", () => {
  it("keeps only id, user, role, kind, contract, verified flag and masked phone", () => {
    setSession(sessionFor({ ...customer, google: false }));
    expect(Object.keys(JSON.parse(store.get(SESSION_KEY)!)).sort()).toEqual([
      "accountId",
      "contract",
      "kind",
      "maskedPhone",
      "phoneVerified",
      "role",
      "userId",
    ]);
    expect(store.get(SESSION_KEY)).not.toContain(customer.phone);
  });

  it("R104: only a merchant with a validated contract can pay on account", () => {
    expect(canPayOnAccount(null)).toBe(false);
    expect(canPayOnAccount(sessionFor({ ...customer, google: false }))).toBe(false);
    expect(canPayOnAccount(sessionFor({ ...merchantPending, google: false }))).toBe(false);
    expect(canPayOnAccount(sessionFor({ ...merchantOk, google: false }))).toBe(true);
  });

  it("skips the code only for the FULL phone of the signed-in account, never the masked one", () => {
    expect(isVerifiedPhoneForSession(customer.phone)).toBe(false); // nobody signed in
    setSession(sessionFor({ ...customer, google: false }));
    expect(isVerifiedPhoneForSession("+216 98 000 001")).toBe(true);
    // +216 98 ••• 001 too, but different hidden digits
    expect(isVerifiedPhoneForSession("+216 98 999 001")).toBe(false);
    expect(getSession()?.maskedPhone).toBe("+216 98 ••• 001");
  });
});

describe("sign-in (ESP-01, decision 16)", () => {
  it("signs a fixture account in by phone or e-mail", async () => {
    expect((await signIn("+216 98 000 001", FIXTURE_PASSWORD)).status).toBe("ok");
    expect((await signIn(merchantOk.email!, FIXTURE_PASSWORD)).status).toBe("ok");
    expect(getSession()?.contract).toBe("validated");
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    const wrongPassword = await signIn(customer.phone, "not-the-password");
    const unknown = await signIn("+216 55 999 999", FIXTURE_PASSWORD);
    expect(wrongPassword).toEqual(unknown);
    expect(unknown).toEqual({ status: "invalidCredentials" });
  });

  it("'mot de passe oublié' answers the same whether or not the phone has an account", async () => {
    expect(await requestPasswordReset(customer.phone)).toEqual(
      await requestPasswordReset("+216 55 999 999"),
    );
  });

  it("new password needs the reset code first, and 10 characters", async () => {
    expect(await setNewPassword(customer.phone, "long-enough-1")).toEqual({
      status: "notVerified",
    });
    await requestPasswordReset(customer.phone);
    await verifyCode({ channel: "sms", value: customer.phone }, FIXTURE_CODES[0], "reset");
    expect(await setNewPassword(customer.phone, "short")).toEqual({ status: "tooShort" });
    expect(await setNewPassword(customer.phone, "long-enough-1")).toEqual({ status: "ok" });
    expect(await setNewPassword(customer.phone, "long-enough-1")).toEqual({
      status: "notVerified",
    }); // used once
  });

  it("a sign-up code is not a reset code", async () => {
    await sendCode({ channel: "sms", value: customer.phone }, "signUp");
    await verifyCode({ channel: "sms", value: customer.phone }, FIXTURE_CODES[0], "signUp");
    expect(await setNewPassword(customer.phone, "long-enough-1")).toEqual({
      status: "notVerified",
    });
  });
});

describe("Google (R103)", () => {
  it("a new e-mail goes to the phone step", async () => {
    expect((await googleSignIn("google-new")).status).toBe("newUser");
    expect(pendingGoogle()).toMatchObject({ known: false, emailVerified: false });
  });

  it("a known e-mail needs an e-mail code first, and the phone is still required", async () => {
    const result = await googleSignIn("google-known");
    expect(result).toMatchObject({ status: "knownEmail", maskedEmail: "s•••@example.tn" });
    expect(pendingGoogle()).toMatchObject({ known: true, emailVerified: false });
  });
});

describe("pending Google sign-in (PR #5 review, item 14)", () => {
  it("expires after GOOGLE_PENDING_MAX_AGE_MS (unsourced, constants.ts)", async () => {
    await googleSignIn("google-new");
    clock = T0 + GOOGLE_PENDING_MAX_AGE_MS - 1;
    expect(pendingGoogle()).not.toBeNull();
    clock = T0 + GOOGLE_PENDING_MAX_AGE_MS;
    expect(pendingGoogle()).toBeNull();
  });

  it("is cleared on sign-out", async () => {
    await googleSignIn("google-known");
    signOut();
    expect(pendingGoogle()).toBeNull();
  });

  it("is cleared on sign-in", async () => {
    await googleSignIn("google-known");
    expect((await signIn(customer.phone, FIXTURE_PASSWORD)).status).toBe("ok");
    expect(pendingGoogle()).toBeNull();
  });

  it("an entry without its start time is not trusted", async () => {
    store.set(
      "fg.mock.google.pending",
      JSON.stringify({ profileId: "google-new", kind: "customer" }),
    );
    expect(pendingGoogle()).toBeNull();
  });
});

describe("attachPhone (PR #5 review, item 15)", () => {
  it("an account that has a phone accepts only that same phone", () => {
    expect(attachPhone(customer.id, "+216 55 123 456")).toEqual({ status: "phoneMismatch" });
    expect(findById(customer.id)?.phone).toBe(customer.phone);
    expect(attachPhone(customer.id, "+216 98 000 001").status).toBe("created");
    expect(findById(customer.id)?.phone).toBe(customer.phone);
  });
});

describe("after the order code (CMD-03)", () => {
  it("a guest gets a light account and is signed in", () => {
    expect(claimOrderPhone({ name: "Yasmine K.", phone: "+216 20 000 000" })).toBe("ok");
    expect(getSession()?.kind).toBe("customer");
    expect(isVerifiedPhoneForSession("+216 20 000 000")).toBe(true);
  });

  it("a signed-in merchant who checks another phone keeps the session (R104)", () => {
    setSession(sessionFor({ ...merchantOk, google: false }));
    expect(claimOrderPhone({ name: "Yasmine K.", phone: "+216 20 000 000" })).toBe("ok");
    expect(getSession()?.accountId).toBe(merchantOk.id);
    expect(canPayOnAccount(getSession())).toBe(true);
    expect(createLightAccount({ name: "Other", phone: "+216 20 000 000" }).status).toBe("created");
  });

  it("a phone of another account is refused after the right code (R101)", () => {
    expect(claimOrderPhone({ name: "Yasmine K.", phone: customer.phone })).toBe("accountExists");
    expect(getSession()).toBeNull();
    setSession(sessionFor({ ...customer, google: false }));
    expect(claimOrderPhone({ name: "Sami T.", phone: customer.phone })).toBe("ok");
  });
});
