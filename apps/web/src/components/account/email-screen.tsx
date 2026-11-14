"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Field, Input, Ltr } from "@fastgo/ui";
import { CodeVerification } from "@/components/auth/code-verification";
import { Link } from "@/i18n/navigation";
import { attachEmail, getProfile } from "@/lib/data/profile";
import type { Session } from "@/lib/data/session";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { maskEmail } from "@fastgo/domain";
import { useLoader } from "./use-loader";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The e-mail screen (ESP-01, R101, R102): add or change the e-mail of the account. A code is sent
 * to the typed address and checked (the same limits as every code); only then is the e-mail
 * attached. The first step answers the same whether or not the address has an account: "already
 * used" appears only after the right code.
 */
export function EmailScreen() {
  const t = useTranslations("emailScreen");
  const { state, reload } = useLoader(
    (session) => getProfile(session).then((profile) => ({ session, profile })),
    "email",
  );
  if (state.status === "loading") {
    return (
      <p aria-busy="true" className="text-muted">
        {t("loading")}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <Alert tone="error">
        <span className="flex flex-col items-start gap-2">
          {t("network")}
          <Button size="sm" variant="secondary" onClick={reload}>
            {t("send")}
          </Button>
        </span>
      </Alert>
    );
  }
  return <Steps session={state.data.session} current={state.data.profile.email} />;
}

type Outcome = "done" | "taken" | "notVerified" | "network" | null;

function Steps({ session, current }: { session: Session; current: string | null }) {
  const t = useTranslations("emailScreen");
  const message = useErrorMessage();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  // The address a code was sent to; null while the person is still typing it.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const input = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outcome) result.current?.focus();
  }, [outcome]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setError("emailInvalid");
      input.current?.focus();
      return;
    }
    setError(undefined);
    setOutcome(null);
    setSentTo(email.trim().toLowerCase());
  }

  if (outcome === "done") {
    return (
      <div ref={result} tabIndex={-1} className="flex flex-col items-start gap-3 outline-none">
        <Alert tone="success">{t("done")}</Alert>
        <Button as={Link} href="/compte/profil">
          {t("back")}
        </Button>
      </div>
    );
  }

  if (sentTo) {
    return (
      <Card className="flex max-w-md flex-col gap-4">
        {outcome ? (
          <div ref={result} tabIndex={-1} className="outline-none">
            <Alert tone="error">
              {outcome === "taken"
                ? t("taken")
                : outcome === "notVerified"
                  ? t("notVerified")
                  : t("network")}
            </Alert>
          </div>
        ) : null}
        {outcome !== "taken" ? (
          <CodeVerification
            key={sentTo}
            target={{ channel: "email", value: sentTo }}
            maskedTarget={maskEmail(sentTo)}
            purpose="emailConfirm"
            onVerified={async () => {
              try {
                const attached = await attachEmail(session, sentTo);
                if (attached.status === "attached") setOutcome("done");
                else if (attached.status === "emailTaken") setOutcome("taken");
                else setOutcome("notVerified");
              } catch {
                setOutcome("network");
              }
            }}
          />
        ) : null}
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => {
            setSentTo(null);
            setOutcome(null);
          }}
        >
          {t("change")}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex max-w-md flex-col gap-4">
      <p className="text-sm text-muted">{t("intro")}</p>
      {current ? (
        <p className="text-sm">{t.rich("current", { email: () => <Ltr>{current}</Ltr> })}</p>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={t("field")} error={message(error)} required>
          <Input
            ref={input}
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Button type="submit" className="self-start">
          {t("send")}
        </Button>
      </form>
    </Card>
  );
}
