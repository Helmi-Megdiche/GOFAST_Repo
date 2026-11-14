"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Card, KeyValue } from "@fastgo/ui";
import { Money } from "@/components/money";
import { EXAMPLE_PRICE_ROWS } from "@/lib/data/fixtures/pricing";
import { PRICE_LINES, type Quote } from "@fastgo/domain";
import { exampleMakeQuote } from "@/lib/order/example-data";

/** Lowest example total, shown as "Dès …" once the delivery address is known (W12, W13). */
function lowestExample(zone: string): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const service of Object.keys(EXAMPLE_PRICE_ROWS) as (keyof typeof EXAMPLE_PRICE_ROWS)[]) {
    for (const parcelType of Object.keys(
      EXAMPLE_PRICE_ROWS[service],
    ) as (keyof (typeof EXAMPLE_PRICE_ROWS)["standard"])[]) {
      const total = exampleMakeQuote(
        { service, parcelType, weightKg: 1, fragile: false, zone, from: "", to: "" },
        0,
        "preview",
      ).totalMillimes;
      lowest = Math.min(lowest, total);
    }
  }
  return lowest;
}

export function PricePending() {
  const t = useTranslations("order.price");
  return (
    <Card as="aside" aria-label={t("title")} className="flex flex-col gap-2 md:sticky md:top-4">
      <h2 className="text-h4">{t("title")}</h2>
      <p className="text-sm text-muted">{t("pending")}</p>
    </Card>
  );
}

export function PriceProvisional({ zone }: { zone: string }) {
  const t = useTranslations("order.price");
  return (
    <Card
      as="aside"
      aria-label={t("provisional")}
      className="flex flex-col gap-2 md:sticky md:top-4"
    >
      <h2 className="text-h4">{t("provisional")}</h2>
      <p className="font-display text-[30px] leading-tight font-bold">
        {t.rich("from", { amount: () => <Money millimes={lowestExample(zone)} /> })}
      </p>
      <p className="text-2xs text-muted">{t("provisionalNote")}</p>
    </Card>
  );
}

export function PriceTotal({ quote }: { quote: Quote }) {
  const t = useTranslations("order.price");
  return (
    <Card as="aside" aria-label={t("title")} className="flex flex-col gap-2 md:sticky md:top-4">
      <h2 className="text-h4">{t("title")}</h2>
      <p className="font-display text-[30px] leading-tight font-bold">
        <Money millimes={quote.totalMillimes} />
      </p>
      <p className="text-2xs text-muted">{t("guarantee")}</p>
    </Card>
  );
}

/** R204: every line, even at 0,000, then the total. R207: surcharge name and ceiling. */
export function PriceLines({ quote, serviceName }: { quote: Quote; serviceName: string }) {
  const t = useTranslations("order.price");
  const p = useTranslations("placeholders");
  const name = t(`surchargeNames.${quote.surcharge.code}`);
  const ceiling: ReactNode =
    quote.surcharge.ceilingMillimes == null ? (
      p("ceiling")
    ) : (
      <Money millimes={quote.surcharge.ceilingMillimes} />
    );

  const terms: Record<(typeof PRICE_LINES)[number], ReactNode> = {
    base: t("lines.base", { service: serviceName, zone: quote.input.zone }),
    distance: t("lines.distance"),
    weight: t("lines.weight"),
    options: t("lines.options"),
    surcharge: t.rich("lines.surcharge", { name, ceiling: () => ceiling }),
    discount: t("lines.discount"),
    vat: t("lines.vat"),
    stamp: t("lines.stamp"),
  };

  return (
    <KeyValue
      items={PRICE_LINES.map((line) => ({
        term: terms[line],
        value: <Money millimes={quote.lines[line]} />,
      }))}
    />
  );
}
