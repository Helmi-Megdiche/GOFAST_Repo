import { describe, expect, it } from "vitest";
import { loadConfig, requireBackends } from "./config.ts";

describe("loadConfig", () => {
  it("has defaults", () => {
    expect(loadConfig({})).toMatchObject({
      port: 4000,
      wsPort: 4001,
      workerPort: 4002,
      trustProxy: 0,
    });
  });
  it("reads TRUST_PROXY as a number of proxy hops", () => {
    expect(loadConfig({ TRUST_PROXY: "1" }).trustProxy).toBe(1);
    expect(loadConfig({ TRUST_PROXY: "2" }).trustProxy).toBe(2);
  });
  it("refuses TRUST_PROXY=true (trusts every hop), a bad port and a bad NODE_ENV at start-up", () => {
    expect(() => loadConfig({ TRUST_PROXY: "true" })).toThrow(/TRUST_PROXY/);
    expect(() => loadConfig({ TRUST_PROXY: "-1" })).toThrow(/TRUST_PROXY/);
    expect(() => loadConfig({ PORT: "99999" })).toThrow(/PORT/);
    expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
  it("reads the origins list and refuses a value that is not an origin", () => {
    expect(
      loadConfig({ ALLOWED_ORIGINS: "https://gofast.example, http://localhost:3000" })
        .allowedOrigins,
    ).toEqual(["https://gofast.example", "http://localhost:3000"]);
    expect(loadConfig({}).allowedOrigins).toEqual([]);
    expect(() => loadConfig({ ALLOWED_ORIGINS: "gofast.example" })).toThrow(/ALLOWED_ORIGINS/);
    expect(() => loadConfig({ ALLOWED_ORIGINS: "https://gofast.example/path" })).toThrow(
      /ALLOWED_ORIGINS/,
    );
  });
  it("refuses a short AUTH_SECRET", () => {
    expect(() => loadConfig({ AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });
  it("GH-25 T60: the STAFF_SIGNIN switch is gone: staff sign in on their own route, with a second factor", () => {
    expect("staffSignIn" in loadConfig({ STAFF_SIGNIN: "true" })).toBe(false);
  });
  it("GH-25 T60: TOTP_KEY is 32 bytes in base64, wherever it is given", () => {
    const key = Buffer.alloc(32, 5).toString("base64");
    expect(loadConfig({ TOTP_KEY: key }).totpKey?.equals(Buffer.alloc(32, 5))).toBe(true);
    expect(loadConfig({}).totpKey).toBeUndefined();
    expect(() => loadConfig({ TOTP_KEY: Buffer.alloc(31, 5).toString("base64") })).toThrow(/TOTP_KEY/);
    expect(() => loadConfig({ TOTP_KEY: "nope" })).toThrow(/TOTP_KEY/);
  });
  it("GH-25 T60: production without TOTP_KEY throws, before anything else is checked", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/TOTP_KEY is required in production/);
  });
  it("GH-25: the api cannot start without TOTP_KEY", () => {
    const base = loadConfig({ DATABASE_URL: "postgres://x", REDIS_URL: "redis://x", AUTH_SECRET: "s".repeat(40) });
    expect(() => requireBackends(base)).toThrow(/TOTP_KEY/);
    expect(requireBackends({ ...base, totpKey: Buffer.alloc(32, 1) }).totpKey).toHaveLength(32);
  });
  it("refuses the fake SMS sender in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production", TOTP_KEY: Buffer.alloc(32, 5).toString("base64") })).toThrow(/SMS_PROVIDER/);
  });
});
