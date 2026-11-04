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

  it("uses the same {placeholders} in every language", () => {
    for (const [key, value] of Object.entries(flat.fr)) {
      expect(placeholders(flat.en[key] ?? ""), `en:${key}`).toEqual(placeholders(value));
      expect(placeholders(flat.ar[key] ?? ""), `ar:${key}`).toEqual(placeholders(value));
    }
  });
});

describe("AR-REVIEW.md", () => {
  it("lists every Arabic key (run `pnpm --filter @fastgo/i18n ar-review` after adding keys)", () => {
    const file = readFileSync(new URL("../../AR-REVIEW.md", import.meta.url), "utf8");
    expect(file).toBe(renderArReview(ar as Catalog, fr as Catalog, file));
  });
});
