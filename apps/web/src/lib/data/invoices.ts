import type { PaymentCode } from "../order/draft";
import { amountDueMillimes } from "./amount-due";
import { mockDelay } from "./delay";
import { seedBillingFixtures } from "./fixtures/billing";
import {
  CREDIT_NOTE_NUMBER,
  CREDIT_NOTES,
  INVOICE_LINES,
  INVOICES,
  type CreditNote,
  type Invoice,
  type InvoiceLine,
  type InvoiceStatus,
} from "./invoice-model";
import { consumeFailNext, readTable } from "./mock-db";
import { NetworkError } from "./orders";
import type { Session } from "./session";
import type { ServiceCode } from "./services";

/**
 * Readers of the client's invoices (ESP-05, C04 and C05). There is deliberately no function here
 * that writes an invoice: an issued invoice never changes (R602, T24), and a correction is a credit
 * note linked by `invoiceNumber`. Amounts are stored on the invoice and never computed. Every
 * reader is scoped by `session.accountId`: another account's invoice answers like a missing one.
 */

/** Static example files marked EXEMPLE (public/examples). */
export const INVOICE_PDF_EXAMPLE_PATH = "/examples/facture-exemple.pdf";
export const RECEIPT_PDF_EXAMPLE_PATH = "/examples/recu-exemple.pdf";
export const CREDIT_NOTE_PDF_EXAMPLE_PATH = "/examples/avoir-exemple.pdf";

export type InvoiceRow = {
  kind: "invoice" | "creditNote";
  number: string;
  issuedAt: string;
  orderCodes: string[];
  /** A credit note has no settlement status. */
  status: InvoiceStatus | null;
  /** The total of the invoice, or of the credit note (shown as a negative amount). */
  totalMillimes: number;
  /** The invoice a credit note corrects. */
  invoiceNumber: string | null;
};

export type InvoicesPage = {
  rows: InvoiceRow[];
  /** What the account owes (`amountDueMillimes`): the same figure as C01. */
  dueMillimes: number;
};

const issuedNotes = (
  invoiceNumber?: string,
): (CreditNote & { number: string; issuedAt: string })[] =>
  Object.values(readTable<CreditNote>(CREDIT_NOTES)).filter(
    (note): note is CreditNote & { number: string; issuedAt: string } =>
      // R803: a proposal that is not issued yet is invisible.
      note.number !== null &&
      note.issuedAt !== null &&
      (invoiceNumber === undefined || note.invoiceNumber === invoiceNumber),
  );

const linesOf = (invoiceNumber: string): InvoiceLine[] =>
  Object.values(readTable<InvoiceLine>(INVOICE_LINES))
    .filter((line) => line.invoiceNumber === invoiceNumber)
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

const orderCodesOf = (lines: InvoiceLine[]): string[] => [
  ...new Set(lines.map((line) => line.orderCode)),
];

function ownInvoice(session: Session, number: string): Invoice | null {
  seedBillingFixtures();
  const invoice = readTable<Invoice>(INVOICES)[number];
  return invoice && invoice.customerId === session.accountId ? invoice : null;
}

/** Mock of GET /v1/invoices: the account's invoices and issued credit notes, newest first. */
export async function listInvoices(session: Session): Promise<InvoicesPage> {
  await mockDelay();
  if (consumeFailNext("listInvoices")) throw new NetworkError();
  seedBillingFixtures();
  const invoices = Object.values(readTable<Invoice>(INVOICES)).filter(
    (invoice) => invoice.customerId === session.accountId,
  );
  const rows: InvoiceRow[] = [
    ...invoices.map((invoice): InvoiceRow => ({
      kind: "invoice",
      number: invoice.number,
      issuedAt: invoice.issuedAt,
      orderCodes: orderCodesOf(linesOf(invoice.number)),
      status: invoice.status,
      totalMillimes: invoice.totalMillimes,
      invoiceNumber: null,
    })),
    ...issuedNotes()
      .filter((note) => invoices.some((invoice) => invoice.number === note.invoiceNumber))
      .map((note): InvoiceRow => ({
        kind: "creditNote",
        number: note.number,
        issuedAt: note.issuedAt,
        orderCodes: orderCodesOf(linesOf(note.invoiceNumber)),
        status: null,
        totalMillimes: note.totalMillimes,
        invoiceNumber: note.invoiceNumber,
      })),
  ].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.number.localeCompare(a.number));
  return {
    rows,
    dueMillimes: amountDueMillimes(session.accountId),
  };
}

export type InvoiceLineView = {
  orderCode: string;
  kind: InvoiceLine["kind"];
  parcelIndex: number | null;
  service: ServiceCode;
  netMillimes: number;
  /** null: the VAT rate is not decided ([TVA]). */
  vatRate: number | null;
};

export type InvoiceDetail = {
  number: string;
  issuedAt: string;
  status: InvoiceStatus;
  dueMillimes: number;
  paidAt: string | null;
  paymentMode: PaymentCode | null;
  /** C05 reads the buyer only from here (R602, R105): the snapshot taken when the invoice was issued. */
  buyer: Invoice["buyerSnapshot"];
  orderCodes: string[];
  lines: InvoiceLineView[];
  netMillimes: number;
  vatMillimes: number | null;
  stampMillimes: number;
  totalMillimes: number;
  /** R604: present only once the invoice was sent to TTN. */
  ttn: Invoice["ttn"];
  creditNotes: { number: string; issuedAt: string; totalMillimes: number; pdfHref: string }[];
  pdfHref: string;
  /** "Reçu disponible" once something was paid. */
  receiptHref: string | null;
};

export type CreditNoteDetail = {
  number: string;
  issuedAt: string;
  totalMillimes: number;
  invoiceNumber: string;
  pdfHref: string;
};

export type InvoiceResult =
  | { status: "found"; kind: "invoice"; invoice: InvoiceDetail }
  | { status: "found"; kind: "creditNote"; creditNote: CreditNoteDetail }
  | { status: "notFound" };

/** Mock of GET /v1/invoices/{number}, for an invoice number or a credit note number. */
export async function getInvoice(session: Session, number: string): Promise<InvoiceResult> {
  await mockDelay();
  if (consumeFailNext("getInvoice")) throw new NetworkError();
  seedBillingFixtures();

  if (CREDIT_NOTE_NUMBER.test(number)) {
    const note = issuedNotes().find((n) => n.number === number);
    if (!note || !ownInvoice(session, note.invoiceNumber)) return { status: "notFound" };
    return {
      status: "found",
      kind: "creditNote",
      creditNote: {
        number: note.number,
        issuedAt: note.issuedAt,
        totalMillimes: note.totalMillimes,
        invoiceNumber: note.invoiceNumber,
        pdfHref: CREDIT_NOTE_PDF_EXAMPLE_PATH,
      },
    };
  }

  const invoice = ownInvoice(session, number);
  if (!invoice) return { status: "notFound" };
  const lines = linesOf(invoice.number);
  return {
    status: "found",
    kind: "invoice",
    invoice: {
      number: invoice.number,
      issuedAt: invoice.issuedAt,
      status: invoice.status,
      dueMillimes: invoice.dueMillimes,
      paidAt: invoice.paidAt,
      paymentMode: invoice.paymentMode,
      buyer: invoice.buyerSnapshot,
      orderCodes: orderCodesOf(lines),
      lines: lines.map((line) => ({
        orderCode: line.orderCode,
        kind: line.kind,
        parcelIndex: line.parcelIndex,
        service: line.service,
        netMillimes: line.netMillimes,
        vatRate: line.vatRate,
      })),
      netMillimes: invoice.netMillimes,
      vatMillimes: invoice.vatMillimes,
      stampMillimes: invoice.stampMillimes,
      totalMillimes: invoice.totalMillimes,
      ttn: invoice.ttn,
      creditNotes: issuedNotes(invoice.number).map((note) => ({
        number: note.number,
        issuedAt: note.issuedAt,
        totalMillimes: note.totalMillimes,
        pdfHref: CREDIT_NOTE_PDF_EXAMPLE_PATH,
      })),
      pdfHref: INVOICE_PDF_EXAMPLE_PATH,
      receiptHref: invoice.paidAt ? RECEIPT_PDF_EXAMPLE_PATH : null,
    },
  };
}
