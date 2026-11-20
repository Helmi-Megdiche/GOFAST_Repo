import { CODE_RESEND_DELAY_MS, maskPhone, normalizePhone } from "@fastgo/domain";
import type { components } from "@fastgo/contract";
import type { Locale } from "@fastgo/i18n";
import type {
  AuthPort,
  AuthPurpose,
  AuthSendResult,
  AuthVerifyResult,
  ResetResult,
  SignInResult,
  SignUpResult,
} from "../data/ports";
import { clearSessionCopy, getSession, setSession, signOut, type Session } from "../data/session";
import type { createApiClient } from "./client";
import { NetworkError, asErrorBody } from "./errors";

type Me = components["schemas"]["Me"];
type Client = ReturnType<typeof createApiClient>;

/** Me to the display copy. A staff account is not a customer or merchant session: null. */
function toSession(me: Me): Session | null {
  if (me.kind !== "customer" && me.kind !== "merchant") return null;
  return {
    accountId: me.account_id,
    userId: me.user_id,
    role: me.kind === "merchant" && (me.role === "admin" || me.role === "user") ? me.role : null,
    kind: me.kind,
    contract: me.contract === "validated" || me.contract === "pending" ? me.contract : null,
    phoneVerified: me.phone_verified,
    maskedPhone: me.phone ? maskPhone(me.phone) : "",
  };
}

/** The first field error of an answer: the reason the client maps to its own text. */
function firstField(value: unknown) {
  return asErrorBody(value)?.error.fields?.[0] ?? null;
}

/**
 * The api adapter of the auth domain. The cookie is the authority; the localStorage copy is only
 * for display and is kept in step from Me. Instance state: the proofs of resets that ended
 * "unavailable" (Change A), so use one instance per page load (see authPort).
 */
export function createApiAuth(client: Client, options: { now?: () => number } = {}): AuthPort {
  const now = options.now ?? Date.now;
  const unavailable = { status: "unavailable" } as const;
  const maybeDone = new Set<string>();

  /** 429: one wait. Retry-After in seconds; missing or unreadable gives the resend delay (RV-07). */
  const wait = (response: Response) => {
    const seconds = Number(response.headers.get("retry-after"));
    const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : CODE_RESEND_DELAY_MS;
    return { status: "wait", retryAt: new Date(now() + ms).toISOString() } as const;
  };

  /** A cut or a timeout is "unavailable", never a result. */
  const guard = async <T>(run: () => Promise<T>): Promise<T | typeof unavailable> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof NetworkError) return unavailable;
      throw error;
    }
  };

  const refreshSession = async (): Promise<Session | null> => {
    try {
      const { data, response } = await client.GET("/v1/me");
      if (response.status === 200 && data) {
        const session = toSession(data);
        if (!session) {
          clearSessionCopy();
          return null;
        }
        setSession(session);
        return session;
      }
      if (response.status === 401) return null; // the client already dropped the copy
      return getSession();
    } catch (error) {
      if (error instanceof NetworkError) return getSession();
      throw error;
    }
  };

  /** GET /v1/me, no fallback to the copy. A session only when the cookie belongs to this phone. */
  const confirmCreated = async (phone: string): Promise<SignUpResult | null> => {
    try {
      const { data, response } = await client.GET("/v1/me");
      if (response.status !== 200 || !data || data.phone !== phone) return null;
      const session = toSession(data);
      if (!session) return null;
      setSession(session);
      return { status: "created", session };
    } catch (error) {
      if (error instanceof NetworkError) return null;
      throw error;
    }
  };

  return {
    kind: "api",
    googleAvailable: false,
    rememberMe: false,

    signIn: (identifier, password): Promise<SignInResult> =>
      guard(async () => {
        const { data, response } = await client.POST("/v1/sessions", {
          body: { identifier, password },
        });
        if (response.status === 201 && data) {
          const session = toSession(data);
          if (!session) {
            // A staff cookie must not stay in this browser.
            await client.DELETE("/v1/sessions").catch(() => undefined);
            clearSessionCopy();
            return { status: "invalidCredentials" } as const;
          }
          setSession(session);
          return { status: "ok", session, locale: data.locale as Locale } as const;
        }
        if (response.status === 401) return { status: "invalidCredentials" } as const;
        if (response.status === 429) return wait(response);
        return unavailable;
      }),

    sendCode: (phone, purpose: AuthPurpose): Promise<AuthSendResult> =>
      guard(async () => {
        const normalized = normalizePhone(phone);
        if (!normalized) return { status: "invalidTarget" } as const;
        const { data, response } = await client.POST("/v1/phone-checks", {
          body: { phone: normalized, purpose },
        });
        if (response.status === 202 && data) {
          return { status: "sent", expiresAt: data.expires_at, resendAt: data.resend_at } as const;
        }
        if (response.status === 400) return { status: "invalidTarget" } as const;
        if (response.status === 429) return wait(response);
        return unavailable;
      }),

    verifyCode: (phone, purpose, code): Promise<AuthVerifyResult> =>
      guard(async () => {
        const normalized = normalizePhone(phone);
        if (!normalized) return { status: "noCode" } as const;
        const { data, error, response } = await client.POST("/v1/phone-checks/verify", {
          body: { phone: normalized, purpose, code },
        });
        if (response.status === 200 && data) {
          return { status: "ok", checkId: data.phone_check_id } as const;
        }
        if (response.status === 429) {
          const { retryAt } = wait(response);
          return { status: "locked", retryAt } as const;
        }
        if (response.status === 422) {
          const field = firstField(error);
          if (field?.reason === "wrong") {
            return { status: "wrong", attemptsLeft: field.details?.attempts_left ?? 0 } as const;
          }
          if (field?.reason === "expired") return { status: "expired" } as const;
          if (field?.reason === "noCode") return { status: "noCode" } as const;
        }
        return unavailable;
      }),

    signUp: async (input, checkId): Promise<SignUpResult> => {
      const phone = normalizePhone(input.phone);
      if (!checkId || !phone) return { status: "notVerified" };
      try {
        const { data, error, response } = await client.POST("/v1/accounts", {
          body: {
            kind: input.kind,
            name: input.name,
            phone,
            phone_check_id: checkId,
            // Always null: the e-mail is confirmed later, so "taken" never tells who has an account.
            email: null,
            password: input.password,
            locale: input.locale,
            terms_accepted: true,
          },
        });
        if (response.status === 201 && data) {
          const session = toSession(data);
          if (!session) return unavailable;
          setSession(session);
          return { status: "created", session };
        }
        if (response.status === 429) return wait(response);
        // 400 and 403: the proof or the form is refused. Back to the form, so a retry cannot loop.
        if (response.status === 400 || response.status === 403) return { status: "notVerified" };
        if (response.status === 422) {
          const field = firstField(error);
          if (field?.reason === "phoneTaken") return { status: "phoneTaken" };
          if (field?.reason === "passwordTooShort") return { status: "tooShort" };
          return { status: "notVerified" };
        }
        return unavailable;
      } catch (error) {
        if (!(error instanceof NetworkError)) throw error;
        // Change A: the answer may have been lost after the account was created. Only the server
        // decides: the local copy is not evidence. Created needs a 200 for this very phone.
        return (await confirmCreated(phone)) ?? unavailable;
      }
    },

    resetPassword: async (phone, checkId, password): Promise<ResetResult> => {
      const normalized = normalizePhone(phone);
      if (!checkId || !normalized) return { status: "notVerified" };
      try {
        const { error, response } = await client.POST("/v1/password-resets", {
          body: { phone: normalized, phone_check_id: checkId, new_password: password },
        });
        if (response.status === 204) return { status: "ok" };
        if (response.status === 429) return wait(response);
        if (response.status === 422) {
          if (firstField(error)?.reason === "passwordTooShort") return { status: "tooShort" };
          // The proof is used once: after an unavailable, this refusal may mean the first call worked.
          return maybeDone.has(checkId) ? { status: "maybeChanged" } : { status: "notVerified" };
        }
        maybeDone.add(checkId);
        return unavailable;
      } catch (error) {
        if (!(error instanceof NetworkError)) throw error;
        maybeDone.add(checkId);
        return unavailable;
      }
    },

    refreshSession,

    async signOut() {
      try {
        await client.DELETE("/v1/sessions");
      } catch {
        // The copy goes anyway: a failed DELETE must not leave a "signed in" page.
      } finally {
        signOut();
        clearSessionCopy();
      }
    },
  };
}
