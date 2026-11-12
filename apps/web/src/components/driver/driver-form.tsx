"use client";

import { useState, type FormEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Field, FileAttach, Input, Ltr, Select } from "@fastgo/ui";
import { Confirmation } from "@/components/confirmation";
import { CLAIM_ATTACHMENT_TYPES } from "@/lib/order/constants";
import {
  DRIVER_DOCUMENTS,
  DRIVER_VEHICLES,
  submitDriverApplication,
  type DriverApplicationResult,
  type DriverDocumentCode,
} from "@/lib/data/driver";
import { driverFormSchema, type DriverFormValues } from "@/lib/forms/schemas";
import { useErrorMessage } from "@/lib/forms/use-error-message";

const ACCEPT = CLAIM_ATTACHMENT_TYPES.join(",");

const SERVER_ERROR_KEY = {
  "vehicle-invalid": "vehicleInvalid",
  "document-missing": "documentRequired",
  "attachment-too-large": "attachmentTooLarge",
  "attachment-bad-type": "attachmentBadType",
} as const;

/**
 * Driver application (W08, FE-05). Six required documents (GOFAST's list), each checked here and
 * again by the mock server. Size limit from the contact form (FE-06), types from the claim
 * attachments: the spec gives none for this form. Files stay in memory: never in storage or the URL.
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
    defaultValues: {
      fullName: "",
      phone: "",
      vehicle: "motorbike",
      zone: "city",
      documents: {
        cin: null,
        licence: null,
        registration: null,
        insurance: null,
        vehiclePhoto: null,
        bankDetails: null,
      },
    },
  });

  const onSubmit = handleSubmit(
    async (values) => {
      setServerError(null);
      const info = (code: DriverDocumentCode) => {
        const file = values.documents[code];
        return file ? { name: file.name, type: file.type, sizeBytes: file.size } : null;
      };
      const result: DriverApplicationResult = await submitDriverApplication({
        ...values,
        documents: Object.fromEntries(DRIVER_DOCUMENTS.map((code) => [code, info(code)])) as never,
      });
      if (result.status === "created") setReference(result.applicationId);
      else setServerError(serverErrors(SERVER_ERROR_KEY[result.code]));
    },
    (invalid) => {
      // The text fields take the focus themselves; a document has no input ref, so move it here.
      if (invalid.fullName || invalid.phone) return;
      const first = DRIVER_DOCUMENTS.find((code) => invalid.documents?.[code]);
      document.querySelector<HTMLElement>(`[data-document="${first}"] button`)?.focus();
    },
  );

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
          {DRIVER_VEHICLES.map((vehicle) => (
            <option key={vehicle} value={vehicle}>
              {t(`form.vehicles.${vehicle}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("form.zone")}>
        <Select {...register("zone")}>
          <option value="city">{p("city")}</option>
        </Select>
      </Field>
      <h3 className="mt-2 text-d3">{t("form.documentsTitle")}</h3>
      <p className="-mt-2 text-2xs text-muted">{t("form.documentsHint")}</p>
      {DRIVER_DOCUMENTS.map((code) => (
        <Controller
          key={code}
          control={control}
          name={`documents.${code}`}
          render={({ field, fieldState }) => (
            <div
              role="group"
              aria-labelledby={`driver-doc-${code}`}
              data-document={code}
              className="flex flex-col gap-1.5"
            >
              <span id={`driver-doc-${code}`} className="text-xs font-medium text-ink">
                {t(`form.documents.${code}`)}
                <span aria-hidden="true" className="ms-0.5 text-danger">
                  *
                </span>
              </span>
              <FileAttach
                label={t("form.addFile")}
                removeLabel={t("form.removeDocument", { document: t(`form.documents.${code}`) })}
                accept={ACCEPT}
                value={field.value}
                onChange={(file) => {
                  field.onChange(file);
                  void trigger(`documents.${code}`);
                }}
                error={message(fieldState.error?.message)}
              />
            </div>
          )}
        />
      ))}
      {serverError ? <Alert tone="error">{serverError}</Alert> : null}
      <Button type="submit" fullWidth aria-disabled={isSubmitting || undefined}>
        {isSubmitting ? t("form.sending") : t("form.submit")}
      </Button>
    </Card>
  );
}
