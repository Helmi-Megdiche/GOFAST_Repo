import { describe, expect, it } from "vitest";
import { ipKey } from "./ip.ts";

describe("ipKey (per-IP limits)", () => {
  it("keeps an IPv4 address as it is", () => {
    expect(ipKey("10.2.0.1")).toBe("10.2.0.1");
  });

  it("keys an IPv6 address by its /64: two addresses of one client share a counter", () => {
    expect(ipKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(ipKey("2001:db8:1:2::1"));
    expect(ipKey("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
  });

  it("gives another /64 another counter", () => {
    expect(ipKey("2001:db8:1:3::1")).not.toBe(ipKey("2001:db8:1:2::1"));
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });

  it("keys an IPv4-mapped address by the IPv4 address, dotted or hex", () => {
    expect(ipKey("::ffff:192.0.2.33")).toBe("192.0.2.33");
    expect(ipKey("::ffff:c000:221")).toBe("192.0.2.33");
  });

  it("ignores a zone id", () => {
    expect(ipKey("fe80::1%eth0")).toBe(ipKey("fe80::2"));
  });
});
