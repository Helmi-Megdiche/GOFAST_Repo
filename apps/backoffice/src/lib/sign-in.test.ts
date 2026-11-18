import { describe, expect, it } from "vitest";
import { staffSignInSchema } from "./forms";
import { outcomeOf } from "./sign-in";

// GH-25 25b: the A00 form and the answer of POST /v1/staff/sessions, as pure functions.

describe("the A00 schema returns error codes, not text", () => {
  const valid = { identifier: " nadia@fastgo.example ", password: "secret", code: "417823" };
  it("accepts an e-mail or a phone, a password and 6 digits, and trims the identifier", () => {
    expect(staffSignInSchema.parse(valid)).toEqual({ identifier: "nadia@fastgo.example", password: "secret", code: "417823" });
    expect(staffSignInSchema.parse({ ...valid, identifier: "+21620123456" }).identifier).toBe("+21620123456");
  });
  it.each([
    [{ ...valid, identifier: "   " }, "identifierRequired"],
    [{ ...valid, password: "" }, "passwordRequired"],
    [{ ...valid, code: "" }, "codeInvalid"],
    [{ ...valid, code: "12345" }, "codeInvalid"],
    [{ ...valid, code: "1234567" }, "codeInvalid"],
    [{ ...valid, code: "12345a" }, "codeInvalid"],
  ])("refuses %j with %s", (input, code) => {
    const result = staffSignInSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(code);
  });
});

describe("outcomeOf: what the screen does with each answer", () => {
  const me = { account_id: "a", user_id: "u", kind: "staff", role: "agent", name: "N" };
  it("201 is a sign-in with the person", () => {
    expect(outcomeOf({ status: 201, headers: new Headers(), body: me })).toEqual({ kind: "ok", me });
  });
  it("401 is the one neutral message, whatever the fields say", () => {
    expect(outcomeOf({ status: 401, headers: new Headers(), body: { error: { code: "AUTH_REQUIRED", fields: [{ name: "identifier", reason: "invalidCredentials" }] } } })).toEqual({ kind: "invalid" });
    expect(outcomeOf({ status: 401, headers: new Headers(), body: undefined })).toEqual({ kind: "invalid" });
  });
  it("429 carries the wait from Retry-After, at least one second, and a default when the header is missing or wrong", () => {
    expect(outcomeOf({ status: 429, headers: new Headers({ "Retry-After": "42" }), body: undefined })).toEqual({ kind: "wait", seconds: 42 });
    expect(outcomeOf({ status: 429, headers: new Headers({ "Retry-After": "0" }), body: undefined })).toEqual({ kind: "wait", seconds: 1 });
    expect(outcomeOf({ status: 429, headers: new Headers(), body: undefined })).toEqual({ kind: "wait", seconds: 60 });
    expect(outcomeOf({ status: 429, headers: new Headers({ "Retry-After": "soon" }), body: undefined })).toEqual({ kind: "wait", seconds: 60 });
  });
  it("400 shows the field errors the server named, only the ones this form has", () => {
    expect(
      outcomeOf({ status: 400, headers: new Headers(), body: { error: { code: "VALIDATION_FAILED", fields: [{ name: "code", reason: "pattern" }, { name: "other", reason: "x" }] } } }),
    ).toEqual({ kind: "fields", fields: ["code"] });
  });
  it("a 5xx, a 403, an unexpected status or no answer at all is 'unavailable': retry", () => {
    for (const status of [500, 503, 502, 403, 418]) expect(outcomeOf({ status, headers: new Headers(), body: undefined }), String(status)).toEqual({ kind: "unavailable" });
    expect(outcomeOf(null)).toEqual({ kind: "unavailable" });
  });
});
