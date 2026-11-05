"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Alert, Avatar, Button, Checkbox, Field, Input } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { pendingGoogle } from "@/lib/data/google";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { startFlow } from "@/lib/auth/flow";
import { withNext } from "@/lib/auth/next";
import { googlePhoneSchema } from "@/lib/order/schemas";

type Pending = ReturnType<typeof pendingGoogle>;

/**
 * W22 (ESP-09, R103). A known e-mail first confirms with an e-mail code; then, in every case, the
 * phone is required and checked once by SMS.
 */
export function GooglePhone({ next }: { next: string | null }) {
  const t = useTranslations("auth.googlePhone");
  const g = useTranslations("auth.google");
  const s = useTranslations("auth.signUp");
  const message = useErrorMessage();
  const router = useRouter();
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const { register, handleSubmit, formState } = useForm<{ phone: string; terms: boolean }>({
    resolver: zodResolver(googlePhoneSchema),
    defaultValues: { phone: "", terms: false },
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount
    setPending(pendingGoogle());
  }, []);

  const heading = <h1 className="text-d3">{t("title")}</h1>;
  if (pending === undefined) return heading;
  if (pending === null) {
    return (
      <>
        {heading}
        <Alert tone="info">{t("missing")}</Alert>
        <Button as={Link} href={withNext("/connexion", next)}>
          {g("continue")}
        </Button>
      </>
    );
  }

  const legal = (href: string) =>
    function LegalLink(chunks: React.ReactNode) {
      return (
        <Link href={href} target="_blank" className="font-semibold text-orange-dark underline">
          {chunks}
        </Link>
      );
    };

  const profile = (
    <div className="flex items-center gap-3">
      <Avatar name={pending.name} tone="orange" />
      <div className="min-w-0">
        <p className="font-semibold">{pending.name}</p>
        <p className="truncate text-sm text-muted">{g("connectedAs", { email: pending.email })}</p>
      </div>
    </div>
  );

  if (pending.known && !pending.emailVerified) {
    return (
      <>
        {profile}
        {heading}
        <p className="text-sm text-muted">{t("knownEmail")}</p>
        <Button
          size="lg"
          fullWidth
          onClick={() => {
            startFlow({ kind: "googleEmail", next: next ?? "" });
            router.push(withNext("/code", next));
          }}
        >
          {t("emailSubmit")}
        </Button>
      </>
    );
  }

  const onSubmit = handleSubmit((values) => {
    startFlow({ kind: "googlePhone", phone: values.phone, next: next ?? "" });
    router.push(withNext("/code", next));
  });

  return (
    <>
      {profile}
      {heading}
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
        <Checkbox
          id="google-terms"
          {...register("terms")}
          error={message(formState.errors.terms?.message)}
          label={s.rich("terms", {
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
