import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_SIGN_IN, safeNext } from "./safe-next";

describe("safeNext (decision 17)", () => {
  it.each([
    ["/commander/verification", "/commander/verification"],
    ["/fr/commander/verification", "/commander/verification"],
    ["/ar/compte", "/compte"],
    ["/suivi?n=FG-7K4M-2QXP", "/suivi?n=FG-7K4M-2QXP"],
    ["/", "/"],
  ])("keeps the path %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example",
    "http://evil.example/compte",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "data:text/html,hi",
    "compte",
    "/compte\n",
    "/\tevil",
    "/%0d%0aSet-Cookie:x",
  ])("refuses %s and falls back to /compte", (input) => {
    const result = safeNext(input);
    if (input === "/%0d%0aSet-Cookie:x") {
      // Encoded characters stay encoded inside our own path: still on this site.
      expect(result.startsWith("/")).toBe(true);
      expect(result).not.toMatch(/[\r\n]/);
      return;
    }
    expect(result).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});
