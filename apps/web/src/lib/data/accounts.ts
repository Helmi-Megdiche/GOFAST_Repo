import { maskPhone, normalizePhone } from "../phone";
import { FIXTURE_ACCOUNTS, type FixtureAccount } from "./fixtures/accounts";
import { readTable, writeRow } from "./mock-db";
import { getSession, type Session } from "./session";

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
  | { status: "invalidPhone" };

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

/** Adds a verified phone to an account that has none yet (Google, known e-mail, R103). */
export function attachPhone(accountId: string, phone: string): CreateResult {
  const account = findById(accountId);
  const normalized = normalizePhone(phone);
  if (!account || !normalized) return { status: "invalidPhone" };
  const owner = findByPhone(normalized);
  if (owner && owner.id !== account.id) return { status: "phoneTaken" };
  const updated: Account = { ...account, phone: normalized, phoneVerified: true };
  writeRow(TABLE, updated.id, updated);
  return { status: "created", account: updated };
}

export function sessionFor(account: Account): Session {
  return {
    accountId: account.id,
    kind: account.kind,
    contract: account.contract,
    phoneVerified: account.phoneVerified,
    maskedPhone: maskPhone(account.phone),
  };
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
