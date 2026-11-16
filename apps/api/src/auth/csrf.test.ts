import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { cookieNameFor, sessionCookieOptions } from "./sessions.ts";
import { CsrfGuard } from "./csrf.ts";

const guard = new CsrfGuard({ cookieName: "session", allowedOrigins: ["https://gofast.example"] });
const run = (req: Record<string, unknown>) =>
  guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext);
const post = (over: Record<string, unknown> = {}, headers: Record<string, string> = {}) => ({
  method: "POST",
  cookies: { session: "abc" },
  headers: { origin: "https://gofast.example", "content-type": "application/json", "content-length": "10", ...headers },
  ...over,
});

describe("CsrfGuard", () => {
  it("lets reads through", () => expect(run({ method: "GET", cookies: { session: "a" }, headers: {} })).toBe(true));
  it("lets a write without a session cookie through (sign-in, sign-up)", () =>
    expect(run({ method: "POST", cookies: {}, headers: {} })).toBe(true));
  it("accepts an allowed origin with JSON", () => expect(run(post())).toBe(true));
  const denied = { code: "ACCESS_DENIED" };
  it("refuses a write with a cookie and a foreign origin", () =>
    expect(() => run(post({}, { origin: "https://evil.example" }))).toThrow(expect.objectContaining({ code: denied.code })));
  it("refuses a missing Origin", () => {
    const r = post();
    delete (r.headers as Record<string, string>).origin;
    expect(() => run(r)).toThrow(expect.objectContaining({ code: denied.code }));
  });
  it("refuses a form content type when there is a body", () =>
    expect(() => run(post({}, { "content-type": "application/x-www-form-urlencoded" }))).toThrow(
      expect.objectContaining({ code: denied.code }),
    ));
  it("accepts a DELETE with no body and no content type", () => {
    const r = post({ method: "DELETE" });
    delete (r.headers as Record<string, string>)["content-type"];
    delete (r.headers as Record<string, string>)["content-length"];
    expect(run(r)).toBe(true);
  });
  it("an empty allow-list refuses every write that has a cookie", () => {
    const g = new CsrfGuard({ cookieName: "session", allowedOrigins: [] });
    expect(() =>
      g.canActivate({ switchToHttp: () => ({ getRequest: () => post() }) } as unknown as ExecutionContext),
    ).toThrow(expect.objectContaining({ code: denied.code }));
  });
});

describe("cookie", () => {
  it("is __Host- in production and plain in development", () => {
    expect(cookieNameFor("production")).toBe("__Host-session");
    expect(cookieNameFor("development")).toBe("session");
  });
  it("is HttpOnly, Secure, Lax, Path=/, with no Domain", () => {
    const o = sessionCookieOptions(false);
    expect(o).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(o.domain).toBeUndefined();
    // The cookie is set once, so it lasts as long as the session can (the 90-day cap); the server
    // enforces the sliding idle window.
    expect(o.maxAge).toBe(90 * 86400);
    expect(sessionCookieOptions(true).maxAge).toBe(12 * 3600);
  });
});
