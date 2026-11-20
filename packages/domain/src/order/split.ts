import { toLatinDigits } from "../digits";

/**
 * Splits an integer total into n integer parts: each part is floor(total / n) and the last part
 * takes the remainder, so the parts always sum to the total exactly (weights in grams, values in
 * millimes). No float is involved.
 */
export function splitWhole(total: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("splitWhole: n must be an integer >= 1");
  if (!Number.isInteger(total) || total < 0)
    throw new Error("splitWhole: total must be a non-negative integer");
  const base = Math.floor(total / n);
  const parts = Array.from({ length: n }, () => base);
  parts[n - 1] = total - base * (n - 1);
  return parts;
}

/**
 * W13's weight text in kg to integer grams, with string operations only (never Number(text) * 1000).
 * Accepts ".", "," or "٫" as the decimal separator and Arabic-Indic digits. More than 3 decimals is
 * refused, since grams are the smallest unit.
 */
export function kgTextToGrams(text: string): number | { refused: "tooManyDecimals" | "invalid" } {
  const latin = toLatinDigits(text.trim()).replace(",", ".");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(latin);
  if (!match) return { refused: "invalid" };
  const integerPart = match[1]!;
  const decimals = match[2] ?? "";
  if (decimals.length > 3) return { refused: "tooManyDecimals" };
  return Number(integerPart) * 1000 + Number(decimals.padEnd(3, "0"));
}
