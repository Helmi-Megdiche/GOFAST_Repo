/**
 * Which data domains talk to the API (#20). One adapter per domain; a domain is on the API only when
 * it is listed in NEXT_PUBLIC_API_DOMAINS. Empty or unset means everything stays on the mock.
 */
export const API_DOMAINS = ["auth", "orders", "pricing", "account"] as const;
export type ApiDomain = (typeof API_DOMAINS)[number];

/** Parses the list. An unknown name throws: a typo must not silently leave a domain on the mock. */
export function apiDomains(raw: string | undefined): ApiDomain[] {
  const names = (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const known: readonly string[] = API_DOMAINS;
  const unknown = names.filter((name) => !known.includes(name));
  if (unknown.length > 0) {
    throw new Error(`NEXT_PUBLIC_API_DOMAINS: unknown domain ${unknown.join(", ")}`);
  }
  return [...new Set(names)] as ApiDomain[];
}

/** `raw` defaults to the build-time flag. Next inlines the literal `process.env.NEXT_PUBLIC_*` access. */
export function usesApi(domain: ApiDomain, raw: string | undefined = process.env.NEXT_PUBLIC_API_DOMAINS): boolean {
  return apiDomains(raw).includes(domain);
}
