"use client";

import { useState, type FormEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Field, FileAttach, Input, Ltr, Select, Textarea } from "@fastgo/ui";
import { Confirmation } from "@/components/confirmation";
import { contactTypeFromQuery } from "@/lib/contact-type";
import { submitContact } from "@/lib/data/contact";
import { contactFormSchema, type ContactFormValues } from "@/lib/forms/schemas";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { CaptchaMock } from "./captcha-mock";

const SERVER_ERROR_KEY = {
  "attachment-too-large": "attachmentTooLarge",
  "captcha-failed": "captchaFailed",
  "invalid-tracking-code": "invalidTrackingCode",
} as const;

/**
 * Contact form (FE-06): 5 MB attachment, captcha, then the "ticket opened" confirmation.
 * `requestedType` is the raw ?type= value (read by ContactFormFromUrl); "" means none.
 */
export function ContactForm({ requestedType }: { requestedType: string }) {
  const t = useTranslations("contact");
  const serverErrors = useTranslations("forms.serverErrors");
  const message = useErrorMessage();
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      type: contactTypeFromQuery(requestedType),
      name: "",
      phone: "",
      email: "",
      trackingCode: "",
      message: "",
      attachment: null,
      captchaToken: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await submitContact({
      ...values,
      attachment: values.attachment
        ? { name: values.attachment.name, sizeBytes: values.attachment.size }
        : null,
    });
    if (result.status === "created") {
      setTicketId(result.ticketId);
      return;
    }
    setServerError(serverErrors(SERVER_ERROR_KEY[result.code]));
    // A captcha token works once: ask again.
    setValue("captchaToken", "");
  });

  if (ticketId) {
    return (
      <Confirmation className="md:basis-[460px]">
        <Card className="flex flex-col items-start gap-4">
          <Alert tone="success" className="w-full">
            <b>{t("success.title")}</b>
            <br />
            {t("success.ticket")} <Ltr mono>{ticketId}</Ltr>
            <br />
            {t("success.text")}
          </Alert>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              setTicketId(null);
            }}
          >
            {t("success.again")}
          </Button>
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
      className="flex flex-col gap-4 md:basis-[460px]"
    >
      <Field label={t("form.type")}>
        <Select {...register("type")}>
          <option value="question">{t("form.types.question")}</option>
          <option value="quote">{t("form.types.quote")}</option>
          <option value="claim">{t("form.types.claim")}</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("form.name")} error={message(errors.name?.message)} required>
          <Input autoComplete="name" {...register("name")} />
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
      </div>
      <Field label={t("form.email")} error={message(errors.email?.message)} required>
        <Input type="email" dir="ltr" autoComplete="email" {...register("email")} />
      </Field>
      <Field label={t("form.tracking")} error={message(errors.trackingCode?.message)}>
        <Input
          dir="ltr"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="FG-7K4M-2QXP"
          {...register("trackingCode")}
        />
      </Field>
      <Field label={t("form.message")} error={message(errors.message?.message)} required>
        <Textarea {...register("message")} />
      </Field>
      <Controller
        control={control}
        name="attachment"
        render={({ field, fieldState }) => (
          <FileAttach
            ref={field.ref}
            label={t("form.attach")}
            removeLabel={t("form.removeAttachment")}
            value={field.value}
            onChange={(file) => {
              field.onChange(file);
              void trigger("attachment");
            }}
            error={message(fieldState.error?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="captchaToken"
        render={({ field, fieldState }) => (
          <CaptchaMock
            token={field.value}
            onToken={(token) => {
              field.onChange(token);
              if (token) void trigger("captchaToken");
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
