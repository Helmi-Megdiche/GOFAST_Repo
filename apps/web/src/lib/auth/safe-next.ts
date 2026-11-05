import { locales } from "@fastgo/i18n";

/** Where to go after sign-in when ?next= is missing or refused (decision 17). */
export const DEFAULT_AFTER_SIGN_IN = "/compte";

// Placeholder origin: only used to check that a path stays on this site.
const SELF = "https://fastgo.invalid";

/**
 * Returns ?next= only if it is a path on this site, without the locale prefix (the i18n router adds
 * it back). Refuses absolute URLs, "//host", backslashes, control characters and schemes. The check
 * runs again on the final path (after dot segments and the locale are removed): "/fr//host" or
 * "/..//host" would otherwise come out as "//host", which a browser reads as another site.
 */
export function safeNext(value: string | null | undefined): string {
  if (typeof value !== "string" || value === "") return DEFAULT_AFTER_SIGN_IN;
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_AFTER_SIGN_IN;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return DEFAULT_AFTER_SIGN_IN;

  let url: URL;
  try {
    url = new URL(value, SELF);
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
  if (url.origin !== SELF) return DEFAULT_AFTER_SIGN_IN;

  const [, first, ...rest] = url.pathname.split("/");
  const path = (locales as readonly string[]).includes(first ?? "")
    ? `/${rest.join("/")}`
    : url.pathname;
  const result = `${path}${url.search}${url.hash}`;
  if (!result.startsWith("/") || result.startsWith("//")) return DEFAULT_AFTER_SIGN_IN;
  try {
    if (new URL(result, SELF).origin !== SELF) return DEFAULT_AFTER_SIGN_IN;
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
  return result;
}
