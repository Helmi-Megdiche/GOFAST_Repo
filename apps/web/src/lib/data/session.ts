import { readJson, removeKey, writeJson } from "../storage";

/**
 * The mock session (one module, one key). It keeps only what the pages need to decide what to
 * show: account id, kind, contract state, phone-verified flag and the masked phone for display.
 * Never the full phone, a password or a code. Never compare anything against maskedPhone.
 */
export type Session = {
  accountId: string;
  kind: "customer" | "merchant";
  contract: "validated" | "pending" | null;
  phoneVerified: boolean;
  maskedPhone: string;
};

export const SESSION_KEY = "fg.mock.session";

export function getSession(): Session | null {
  const value = readJson(SESSION_KEY) as Partial<Session> | null;
  if (
    !value ||
    typeof value.accountId !== "string" ||
    (value.kind !== "customer" && value.kind !== "merchant")
  ) {
    return null;
  }
  return {
    accountId: value.accountId,
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

export function signOut(): void {
  removeKey(SESSION_KEY);
}

/** R104: "Compte client" only for a merchant whose contract is validated. */
export function canPayOnAccount(session: Session | null): boolean {
  return session?.kind === "merchant" && session.contract === "validated";
}
