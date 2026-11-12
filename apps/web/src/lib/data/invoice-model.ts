import type { PaymentCode } from "../order/draft";
import type { ServiceCode } from "./services";

/** Mock tables of the invoices (ESP-05). Read only from lib/data; see invoices.ts. */
export const INVOICES = "fg.mock.invoices";
export const INVOICE_LINES = "fg.mock.invoiceLines";
export const CREDIT_NOTES = "fg.mock.creditNotes";

/** R602: an issued invoice never changes. Its status is the settlement state kept by the accountant. */
export type InvoiceStatus = "paid" | "partial" | "unpaid";

/** `invoices` of the cahier, plus the mock fields `dueMillimes`, `paidAt`, `paymentMode`, `buyerSnapshot` and `ttn`. */
export type Invoice = {
  /** `FAC-AAAA-NNNNNNN` (R603). */
  number: string;
  customerId: string;
  /** ISO UTC. */
  issuedAt: string;
  netMillimes: number;
  /** Not decided (VAT, "TVA à confirmer"): null until GOFAST gives it. */
  vatMillimes: number | null;
  stampMillimes: number;
  totalMillimes: number;
  status: InvoiceStatus;
  /** Still to pay, stored by the accountant; 0 when paid. */
  dueMillimes: number;
  paidAt: string | null;
  paymentMode: PaymentCode | null;
  /** The buyer as written when the invoice was issued (R602, R105): never read from the account. */
  buyerSnapshot: { name: string; address: string; taxNumber: string | null };
  /** R604: set only once the TTN membership is active. */
  ttn: { id: string } | null;
};

/** `invoice_lines`: one invoice carries one or more orders. No line kind for COD (R708). */
export type InvoiceLine = {
  id: string;
  invoiceNumber: string;
  orderCode: string;
  kind: "freight" | "returnFee" | "cancelFee";
  /** The parcel the line is about, null for a line of the whole order. */
  parcelIndex: number | null;
  service: ServiceCode;
  netMillimes: number;
  /** null: the rate is not decided ([TVA]). */
  vatRate: number | null;
};

/** `credit_notes`. A proposal not yet issued has `number` and `issuedAt` null: the client never sees it (R803). */
export type CreditNote = {
  id: string;
  number: string | null;
  invoiceNumber: string;
  totalMillimes: number;
  issuedAt: string | null;
};

export const INVOICE_NUMBER = /^FAC-\d{4}-\d{7}$/;
export const CREDIT_NOTE_NUMBER = /^AV-\d{4}-\d{7}$/;
