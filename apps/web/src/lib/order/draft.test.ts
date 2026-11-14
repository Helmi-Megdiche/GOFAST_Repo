import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBrokenStorage, useMemoryStorage } from "../storage";
import { setClock } from "./clock";
import { DRAFT_RETENTION_MS } from "@fastgo/domain";
import {
  clearDraft,
  DRAFT_KEY,
  editDraft,
  emptyDraft,
  loadDraft,
  saveDraft,
  seedFromHome,
  updateDraft,
  withSenderPhone,
} from "./draft";
import { readyDraft } from "./test-draft";

const T0 = Date.parse("2026-11-04T10:00:00Z");
let store: Map<string, string>;

beforeEach(() => {
  store = useMemoryStorage();
  // editDraft and loadDraft read the clock when no time is passed: pin it near the fixed T0 so the
  // 24 h retention never depends on the day the suite runs.
  setClock(() => T0 + 2);
});

afterEach(() => {
  setClock();
});

describe("order draft (CMD-07)", () => {
  it("keeps everything under one key", () => {
    saveDraft(emptyDraft(T0), T0);
    expect([...store.keys()]).toEqual([DRAFT_KEY]);
  });

  it("is kept 24 h after the last edit, and each edit restarts the window", () => {
    expect(DRAFT_RETENTION_MS).toBe(24 * 3_600_000);
    saveDraft(emptyDraft(T0), T0);
    expect(loadDraft(T0 + DRAFT_RETENTION_MS - 1)).not.toBeNull();
    updateDraft((draft) => draft, T0 + 60_000);
    expect(loadDraft(T0 + DRAFT_RETENTION_MS + 30_000)).not.toBeNull();
    expect(loadDraft(T0 + 60_000 + DRAFT_RETENTION_MS)).toBeNull();
    expect(store.has(DRAFT_KEY)).toBe(false); // an expired draft is deleted on read
  });

  it("stops extending once a submit was attempted", () => {
    const draft = saveDraft({ ...emptyDraft(T0), submitAttemptedAt: T0 }, T0);
    const frozen = draft.expiresAt;
    const later = updateDraft((d) => d, T0 + 3_600_000);
    expect(later.expiresAt).toBe(frozen);
  });

  it("reads corrupted JSON, an unknown version or broken storage as an empty draft", () => {
    store.set(DRAFT_KEY, "{not json");
    expect(loadDraft(T0)).toBeNull();
    store.set(DRAFT_KEY, JSON.stringify({ ...emptyDraft(T0), version: 99 }));
    expect(loadDraft(T0)).toBeNull();
    expect(store.has(DRAFT_KEY)).toBe(false);

    useBrokenStorage();
    expect(loadDraft(T0)).toBeNull();
    expect(() => saveDraft(emptyDraft(T0), T0)).not.toThrow();
    expect(() => clearDraft()).not.toThrow();
  });

  it("reads a draft with the right version but a broken shape as empty, and deletes it", () => {
    const base = { version: 1, expiresAt: T0 + 60_000, idempotencyKey: "k" };
    const broken = [
      { ...base, sender: null, recipient: null, parcel: null, service: null },
      { ...base, sender: {}, recipient: {}, parcel: {}, service: {} },
      { ...emptyDraft(T0), sender: { ...emptyDraft(T0).sender, address: "x" } },
      { ...emptyDraft(T0), parcel: { ...emptyDraft(T0).parcel, declaredValueMillimes: "1e3" } },
      { ...emptyDraft(T0), parcel: { ...emptyDraft(T0).parcel, declaredValueInvalid: "yes" } },
      { ...emptyDraft(T0), service: { code: "teleport", slot: null } },
      { ...emptyDraft(T0), quote: "free" },
      { ...emptyDraft(T0), payment: "card" },
    ];
    for (const value of broken) {
      store.set(DRAFT_KEY, JSON.stringify(value));
      expect(loadDraft(T0)).toBeNull();
      expect(store.has(DRAFT_KEY)).toBe(false);
    }
    const ready = readyDraft(T0);
    store.set(DRAFT_KEY, JSON.stringify(ready));
    expect(loadDraft(T0)).toEqual(ready);
  });

  it("is cleared after the order", () => {
    saveDraft(emptyDraft(T0), T0);
    clearDraft();
    expect(loadDraft(T0)).toBeNull();
  });
});

describe("home 'Voir le prix' seeds the draft", () => {
  it("replaces typed addresses and clears their confirmed state and zone", () => {
    updateDraft(
      (draft) => ({
        ...draft,
        sender: {
          ...draft.sender,
          address: {
            text: "Rue Ibn Khaldoun",
            confirmed: true,
            pin: null,
            zone: { status: "out-of-zone" },
            landmark: "",
          },
        },
      }),
      T0,
    );
    const draft = seedFromHome("Avenue Habib Bourguiba", "", T0);
    expect(draft.sender.address).toMatchObject({
      text: "Avenue Habib Bourguiba",
      confirmed: false,
      zone: null,
    });
    expect(draft.recipient.address.text).toBe("");
  });

  it("keeps the draft's address when the home field is empty", () => {
    updateDraft(
      (draft) => ({
        ...draft,
        recipient: {
          ...draft.recipient,
          address: {
            text: "Rue Ibn Khaldoun",
            confirmed: true,
            pin: null,
            zone: null,
            landmark: "",
          },
        },
      }),
      T0,
    );
    expect(seedFromHome("", "  ", T0).recipient.address).toMatchObject({
      text: "Rue Ibn Khaldoun",
      confirmed: true,
    });
  });
});

describe("verified phone", () => {
  it("is cleared when the sender phone changes, kept when it does not", () => {
    const draft = { ...emptyDraft(T0), verifiedPhone: "+21620000000" };
    expect(withSenderPhone(draft, "+216 20 000 000").verifiedPhone).toBe("+21620000000");
    expect(withSenderPhone(draft, "+21620000001").verifiedPhone).toBeNull();
  });
});

describe("a step's edit (two tabs, R202)", () => {
  it("applies to the latest saved draft, not to the copy this tab loaded", () => {
    const shown = saveDraft(emptyDraft(T0), T0);
    updateDraft((draft) => ({ ...draft, termsAccepted: true }), T0 + 1);
    const next = editDraft(shown.idempotencyKey, (draft) => ({ ...draft, payment: "cashPickup" }));
    expect(next).toMatchObject({ termsAccepted: true, payment: "cashPickup" });
    expect(loadDraft()).toMatchObject({ termsAccepted: true, payment: "cashPickup" });
  });

  it("refuses a draft that was cleared or replaced elsewhere, and never restores it", () => {
    const shown = saveDraft(emptyDraft(T0), T0);
    clearDraft();
    expect(
      editDraft(shown.idempotencyKey, (draft) => ({ ...draft, payment: "cashPickup" })),
    ).toBeNull();
    expect(loadDraft()).toBeNull();
    saveDraft(emptyDraft(T0), T0);
    expect(editDraft(shown.idempotencyKey, (draft) => draft)).toBeNull();
  });

  it("refuses edits while an answer is pending, so the expiry freeze stays", () => {
    const pending = saveDraft(
      { ...emptyDraft(T0), submitAttemptedAt: T0, pendingSubmit: { fingerprint: "x" } },
      T0,
    );
    const later = T0 + 3_600_000;
    expect(
      editDraft(pending.idempotencyKey, (draft) => ({ ...draft, pendingSubmit: null }), later),
    ).toBeNull();
    expect(loadDraft(later)).toEqual(pending);
  });
});
