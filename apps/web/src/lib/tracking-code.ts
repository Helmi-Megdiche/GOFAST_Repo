/**
 * Tracking codes look like FG-7K4M-2QXP. The cahier confirms the FG-XXXX-XXXX shape but gives no
 * alphabet: letters A-Z and digits 0-9 are an assumption. One validator for the home form, the
 * tracking page, the contact form and the mock data layer.
 */
export const TRACKING_CODE_FORMAT = /^FG-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** The characters of a code. Shared by the validator above and the mock generator below. */
export const TRACKING_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Fills an array with random bytes. Injectable so tests can force collisions. */
export type RandomBytes = (size: number) => Uint8Array;

const cryptoBytes: RandomBytes = (size) => crypto.getRandomValues(new Uint8Array(size));

// 252 = 36 x 7: bytes from 252 to 255 are thrown away, so every character is equally likely.
const UNBIASED_LIMIT = Math.floor(256 / TRACKING_ALPHABET.length) * TRACKING_ALPHABET.length;

/** A random FG-XXXX-XXXX (R203), with no modulo bias. Uniqueness is checked by the caller. */
export function randomTrackingCode(randomBytes: RandomBytes = cryptoBytes): string {
  const chars: string[] = [];
  while (chars.length < 8) {
    for (const byte of randomBytes(16)) {
      if (byte < UNBIASED_LIMIT && chars.length < 8) {
        chars.push(TRACKING_ALPHABET[byte % TRACKING_ALPHABET.length] ?? "");
      }
    }
  }
  return `FG-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Trim and uppercase what the visitor typed. */
export function normalizeTrackingCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidTrackingCode(input: string): boolean {
  return TRACKING_CODE_FORMAT.test(normalizeTrackingCode(input));
}
