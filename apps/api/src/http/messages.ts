import ar from "@fastgo/i18n/messages/ar.json" with { type: "json" };
import en from "@fastgo/i18n/messages/en.json" with { type: "json" };
import fr from "@fastgo/i18n/messages/fr.json" with { type: "json" };
import type { ErrorCode } from "./errors.ts";

type Locale = "fr" | "ar" | "en";
const catalogs: Record<Locale, Record<ErrorCode, string>> = {
  fr: fr.apiErrors as Record<ErrorCode, string>,
  ar: ar.apiErrors as Record<ErrorCode, string>,
  en: en.apiErrors as Record<ErrorCode, string>,
};

/** First supported language of Accept-Language; fr when missing or unsupported (the code never changes). */
export function pickLocale(header: string | undefined): Locale {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase().split("-")[0];
    if (tag === "fr" || tag === "ar" || tag === "en") return tag;
  }
  return "fr";
}

export const errorMessage = (code: ErrorCode, header: string | undefined): string =>
  catalogs[pickLocale(header)][code];
