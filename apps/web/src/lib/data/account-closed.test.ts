import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { CODE_SEND_WINDOW_MS, CODE_LOCK_MS, CODE_VERIFIED_WINDOW_MS } from "@fastgo/domain";
import { buildOrderRequest } from "../order/request";
import { readyDraft } from "../order/test-draft";
import { useMemoryStorage } from "../storage";
import { listAccountOrders } from "./account-orders";
import { createAccount, findById, sessionFor, sessionForMember } from "./accounts";
import {
  removeAddress,
  removeRecipient,
  saveAddress,
  saveRecipient,
  updateAddress,
} from "./address-book";
import { signIn } from "./auth";
import { cancelOrder } from "./cancel";
import { createClaim, postClaimMessage, reopenClaim } from "./claims";
import { closeAccount } from "./close-account";
import { FIXTURE_ACCOUNTS, FIXTURE_PASSWORD, FIXTURE_TEAM_MEMBERS } from "./fixtures/accounts";
import { seedBillingFixtures } from "./fixtures/billing";
import { INVOICES, type Invoice } from "./invoice-model";
import { readTable, writeRow } from "./mock-db";
import { ACCOUNT_ORDERS, type AccountOrder } from "./order-model";
import { createOrder } from "./orders";
import { sendCode } from "./otp";
import {
  attachEmail,
  saveLocaleIfSignedIn,
  setAccountLocale,
  setNotifications,
  unlinkGoogle,
  updateName,
} from "./profile";
import { setSession } from "./session";
import { FINAL_ORDER_STATES } from "./states";

const T0 = Date.parse("2026-11-04T08:30:00Z");
let memory: Map<string, string>;
let clock = T0;

beforeEach(() => {
  memory = useMemoryStorage();
  clock = T0;
  setClock(() => clock);
});

/** Every storage key whose stored text contains one of the needles. */
const keysHolding = (...needles: string[]) =>
  [...memory.entries()]
    .filter(([, value]) => needles.some((needle) => value.includes(needle)))
    .map(([key]) => key)
    .sort();

/** Every order of the account final, every invoice paid: nothing blocks the closing. */
function settle(accountId: string) {
  seedBillingFixtures();
  const session = sessionFor(findById(accountId)!);
  for (const order of listAccountOrders(session)) {
    if (!FINAL_ORDER_STATES.includes(order.status)) {
      writeRow<AccountOrder>(ACCOUNT_ORDERS, order.code, { ...order, status: "delivered" });
    }
  }
  for (const invoice of Object.values(readTable<Invoice>(INVOICES))) {
    if (invoice.customerId === accountId) {
      writeRow<Invoice>(INVOICES, invoice.number, { ...invoice, dueMillimes: 0, status: "paid" });
    }
  }
}

describe("closeAccount reads the stored account (R105, RV-04)", () => {
  it("refuses a forged customer session on a merchant row, and writes nothing", async () => {
    const merchant = findById("acc-merchant-pending")!;
    const forged = { ...sessionFor(merchant), kind: "customer" as const, role: null };
    const before = JSON.stringify([...memory.entries()]);
    expect(await closeAccount(forged)).toEqual({ status: "notAllowed" });
    expect(JSON.stringify([...memory.entries()])).toBe(before);
    expect(findById("acc-merchant-pending")?.status).toBe("active");
  });

  it("refuses a session of another person on a customer row (userId is not the account)", async () => {
    const session = { ...sessionFor(findById("acc-customer-empty")!), userId: "someone-else" };
    expect(await closeAccount(session)).toEqual({ status: "notAllowed" });
    expect(findById("acc-customer-empty")?.status).toBe("active");
  });

  it("refuses a merchant admin and a merchant user called directly", async () => {
    for (const member of FIXTURE_TEAM_MEMBERS) {
      expect(await closeAccount(sessionForMember(member)!)).toEqual({ status: "notAllowed" });
    }
    expect(findById("acc-merchant-validated")?.status).toBe("active");
  });
});

describe("closing erases the identity from every stored key (R105, RV-18)", () => {
  async function placedOrderThenClosed() {
    const created = createAccount({
      kind: "customer",
      name: "Zorro Testname",
      phone: "+216 20 000 000",
      email: "zorro.testname@example.tn",
    });
    if (created.status !== "created") throw new Error("not created");
    const session = sessionFor(created.account);
    setSession(session);
    // The sign-up code of this phone, as the real flow leaves it behind.
    await sendCode({ channel: "sms", value: "+21620000000" }, "signUp");
    const draft = readyDraft(T0);
    draft.sender = { ...draft.sender, name: "Zorro Testname" };
    const request = buildOrderRequest(draft, true)!;
    expect((await createOrder(request, "key-zorro")).status).toBe("created");
    settle(created.account.id);
    return { session, id: created.account.id };
  }

  it("leaves no name, phone or e-mail in any key but the short-lived code state", async () => {
    const { session } = await placedOrderThenClosed();
    // Before closing, the identity is stored in several places: the scan can find it.
    expect(keysHolding("Zorro Testname").length).toBeGreaterThan(0);
    expect(await closeAccount(session)).toEqual({ status: "closed" });
    const holding = keysHolding("Zorro Testname", "zorro.testname", "20 000 000", "20000000");
    // The rate-limit counters are keyed by phone; they are not an account record.
    expect(holding.filter((key) => key !== "fg.mock.codes")).toEqual([]);
  });

  it("the code state of that phone expires with its windows, then nothing holds the phone", async () => {
    const { session } = await placedOrderThenClosed();
    await closeAccount(session);
    expect(keysHolding("20000000")).toEqual(["fg.mock.codes"]);
    clock = T0 + Math.max(CODE_SEND_WINDOW_MS, CODE_LOCK_MS, CODE_VERIFIED_WINDOW_MS) + 1;
    // Any later use of the code state removes what is out of every window.
    await sendCode({ channel: "sms", value: "+21655000000" }, "signUp");
    expect(keysHolding("20000000")).toEqual([]);
  });
});

describe("a closed account refuses every writer scoped by its id (RV-01)", () => {
  async function closedSami() {
    settle("acc-customer");
    const session = sessionFor(findById("acc-customer")!);
    const book = saveAddress(session, { label: "Maison", text: "Rue Ibn Khaldoun", landmark: "" });
    const recipient = saveRecipient(session, {
      name: "Karim S.",
      phone: "+21622000110",
      address: "Lac 2",
      landmark: "",
      locale: "fr",
    });
    if (book.status !== "saved" || recipient.status !== "saved") throw new Error("not saved");
    expect(await closeAccount(session)).toEqual({ status: "closed" });
    return { session, addressId: book.address.id, recipientId: recipient.recipient.id };
  }

  it("address book: save, update, remove (addresses and recipients)", async () => {
    const { session, addressId, recipientId } = await closedSami();
    const before = JSON.stringify([...memory.entries()]);
    expect(saveAddress(session, { label: "X", text: "Rue Ibn Khaldoun", landmark: "" })).toEqual({
      status: "notFound",
    });
    expect(updateAddress(session, addressId, { label: "Y" })).toEqual({ status: "notFound" });
    expect(removeAddress(session, addressId)).toEqual({ status: "notFound" });
    expect(
      saveRecipient(session, {
        name: "Karim S.",
        phone: "+21622000110",
        address: "Lac 2",
        landmark: "",
        locale: "fr",
      }),
    ).toEqual({ status: "notFound" });
    expect(removeRecipient(session, recipientId)).toEqual({ status: "notFound" });
    expect(JSON.stringify([...memory.entries()])).toBe(before);
  });

  it("profile: name, notifications, language, Google, e-mail", async () => {
    const { session } = await closedSami();
    setSession(session);
    const before = JSON.stringify([...memory.entries()]);
    expect(await updateName(session, "Nouveau")).toEqual({ status: "notFound" });
    expect(await setNotifications(session, { offers: true })).toEqual({ status: "notFound" });
    expect(await setAccountLocale(session, "ar")).toEqual({ status: "notFound" });
    expect(await unlinkGoogle(session)).toEqual({ status: "notFound" });
    expect(await attachEmail(session, "a@example.tn")).toEqual({ status: "notFound" });
    await saveLocaleIfSignedIn("en");
    expect(JSON.stringify([...memory.entries()])).toBe(before);
  });

  it("orders and claims: create an order, cancel, open, answer and reopen a claim", async () => {
    const { session } = await closedSami();
    setSession(session);
    const before = JSON.stringify([...memory.entries()]);
    const request = buildOrderRequest(readyDraft(T0), true)!;
    expect(await createOrder(request, "k-closed")).toEqual({
      status: "refused",
      error: "accountClosed",
    });
    const code = Object.keys(readTable(ACCOUNT_ORDERS)).find(
      (c) =>
        (readTable<AccountOrder>(ACCOUNT_ORDERS)[c] as AccountOrder).ownerAccountId ===
        "acc-customer",
    )!;
    expect(await cancelOrder(session, code, { acceptedFee: "none" })).toEqual({
      status: "notFound",
    });
    const claim = await createClaim(
      session,
      { orderCode: code, category: "damage", invoiceNumber: null, message: "x", attachments: [] },
      "k-claim",
    );
    expect(claim).toEqual({ status: "refused", error: "orderNotFound" });
    expect(
      await postClaimMessage(session, "T-2041", { message: "x", attachments: [] }, "k-msg"),
    ).toMatchObject({ status: "notFound" });
    expect(await reopenClaim(session, "T-2041")).toEqual({ status: "notFound" });
    expect(JSON.stringify([...memory.entries()])).toBe(before);
  });
});

describe("a language belongs to the person, not the company (R902, RV-17)", () => {
  const [yasmine, walid] = FIXTURE_TEAM_MEMBERS as [
    (typeof FIXTURE_TEAM_MEMBERS)[0],
    (typeof FIXTURE_TEAM_MEMBERS)[0],
  ];

  it("Walid picks English: Yasmine, of the same company, still signs in in her own language", async () => {
    setSession(sessionForMember(walid)!);
    await saveLocaleIfSignedIn("en");
    expect(findById("acc-merchant-validated")?.locale).toBe("fr");

    const hers = await signIn(yasmine.phone, FIXTURE_PASSWORD);
    expect(hers).toMatchObject({ status: "ok", locale: "fr" });
    const his = await signIn(walid.phone, FIXTURE_PASSWORD);
    expect(his).toMatchObject({ status: "ok", locale: "en" });
  });

  it("each member keeps their own choice", async () => {
    setSession(sessionForMember(walid)!);
    await saveLocaleIfSignedIn("en");
    setSession(sessionForMember(yasmine)!);
    await saveLocaleIfSignedIn("ar");
    expect(await signIn(walid.phone, FIXTURE_PASSWORD)).toMatchObject({ locale: "en" });
    expect(await signIn(yasmine.phone, FIXTURE_PASSWORD)).toMatchObject({ locale: "ar" });
  });

  it("an individual still saves on the account (R902, C09)", async () => {
    const lina = FIXTURE_ACCOUNTS.find((a) => a.id === "acc-customer-empty")!;
    setSession(sessionFor(lina));
    await saveLocaleIfSignedIn("ar");
    expect(findById("acc-customer-empty")?.locale).toBe("ar");
  });
});
