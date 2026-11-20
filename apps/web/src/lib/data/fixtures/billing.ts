import { RETURN_FEE_MILLIMES } from "@fastgo/domain";
import { readJson, writeJson } from "../../storage";
import { TICKET_MESSAGES, TICKETS, type Ticket, type TicketMessage } from "../claim-model";
import {
  CREDIT_NOTES,
  INVOICE_LINES,
  INVOICES,
  type CreditNote,
  type Invoice,
  type InvoiceLine,
} from "../invoice-model";
import { readTable, writeRow } from "../mock-db";
import { seedOrderFixtures } from "./orders";

/**
 * Fake invoices, credit notes and claims for the mock (ESP-05, ESP-06). Every amount is an
 * "example amount" written here, never computed by the app: the VAT rate and amount are not decided
 * (null, shown as [TVA]), the stamp is an example, and no invoice carries TTN fields (the membership
 * is not active). Fake names and addresses only.
 */
export const BILLING_SEED_KEY = "fg.mock.seed.billing";
export const BILLING_SEED_VERSION = "billing-v1";

const CUSTOMER = "acc-customer";
const MERCHANT = "acc-merchant-validated";
const OTHER = "acc-customer-other";
const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, month - 1, day, hour, minute)).toISOString();

/** Example stamp amount on every invoice (R204): the line always shows, its amount comes from the data. */
const STAMP = 1000;

const BUYER = { name: "Sami T.", address: "12 rue Fixture, Tunis", taxNumber: null };

type InvoiceSpec = Pick<
  Invoice,
  | "number"
  | "customerId"
  | "issuedAt"
  | "status"
  | "dueMillimes"
  | "paidAt"
  | "paymentMode"
  | "buyerSnapshot"
> & {
  /** Order, kind, parcel index, net millimes. */
  lines: [string, InvoiceLine["kind"], number | null, number][];
};

const INVOICE_SPECS: InvoiceSpec[] = [
  {
    number: "FAC-2026-0000001",
    customerId: CUSTOMER,
    issuedAt: at(10, 29, 9),
    status: "paid",
    dueMillimes: 0,
    paidAt: at(10, 29, 9, 30),
    paymentMode: "cashPickup",
    buyerSnapshot: BUYER,
    lines: [["FG-5A1M-0014", "freight", null, 12_000]],
  },
  {
    // Two orders on one invoice, still to pay.
    number: "FAC-2026-0000002",
    customerId: CUSTOMER,
    issuedAt: at(11, 3, 9),
    status: "unpaid",
    dueMillimes: 25_000,
    paidAt: null,
    paymentMode: null,
    buyerSnapshot: BUYER,
    lines: [
      ["FG-5A1D-0008", "freight", null, 12_000],
      ["FG-5A1W-0013", "freight", null, 12_000],
    ],
  },
  {
    // A returned parcel and a lost one: partly paid, corrected by a credit note.
    number: "FAC-2026-0000003",
    customerId: CUSTOMER,
    issuedAt: at(11, 2, 9),
    status: "partial",
    dueMillimes: 4000,
    paidAt: null,
    paymentMode: null,
    buyerSnapshot: BUYER,
    lines: [
      ["FG-5A1T-0010", "freight", 1, 6000],
      ["FG-5A1T-0010", "freight", 2, 6000],
    ],
  },
  {
    // T19: two parcels delivered, one returned. Every parcel's freight is billed, plus the return fee (R606).
    number: "FAC-2026-0000004",
    customerId: CUSTOMER,
    issuedAt: at(11, 3, 10),
    status: "paid",
    dueMillimes: 0,
    paidAt: at(11, 4, 9),
    paymentMode: "cashPickup",
    buyerSnapshot: BUYER,
    lines: [
      ["FG-5A1Y-0011", "freight", 1, 4000],
      ["FG-5A1Y-0011", "freight", 2, 4000],
      ["FG-5A1Y-0011", "freight", 3, 4000],
      ["FG-5A1Y-0011", "returnFee", 3, RETURN_FEE_MILLIMES],
    ],
  },
  {
    // Another account's invoice: it answers like a missing one for the customer. Freight only (R708).
    number: "FAC-2026-0000005",
    customerId: MERCHANT,
    issuedAt: at(11, 3, 11),
    status: "unpaid",
    dueMillimes: 13_000,
    paidAt: null,
    paymentMode: null,
    buyerSnapshot: { name: "Boutique Yasmine", address: "4 rue Exemple, Tunis", taxNumber: null },
    lines: [["FG-5C3A-0001", "freight", null, 12_000]],
  },
];

const CREDIT_NOTE_FIXTURES: CreditNote[] = [
  {
    id: "cn-1",
    number: "AV-2026-0000001",
    invoiceNumber: "FAC-2026-0000003",
    totalMillimes: 6000,
    issuedAt: at(11, 4, 15),
  },
  {
    // R803: proposed by the customer service, not issued yet: the client never sees it.
    id: "cn-proposal-1",
    number: null,
    invoiceNumber: "FAC-2026-0000004",
    totalMillimes: 4000,
    issuedAt: null,
  },
];

const TICKET_FIXTURES: Ticket[] = [
  {
    ref: "T-2041",
    orderCode: "FG-5A1D-0008",
    ownerAccountId: CUSTOMER,
    openedBy: CUSTOMER,
    category: "damage",
    status: "toComplete",
    invoiceNumber: null,
    createdAt: at(11, 5, 15, 10),
    updatedAt: at(11, 6, 13),
    closedAt: null,
    archivedAt: null,
  },
  {
    ref: "T-1988",
    orderCode: "FG-5A1M-0014",
    ownerAccountId: CUSTOMER,
    openedBy: CUSTOMER,
    category: "delay",
    status: "resolved",
    invoiceNumber: null,
    createdAt: at(10, 30, 9),
    updatedAt: at(11, 2, 10),
    closedAt: at(11, 2, 10),
    archivedAt: null,
  },
  {
    ref: "T-2040",
    orderCode: "FG-5B2A-0001",
    ownerAccountId: OTHER,
    openedBy: OTHER,
    category: "other",
    status: "open",
    invoiceNumber: null,
    createdAt: at(11, 4, 9),
    updatedAt: at(11, 4, 9),
    closedAt: null,
    archivedAt: null,
  },
];

const message = (
  id: string,
  ticketRef: string,
  author: TicketMessage["author"],
  authorId: string,
  body: string,
  when: string,
  isInternal = false,
): TicketMessage => ({
  id,
  ticketRef,
  author,
  authorId,
  body,
  at: when,
  isInternal,
  attachments: [],
});

/** The text of a fixture message is example data written by the "customer" or the "service". */
const MESSAGE_FIXTURES: TicketMessage[] = [
  message(
    "m-2041-1",
    "T-2041",
    "client",
    CUSTOMER,
    "Le colis est arrivé ouvert et un article est abîmé.",
    at(11, 5, 15, 10),
  ),
  message(
    "m-2041-2",
    "T-2041",
    "staff",
    "staff-fixture",
    "Nous sommes désolés. Pouvez-vous envoyer une photo du colis et de l'article ?",
    at(11, 6, 13),
  ),
  // T30: an internal note is in the table but never in what the client receives.
  message(
    "m-2041-3",
    "T-2041",
    "staff",
    "staff-fixture",
    "NOTE INTERNE : vérifier le constat du livreur avant de proposer un avoir.",
    at(11, 6, 13, 5),
    true,
  ),
  message(
    "m-1988-1",
    "T-1988",
    "client",
    CUSTOMER,
    "Ma livraison a eu un jour de retard.",
    at(10, 30, 9),
  ),
  message(
    "m-1988-2",
    "T-1988",
    "staff",
    "staff-fixture",
    "Le retard est confirmé, nous vous présentons nos excuses. Dossier clos.",
    at(11, 2, 10),
  ),
  message("m-2040-1", "T-2040", "client", OTHER, "Question sur ma commande.", at(11, 4, 9)),
];

/** Inserts the missing billing fixtures once per device (the orders first). Never overwrites a row. */
export function seedBillingFixtures(): void {
  seedOrderFixtures();
  if (readJson(BILLING_SEED_KEY) === BILLING_SEED_VERSION) return;
  const invoices = readTable<Invoice>(INVOICES);
  for (const spec of INVOICE_SPECS) {
    if (invoices[spec.number]) continue;
    const { lines, ...head } = spec;
    const net = lines.reduce((sum, line) => sum + line[3], 0);
    writeRow<Invoice>(INVOICES, spec.number, {
      ...head,
      netMillimes: net,
      vatMillimes: null,
      stampMillimes: STAMP,
      totalMillimes: net + STAMP,
      ttn: null,
    });
    lines.forEach(([orderCode, kind, parcelIndex, netMillimes], index) => {
      const id = `${spec.number}-${index + 1}`;
      writeRow<InvoiceLine>(INVOICE_LINES, id, {
        id,
        invoiceNumber: spec.number,
        orderCode,
        kind,
        parcelIndex,
        service: "standard",
        netMillimes,
        vatRate: null,
      });
    });
  }
  const notes = readTable<CreditNote>(CREDIT_NOTES);
  for (const note of CREDIT_NOTE_FIXTURES) {
    if (!notes[note.id]) writeRow(CREDIT_NOTES, note.id, note);
  }
  const tickets = readTable<Ticket>(TICKETS);
  for (const ticket of TICKET_FIXTURES) {
    if (!tickets[ticket.ref]) writeRow(TICKETS, ticket.ref, ticket);
  }
  const messages = readTable<TicketMessage>(TICKET_MESSAGES);
  for (const m of MESSAGE_FIXTURES) {
    if (!messages[m.id]) writeRow(TICKET_MESSAGES, m.id, m);
  }
  writeJson(BILLING_SEED_KEY, BILLING_SEED_VERSION);
}
