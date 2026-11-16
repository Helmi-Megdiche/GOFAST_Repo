"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Input } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { sharedAuthPort } from "@/lib/data";
import { useNow } from "@/components/order/use-now";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { currentFlow, endFlow } from "@/lib/auth/flow";
import { withNext } from "@/lib/auth/next";
import { PASSWORD_MIN_LENGTH } from "@fastgo/domain";
import { newPasswordSchema } from "@/lib/order/schemas";

/** New password after W21 and W20. Proposed step: it is not in the mockup (decision 16). */
export function NewPasswordForm({ next }: { next: string | null }) {
  const t = useTranslations("auth.newPassword");
  const s = useTranslations("auth.signUp");
  const n = useTranslations("auth.notices");
  const [notice, setNotice] = useState<"unavailable" | "maybeChanged" | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const now = useNow();
  const message = useErrorMessage();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const { register, handleSubmit, setError, formState } = useForm<{ password: string }>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "" },
  });

  useEffect(() => {
    if (currentFlow()?.kind !== "reset") router.replace(withNext("/mot-de-passe", next));
  }, [router, next]);

  // The proof is spent by the first call, so a second one (a double click arrives before the
  // re-render) would be refused and send the person back to the start after a success. A ref, not
  // isSubmitting. It stays locked after a success and after a refusal that leaves the page.
  const busy = useRef(false);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    await handleSubmit(submitValues)(event);
  }
  const submitValues = async (values: { password: string }) => {
    const flow = currentFlow();
    if (flow?.kind !== "reset" || busy.current) return;
    busy.current = true;
    setNotice(null);
    let result;
    try {
      result = await sharedAuthPort().resetPassword(flow.phone, flow.phoneCheckId, values.password);
    } catch (error) {
      busy.current = false;
      throw error;
    }
    if (result.status === "wait") {
      setWaitUntil(Date.parse(result.retryAt));
    } else if (result.status === "unavailable") setNotice("unavailable");
    else if (result.status === "maybeChanged") setNotice("maybeChanged");
    else if (result.status === "tooShort") setError("password", { message: "passwordTooShort" });
    else if (result.status === "notVerified") {
      router.replace(withNext("/mot-de-passe", next));
      return;
    } else {
      endFlow();
      setDone(true);
      return;
    }
    busy.current = false; // a retry is allowed after wait, unavailable, maybeChanged, tooShort
  };

  return (
    <>
      <h1 className="text-d3">{t("title")}</h1>
      {done ? (
        <>
          <Alert tone="success">{t("done")}</Alert>
          <Button as={Link} href={withNext("/connexion", next)} size="lg" fullWidth>
            {t("signIn")}
          </Button>
        </>
      ) : (
        <form
          noValidate
          method="post"
          onSubmit={(event) => void onSubmit(event)}
          className="flex flex-col gap-4"
        >
          <Field
            label={t("password")}
            hint={s("passwordHint", { count: PASSWORD_MIN_LENGTH })}
            error={message(formState.errors.password?.message)}
            required
          >
            <Input {...register("password")} type="password" autoComplete="new-password" />
          </Field>
          <div aria-live="polite">
            {waitUntil != null && waitUntil > now ? (
              <Alert tone="error">
                {n("wait", { seconds: Math.ceil((waitUntil - now) / 1000) })}
              </Alert>
            ) : notice ? (
              <Alert tone="error">{n(notice)}</Alert>
            ) : null}
          </div>
          {notice === "maybeChanged" ? (
            <Button as={Link} href={withNext("/connexion", next)} variant="ghost">
              {t("signIn")}
            </Button>
          ) : null}
          <Button type="submit" size="lg" fullWidth>
            {t("submit")}
          </Button>
        </form>
      )}
    </>
  );
}
