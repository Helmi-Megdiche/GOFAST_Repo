import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBrokenStorage, useMemoryStorage } from "../storage";
import { setClock } from "./clock";
import { DRAFT_RETENTION_MS } from "@fastgo/domain";
import {
  clearDraft,
  DRAFT_KEY,
  editDraft,
  emptyDraft,
  type OrderDraft,
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

describe("a draft saved before the parcel count (PR 1b)", () => {
  const old = (count: string) => {
    const draft = JSON.parse(JSON.stringify(readyDraft(T0))) as { parcel: Record<string, unknown> };
    const { weights, packaging, ...rest } = draft.parcel;
    void weights;
    void packaging;
    draft.parcel = { ...rest, count, weightKg: "2,5" };
    return draft;
  };

  it("a one-parcel draft keeps its weight, loses its old quote and is saved in the new shape", () => {
    store.set(DRAFT_KEY, JSON.stringify(old("1")));
    const loaded = loadDraft(T0);
    expect(loaded?.parcel.weights).toEqual(["2,5"]);
    expect(loaded?.parcel.packaging).toBe(false);
    expect(loaded?.quote).toBeNull();
    expect(JSON.parse(store.get(DRAFT_KEY)!).parcel.weightKg).toBeUndefined();
  });

  it("an old draft with several parcels is not read and its key is removed", () => {
    store.set(DRAFT_KEY, JSON.stringify(old("3")));
    expect(loadDraft(T0)).toBeNull();
    expect(store.has(DRAFT_KEY)).toBe(false);
  });
});

describe("draft v2: a v1 draft is migrated, never dropped (GH-10, RV-08)", () => {
  // One ready draft per test (each call makes a new idempotency key and quote id).
  const asV1 = (ready: OrderDraft = readyDraft(T0)) =>
    ({ ...JSON.parse(JSON.stringify(ready)), version: 1 }) as Record<string, unknown> & {
      quote: { lines: Record<string, unknown> } | null;
    };

  it("GH-10-D1 a stored v1 draft loads as v2 with the same addresses, parcels and choices", () => {
    const ready = readyDraft(T0);
    store.set(DRAFT_KEY, JSON.stringify(asV1(ready)));
    const loaded = loadDraft(T0);
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(2);
    expect(loaded?.sender).toEqual(ready.sender);
    expect(loaded?.recipient).toEqual(ready.recipient);
    expect(loaded?.parcel).toEqual(ready.parcel);
    expect(loaded?.service).toEqual(ready.service);
    expect(loaded?.payment).toEqual(ready.payment);
    expect(loaded?.idempotencyKey).toBe(ready.idempotencyKey);
    expect(JSON.parse(store.get(DRAFT_KEY)!).version).toBe(2);
  });

  it("GH-10-D2 a draft missing one price line is kept, its quote dropped so W14 prices it again", () => {
    const ready = readyDraft(T0);
    const stored = asV1(ready);
    expect(stored.quote).not.toBeNull();
    delete stored.quote!.lines.stamp;
    store.set(DRAFT_KEY, JSON.stringify({ ...stored, version: 2 }));
    const loaded = loadDraft(T0);
    expect(loaded).not.toBeNull();
    expect(loaded?.sender).toEqual(ready.sender);
    expect(loaded?.parcel).toEqual(ready.parcel);
    expect(loaded?.quote).toBeNull();
    expect(loaded?.acceptedQuoteId).toBeNull();
    expect(loaded?.previousTotalMillimes).toBeNull();
  });

  it("GH-10-D3 a complete quote survives the migration unchanged", () => {
    const ready = readyDraft(T0);
    store.set(DRAFT_KEY, JSON.stringify(asV1(ready)));
    expect(loadDraft(T0)?.quote).toEqual(ready.quote);
  });

  it("GH-10-D4 an unknown price line key is refused and the draft is cleared", () => {
    const stored = asV1();
    stored.quote!.lines.teleport = { unitMillimes: 1, count: 1, totalMillimes: 1 };
    store.set(DRAFT_KEY, JSON.stringify({ ...stored, version: 2 }));
    expect(loadDraft(T0)).toBeNull();
    expect(store.has(DRAFT_KEY)).toBe(false);
  });

  it("GH-10-D5 an unknown version is still cleared", () => {
    store.set(DRAFT_KEY, JSON.stringify({ ...asV1(), version: 3 }));
    expect(loadDraft(T0)).toBeNull();
    expect(store.has(DRAFT_KEY)).toBe(false);
  });

  it("GH-10-D6 a PR 1b draft (weightKg, version 1) still migrates to v2", () => {
    const old = asV1() as unknown as { parcel: Record<string, unknown> };
    const { weights, packaging, ...rest } = old.parcel;
    void weights;
    void packaging;
    old.parcel = { ...rest, count: "1", weightKg: "2,5" };
    store.set(DRAFT_KEY, JSON.stringify(old));
    const loaded = loadDraft(T0);
    expect(loaded?.version).toBe(2);
    expect(loaded?.parcel.weights).toEqual(["2,5"]);
  });

  // RV-18: a lost submit must stay retryable. A quote with a pending submit is never dropped, even
  // when it lacks a price line, because the fingerprint (and the stored body) were made from it.
  it.each([
    ["without a stored body", undefined],
    ["with a stored body", '{"sent":"as-is"}'],
  ])("GH-10-D7 a pending submit %s keeps its quote when a price line is missing", (_name, body) => {
    const ready = readyDraft(T0);
    const stored = asV1(ready);
    delete stored.quote!.lines.stamp;
    const pending = body === undefined ? { fingerprint: "fp" } : { fingerprint: "fp", body };
    store.set(
      DRAFT_KEY,
      JSON.stringify({
        ...stored,
        pendingSubmit: pending,
        submitAttemptedAt: T0,
        acceptedQuoteId: ready.quote!.id,
        previousTotalMillimes: 1234,
      }),
    );
    const loaded = loadDraft(T0);
    expect(loaded?.version).toBe(2);
    expect(loaded?.pendingSubmit).toEqual(pending);
    expect(loaded?.quote).toEqual(stored.quote);
    expect(loaded?.quote?.totalMillimes).toBe(ready.quote!.totalMillimes);
    expect(loaded?.acceptedQuoteId).toBe(ready.quote!.id);
    expect(loaded?.previousTotalMillimes).toBe(1234);
  });
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
    const base = { version: 2, expiresAt: T0 + 60_000, idempotencyKey: "k" };
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
