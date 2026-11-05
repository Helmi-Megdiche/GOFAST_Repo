import { describe, expect, it } from "vitest";
import type { ZoneResult } from "../data/zones";
import { makeQuote } from "./pricing";
import { buildOrderRequest } from "./request";
import {
  offeredServices,
  priceInputOf,
  quoteMatches,
  redirectFor,
  STEPS,
  withNewQuote,
} from "./steps";
import { availableSlots } from "./slots";
import { readyDraft } from "./test-draft";

const T0 = Date.parse("2026-11-04T08:30:00Z"); // 09:30 in Tunis

describe("declared value (stored in millimes, whatever the language)", () => {
  it("an amount typed in English passes the guard and reaches the request", () => {
    const draft = readyDraft(T0);
    draft.parcel.declaredValueMillimes = 1_152_000;
    expect(redirectFor(draft, "review", T0)).toBeNull();
    expect(buildOrderRequest(draft, true)?.parcel.declaredValueMillimes).toBe(1_152_000);
  });

  it("a stored amount that is not a safe positive integer stops at W13", () => {
    const draft = readyDraft(T0);
    draft.parcel.declaredValueMillimes = 1.5;
    expect(redirectFor(draft, "review", T0)).toBe("parcel");
    expect(buildOrderRequest(draft, true)).toBeNull();
  });
});

describe("declared value typed but not readable (final review I2)", () => {
  it("text that does not parse stops at W13 and is never sent, whatever amount was kept", () => {
    const draft = readyDraft(T0);
    // "2,5000" typed after "2,500": the last valid amount is still stored.
    draft.parcel = { ...draft.parcel, declaredValueMillimes: 2_500, declaredValueInvalid: true };
    expect(redirectFor(draft, "review", T0)).toBe("parcel");
    expect(redirectFor(draft, "service", T0)).toBe("parcel");
    expect(buildOrderRequest(draft, true)).toBeNull();
  });

  it("a readable amount (or an empty field) clears the marker and passes", () => {
    const draft = readyDraft(T0);
    draft.parcel = { ...draft.parcel, declaredValueInvalid: false };
    expect(redirectFor(draft, "review", T0)).toBeNull();
    expect(buildOrderRequest(draft, true)?.parcel).not.toHaveProperty("declaredValueInvalid");
  });
});

describe("W15 guard and the quote (R205)", () => {
  it("a weight changed after the quote sends W15 back to W14", () => {
    const draft = readyDraft(T0);
    draft.parcel.weightKg = "5";
    expect(quoteMatches(draft)).toBe(false);
    expect(redirectFor(draft, "review", T0)).toBe("service");
  });

  it("a changed address needs a new quote too, since distance is priced", () => {
    const draft = readyDraft(T0);
    draft.recipient.address = { ...draft.recipient.address, text: "Avenue Habib Bourguiba" };
    expect(quoteMatches(draft)).toBe(false);
    const pinned = readyDraft(T0);
    pinned.recipient.address = { ...pinned.recipient.address, pin: { x: 0.5, y: 0.5 } };
    expect(quoteMatches(pinned)).toBe(false);
  });

  it("the recalculation input is rebuilt from the draft, not from the old quote", () => {
    const draft = readyDraft(T0);
    draft.parcel.weightKg = "5";
    expect(priceInputOf(draft)?.weightKg).toBe(5);
    const next = withNewQuote(draft, makeQuote(priceInputOf(draft)!, T0 + 1));
    expect(quoteMatches(next)).toBe(true);
  });

  it("keeps the previous accepted total in the draft until the new price is accepted", () => {
    const draft = readyDraft(T0);
    const first = withNewQuote(draft, makeQuote(priceInputOf(draft)!, T0 + 15 * 60_000));
    expect(first.previousTotalMillimes).toBe(11_305);
    expect(first.acceptedQuoteId).toBe(draft.quote!.id);
    // A second recalculation before acceptance keeps the price the customer had accepted.
    const changed = { ...first, quote: { ...first.quote!, totalMillimes: 99_000 } };
    const second = withNewQuote(changed, makeQuote(priceInputOf(draft)!, T0 + 30 * 60_000));
    expect(second.previousTotalMillimes).toBe(11_305);
  });
});

describe("a pending answer (R202)", () => {
  it("goes to W15 before any other check, from every step", () => {
    const draft = { ...readyDraft(T0), pendingSubmit: { fingerprint: "x" } };
    const later = Date.parse(draft.sender.slot!.startUtc) + 60_000; // the pickup slot started
    for (const step of STEPS) {
      expect(redirectFor(draft, step, later)).toBe(step === "review" ? null : "review");
    }
    const outOfZone = structuredClone(draft);
    outOfZone.recipient.address.zone = { status: "out-of-zone" };
    expect(redirectFor(outOfZone, "sender", T0)).toBe("review");
  });
});

describe("services offered by both addresses (CMD-04)", () => {
  const TWO: ZoneResult = { status: "in-zone", services: ["express", "standard"], zone: "A" };

  /** Programmée accepted at W14, then one address changed to a zone without it. */
  function scheduledThenTwoServices(side: "sender" | "recipient") {
    const draft = readyDraft(T0);
    const slots = availableSlots(T0);
    draft.sender.slot = slots[slots.length - 1]!;
    draft.service = { code: "scheduled", slot: slots[0]! };
    draft[side].address = { ...draft[side].address, zone: TWO };
    // Priced again with the new address, as the old W14 did: the quote matches the draft.
    draft.quote = makeQuote(priceInputOf(draft)!, T0);
    draft.acceptedQuoteId = draft.quote.id;
    return draft;
  }

  it("are the services both the departure and the arrival zones offer", () => {
    const draft = readyDraft(T0);
    expect(offeredServices(draft)).toEqual(["express", "standard", "scheduled"]);
    draft.recipient.address = { ...draft.recipient.address, zone: TWO };
    expect(offeredServices(draft)).toEqual(["express", "standard"]);
    const sender = readyDraft(T0);
    sender.sender.address = { ...sender.sender.address, zone: TWO };
    expect(offeredServices(sender)).toEqual(["express", "standard"]);
    const unknown = readyDraft(T0);
    unknown.recipient.address = { ...unknown.recipient.address, zone: { status: "unknown" } };
    expect(offeredServices(unknown)).toEqual([]);
  });

  it("a service one address no longer offers sends W15 back to W14", () => {
    for (const side of ["sender", "recipient"] as const) {
      const draft = scheduledThenTwoServices(side);
      expect(quoteMatches(draft)).toBe(true);
      expect(redirectFor(draft, "review", T0)).toBe("service");
      expect(redirectFor(draft, "service", T0)).toBeNull();
    }
  });
});
