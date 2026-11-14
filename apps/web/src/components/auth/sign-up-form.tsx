"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Field, Input, RadioCard } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { startFlow } from "@/lib/auth/flow";
import { withNext } from "@/lib/auth/next";
import { PASSWORD_MIN_LENGTH } from "@fastgo/domain";
import { signUpSchema } from "@/lib/order/schemas";
import { GoogleSignIn, OrDivider } from "./google-sign-in";

type Values = {
  kind: "customer" | "merchant";
  name: string;
  phone: string;
  email: string;
  password: string;
  terms: boolean;
};

/**
 * W19 (ESP-01). Particulier and Commerçant share this form for now (company fields: Prompt 4,
 * PRO-01). The password stays in memory only, until the code step creates the account.
 */
export function SignUpForm({ next }: { next: string | null }) {
  const t = useTranslations("auth.signUp");
  const message = useErrorMessage();
  const router = useRouter();
  const { register, handleSubmit, control, formState } = useForm<Values>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { kind: "customer", name: "", phone: "", email: "", password: "", terms: false },
  });
  const { errors } = formState;
  const kind = useWatch({ control, name: "kind" });

  const onSubmit = handleSubmit((values) => {
    startFlow({
      kind: "signUp",
      account: {
        kind: values.kind,
        name: values.name,
        phone: values.phone,
        email: values.email,
        password: values.password,
      },
      next: next ?? "",
    });
    router.push(withNext("/code", next));
  });

  const legal = (href: string) =>
    function LegalLink(chunks: React.ReactNode) {
      return (
        <Link href={href} target="_blank" className="font-semibold text-orange-dark underline">
          {chunks}
        </Link>
      );
    };

  return (
    <>
      <h1 className="text-d3">{t("title")}</h1>
      <GoogleSignIn next={next} kind={kind} />
      <OrDivider />
      <form
        noValidate
        method="post"
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4"
      >
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">{t("kindLegend")}</legend>
          {(["customer", "merchant"] as const).map((kind) => (
            <RadioCard
              key={kind}
              value={kind}
              {...register("kind")}
              title={t(`kinds.${kind}.title`)}
              description={t(`kinds.${kind}.text`)}
            />
          ))}
        </fieldset>
        <Field label={t("name")} error={message(errors.name?.message)} required>
          <Input {...register("name")} autoComplete="name" />
        </Field>
        <Field
          label={t("phone")}
          hint={t("phoneHint")}
          error={message(errors.phone?.message)}
          required
        >
          <Input
            {...register("phone")}
            type="tel"
            dir="ltr"
            autoComplete="tel"
            placeholder="+216 "
          />
        </Field>
        <Field label={t("email")} error={message(errors.email?.message)}>
          <Input {...register("email")} type="email" dir="ltr" autoComplete="email" />
        </Field>
        <Field
          label={t("password")}
          hint={t("passwordHint", { count: PASSWORD_MIN_LENGTH })}
          error={message(errors.password?.message)}
          required
        >
          <Input {...register("password")} type="password" autoComplete="new-password" />
        </Field>
        <Checkbox
          id="sign-up-terms"
          {...register("terms")}
          error={message(errors.terms?.message)}
          label={t.rich("terms", {
            cgv: legal("/legal/cgv"),
            privacy: legal("/legal/confidentialite"),
          })}
        />
        <Button type="submit" size="lg" fullWidth>
          {t("submit")}
        </Button>
      </form>
    </>
  );
}
