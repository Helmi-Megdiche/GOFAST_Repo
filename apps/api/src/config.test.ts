import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

describe("loadConfig", () => {
  it("has defaults", () => {
    expect(loadConfig({})).toMatchObject({
      port: 4000,
      wsPort: 4001,
      workerPort: 4002,
      trustProxy: false,
    });
  });
  it("reads true and false", () => {
    expect(loadConfig({ TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(loadConfig({ TRUST_PROXY: "false" }).trustProxy).toBe(false);
  });
  it("refuses TRUST_PROXY=yes, a bad port and a bad NODE_ENV at start-up", () => {
    expect(() => loadConfig({ TRUST_PROXY: "yes" })).toThrow(/TRUST_PROXY/);
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
  it("staff sign-in is off by default, allowed in dev and refused in production (T60)", () => {
    expect(loadConfig({}).staffSignIn).toBe(false);
    expect(loadConfig({ STAFF_SIGNIN: "true" }).staffSignIn).toBe(true);
    expect(() => loadConfig({ NODE_ENV: "production", STAFF_SIGNIN: "true" })).toThrow(
      /STAFF_SIGNIN/,
    );
  });
  it("refuses the fake SMS sender in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/SMS_PROVIDER/);
  });
});
