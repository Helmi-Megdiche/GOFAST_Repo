import { type Actor, OwnerCheck } from "../http/session.ts";
import type { Operation } from "../http/tokens.ts";

/** The operations of PR 4a that act on the caller's own profile. Anything else is refused until its PR binds a check. */
const OWN_PROFILE = new Set(["deleteSession", "getMe", "updateMe"]);

/** Deny by default: an operation with no rule here is 404 for every signed-in actor. */
export class AuthOwners extends OwnerCheck {
  override async allows(_actor: Actor, operation: Operation): Promise<boolean> {
    return OWN_PROFILE.has((operation as { operationId?: string }).operationId ?? "");
  }
}
