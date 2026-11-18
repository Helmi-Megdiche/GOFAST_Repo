import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// GH-25 T60: the second factor of the back-office. TOTP (RFC 6238) with what authenticator apps use: HMAC-SHA1, 6 digits, steps of 30 s.
// PROVISIONAL: the cahier says "un second facteur" and names no method; these are the app defaults, confirmed on #25.
// Node's crypto only, no dependency.

const DIGITS = 6;
const STEP_SECONDS = 30;
/** A code of the previous or the next step is accepted too (clock drift of the phone). PROVISIONAL. */
const WINDOW = 1;

/** RFC 4226: the code of a counter. */
export function hotp(secret: Buffer, counter: number | bigint): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The 30-second step of an instant (UTC milliseconds). */
export const totpStep = (nowMs: number): number => Math.floor(nowMs / 1000 / STEP_SECONDS);

export const totpCode = (secret: Buffer, step: number): string => hotp(secret, step);

/**
 * The step of a valid code, or null. The window is one step either side of `nowMs`; every candidate is compared in constant time
 * and all of them are always computed, so the time does not tell which step matched.
 */
export function verifyTotp(secret: Buffer, code: string, nowMs: number): number | null {
  if (!/^[0-9]{6}$/.test(code)) return null;
  const given = Buffer.from(code, "ascii");
  const current = totpStep(nowMs);
  let found: number | null = null;
  for (let step = current - WINDOW; step <= current + WINDOW; step += 1) {
    const expected = Buffer.from(totpCode(secret, step), "ascii");
    if (timingSafeEqual(given, expected) && found === null) found = step;
  }
  return found;
}

// ---- base32 (RFC 4648, no padding) and the otpauth URI -----------------------------------------------------------------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, "").toUpperCase()) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) throw new Error("not base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 random bits, the size RFC 4226 recommends. */
export const newSecret = (): Buffer => randomBytes(20);

/** What an authenticator app reads (typed in, or as a QR code made elsewhere). The parameters are written out. */
export function otpauthUri(o: { secret: Buffer; account: string; issuer: string }): string {
  const label = `${encodeURIComponent(o.issuer)}:${encodeURIComponent(o.account)}`;
  return `otpauth://totp/${label}?secret=${base32Encode(o.secret)}&issuer=${encodeURIComponent(o.issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ---- the secret at rest ---------------------------------------------------------------------------------------------------

const NONCE = 12;
const TAG = 16;

/** TOTP_KEY: 32 bytes in base64. */
export function parseTotpKey(value: string): Buffer {
  const key = /^[A-Za-z0-9+/]+={0,2}$/.test(value) ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== 32) throw new Error("TOTP_KEY must be 32 bytes in base64");
  return key;
}

/** nonce (12) + tag (16) + ciphertext. The account id is authenticated data: a secret copied to another account does not decrypt. */
export function encryptSecret(secret: Buffer, key: Buffer, accountId: string): Buffer {
  const nonce = randomBytes(NONCE);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(accountId, "utf8"));
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]);
}

export function decryptSecret(stored: Buffer, key: Buffer, accountId: string): Buffer {
  if (stored.length <= NONCE + TAG) throw new Error("the stored secret is too short");
  const decipher = createDecipheriv("aes-256-gcm", key, stored.subarray(0, NONCE));
  decipher.setAAD(Buffer.from(accountId, "utf8"));
  decipher.setAuthTag(stored.subarray(NONCE, NONCE + TAG));
  return Buffer.concat([decipher.update(stored.subarray(NONCE + TAG)), decipher.final()]);
}
