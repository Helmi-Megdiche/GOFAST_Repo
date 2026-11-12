import { beforeEach, describe, expect, it } from "vitest";
import { useMemoryStorage } from "../storage";
import { getDashboard } from "./account-orders";
import { amountDueMillimes } from "./amount-due";
import { seedBillingFixtures } from "./fixtures/billing";
import { INVOICES, type Invoice } from "./invoice-model";
import { listInvoices } from "./invoices";
import { readTable, writeRow } from "./mock-db";
import type { Session } from "./session";

const session = (accountId: string): Session => ({
  accountId,
  userId: accountId,
  role: null,
  kind: "customer",
  contract: null,
  phoneVerified: true,
  maskedPhone: "",
});

beforeEach(() => {
  useMemoryStorage();
});

/** RV-15: the C01 tile, the C04 tile and the reader give the same figure for the same account. */
async function figures(accountId: string) {
  const s = session(accountId);
  return {
    reader: amountDueMillimes(accountId),
    c01: (await getDashboard(s)).amountDueMillimes,
    c04: (await listInvoices(s)).dueMillimes,
  };
}

describe("amountDueMillimes (RV-15)", () => {
  it("acc-customer: the unpaid and the partly paid invoice, 29 000 on C01 and C04", async () => {
    expect(await figures("acc-customer")).toEqual({ reader: 29_000, c01: 29_000, c04: 29_000 });
  });

  it("an account with only a return balance: that balance", async () => {
    expect(await figures("acc-customer-return-due")).toEqual({
      reader: 7000,
      c01: 7000,
      c04: 7000,
    });
  });

  it("an account with nothing: 0", async () => {
    expect(await figures("acc-customer-empty")).toEqual({ reader: 0, c01: 0, c04: 0 });
  });

  it("an account with both: the invoice amount plus the return balance", async () => {
    seedBillingFixtures();
    const base = readTable<Invoice>(INVOICES)["FAC-2026-0000001"]!;
    writeRow<Invoice>(INVOICES, "FAC-2026-0000006", {
      ...base,
      number: "FAC-2026-0000006",
      customerId: "acc-customer-return-due",
      status: "unpaid",
      dueMillimes: 3000,
    });
    expect(await figures("acc-customer-return-due")).toEqual({
      reader: 10_000,
      c01: 10_000,
      c04: 10_000,
    });
  });

  it("another account's invoices are not counted", () => {
    expect(amountDueMillimes("acc-customer-other")).toBe(0);
    expect(amountDueMillimes("acc-merchant-validated")).toBe(13_000);
  });
});
