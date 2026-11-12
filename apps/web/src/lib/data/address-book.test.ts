import { beforeEach, describe, expect, it } from "vitest";
import { setClock } from "../order/clock";
import { useMemoryStorage } from "../storage";
import { findById, sessionFor } from "./accounts";
import {
  listAddresses,
  removeAddress,
  removeRecipient,
  saveAddress,
  saveRecipient,
  savedRecipients,
  updateAddress,
} from "./address-book";
import { checkZone } from "./zones";

const sami = sessionFor(findById("acc-customer")!);
const karim = sessionFor(findById("acc-customer-other")!);

beforeEach(() => {
  useMemoryStorage();
  setClock(() => Date.parse("2026-11-04T10:00:00Z"));
});

describe("saved addresses (CMD-02)", () => {
  it("saves, lists, edits and removes an address, in the order saved", () => {
    const home = saveAddress(sami, {
      label: "Domicile",
      text: "Rue Ibn Khaldoun",
      landmark: "Pharmacie",
    });
    saveAddress(sami, { label: "Bureau", text: "Avenue Habib Bourguiba", landmark: "" });
    expect(listAddresses(sami).map((a) => a.label)).toEqual(["Domicile", "Bureau"]);
    expect(updateAddress(sami, home.id, { label: "Maison" })).toMatchObject({ status: "ok" });
    expect(listAddresses(sami)[0]).toMatchObject({ label: "Maison", text: "Rue Ibn Khaldoun" });
    expect(removeAddress(sami, home.id)).toEqual({ status: "ok" });
    expect(listAddresses(sami)).toHaveLength(1);
  });

  it("has no limit on saved items (H8)", () => {
    for (let i = 0; i < 60; i++)
      saveAddress(sami, { label: `A${i}`, text: "Rue Ibn Khaldoun", landmark: "" });
    expect(listAddresses(sami)).toHaveLength(60);
  });

  it("is scoped by account: another account's address answers like a missing one (not found)", () => {
    const home = saveAddress(sami, { label: "Domicile", text: "Rue Ibn Khaldoun", landmark: "" });
    expect(listAddresses(karim)).toEqual([]);
    expect(updateAddress(karim, home.id, { label: "X" })).toEqual({ status: "notFound" });
    expect(removeAddress(karim, home.id)).toEqual({ status: "notFound" });
    expect(removeAddress(karim, "no-such-id")).toEqual({ status: "notFound" });
    expect(listAddresses(sami)).toHaveLength(1);
  });

  it("keeps only the text, so the zone is checked again at order time (R201)", async () => {
    const saved = saveAddress(sami, {
      label: "Route",
      text: "Route de Sousse km 40",
      landmark: "",
    });
    expect(Object.keys(saved).sort()).toEqual(["id", "label", "landmark", "text"]);
    // The zone is read now, from the zone table: an address that left the zone is out of zone here.
    expect((await checkZone(saved.text)).status).toBe("out-of-zone");
  });
});

describe("saved recipients (CMD-02)", () => {
  const karimFriend = {
    name: "Karim S.",
    phone: "+21622000110",
    address: "Lac 2",
    landmark: "",
    locale: "fr" as const,
  };

  it("deduplicates by phone, whatever the format, and keeps the latest details", () => {
    saveRecipient(sami, karimFriend);
    saveRecipient(sami, {
      ...karimFriend,
      phone: "0021622000110",
      name: "Karim Sassi",
      locale: "ar",
    });
    const list = savedRecipients(sami);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Karim Sassi", phone: "+21622000110", locale: "ar" });
  });

  it("refuses an invalid phone and saves nothing", () => {
    expect(saveRecipient(sami, { ...karimFriend, phone: "12" })).toEqual({
      status: "invalidPhone",
    });
    expect(savedRecipients(sami)).toEqual([]);
  });

  it("is scoped by account and removable", () => {
    const saved = saveRecipient(sami, karimFriend);
    if (saved.status !== "saved") throw new Error("not saved");
    expect(savedRecipients(karim)).toEqual([]);
    expect(removeRecipient(karim, saved.recipient.id)).toEqual({ status: "notFound" });
    expect(removeRecipient(sami, saved.recipient.id)).toEqual({ status: "ok" });
    expect(savedRecipients(sami)).toEqual([]);
  });
});
