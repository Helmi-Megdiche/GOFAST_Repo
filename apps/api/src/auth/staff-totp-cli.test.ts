import { describe, expect, it } from "vitest";
import { parseArgs } from "./staff-totp-cli.ts";

// GH-25 T60: the arguments of `pnpm --filter @fastgo/api staff:totp`. The database rules are in staff-totp-cli.int.test.ts.

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("staff:totp arguments", () => {
  it("enrol <account-id> [--label <text>]", () => {
    expect(parseArgs(["enrol", A])).toEqual({ cmd: "enrol", id: A, label: undefined, by: undefined });
    expect(parseArgs(["enrol", A, "--label", "nadia@fastgo.example"])).toEqual({ cmd: "enrol", id: A, label: "nadia@fastgo.example", by: undefined });
    // S6: the admin who enrols
    expect(parseArgs(["enrol", A, "--by", B])).toEqual({ cmd: "enrol", id: A, label: undefined, by: B });
    expect(() => parseArgs(["enrol", A, "--by", "not-a-uuid"])).toThrow(/uuid/);
    expect(() => parseArgs(["enrol", A, "--by", A])).toThrow(/second admin/);
  });
  it("reset <account-id> --by <admin-id> --reason <text>", () => {
    expect(parseArgs(["reset", A, "--by", B, "--reason", "Phone lost"])).toEqual({ cmd: "reset", id: A, by: B, reason: "Phone lost" });
  });
  it("refuses a missing, blank or misplaced argument before any database call", () => {
    for (const argv of [
      [],
      ["nope", A],
      ["enrol"],
      ["enrol", "not-a-uuid"],
      ["reset", A],
      ["reset", A, "--by", B],
      ["reset", A, "--by", B, "--reason", "   "],
      ["reset", A, "--by", "not-a-uuid", "--reason", "x"],
      ["reset", A, "--by", A, "--reason", "my own phone"], // the second admin must be someone else
      ["enrol", A, "--label"],
      ["reset", A, "--by", B, "--reason", "x", "--force"],
    ])
      expect(() => parseArgs(argv), JSON.stringify(argv)).toThrow();
  });
});
