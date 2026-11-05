import { toLatinDigits } from "./digits";

/**
 * Tunisian numbers: 8 digits, with or without +216 or 00216 (spaces and dashes ignored, Arabic-Indic
 * digits accepted). Returns the canonical "+216XXXXXXXX", or null if it is not a valid number.
 */
export function normalizePhone(input: string): string | null {
  const compact = toLatinDigits(input).replace(/[\s\u00a0-]/g, "");
  const match = /^(?:\+216|00216)?(\d{8})$/.exec(compact);
  return match ? `+216${match[1]}` : null;
}

/** "+21620000000" -> "+216 20 ••• 000" (W20). Shows the first 2 and last 3 digits only. */
export function maskPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return "";
  const digits = normalized.slice(4);
  return `+216 ${digits.slice(0, 2)} ••• ${digits.slice(5)}`;
}

/** "amel.b@example.tn" -> "a•••@example.tn". */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 1)}•••@${domain}`;
}
