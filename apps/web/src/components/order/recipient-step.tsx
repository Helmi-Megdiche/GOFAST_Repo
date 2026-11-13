"use client";

import { useEffect, type ReactNode } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button, Card, Checkbox, Field, Icon, Input, Select } from "@fastgo/ui";
import { getSession } from "@/lib/data/session";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import type { AddressDraft, OrderDraft } from "@/lib/order/draft";
import { recipientFormSchema } from "@/lib/order/schemas";
import { StepBusy } from "./busy";
import { PricePending, PriceProvisional } from "./price-aside";
import { addressDraftFromSaved } from "@/lib/order/saved";
import { AddressField } from "./address-field";
import { SavedAddressPicker, SavedRecipientPicker } from "./saved-picker";
import { useOrderStep } from "./use-order-step";

type Values = {
  address: AddressDraft;
  landmark: string;
  name: string;
  phone: string;
  instructions: string;
  smsLanguage: "fr" | "ar" | "en";
  save: boolean;
};

/** W12: where the parcel goes (CMD-01, CMD-02). */
export function RecipientStep({ heading }: { heading: ReactNode }) {
  const step = useOrderStep("recipient");
  const zone = step.draft?.recipient.address.zone;
  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {heading}
        {step.draft ? (
          <RecipientForm
            key={step.draft.idempotencyKey}
            draft={step.draft}
            save={step.save}
            goTo={step.goTo}
          />
        ) : (
          <StepBusy />
        )}
      </div>
      {zone?.status === "in-zone" && step.draft?.recipient.address.confirmed ? (
        <PriceProvisional zone={zone.zone} />
      ) : (
        <PricePending />
      )}
    </div>
  );
}

function RecipientForm({
  draft,
  save,
  goTo,
}: { draft: OrderDraft } & Pick<ReturnType<typeof useOrderStep>, "save" | "goTo">) {
  const t = useTranslations("order.recipient");
  const c = useTranslations("cmd");
  const message = useErrorMessage();
  // "Enregistrer ce destinataire" is mock only and needs a session (decision 23).
  const signedIn = getSession() != null;

  const { control, register, handleSubmit, setValue, subscribe, formState } = useForm<Values>({
    resolver: zodResolver(recipientFormSchema),
    defaultValues: {
      address: draft.recipient.address,
      landmark: draft.recipient.address.landmark,
      name: draft.recipient.name,
      phone: draft.recipient.phone,
      instructions: draft.recipient.instructions,
      smsLanguage: draft.recipient.smsLanguage,
      save: draft.recipient.save,
    },
  });
  const { errors } = formState;
  // Registered before the other fields, so on submit the form focuses the address first when it
  // is wrong (react-hook-form focuses the first registered field in error, through field.ref).
  const { field: addressField } = useController({ control, name: "address" });

  useEffect(() => {
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        save((current) => ({
          ...current,
          recipient: {
            address: { ...(values.address as AddressDraft), landmark: values.landmark ?? "" },
            name: values.name ?? "",
            phone: values.phone ?? "",
            instructions: values.instructions ?? "",
            smsLanguage: values.smsLanguage ?? "fr",
            save: values.save === true,
          },
        }));
      },
    });
  }, [subscribe, save]);

  const onSubmit = handleSubmit((values) => {
    goTo(values.address.zone?.status === "out-of-zone" ? "outOfZone" : "parcel");
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <SavedRecipientPicker
          onPick={(saved) => {
            void addressDraftFromSaved(saved.address, saved.landmark).then((address) => {
              addressField.onChange(address);
              setValue("landmark", saved.landmark);
              setValue("name", saved.name);
              setValue("phone", saved.phone);
              setValue("smsLanguage", saved.locale);
            });
          }}
        />
        <SavedAddressPicker
          onPick={(saved) => {
            // The zone is checked now: an address that left the zone goes to W17 (R201).
            void addressDraftFromSaved(saved.text, saved.landmark).then((address) => {
              addressField.onChange(address);
              setValue("landmark", saved.landmark);
            });
          }}
        />
        <AddressField
          label={t("address")}
          value={addressField.value}
          onChange={addressField.onChange}
          inputRef={addressField.ref}
          error={errors.address?.message}
        />
        <Field label={t("landmark")}>
          <Input {...register("landmark")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("name")} error={message(errors.name?.message)} required>
            <Input {...register("name")} />
          </Field>
          <Field
            label={t("phone")}
            hint={t("phoneHint")}
            error={message(errors.phone?.message)}
            required
          >
            <Input {...register("phone")} type="tel" dir="ltr" placeholder="+216 50 000 000" />
          </Field>
        </div>
        <Field label={t("instructions")}>
          <Input {...register("instructions")} />
        </Field>
        <Field label={t("smsLanguage")}>
          <Select {...register("smsLanguage")}>
            <option value="fr">{t("languages.fr")}</option>
            <option value="ar">{t("languages.ar")}</option>
            <option value="en">{t("languages.en")}</option>
          </Select>
        </Field>
        {signedIn ? <Checkbox id="save-recipient" label={t("save")} {...register("save")} /> : null}
      </Card>
      <div className="flex flex-wrap-reverse items-center justify-between gap-3">
        <Button
          variant="ghost"
          className="border-transparent text-orange-dark"
          onClick={() => goTo("sender")}
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
