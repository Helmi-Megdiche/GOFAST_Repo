import { DEFAULT_AFTER_SIGN_IN, safeNext } from "./safe-next";

/** Link to an auth page that keeps a safe ?next= (W18, W19, W20, W22). Never keeps an unsafe one. */
export function withNext(
  pathname: string,
  next: string | null,
): string | { pathname: string; query: { next: string } } {
  const safe = safeNext(next);
  return next && safe !== DEFAULT_AFTER_SIGN_IN ? { pathname, query: { next: safe } } : pathname;
}
