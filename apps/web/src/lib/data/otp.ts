import { now } from "../order/clock";
import {
  CODE_LENGTH,
  CODE_LOCK_MS,
  CODE_MAX_ATTEMPTS,
  CODE_MAX_SENDS,
  CODE_RESEND_DELAY_MS,
  CODE_SEND_WINDOW_MS,
  CODE_VALIDITY_MS,
} from "../order/constants";
import { toLatinDigits } from "../digits";
import { normalizePhone } from "../phone";
import { mockDelay } from "./delay";
import { FIXTURE_CODES } from "./fixtures/accounts";
import { readTable, writeRow } from "./mock-db";

/** Mock of POST /v1/codes and POST /v1/codes/verify (R102, ESP-01, CMD-03). */
export type CodeTarget = { channel: "sms" | "email"; value: string };
export type CodePurpose = "order" | "signUp" | "reset" | "googlePhone" | "googleEmail";

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

// What the mock server remembers per target. No code is stored: the n-th code sent is
// FIXTURE_CODES[n % 3], so the state survives a reload without keeping the code.
type CodeState = {
  sendCount: number;
  sends: number[];
  purpose: CodePurpose;
  issuedAt: number;
  expiresAt: number;
  wrong: number[];
  lockedUntil: number | null;
  verifiedAt: number | null;
  verifiedPurpose: CodePurpose | null;
  /** Set when the code was used once (account or order created), so it cannot be replayed. */
  consumedAt: number | null;
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

/** The code the mock sent last to this target. Tests and the mock only, never the UI. */
export function mockCodeFor(target: CodeTarget): string | null {
  const id = targetId(target);
  const state = id ? readTable<CodeState>(TABLE)[id] : undefined;
  return state ? (FIXTURE_CODES[(state.sendCount - 1) % FIXTURE_CODES.length] ?? null) : null;
}

/**
 * Sends a code. The answer is the same whether or not an account exists for this phone or e-mail
 * (no account enumeration): limits apply identically to every valid target.
 */
export async function sendCode(target: CodeTarget, purpose: CodePurpose): Promise<SendResult> {
  await mockDelay();
  const id = targetId(target);
  if (!id) return { status: "invalidTarget" };
  const at = now();
  const previous = readTable<CodeState>(TABLE)[id];

  if (previous?.lockedUntil != null && at < previous.lockedUntil) {
    return { status: "tooMany", retryAt: iso(previous.lockedUntil) };
  }
  if (previous && at < previous.issuedAt + CODE_RESEND_DELAY_MS) {
    return { status: "tooSoon", resendAt: iso(previous.issuedAt + CODE_RESEND_DELAY_MS) };
  }
  const recentSends = (previous?.sends ?? []).filter((t) => at - t < CODE_SEND_WINDOW_MS);
  if (recentSends.length >= CODE_MAX_SENDS) {
    const retryAt = (recentSends[0] ?? at) + CODE_SEND_WINDOW_MS;
    return { status: "tooMany", retryAt: iso(retryAt) };
  }

  const state: CodeState = {
    sendCount: (previous?.sendCount ?? 0) + 1,
    sends: [...recentSends, at],
    purpose,
    issuedAt: at,
    expiresAt: at + CODE_VALIDITY_MS,
    // A resend does not reset the wrong attempts or the lock (R102).
    wrong: (previous?.wrong ?? []).filter((t) => at - t < CODE_LOCK_MS),
    lockedUntil:
      previous?.lockedUntil != null && at < previous.lockedUntil ? previous.lockedUntil : null,
    verifiedAt: null,
    verifiedPurpose: null,
    consumedAt: null,
  };
  writeRow(TABLE, id, state);
  return {
    status: "sent",
    expiresAt: iso(state.expiresAt),
    resendAt: iso(at + CODE_RESEND_DELAY_MS),
  };
}

export async function verifyCode(target: CodeTarget, code: string): Promise<VerifyResult> {
  await mockDelay();
  const id = targetId(target);
  const state = id ? readTable<CodeState>(TABLE)[id] : undefined;
  if (!id || !state) return { status: "noCode" };
  const at = now();

  if (state.lockedUntil != null && at < state.lockedUntil) {
    return { status: "locked", retryAt: iso(state.lockedUntil) };
  }
  const expected = FIXTURE_CODES[(state.sendCount - 1) % FIXTURE_CODES.length];
  const typed = toLatinDigits(code).replace(/\s/g, "");

  if (typed.length === CODE_LENGTH && typed === expected && state.verifiedAt == null) {
    if (at >= state.expiresAt) return { status: "expired" };
    writeRow<CodeState>(TABLE, id, {
      ...state,
      verifiedAt: at,
      verifiedPurpose: state.purpose,
      wrong: [],
    });
    return { status: "ok" };
  }

  const wrong = [...state.wrong.filter((t) => at - t < CODE_LOCK_MS), at];
  const locked = wrong.length >= CODE_MAX_ATTEMPTS;
  writeRow<CodeState>(TABLE, id, {
    ...state,
    wrong,
    lockedUntil: locked ? at + CODE_LOCK_MS : null,
  });
  if (locked) return { status: "locked", retryAt: iso(at + CODE_LOCK_MS) };
  return { status: "wrong", attemptsLeft: CODE_MAX_ATTEMPTS - wrong.length };
}

/** True when the latest code sent to this target was verified for this purpose and not yet used. */
export function isTargetVerified(target: CodeTarget, purpose: CodePurpose): boolean {
  const id = targetId(target);
  const state = id ? readTable<CodeState>(TABLE)[id] : undefined;
  return state?.verifiedAt != null && state.verifiedPurpose === purpose && state.consumedAt == null;
}

/** Marks a verified code as used (after the account or the order was created). */
export function consumeVerification(target: CodeTarget): void {
  const id = targetId(target);
  const state = id ? readTable<CodeState>(TABLE)[id] : undefined;
  if (id && state) writeRow<CodeState>(TABLE, id, { ...state, consumedAt: now() });
}
