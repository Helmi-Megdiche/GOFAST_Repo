import fr from "./messages/fr.json";
import en from "./messages/en.json";
import ar from "./messages/ar.json";
import type { Locale } from "./locales";

export {
  defaultLocale,
  isLocale,
  isRtl,
  localeDir,
  localeLabels,
  locales,
  switcherOrder,
  type Locale,
} from "./locales";
export { formatMillimes } from "./format/money";
export { DISPLAY_TIME_ZONE, formatDate, type DateStyle } from "./format/date";

/** Shape of every catalog. French is the source: en and ar must have the same keys. */
export type Messages = typeof fr;

export const messages: Record<Locale, Messages> = { fr, en, ar };
