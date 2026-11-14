"use client";

import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button, Icon, Input } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { trackingFormSchema, type TrackingFormValues } from "@/lib/forms/schemas";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { FOUND_TRACKING_CODE } from "@/lib/data/fixtures/tracking";
import { normalizeTrackingCode } from "@fastgo/domain";

/** "Déjà un numéro de suivi ?" on the home page: checks the shape, then opens /suivi?n=CODE. */
export function HomeTrackingForm() {
  const t = useTranslations("home.hero");
  const message = useErrorMessage();
  const router = useRouter();
  const id = useId();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TrackingFormValues>({
    resolver: zodResolver(trackingFormSchema),
    defaultValues: { code: "" },
  });
  const error = message(errors.code?.message);

  return (
    <form
      noValidate
      className="flex flex-col gap-1.5 border-t border-line pt-3"
      onSubmit={handleSubmit(({ code }) =>
        router.push(`/suivi?n=${encodeURIComponent(normalizeTrackingCode(code))}`),
      )}
    >
      <label htmlFor={id} className="text-xs font-semibold">
        {t("trackingLabel")}
      </label>
      <div className="flex items-start gap-2">
        <Input
          id={id}
          dir="ltr"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={FOUND_TRACKING_CODE}
          aria-describedby={error ? `${id}-error` : undefined}
          invalid={Boolean(error)}
          className="text-code"
          {...register("code")}
        />
        <Button type="submit" variant="secondary" className="h-11">
          {t("trackingButton")}
        </Button>
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          className="flex items-center gap-1.5 text-2xs font-medium text-danger"
        >
          <Icon name="warn" size="sm" />
          <span>{error}</span>
        </p>
      ) : null}
    </form>
  );
}
