import { describe, expect, it } from "vitest";
import { Passwords } from "./password.ts";
import { bootAuth } from "./wiring.ts";

const config = { nodeEnv: "test" as const, allowedOrigins: [] as string[] };

describe("bootAuth", () => {
  it("builds the dummy hash before it returns, and hands the same Passwords to the service", async () => {
    const calls: string[] = [];
    class Spy extends Passwords {
      override ready(): Promise<string> {
        calls.push("ready");
        return super.ready();
      }
    }
    const passwords = new Spy();
    const options = await bootAuth(config, { db: {} as never, redis: {} as never, authSecret: "s".repeat(40), totpKey: Buffer.alloc(32, 3), passwords });
    expect(calls).toEqual(["ready"]);
    expect(options.controllers).toHaveLength(1);
    const service = (options.providers?.[0] as { useValue: { d: { passwords: Passwords } } }).useValue;
    expect(service.d.passwords).toBe(passwords);
  });
});
