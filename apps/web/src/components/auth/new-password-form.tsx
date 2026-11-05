"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Input } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { setNewPassword } from "@/lib/data/auth";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { currentFlow, endFlow } from "@/lib/auth/flow";
import { withNext } from "@/lib/auth/next";
import { PASSWORD_MIN_LENGTH } from "@/lib/order/constants";
import { newPasswordSchema } from "@/lib/order/schemas";

/** New password after W21 and W20. Proposed step: it is not in the mockup (decision 16). */
export function NewPasswordForm({ next }: { next: string | null }) {
  const t = useTranslations("auth.newPassword");
  const s = useTranslations("auth.signUp");
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

  const onSubmit = handleSubmit(async (values) => {
    const flow = currentFlow();
    if (flow?.kind !== "reset") return;
    const result = await setNewPassword(flow.phone, values.password);
    if (result.status === "tooShort") setError("password", { message: "passwordTooShort" });
    else if (result.status === "notVerified") router.replace(withNext("/mot-de-passe", next));
    else {
      endFlow();
      setDone(true);
    }
  });

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
          <Button type="submit" size="lg" fullWidth>
            {t("submit")}
          </Button>
        </form>
      )}
    </>
  );
}
