"use client";

import { useEffect, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@fastgo/i18n";
import { Button, Card, Checkbox, Field, Icon, Input, RadioCard } from "@fastgo/ui";
import { Money } from "@/components/money";
import type { ParcelTypeCode } from "@/lib/data/services";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import type { OrderDraft } from "@/lib/order/draft";
import { parseMillimes } from "@/lib/order/money-input";
import { parcelSchema } from "@/lib/order/schemas";
import { StepBusy } from "./busy";
import { PricePending, PriceProvisional } from "./price-aside";
import { useOrderStep } from "./use-order-step";

const TYPES: ParcelTypeCode[] = ["document", "small", "medium", "large"];

type Values = OrderDraft["parcel"];

/** W13: what we deliver (CMD-01). */
export function ParcelStep({ heading }: { heading: ReactNode }) {
  const step = useOrderStep("parcel");
  const zone = step.draft?.recipient.address.zone;
  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {heading}
        {step.draft ? (
          <ParcelForm
            key={step.draft.idempotencyKey}
            draft={step.draft}
            save={step.save}
            goTo={step.goTo}
          />
        ) : (
          <StepBusy />
        )}
      </div>
      {zone?.status === "in-zone" ? <PriceProvisional zone={zone.zone} /> : <PricePending />}
    </div>
  );
}

function ParcelForm({
  draft,
  save,
  goTo,
}: { draft: OrderDraft } & Pick<ReturnType<typeof useOrderStep>, "save" | "goTo">) {
  const t = useTranslations("order.parcel");
  const c = useTranslations("cmd");
  const locale = useLocale() as Locale;
  const message = useErrorMessage();

  const { register, handleSubmit, control, subscribe, formState } = useForm<Values>({
    resolver: zodResolver(parcelSchema(locale)),
    defaultValues: draft.parcel,
  });
  const { errors } = formState;
  const declared = parseMillimes(useWatch({ control, name: "declaredValue" }) ?? "", locale);

  useEffect(() => {
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        save((current) => ({
          ...current,
          parcel: {
            type: values.type ?? null,
            count: values.count ?? "",
            weightKg: values.weightKg ?? "",
            content: values.content ?? "",
            declaredValue: values.declaredValue ?? "",
            fragile: values.fragile === true,
          },
        }));
      },
    });
  }, [subscribe, save]);

  const onSubmit = handleSubmit(() => goTo("service"));

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={errors.type ? "parcel-type-error" : undefined}
      >
        <legend className="sr-only">{t("typeLegend")}</legend>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {TYPES.map((type) => (
            <RadioCard
              key={type}
              value={type}
              {...register("type")}
              title={t(`types.${type}.name`)}
              description={t(`types.${type}.hint`)}
            />
          ))}
        </div>
        {errors.type ? (
          <p id="parcel-type-error" className="text-2xs font-medium text-danger">
            {message(errors.type.message)}
          </p>
        ) : null}
      </fieldset>
      <Card className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("count")} error={message(errors.count?.message)} required>
            <Input {...register("count")} inputMode="numeric" dir="ltr" />
          </Field>
          <Field label={t("weight")} error={message(errors.weightKg?.message)} required>
            <Input {...register("weightKg")} inputMode="decimal" dir="ltr" />
          </Field>
        </div>
        <Field label={t("content")} error={message(errors.content?.message)} required>
          <Input {...register("content")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Field label={t("declaredValue")} error={message(errors.declaredValue?.message)}>
              <Input {...register("declaredValue")} inputMode="decimal" dir="ltr" />
            </Field>
            {declared.ok && declared.millimes != null ? (
              <p className="text-2xs text-muted" aria-live="polite">
                {t.rich("declaredValueParsed", {
                  amount: () => <Money millimes={declared.millimes ?? 0} />,
                })}
              </p>
            ) : null}
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium">{t("option")}</legend>
            <Checkbox
              id="parcel-fragile"
              label={t("fragile")}
              {...register("fragile")}
              className="min-h-11 justify-center"
            />
          </fieldset>
        </div>
      </Card>
      <div className="flex flex-wrap-reverse items-center justify-between gap-3">
        <Button
          variant="ghost"
          className="border-transparent text-orange-dark"
          onClick={() => goTo("recipient")}
        >
          {c("back")}
        </Button>
        <Button type="submit" size="lg">
          {c("continue")}
          <Icon name="ar" />
        </Button>
      </div>
    </form>
  );
}
