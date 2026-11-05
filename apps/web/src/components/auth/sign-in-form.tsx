"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Alert, Button, Checkbox, Field, Input } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { signIn } from "@/lib/data/auth";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { withNext } from "@/lib/auth/next";
import { safeNext } from "@/lib/auth/safe-next";
import { signInSchema } from "@/lib/order/schemas";
import { GoogleSignIn, OrDivider } from "./google-sign-in";

type Values = { identifier: string; password: string; remember: boolean };

/** W18 (ESP-01). Wrong password and unknown account give the same message (decision 16). */
export function SignInForm({ next }: { next: string | null }) {
  const t = useTranslations("auth.signIn");
  const message = useErrorMessage();
  const router = useRouter();
  const alertRef = useRef<HTMLDivElement>(null);
  // Counts failed attempts: each one moves the focus to the message again.
  const [failures, setFailures] = useState(0);
  useEffect(() => {
    if (failures > 0) alertRef.current?.focus();
  }, [failures]);
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(signInSchema),
    defaultValues: { identifier: "", password: "", remember: false },
  });
  const { errors, isSubmitting } = formState;

  const onSubmit = handleSubmit(async (values) => {
    const result = await signIn(values.identifier, values.password);
    if (result.status === "ok") {
      router.push(safeNext(next));
      return;
    }
    setFailures((count) => count + 1);
  });

  return (
    <>
      <h1 className="text-d3">{t("title")}</h1>
      <GoogleSignIn next={next} />
      <OrDivider />
      <form
        noValidate
        method="post"
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        {failures > 0 ? (
          <div ref={alertRef} tabIndex={-1} className="outline-none">
            <Alert tone="error">{t("invalid")}</Alert>
          </div>
        ) : null}
        <Field label={t("identifier")} error={message(errors.identifier?.message)} required>
          <Input
            {...register("identifier")}
            autoComplete="username"
            dir="auto"
            placeholder="+216 20 000 000"
          />
        </Field>
        <Field label={t("password")} error={message(errors.password?.message)} required>
          <Input {...register("password")} type="password" autoComplete="current-password" />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox id="sign-in-remember" label={t("remember")} {...register("remember")} />
          <Link
            href={withNext("/mot-de-passe", next)}
            className="text-sm font-semibold text-orange-dark"
          >
            {t("forgot")}
          </Link>
        </div>
        <Button type="submit" size="lg" fullWidth aria-disabled={isSubmitting || undefined}>
          {isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </form>
      <p className="text-center text-sm">
        {t("noAccount")}{" "}
        <Link href={withNext("/inscription", next)} className="font-semibold text-orange-dark">
          {t("signUp")}
        </Link>
      </p>
    </>
  );
}
