"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Card, KeyValue } from "@fastgo/ui";
import { Money } from "@/components/money";
import { EXAMPLE_PRICE_ROWS } from "@/lib/data/fixtures/pricing";
import { type LineAmount, type PriceLine, type Quote } from "@fastgo/domain";
import { exampleMakeQuote } from "@/lib/order/example-data";
import { presentPriceLines } from "@/lib/order/price-lines";

/** Lowest example total, shown as "Dès …" once the delivery address is known (W12, W13). */
function lowestExample(zone: string): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const service of Object.keys(EXAMPLE_PRICE_ROWS) as (keyof typeof EXAMPLE_PRICE_ROWS)[]) {
    for (const parcelType of Object.keys(
      EXAMPLE_PRICE_ROWS[service],
    ) as (keyof (typeof EXAMPLE_PRICE_ROWS)["standard"])[]) {
      const total = exampleMakeQuote(
        {
          service,
          parcelType,
          parcels: [{ weightG: 1_000 }],
          fragile: false,
          packaging: false,
          zone,
          from: "",
          to: "",
        },
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

/**
 * Unit price and count of a per-parcel line ("2,500 × 3"), or "weight differs by parcel" when the
 * parcels do not cost the same. Nothing for a line that is charged once.
 */
function PriceLineCount({ line }: { line: LineAmount }) {
  const t = useTranslations("order.price");
  if (line.count < 2) return null;
  return (
    <span className="block text-2xs text-muted" data-testid="price-line-count">
      {line.unitMillimes == null
        ? t("mixedWeights")
        : t.rich("unitTimes", {
            unit: () => <Money millimes={line.unitMillimes ?? 0} />,
            count: line.count,
          })}
    </span>
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

  const terms: Record<PriceLine, ReactNode> = {
    base: t("lines.base", { service: serviceName, zone: quote.input.zone }),
    distance: t("lines.distance"),
    weight: t("lines.weight"),
    options: t("lines.options"),
    packaging: t("lines.packaging"),
    surcharge: t.rich("lines.surcharge", { name, ceiling: () => ceiling }),
    discount: t("lines.discount"),
    vat: t("lines.vat"),
    stamp: t("lines.stamp"),
  };

  return (
    <KeyValue
      items={presentPriceLines(quote).map(([line, found]) => ({
        term: (
          <>
            {terms[line]}
            <PriceLineCount line={found} />
          </>
        ),
        value: <Money millimes={found.totalMillimes} />,
      }))}
    />
  );
}
