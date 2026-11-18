import { main } from "./staff-totp-cli.ts";

// `pnpm --filter @fastgo/api staff:totp ...` (GH-25 T60). The logic and its tests are in staff-totp-cli.ts.
process.exitCode = await main(process.argv.slice(2), process.env, {
  log: (line) => console.log(line),
  err: (line) => console.error(line),
});
