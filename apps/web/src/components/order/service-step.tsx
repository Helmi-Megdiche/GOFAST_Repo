"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Icon, RadioCard, Select } from "@fastgo/ui";
import { Money } from "@/components/money";
import { getQuote } from "@/lib/data/pricing";
import type { ServiceCode } from "@/lib/data/services";
import { EXAMPLE_SURCHARGE } from "@/lib/data/fixtures/pricing";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { now } from "@/lib/order/clock";
import type { OrderDraft } from "@/lib/order/draft";
import { priceLines, sumLines } from "@/lib/order/pricing";
import { availableSlots, isSlotInFuture } from "@/lib/order/slots";
import { priceInputOf, quoteMatches } from "@/lib/order/steps";
import { StepBusy } from "./busy";
import { PricePending, PriceTotal } from "./price-aside";
import { useSlotLabel } from "./slot-label";
import { useOrderStep } from "./use-order-step";

const SERVICES: ServiceCode[] = ["express", "standard", "scheduled"];

/** W14: when it must arrive. Every card shows its example price; the chosen one is the quote. */
export function ServiceStep({ heading }: { heading: ReactNode }) {
  const step = useOrderStep("service");
  const quote = step.draft && quoteMatches(step.draft) ? step.draft.quote : null;
  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {heading}
        {step.draft ? (
          <ServiceForm
            key={step.draft.idempotencyKey}
            draft={step.draft}
            save={step.save}
            goTo={step.goTo}
          />
        ) : (
          <StepBusy />
        )}
      </div>
      {quote ? <PriceTotal quote={quote} /> : <PricePending />}
    </div>
  );
}

function ServiceForm({
  draft,
  save,
  goTo,
}: { draft: OrderDraft } & Pick<ReturnType<typeof useOrderStep>, "save" | "goTo">) {
  const t = useTranslations("order.service");
  const o = useTranslations("offers");
  const p = useTranslations("placeholders");
  const price = useTranslations("order.price");
  const c = useTranslations("cmd");
  const message = useErrorMessage();
  const slotLabel = useSlotLabel();
  const slots = useMemo(() => availableSlots(now()), []);
  const [error, setError] = useState<string | undefined>();
  const [slotError, setSlotError] = useState<string | undefined>();

  const zone = draft.recipient.address.zone;
  const available = new Set(
    zone?.status === "in-zone" && draft.sender.address.zone?.status === "in-zone"
      ? zone.services.filter(
          (code) =>
            draft.sender.address.zone?.status === "in-zone" &&
            draft.sender.address.zone.services.includes(code),
        )
      : [],
  );
  const inputFor = (service: ServiceCode) =>
    priceInputOf({ ...draft, service: { ...draft.service, code: service } });
  const totalFor = (service: ServiceCode) => {
    const input = inputFor(service);
    return input ? sumLines(priceLines(input)) : 0;
  };

  async function choose(service: ServiceCode) {
    setError(undefined);
    const input = inputFor(service);
    if (!input) return;
    const result = await getQuote(
      input,
      draft.sender.address.zone,
      draft.recipient.address.zone,
      now(),
    );
    if (result.status === "outOfZone") {
      goTo("outOfZone");
      return;
    }
    if (result.status !== "ok") return;
    // The customer sees and picks this price: it is the accepted quote (R205 starts here).
    save((current) => ({
      ...current,
      service: { code: service, slot: service === "scheduled" ? current.service.slot : null },
      quote: result.quote,
      acceptedQuoteId: result.quote.id,
    }));
  }

  // A priced field changed since the quote (e.g. the weight on W13): take a new quote.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a stale quote is replaced once, on open
    if (draft.service.code && !quoteMatches(draft)) void choose(draft.service.code);
    // Only when the step opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onContinue() {
    if (!draft.service.code || !quoteMatches(draft)) {
      setError("serviceRequired");
      return;
    }
    if (draft.service.code === "scheduled" && !isSlotInFuture(draft.service.slot, now())) {
      setSlotError(draft.service.slot ? "slotPast" : "slotRequired");
      return;
    }
    goTo("review");
  }

  const surchargeName = price(`surchargeNames.${EXAMPLE_SURCHARGE.code}`);

  return (
    <div className="flex flex-col gap-4">
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={error ? "service-error" : undefined}
      >
        <legend className="sr-only">{t("legend")}</legend>
        {SERVICES.map((service) => {
          const enabled = available.has(service);
          return (
            <div key={service} className="flex flex-col gap-2">
              <RadioCard
                name="service"
                value={service}
                checked={draft.service.code === service}
                disabled={!enabled}
                onChange={() => void choose(service)}
                title={o(`${service}.name`)}
                end={enabled ? <Money millimes={totalFor(service)} /> : null}
                description={
                  !enabled
                    ? t("unavailable")
                    : service === "standard"
                      ? t("delays.standard", { time: p("time") })
                      : t(`delays.${service}`)
                }
              />
              {service === "scheduled" && draft.service.code === "scheduled" ? (
                <Field label={t("slot")} error={message(slotError)} required className="ps-4">
                  <Select
                    value={slots.find((slot) => slot.id === draft.service.slot?.id)?.id ?? ""}
                    onChange={(event) => {
                      setSlotError(undefined);
                      const slot = slots.find((item) => item.id === event.target.value) ?? null;
                      save((current) => ({ ...current, service: { ...current.service, slot } }));
                    }}
                  >
                    <option value="">{p("time")}</option>
                    {slots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slotLabel(slot)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
          );
        })}
        {error ? (
          <p id="service-error" className="text-2xs font-medium text-danger">
            {message(error)}
          </p>
        ) : null}
      </fieldset>
      <Alert tone="info">
        {t.rich("surcharge", {
          name: surchargeName,
          amount: () => <Money millimes={EXAMPLE_SURCHARGE.amount} />,
          ceiling: () => p("ceiling"),
        })}
      </Alert>
      <div className="flex flex-wrap-reverse items-center justify-between gap-3">
        <Button
          variant="ghost"
          className="border-transparent text-orange-dark"
          onClick={() => goTo("parcel")}
        >
          {c("back")}
        </Button>
        <Button size="lg" onClick={onContinue}>
          {t("submit")}
          <Icon name="ar" />
        </Button>
      </div>
    </div>
  );
}
