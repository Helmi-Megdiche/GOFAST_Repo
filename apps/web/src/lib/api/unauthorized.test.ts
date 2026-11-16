import { describe, expect, it } from "vitest";
import { signInUrl } from "./unauthorized";

describe("401 redirects to sign-in (#20)", () => {
  it("keeps a same-site path in ?next=", () => {
    expect(signInUrl("fr", "/compte/commandes?x=1")).toBe(
      "/fr/connexion?next=" + encodeURIComponent("/compte/commandes?x=1"),
    );
  });

  it.each([
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "",
  ])("refuses %j: no next, or the safe default", (bad) => {
    const url = signInUrl("fr", bad);
    expect(url).not.toContain("evil");
    expect(url).not.toContain("javascript");
    expect(url.startsWith("/fr/connexion")).toBe(true);
  });
});
