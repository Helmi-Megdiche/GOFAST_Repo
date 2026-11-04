import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "@fastgo/i18n";

export const routing = defineRouting({
  locales,
  defaultLocale,
  // /fr, /ar, /en always carry the prefix; "/" is redirected by src/proxy.ts.
  localePrefix: "always",
  // The URL decides the language, not the browser's Accept-Language header.
  // The NEXT_LOCALE cookie is still written, and proxy.ts reads it for "/".
  localeDetection: false,
});
