import { beforeEach, describe, expect, it } from "vitest";
import { attachmentError } from "../claims/attachments";
import { setClock } from "../order/clock";
import {
  CLAIM_ATTACHMENT_MAX_BYTES,
  CLAIM_ATTACHMENT_MAX_FILES,
  CLAIM_REOPEN_WINDOW_MS,
} from "../order/constants";
import { useMemoryStorage, writeJson } from "../storage";
import { parcelsOf } from "./account-orders";
import { TICKET_MESSAGES, TICKETS, type Ticket, type TicketMessage } from "./claim-model";
import {
  claimStateOf,
  createClaim,
  getClaim,
  getClaimContext,
  listClaims,
  postClaimMessage,
  reopenClaim,
  type NewClaim,
} from "./claims";
import { seedBillingFixtures } from "./fixtures/billing";
import { readTable } from "./mock-db";
import { ACCOUNT_ORDERS, PARCELS, STATUS_EVENTS } from "./order-model";
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

const NOW = Date.parse("2026-11-07T10:00:00Z");
const CLOSED_AT = Date.parse("2026-11-02T10:00:00Z");

beforeEach(() => {
  useMemoryStorage();
  setClock(() => NOW);
});

const input = (extra: Partial<NewClaim> = {}): NewClaim => ({
  orderCode: "FG-5A1D-0008",
  category: "damage",
  invoiceNumber: null,
  message: "Le colis est abîmé.",
  attachments: [],
  ...extra,
});

describe("R804 reopening", () => {
  it("a closed claim reopens before closedAt + the window, and not after", async () => {
    setClock(() => CLOSED_AT + CLAIM_REOPEN_WINDOW_MS - 1);
    expect((await reopenClaim(customer, "T-1988")).status).toBe("reopened");
    const reopened = await getClaim(customer, "T-1988");
    if (reopened.status !== "found") throw new Error("not found");
    expect(reopened.claim.state).toBe("open");
    expect(reopened.claim.canReply).toBe(true);
  });

  it("at the end of the window the claim is archived and refuses a reopening", async () => {
    setClock(() => CLOSED_AT + CLAIM_REOPEN_WINDOW_MS);
    expect(await reopenClaim(customer, "T-1988")).toEqual({ status: "archived" });
    const archived = await getClaim(customer, "T-1988");
    if (archived.status !== "found") throw new Error("not found");
    expect(archived.claim.state).toBe("archived");
    expect(archived.claim.canReopen).toBe(false);
    expect(archived.claim.canReply).toBe(false);
  });

  it("an archived claim refuses a message, and so does a closed one until it is reopened", async () => {
    setClock(() => CLOSED_AT + CLAIM_REOPEN_WINDOW_MS + 1);
    seedBillingFixtures();
    const before = Object.keys(readTable(TICKET_MESSAGES)).length;
    expect(
      await postClaimMessage(customer, "T-1988", { message: "Bonjour", attachments: [] }, "k1"),
    ).toEqual({ status: "archived" });
    setClock(() => NOW);
    expect(
      await postClaimMessage(customer, "T-1988", { message: "Bonjour", attachments: [] }, "k2"),
    ).toEqual({ status: "closed" });
    expect(Object.keys(readTable(TICKET_MESSAGES)).length).toBe(before);
  });

  it("an open claim cannot be reopened", async () => {
    expect(await reopenClaim(customer, "T-2041")).toEqual({ status: "notClosed" });
  });

  it("claimStateOf derives archived from the closing time and the window", () => {
    const ticket = {
      status: "resolved",
      closedAt: new Date(CLOSED_AT).toISOString(),
      archivedAt: null,
    } as Ticket;
    expect(claimStateOf(ticket, CLOSED_AT)).toBe("resolved");
    expect(claimStateOf(ticket, CLOSED_AT + CLAIM_REOPEN_WINDOW_MS)).toBe("archived");
    expect(claimStateOf({ ...ticket, archivedAt: "2026-12-01T00:00:00.000Z" }, CLOSED_AT)).toBe(
      "archived",
    );
  });
});

describe("T30 internal notes", () => {
  it("the fixture has an internal note, and the client never receives it", async () => {
    seedBillingFixtures();
    const internal = Object.values(readTable<TicketMessage>(TICKET_MESSAGES)).filter(
      (m) => m.isInternal,
    );
    expect(internal.length).toBeGreaterThan(0);
    const result = await getClaim(customer, "T-2041");
    if (result.status !== "found") throw new Error("not found");
    const json = JSON.stringify(result);
    for (const note of internal) expect(json).not.toContain(note.body);
    expect(json).not.toContain("isInternal");
    expect(json).not.toContain("NOTE INTERNE");
    expect(result.claim.messages.map((m) => m.from)).toEqual(["you", "staff"]);
  });
});

describe("a claim leaves the order alone", () => {
  it("a damage claim on a delivered parcel changes no parcel, order or event", async () => {
    const snapshot = () => ({
      parcels: JSON.stringify(readTable(PARCELS)),
      orders: JSON.stringify(readTable(ACCOUNT_ORDERS)),
      events: JSON.stringify(readTable(STATUS_EVENTS)),
    });
    await getClaim(customer, "T-2041"); // seeds
    const before = snapshot();
    expect(parcelsOf("FG-5A1D-0008")[0]!.status).toBe("handed_over");
    const result = await createClaim(customer, input(), "key-damage");
    expect(result.status).toBe("created");
    expect(snapshot()).toEqual(before);
    expect(parcelsOf("FG-5A1D-0008")[0]!.status).toBe("handed_over");
  });
});

describe("creating a claim", () => {
  it("opens T-2042 for the order, in state open, with the first message", async () => {
    const result = await createClaim(customer, input(), "key-1");
    expect(result).toEqual({ status: "created", ref: "T-2042", replay: false });
    const claim = await getClaim(customer, "T-2042");
    if (claim.status !== "found") throw new Error("not found");
    expect(claim.claim.state).toBe("open");
    expect(claim.claim.messages).toHaveLength(1);
    expect(claim.claim.order.declaredValueMillimes).toBe(120_000);
  });

  it("replaying the key gives the same claim and writes nothing; a different request conflicts", async () => {
    await createClaim(customer, input(), "key-1");
    const tickets = Object.keys(readTable(TICKETS)).length;
    expect(await createClaim(customer, input(), "key-1")).toEqual({
      status: "created",
      ref: "T-2042",
      replay: true,
    });
    expect(Object.keys(readTable(TICKETS)).length).toBe(tickets);
    expect(await createClaim(customer, input({ message: "Autre" }), "key-1")).toEqual({
      status: "refused",
      error: "idempotencyConflict",
    });
  });

  it("replaying a message key does not duplicate the message", async () => {
    const body = { message: "Voici la photo.", attachments: [] };
    expect(await postClaimMessage(customer, "T-2041", body, "m-key")).toEqual({
      status: "sent",
      replay: false,
    });
    expect(await postClaimMessage(customer, "T-2041", body, "m-key")).toEqual({
      status: "sent",
      replay: true,
    });
    const claim = await getClaim(customer, "T-2041");
    if (claim.status !== "found") throw new Error("not found");
    expect(claim.claim.messages.filter((m) => m.body === "Voici la photo.")).toHaveLength(1);
    expect(claim.claim.state).toBe("open"); // was "à compléter": the client answered
  });

  it("refuses an empty message, another account's order and an unknown invoice, writing nothing", async () => {
    seedBillingFixtures();
    const tickets = Object.keys(readTable(TICKETS)).length;
    expect(await createClaim(customer, input({ message: "   " }), "a")).toEqual({
      status: "refused",
      error: "messageRequired",
    });
    expect(await createClaim(customer, input({ orderCode: "FG-5B2A-0001" }), "b")).toEqual({
      status: "refused",
      error: "orderNotFound",
    });
    expect(await createClaim(customer, input({ invoiceNumber: "FAC-2026-0000005" }), "c")).toEqual({
      status: "refused",
      error: "invoiceNotFound",
    });
    // An invoice of hers that does not cover the chosen order.
    expect(await createClaim(customer, input({ invoiceNumber: "FAC-2026-0000001" }), "d")).toEqual({
      status: "refused",
      error: "invoiceNotFound",
    });
    expect(Object.keys(readTable(TICKETS)).length).toBe(tickets);
  });

  it("the server applies the attachment rules too", async () => {
    const file = (sizeBytes: number, type = "image/png") => ({ name: "a.png", sizeBytes, type });
    expect(
      (
        await createClaim(
          customer,
          input({ attachments: [file(CLAIM_ATTACHMENT_MAX_BYTES)] }),
          "ok",
        )
      ).status,
    ).toBe("created");
    expect(
      await createClaim(
        customer,
        input({ attachments: [file(CLAIM_ATTACHMENT_MAX_BYTES + 1)] }),
        "big",
      ),
    ).toEqual({ status: "refused", error: "attachment.tooLarge" });
    expect(
      await createClaim(customer, input({ attachments: [file(10, "application/msword")] }), "doc"),
    ).toEqual({ status: "refused", error: "attachment.badType" });
  });

  it("a cut network throws NetworkError", async () => {
    writeJson("fg.mock.failNext:createClaim", true);
    await expect(createClaim(customer, input(), "k")).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("attachment rules", () => {
  const png = (sizeBytes = 100, name = "a.png") => ({ name, sizeBytes, type: "image/png" });

  it("exactly 5 MB passes and one byte more is refused", () => {
    expect(attachmentError([png(CLAIM_ATTACHMENT_MAX_BYTES)])).toBeNull();
    expect(attachmentError([png(CLAIM_ATTACHMENT_MAX_BYTES + 1)])).toBe("tooLarge");
  });

  it("5 files pass, a sixth is refused", () => {
    expect(
      attachmentError(Array.from({ length: CLAIM_ATTACHMENT_MAX_FILES }, () => png())),
    ).toBeNull();
    expect(
      attachmentError(Array.from({ length: CLAIM_ATTACHMENT_MAX_FILES + 1 }, () => png())),
    ).toBe("tooMany");
  });

  it("accepts images and PDF, refuses a .docx, and reads the extension when the type is empty", () => {
    expect(attachmentError([{ name: "a.pdf", sizeBytes: 1, type: "application/pdf" }])).toBeNull();
    expect(attachmentError([{ name: "a.jpg", sizeBytes: 1, type: "" }])).toBeNull();
    expect(attachmentError([{ name: "a.docx", sizeBytes: 1, type: "" }])).toBe("badType");
    expect(
      attachmentError([
        {
          name: "a.docx",
          sizeBytes: 1,
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ]),
    ).toBe("badType");
  });
});

describe("scope (EX06 to EX12)", () => {
  it("another account's claim answers exactly like a missing one", async () => {
    const other = await getClaim(customer, "T-2040");
    const missing = await getClaim(customer, "T-9999");
    expect(other).toEqual({ status: "notFound" });
    expect(other).toEqual(missing);
    expect(await reopenClaim(customer, "T-2040")).toEqual({ status: "notFound" });
    expect(
      await postClaimMessage(customer, "T-2040", { message: "x", attachments: [] }, "z"),
    ).toEqual({ status: "notFound" });
  });

  it("the list holds only the account's claims, most recently updated first", async () => {
    const rows = await listClaims(customer);
    expect(rows.map((r) => r.ref)).toEqual(["T-2041", "T-1988"]);
    expect(rows.map((r) => r.state)).toEqual(["toComplete", "resolved"]);
  });
});

describe("C07 context", () => {
  it("?commande= selects her order with its declared value and delivery date", async () => {
    const context = await getClaimContext(customer, { commande: "FG-5A1D-0008", facture: null });
    if (context.status !== "ready") throw new Error("not ready");
    expect(context.selected?.code).toBe("FG-5A1D-0008");
    expect(context.selected?.declaredValueMillimes).toBe(120_000);
    expect(context.selected?.deliveredAt).not.toBeNull();
  });

  it("an order without declared value has none", async () => {
    const context = await getClaimContext(customer, { commande: "FG-5A1M-0014", facture: null });
    if (context.status !== "ready") throw new Error("not ready");
    expect(context.selected?.declaredValueMillimes).toBeNull();
  });

  it("another account's order is not found, like an unknown one", async () => {
    const other = await getClaimContext(customer, { commande: "FG-5B2A-0001", facture: null });
    const missing = await getClaimContext(customer, { commande: "FG-ZZZZ-9999", facture: null });
    expect(other).toEqual({ status: "notFound" });
    expect(other).toEqual(missing);
  });

  it("an invoice of one order opens the claim with that order", async () => {
    const context = await getClaimContext(customer, {
      commande: null,
      facture: "FAC-2026-0000001",
    });
    if (context.status !== "ready") throw new Error("not ready");
    expect(context.invoiceNumber).toBe("FAC-2026-0000001");
    expect(context.selected?.code).toBe("FG-5A1M-0014");
  });

  it("an invoice of two orders selects none: the client must pick one of its orders", async () => {
    const context = await getClaimContext(customer, {
      commande: null,
      facture: "FAC-2026-0000002",
    });
    if (context.status !== "ready") throw new Error("not ready");
    expect(context.selected).toBeNull();
    expect(context.orders.map((o) => o.code).sort()).toEqual(["FG-5A1D-0008", "FG-5A1W-0013"]);
  });

  it("an order outside the invoice, or another account's invoice, is not found", async () => {
    expect(
      await getClaimContext(customer, { commande: "FG-5A1M-0014", facture: "FAC-2026-0000002" }),
    ).toEqual({ status: "notFound" });
    expect(
      await getClaimContext(customer, { commande: null, facture: "FAC-2026-0000005" }),
    ).toEqual({ status: "notFound" });
  });
});
