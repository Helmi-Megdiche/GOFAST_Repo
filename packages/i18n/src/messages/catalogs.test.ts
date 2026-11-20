import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ar from "./ar.json";
import en from "./en.json";
import fr from "./fr.json";
import { flatten, renderArReview, type Catalog } from "../../scripts/ar-review.ts";

const flat = { fr: flatten(fr), en: flatten(en), ar: flatten(ar) };
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("message catalogs", () => {
  it("fr, en and ar have exactly the same keys", () => {
    const keys = Object.keys(flat.fr).sort();
    expect(Object.keys(flat.en).sort()).toEqual(keys);
    expect(Object.keys(flat.ar).sort()).toEqual(keys);
  });

  it("has no empty string", () => {
    for (const [locale, entries] of Object.entries(flat)) {
      for (const [key, value] of Object.entries(entries)) {
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  it("never shows the old brand name FastGo (the brand is GOFAST)", () => {
    for (const [locale, entries] of Object.entries(flat)) {
      for (const [key, value] of Object.entries(entries)) {
        expect(value.toLowerCase(), `${locale}:${key}`).not.toContain("fastgo");
      }
    }
  });

  it("uses the same {placeholders} in every language", () => {
    for (const [key, value] of Object.entries(flat.fr)) {
      expect(placeholders(flat.en[key] ?? ""), `en:${key}`).toEqual(placeholders(value));
      expect(placeholders(flat.ar[key] ?? ""), `ar:${key}`).toEqual(placeholders(value));
    }
  });
});

describe("apiErrors", () => {
  it("R201_T04: outOfZone, the zone check reason, is an apiErrors key in fr, en and ar", () => {
    for (const [locale, entries] of Object.entries(flat))
      expect(entries["apiErrors.outOfZone"], locale).toBeTruthy();
  });
  it("R204: every RULE_REFUSED reason of a quote has a message in fr, en and ar", () => {
    for (const reason of ["outOfZone", "addressUnconfirmed", "tooManyParcels", "tooHeavy", "priceUnavailable"])
      for (const [locale, entries] of Object.entries(flat))
        expect(entries[`apiErrors.${reason}`], `${locale} ${reason}`).toBeTruthy();
  });
  it("GH-22 RV-05 R607: every RULE_REFUSED reason of an order has a message in fr, en and ar", () => {
    for (const reason of ["quoteChanged", "phoneRequired", "contractRequired", "addressMismatch", "freightPayerRequired"])
      for (const [locale, entries] of Object.entries(flat))
        expect(entries[`apiErrors.${reason}`], `${locale} ${reason}`).toBeTruthy();
  });
});

describe("apiErrors of cancel and confirm", () => {
  it("GH-22 R212 R209: every refusal reason of cancelOrder and confirmOrder has a message in fr, en and ar", () => {
    for (const reason of ["feeRequired", "claimOnly", "notCancellable", "notWaitingForConfirmation"])
      for (const [locale, entries] of Object.entries(flat))
        expect(entries[`apiErrors.${reason}`], `${locale} ${reason}`).toBeTruthy();
  });
});

describe("apiSms", () => {
  it("GH-22 R903 R904: the tracking SMS exists in fr, en and ar with the same two placeholders", () => {
    for (const [locale, entries] of Object.entries(flat)) {
      const text = entries["apiSms.tracking"] ?? "";
      expect(text, locale).toContain("{tracking_number}");
      expect(text, locale).toContain("{link}");
    }
  });
});

describe("business placeholders", () => {
  it("stay visible in square brackets in fr, en and ar", () => {
    const keys = Object.keys(flat.fr).filter((key) => key.startsWith("placeholders."));
    expect(keys.length).toBeGreaterThan(10);
    for (const [locale, entries] of Object.entries(flat)) {
      for (const key of keys) {
        expect(entries[key], `${locale}:${key}`).toMatch(/\[[^\]]+\]/);
      }
    }
  });

  it("never promise a 10-minute price guarantee (CMD-04 says 15)", () => {
    for (const [locale, entries] of Object.entries(flat)) {
      for (const [key, value] of Object.entries(entries)) {
        expect(value, `${locale}:${key}`).not.toMatch(/\b10\s*(min|minutes)\b/i);
        expect(value, `${locale}:${key}`).not.toMatch(/10\s*(دقائق|دقيقة)/);
      }
    }
    expect(flat.fr["help.questions.price.a"]).toContain("15 minutes");
    expect(flat.en["help.questions.price.a"]).toContain("15 minutes");
    expect(flat.ar["help.questions.price.a"]).toContain("15 دقيقة");
  });
});

describe("Arabic plurals", () => {
  it("timeLeftShort is an ICU plural with every Arabic category", () => {
    expect(flat.ar["order.price.timeLeftShort"]).toMatch(
      /^\{minutes, plural, zero \{.+\} one \{.+\} two \{.+\} few \{.+\} many \{.+\} other \{.+\}\}$/,
    );
  });
});

describe("AR-REVIEW.md", () => {
  it("lists every Arabic key (run `pnpm --filter @fastgo/i18n ar-review` after adding keys)", () => {
    const file = readFileSync(new URL("../../AR-REVIEW.md", import.meta.url), "utf8");
    expect(file).toBe(renderArReview(ar as Catalog, fr as Catalog, file));
  });
});
