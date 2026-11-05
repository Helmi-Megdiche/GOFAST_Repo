"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Card, Icon, Ltr, Timeline, TimelineItem } from "@fastgo/ui";
import { DateTime } from "@/components/money";
import { Link } from "@/i18n/navigation";
import { getOrderConfirmation, getOrderSlip } from "@/lib/data/orders";
import { StepBusy } from "./busy";

type Loaded = Awaited<ReturnType<typeof getOrderConfirmation>>;

/** W16 (CMD-06). Only ?n=FG-XXXX-XXXX is in the URL; details come from the mock order store. */
export function Confirmation({ heading }: { heading: ReactNode }) {
  const t = useTranslations("order.confirmation");
  const code = useSearchParams().get("n") ?? "";
  const [order, setOrder] = useState<Loaded | undefined>(undefined);
  const [slip, setSlip] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getOrderConfirmation(code), getOrderSlip(code)]).then(([found, file]) => {
      if (!active) return;
      setOrder(found);
      setSlip(file?.href ?? null);
    });
    return () => {
      active = false;
    };
  }, [code]);

  if (order === undefined) return <StepBusy />;

  if (order === null) {
    return (
      <Card className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-4 px-6 py-12 text-center">
        <h1 className="text-d2">{t("notFound.title")}</h1>
        <p className="text-lead">{t("notFound.text")}</p>
        <Button as={Link} href="/commander">
          {t("newOrder")}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-6 px-6 py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-success-light text-success">
        <Icon name="check" size="lg" />
      </span>
      <div className="flex flex-col gap-2">
        {heading}
        <p className="text-lead">
          {t.rich("number", {
            code: () => (
              <Ltr mono className="font-semibold text-ink">
                {order.code}
              </Ltr>
            ),
          })}
        </p>
      </div>
      <Timeline className="text-start">
        <TimelineItem state="current">{t("steps.checking")}</TimelineItem>
        <TimelineItem state="todo">
          {t("steps.recipientSms", { name: order.recipientName })}
        </TimelineItem>
        <TimelineItem state="todo">
          {t.rich("steps.pickup", {
            start: () => <DateTime value={order.pickup.startUtc} style="time" />,
            end: () => <DateTime value={order.pickup.endUtc} style="time" />,
          })}
        </TimelineItem>
      </Timeline>
      <div className="flex flex-wrap justify-center gap-3">
        <Button as={Link} href={{ pathname: "/suivi", query: { n: order.code } }} size="lg">
          {t("track")}
        </Button>
        {slip ? (
          <Button as="a" href={slip} download variant="secondary" size="lg">
            <Icon name="dl" />
            {t("slip")}
          </Button>
        ) : null}
        <Button
          as={Link}
          href="/commander"
          variant="ghost"
          className="border-transparent text-orange-dark"
        >
          {t("newOrder")}
        </Button>
      </div>
    </Card>
  );
}
