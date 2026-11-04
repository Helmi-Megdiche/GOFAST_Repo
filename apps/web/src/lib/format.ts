import type { Locale } from "@fastgo/i18n";

/** One decimal, Latin digits in every language: 1.8 (en, ar) or 1,8 (fr). */
export function formatOneDecimal(value: number, locale: Locale): string {
  const text = value.toFixed(1);
  return locale === "fr" ? text.replace(".", ",") : text;
}
