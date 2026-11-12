import { beforeEach, describe, expect, it } from "vitest";
import { useMemoryStorage } from "../storage";
import { setClock } from "./clock";
import { loadDraft } from "./draft";
import { addressDraftFromSaved, seedFromSavedRecipient } from "./saved";

const T0 = Date.parse("2026-11-04T08:30:00Z");

beforeEach(() => {
  useMemoryStorage();
  setClock(() => T0);
});

describe("saved addresses in the order flow (CMD-02, R201)", () => {
  it("a saved address in zone arrives confirmed, with its zone checked now", async () => {
    const draft = await addressDraftFromSaved("Rue Ibn Khaldoun", "Près de la pharmacie");
    expect(draft).toMatchObject({
      text: "Rue Ibn Khaldoun",
      confirmed: true,
      pin: null,
      landmark: "Près de la pharmacie",
    });
    expect(draft.zone?.status).toBe("in-zone");
  });

  it("a saved address that is out of zone now arrives out of zone, so the step goes to W17", async () => {
    const draft = await addressDraftFromSaved("Route de Sousse km 40", "");
    expect(draft.confirmed).toBe(true);
    expect(draft.zone).toEqual({ status: "out-of-zone" });
  });

  it("'Lui envoyer un colis' fills the recipient of the draft and nothing of the sender", async () => {
    await seedFromSavedRecipient({
      id: "rcp-1",
      name: "Karim S.",
      phone: "+21622000110",
      address: "Avenue Habib Bourguiba",
      landmark: "2e étage",
      locale: "ar",
    });
    const draft = loadDraft(T0)!;
    expect(draft.recipient).toMatchObject({
      name: "Karim S.",
      phone: "+21622000110",
      smsLanguage: "ar",
      save: false,
      address: { text: "Avenue Habib Bourguiba", confirmed: true, landmark: "2e étage" },
    });
    expect(draft.recipient.address.zone?.status).toBe("in-zone");
    expect(draft.sender.name).toBe("");
    expect(draft.sender.address.text).toBe("");
  });
});
