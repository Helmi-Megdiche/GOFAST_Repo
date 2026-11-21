import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

// GH-25 F1 (RV-27): an example value of a secret is the one fake value the code refuses in production, in every example file.
// A copied example must never run on a key that is published in this public repository. The key is bytes 0 to 31 (config.ts).
const REFUSED_TOTP_KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const examples = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\0")
  .filter((f) => /^\.env.*\.example$/.test(basename(f)));

describe("GH-25 F1: every tracked .env*.example", () => {
  it("is found by git ls-files (a search that finds nothing proves nothing)", () => {
    expect(examples.length).toBeGreaterThan(0);
    expect(examples).toContain("apps/api/.env.example");
  });

  it("sets TOTP_KEY, where it does, to the one fake key production refuses", () => {
    const wrong: string[] = [];
    let setting = 0;
    for (const file of examples) {
      for (const line of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
        const m = /^\s*TOTP_KEY=(.*)$/.exec(line);
        if (!m) continue;
        setting += 1;
        // a trailing comment after the value is allowed
        const value = (m[1] ?? "").replace(/\s+#.*$/, "").trim();
        if (value !== REFUSED_TOTP_KEY) wrong.push(`${file}: TOTP_KEY=${value}`);
      }
    }
    expect(setting).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });
});
