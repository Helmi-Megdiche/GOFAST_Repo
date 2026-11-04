import { useLocale } from "next-intl";
import { formatDate, formatMillimes, type DateStyle } from "@fastgo/i18n";
import { Ltr } from "@fastgo/ui";

/** An amount in millimes, formatted for the current language, always left-to-right. */
export function Money({ millimes }: { millimes: number }) {
  const locale = useLocale();
  return <Ltr>{formatMillimes(millimes, locale)}</Ltr>;
}

/** A UTC instant shown in Africa/Tunis, always left-to-right. */
export function DateTime({
  value,
  style = "dateTime",
}: {
  value: Date | string | number;
  style?: DateStyle;
}) {
  const locale = useLocale();
  return <Ltr>{formatDate(value, locale, style)}</Ltr>;
}
