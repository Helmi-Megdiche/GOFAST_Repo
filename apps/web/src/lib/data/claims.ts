import { attachmentError, type AttachmentError } from "../claims/attachments";
import { now } from "../order/clock";
import { CLAIM_REOPEN_WINDOW_MS } from "../order/constants";
import { getAccountOrder, listAccountOrders, parcelsOf } from "./account-orders";
import {
  CLAIM_CATEGORIES,
  TICKET_KEYS,
  TICKET_MESSAGES,
  TICKETS,
  type AttachmentMeta,
  type ClaimCategory,
  type Ticket,
  type TicketMessage,
} from "./claim-model";
import { mockDelay } from "./delay";
import { seedBillingFixtures } from "./fixtures/billing";
import { getInvoice } from "./invoices";
import { consumeFailNext, readTable, writeRow } from "./mock-db";
import { STATUS_EVENTS, type StatusEvent } from "./order-model";
import { NetworkError } from "./orders";
import type { ServiceCode } from "./services";
import type { Session } from "./session";

/**
 * The client's claims (ESP-06, C06 and C07): `tickets` and `ticket_messages`. Every function is scoped
 * by `session.accountId`; another account's claim or order answers exactly like a missing one. A
 * claim never changes an order or a parcel ("un colis abîmé garde son état et ouvre une
 * réclamation"). Replay by key (ADR-6). No refund is ever computed here (R802, R803).
 */

/** What the client sees: the three mockup statuses (H13) plus "archived" (R804), which is derived. */
export type ClaimState = "open" | "toComplete" | "resolved" | "archived";

/** R804: archived once the reopen window after the closing has passed, or when `archivedAt` is set. */
export function claimStateOf(ticket: Ticket, atMs: number): ClaimState {
  if (ticket.archivedAt) return "archived";
  if (ticket.status === "resolved" && ticket.closedAt) {
    if (atMs >= Date.parse(ticket.closedAt) + CLAIM_REOPEN_WINDOW_MS) return "archived";
  }
  return ticket.status;
}

/** Until when a closed claim can be reopened; null when it is not closed. */
const reopenableUntil = (ticket: Ticket): string | null =>
  ticket.status === "resolved" && ticket.closedAt
    ? new Date(Date.parse(ticket.closedAt) + CLAIM_REOPEN_WINDOW_MS).toISOString()
    : null;

function ownTicket(session: Session, ref: string): Ticket | null {
  seedBillingFixtures();
  const ticket = readTable<Ticket>(TICKETS)[ref];
  return ticket && ticket.ownerAccountId === session.accountId ? ticket : null;
}

const messagesOf = (ref: string): TicketMessage[] =>
  Object.values(readTable<TicketMessage>(TICKET_MESSAGES))
    .filter((m) => m.ticketRef === ref)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

export type ClaimRow = {
  ref: string;
  category: ClaimCategory;
  orderCode: string;
  state: ClaimState;
  updatedAt: string;
};

/** Mock of GET /v1/tickets: the account's claims, most recently updated first. */
export async function listClaims(session: Session): Promise<ClaimRow[]> {
  await mockDelay();
  if (consumeFailNext("listClaims")) throw new NetworkError();
  seedBillingFixtures();
  const at = now();
  return Object.values(readTable<Ticket>(TICKETS))
    .filter((ticket) => ticket.ownerAccountId === session.accountId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.ref.localeCompare(a.ref))
    .map((ticket) => ({
      ref: ticket.ref,
      category: ticket.category,
      orderCode: ticket.orderCode,
      state: claimStateOf(ticket, at),
      updatedAt: ticket.updatedAt,
    }));
}

export type ClaimOrderInfo = {
  code: string;
  service: ServiceCode;
  /** R802: the declared value of the order's parcels, when there is one. Shown, never used in a refund. */
  declaredValueMillimes: number | null;
  /** When the last parcel was handed over, if any. */
  deliveredAt: string | null;
};

function orderInfo(orderCode: string, service: ServiceCode): ClaimOrderInfo {
  const parcels = parcelsOf(orderCode);
  const declared = parcels.filter((p) => p.declaredValueMillimes !== null);
  const handedOver = Object.values(readTable<StatusEvent>(STATUS_EVENTS))
    .filter(
      (event) =>
        event.subjectType === "parcel" &&
        event.toStatus === "handed_over" &&
        parcels.some((p) => p.id === event.subjectId),
    )
    .map((event) => event.occurredAt)
    .sort();
  return {
    code: orderCode,
    service,
    declaredValueMillimes: declared.length
      ? declared.reduce((sum, p) => sum + (p.declaredValueMillimes ?? 0), 0)
      : null,
    deliveredAt: handedOver.at(-1) ?? null,
  };
}

export type ClaimMessageView = {
  id: string;
  from: "you" | "staff";
  at: string;
  body: string;
  attachments: AttachmentMeta[];
};

export type ClaimDetail = {
  ref: string;
  category: ClaimCategory;
  state: ClaimState;
  createdAt: string;
  updatedAt: string;
  invoiceNumber: string | null;
  order: ClaimOrderInfo;
  /** Only the messages the client may read (T30): the shape has no `isInternal` at all. */
  messages: ClaimMessageView[];
  /** R804: the closed claim can be reopened until this instant. */
  reopenableUntil: string | null;
  canReply: boolean;
  canReopen: boolean;
};

export type ClaimResult = { status: "found"; claim: ClaimDetail } | { status: "notFound" };

/** Mock of GET /v1/tickets/{ref}. */
export async function getClaim(session: Session, ref: string): Promise<ClaimResult> {
  await mockDelay();
  if (consumeFailNext("getClaim")) throw new NetworkError();
  const ticket = ownTicket(session, ref);
  if (!ticket) return { status: "notFound" };
  const order = getAccountOrder(session, ticket.orderCode);
  if ("notFound" in order) return { status: "notFound" };
  const state = claimStateOf(ticket, now());
  return {
    status: "found",
    claim: {
      ref: ticket.ref,
      category: ticket.category,
      state,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      invoiceNumber: ticket.invoiceNumber,
      order: orderInfo(order.code, order.service),
      messages: messagesOf(ticket.ref)
        .filter((m) => !m.isInternal)
        .map((m) => ({
          id: m.id,
          from: m.author === "client" ? "you" : "staff",
          at: m.at,
          body: m.body,
          attachments: m.attachments,
        })),
      reopenableUntil: state === "resolved" ? reopenableUntil(ticket) : null,
      canReply: state === "open" || state === "toComplete",
      canReopen: state === "resolved",
    },
  };
}

// ── New claim (C07) ───────────────────────────────────────────────────────────────────────────

export type ClaimContext =
  | {
      status: "ready";
      /** The invoice contested from C05, when there is one. */
      invoiceNumber: string | null;
      /** The orders the client may pick from: the invoice's orders, or all of hers. */
      orders: { code: string; service: ServiceCode; createdAt: string }[];
      /** The chosen order: from `commande`, or the only order of the invoice. */
      selected: ClaimOrderInfo | null;
    }
  | { status: "notFound" };

/**
 * What C07 needs to open: `commande` (an order code, from CMD-08 or the list) and `facture` (an
 * invoice number, from "Contester"). An order or invoice that is not hers answers `notFound`, like a
 * missing one. With an invoice of several orders, nothing is selected until the client picks one.
 */
export async function getClaimContext(
  session: Session,
  query: { commande: string | null; facture: string | null },
): Promise<ClaimContext> {
  await mockDelay();
  if (consumeFailNext("getClaimContext")) throw new NetworkError();
  let invoiceNumber: string | null = null;
  let allowed: string[] | null = null;
  if (query.facture) {
    const found = await getInvoice(session, query.facture);
    if (found.status !== "found" || found.kind !== "invoice") return { status: "notFound" };
    invoiceNumber = found.invoice.number;
    allowed = found.invoice.orderCodes;
  }
  const own = listAccountOrders(session).filter(
    (order) => !allowed || allowed.includes(order.code),
  );
  let selected: ClaimOrderInfo | null = null;
  if (query.commande) {
    const order = getAccountOrder(session, query.commande);
    if ("notFound" in order) return { status: "notFound" };
    if (allowed && !allowed.includes(order.code)) return { status: "notFound" };
    selected = orderInfo(order.code, order.service);
  } else if (allowed && own.length === 1) {
    selected = orderInfo(own[0]!.code, own[0]!.service);
  }
  return {
    status: "ready",
    invoiceNumber,
    orders: own.map((order) => ({
      code: order.code,
      service: order.service,
      createdAt: order.createdAt,
    })),
    selected,
  };
}

export type ClaimError =
  | "orderNotFound"
  | "invoiceNotFound"
  | "categoryInvalid"
  | "messageRequired"
  | "idempotencyConflict"
  | `attachment.${AttachmentError}`;

export type NewClaim = {
  orderCode: string;
  category: ClaimCategory;
  invoiceNumber: string | null;
  message: string;
  attachments: AttachmentMeta[];
};

export type CreateClaimResult =
  { status: "created"; ref: string; replay: boolean } | { status: "refused"; error: ClaimError };

const print = (value: unknown) => JSON.stringify(value);

function replayOf(
  key: string,
  fingerprint: string,
): { status: "same"; ref: string } | { status: "conflict" } | null {
  const known = readTable<{ fingerprint: string; ref: string }>(TICKET_KEYS)[key];
  if (!known) return null;
  return known.fingerprint === fingerprint
    ? { status: "same", ref: known.ref }
    : { status: "conflict" };
}

function nextRef(): string {
  const numbers = Object.keys(readTable<Ticket>(TICKETS)).map((ref) => Number(ref.slice(2)));
  return `T-${Math.max(2040, ...numbers.filter(Number.isFinite)) + 1}`;
}

/**
 * Mock of POST /v1/tickets with an Idempotency-Key (ADR-6): the same key and request give the same
 * claim again. Every refusal comes before the first write. An order or invoice that is not hers is
 * `orderNotFound` / `invoiceNotFound`. The order and its parcels are never changed.
 */
export async function createClaim(
  session: Session,
  input: NewClaim,
  idempotencyKey: string,
): Promise<CreateClaimResult> {
  await mockDelay();
  if (consumeFailNext("createClaim")) throw new NetworkError();
  seedBillingFixtures();
  const fingerprint = print(input);
  const known = replayOf(`${session.accountId}:${idempotencyKey}`, fingerprint);
  if (known?.status === "conflict") return { status: "refused", error: "idempotencyConflict" };
  if (known) return { status: "created", ref: known.ref, replay: true };

  if (!CLAIM_CATEGORIES.includes(input.category)) {
    return { status: "refused", error: "categoryInvalid" };
  }
  const order = getAccountOrder(session, input.orderCode);
  if ("notFound" in order) return { status: "refused", error: "orderNotFound" };
  if (input.invoiceNumber) {
    const invoice = await getInvoice(session, input.invoiceNumber);
    if (
      invoice.status !== "found" ||
      invoice.kind !== "invoice" ||
      !invoice.invoice.orderCodes.includes(order.code)
    ) {
      return { status: "refused", error: "invoiceNotFound" };
    }
  }
  if (!input.message.trim()) return { status: "refused", error: "messageRequired" };
  const problem = attachmentError(input.attachments);
  if (problem) return { status: "refused", error: `attachment.${problem}` };

  const at = new Date(now()).toISOString();
  const ref = nextRef();
  writeRow<Ticket>(TICKETS, ref, {
    ref,
    orderCode: order.code,
    ownerAccountId: session.accountId,
    openedBy: session.userId,
    category: input.category,
    status: "open",
    invoiceNumber: input.invoiceNumber,
    createdAt: at,
    updatedAt: at,
    closedAt: null,
    archivedAt: null,
  });
  writeRow<TicketMessage>(TICKET_MESSAGES, `m-${ref}-1`, {
    id: `m-${ref}-1`,
    ticketRef: ref,
    author: "client",
    authorId: session.userId,
    body: input.message.trim(),
    at,
    isInternal: false,
    attachments: input.attachments,
  });
  writeRow(TICKET_KEYS, `${session.accountId}:${idempotencyKey}`, { fingerprint, ref });
  return { status: "created", ref, replay: false };
}

export type PostMessageResult =
  | { status: "sent"; replay: boolean }
  | { status: "notFound" }
  | { status: "closed" }
  | { status: "archived" }
  | {
      status: "refused";
      error: Exclude<ClaimError, "orderNotFound" | "invoiceNotFound" | "categoryInvalid">;
    };

/**
 * Mock of POST /v1/tickets/{ref}/messages with an Idempotency-Key. The state is read again at call
 * time: a closed claim must be reopened first, an archived one is read-only (R804). A reply of the
 * client to a claim that was "à compléter" makes it open again.
 */
export async function postClaimMessage(
  session: Session,
  ref: string,
  input: { message: string; attachments: AttachmentMeta[] },
  idempotencyKey: string,
): Promise<PostMessageResult> {
  await mockDelay();
  if (consumeFailNext("postClaimMessage")) throw new NetworkError();
  const ticket = ownTicket(session, ref);
  if (!ticket) return { status: "notFound" };
  const fingerprint = print({ ref, ...input });
  const known = replayOf(`${session.accountId}:${idempotencyKey}`, fingerprint);
  if (known?.status === "conflict") return { status: "refused", error: "idempotencyConflict" };
  if (known) return { status: "sent", replay: true };

  const state = claimStateOf(ticket, now());
  if (state === "archived") return { status: "archived" };
  if (state === "resolved") return { status: "closed" };
  if (!input.message.trim()) return { status: "refused", error: "messageRequired" };
  const problem = attachmentError(input.attachments);
  if (problem) return { status: "refused", error: `attachment.${problem}` };

  const at = new Date(now()).toISOString();
  const id = `m-${ref}-${messagesOf(ref).length + 1}`;
  writeRow<TicketMessage>(TICKET_MESSAGES, id, {
    id,
    ticketRef: ref,
    author: "client",
    authorId: session.userId,
    body: input.message.trim(),
    at,
    isInternal: false,
    attachments: input.attachments,
  });
  writeRow<Ticket>(TICKETS, ref, { ...ticket, status: "open", updatedAt: at });
  writeRow(TICKET_KEYS, `${session.accountId}:${idempotencyKey}`, { fingerprint, ref });
  return { status: "sent", replay: false };
}

export type ReopenResult =
  | { status: "reopened" }
  | { status: "notFound" }
  | { status: "notClosed" }
  | { status: "archived" };

/** Mock of the reopen route: allowed while the claim is closed and the window has not passed (R804). */
export async function reopenClaim(session: Session, ref: string): Promise<ReopenResult> {
  await mockDelay();
  if (consumeFailNext("reopenClaim")) throw new NetworkError();
  const ticket = ownTicket(session, ref);
  if (!ticket) return { status: "notFound" };
  const state = claimStateOf(ticket, now());
  if (state === "archived") return { status: "archived" };
  if (state !== "resolved") return { status: "notClosed" };
  writeRow<Ticket>(TICKETS, ref, {
    ...ticket,
    status: "open",
    closedAt: null,
    updatedAt: new Date(now()).toISOString(),
  });
  return { status: "reopened" };
}
