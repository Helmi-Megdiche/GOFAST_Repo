/** Mock tables of the claims (ESP-06): `tickets` and `ticket_messages` of the cahier. */
export const TICKETS = "fg.mock.tickets";
export const TICKET_MESSAGES = "fg.mock.ticketMessages";
/** Replay by key (ADR-6): Idempotency-Key to the ticket or message it created. */
export const TICKET_KEYS = "fg.mock.ticketKeys";

export const CLAIM_CATEGORIES = ["damage", "loss", "delay", "billing", "other"] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

/** The mockup's names (H13): "Ouverte", "À compléter" (the client must answer), "Résolu". Archived is derived (R804). */
export type TicketStatus = "open" | "toComplete" | "resolved";

export type Ticket = {
  /** `T-NNNN`. */
  ref: string;
  orderCode: string;
  ownerAccountId: string;
  openedBy: string;
  category: ClaimCategory;
  status: TicketStatus;
  /** The invoice contested from C05, when the claim comes from there. */
  invoiceNumber: string | null;
  createdAt: string;
  updatedAt: string;
  /** ISO UTC; set while resolved. */
  closedAt: string | null;
  /** ISO UTC; set once the reopen window has passed. */
  archivedAt: string | null;
};

export type AttachmentMeta = { name: string; sizeBytes: number; type: string };

export type TicketMessage = {
  id: string;
  ticketRef: string;
  author: "client" | "staff";
  authorId: string;
  body: string;
  at: string;
  /** T30: an internal note is never returned to the client. */
  isInternal: boolean;
  attachments: AttachmentMeta[];
};
