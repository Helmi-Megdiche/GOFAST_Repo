import { describe, expect, it } from "vitest";
import { makeQuote } from "./pricing";
import { buildOrderRequest } from "./request";
import { priceInputOf, quoteMatches, redirectFor, STEPS, withNewQuote } from "./steps";
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
