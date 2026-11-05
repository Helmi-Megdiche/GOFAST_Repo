"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@fastgo/i18n";
import { Alert, Button, Card, Checkbox, RadioCard } from "@fastgo/ui";
import { Money } from "@/components/money";
import { Link, useRouter } from "@/i18n/navigation";
import { isVerifiedPhoneForSession } from "@/lib/data/accounts";
import { getQuote } from "@/lib/data/pricing";
import { canPayOnAccount, getSession } from "@/lib/data/session";
import { now } from "@/lib/order/clock";
import type { OrderDraft, PaymentCode } from "@/lib/order/draft";
import { parseMillimes } from "@/lib/order/money-input";
import { isQuoteValid, msLeft } from "@/lib/order/pricing";
import { proofFor } from "@/lib/order/proof";
import { parseCount } from "@/lib/order/schemas";
import { isSlotInFuture } from "@/lib/order/slots";
import { draftPhoneVerified, STEP_PATHS, type StepId } from "@/lib/order/steps";
import { resolveLostSubmit, submitOrder } from "@/lib/order/submit";
import { StepBusy } from "./busy";
import { PriceLines } from "./price-aside";
import { useSlotLabel } from "./slot-label";
import { markStepChange } from "./step-heading";
import { useNow } from "./use-now";
import { useOrderStep } from "./use-order-step";

/** W15: check everything, choose how to pay, accept the CGV, validate (CMD-04, CMD-05). */
export function ReviewStep({ heading }: { heading: ReactNode }) {
  const step = useOrderStep("review");
  return (
    <div className="flex flex-col gap-4">
      {heading}
      {step.draft ? <Review draft={step.draft} save={step.save} goTo={step.goTo} /> : <StepBusy />}
    </div>
  );
}

type Problem = { kind: "error"; code: string } | { kind: "lost" } | null;

function Review({
  draft,
  save,
  goTo,
}: { draft: OrderDraft } & Pick<ReturnType<typeof useOrderStep>, "save" | "goTo">) {
  const t = useTranslations("order.review");
  const price = useTranslations("order.price");
  const o = useTranslations("offers");
  const parcelT = useTranslations("order.parcel");
  const addressT = useTranslations("order.address");
  const p = useTranslations("placeholders");
  const formErrors = useTranslations("forms.errors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const slotLabel = useSlotLabel();
  const current = useNow();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(draft.pendingSubmit ? { kind: "lost" } : null);
  const [fieldErrors, setFieldErrors] = useState<{ payment?: string; terms?: string }>({});
  const [previousTotal, setPreviousTotal] = useState<number | null>(null);
  const recalculating = useRef(false);

  const session = getSession();
  const allowAccount = canPayOnAccount(session);
  const payments: PaymentCode[] = allowAccount
    ? ["cashPickup", "cashDelivery", "account"]
    : ["cashPickup", "cashDelivery"];
  const quote = draft.quote;
  const accepted = quote != null && draft.acceptedQuoteId === quote.id;
  const locked = problem?.kind === "lost" || busy;
  const proof = proofFor({
    fragile: draft.parcel.fragile,
    // The order form has no COD amount yet: no parcel is treated as COD (answer to question 2).
    cod: false,
    declaredValueMillimes: (() => {
      const parsed = parseMillimes(draft.parcel.declaredValue, locale);
      return parsed.ok ? parsed.millimes : null;
    })(),
  });

  // R205: at expiry, recalculate and ask the customer to validate the new price.
  async function recalculate() {
    if (!quote || recalculating.current) return;
    recalculating.current = true;
    const result = await getQuote(
      {
        service: quote.input.service,
        parcelType: quote.input.parcelType,
        weightKg: quote.input.weightKg,
        fragile: quote.input.fragile,
      },
      draft.sender.address.zone,
      draft.recipient.address.zone,
      now(),
    );
    recalculating.current = false;
    if (result.status !== "ok") {
      goTo("outOfZone");
      return;
    }
    setPreviousTotal(quote.totalMillimes);
    save((latest) => ({ ...latest, quote: result.quote }));
  }

  const left = quote ? msLeft(quote, current) : 0;
  const expired = quote != null && accepted && left === 0;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- R205: expiry is an outside event (the clock)
    if (expired && !locked) void recalculate();
    // recalculate reads the latest draft through save(); run it once per expiry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, locked]);

  async function onValidate() {
    if (busyRef.current || locked) return; // double click: one order attempt at a time (R202)
    const errors: { payment?: string; terms?: string } = {};
    if (!draft.payment) errors.payment = "paymentRequired";
    if (!draft.termsAccepted) errors.terms = "termsRequired";
    setFieldErrors(errors);
    if (errors.payment || errors.terms) return;
    if (!isQuoteValid(quote, now())) {
      await recalculate();
      return;
    }
    if (!accepted) {
      setProblem({ kind: "error", code: "quoteNotAccepted" });
      return;
    }
    if (!isSlotInFuture(draft.sender.slot, now())) {
      setProblem({ kind: "error", code: "slotPast" });
      return;
    }
    // CMD-03: without a verified phone, the code step comes first (it creates the light account).
    if (!draftPhoneVerified(draft) && !isVerifiedPhoneForSession(draft.sender.phone)) {
      goTo("code");
      return;
    }
    await send();
  }

  async function send() {
    busyRef.current = true;
    setBusy(true);
    setProblem(null);
    const result = await submitOrder(draft, locale);
    busyRef.current = false;
    setBusy(false);
    if (result.status === "created") {
      markStepChange();
      router.push(`/commander/confirmation?n=${result.code}`);
    } else if (result.status === "lost") {
      setProblem({ kind: "lost" });
    } else if (result.status === "refused") {
      if (result.error === "quoteExpired") await recalculate();
      setProblem({ kind: "error", code: result.error });
    } else {
      goTo("sender");
    }
  }

  async function onRetry() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const result = await submitOrder(draft, locale);
    busyRef.current = false;
    setBusy(false);
    if (result.status === "created") {
      markStepChange();
      router.push(`/commander/confirmation?n=${result.code}`);
      return;
    }
    if (result.status === "lost") return;
    // The answer came back as a refusal: a new key is allowed only once no order exists for the old one.
    const resolved = await resolveLostSubmit(draft);
    if ("code" in resolved) {
      router.push(`/commander/confirmation?n=${resolved.code}`);
      return;
    }
    save(() => resolved.draft);
    setProblem(result.status === "refused" ? { kind: "error", code: result.error } : null);
  }

  const editLink = (target: StepId, section: string) =>
    locked ? null : (
      <Link
        href={STEP_PATHS[target]}
        onClick={() => markStepChange()}
        className="text-sm font-semibold text-orange-dark"
      >
        {t("edit")}
        <span className="sr-only"> : {section}</span>
      </Link>
    );

  const addressText = (address: OrderDraft["sender"]["address"]) =>
    address.text || addressT("pinText");
  const count = parseCount(draft.parcel.count) ?? 1;
  const minutesLeft = Math.ceil(left / 60_000);
  const clock = `${String(Math.floor(left / 60_000)).padStart(2, "0")}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-h4">{t("delivery")}</h2>
            {editLink("sender", t("delivery"))}
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">{t("pickup")}</dt>
              <dd>
                {t("person", {
                  name: draft.sender.name,
                  address: addressText(draft.sender.address),
                })}
              </dd>
              <dd className="text-muted">
                {draft.sender.slot ? slotLabel(draft.sender.slot) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("dropoff")}</dt>
              <dd>
                {t("person", {
                  name: draft.recipient.name,
                  address: addressText(draft.recipient.address),
                })}
              </dd>
              <dd className="text-muted">
                {draft.service.code ? o(`${draft.service.code}.name`) : null}
                {draft.service.code === "scheduled" && draft.service.slot
                  ? `, ${slotLabel(draft.service.slot)}`
                  : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("parcel")}</dt>
              <dd>
                {t("parcelSummary", {
                  count,
                  type: draft.parcel.type ? parcelT(`types.${draft.parcel.type}.name`) : "",
                  weight: draft.parcel.weightKg,
                })}
                {draft.parcel.fragile ? `, ${t("fragile")}` : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("proof")}</dt>
              <dd>{t(`proofs.${proof.rule}`)}</dd>
            </div>
          </dl>
        </Card>

        <fieldset
          className="flex flex-col gap-2"
          disabled={locked}
          aria-describedby={fieldErrors.payment ? "payment-error" : undefined}
        >
          <legend className="text-h4 pb-2">{t("paymentLegend")}</legend>
          {payments.map((code) => (
            <RadioCard
              key={code}
              name="payment"
              value={code}
              checked={draft.payment === code}
              onChange={() => {
                setFieldErrors((errors) => ({ ...errors, payment: undefined }));
                save((latest) => ({ ...latest, payment: code }));
              }}
              title={t(`payments.${code}.title`)}
              description={t(`payments.${code}.text`)}
            />
          ))}
          {fieldErrors.payment ? (
            <p id="payment-error" className="text-2xs font-medium text-danger">
              {formErrors(fieldErrors.payment as "paymentRequired")}
            </p>
          ) : null}
        </fieldset>
      </div>

      <Card
        as="aside"
        aria-labelledby="price-detail"
        className="flex flex-col gap-4 md:sticky md:top-4"
      >
        <h2 id="price-detail" className="text-h4">
          {price("detail")}
        </h2>
        {quote ? (
          <>
            <PriceLines quote={quote} serviceName={o(`${quote.input.service}.name`)} />
            <hr className="border-line" />
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{price("total")}</span>
              <span className="font-display text-[30px] leading-tight font-bold">
                <Money millimes={quote.totalMillimes} />
              </span>
            </div>
            {accepted ? (
              <p className="text-2xs text-muted">
                <span role="timer" aria-live="off">
                  {price("timeLeft", { time: clock })}
                </span>{" "}
                {price("example")}
                {/* Announced at a few thresholds only, not every second. */}
                <span className="sr-only" role="status">
                  {minutesLeft === 5 || minutesLeft === 1
                    ? price("timeLeftShort", { minutes: minutesLeft })
                    : ""}
                </span>
              </p>
            ) : (
              <Alert tone="warning">
                <div className="flex flex-col gap-2">
                  <b>{price("expired.title")}</b>
                  <span>
                    {price.rich("expired.text", {
                      next: () => <Money millimes={quote.totalMillimes} />,
                      previous: () =>
                        previousTotal != null ? <Money millimes={previousTotal} /> : p("price"),
                    })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      setProblem(null);
                      save((latest) => ({ ...latest, acceptedQuoteId: latest.quote?.id ?? null }));
                    }}
                  >
                    {price("expired.accept")}
                  </Button>
                </div>
              </Alert>
            )}
          </>
        ) : null}

        <Checkbox
          id="order-terms"
          checked={draft.termsAccepted}
          disabled={locked}
          error={fieldErrors.terms ? formErrors(fieldErrors.terms as "termsRequired") : undefined}
          onChange={(event) => {
            const checked = event.target.checked;
            setFieldErrors((errors) => ({ ...errors, terms: undefined }));
            save((latest) => ({ ...latest, termsAccepted: checked }));
          }}
          label={t.rich("terms", {
            link: (chunks) => (
              <Link
                href="/legal/cgv"
                target="_blank"
                className="font-semibold text-orange-dark underline"
              >
                {chunks}
              </Link>
            ),
          })}
        />

        {problem?.kind === "error" ? (
          <Alert tone="error">{t(`errors.${problem.code}` as "errors.network")}</Alert>
        ) : null}

        {problem?.kind === "lost" ? (
          <Alert tone="warning">
            <div className="flex flex-col gap-2">
              <b>{t("lost.title")}</b>
              <span>{t("lost.text")}</span>
              <span className="text-2xs">{t("lost.editBlocked")}</span>
            </div>
          </Alert>
        ) : null}

        {problem?.kind === "lost" ? (
          <Button
            size="lg"
            fullWidth
            aria-disabled={busy || undefined}
            onClick={() => void onRetry()}
          >
            {busy ? t("submitting") : t("lost.retry")}
          </Button>
        ) : (
          <Button
            size="lg"
            fullWidth
            aria-disabled={busy || !accepted || undefined}
            onClick={() => void onValidate()}
          >
            {busy ? t("submitting") : t("submit")}
          </Button>
        )}
        {!draftPhoneVerified(draft) ? (
          <p className="text-2xs text-muted">{t("phoneCheckNote")}</p>
        ) : null}
      </Card>
    </div>
  );
}
