import { isLocale, type Locale } from "@fastgo/i18n";
import {
  findByEmail,
  findById,
  saveAccount,
  type Account,
  type NotificationPrefs,
} from "./accounts";
import { mockDelay } from "./delay";
import { consumeFailNext } from "./mock-db";
import { consumeVerification, isTargetVerified } from "./otp";
import { NetworkError } from "./orders";
import { getSession, type Session } from "./session";

/**
 * The profile of the signed-in account (ESP-02, C09) and its changes. Customers and merchants share
 * the account row; every function reads the account of `session.accountId` and nothing else. The
 * phone is read-only in L1 (H20): there is no function that changes it.
 */
export type Profile = {
  name: string | null;
  phone: string | null;
  email: string | null;
  /** True while a Google account is linked (R103). */
  google: boolean;
  /** R902. */
  locale: Locale;
  notifications: NotificationPrefs;
};

export type ProfileChange = { status: "ok" } | { status: "notFound" };

const openAccount = (session: Session): Account | null => {
  const account = findById(session.accountId);
  return account && account.status === "active" ? account : null;
};

/** Mock of GET /v1/me. */
export async function getProfile(session: Session): Promise<Profile> {
  await mockDelay();
  if (consumeFailNext("getProfile")) throw new NetworkError();
  const account = openAccount(session);
  if (!account) throw new NetworkError();
  return {
    name: account.name,
    phone: account.phone,
    email: account.email,
    google: account.google,
    locale: account.locale,
    notifications: account.notifications,
  };
}

export async function updateName(
  session: Session,
  name: string,
): Promise<ProfileChange | { status: "invalidName" }> {
  await mockDelay();
  const account = openAccount(session);
  if (!account) return { status: "notFound" };
  if (name.trim() === "") return { status: "invalidName" };
  saveAccount({ ...account, name: name.trim() });
  return { status: "ok" };
}

/** SMS, e-mail and offers. Touches no other setting. */
export async function setNotifications(
  session: Session,
  patch: Partial<NotificationPrefs>,
): Promise<ProfileChange> {
  await mockDelay();
  const account = openAccount(session);
  if (!account) return { status: "notFound" };
  saveAccount({ ...account, notifications: { ...account.notifications, ...patch } });
  return { status: "ok" };
}

/**
 * R902: the language chosen on the account is saved on the account and applied at the next sign-in.
 * It changes no order (`recipientLocale` stays), no notification preference and no other setting.
 */
export async function setAccountLocale(session: Session, locale: Locale): Promise<ProfileChange> {
  await mockDelay();
  const account = openAccount(session);
  if (!account || !isLocale(locale)) return { status: "notFound" };
  saveAccount({ ...account, locale });
  return { status: "ok" };
}

/**
 * The site's language switcher (R902 "depuis le site ou son compte"): saves the language on the
 * account exactly like C09 when someone is signed in; signed out, it saves nothing.
 */
export async function saveLocaleIfSignedIn(locale: Locale): Promise<void> {
  const session = getSession();
  if (!session) return;
  // No mock delay: the page changes language right after the click.
  const account = openAccount(session);
  if (account && isLocale(locale)) saveAccount({ ...account, locale });
}

/** H11: allowed, a password can still be set through the SMS reset. The phone stays (R103). */
export async function unlinkGoogle(session: Session): Promise<ProfileChange> {
  await mockDelay();
  const account = openAccount(session);
  if (!account) return { status: "notFound" };
  saveAccount({ ...account, google: false });
  return { status: "ok" };
}

export type AttachEmailResult =
  | { status: "attached" }
  | { status: "invalidEmail" }
  /** The code of this e-mail (purpose "emailConfirm") was not verified, or its window has passed. */
  | { status: "notVerified" }
  /** R101, said only after the right code: the e-mail belongs to another account. */
  | { status: "emailTaken" }
  | { status: "notFound" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Attaches an e-mail to the account (ESP-01, R101, R102) once the code sent to it was verified.
 * The code is used once, whatever the outcome, and "already used" is only said after the right code,
 * so the screen never tells whether an e-mail has an account.
 */
export async function attachEmail(session: Session, email: string): Promise<AttachEmailResult> {
  await mockDelay();
  const account = openAccount(session);
  if (!account) return { status: "notFound" };
  const typed = email.trim().toLowerCase();
  if (!EMAIL.test(typed)) return { status: "invalidEmail" };
  const target = { channel: "email", value: typed } as const;
  if (!isTargetVerified(target, "emailConfirm")) return { status: "notVerified" };
  consumeVerification(target, "emailConfirm");
  const owner = findByEmail(typed);
  if (owner && owner.id !== account.id) return { status: "emailTaken" };
  saveAccount({ ...account, email: typed });
  return { status: "attached" };
}
