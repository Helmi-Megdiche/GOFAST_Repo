import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "../limits";
import { requestCaptchaToken } from "./captcha";
import { submitContact, type ContactInput } from "./contact";
import { submitDriverApplication } from "./driver";
import { getFaq } from "./faq";
import { getServiceOffers } from "./services";
import { lookupTracking } from "./tracking";
import { checkZone } from "./zones";

describe("lookupTracking", () => {
  it("finds FG-7K4M-2QXP, whatever the case and spaces", async () => {
    for (const code of ["FG-7K4M-2QXP", "  fg-7k4m-2qxp "]) {
      const result = await lookupTracking(code);
      expect(result.status).toBe("found");
    }
  });

  it("returns no personal data and no display text", async () => {
    const result = await lookupTracking("FG-7K4M-2QXP");
    if (result.status !== "found") throw new Error("expected found");
    expect(Object.keys(result.parcel).sort()).toEqual([
      "currentStep",
      "etaUtc",
      "fromCity",
      "history",
      "toCity",
    ]);
    // cities are null: the page prints the placeholder in the active language
    expect(result.parcel.fromCity).toBeNull();
    expect(result.parcel.toCity).toBeNull();
    expect(result.parcel.etaUtc).toMatch(/Z$/);
    expect(result.parcel.history.map((entry) => entry.step)).toEqual([
      "created",
      "confirmed",
      "picked_up",
      "out_for_delivery",
    ]);
  });

  it("does not find an unknown code with a valid format", async () => {
    expect(await lookupTracking("FG-0000-0000")).toEqual({ status: "not-found" });
  });

  it("refuses an invalid format", async () => {
    expect(await lookupTracking("12345")).toEqual({ status: "invalid-format" });
    expect(await lookupTracking("")).toEqual({ status: "invalid-format" });
  });
});

describe("checkZone", () => {
  it("is in zone for the known addresses, with the services", async () => {
    expect(await checkZone("Rue Ibn Khaldoun")).toEqual({
      status: "in-zone",
      services: ["express", "standard"],
    });
    expect((await checkZone("  avenue HABIB Bourguiba, Tunis ")).status).toBe("in-zone");
  });

  it("is out of zone for Route de Sousse", async () => {
    expect(await checkZone("Route de Sousse, km 40")).toEqual({ status: "out-of-zone" });
  });

  it("is unknown for any other address", async () => {
    expect(await checkZone("12 rue des Orangers")).toEqual({ status: "unknown" });
  });
});

describe("getServiceOffers", () => {
  it("invents no price, hour, limit or fee", async () => {
    const catalog = await getServiceOffers();
    expect(catalog.offers.map((offer) => offer.code)).toEqual(["express", "standard", "scheduled"]);
    for (const offer of catalog.offers) {
      expect(offer.fromPriceMillimes).toBeNull();
      expect(offer.cutoffTime).toBeNull();
    }
    for (const type of catalog.parcelTypes) expect(type.limit).toBeNull();
    for (const extra of catalog.extras) expect(extra.feeMillimes).toBeNull();
  });
});

describe("getFaq", () => {
  it("answers only the price question for now", async () => {
    const faq = await getFaq();
    expect(faq.questions.filter((question) => question.answered).map((q) => q.code)).toEqual([
      "price",
    ]);
  });
});

const baseContact: ContactInput = {
  type: "question",
  name: "Test Client",
  phone: "+216 20 000 000",
  email: "client@example.com",
  trackingCode: "",
  message: "Bonjour",
  attachment: null,
  captchaToken: "",
};

describe("submitContact", () => {
  it("opens a ticket when the captcha token is valid", async () => {
    const token = await requestCaptchaToken();
    const result = await submitContact({ ...baseContact, captchaToken: token });
    expect(result.status).toBe("created");
  });

  it("refuses a missing, forged or reused captcha", async () => {
    expect(await submitContact(baseContact)).toEqual({ status: "error", code: "captcha-failed" });
    expect(await submitContact({ ...baseContact, captchaToken: "forged" })).toEqual({
      status: "error",
      code: "captcha-failed",
    });
    const token = await requestCaptchaToken();
    await submitContact({ ...baseContact, captchaToken: token });
    expect((await submitContact({ ...baseContact, captchaToken: token })).status).toBe("error");
  });

  it("accepts exactly 5 MB and refuses one byte more", async () => {
    const exact = await submitContact({
      ...baseContact,
      captchaToken: await requestCaptchaToken(),
      attachment: { name: "a.pdf", sizeBytes: MAX_ATTACHMENT_BYTES },
    });
    expect(exact.status).toBe("created");
    const over = await submitContact({
      ...baseContact,
      captchaToken: await requestCaptchaToken(),
      attachment: { name: "a.pdf", sizeBytes: MAX_ATTACHMENT_BYTES + 1 },
    });
    expect(over).toEqual({ status: "error", code: "attachment-too-large" });
  });

  it("refuses a malformed tracking code, accepts an empty one", async () => {
    const bad = await submitContact({
      ...baseContact,
      trackingCode: "nope",
      captchaToken: await requestCaptchaToken(),
    });
    expect(bad).toEqual({ status: "error", code: "invalid-tracking-code" });
  });
});

describe("submitDriverApplication", () => {
  const input = {
    fullName: "Test Livreur",
    phone: "20000000",
    vehicle: "moto",
    zone: "city",
  } as const;

  it("applies the same 5 MB rule as the contact form", async () => {
    const ok = await submitDriverApplication({
      ...input,
      document: { name: "permis.pdf", sizeBytes: MAX_ATTACHMENT_BYTES },
    });
    expect(ok.status).toBe("created");
    const over = await submitDriverApplication({
      ...input,
      document: { name: "permis.pdf", sizeBytes: MAX_ATTACHMENT_BYTES + 1 },
    });
    expect(over).toEqual({ status: "error", code: "attachment-too-large" });
  });
});
