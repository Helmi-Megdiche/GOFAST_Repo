"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate, type Locale } from "@fastgo/i18n";
import { Alert, Button, Card, CodeInput, Ltr } from "@fastgo/ui";
import { sendCode, verifyCode, type CodePurpose, type CodeTarget } from "@/lib/data/otp";
import { CODE_LENGTH, CODE_VALIDITY_MS } from "@/lib/order/constants";
import { useNow } from "@/components/order/use-now";

type Notice = { tone: "error" | "success" | "info"; text: string } | null;

/**
 * W20: one real code input (decision 14), masked target, resend timer, and every mock case: right,
 * wrong (attempts left), expired, locked, too many sends. Used by the order flow (CMD-03), sign-up,
 * password reset and Google. `onVerified` decides what happens next.
 */
export function CodeVerification({
  target,
  maskedTarget,
  purpose,
  onVerified,
  footer,
}: {
  target: CodeTarget;
  maskedTarget: string;
  purpose: CodePurpose;
  /** Called once the code is right. May return something to show instead of the form. */
  onVerified: () => Promise<ReactNode | void>;
  footer?: ReactNode;
}) {
  const t = useTranslations("auth.code");
  const locale = useLocale() as Locale;
  const current = useNow();
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [after, setAfter] = useState<ReactNode | null>(null);
  const sent = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const noticeId = useId();
  const time = (iso: string) => formatDate(iso, locale, "time");

  async function send(isResend: boolean) {
    const result = await sendCode(target, purpose);
    if (result.status === "sent") {
      setResendAt(Date.parse(result.resendAt));
      if (isResend) {
        setCode("");
        setNotice({ tone: "success", text: t("results.sent") });
      }
    } else if (result.status === "tooSoon") {
      // A code was sent a moment ago (e.g. the page was reloaded): it is still the valid one.
      setResendAt(Date.parse(result.resendAt));
      if (isResend) setNotice({ tone: "info", text: t("results.tooSoon") });
    } else if (result.status === "tooMany") {
      setNotice({ tone: "error", text: t("results.tooMany", { time: time(result.retryAt) }) });
    } else {
      setNotice({ tone: "error", text: t("results.invalidTarget") });
    }
  }

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void send(false);
    // Once per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (code.length !== CODE_LENGTH) {
      setNotice({ tone: "error", text: t("results.incomplete", { length: CODE_LENGTH }) });
      input.current?.focus();
      return;
    }
    setBusy(true);
    const result = await verifyCode(target, code, purpose);
    if (result.status === "ok") {
      setNotice(null);
      const shown = await onVerified();
      if (shown) setAfter(shown);
      setBusy(false);
      return;
    }
    setBusy(false);
    setCode("");
    input.current?.focus();
    if (result.status === "wrong")
      setNotice({ tone: "error", text: t("results.wrong", { count: result.attemptsLeft }) });
    else if (result.status === "expired") setNotice({ tone: "error", text: t("results.expired") });
    else if (result.status === "locked")
      setNotice({ tone: "error", text: t("results.locked", { time: time(result.retryAt) }) });
    else setNotice({ tone: "error", text: t("results.noCode") });
  }

  if (after) return <>{after}</>;

  const secondsLeft = resendAt == null ? null : Math.max(0, Math.ceil((resendAt - current) / 1000));

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="flex flex-col items-center gap-4 text-center"
    >
      <p className="text-sm text-muted">
        {t.rich(target.channel === "email" ? "sentToEmail" : "sentTo", {
          target: () => <Ltr>{maskedTarget}</Ltr>,
          minutes: CODE_VALIDITY_MS / 60_000,
        })}
      </p>
      {/* The input is named by aria-label; the notice below describes it (wrong, expired code...). */}
      <div className="flex w-full flex-col items-center">
        <CodeInput
          ref={input}
          length={CODE_LENGTH}
          value={code}
          onValueChange={setCode}
          invalid={notice?.tone === "error"}
          aria-label={t("label", { length: CODE_LENGTH })}
          aria-describedby={notice?.tone === "error" ? noticeId : undefined}
        />
      </div>
      <div id={noticeId} aria-live="polite" className="w-full">
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      </div>
      <Button type="submit" size="lg" fullWidth aria-disabled={busy || undefined}>
        {busy ? t("verifying") : t("verify")}
      </Button>
      <p className="text-sm text-muted">
        {t("notReceived")}{" "}
        {secondsLeft != null && secondsLeft > 0 ? (
          <span>{t("resendIn", { seconds: secondsLeft })}</span>
        ) : (
          <button
            type="button"
            className="font-semibold text-orange-dark underline"
            onClick={() => void send(true)}
          >
            {t("resend")}
          </button>
        )}
      </p>
      {footer}
    </form>
  );
}

/** "Ce numéro a déjà un compte": shown only after the right code (no enumeration). */
export function AccountExists({ signInHref }: { signInHref: string }) {
  const t = useTranslations("order.code.accountExists");
  return (
    <Card tone="flat" className="flex flex-col items-start gap-3 text-start">
      <h2 className="text-h4">{t("title")}</h2>
      <p className="text-sm">{t("text")}</p>
      <Button as="a" href={signInHref}>
        {t("signIn")}
      </Button>
    </Card>
  );
}
