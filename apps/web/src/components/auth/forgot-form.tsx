"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { startFlow } from "@/lib/auth/flow";
import { withNext } from "@/lib/auth/next";
import { phoneOnlySchema } from "@/lib/order/schemas";

/** W21. The next step looks the same whether or not the phone has an account (decision 16). */
export function ForgotForm({ next }: { next: string | null }) {
  const t = useTranslations("auth.forgot");
  const message = useErrorMessage();
  const router = useRouter();
  const { register, handleSubmit, formState } = useForm<{ phone: string }>({
    resolver: zodResolver(phoneOnlySchema),
    defaultValues: { phone: "" },
  });

  const onSubmit = handleSubmit((values) => {
    startFlow({ kind: "reset", phone: values.phone, next: next ?? "" });
    router.push(withNext("/code", next));
  });

  return (
    <>
      <h1 className="text-d3">{t("title")}</h1>
      <p className="text-sm text-muted">{t("text")}</p>
      <form
        noValidate
        method="post"
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        <Field label={t("phone")} error={message(formState.errors.phone?.message)} required>
          <Input
            {...register("phone")}
            type="tel"
            dir="ltr"
            autoComplete="tel"
            placeholder="+216 "
          />
        </Field>
        <Button type="submit" size="lg" fullWidth>
          {t("submit")}
        </Button>
      </form>
      <Button
        as={Link}
        href={withNext("/connexion", next)}
        variant="ghost"
        className="border-transparent text-orange-dark"
      >
        {t("back")}
      </Button>
    </>
  );
}
