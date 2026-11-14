import { migrate } from "./migrate.ts";

// `pnpm --filter @fastgo/api db:migrate` with DATABASE_MIGRATOR_URL (direct connection, never PgBouncer).
const url = process.env["DATABASE_MIGRATOR_URL"];
if (!url) throw new Error("DATABASE_MIGRATOR_URL is not set");
const done = await migrate(url);
console.log(done.length > 0 ? `applied: ${done.join(", ")}` : "nothing to apply");
