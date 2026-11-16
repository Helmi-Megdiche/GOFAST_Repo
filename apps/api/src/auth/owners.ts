import { type Actor, OwnerCheck } from "../http/session.ts";
import type { Operation } from "../http/tokens.ts";

/** The operations of PR 4a that act on the caller's own profile. Anything else is refused until its PR binds a check. */
const OWN_PROFILE = new Set(["deleteSession", "getMe", "updateMe"]);

/**
 * The four public routes of issue #10 (pricing). A public route never reaches the owner check (the guard
 * skips it), but each is listed so a staff session that calls one is never answered 404 by mistake.
 */
const PRICING = new Set(["listServices", "createZoneCheck", "createQuote", "getQuote"]);

/** Deny by default: an operation with no rule here is 404 for every signed-in actor. */
export class AuthOwners extends OwnerCheck {
  override async allows(_actor: Actor, operation: Operation): Promise<boolean> {
    const id = (operation as { operationId?: string }).operationId ?? "";
    return OWN_PROFILE.has(id) || PRICING.has(id);
  }
}
