import type { Role } from "./spec.ts";
import type { Operation } from "./tokens.ts";

export type Actor = {
  accountId: string;
  userId: string;
  role: Role;
};

/**
 * Reads the actor of a request. PR 4a (#9) binds the Redis session. It must read the role and the
 * account from the stored session, never from the cookie itself (RV-19: a role change or a closed
 * account applies at once). Until then nobody is signed in.
 */
export abstract class SessionResolver {
  abstract resolve(cookies: Record<string, string | undefined>): Promise<Actor | null>;
}

export class NoSessions extends SessionResolver {
  override async resolve(): Promise<Actor | null> {
    return null;
  }
}

/**
 * "Own only" routes (a customer reads their own orders): after the role check the guard asks
 * whether this actor may see this resource, and answers 404 NOT_FOUND when not, so a resource of
 * someone else is not revealed. PR 4b (#22) binds the real check (order owner, merchant account).
 */
export abstract class OwnerCheck {
  abstract allows(
    actor: Actor,
    operation: Operation,
    params: Record<string, unknown>,
  ): Promise<boolean>;
}

export class AnyOwner extends OwnerCheck {
  override async allows(): Promise<boolean> {
    return true;
  }
}
