import type { Locale } from "@fastgo/i18n";
import { toLatinDigits } from "../digits";

export type ParsedAmount =
  { ok: true; millimes: number | null } | { ok: false; error: "declaredValueInvalid" };

const INVALID = { ok: false, error: "declaredValueInvalid" } as const;

// fr: "1 152,5", "1152.5", "48,500". Space (also no-break and narrow no-break) groups thousands.
const FR = /^(\d{1,3}(?: \d{3})+|\d+)(?:[.,](\d{1,3}))?$/;
// en, ar: "1,152.5", "1152.5", "48.500". A comma only groups thousands, in full groups of three.
const EN = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,3}))?$/;

/**
 * A declared value typed in TND, to an integer number of millimes, without floats (CLAUDE.md).
 * Empty input is valid (the field is optional) and gives null. Accepts Arabic-Indic digits and
 * "٫". Refuses negatives, more than 3 decimals, ambiguous separators and unsafe integers.
 */
export function parseMillimes(input: string, locale: Locale): ParsedAmount {
  const text = toLatinDigits(input)
    .trim()
    .replace(/[\u00a0\u202f]/g, " ");
  if (text === "") return { ok: true, millimes: null };

  const match = (locale === "fr" ? FR : EN).exec(text);
  if (!match) return INVALID;

  const dinars = BigInt((match[1] ?? "0").replace(/[ ,]/g, ""));
  const fraction = BigInt((match[2] ?? "").padEnd(3, "0"));
  const millimes = dinars * 1000n + fraction;
  if (millimes > BigInt(Number.MAX_SAFE_INTEGER)) return INVALID;
  return { ok: true, millimes: Number(millimes) };
}
