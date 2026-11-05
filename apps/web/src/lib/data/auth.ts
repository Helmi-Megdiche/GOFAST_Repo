import { PASSWORD_MIN_LENGTH } from "../order/constants";
import { normalizePhone } from "../phone";
import { findByEmail, findByPhone, sessionFor } from "./accounts";
import { mockDelay } from "./delay";
import { FIXTURE_PASSWORD } from "./fixtures/accounts";
import { consumeVerification, isTargetVerified, sendCode, type SendResult } from "./otp";
import { setSession, type Session } from "./session";

/** Mock of POST /v1/auth/sign-in (ESP-01). */
export type SignInResult = { status: "ok"; session: Session } | { status: "invalidCredentials" };

/**
 * Same answer for a wrong password and an unknown account (decision 16), so the form cannot be
 * used to find out who has an account.
 */
export async function signIn(identifier: string, password: string): Promise<SignInResult> {
  await mockDelay();
  const account = normalizePhone(identifier) ? findByPhone(identifier) : findByEmail(identifier);
  if (!account || password !== FIXTURE_PASSWORD) return { status: "invalidCredentials" };
  const session = sessionFor(account);
  setSession(session);
  return { status: "ok", session };
}

/**
 * "Mot de passe oublié" (W21): always sends through the same path, whether or not the phone has an
 * account, so the answer and the limits are identical (decision 16).
 */
export function requestPasswordReset(phone: string): Promise<SendResult> {
  return sendCode({ channel: "sms", value: phone }, "reset");
}

export type NewPasswordResult =
  { status: "ok" } | { status: "tooShort" } | { status: "notVerified" };

/** New password after W21 and W20 (proposed step, not in the mockup). */
export async function setNewPassword(phone: string, password: string): Promise<NewPasswordResult> {
  await mockDelay();
  const target = { channel: "sms", value: phone } as const;
  if (!isTargetVerified(target, "reset")) return { status: "notVerified" };
  if (password.length < PASSWORD_MIN_LENGTH) return { status: "tooShort" };
  consumeVerification(target);
  // The mock does not store passwords: an unknown phone gets the same answer and nothing changes.
  return { status: "ok" };
}
