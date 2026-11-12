import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "../limits";
import { DRIVER_DOCUMENTS, DRIVER_VEHICLES } from "../data/driver";
import {
  contactFormSchema,
  driverFormSchema,
  optionalTrackingCodeField,
  phoneField,
  trackingFormSchema,
  zoneFormSchema,
} from "./schemas";

const codes = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

const file = (size: number) => ({ size, name: "a.pdf" }) as File;

describe("tracking form", () => {
  it("accepts a code typed in lower case with spaces", () => {
    expect(trackingFormSchema.safeParse({ code: " fg-7k4m-2qxp " }).success).toBe(true);
  });
  it("gives required then trackingInvalid", () => {
    expect(codes(trackingFormSchema.safeParse({ code: "  " }))).toContain("required");
    expect(codes(trackingFormSchema.safeParse({ code: "FG-12" }))).toEqual(["trackingInvalid"]);
  });
});

describe("optional tracking code (contact form)", () => {
  it("keeps an empty field valid and checks a filled one", () => {
    expect(optionalTrackingCodeField.safeParse("").success).toBe(true);
    expect(optionalTrackingCodeField.safeParse("   ").success).toBe(true);
    expect(optionalTrackingCodeField.safeParse("FG-7K4M-2QXP").success).toBe(true);
    expect(optionalTrackingCodeField.safeParse("FG-").success).toBe(false);
  });
});

describe("phone", () => {
  it("accepts Tunisian numbers with or without +216", () => {
    for (const ok of ["+216 20 000 000", "20000000", "00216 50 000 000", "+216-50-000-000"]) {
      expect(phoneField.safeParse(ok).success, ok).toBe(true);
    }
  });
  it("refuses the others", () => {
    for (const bad of ["", "+216 ", "2000", "abcdefgh", "+33 6 12 34 56 78"]) {
      expect(phoneField.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("zone form", () => {
  it("needs at least 3 characters", () => {
    expect(codes(zoneFormSchema.safeParse({ address: "ab" }))).toEqual(["addressTooShort"]);
    expect(zoneFormSchema.safeParse({ address: "Rue Ibn Khaldoun" }).success).toBe(true);
  });
});

describe("contact form", () => {
  const valid = {
    type: "question",
    name: "Test Client",
    phone: "+216 20 000 000",
    email: "client@example.com",
    trackingCode: "",
    message: "Bonjour",
    attachment: null,
    captchaToken: "mock-captcha-1",
  } as const;

  it("accepts a complete form without tracking code or attachment", () => {
    expect(contactFormSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an attachment of exactly 5 MB and refuses one byte more", () => {
    const exact = contactFormSchema.safeParse({ ...valid, attachment: file(MAX_ATTACHMENT_BYTES) });
    expect(exact.success).toBe(true);
    const over = contactFormSchema.safeParse({
      ...valid,
      attachment: file(MAX_ATTACHMENT_BYTES + 1),
    });
    expect(codes(over)).toEqual(["attachmentTooLarge"]);
  });

  it("needs the captcha", () => {
    expect(codes(contactFormSchema.safeParse({ ...valid, captchaToken: "" }))).toEqual([
      "captchaRequired",
    ]);
  });

  it("reports required fields and a bad email", () => {
    const result = contactFormSchema.safeParse({ ...valid, name: " ", email: "nope" });
    expect(codes(result).sort()).toEqual(["emailInvalid", "required"]);
  });
});

describe("driver form (FE-05)", () => {
  const doc = (size = 1000, type = "application/pdf") => ({ size, type, name: "a.pdf" }) as File;
  const documents = () =>
    Object.fromEntries(DRIVER_DOCUMENTS.map((key) => [key, doc()])) as Record<
      (typeof DRIVER_DOCUMENTS)[number],
      File | null
    >;
  const valid = () => ({
    fullName: "Test Livreur",
    phone: "20 000 000",
    vehicle: "motorbike",
    zone: "city",
    documents: documents(),
  });

  it("lists GOFAST's four vehicles and six documents", () => {
    expect(DRIVER_VEHICLES).toEqual(["scooter", "motorbike", "car", "lightVan"]);
    expect(DRIVER_DOCUMENTS).toEqual([
      "cin",
      "licence",
      "registration",
      "insurance",
      "vehiclePhoto",
      "bankDetails",
    ]);
  });
  it("accepts each vehicle", () => {
    for (const vehicle of DRIVER_VEHICLES) {
      expect(driverFormSchema.safeParse({ ...valid(), vehicle }).success, vehicle).toBe(true);
    }
  });
  it("refuses an unknown vehicle, including the old moto and other", () => {
    for (const vehicle of ["moto", "other", "truck", ""]) {
      expect(driverFormSchema.safeParse({ ...valid(), vehicle }).success, vehicle).toBe(false);
    }
  });
  it("refuses each missing document with documentRequired, on that document", () => {
    for (const key of DRIVER_DOCUMENTS) {
      const result = driverFormSchema.safeParse({
        ...valid(),
        documents: { ...documents(), [key]: null },
      });
      expect(codes(result), key).toEqual(["documentRequired"]);
      expect(result.error?.issues[0]?.path, key).toEqual(["documents", key]);
    }
  });
  it("accepts a document of exactly 5 MB and refuses one byte more", () => {
    for (const key of DRIVER_DOCUMENTS) {
      const exact = { ...documents(), [key]: doc(MAX_ATTACHMENT_BYTES) };
      expect(driverFormSchema.safeParse({ ...valid(), documents: exact }).success, key).toBe(true);
      const over = { ...documents(), [key]: doc(MAX_ATTACHMENT_BYTES + 1) };
      expect(codes(driverFormSchema.safeParse({ ...valid(), documents: over })), key).toEqual([
        "attachmentTooLarge",
      ]);
    }
  });
  it("accepts images and PDF, refuses any other type", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      const ok = { ...documents(), cin: doc(1000, type) };
      expect(driverFormSchema.safeParse({ ...valid(), documents: ok }).success, type).toBe(true);
    }
    for (const key of DRIVER_DOCUMENTS) {
      for (const type of ["application/zip", "text/plain", "image/gif"]) {
        const bad = { ...documents(), [key]: doc(1000, type) };
        expect(
          codes(driverFormSchema.safeParse({ ...valid(), documents: bad })),
          `${key} ${type}`,
        ).toEqual(["attachmentBadType"]);
      }
    }
  });
});
