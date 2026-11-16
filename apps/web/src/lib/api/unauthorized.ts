import { safeNext } from "@fastgo/domain";

/** Sign-in URL after a 401. `?next=` only ever holds a path on this site (no open redirect). */
export function signInUrl(locale: string, currentPath: string): string {
  return `/${locale}/connexion?next=${encodeURIComponent(safeNext(currentPath))}`;
}
