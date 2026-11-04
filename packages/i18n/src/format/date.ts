import type { Locale } from "../locales";

/** Time is stored in UTC and shown in Africa/Tunis (CLAUDE.md). */
export const DISPLAY_TIME_ZONE = "Africa/Tunis";

// Tunisian conventions. Arabic uses Latin digits and the Gregorian calendar.
const INTL_LOCALE: Record<Locale, string> = {
  fr: "fr-TN",
  en: "en-GB",
  ar: "ar-TN-u-ca-gregory-nu-latn",
};

/** Non-breaking space: "14 h 20" never wraps inside the time. */
const NBSP = "\u00a0";

export type DateStyle = "date" | "time" | "dateTime";

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "long", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  dateTime: {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
};

/** Format a UTC instant (Date, ISO string or epoch ms) in Africa/Tunis. */
export function formatDate(
  value: Date | string | number,
  locale: Locale,
  style: DateStyle = "date",
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${String(value)}`);
  }
  const text = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    ...OPTIONS[style],
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
  // French writes the time "14 h 20" (mockup). en and ar keep "14:20".
  return locale === "fr" ? text.replace(/(\d{2}):(\d{2})/, `$1${NBSP}h${NBSP}$2`) : text;
}
