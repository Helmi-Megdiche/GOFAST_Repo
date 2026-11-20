import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { useMemoryStorage } from "../storage";
import { createAccount, findById, sessionFor, sessionForMember } from "./accounts";
import { saveAddress, savedRecipients, saveRecipient, listAddresses } from "./address-book";
import { CLOSED_ACCOUNT_NAME, closeAccount, closeBlocker } from "./close-account";
import { FIXTURE_ACCOUNTS, FIXTURE_TEAM_MEMBERS } from "./fixtures/accounts";
import { seedBillingFixtures } from "./fixtures/billing";
import { CREDIT_NOTES, INVOICE_LINES, INVOICES, type Invoice } from "./invoice-model";
import { getInvoice, listInvoices, listInvoicesForAccountId } from "./invoices";
import { listClaims } from "./claims";
import { readTable, writeRow } from "./mock-db";
import {
  ACCOUNT_ORDERS,
  DELIVERY_CODES,
  MISSIONS,
  OUTBOX,
  PARCELS,
  RECIPIENT_LINKS,
  STATUS_EVENTS,
  type AccountOrder,
} from "./order-model";
import { getAccountOrder, listAccountOrders } from "./account-orders";
import { writeOutbox, type OutboxMessage } from "./outbox";
import { getSession, setSession } from "./session";
import { FINAL_ORDER_STATES } from "./states";

const T0 = Date.parse("2026-11-04T10:00:00Z");
const SAMI = FIXTURE_ACCOUNTS.find((a) => a.id === "acc-customer")!;
const LINA = FIXTURE_ACCOUNTS.find((a) => a.id === "acc-customer-empty")!;
const HANA = FIXTURE_ACCOUNTS.find((a) => a.id === "acc-customer-return-due")!;
const sessionOf = (id: string) => sessionFor(findById(id)!);

/** Every table that holds a business record (R105: none of them loses a row when an account closes). */
const BUSINESS_TABLES = [
  ACCOUNT_ORDERS,
  PARCELS,
  MISSIONS,
  STATUS_EVENTS,
  DELIVERY_CODES,
  RECIPIENT_LINKS,
  INVOICES,
  INVOICE_LINES,
  CREDIT_NOTES,
  "fg.mock.tickets",
  "fg.mock.ticketMessages",
] as const;
const counts = () =>
  Object.fromEntries(
    BUSINESS_TABLES.map((key) => [key, Object.keys(readTable<unknown>(key)).length]),
  );

/** Puts Sami in a state where nothing blocks the closing: every order final, every invoice paid. */
async function settleSami() {
  const session = sessionOf(SAMI.id);
  listAccountOrders(session);
  seedBillingFixtures();
  for (const order of listAccountOrders(session)) {
    const final = FINAL_ORDER_STATES.includes(order.status);
    if (!final)
      writeRow<AccountOrder>(ACCOUNT_ORDERS, order.code, { ...order, status: "delivered" });
  }
  for (const invoice of Object.values(readTable<Invoice>(INVOICES))) {
    if (invoice.customerId === SAMI.id) {
      writeRow<Invoice>(INVOICES, invoice.number, { ...invoice, dueMillimes: 0, status: "paid" });
    }
  }
  return session;
}

let memory: Map<string, string>;
beforeEach(() => {
  memory = useMemoryStorage();
  setClock(() => T0);
});

describe("closeAccount: refusals (R105)", () => {
  it("refuses with activeOrder while an order is not final, and writes nothing", async () => {
    const session = sessionOf(SAMI.id);
    const active = listAccountOrders(session).find((o) => !FINAL_ORDER_STATES.includes(o.status));
    expect(active).toBeDefined();
    setSession(session);
    const before = JSON.stringify({ ...localStorageDump() });
    expect(closeBlocker(session)).toBe("activeOrder");
    expect(await closeAccount(session)).toEqual({ status: "refused", reason: "activeOrder" });
    expect(JSON.stringify({ ...localStorageDump() })).toBe(before);
    expect(getSession()).not.toBeNull();
  });

  it("refuses an order in transit even when every invoice is paid", async () => {
    const session = await settleSami();
    const orders = listAccountOrders(session);
    writeRow<AccountOrder>(ACCOUNT_ORDERS, orders[0]!.code, {
      ...orders[0]!,
      status: "in_transit",
    });
    expect(await closeAccount(session)).toEqual({ status: "refused", reason: "activeOrder" });
  });

  it("refuses with amountDue for an unpaid invoice", async () => {
    const session = await settleSami();
    const invoice = Object.values(readTable<Invoice>(INVOICES)).find(
      (i) => i.customerId === SAMI.id,
    )!;
    writeRow<Invoice>(INVOICES, invoice.number, {
      ...invoice,
      dueMillimes: 5000,
      status: "unpaid",
    });
    expect(closeBlocker(session)).toBe("amountDue");
    expect(await closeAccount(session)).toEqual({ status: "refused", reason: "amountDue" });
    expect(findById(SAMI.id)?.status).toBe("active");
  });

  it("refuses with amountDue for a return balance, the figure C01 and C04 show", async () => {
    const session = sessionOf(HANA.id);
    expect(await closeAccount(session)).toEqual({ status: "refused", reason: "amountDue" });
    expect(findById(HANA.id)).toMatchObject({ status: "active", phone: HANA.phone });
  });

  it("changes nothing after a refusal (tables, account, address book, session)", async () => {
    const session = sessionOf(HANA.id);
    saveAddress(session, { label: "Maison", text: "Rue Ibn Khaldoun", landmark: "" });
    setSession(session);
    closeBlocker(session); // the first read seeds the fixtures once; what follows must write nothing
    const before = JSON.stringify(localStorageDump());
    await closeAccount(session);
    expect(JSON.stringify(localStorageDump())).toBe(before);
  });

  it("is not offered to a merchant admin, a team user or a merchant account", async () => {
    const merchant = sessionFor(findById("acc-merchant-validated")!);
    const admin = sessionForMember(FIXTURE_TEAM_MEMBERS[0]!)!;
    const user = sessionForMember(FIXTURE_TEAM_MEMBERS[1]!)!;
    for (const session of [merchant, admin, user]) {
      expect(closeBlocker(session)).toBe("notAllowed");
      expect(await closeAccount(session)).toEqual({ status: "notAllowed" });
    }
    expect(findById("acc-merchant-validated")?.status).toBe("active");
  });
});

describe("closeAccount: closing", () => {
  it("erases the identity, marks the account closed, and signs out", async () => {
    const session = sessionOf(LINA.id);
    setSession(session);
    expect(closeBlocker(session)).toBeNull();
    expect(await closeAccount(session)).toEqual({ status: "closed" });
    expect(findById(LINA.id)).toMatchObject({
      status: "closed",
      closedAt: new Date(T0).toISOString(),
      name: null,
      phone: null,
      email: null,
      google: false,
    });
    expect(getSession()).toBeNull();
  });

  it("frees the phone and the e-mail (R101): createAccount with them succeeds", async () => {
    await closeAccount(sessionOf(LINA.id));
    const again = createAccount({
      kind: "customer",
      name: "Nouvelle Lina",
      phone: LINA.phone,
      email: LINA.email,
    });
    expect(again.status).toBe("created");
    if (again.status === "created") expect(again.account.id).not.toBe(LINA.id);
  });

  it("sender copies become the closed key with a null phone; recipient copies are unchanged", async () => {
    const session = await settleSami();
    const before = listAccountOrders(session);
    expect(before.length).toBeGreaterThan(0);
    expect(await closeAccount(session)).toEqual({ status: "closed" });
    const after = listAccountOrders(session);
    expect(after.map((o) => o.code)).toEqual(before.map((o) => o.code));
    for (const order of after) {
      const was = before.find((o) => o.code === order.code)!;
      expect(order.sender.name).toBe(CLOSED_ACCOUNT_NAME);
      expect(order.sender.phone).toBeNull();
      expect(order.sender.address).toBe(was.sender.address);
      expect(order.recipient).toEqual(was.recipient);
    }
  });

  it("erases the sender's name and phone from that account's outbox params only", async () => {
    const session = await settleSami();
    const base = (
      ownerAccountId: string,
      orderCode: string,
    ): Omit<OutboxMessage, "id" | "createdAt"> => ({
      ownerAccountId,
      orderCode,
      channel: "sms",
      template: "trackingLink",
      params: {
        senderName: "Sami T.",
        senderPhone: "+21698000001",
        trackingCode: orderCode,
        linkToken: "tok",
      },
      locale: "ar",
    });
    writeOutbox(base(SAMI.id, "FG-AAAA-0001"));
    writeOutbox(base(SAMI.id, "FG-AAAA-0002"));
    writeOutbox(base("acc-customer-other", "FG-BBBB-0001"));
    await closeAccount(session);
    const rows = Object.values(readTable<OutboxMessage>(OUTBOX));
    const mine = rows.filter((r) => r.ownerAccountId === SAMI.id);
    expect(mine).toHaveLength(2);
    for (const row of mine) {
      expect(row.params).not.toHaveProperty("senderName");
      expect(row.params).not.toHaveProperty("senderPhone");
      expect(row.params.trackingCode).toMatch(/^FG-/);
      expect(row.template).toBe("trackingLink");
      expect(row.locale).toBe("ar");
      expect(JSON.stringify(row)).not.toContain("Sami");
      expect(JSON.stringify(row)).not.toContain("98000001");
    }
    const other = rows.find((r) => r.ownerAccountId === "acc-customer-other")!;
    expect(other.params.senderName).toBe("Sami T.");
  });

  it("empties the address book (addresses and recipients) of that account only", async () => {
    const session = await settleSami();
    const other = sessionOf("acc-customer-other");
    saveAddress(session, { label: "Maison", text: "Rue Ibn Khaldoun", landmark: "" });
    saveRecipient(session, {
      name: "Karim S.",
      phone: "+21622000110",
      address: "Lac 2",
      landmark: "",
      locale: "fr",
    });
    saveAddress(other, { label: "Bureau", text: "Avenue Habib Bourguiba", landmark: "" });
    await closeAccount(session);
    expect(listAddresses(session)).toEqual([]);
    expect(savedRecipients(session)).toEqual([]);
    expect(listAddresses(other)).toHaveLength(1);
  });

  it("deletes no business record: the counts of every business table are unchanged", async () => {
    const session = await settleSami();
    const before = counts();
    expect(Object.values(before).some((n) => n > 0)).toBe(true);
    await closeAccount(session);
    expect(counts()).toEqual(before);
  });

  it("keeps every invoice and credit note text byte for byte (buyerSnapshot, R602)", async () => {
    const session = await settleSami();
    const rows = (await listInvoices(session)).rows;
    expect(rows.length).toBeGreaterThan(0);
    const render = async () =>
      JSON.stringify(await Promise.all(rows.map((row) => getInvoice(session, row.number))));
    const before = await render();
    expect(before).toContain("buyer");
    await closeAccount(session);
    expect(await render()).toBe(before);
    // The back-office reader (T37) still finds the closed account's invoices.
    expect(listInvoicesForAccountId(SAMI.id).length).toBe(
      rows.filter((r) => r.kind === "invoice").length,
    );
  });

  it("a new sign-up with the same phone gets a new id and sees nothing of the old account", async () => {
    const session = await settleSami();
    saveAddress(session, { label: "Maison", text: "Rue Ibn Khaldoun", landmark: "" });
    await closeAccount(session);
    const created = createAccount({ kind: "customer", name: "Sami Bis", phone: SAMI.phone });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;
    const fresh = sessionFor(created.account);
    expect(fresh.accountId).not.toBe(SAMI.id);
    expect(listAccountOrders(fresh)).toEqual([]);
    expect((await listInvoices(fresh)).rows).toEqual([]);
    expect(await listClaims(fresh)).toEqual([]);
    expect(listAddresses(fresh)).toEqual([]);
    expect(savedRecipients(fresh)).toEqual([]);
    const oldCode = listAccountOrders(session)[0]!.code;
    expect(getAccountOrder(fresh, oldCode)).toEqual({ notFound: true });
  });

  it("is one write: a storage that fails midway leaves the tables as they were", async () => {
    const session = await settleSami();
    saveAddress(session, { label: "Maison", text: "Rue Ibn Khaldoun", landmark: "" });
    const before = JSON.stringify(localStorageDump());
    const orderKey = ACCOUNT_ORDERS;
    failWritesTo(orderKey);
    await expect(closeAccount(session)).rejects.toThrow();
    restoreStorage();
    expect(JSON.stringify(localStorageDump())).toBe(before);
    expect(findById(SAMI.id)?.status).toBe("active");
  });
});

// ── helpers over the in-memory storage (the real one in the browser) ─────────────────────────────
function localStorageDump(): Record<string, string> {
  return Object.fromEntries([...memory.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}
function failWritesTo(key: string) {
  const original = memory.set.bind(memory);
  memory.set = (k, v) => {
    if (k === key) throw new Error("storage full");
    return original(k, v);
  };
}
function restoreStorage() {
  // The override sits on the instance: delete it to get Map.prototype.set back.
  delete (memory as unknown as { set?: unknown }).set;
}
