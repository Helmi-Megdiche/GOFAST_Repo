import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { CODE_VERIFIED_WINDOW_MS } from "../order/constants";
import { useMemoryStorage } from "../storage";
import { createAccount, findByEmail, findById, sessionFor } from "./accounts";
import { listAccountOrders } from "./account-orders";
import { signIn } from "./auth";
import { FIXTURE_CODES, FIXTURE_PASSWORD } from "./fixtures/accounts";
import { sendCode, verifyCode } from "./otp";
import {
  attachEmail,
  getProfile,
  saveLocaleIfSignedIn,
  setAccountLocale,
  setNotifications,
  unlinkGoogle,
  updateName,
} from "./profile";
import { getSession, setSession, signOut } from "./session";

const T0 = Date.parse("2026-11-04T10:00:00Z");
let clock = T0;
const sami = () => sessionFor(findById("acc-customer")!);
const lina = () => sessionFor(findById("acc-customer-empty")!);

let memory: Map<string, string>;
beforeEach(() => {
  memory = useMemoryStorage();
  clock = T0;
  setClock(() => clock);
});

describe("profile (ESP-02, C09)", () => {
  it("reads the account's own details, with the default preferences (offers off)", async () => {
    expect(await getProfile(sami())).toMatchObject({
      name: "Sami T.",
      phone: "+21698000001",
      email: "sami.t@example.tn",
      locale: "fr",
      google: false,
      notifications: { sms: true, email: true, offers: false },
    });
  });

  it("changes the name only, and refuses an empty one", async () => {
    expect(await updateName(sami(), "  Sami Trabelsi ")).toEqual({ status: "ok" });
    expect(findById("acc-customer")?.name).toBe("Sami Trabelsi");
    expect(await updateName(sami(), "   ")).toEqual({ status: "invalidName" });
    expect(findById("acc-customer")?.name).toBe("Sami Trabelsi");
    expect(findById("acc-customer")?.phone).toBe("+21698000001");
  });

  it("saves notification preferences without touching anything else", async () => {
    await setNotifications(sami(), { offers: true });
    expect((await getProfile(sami())).notifications).toEqual({
      sms: true,
      email: true,
      offers: true,
    });
  });

  it("unlinking Google keeps the phone (R103)", async () => {
    const created = createAccount({
      kind: "customer",
      name: "Amel B.",
      phone: "+21650000000",
      email: "amel.b@example.tn",
      google: true,
    });
    if (created.status !== "created") throw new Error("not created");
    const session = sessionFor(created.account);
    expect((await getProfile(session)).google).toBe(true);
    expect(await unlinkGoogle(session)).toEqual({ status: "ok" });
    expect(findById(created.account.id)).toMatchObject({ google: false, phone: "+21650000000" });
  });
});

describe("language (R902)", () => {
  it("is saved on the account, applied at the next sign-in, and changes nothing else", async () => {
    const session = sami();
    const orderBefore = JSON.stringify(listAccountOrders(session));
    const prefsBefore = (await getProfile(session)).notifications;
    expect(await setAccountLocale(session, "ar")).toEqual({ status: "ok" });
    expect(findById("acc-customer")?.locale).toBe("ar");
    setSession(session);
    signOut();
    const again = await signIn("+216 98 000 001", FIXTURE_PASSWORD);
    expect(again).toMatchObject({ status: "ok", locale: "ar" });
    // recipientLocale of every order, and the notification preferences, stay as they were.
    expect(JSON.stringify(listAccountOrders(session))).toBe(orderBefore);
    expect((await getProfile(session)).notifications).toEqual(prefsBefore);
  });

  it("the site switcher saves the language when signed in, exactly like C09", async () => {
    setSession(sami());
    await saveLocaleIfSignedIn("en");
    expect(findById("acc-customer")?.locale).toBe("en");
  });

  it("the site switcher saves nothing when signed out", async () => {
    expect(getSession()).toBeNull();
    await saveLocaleIfSignedIn("ar");
    expect(memory.size).toBe(0);
    expect(findById("acc-customer")?.locale).toBe("fr");
  });

  it("a new account starts in the language of the page it was created from", () => {
    const created = createAccount({
      kind: "customer",
      name: "Test",
      phone: "+21655111222",
      locale: "ar",
    });
    expect(created.status === "created" && created.account.locale).toBe("ar");
    const plain = createAccount({ kind: "customer", name: "Test2", phone: "+21655111333" });
    expect(plain.status === "created" && plain.account.locale).toBe("fr");
  });
});

describe("e-mail screen (R101, R102, ESP-01)", () => {
  const target = (value: string) => ({ channel: "email", value }) as const;

  async function verified(email: string) {
    await sendCode(target(email), "emailConfirm");
    const result = await verifyCode(target(email), FIXTURE_CODES[0], "emailConfirm");
    expect(result.status).toBe("ok");
  }

  it("emailConfirm has its own code: a sign-up code does not confirm the e-mail", async () => {
    await sendCode(target("nouveau@example.tn"), "signUp");
    await verifyCode(target("nouveau@example.tn"), FIXTURE_CODES[0], "signUp");
    expect(await attachEmail(lina(), "nouveau@example.tn")).toEqual({ status: "notVerified" });
    expect(findById("acc-customer-empty")?.email).toBe("lina.m@example.tn");
  });

  it("attaches a free e-mail after the right code, and uses the code once", async () => {
    await verified("nouveau@example.tn");
    expect(await attachEmail(lina(), " Nouveau@Example.tn ")).toEqual({ status: "attached" });
    expect(findById("acc-customer-empty")?.email).toBe("nouveau@example.tn");
    // The code was consumed: it cannot attach a second e-mail.
    expect(await attachEmail(lina(), "nouveau@example.tn")).toEqual({ status: "notVerified" });
  });

  it("R101: refuses an e-mail used elsewhere, only after the right code, and changes nothing", async () => {
    // Sending a code gives the same answer whether or not the e-mail has an account.
    const known = await sendCode(target("sami.t@example.tn"), "emailConfirm");
    const unknown = await sendCode(target("personne@example.tn"), "emailConfirm");
    expect(known.status).toBe("sent");
    expect(unknown.status).toBe("sent");
    expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort());
    // Without the right code, the answer is not "taken": nothing is revealed.
    expect(await attachEmail(lina(), "sami.t@example.tn")).toEqual({ status: "notVerified" });
    const wrong = await verifyCode(target("sami.t@example.tn"), "000000", "emailConfirm");
    expect(wrong.status).toBe("wrong");
    expect(await attachEmail(lina(), "sami.t@example.tn")).toEqual({ status: "notVerified" });
    // After the right code, now it can say so.
    await verified2("sami.t@example.tn");
    expect(await attachEmail(lina(), "sami.t@example.tn")).toEqual({ status: "emailTaken" });
    expect(findById("acc-customer-empty")?.email).toBe("lina.m@example.tn");
    expect(findByEmail("sami.t@example.tn")?.id).toBe("acc-customer");
  });

  async function verified2(email: string) {
    // The code of this target was sent in the test above: the first fixture code.
    expect((await verifyCode(target(email), FIXTURE_CODES[0], "emailConfirm")).status).toBe("ok");
  }

  it("refuses an e-mail that is not an address, and a code verified too long ago", async () => {
    expect(await attachEmail(lina(), "pas-un-email")).toEqual({ status: "invalidEmail" });
    await verified("nouveau@example.tn");
    clock = T0 + CODE_VERIFIED_WINDOW_MS + 1;
    expect(await attachEmail(lina(), "nouveau@example.tn")).toEqual({ status: "notVerified" });
  });
});
