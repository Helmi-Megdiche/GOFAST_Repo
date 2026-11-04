"use client";

import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Icon,
  Input,
  Section,
  Timeline,
  TimelineItem,
} from "@fastgo/ui";
import { DateTime } from "@/components/money";
import { PageHero } from "@/components/page-hero";
import { Link, useRouter } from "@/i18n/navigation";
import { FOUND_TRACKING_CODE } from "@/lib/data/fixtures/tracking";
import { lookupTracking, type TrackingResult } from "@/lib/data/tracking";
import { trackingFormSchema, type TrackingFormValues } from "@/lib/forms/schemas";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { normalizeTrackingCode } from "@/lib/tracking-code";

/**
 * Public tracking (SUI-01): a form, then status, estimated time and history. No personal data.
 *
 * The URL is the single source of truth: `code` is the raw ?n= value. A valid search replaces
 * the URL, the lookup runs from an effect keyed on the code, and what is shown is derived while
 * rendering from the stored { code, result }.
 */
export function TrackingView({ code }: { code: string }) {
  const t = useTranslations("tracking");
  const p = useTranslations("placeholders");
  const message = useErrorMessage();
  const router = useRouter();
  const inputId = useId();
  const current = normalizeTrackingCode(code);
  const [stored, setStored] = useState<{ code: string; result: TrackingResult } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TrackingFormValues>({
    resolver: zodResolver(trackingFormSchema),
    defaultValues: { code: current },
  });

  // The input follows the URL (normalized): a link, the nav link "Suivre un colis" or a search.
  useEffect(() => {
    reset({ code: current });
  }, [current, reset]);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    void lookupTracking(current).then((result) => {
      if (!cancelled) setStored({ code: current, result });
    });
    return () => {
      cancelled = true;
    };
  }, [current]);

  const result = current && stored?.code === current ? stored.result : null;
  const loading = current !== "" && result === null;
  // A badly formed number in the field hides the previous answer: it must not look like its result.
  const fieldInvalid = Boolean(errors.code);
  const fieldError = errors.code
    ? message(errors.code.message)
    : result?.status === "invalid-format"
      ? message("trackingInvalid")
      : undefined;
  const shown = fieldInvalid || !current ? null : result;

  const onSubmit = handleSubmit(({ code: typed }) => {
    if (loading) return;
    router.replace(`/suivi?n=${encodeURIComponent(normalizeTrackingCode(typed))}`, {
      scroll: false,
    });
  });

  return (
    <>
      <PageHero title={t("title")}>
        <form noValidate onSubmit={onSubmit} className="flex max-w-[560px] flex-col gap-2">
          <div className="flex gap-2">
            <label htmlFor={inputId} className="sr-only">
              {t("label")}
            </label>
            <Input
              id={inputId}
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={FOUND_TRACKING_CODE}
              aria-describedby={fieldError ? `${inputId}-error` : undefined}
              invalid={Boolean(fieldError)}
              className="text-code"
              {...register("code")}
            />
            {/* aria-disabled, not disabled: the button keeps the focus while searching */}
            <Button type="submit" aria-disabled={loading || undefined}>
              {loading ? t("searching") : t("submit")}
            </Button>
          </div>
          {fieldError ? (
            <Alert tone="error">
              <span id={`${inputId}-error`}>{fieldError}</span>
            </Alert>
          ) : null}
        </form>
      </PageHero>

      <Section compact>
        <Container className="grid gap-6 md:grid-cols-[minmax(0,1fr)_340px] md:items-start">
          <div aria-live="polite" className="min-w-0">
            {shown?.status === "found" ? (
              <Card className="flex flex-col gap-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted">{t("arrival")}</p>
                    <p className="font-display text-[44px] leading-tight font-bold">
                      <DateTime value={shown.parcel.etaUtc} style="time" />
                    </p>
                  </div>
                  <Badge
                    tone={shown.parcel.currentStep === "delivered" ? "success" : "info"}
                    icon="truck"
                  >
                    {t(`steps.${shown.parcel.currentStep}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted">
                  {t("route", {
                    from: shown.parcel.fromCity ?? p("cityFrom"),
                    to: shown.parcel.toCity ?? p("cityTo"),
                  })}
                </p>
                <hr className="border-line" />
                <Timeline aria-label={t("historyLabel")}>
                  {[...shown.parcel.history].reverse().map((entry, index) => (
                    <TimelineItem
                      key={entry.step}
                      state={index === 0 && entry.step !== "delivered" ? "current" : "done"}
                    >
                      <b className="font-semibold">{t(`steps.${entry.step}`)}</b>
                      <br />
                      <span className="text-muted">
                        <DateTime value={entry.atUtc} />
                      </span>
                    </TimelineItem>
                  ))}
                </Timeline>
              </Card>
            ) : shown?.status === "not-found" ? (
              <Alert tone="warning">
                <b>{t("notFound.title")}</b>
                <br />
                {t("notFound.text")}
              </Alert>
            ) : loading && !fieldInvalid ? (
              <Card className="flex items-center gap-3 text-muted">
                <Icon name="ref" />
                {t("searching")}
              </Card>
            ) : (
              <Card className="flex items-start gap-3">
                <Icon name="box" size="lg" className="text-orange-dark" />
                <div>
                  <h2 className="text-h4">{t("empty.title")}</h2>
                  <p className="text-sm text-muted">{t("empty.text")}</p>
                </div>
              </Card>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <Card className="flex flex-col gap-2">
              <h2 className="text-h4">{t("yourParcel.title")}</h2>
              <p className="text-sm text-muted">{t("yourParcel.text")}</p>
            </Card>
            <Card tone="flat" className="flex flex-col items-start gap-2">
              <h2 className="text-h4">{t("problem.title")}</h2>
              <Button as={Link} href="/contact" variant="ghost">
                {t("problem.cta")}
              </Button>
            </Card>
          </aside>
        </Container>
      </Section>
    </>
  );
}
