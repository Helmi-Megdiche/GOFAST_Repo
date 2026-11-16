import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { isLocale } from "@fastgo/i18n";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

/** next-intl's own cookie name. Written when a visitor opens a /fr, /ar or /en page. */
const LOCALE_COOKIE = "NEXT_LOCALE";

export function proxy(request: NextRequest) {
  // "/" goes to the language the visitor chose last (cookie), otherwise to /fr.
  // The browser's Accept-Language header is deliberately ignored.
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
