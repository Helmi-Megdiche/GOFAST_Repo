import { describe, expect, it } from "vitest";
import { describe as describeError } from "./error.filter.ts";

describe("describe (what the logs may say about an unknown error)", () => {
  it("gives the class, the Postgres code and the constraint, found down the cause chain", () => {
    const pg = Object.assign(new Error("duplicate key value violates unique constraint (+21620111001)"), {
      code: "23505",
      constraint: "accounts_phone_key",
    });
    const wrapped = new Error('Failed query: insert into core.accounts values ($1) params: +21620111001, $argon2id$v=19', {
      cause: pg,
    });
    expect(describeError(wrapped)).toBe("Error pg=23505 constraint=accounts_phone_key");
  });

  it("never carries the message, the stack, the SQL or a parameter", () => {
    const e = Object.assign(new TypeError("secret +21620111001 $argon2id$v=19$m=19456"), {
      query: "insert into core.accounts",
      params: ["+21620111001"],
    });
    const out = describeError(e);
    expect(out).toBe("TypeError");
    expect(out).not.toMatch(/\+216|argon2|insert/i);
  });

  it("ignores a code that is not a Postgres code and a constraint that is not a name", () => {
    expect(describeError(Object.assign(new Error("x"), { code: "ECONNRESET", constraint: "a b; drop" }))).toBe("Error");
    expect(describeError("a string with +21620111001")).toBe("string");
    expect(describeError(null)).toBe("object");
  });
});
