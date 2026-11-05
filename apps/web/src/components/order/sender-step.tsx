"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button, Card, Field, Icon, Input, Select } from "@fastgo/ui";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { now } from "@/lib/order/clock";
import { withSenderPhone, type AddressDraft } from "@/lib/order/draft";
import { senderFormSchema } from "@/lib/order/schemas";
import { availableSlots } from "@/lib/order/slots";
import { StepBusy } from "./busy";
import { CancelOrder } from "./cancel-order";
import { PricePending } from "./price-aside";
import { AddressField } from "./address-field";
import { useSlotLabel } from "./slot-label";
import { useOrderStep } from "./use-order-step";

type Values = {
  address: AddressDraft;
  landmark: string;
  name: string;
  phone: string;
  slotId: string;
};

/** W11: where the parcel leaves from (CMD-01, CMD-02). */
export function SenderStep({ heading }: { heading: ReactNode }) {
  const { draft, save, goTo } = useOrderStep("sender");
  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {heading}
        {draft ? (
          <SenderForm key={draft.idempotencyKey} draft={draft} save={save} goTo={goTo} />
        ) : (
          <StepBusy />
        )}
      </div>
      <PricePending />
    </div>
  );
}

function SenderForm({
  draft,
  save,
  goTo,
}: {
  draft: NonNullable<ReturnType<typeof useOrderStep>["draft"]>;
  save: ReturnType<typeof useOrderStep>["save"];
  goTo: ReturnType<typeof useOrderStep>["goTo"];
}) {
  const t = useTranslations("order.sender");
  const c = useTranslations("cmd");
  const message = useErrorMessage();
  const slotLabel = useSlotLabel();
  const slots = useMemo(() => availableSlots(now()), []);
  const savedSlot = slots.find((slot) => slot.id === draft.sender.slot?.id);

  const { control, register, handleSubmit, subscribe, setError, formState } = useForm<Values>({
    resolver: zodResolver(senderFormSchema),
    defaultValues: {
      address: draft.sender.address,
      landmark: draft.sender.address.landmark,
      name: draft.sender.name,
      phone: draft.sender.phone,
      slotId: savedSlot?.id ?? "",
    },
  });
  const { errors } = formState;

  // Every change is saved, so a reload or "Enregistrer et quitter" keeps it (CMD-07).
  useEffect(() => {
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        save((current) => {
          const slot = slots.find((item) => item.id === values.slotId) ?? null;
          const next = withSenderPhone(current, values.phone ?? "");
          return {
            ...next,
            sender: {
              ...next.sender,
              address: { ...(values.address as AddressDraft), landmark: values.landmark ?? "" },
              name: values.name ?? "",
              slot,
            },
          };
        });
      },
    });
  }, [subscribe, save, slots]);

  const onSubmit = handleSubmit((values) => {
    const slot = availableSlots(now()).find((item) => item.id === values.slotId);
    if (!slot) {
      setError("slotId", { message: "slotPast" });
      return;
    }
    goTo(values.address.zone?.status === "out-of-zone" ? "outOfZone" : "recipient");
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <Controller
          control={control}
          name="address"
          render={({ field }) => (
            <AddressField
              label={t("address")}
              value={field.value}
              onChange={field.onChange}
              error={errors.address?.message}
              autoComplete="street-address"
            />
          )}
        />
        <Field label={t("landmark")}>
          <Input {...register("landmark")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("name")} error={message(errors.name?.message)} required>
            <Input {...register("name")} autoComplete="name" />
          </Field>
          <Field label={t("phone")} error={message(errors.phone?.message)} required>
            <Input
              {...register("phone")}
              type="tel"
              dir="ltr"
              autoComplete="tel"
              placeholder="+216 20 000 000"
            />
          </Field>
        </div>
        <Field
          label={t("slot")}
          hint={t("slotExample")}
          error={message(errors.slotId?.message)}
          required
        >
          <Select {...register("slotId")}>
            <option value="">{t("slotPlaceholder")}</option>
            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slotLabel(slot)}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      <div className="flex flex-wrap-reverse items-center justify-between gap-3">
        <CancelOrder />
        <Button type="submit" size="lg">
          {c("continue")}
          <Icon name="ar" />
        </Button>
      </div>
    </form>
  );
}
