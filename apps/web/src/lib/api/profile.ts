import type { Locale } from "@fastgo/i18n";
import type { components } from "@fastgo/contract";
import { getSession } from "../data/session";
import type { PortProfile, ProfilePort, ProfileWrite } from "../data/ports";
import type { createApiClient } from "./client";
import { AuthRequiredError, ServerError, asErrorBody, traceIdOf } from "./errors";

type Client = ReturnType<typeof createApiClient>;
type Me = components["schemas"]["Me"];
type MeChange = components["schemas"]["MeChange"];

const profileOf = (me: Me): PortProfile => ({
  name: me.name,
  phone: me.phone,
  email: me.email,
  google: me.google,
  locale: me.locale as Locale,
  notifications: me.notifications,
  phoneVerified: me.phone_verified,
});

/** 401: the session is gone. Every other refusal has no message of its own; only the trace id is kept. */
function fail(status: number, error: unknown): never {
  if (status === 401) throw new AuthRequiredError();
  throw new ServerError(traceIdOf(error));
}

async function patch(client: Client, body: MeChange) {
  return client.PATCH("/v1/me", { body });
}

/** 200 is ok, 403 (a staff role) is forbidden; 401 and the rest throw. */
async function write(client: Client, body: MeChange): Promise<ProfileWrite> {
  const { error, response } = await patch(client, body);
  if (response.ok) return { status: "ok" };
  if (response.status === 403) return { status: "forbidden" };
  return fail(response.status, error);
}

export function createApiProfile(client: Client): ProfilePort {
  return {
    kind: "api",
    // No API route yet, or no web adapter yet: hidden, with a notice (the `account` switch plan).
    emailAvailable: false,
    googleAvailable: false,
    closeAvailable: false,
    addressBookAvailable: false,
    invoicesAvailable: false,
    claimsAvailable: false,
    homeAvailable: false,

    async get() {
      const { data, error, response } = await client.GET("/v1/me");
      if (!response.ok || !data) fail(response.status, error);
      return profileOf(data);
    },

    async updateName(_session, name) {
      const trimmed = name.trim();
      if (!trimmed) return { status: "invalidName" };
      const { error, response } = await patch(client, { name: trimmed });
      if (response.ok) return { status: "ok" };
      if (response.status === 403) return { status: "forbidden" };
      if (response.status === 400) {
        const fields = asErrorBody(error)?.error.fields ?? [];
        if (fields.some((f) => f.name === "name")) return { status: "invalidName" };
      }
      return fail(response.status, error);
    },

    setNotifications: (_session, prefs) =>
      write(client, {
        notifications: { sms: prefs.sms, email: prefs.email, offers: prefs.offers },
      }),

    // R902 / RV-17: the body is {locale} alone, so the name and the toggles are never rewritten.
    setLocale: (_session, locale) => write(client, { locale }),

    async saveLocaleIfSignedIn(locale) {
      if (!getSession()) return;
      try {
        await write(client, { locale });
      } catch {
        // Silent: the page has already changed language.
      }
    },
  };
}
