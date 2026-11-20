import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  hotp,
  newSecret,
  otpauthUri,
  parseTotpKey,
  totpCode,
  totpStep,
  verifyTotp,
} from "./totp.ts";

// GH-25 T60: TOTP with the parameters of the authenticator apps (RFC 6238: HMAC-SHA1, 6 digits, 30 s), written on Node's crypto.

const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

describe("T60 HOTP (RFC 4226, appendix D): the counters 0 to 9 of the reference secret", () => {
  it.each([
    [0, "755224"],
    [1, "287082"],
    [2, "359152"],
    [3, "969429"],
    [4, "338314"],
    [5, "254676"],
    [6, "287922"],
    [7, "162583"],
    [8, "399871"],
    [9, "520489"],
  ])("counter %i gives %s", (counter, code) => {
    expect(hotp(RFC_SECRET, counter)).toBe(code);
  });
});

describe("T60 TOTP (RFC 6238, appendix B, SHA-1): the last 6 digits of the 8-digit vectors", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("at %i s the code is %s", (seconds, code) => {
    expect(totpCode(RFC_SECRET, totpStep(seconds * 1000))).toBe(code);
  });
  it("a step is 30 seconds", () => {
    expect(totpStep(59_999)).toBe(1);
    expect(totpStep(60_000)).toBe(2);
  });
});

describe("T60 verifyTotp: a window of one step either side", () => {
  const now = 1_700_000_000_000;
  const step = totpStep(now);
  const at = (s: number) => totpCode(RFC_SECRET, s);
  it("accepts the current step, the previous and the next, and says which step matched", () => {
    expect(verifyTotp(RFC_SECRET, at(step), now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, at(step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, at(step + 1), now)).toBe(step + 1);
  });
  it("refuses a step outside the window, in both directions", () => {
    expect(verifyTotp(RFC_SECRET, at(step - 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, at(step + 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, at(step - 10), now)).toBeNull();
  });
  it("refuses a wrong code and anything that is not exactly 6 digits", () => {
    const right = at(step);
    const wrong = right === "000000" ? "111111" : "000000";
    expect(verifyTotp(RFC_SECRET, wrong, now)).toBeNull();
    for (const bad of ["", "12345", "1234567", "12345a", " 123456", right + "0"]) expect(verifyTotp(RFC_SECRET, bad, now), bad).toBeNull();
  });
});

describe("T60 base32 and the otpauth URI", () => {
  it("round trips, and matches the RFC 4648 vectors", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
    const s = newSecret();
    expect(s).toHaveLength(20);
    expect(base32Decode(base32Encode(s)).equals(s)).toBe(true);
    expect(newSecret().equals(s)).toBe(false);
  });
  it("is the URI an authenticator app reads, with the parameters written out", () => {
    const uri = otpauthUri({ secret: RFC_SECRET, account: "nadia@fastgo.example", issuer: "GOFAST" });
    expect(uri).toBe(
      "otpauth://totp/GOFAST:nadia%40fastgo.example?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GOFAST&algorithm=SHA1&digits=6&period=30",
    );
  });
});

describe("T60 the secret at rest: AES-256-GCM with TOTP_KEY, bound to the account", () => {
  const key = Buffer.alloc(32, 7);
  const account = "11111111-1111-4111-8111-111111111111";
  it("round trips, with a new nonce every time", () => {
    const a = encryptSecret(RFC_SECRET, key, account);
    const b = encryptSecret(RFC_SECRET, key, account);
    expect(a.equals(b)).toBe(false);
    expect(decryptSecret(a, key, account).equals(RFC_SECRET)).toBe(true);
    expect(a.includes(RFC_SECRET)).toBe(false); // the secret is not in the stored bytes
  });
  it("is refused with another key, another account, or a changed byte", () => {
    const stored = encryptSecret(RFC_SECRET, key, account);
    expect(() => decryptSecret(stored, Buffer.alloc(32, 8), account)).toThrow();
    expect(() => decryptSecret(stored, key, "22222222-2222-4222-8222-222222222222")).toThrow();
    const tampered = Buffer.from(stored);
    tampered.writeUInt8(tampered.readUInt8(tampered.length - 1) ^ 1, tampered.length - 1);
    expect(() => decryptSecret(tampered, key, account)).toThrow();
    expect(() => decryptSecret(Buffer.alloc(10), key, account)).toThrow();
  });
  it("TOTP_KEY is 32 bytes in base64", () => {
    expect(parseTotpKey(Buffer.alloc(32, 1).toString("base64")).length).toBe(32);
    expect(() => parseTotpKey(Buffer.alloc(31, 1).toString("base64"))).toThrow(/32 bytes/);
    expect(() => parseTotpKey(Buffer.alloc(33, 1).toString("base64"))).toThrow(/32 bytes/);
    expect(() => parseTotpKey("not base64 !!")).toThrow(/32 bytes/);
  });
});
