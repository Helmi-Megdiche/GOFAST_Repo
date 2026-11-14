"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Checkbox, KeyValue, RadioCard } from "@fastgo/ui";
import { Money } from "@/components/money";
import { Link, useRouter } from "@/i18n/navigation";
import { isVerifiedPhoneForSession, returnBalanceMillimes } from "@/lib/data/accounts";
import { getQuote } from "@/lib/data/pricing";
import { canPayOnAccount, getSession } from "@/lib/data/session";
import { now } from "@/lib/order/clock";
import {
  NEW_ATTEMPT_FEE_MILLIMES,
  RETURN_FEE_MILLIMES,
  type PaymentCode,
  isQuoteValid,
  msLeft,
  proofFor,
  isSlotInFuture,
} from "@fastgo/domain";
import type { OrderDraft } from "@/lib/order/draft";
import { parseCount } from "@/lib/order/schemas";
import {
  draftPhoneProven,
  priceInputOf,
  STEP_PATHS,
  withNewQuote,
  type StepId,
} from "@/lib/order/steps";
import { clearRefusal, peekRefusal, resolveLostSubmit, submitOrder } from "@/lib/order/submit";
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
      {step.draft ? (
        <Review draft={step.draft} save={step.save} goTo={step.goTo} reload={step.reload} />
      ) : (
        <StepBusy />
      )}
    </div>
  );
}

type Problem = { kind: "error"; code: string } | { kind: "lost" } | null;

function Review({
  draft,
  save,
  goTo,
  reload,
}: { draft: OrderDraft } & Pick<ReturnType<typeof useOrderStep>, "save" | "goTo" | "reload">) {
  const t = useTranslations("order.review");
  const price = useTranslations("order.price");
  const o = useTranslations("offers");
  const addressT = useTranslations("order.address");
  const p = useTranslations("placeholders");
  const formErrors = useTranslations("forms.errors");
  const router = useRouter();
  const slotLabel = useSlotLabel();
  const current = useNow();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  // A refusal handed over by the code step (W20) is shown here, once.
  const [problem, setProblem] = useState<Problem>(() => {
    if (draft.pendingSubmit) return { kind: "lost" };
    const refusal = peekRefusal();
    return refusal ? { kind: "error", code: refusal } : null;
  });
  useEffect(() => clearRefusal(), []);
  const [fieldErrors, setFieldErrors] = useState<{
    payment?: string;
    terms?: string;
    freight?: string;
  }>({});
  // Moved once the new errors (or the accepted price) are on screen, so they are read with the control.
  const [focusTarget, setFocusTarget] = useState<{ selector: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (focusTarget) document.querySelector<HTMLElement>(focusTarget.selector)?.focus();
  }, [focusTarget]);
  const recalculating = useRef(false);

  const session = getSession();
  const allowAccount = canPayOnAccount(session);
  // R605: what the account owes for returned parcels, shown before it blocks the order.
  const returnBalance = returnBalanceMillimes(session?.accountId ?? null);
  // "Compte client" chosen before a sign-out (or by another account) is not offered any more.
  const accountRefused = draft.payment === "account" && !allowAccount;
  useEffect(() => {
    if (accountRefused) save((latest) => ({ ...latest, payment: null }));
  }, [accountRefused, save]);
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
    declaredValueMillimes: draft.parcel.declaredValueMillimes ?? null,
  });

  // R205: at expiry, recalculate and ask the customer to validate the new price. The input is
  // rebuilt from the draft: a stale quote input would be refused again and again.
  async function recalculate() {
    const input = priceInputOf(draft);
    if (!input || recalculating.current) return;
    recalculating.current = true;
    const result = await getQuote(
      input,
      draft.sender.address.zone,
      draft.recipient.address.zone,
      now(),
    );
    recalculating.current = false;
    setAnnouncement("");
    if (result.status !== "ok") {
      goTo("outOfZone");
      return;
    }
    save((latest) => withNewQuote(latest, result.quote));
  }

  const left = quote ? msLeft(quote, current) : 0;
  const expired = quote != null && accepted && left === 0;
  useEffect(() => {
    if (expired && !locked) void recalculate();
    // recalculate reads the latest draft through save(); run it once per expiry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, locked]);

  async function onValidate() {
    if (busyRef.current || locked) return; // double click: one order attempt at a time (R202)
    const errors: { payment?: string; terms?: string; freight?: string } = {};
    if (!draft.payment || accountRefused) errors.payment = "paymentRequired";
    // R607: paying on delivery means accepting that the freight and the return are the sender's if refused.
    if (draft.payment === "cashDelivery" && draft.freightPayerAccepted !== true)
      errors.freight = "freightPayerRequired";
    if (!draft.termsAccepted) errors.terms = "termsRequired";
    setFieldErrors(errors);
    if (errors.payment || errors.freight || errors.terms) {
      setFocusTarget({
        selector: errors.payment
          ? `#payment-${payments[0]}`
          : errors.freight
            ? "#order-freight"
            : "#order-terms",
      });
      return;
    }
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
    if (!draftPhoneProven(draft) && !isVerifiedPhoneForSession(draft.sender.phone)) {
      goTo("code");
      return;
    }
    await send();
  }

  async function send() {
    busyRef.current = true;
    setBusy(true);
    setProblem(null);
    const result = await submitOrder(draft);
    busyRef.current = false;
    setBusy(false);
    if (result.status === "created") {
      markStepChange();
      router.push(`/commander/confirmation?n=${result.code}`);
    } else if (result.status === "lost") {
      setProblem({ kind: "lost" });
    } else if (result.status === "refused") {
      // The verified code ran out (CODE_VERIFIED_WINDOW_MS): submitOrder forgot it, ask for a new one.
      if (result.error === "phoneNotVerified") {
        goTo("code");
        return;
      }
      if (result.error === "quoteExpired") await recalculate();
      setProblem({ kind: "error", code: result.error });
    } else if (result.status === "changed") {
      // Another tab changed the order: show what is saved (the step guard may send it to W14).
      setProblem({ kind: "error", code: "draftChanged" });
      reload();
    } else {
      goTo("sender");
    }
  }

  async function onRetry() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const result = await submitOrder(draft);
    busyRef.current = false;
    setBusy(false);
    if (result.status === "created") {
      markStepChange();
      router.push(`/commander/confirmation?n=${result.code}`);
      return;
    }
    if (result.status === "lost") return;
    if (result.status === "changed") {
      reload();
      return;
    }
    // The answer came back as a refusal: a new key is allowed only once no order exists for the old one.
    const resolved = await resolveLostSubmit(draft);
    if ("code" in resolved) {
      markStepChange();
      router.push(`/commander/confirmation?n=${resolved.code}`);
      return;
    }
    // The verified code ran out while the answer was missing: a new code, then the new key is sent.
    if (result.status === "refused" && result.error === "phoneNotVerified") {
      goTo("code");
      return;
    }
    reload(); // the draft now has a new key and no pending answer
    setProblem(result.status === "refused" ? { kind: "error", code: result.error } : null);
  }

  const editLink = (target: StepId, section: string) =>
    locked ? null : (
      <Link
        href={STEP_PATHS[target]}
        onClick={() => markStepChange()}
        // Starts with the visible "Modifier" (label in name), then says which section.
        aria-label={t("editSection", { section })}
        className="text-sm font-semibold text-orange-dark"
      >
        {t("edit")}
      </Link>
    );

  // A pin stores no text: its label is shown in the current language (final review I3).
  const addressText = (address: OrderDraft["sender"]["address"]) =>
    address.pin && address.text === "" ? addressT("pinText") : address.text;
  const count = parseCount(draft.parcel.count) ?? 1;
  // W15 mockup: "Standard, avant 19 h". The cut-off hour is not sourced yet: [HEURE].
  const service = draft.service.code;
  const serviceLine = !service
    ? null
    : service === "express"
      ? t("serviceLines.express", { service: o("express.name") })
      : service === "standard"
        ? t("serviceLines.standard", { service: o("standard.name"), time: p("time") })
        : draft.service.slot
          ? t("serviceLines.scheduled", {
              service: o("scheduled.name"),
              slot: slotLabel(draft.service.slot),
            })
          : o("scheduled.name");
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
              <dd className="text-muted">{serviceLine}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("parcel")}</dt>
              <dd>
                {t("parcelSummary", {
                  count,
                  type: draft.parcel.type ?? "none",
                  weight: draft.parcel.weights.slice(0, count).join(" + "),
                  packaging: draft.parcel.packaging ? "yes" : "no",
                  fragile: draft.parcel.fragile ? "yes" : "no",
                })}
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
              id={`payment-${code}`}
              name="payment"
              value={code}
              checked={!accountRefused && draft.payment === code}
              onChange={() => {
                setFieldErrors((errors) => ({ ...errors, payment: undefined, freight: undefined }));
                // Each way of paying is accepted on its own: a box ticked for port dû does not carry over.
                save((latest) => ({ ...latest, payment: code, freightPayerAccepted: false }));
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

        {draft.payment === "cashDelivery" && quote ? (
          <Checkbox
            id="order-freight"
            checked={draft.freightPayerAccepted === true}
            disabled={locked}
            error={
              fieldErrors.freight
                ? formErrors(fieldErrors.freight as "freightPayerRequired")
                : undefined
            }
            onChange={(event) => {
              const checked = event.target.checked;
              setFieldErrors((errors) => ({ ...errors, freight: undefined }));
              save((latest) => ({ ...latest, freightPayerAccepted: checked }));
            }}
            label={t.rich("freight.accept", {
              freight: () => <Money millimes={quote.totalMillimes} />,
              fee: () => <Money millimes={RETURN_FEE_MILLIMES} />,
            })}
          />
        ) : null}

        {returnBalance > 0 ? (
          <Alert tone="warning">
            <div className="flex flex-col gap-1">
              <b>{t("returnBalance.title")}</b>
              <span>
                {t.rich("returnBalance.text", { amount: () => <Money millimes={returnBalance} /> })}
              </span>
            </div>
          </Alert>
        ) : null}

        <Card as="section" aria-labelledby="attempts-title" className="flex flex-col gap-3">
          <h2 id="attempts-title" className="text-h4">
            {t("attempts.title")}
          </h2>
          <KeyValue
            items={[
              {
                term: t("attempts.newAttempt"),
                value:
                  NEW_ATTEMPT_FEE_MILLIMES === 0 ? (
                    t("attempts.free")
                  ) : (
                    <Money millimes={NEW_ATTEMPT_FEE_MILLIMES} />
                  ),
              },
              { term: t("attempts.return"), value: <Money millimes={RETURN_FEE_MILLIMES} /> },
            ]}
          />
        </Card>
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
                        draft.previousTotalMillimes != null ? (
                          <Money millimes={draft.previousTotalMillimes} />
                        ) : (
                          p("price")
                        ),
                    })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      setProblem(null);
                      save((latest) => ({ ...latest, acceptedQuoteId: latest.quote?.id ?? null }));
                      // The alert and its button go away: the focus goes to the next action.
                      setAnnouncement(price("expired.accepted"));
                      setFocusTarget({ selector: "#order-submit" });
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
            id="order-submit"
            size="lg"
            fullWidth
            aria-disabled={busy || !accepted || undefined}
            onClick={() => void onValidate()}
          >
            {busy ? t("submitting") : t("submit")}
          </Button>
        )}
        <p className="sr-only" role="status">
          {announcement}
        </p>
        {!draftPhoneProven(draft) && !isVerifiedPhoneForSession(draft.sender.phone) ? (
          <p className="text-2xs text-muted">{t("phoneCheckNote")}</p>
        ) : null}
      </Card>
    </div>
  );
}
