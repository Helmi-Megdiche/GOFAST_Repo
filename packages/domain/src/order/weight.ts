import {
  WEIGHT_TOLERANCE_FLAT_G,
  WEIGHT_TOLERANCE_FLAT_UP_TO_G,
  WEIGHT_TOLERANCE_PERCENT,
} from "./constants";

/** Gap tolerated for a declared weight (R208): a flat amount up to the limit, a percentage above. Integer grams. */
export function weightToleranceG(declaredG: number): number {
  if (declaredG <= WEIGHT_TOLERANCE_FLAT_UP_TO_G) return WEIGHT_TOLERANCE_FLAT_G;
  return Math.floor((declaredG * WEIGHT_TOLERANCE_PERCENT) / 100);
}

/** True when the measured weight is above the declared weight plus the tolerance (R208): the client is warned before the invoice. */
export function exceedsWeightTolerance(declaredG: number, measuredG: number | null): boolean {
  return measuredG != null && measuredG > declaredG + weightToleranceG(declaredG);
}

/** Grams as kilograms for display, up to 3 decimals, in the locale's number format ("1,5" in fr, "1.5" in en). Display only. */
export function formatKg(grams: number, locale: string): string {
  return new Intl.NumberFormat(
    locale === "ar" ? "ar-TN-u-nu-latn" : locale === "fr" ? "fr-TN" : "en-GB",
    {
      maximumFractionDigits: 3,
    },
  ).format(grams / 1000);
}
