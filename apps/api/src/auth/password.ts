import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id, OWASP minimum (19 MiB, 2 passes, 1 lane). PROVISIONAL until the production server is
 * measured. The stored value is the PHC string: it carries its own settings, so they can change later.
 */
export const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
// `Algorithm` of @node-rs/argon2 is a const enum, unusable under isolated modules: 2 is Argon2id.
const ARGON2ID = 2;

export class Passwords {
  private dummy: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, { algorithm: ARGON2ID, ...ARGON2 });
  }

  async verify(stored: string, password: string): Promise<boolean> {
    try {
      return await verify(stored, password);
    } catch {
      return false;
    }
  }

  /** True when the stored hash was made with other settings than ARGON2: rehash at the next sign-in. */
  needsRehash(stored: string): boolean {
    const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored);
    return (
      !m ||
      Number(m[1]) !== ARGON2.memoryCost ||
      Number(m[2]) !== ARGON2.timeCost ||
      Number(m[3]) !== ARGON2.parallelism
    );
  }

  /** Built once at start-up. Awaited before the first request. */
  ready(): Promise<string> {
    this.dummy ??= this.hash(`dummy-${Math.random()}-${Date.now()}`);
    return this.dummy;
  }

  /** The same work as a real check, for an identifier that matches no account (no timing difference, R102). */
  async verifyDummy(password: string): Promise<false> {
    await this.verify(await this.ready(), password);
    return false;
  }
}
