import { execFile } from "node:child_process";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { bundledSpecPath } from "../http/spec.ts";

process.env.MSYS_NO_PATHCONV = "1";
const run = promisify(execFile);
let app: NestFastifyApplication;
let port: number;

beforeAll(async () => {
  app = await createApp({ trustProxy: false });
  await app.listen(0, "0.0.0.0");
  port = (app.getHttpServer().address() as AddressInfo).port;
});
afterAll(() => app.close());

// Schemathesis 4 tests the running API against the bundled contract. Only the operations that have a
// handler are included; each PR adds its own `--include-operation-id` as it lands (PR 4a, PR 4b).
const IMPLEMENTED = ["getHealth"];

describe("Schemathesis against the contract", () => {
  it("finds no difference on the implemented operations", async () => {
    const args = [
      "run",
      "--rm",
      "--add-host",
      "host.docker.internal:host-gateway",
      "-v",
      `${bundledSpecPath()}:/spec.yaml:ro`,
      "schemathesis/schemathesis:4.33.4",
      "run",
      "/spec.yaml",
      "--url",
      `http://host.docker.internal:${port}`,
      "--checks",
      "all",
      // An undeclared method answers 404 NOT_FOUND, not 405: the cahier has no 405 (open question on #7).
      "--exclude-checks",
      "unsupported_method",
      ...IMPLEMENTED.flatMap((id) => ["--include-operation-id", id]),
    ];
    const result = await run("docker", args, { timeout: 150_000 }).catch((e) => e);
    // A non-zero exit code makes `run` throw: the check can fail.
    expect(result.code, `${result.stdout ?? ""}\n${result.stderr ?? ""}`).toBeUndefined();
  });
});
