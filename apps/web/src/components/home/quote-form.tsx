"use client";

import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";

/** Departure and arrival, then "Voir le prix". The order flow is Prompt 3: for now it opens /commander, with nothing in the URL. */
export function QuoteForm() {
  const t = useTranslations("home.hero");
  const router = useRouter();

  return (
    <form
      method="post"
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        // Addresses are personal data: they never go into the URL (and so never reach server
        // logs). The order flow will carry them through its draft (CMD-07, Prompt 3).
        router.push("/commander");
      }}
    >
      <div className="relative flex flex-col gap-2.5 ps-[26px]">
        {/* Route marks: a ring at the departure, a dot at the arrival, a dashed line between */}
        <span
          aria-hidden="true"
          className="absolute start-[7px] top-[38px] bottom-[24px] border-s-2 border-dashed border-field-border"
        />
        <span
          aria-hidden="true"
          className="absolute start-0 top-[43px] size-4 rounded-full border-[3px] border-orange bg-surface"
        />
        <span
          aria-hidden="true"
          className="absolute start-0 bottom-[16px] size-4 rounded-full bg-orange"
        />
        <Field label={t("departure")}>
          <Input
            placeholder={t("addressPlaceholder")}
            autoComplete="street-address"
            className="h-12 text-md"
          />
        </Field>
        <Field label={t("arrival")}>
          <Input placeholder={t("addressPlaceholder")} className="h-12 text-md" />
        </Field>
      </div>
      <Button type="submit" size="lg" fullWidth>
        {t("cta")}
      </Button>
      <p className="text-center text-xs text-muted">{t("note")}</p>
    </form>
  );
}
