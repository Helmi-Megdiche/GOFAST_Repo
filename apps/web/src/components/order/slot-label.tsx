"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDate, type Locale } from "@fastgo/i18n";
import type { Slot } from "@/lib/order/slots";

/** "Aujourd'hui, de 11 h à 13 h", from the UTC instants of the slot, shown in Africa/Tunis. */
export function useSlotLabel() {
  const t = useTranslations("order.slot");
  const locale = useLocale() as Locale;
  return (slot: Slot) =>
    t(slot.dayOffset === 0 ? "today" : "tomorrow", {
      start: formatDate(slot.startUtc, locale, "time"),
      end: formatDate(slot.endUtc, locale, "time"),
    });
}
