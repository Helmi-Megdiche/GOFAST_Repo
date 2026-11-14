import { now } from "../order/clock";
import { GOOGLE_PENDING_MAX_AGE_MS, maskEmail } from "@fastgo/domain";
import { readJson, removeKey, writeJson } from "../storage";
import { findByEmail } from "./accounts";
import { mockDelay } from "./delay";
import { FIXTURE_GOOGLE_PROFILES, type GoogleProfileId } from "./fixtures/accounts";
import { GOOGLE_PENDING_KEY as PENDING_KEY } from "./session";

/**
 * Mock of Google sign-in (ESP-09, R103). The button opens a mock account chooser; a real Google
 * flow replaces this later. Customers and merchants only.
 */
export type GoogleResult =
  | { status: "newUser"; name: string; maskedEmail: string }
  | { status: "knownEmail"; name: string; maskedEmail: string };

type Pending = {
  profileId: GoogleProfileId;
  kind: "customer" | "merchant";
  emailVerified: boolean;
  /** When the account was chosen (ms, UTC). Forgotten after GOOGLE_PENDING_MAX_AGE_MS. */
  startedAt: number;
};

export function googleProfiles() {
  return FIXTURE_GOOGLE_PROFILES.map((profile) => ({
    id: profile.id,
    name: profile.name,
    email: profile.email,
  }));
}

export async function googleSignIn(
  profileId: GoogleProfileId,
  kind: "customer" | "merchant" = "customer",
): Promise<GoogleResult> {
  await mockDelay();
  const profile =
    FIXTURE_GOOGLE_PROFILES.find((p) => p.id === profileId) ?? FIXTURE_GOOGLE_PROFILES[0];
  writeJson(PENDING_KEY, {
    profileId: profile.id,
    kind,
    emailVerified: false,
    startedAt: now(),
  } satisfies Pending);
  const known = findByEmail(profile.email) != null;
  return {
    status: known ? "knownEmail" : "newUser",
    name: profile.name,
    maskedEmail: maskEmail(profile.email),
  };
}

/** The Google sign-in in progress (W22 and the e-mail code step), or null. */
export function pendingGoogle():
  (Pending & { name: string; email: string; known: boolean }) | null {
  const value = readJson(PENDING_KEY) as Partial<Pending> | null;
  const profile = FIXTURE_GOOGLE_PROFILES.find((p) => p.id === value?.profileId);
  if (!value || !profile) return null;
  const startedAt = value.startedAt;
  if (typeof startedAt !== "number" || now() - startedAt >= GOOGLE_PENDING_MAX_AGE_MS) {
    removeKey(PENDING_KEY);
    return null;
  }
  return {
    profileId: profile.id,
    kind: value.kind === "merchant" ? "merchant" : "customer",
    emailVerified: value.emailVerified === true,
    startedAt,
    name: profile.name,
    email: profile.email,
    known: findByEmail(profile.email) != null,
  };
}

export function markGoogleEmailVerified(): void {
  const pending = pendingGoogle();
  if (pending)
    writeJson(PENDING_KEY, {
      profileId: pending.profileId,
      kind: pending.kind,
      emailVerified: true,
      startedAt: pending.startedAt,
    } satisfies Pending);
}

export function clearPendingGoogle(): void {
  removeKey(PENDING_KEY);
}
