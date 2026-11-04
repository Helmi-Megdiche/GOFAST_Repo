"use client";

import { useState, type FormEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Field, FileAttach, Input, Ltr, Select } from "@fastgo/ui";
import { Confirmation } from "@/components/confirmation";
import { submitDriverApplication } from "@/lib/data/driver";
import { driverFormSchema, type DriverFormValues } from "@/lib/forms/schemas";
import { useErrorMessage } from "@/lib/forms/use-error-message";

/**
 * Driver application (W08). The 5 MB attachment limit is carried over from the contact form
 * (FE-06): the spec gives none for this form.
 */
export function DriverForm() {
  const t = useTranslations("driver");
  const p = useTranslations("placeholders");
  const serverErrors = useTranslations("forms.serverErrors");
  const message = useErrorMessage();
  const [reference, setReference] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<DriverFormValues>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: { fullName: "", phone: "", vehicle: "moto", zone: "city", document: null },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await submitDriverApplication({
      ...values,
      document: values.document
        ? { name: values.document.name, sizeBytes: values.document.size }
        : null,
    });
    if (result.status === "created") setReference(result.applicationId);
    else setServerError(serverErrors("attachmentTooLarge"));
  });

  if (reference) {
    return (
      <Confirmation className="md:basis-[440px]">
        <Card className="flex flex-col gap-3">
          <Alert tone="success">
            <b>{t("success.title")}</b>
            <br />
            {t("success.reference")} <Ltr mono>{reference}</Ltr>
            <br />
            {t("success.text")}
          </Alert>
        </Card>
      </Confirmation>
    );
  }

  return (
    <Card
      as="form"
      method="post"
      noValidate
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        // aria-disabled keeps the focus on the button while sending: ignore a second submit.
        if (isSubmitting) event.preventDefault();
        else void onSubmit(event);
      }}
      className="flex flex-col gap-4 md:basis-[440px]"
    >
      <h2 className="text-d3">{t("form.title")}</h2>
      <Field label={t("form.fullName")} error={message(errors.fullName?.message)} required>
        <Input autoComplete="name" {...register("fullName")} />
      </Field>
      <Field label={t("form.phone")} error={message(errors.phone?.message)} required>
        <Input
          type="tel"
          dir="ltr"
          autoComplete="tel"
          placeholder="+216 20 000 000"
          {...register("phone")}
        />
      </Field>
      <Field label={t("form.vehicle")}>
        <Select {...register("vehicle")}>
          <option value="moto">{t("form.vehicles.moto")}</option>
          <option value="other">{p("vehicle")}</option>
        </Select>
      </Field>
      <Field label={t("form.zone")}>
        <Select {...register("zone")}>
          <option value="city">{p("city")}</option>
        </Select>
      </Field>
      <Controller
        control={control}
        name="document"
        render={({ field, fieldState }) => (
          <FileAttach
            label={t("form.attach")}
            removeLabel={t("form.removeAttachment")}
            value={field.value}
            onChange={(file) => {
              field.onChange(file);
              void trigger("document");
            }}
            error={message(fieldState.error?.message)}
          />
        )}
      />
      {serverError ? <Alert tone="error">{serverError}</Alert> : null}
      <Button type="submit" fullWidth aria-disabled={isSubmitting || undefined}>
        {isSubmitting ? t("form.sending") : t("form.submit")}
      </Button>
    </Card>
  );
}
