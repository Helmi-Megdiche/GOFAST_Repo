/** Supported locales. French is the default; Arabic is right-to-left. */
export const locales = ["fr", "ar", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fr";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar"]);

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return isRtl(locale) ? "rtl" : "ltr";
}

/** Language names in their own language, as in the mockup switcher: FR, EN, عربي. */
export const localeLabels: Record<Locale, string> = {
  fr: "FR",
  en: "EN",
  ar: "عربي",
};

/** Display order of the language switcher. */
export const switcherOrder: readonly Locale[] = ["fr", "en", "ar"];
