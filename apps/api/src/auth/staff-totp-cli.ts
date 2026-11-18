import pg from "pg";
import { encryptSecret, newSecret, otpauthUri, parseTotpKey } from "./totp.ts";

// GH-25 T60: the operator's command, with no screen: `pnpm --filter @fastgo/api staff:totp enrol <account-id> [--label <text>]` and
// `... reset <account-id> --by <admin-id> --reason "<text>"`. It connects with DATABASE_MIGRATOR_URL (the operator's login, never the
// app's) and calls the definers core.staff_totp_enrol and core.staff_totp_reset, which audit. The URI is printed once, never stored.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE = `usage:
  staff:totp enrol <account-id> [--label <text>]
  staff:totp reset <account-id> --by <admin-id> --reason "<text>"`;

export type Command =
  | { cmd: "enrol"; id: string; label: string | undefined }
  | { cmd: "reset"; id: string; by: string; reason: string };

export function parseArgs(argv: string[]): Command {
  const [cmd, id, ...rest] = argv;
  if ((cmd !== "enrol" && cmd !== "reset") || !id || !UUID.test(id)) throw new Error(`${USAGE}\n(the account id is a uuid)`);
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i];
    const value = rest[i + 1];
    if (!name?.startsWith("--") || value === undefined) throw new Error(`${USAGE}\n(${name ?? "a flag"} needs a value)`);
    flags.set(name, value);
  }
  const allowed = cmd === "enrol" ? ["--label"] : ["--by", "--reason"];
  for (const name of flags.keys()) if (!allowed.includes(name)) throw new Error(`${USAGE}\n(${name} is not an option of ${cmd})`);
  if (cmd === "enrol") return { cmd, id, label: flags.get("--label") };
  const by = flags.get("--by");
  const reason = flags.get("--reason")?.trim();
  if (!by || !UUID.test(by)) throw new Error(`${USAGE}\n(--by is the uuid of another admin)`);
  if (by.toLowerCase() === id.toLowerCase()) throw new Error("a second admin must do it: --by cannot be the account itself");
  if (!reason) throw new Error(`${USAGE}\n(--reason is required: the emergency access is recorded, T60)`);
  return { cmd, id, by, reason };
}

type Queryable = Pick<pg.Client, "query">;

/** Makes the secret, stores it encrypted (bound to the account), and returns the URI for the authenticator app. */
export async function enrol(client: Queryable, key: Buffer, accountId: string, label?: string): Promise<string> {
  const secret = newSecret();
  await client.query("select core.staff_totp_enrol($1::uuid, $2::bytea)", [accountId, encryptSecret(secret, key, accountId)]);
  return otpauthUri({ secret, account: label ?? accountId, issuer: "GOFAST" });
}

/** T60, p.67: the emergency reset by a second admin. The definer refuses the target itself, a non-admin and a blank reason. */
export async function reset(client: Queryable, accountId: string, by: string, reason: string): Promise<void> {
  await client.query("select core.staff_totp_reset($1::uuid, $2::uuid, $3)", [accountId, by, reason]);
}

export type Out = { log: (line: string) => void; err: (line: string) => void };

/** Returns the exit code. Nothing is printed that could hold a secret except the one URI of `enrol`. */
export async function main(argv: string[], env: Record<string, string | undefined>, out: Out): Promise<number> {
  let command: Command;
  try {
    command = parseArgs(argv);
  } catch (error) {
    out.err((error as Error).message);
    return 1;
  }
  const url = env["DATABASE_MIGRATOR_URL"];
  if (!url) {
    out.err("DATABASE_MIGRATOR_URL is not set (the operator's login, direct connection)");
    return 1;
  }
  let key: Buffer | undefined;
  if (command.cmd === "enrol") {
    try {
      key = parseTotpKey(env["TOTP_KEY"] ?? "");
    } catch {
      out.err("TOTP_KEY must be 32 bytes in base64");
      return 1;
    }
  }
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    if (command.cmd === "enrol" && key) {
      const uri = await enrol(client, key, command.id, command.label);
      out.log("Enrolled. Scan or type this address in the authenticator app. It is shown once and is not stored:");
      out.log(uri);
    } else if (command.cmd === "reset") {
      await reset(client, command.id, command.by, command.reason);
      out.log("Reset and audited. The account enrols again with `enrol`.");
    }
    return 0;
  } catch (error) {
    out.err((error as Error).message);
    return 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
