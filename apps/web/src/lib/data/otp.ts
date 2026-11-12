import { now } from "../order/clock";
import {
  CODE_LENGTH,
  CODE_LOCK_MS,
  CODE_MAX_ATTEMPTS,
  CODE_MAX_SENDS,
  CODE_RESEND_DELAY_MS,
  CODE_SEND_WINDOW_MS,
  CODE_VALIDITY_MS,
  CODE_VERIFIED_WINDOW_MS,
} from "../order/constants";
import { toLatinDigits } from "../digits";
import { normalizePhone } from "../phone";
import { mockDelay } from "./delay";
import { FIXTURE_CODES } from "./fixtures/accounts";
import { readTable, writeRow } from "./mock-db";

/** Mock of POST /v1/codes and POST /v1/codes/verify (R102, ESP-01, CMD-03). */
export type CodeTarget = { channel: "sms" | "email"; value: string };
export type CodePurpose =
  "order" | "signUp" | "reset" | "googlePhone" | "googleEmail" | "emailConfirm";

export type SendResult =
  | { status: "sent"; expiresAt: string; resendAt: string }
  | { status: "tooSoon"; resendAt: string }
  | { status: "tooMany"; retryAt: string }
  | { status: "invalidTarget" };

export type VerifyResult =
  | { status: "ok" }
  | { status: "wrong"; attemptsLeft: number }
  | { status: "expired" }
  | { status: "locked"; retryAt: string }
  | { status: "noCode" };

// What the mock server remembers per target. No code is stored: the n-th code sent to a target is
// FIXTURE_CODES[n % 3], so the state survives a reload without keeping the code.
// The send limit, the wrong attempts and the lock count every purpose of the target together (R102);
// each purpose has its own code, resend timer and verification (PR #5 review): a reset asked right
// after a sign-up code gets a reset code, instead of "tooSoon" and a code verified for the sign-up.
type CodeEntry = {
  /** Which send of the target this code is (1 = the first): picks the fixture code. */
  index: number;
  issuedAt: number;
  expiresAt: number;
  verifiedAt: number | null;
  /** Set when the code was used once (account or order created), so it cannot be replayed. */
  consumedAt: number | null;
};
type TargetState = {
  sendCount: number;
  sends: number[];
  wrong: number[];
  lockedUntil: number | null;
  codes: Partial<Record<CodePurpose, CodeEntry>>;
};

const TABLE = "fg.mock.codes";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function targetId(target: CodeTarget): string | null {
  if (target.channel === "sms") {
    const phone = normalizePhone(target.value);
    return phone ? `sms:${phone}` : null;
  }
  const email = target.value.trim().toLowerCase();
  return EMAIL.test(email) ? `email:${email}` : null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const fixtureCode = (index: number) => FIXTURE_CODES[(index - 1) % FIXTURE_CODES.length] ?? null;

function readState(target: CodeTarget): { id: string; state: TargetState | undefined } | null {
  const id = targetId(target);
  if (!id) return null;
  const row = readTable<Partial<TargetState>>(TABLE)[id];
  const state: TargetState | undefined = row
    ? {
        sendCount: row.sendCount ?? 0,
        sends: row.sends ?? [],
        wrong: row.wrong ?? [],
        lockedUntil: row.lockedUntil ?? null,
        codes: row.codes ?? {},
      }
    : undefined;
  return { id, state };
}

/** True while a verified code may still be used for its step (CODE_VERIFIED_WINDOW_MS). */
function stillVerified(entry: CodeEntry | undefined, at: number): boolean {
  return (
    entry?.verifiedAt != null &&
    entry.consumedAt == null &&
    at < entry.verifiedAt + CODE_VERIFIED_WINDOW_MS
  );
}

/** The code the mock sent last to this target (for this purpose). Tests and the mock only, never the UI. */
export function mockCodeFor(target: CodeTarget, purpose?: CodePurpose): string | null {
  const state = readState(target)?.state;
  if (!state) return null;
  if (purpose) {
    const entry = state.codes[purpose];
    return entry ? fixtureCode(entry.index) : null;
  }
  return state.sendCount > 0 ? fixtureCode(state.sendCount) : null;
}

/**
 * Sends a code. The answer is the same whether or not an account exists for this phone or e-mail
 * (no account enumeration): limits apply identically to every valid target.
 */
export async function sendCode(target: CodeTarget, purpose: CodePurpose): Promise<SendResult> {
  await mockDelay();
  const found = readState(target);
  if (!found) return { status: "invalidTarget" };
  const { id, state: previous } = found;
  const at = now();

  if (previous?.lockedUntil != null && at < previous.lockedUntil) {
    return { status: "tooMany", retryAt: iso(previous.lockedUntil) };
  }
  const current = previous?.codes[purpose];
  if (current && at < current.issuedAt + CODE_RESEND_DELAY_MS) {
    return { status: "tooSoon", resendAt: iso(current.issuedAt + CODE_RESEND_DELAY_MS) };
  }
  const recentSends = (previous?.sends ?? []).filter((t) => at - t < CODE_SEND_WINDOW_MS);
  if (recentSends.length >= CODE_MAX_SENDS) {
    const retryAt = (recentSends[0] ?? at) + CODE_SEND_WINDOW_MS;
    return { status: "tooMany", retryAt: iso(retryAt) };
  }

  const sendCount = (previous?.sendCount ?? 0) + 1;
  const state: TargetState = {
    sendCount,
    sends: [...recentSends, at],
    // A resend does not reset the wrong attempts or the lock (R102).
    wrong: (previous?.wrong ?? []).filter((t) => at - t < CODE_LOCK_MS),
    lockedUntil:
      previous?.lockedUntil != null && at < previous.lockedUntil ? previous.lockedUntil : null,
    codes: {
      ...previous?.codes,
      // A new code for this purpose replaces its previous one.
      [purpose]: {
        index: sendCount,
        issuedAt: at,
        expiresAt: at + CODE_VALIDITY_MS,
        verifiedAt: null,
        consumedAt: null,
      },
    },
  };
  writeRow(TABLE, id, state);
  return {
    status: "sent",
    expiresAt: iso(at + CODE_VALIDITY_MS),
    resendAt: iso(at + CODE_RESEND_DELAY_MS),
  };
}

export async function verifyCode(
  target: CodeTarget,
  code: string,
  purpose: CodePurpose,
): Promise<VerifyResult> {
  await mockDelay();
  const found = readState(target);
  const state = found?.state;
  const entry = state?.codes[purpose];
  if (!found || !state || !entry) return { status: "noCode" };
  const at = now();

  if (state.lockedUntil != null && at < state.lockedUntil) {
    return { status: "locked", retryAt: iso(state.lockedUntil) };
  }
  const typed = toLatinDigits(code).replace(/\s/g, "");

  if (typed.length === CODE_LENGTH && typed === fixtureCode(entry.index)) {
    // Typed again (double submit, second tab, back button): same answer, no attempt used.
    if (entry.verifiedAt != null) {
      return stillVerified(entry, at) ? { status: "ok" } : { status: "expired" };
    }
    if (at >= entry.expiresAt) return { status: "expired" };
    writeRow<TargetState>(TABLE, found.id, {
      ...state,
      wrong: [],
      codes: { ...state.codes, [purpose]: { ...entry, verifiedAt: at } },
    });
    return { status: "ok" };
  }

  const wrong = [...state.wrong.filter((t) => at - t < CODE_LOCK_MS), at];
  const locked = wrong.length >= CODE_MAX_ATTEMPTS;
  writeRow<TargetState>(TABLE, found.id, {
    ...state,
    wrong,
    lockedUntil: locked ? at + CODE_LOCK_MS : null,
  });
  if (locked) return { status: "locked", retryAt: iso(at + CODE_LOCK_MS) };
  return { status: "wrong", attemptsLeft: CODE_MAX_ATTEMPTS - wrong.length };
}

/**
 * True when the latest code sent to this target for this purpose was verified, is not used yet, and
 * was verified less than CODE_VERIFIED_WINDOW_MS ago.
 */
export function isTargetVerified(target: CodeTarget, purpose: CodePurpose): boolean {
  return stillVerified(readState(target)?.state?.codes[purpose], now());
}

/**
 * Marks a verified code as used (after the account or the order was created). Without a purpose,
 * every verified code of the target is used.
 */
export function consumeVerification(target: CodeTarget, purpose?: CodePurpose): void {
  const found = readState(target);
  const state = found?.state;
  if (!found || !state) return;
  const at = now();
  const codes = { ...state.codes };
  for (const key of Object.keys(codes) as CodePurpose[]) {
    const entry = codes[key];
    if (entry && entry.verifiedAt != null && (purpose == null || key === purpose)) {
      codes[key] = { ...entry, consumedAt: at };
    }
  }
  writeRow<TargetState>(TABLE, found.id, { ...state, codes });
}
