import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "./migrate.ts";

const SRC = join(import.meta.dirname, "..");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)(\/\/|--).*$/gm, "$1");

// What makes a pooled connection unsafe behind PgBouncer (transaction mode), or lets code skip the door.
const FORBIDDEN: Array<[string, RegExp]> = [
  ["set_config(..., false) keeps the value for the whole session", /set_config\s*\([^)]*,\s*false\s*\)/i],
  ["a bare SET outlives the transaction (use set_config(..., true))", /(^|[;'"`\s])set\s+(session\s+\w+|\w+\.\w+\s*(=|to\b)|(statement_timeout|lock_timeout|role|time\s*zone)\b)/im],
  ["advisory locks (session level) break under PgBouncer; use pg_advisory_xact_lock", /pg_advisory_lock\b|pg_try_advisory_lock\b/i],
  ["named prepared statements break under PgBouncer", /\bprepare\s+\w+\s+(as|\()|query\s*\(\s*\{[^}]*\bname\s*:/i],
];

describe("one door to the database (T55 support)", () => {
  const code = walk(SRC).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !relative(SRC, f).startsWith("int"),
  );
  const migrations = readdirSync(MIGRATIONS_DIR).map((f) => join(MIGRATIONS_DIR, f));

  for (const [why, pattern] of FORBIDDEN) {
    it(`no code or migration: ${why}`, () => {
      const hits = [...code, ...migrations]
        .filter((f) => pattern.test(stripComments(readFileSync(f, "utf8"))))
        .map((f) => relative(SRC, f));
      expect(hits).toEqual([]);
    });
  }

  it("the db module does not export the pool", () => {
    const index = readFileSync(join(SRC, "db", "index.ts"), "utf8");
    expect(index).not.toMatch(/from\s+["']pg["']|\bPool\b/);
  });
});
