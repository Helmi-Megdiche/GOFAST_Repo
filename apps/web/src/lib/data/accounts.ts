import { maskPhone, normalizePhone } from "../phone";
import {
  FIXTURE_ACCOUNTS,
  FIXTURE_TEAM_MEMBERS,
  type FixtureAccount,
  type FixtureTeamMember,
} from "./fixtures/accounts";
import { readTable, writeRow } from "./mock-db";
import { getSession, setSession, type Session } from "./session";

/** Mock accounts table (R101: one phone and one e-mail each belong to one customer only). */
export type Account = Omit<FixtureAccount, "id"> & { id: string; google: boolean };

const TABLE = "fg.mock.accounts";

function allAccounts(): Account[] {
  // Rows written by the mock (new accounts, a phone added after Google) override fixtures by id.
  const saved = readTable<Account>(TABLE);
  const fixtures = FIXTURE_ACCOUNTS.map(
    (account) => saved[account.id] ?? { ...account, google: false },
  );
  const created = Object.values(saved).filter(
    (row) => !FIXTURE_ACCOUNTS.some((a) => a.id === row.id),
  );
  return [...fixtures, ...created];
}

export function findByPhone(phone: string): Account | null {
  const normalized = normalizePhone(phone);
  return normalized
    ? (allAccounts().find((account) => account.phone === normalized) ?? null)
    : null;
}

export function findByEmail(email: string): Account | null {
  const wanted = email.trim().toLowerCase();
  if (wanted === "") return null;
  return allAccounts().find((account) => account.email?.toLowerCase() === wanted) ?? null;
}

export function findById(id: string): Account | null {
  return allAccounts().find((account) => account.id === id) ?? null;
}

export type CreateResult =
  | { status: "created"; account: Account }
  | { status: "phoneTaken" }
  | { status: "emailTaken" }
  | { status: "invalidPhone" }
  /** attachPhone only: the account already has another phone. */
  | { status: "phoneMismatch" };

/**
 * Creates an account after its phone was verified. R101: refuses a phone or an e-mail that
 * already belongs to another account. Never stores a password (the mock cannot sign in with it).
 */
export function createAccount(input: {
  kind: "customer" | "merchant";
  name: string;
  phone: string;
  email?: string | null;
  google?: boolean;
}): CreateResult {
  const phone = normalizePhone(input.phone);
  if (!phone) return { status: "invalidPhone" };
  if (findByPhone(phone)) return { status: "phoneTaken" };
  const email = input.email?.trim() ? input.email.trim().toLowerCase() : null;
  if (email && findByEmail(email)) return { status: "emailTaken" };

  const account: Account = {
    id: `acc-${crypto.randomUUID()}`,
    kind: input.kind,
    name: input.name.trim(),
    phone,
    email,
    contract: input.kind === "merchant" ? "pending" : null,
    phoneVerified: true,
    google: input.google === true,
  };
  writeRow(TABLE, account.id, account);
  return { status: "created", account };
}

/** Light account from an order without an account (CMD-03). */
export function createLightAccount(input: { name: string; phone: string }): CreateResult {
  return createAccount({ kind: "customer", name: input.name, phone: input.phone });
}

/**
 * After the right order code (CMD-03). "accountExists" when the phone belongs to another account
 * (R101, said only now). Otherwise a guest gets the light account and is signed in; someone already
 * signed in keeps their session (a merchant ordering for another sender phone keeps R104).
 */
export function claimOrderPhone(input: { name: string; phone: string }): "ok" | "accountExists" {
  const session = getSession();
  const owner = findByPhone(input.phone);
  if (owner && owner.id !== session?.accountId) return "accountExists";
  if (!owner && !session) {
    const created = createLightAccount(input);
    if (created.status === "created") setSession(sessionFor(created.account));
  }
  return "ok";
}

/**
 * Google with a known e-mail (R103): adds a verified phone to an account that has none yet. An
 * account that already has a phone accepts only that same phone: never replaced from here.
 */
export function attachPhone(accountId: string, phone: string): CreateResult {
  const account = findById(accountId);
  const normalized = normalizePhone(phone);
  if (!account || !normalized) return { status: "invalidPhone" };
  if (account.phone && account.phone !== normalized) return { status: "phoneMismatch" };
  const owner = findByPhone(normalized);
  if (owner && owner.id !== account.id) return { status: "phoneTaken" };
  const updated: Account = { ...account, phone: normalized, phoneVerified: true };
  writeRow(TABLE, updated.id, updated);
  return { status: "created", account: updated };
}

export function sessionFor(account: Account): Session {
  return {
    accountId: account.id,
    userId: account.id,
    role: account.kind === "merchant" ? "admin" : null,
    kind: account.kind,
    contract: account.contract,
    phoneVerified: account.phoneVerified,
    maskedPhone: maskPhone(account.phone),
  };
}

export function findTeamMemberByPhone(phone: string): FixtureTeamMember | null {
  const normalized = normalizePhone(phone);
  return normalized
    ? (FIXTURE_TEAM_MEMBERS.find((member) => member.phone === normalized) ?? null)
    : null;
}

/** The session of a team member: the merchant account, with the member's user and role. */
export function sessionForMember(member: FixtureTeamMember): Session | null {
  const account = findById(member.accountId);
  if (!account) return null;
  return { ...sessionFor(account), userId: member.userId, role: member.role };
}

/**
 * True when the FULL phone of the draft is the verified phone of the signed-in account, read from
 * the accounts store as the real API will. Never compares masked numbers: two phones with the same
 * mask but different hidden digits do not match.
 */
export function isVerifiedPhoneForSession(phone: string): boolean {
  const session = getSession();
  if (!session) return false;
  const account = findById(session.accountId);
  const normalized = normalizePhone(phone);
  return (
    account != null && normalized != null && account.phoneVerified && account.phone === normalized
  );
}

/** R605: what the account owes for returned parcels, in millimes (0 when nothing is due). */
export function returnBalanceMillimes(accountId: string | null): number {
  return (accountId && findById(accountId)?.returnBalanceMillimes) || 0;
}
