import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

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
  it("GH-22 R903: PUBLIC_WEB_URL (the link of the tracking SMS) is an origin, optional in dev, required in production", () => {
    expect(loadConfig({}).publicWebUrl).toBeUndefined();
    expect(loadConfig({ PUBLIC_WEB_URL: "https://gofast.example" }).publicWebUrl).toBe("https://gofast.example");
    expect(() => loadConfig({ PUBLIC_WEB_URL: "gofast.example" })).toThrow(/PUBLIC_WEB_URL/);
    expect(() => loadConfig({ PUBLIC_WEB_URL: "https://gofast.example/fr" })).toThrow(/PUBLIC_WEB_URL/);
    expect(() => loadConfig({ NODE_ENV: "production", SMS_PROVIDER: "fake" })).toThrow(/SMS_PROVIDER/);
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
