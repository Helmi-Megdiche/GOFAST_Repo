import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

/**
 * Keyed hashes of what must not sit readable in Redis or logs (RV-18): phones, identifiers, codes.
 * The key is AUTH_SECRET. The output is base64url, 43 characters.
 */
export class Keys {
  constructor(private readonly secret: string) {
    if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  }

  mac(purpose: string, value: string): string {
    return createHmac("sha256", this.secret).update(`${purpose}\0${value}`).digest("base64url");
  }
}

/** 256 random bits. Sent to the browser once, never stored as is. */
export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

/** The Redis key of a session: the hash of the id, so a copy of Redis is not a list of valid ids. */
export function sessionKeyOf(id: string): string {
  return `sess:${createHash("sha256").update(id).digest("base64url")}`;
}

export function sixDigitCode(length: number): string {
  return String(randomInt(0, 10 ** length)).padStart(length, "0");
}
