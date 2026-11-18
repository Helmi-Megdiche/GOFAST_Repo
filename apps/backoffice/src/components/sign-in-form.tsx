"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button, CodeInput, Field, Input } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { signInStaff } from "@/lib/api";
import { staffSignInSchema, type FormErrorCode, type StaffSignInValues } from "@/lib/forms";
import { afterSignInPath, guardDecision } from "@/lib/guard";
import { outcomeOf } from "@/lib/sign-in";
import { isBackofficeRole } from "@fastgo/domain";
import { useSession } from "./session";

type Notice = { kind: "invalid" } | { kind: "unavailable" } | { kind: "refused" } | { kind: "wait"; until: number } | null;

/**
 * A00. E-mail or phone, password, and the 6 digits of the authenticator app. One neutral message for every refusal (the API gives the same
 * 401 for a wrong password, a wrong code, a customer, an account with no second factor): it never says which part was wrong. A staff session
 * that already exists sends the person to their landing page.
 */
export function SignInForm() {
  const t = useTranslations("backoffice.signIn");
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const { client, state, setMe, signOut } = useSession();
  const [notice, setNotice] = useState<Notice>(params.get("refused") === "1" ? { kind: "refused" } : null);
  const [now, setNow] = useState(() => Date.now());
  const alertRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const last = useRef<StaffSignInValues | null>(null);
  const { register, handleSubmit, control, setValue, setError, formState } = useForm<StaffSignInValues>({
    resolver: zodResolver(staffSignInSchema),
    defaultValues: { identifier: "", password: "", code: "" },
  });
  const { errors, isSubmitting } = formState;
  const message = (code: string | undefined) => (code ? t(`errors.${code as FormErrorCode}`) : undefined);

  // Already signed in as staff with a back-office role: no form, the landing page.
  useEffect(() => {
    if (state.phase !== "ready" || !state.me) return;
    const decision = guardDecision(state.me, { kind: "landing" });
    if (decision.action === "landing" && isBackofficeRole(state.me.role)) router.replace(afterSignInPath(state.me.role, next));
  }, [state, router, next]);

  const waitUntil = notice?.kind === "wait" ? notice.until : null;
  useEffect(() => {
    if (waitUntil === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waitUntil]);
  useEffect(() => {
    if (notice) alertRef.current?.focus();
  }, [notice]);

  async function submit(values: StaffSignInValues) {
    if (busy.current) return;
    busy.current = true;
    last.current = values;
    try {
      const outcome = outcomeOf(await signInStaff(client, values));
      if (outcome.kind === "ok") {
        const decision = guardDecision(outcome.me, { kind: "landing" });
        if (decision.action === "refuse") {
          // Never keep a session that is not a back-office one: close it, and say so neutrally.
          await signOut();
          setNotice({ kind: "refused" });
          return;
        }
        setMe(outcome.me);
        if (decision.action === "landing" && isBackofficeRole(outcome.me.role)) router.replace(afterSignInPath(outcome.me.role, next));
        else router.replace("/sans-role");
        return;
      }
      // A code is single use: whatever the refusal, the next try needs a new one.
      setValue("code", "");
      if (outcome.kind === "fields") {
        const codes = { identifier: "identifierRequired", password: "passwordRequired", code: "codeInvalid" } as const;
        for (const field of outcome.fields) setError(field, { message: codes[field] });
      } else if (outcome.kind === "wait") {
        setNow(Date.now());
        setNotice({ kind: "wait", until: Date.now() + outcome.seconds * 1000 });
      } else setNotice({ kind: outcome.kind });
    } finally {
      busy.current = false;
    }
  }

  const remaining = notice?.kind === "wait" ? Math.max(0, Math.ceil((notice.until - now) / 1000)) : 0;
  const showWait = notice?.kind === "wait" && remaining > 0;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        setNotice(null);
        void handleSubmit(submit)(event);
      }}
      className="flex flex-col gap-4"
    >
      <h1 className="text-d3">{t("title")}</h1>
      <div ref={alertRef} tabIndex={-1} className="outline-none">
        {notice?.kind === "invalid" ? <Alert tone="error">{t("errors.invalid")}</Alert> : null}
        {notice?.kind === "refused" ? <Alert tone="error">{t("errors.refused")}</Alert> : null}
        {showWait ? <Alert tone="error">{t("errors.wait", { seconds: remaining })}</Alert> : null}
        {notice?.kind === "unavailable" ? (
          <Alert tone="error">
            <p>{t("errors.unavailable")}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => {
                setNotice(null);
                if (last.current) void submit(last.current);
              }}
            >
              {t("errors.retry")}
            </Button>
          </Alert>
        ) : null}
      </div>
      <Field label={t("identifier")} error={message(errors.identifier?.message)}>
        <Input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} {...register("identifier")} />
      </Field>
      <Field label={t("password")} error={message(errors.password?.message)}>
        <Input type="password" autoComplete="current-password" {...register("password")} />
      </Field>
      <Controller
        control={control}
        name="code"
        render={({ field }) => (
          <Field label={t("code")} hint={t("codeHint")} error={message(errors.code?.message)}>
            <CodeInput length={6} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} name={field.name} invalid={Boolean(errors.code)} />
          </Field>
        )}
      />
      <Button type="submit" size="lg" aria-disabled={isSubmitting || undefined} className="w-full">
        {isSubmitting ? t("busy") : t("submit")}
      </Button>
      <p className="text-center text-xs text-muted">{t("notice")}</p>
    </form>
  );
}
