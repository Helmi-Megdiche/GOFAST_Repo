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
});
