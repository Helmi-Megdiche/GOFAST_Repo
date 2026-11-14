import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");

const LOCK_KEY = 7_426_001; // any constant: one runner at a time on this database
const TABLE = "public.fastgo_migrations";

type Applied = { name: string; checksum: string };
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Applies `migrations/`: first `R__*.sql` (repeatable, run again when the file changes), then
 * `NNNN_*.sql` in order, each once. One transaction per file, a checksum per file (a versioned file
 * that changed after it ran is an error), and `pg_advisory_xact_lock` so two runners cannot
 * overlap. Connect DIRECTLY to PostgreSQL as `fastgo_migrator`, never through PgBouncer.
 * Returns the names it applied.
 */
export async function migrate(url: string, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const repeatable = files.filter((f) => f.startsWith("R__")).sort();
  const versioned = files.filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const unknown = files.filter((f) => !repeatable.includes(f) && !versioned.includes(f));
  if (unknown.length > 0) throw new Error(`Unexpected migration file name: ${unknown.join(", ")}`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const done: string[] = [];
  try {
    await client.query(
      `create table if not exists ${TABLE} (name text primary key, checksum text not null,
         applied_at timestamptz not null default now())`,
    );
    for (const name of [...repeatable, ...versioned]) {
      const text = readFileSync(join(dir, name), "utf8");
      const checksum = sha(text);
      const isRepeatable = name.startsWith("R__");
      await client.query("begin");
      try {
        await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
        const row = (
          await client.query<Applied>(`select name, checksum from ${TABLE} where name = $1`, [name])
        ).rows[0];
        if (row && row.checksum === checksum) {
          await client.query("rollback");
          continue;
        }
        if (row && !isRepeatable) {
          throw new Error(`Migration ${name} was changed after it ran (checksum differs). Add a new file.`);
        }
        await client.query(text);
        await client.query(
          `insert into ${TABLE} (name, checksum) values ($1, $2)
             on conflict (name) do update set checksum = excluded.checksum, applied_at = now()`,
          [name, checksum],
        );
        await client.query("commit");
        done.push(name);
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error });
      }
    }
  } finally {
    await client.end();
  }
  return done;
}
