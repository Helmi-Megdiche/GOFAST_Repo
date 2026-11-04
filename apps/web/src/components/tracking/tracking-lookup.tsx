"use client";

import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
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
import { Link } from "@/i18n/navigation";
import { FOUND_TRACKING_CODE } from "@/lib/data/fixtures/tracking";
import { lookupTracking, type PublicParcel, type TrackingResult } from "@/lib/data/tracking";
import { trackingFormSchema, type TrackingFormValues } from "@/lib/forms/schemas";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { normalizeTrackingCode } from "@/lib/tracking-code";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; parcel: PublicParcel }
  | { kind: "not-found" }
  | { kind: "invalid" };

function toState(result: TrackingResult): State {
  if (result.status === "found") return { kind: "found", parcel: result.parcel };
  if (result.status === "not-found") return { kind: "not-found" };
  return { kind: "invalid" };
}

/** Public tracking (SUI-01): a form, then status, estimated time and history. No personal data. */
export function TrackingLookup() {
  const initialCode = useSearchParams().get("n") ?? "";
  const t = useTranslations("tracking");
  const p = useTranslations("placeholders");
  const message = useErrorMessage();
  const inputId = useId();
  const [state, setState] = useState<State>(initialCode ? { kind: "loading" } : { kind: "idle" });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TrackingFormValues>({
    resolver: zodResolver(trackingFormSchema),
    defaultValues: { code: initialCode },
  });

  // A link such as /suivi?n=FG-7K4M-2QXP looks the parcel up as soon as the page opens.
  useEffect(() => {
    if (!initialCode) return;
    let cancelled = false;
    void lookupTracking(initialCode).then((result) => {
      if (!cancelled) setState(toState(result));
    });
    return () => {
      cancelled = true;
    };
  }, [initialCode]);

  const onSubmit = handleSubmit(
    async ({ code }) => {
      setState({ kind: "loading" });
      setState(toState(await lookupTracking(normalizeTrackingCode(code))));
    },
    // A badly formed number clears the previous answer: it must not look like its result.
    () => setState({ kind: "idle" }),
  );

  const loading = state.kind === "loading";
  const fieldError = errors.code
    ? message(errors.code.message)
    : state.kind === "invalid"
      ? message("trackingInvalid")
      : undefined;

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
            <Button type="submit" disabled={loading}>
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
            {state.kind === "found" ? (
              <Card className="flex flex-col gap-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted">{t("arrival")}</p>
                    <p className="font-display text-[44px] leading-tight font-bold">
                      <DateTime value={state.parcel.etaUtc} style="time" />
                    </p>
                  </div>
                  <Badge
                    tone={state.parcel.currentStep === "delivered" ? "success" : "info"}
                    icon="truck"
                  >
                    {t(`steps.${state.parcel.currentStep}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted">
                  {t("route", {
                    from: state.parcel.fromCity ?? p("cityFrom"),
                    to: state.parcel.toCity ?? p("cityTo"),
                  })}
                </p>
                <hr className="border-line" />
                <Timeline aria-label={t("historyLabel")}>
                  {[...state.parcel.history].reverse().map((entry, index) => (
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
            ) : state.kind === "not-found" ? (
              <Alert tone="warning">
                <b>{t("notFound.title")}</b>
                <br />
                {t("notFound.text")}
              </Alert>
            ) : state.kind === "loading" ? (
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
