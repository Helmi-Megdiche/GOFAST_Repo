import { beforeEach, describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "../limits";
import { setClock } from "../order/clock";
import { useMemoryStorage } from "../storage";
import { requestCaptchaToken } from "./captcha";
import { submitContact, type ContactInput } from "./contact";
import { submitDriverApplication } from "./driver";
import { getFaq } from "./faq";
import { FOUND_TRACKING_CODE } from "./fixtures/tracking";
import { readTable } from "./mock-db";
import { ACCOUNT_ORDERS, type AccountOrder } from "./order-model";
import { getServiceOffers } from "./services";
import { lookupTracking, publicTrackingOf } from "./tracking";
import { checkZone } from "./zones";

describe("lookupTracking", () => {
  beforeEach(() => {
    useMemoryStorage();
    setClock(() => Date.parse("2026-11-04T08:30:00Z"));
  });

  it("normalizes the code: case and surrounding spaces", async () => {
    for (const code of ["FG-7K4M-2QXP", "fg-7k4m-2qxp", "  fg-7k4m-2qxp "]) {
      expect((await lookupTracking(code)).status, code).toBe("found");
    }
  });

  it("finds the fixture in_transit with its estimated time and order history", async () => {
    const result = await lookupTracking("FG-7K4M-2QXP");
    if (result.status !== "found") throw new Error("expected found");
    expect(result.tracking.status).toBe("in_transit");
    expect(result.tracking.etaUtc).toBe("2026-11-04T13:20:00Z");
    expect(result.tracking.history.map((entry) => entry.status)).toEqual([
      "received",
      "confirmed",
      "assigned",
      "picked_up",
      "in_transit",
    ]);
    // Cities stay null until FastGo gives the launch cities: the page prints the placeholder.
    expect(result.tracking.fromCity).toBeNull();
    expect(result.tracking.toCity).toBeNull();
  });

  it("publicTrackingOf keys are exactly the R405 allowlist", async () => {
    const tracking = publicTrackingOf(FOUND_TRACKING_CODE)!;
    expect(Object.keys(tracking).sort()).toEqual([
      "etaUtc",
      "fromCity",
      "history",
      "parcelCount",
      "parcelOutcomes",
      "status",
      "toCity",
    ]);
  });

  it("publicTrackingOf leaks no name, phone or address of any fixture order", () => {
    publicTrackingOf(FOUND_TRACKING_CODE); // seeds
    const orders = Object.values(readTable<AccountOrder>(ACCOUNT_ORDERS));
    expect(orders.length).toBeGreaterThan(10);
    for (const order of orders) {
      const json = JSON.stringify(publicTrackingOf(order.code));
      for (const secret of [
        order.sender.name,
        order.sender.phone,
        order.sender.address,
        order.recipient.name,
        order.recipient.phone,
        order.recipient.address,
      ]) {
        if (secret) expect(json, `${order.code} ${secret}`).not.toContain(secret);
      }
    }
  });

  it("answers null or not-found for an unknown code with a valid format", async () => {
    expect(publicTrackingOf("FG-0000-0000")).toBeNull();
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
      services: ["express", "standard", "scheduled"],
      zone: "A",
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
