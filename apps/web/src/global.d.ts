import type { Locale, Messages } from "@fastgo/i18n";

// Typed message keys and locale: t("devUi.title") is checked at compile time.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
