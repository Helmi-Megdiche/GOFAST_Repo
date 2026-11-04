import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { messages } from "@fastgo/i18n";
import { DISPLAY_TIME_ZONE } from "@fastgo/i18n";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: messages[locale],
    timeZone: DISPLAY_TIME_ZONE,
  };
});
