import { beforeEach, describe, expect, it } from "vitest";
import { RETURN_FEE_MILLIMES } from "../order/constants";
import { removeKey, useMemoryStorage, writeJson } from "../storage";
import { seedBillingFixtures } from "./fixtures/billing";
import {
  CREDIT_NOTE_NUMBER,
  CREDIT_NOTES,
  INVOICE_LINES,
  INVOICE_NUMBER,
  INVOICES,
  type CreditNote,
  type Invoice,
  type InvoiceLine,
} from "./invoice-model";
import * as invoicesModule from "./invoices";
import { getInvoice, listInvoices } from "./invoices";
import { readTable, writeRow } from "./mock-db";
import { NetworkError } from "./orders";
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
const customer = session("acc-customer");

beforeEach(() => {
  useMemoryStorage();
});

const yearOf = (number: string) => number.split("-")[1]!;
const sequenceOf = (number: string) => Number(number.split("-")[2]);

describe("R603 numbers", () => {
  it("every fixture number matches its pattern and each year continues without a gap", () => {
    seedBillingFixtures();
    const invoices = Object.values(readTable<Invoice>(INVOICES)).map((i) => i.number);
    const notes = Object.values(readTable<CreditNote>(CREDIT_NOTES))
      .map((n) => n.number)
      .filter((n): n is string => n !== null);
    expect(invoices.length).toBeGreaterThan(0);
    for (const n of invoices) expect(n).toMatch(INVOICE_NUMBER);
    for (const n of notes) expect(n).toMatch(CREDIT_NOTE_NUMBER);
    for (const numbers of [invoices, notes]) {
      const years = new Set(numbers.map(yearOf));
      for (const year of years) {
        const sequence = numbers
          .filter((n) => yearOf(n) === year)
          .map(sequenceOf)
          .sort((a, b) => a - b);
        expect(sequence).toEqual(sequence.map((_, i) => i + 1));
      }
    }
  });

  it("the pattern refuses a malformed number", () => {
    expect(INVOICE_NUMBER.test("FAC-2026-000001")).toBe(false);
    expect(INVOICE_NUMBER.test("AV-2026-0000001")).toBe(false);
    expect(CREDIT_NOTE_NUMBER.test("AV-2026-0000001")).toBe(true);
  });
});

describe("R602 an issued invoice never changes", () => {
  it("the module exports readers only: no writer of an invoice", () => {
    expect(Object.keys(invoicesModule).sort()).toEqual(
      [
        "CREDIT_NOTE_PDF_EXAMPLE_PATH",
        "INVOICE_PDF_EXAMPLE_PATH",
        "RECEIPT_PDF_EXAMPLE_PATH",
        "getInvoice",
        "listInvoices",
      ].sort(),
    );
  });

  it("seeding again never overwrites a stored invoice", () => {
    seedBillingFixtures();
    const stored = readTable<Invoice>(INVOICES)["FAC-2026-0000001"]!;
    writeRow(INVOICES, stored.number, { ...stored, totalMillimes: 1 });
    removeKey("fg.mock.seed.billing");
    seedBillingFixtures();
    expect(readTable<Invoice>(INVOICES)[stored.number]!.totalMillimes).toBe(1);
  });
});

describe("lists", () => {
  it("shows the account's invoices and its issued credit notes, newest first", async () => {
    const page = await listInvoices(customer);
    expect(page.rows.map((r) => r.number)).toEqual([
      "AV-2026-0000001",
      "FAC-2026-0000004",
      "FAC-2026-0000002",
      "FAC-2026-0000003",
      "FAC-2026-0000001",
    ]);
    const note = page.rows.find((r) => r.kind === "creditNote")!;
    expect(note.invoiceNumber).toBe("FAC-2026-0000003");
    expect(note.status).toBeNull();
  });

  it("the due amount is the stored due of each invoice", async () => {
    expect((await listInvoices(customer)).dueMillimes).toBe(25_000 + 4000);
  });

  it("another account sees none of them", async () => {
    const page = await listInvoices(session("acc-customer-empty"));
    expect(page.rows).toEqual([]);
    expect(page.dueMillimes).toBe(0);
  });

  it("a cut network throws NetworkError once", async () => {
    writeJson("fg.mock.failNext:listInvoices", true);
    await expect(listInvoices(customer)).rejects.toBeInstanceOf(NetworkError);
    await expect(listInvoices(customer)).resolves.toBeDefined();
  });
});

describe("detail", () => {
  it("a multi-order invoice lists its orders", async () => {
    const result = await getInvoice(customer, "FAC-2026-0000002");
    if (result.status !== "found" || result.kind !== "invoice") throw new Error("not found");
    expect(result.invoice.orderCodes).toEqual(["FG-5A1D-0008", "FG-5A1W-0013"]);
    expect(result.invoice.status).toBe("unpaid");
    expect(result.invoice.receiptHref).toBeNull();
  });

  it("the corrected invoice shows its credit note, and the credit note shows its invoice", async () => {
    const invoice = await getInvoice(customer, "FAC-2026-0000003");
    if (invoice.status !== "found" || invoice.kind !== "invoice") throw new Error("not found");
    expect(invoice.invoice.creditNotes.map((n) => n.number)).toEqual(["AV-2026-0000001"]);
    const note = await getInvoice(customer, "AV-2026-0000001");
    if (note.status !== "found" || note.kind !== "creditNote") throw new Error("not found");
    expect(note.creditNote.invoiceNumber).toBe("FAC-2026-0000003");
  });

  it("R803: a credit note not issued yet is invisible, in the invoice, the list and by number", async () => {
    const t19 = await getInvoice(customer, "FAC-2026-0000004");
    if (t19.status !== "found" || t19.kind !== "invoice") throw new Error("not found");
    expect(t19.invoice.creditNotes).toEqual([]);
    const proposal = Object.values(readTable<CreditNote>(CREDIT_NOTES)).find(
      (n) => n.number === null,
    )!;
    expect(proposal).toBeDefined();
    const rows = (await listInvoices(customer)).rows;
    expect(rows.filter((r) => r.kind === "creditNote")).toHaveLength(1);
  });

  it("T19: the invoice bills all three parcels' freight plus the return fee from the constant", async () => {
    const result = await getInvoice(customer, "FAC-2026-0000004");
    if (result.status !== "found" || result.kind !== "invoice") throw new Error("not found");
    const freight = result.invoice.lines.filter((l) => l.kind === "freight");
    expect(freight.map((l) => l.parcelIndex)).toEqual([1, 2, 3]);
    const fee = result.invoice.lines.filter((l) => l.kind === "returnFee");
    expect(fee).toHaveLength(1);
    expect(fee[0]!.parcelIndex).toBe(3);
    expect(fee[0]!.netMillimes).toBe(RETURN_FEE_MILLIMES);
  });

  it("the stamp line has an amount from the data, the VAT and TTN fields are absent", async () => {
    const result = await getInvoice(customer, "FAC-2026-0000001");
    if (result.status !== "found" || result.kind !== "invoice") throw new Error("not found");
    expect(result.invoice.stampMillimes).toBeGreaterThan(0);
    expect(result.invoice.vatMillimes).toBeNull();
    expect(result.invoice.lines.every((l) => l.vatRate === null)).toBe(true);
    expect(result.invoice.ttn).toBeNull();
    expect(result.invoice.receiptHref).not.toBeNull();
  });

  it("fixture invoices are consistent: lines sum to the net, net + stamp is the total", () => {
    seedBillingFixtures();
    const lines = Object.values(readTable<InvoiceLine>(INVOICE_LINES));
    for (const invoice of Object.values(readTable<Invoice>(INVOICES))) {
      const net = lines
        .filter((l) => l.invoiceNumber === invoice.number)
        .reduce((sum, l) => sum + l.netMillimes, 0);
      expect(net).toBe(invoice.netMillimes);
      expect(invoice.totalMillimes).toBe(
        invoice.netMillimes + (invoice.vatMillimes ?? 0) + invoice.stampMillimes,
      );
      expect(Number.isInteger(invoice.totalMillimes)).toBe(true);
    }
  });

  it("R708: no invoice line is a COD line", () => {
    seedBillingFixtures();
    for (const line of Object.values(readTable<InvoiceLine>(INVOICE_LINES))) {
      expect(["freight", "returnFee", "cancelFee"]).toContain(line.kind);
    }
  });

  it("the buyer comes from the snapshot taken at issue, whatever the account says now", async () => {
    seedBillingFixtures();
    const stored = readTable<Invoice>(INVOICES)["FAC-2026-0000001"]!;
    writeRow(INVOICES, stored.number, {
      ...stored,
      buyerSnapshot: { name: "Nom a l'emission", address: "1 rue Snapshot", taxNumber: "TAX-FAKE" },
    });
    const result = await getInvoice(customer, stored.number);
    if (result.status !== "found" || result.kind !== "invoice") throw new Error("not found");
    expect(result.invoice.buyer).toEqual({
      name: "Nom a l'emission",
      address: "1 rue Snapshot",
      taxNumber: "TAX-FAKE",
    });
  });

  it("another account's invoice or credit note answers like a missing one", async () => {
    const other = await getInvoice(customer, "FAC-2026-0000005");
    const missing = await getInvoice(customer, "FAC-2026-0000999");
    expect(other).toEqual({ status: "notFound" });
    expect(other).toEqual(missing);
    // The credit note of an invoice that is not hers.
    const stranger = session("acc-customer-empty");
    expect(await getInvoice(stranger, "AV-2026-0000001")).toEqual({ status: "notFound" });
    expect(await getInvoice(stranger, "AV-2026-0000099")).toEqual({ status: "notFound" });
  });
});
