import { describe, expect, it } from "vitest";
import { ARGON2, Passwords } from "./password.ts";

describe("Passwords (Argon2id)", () => {
  const passwords = new Passwords();
  it("hashes to a PHC string and verifies", async () => {
    const hash = await passwords.hash("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await passwords.verify(hash, "correct horse battery")).toBe(true);
    expect(await passwords.verify(hash, "wrong password!")).toBe(false);
  });
  it("salts: two hashes of one password differ", async () => {
    expect(await passwords.hash("same password 1")).not.toBe(await passwords.hash("same password 1"));
  });
  it("a bad stored value verifies to false, never throws", async () => {
    expect(await passwords.verify("not a hash", "whatever")).toBe(false);
  });
  it("detects a hash made with other settings", async () => {
    const hash = await passwords.hash("correct horse battery");
    expect(passwords.needsRehash(hash)).toBe(false);
    expect(passwords.needsRehash(hash.replace(`m=${ARGON2.memoryCost}`, "m=4096"))).toBe(true);
    expect(passwords.needsRehash("$argon2i$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA")).toBe(true);
  });
  it("the dummy check costs a real verification and is false", async () => {
    await passwords.ready();
    expect(await passwords.verifyDummy("anything at all")).toBe(false);
  });
});
