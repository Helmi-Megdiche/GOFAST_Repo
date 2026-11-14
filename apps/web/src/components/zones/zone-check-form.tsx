"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFormatter, useTranslations } from "next-intl";
import { Alert, Button, Card, Field, Input } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";
import { checkZone } from "@/lib/data/zones";
import { type ZoneResult } from "@fastgo/domain";
import { zoneFormSchema, type ZoneFormValues } from "@/lib/forms/schemas";
import { useErrorMessage } from "@/lib/forms/use-error-message";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "done"; result: ZoneResult };

/** Zone check (FE-04): in zone, out of zone, or an address we do not recognise. */
export function ZoneCheckForm() {
  const t = useTranslations("zones");
  const o = useTranslations("offers");
  const message = useErrorMessage();
  const format = useFormatter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ZoneFormValues>({
    resolver: zodResolver(zoneFormSchema),
    defaultValues: { address: "" },
  });

  const onSubmit = handleSubmit(async ({ address }) => {
    if (state.kind === "loading") return;
    setState({ kind: "loading" });
    setState({ kind: "done", result: await checkZone(address) });
  });

  const result = state.kind === "done" ? state.result : null;

  return (
    <Card className="flex max-w-[720px] flex-col gap-4">
      <form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={t("addressLabel")} error={message(errors.address?.message)}>
          <Input
            placeholder={t("addressPlaceholder")}
            autoComplete="street-address"
            {...register("address")}
          />
        </Field>
        <Button type="submit" fullWidth aria-disabled={state.kind === "loading" || undefined}>
          {state.kind === "loading" ? t("checking") : t("submit")}
        </Button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-3">
        {result?.status === "in-zone" ? (
          <>
            <Alert tone="success">
              <b>{t("inZone.title")}</b>
              <br />
              {t("inZone.text", {
                services: format.list(
                  result.services.map((code) => o(`${code}.name`)),
                  { type: "conjunction" },
                ),
              })}
            </Alert>
            <Button as={Link} href="/commander" fullWidth>
              {t("inZone.order")}
            </Button>
          </>
        ) : null}
        {result?.status === "out-of-zone" ? (
          <>
            <Alert tone="warning">
              <b>{t("outOfZone.title")}</b>
              <br />
              {t("outOfZone.text")}
            </Alert>
            <Button as={Link} href="/contact" variant="ghost">
              {t("outOfZone.request")}
            </Button>
          </>
        ) : null}
        {result?.status === "unknown" ? (
          <>
            <Alert tone="info">
              <b>{t("unknown.title")}</b>
              <br />
              {t("unknown.text")}
            </Alert>
            <Button as={Link} href="/contact" variant="ghost">
              {t("unknown.contact")}
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}
