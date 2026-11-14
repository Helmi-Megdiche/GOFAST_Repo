import type { Role } from "./spec.ts";

export type Actor = {
  accountId: string;
  userId: string;
  role: Role;
};

/** Reads the actor of a request. PR 4a (#9) binds the Redis session; until then nobody is signed in. */
export abstract class SessionResolver {
  abstract resolve(cookies: Record<string, string | undefined>): Promise<Actor | null>;
}

export class NoSessions extends SessionResolver {
  override async resolve(): Promise<Actor | null> {
    return null;
  }
}
