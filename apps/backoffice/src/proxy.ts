import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { isLocale } from "@fastgo/i18n";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

/** next-intl's own cookie name. Written when a visitor opens a /fr, /ar or /en page. */
const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * The language only. The session is decided in the browser (the e2e fakes /v1 and the API is the authority), so nothing here calls the API.
 * "/" goes to the language chosen last (cookie), otherwise to /fr; the page of that language then goes to the landing page of the role.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const saved = request.cookies.get(LOCALE_COOKIE)?.value;
    if (isLocale(saved)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${saved}`;
      return NextResponse.redirect(url);
    }
  }
  return handleI18nRouting(request);
}

export const config = {
  // Everything except API routes, Next internals and files with an extension (logos, icons).
  matcher: ["/((?!api|trpc|_next|_vercel|v1/|brand|.*\\..*).*)"],
};
