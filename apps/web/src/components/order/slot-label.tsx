"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDate, type Locale } from "@fastgo/i18n";
import { now } from "@/lib/order/clock";
import { slotDay, type Slot } from "@/lib/order/slots";

/**
 * "Aujourd'hui, de 11 h à 13 h", from the UTC instants of the slot, shown in Africa/Tunis. Today
 * and tomorrow are worked out from the start instant at display time, never stored.
 */
export function useSlotLabel() {
  const t = useTranslations("order.slot");
  const locale = useLocale() as Locale;
  return (slot: Slot) => {
    const times = {
      start: formatDate(slot.startUtc, locale, "time"),
      end: formatDate(slot.endUtc, locale, "time"),
    };
    const day = slotDay(slot, now());
    return day === "other"
      ? t("onDate", { ...times, date: formatDate(slot.startUtc, locale, "date") })
      : t(day, times);
  };
}
