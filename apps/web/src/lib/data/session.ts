import { DRAFT_KEY } from "../order/draft";
import { readJson, removeKey, writeJson } from "../storage";

/**
 * The mock session (one module, one key). It keeps only what the pages need to decide what to
 * show: account id, the signed-in user and role, kind, contract state, phone-verified flag and the masked phone for display.
 * Never the full phone, a password or a code. Never compare anything against maskedPhone.
 */
export type Session = {
  accountId: string;
  /** The person signed in: the account itself for a customer, a team member for a merchant (ADR-2). */
  userId: string;
  /** Merchant team role (H5); null for a customer. */
  role: "admin" | "user" | null;
  kind: "customer" | "merchant";
  contract: "validated" | "pending" | null;
  phoneVerified: boolean;
  maskedPhone: string;
};

export const SESSION_KEY = "fg.mock.session";

/** The Google sign-in in progress (lib/data/google.ts). Kept here so sign-out can clear it. */
export const GOOGLE_PENDING_KEY = "fg.mock.google.pending";

export function getSession(): Session | null {
  const value = readJson(SESSION_KEY) as Partial<Session> | null;
  if (
    !value ||
    typeof value.accountId !== "string" ||
    (value.kind !== "customer" && value.kind !== "merchant")
  ) {
    return null;
  }
  // An older session has no user or role: the account is the user; a merchant is its own admin.
  const role =
    value.role === "admin" || value.role === "user"
      ? value.role
      : value.kind === "merchant"
        ? "admin"
        : null;
  return {
    accountId: value.accountId,
    userId:
      typeof value.userId === "string" && value.userId !== "" ? value.userId : value.accountId,
    role: value.kind === "merchant" ? role : null,
    kind: value.kind,
    contract:
      value.contract === "validated" || value.contract === "pending" ? value.contract : null,
    phoneVerified: value.phoneVerified === true,
    maskedPhone: typeof value.maskedPhone === "string" ? value.maskedPhone : "",
  };
}

export function setSession(session: Session): void {
  writeJson(SESSION_KEY, session);
}

/**
 * Ends the session, forgets a Google sign-in left half-way and the order draft (it holds personal
 * data). The fg.mock.* tables are the "server": they are never touched.
 */
export function signOut(): void {
  removeKey(SESSION_KEY);
  removeKey(GOOGLE_PENDING_KEY);
  removeKey(DRAFT_KEY);
}

/** Where a signed-in person lands when no safe ?next= was given: the client or the pro space. */
export function homeFor(session: Session): "/compte" | "/pro" {
  return session.kind === "merchant" ? "/pro" : "/compte";
}

/** R104: "Compte client" only for a merchant whose contract is validated. */
export function canPayOnAccount(session: Session | null): boolean {
  return session?.kind === "merchant" && session.contract === "validated";
}
