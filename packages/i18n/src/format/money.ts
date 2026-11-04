import type { Locale } from "../locales";

/** Non-breaking space: an amount never wraps between its digits or before the unit. */
const NBSP = " ";

const SEPARATORS: Record<Locale, { group: string; decimal: string }> = {
  // fr: 1 152,000 TND   (space for thousands, comma for decimals)
  fr: { group: NBSP, decimal: "," },
  // en and ar: 1,152.000 TND   (Latin digits in Arabic too)
  en: { group: ",", decimal: "." },
  ar: { group: ",", decimal: "." },
};

/**
 * Format an amount in millimes as TND, always with 3 decimals.
 * 48500 -> "48,500 TND" (fr) | "48.500 TND" (en, ar).
 * Money is an integer number of millimes (CLAUDE.md): floats are rejected.
 *
 * In Arabic text, render the result inside an element with dir="ltr" (the <Ltr> component).
 */
export function formatMillimes(millimes: number, locale: Locale): string {
  if (!Number.isSafeInteger(millimes)) {
    throw new RangeError(`Amount must be an integer number of millimes, got ${millimes}`);
  }

  const { group, decimal } = SEPARATORS[locale];
  const abs = Math.abs(millimes);
  const dinars = Math.trunc(abs / 1000);
  const rest = String(abs % 1000).padStart(3, "0");
  const grouped = String(dinars).replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const sign = millimes < 0 ? "-" : "";

  return `${sign}${grouped}${decimal}${rest}${NBSP}TND`;
}
