"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Card } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { now } from "@/lib/order/clock";
import { loadDraft, type OrderDraft } from "@/lib/order/draft";
import { addressOutOfZone, redirectFor, STEP_PATHS } from "@/lib/order/steps";
import { StepBusy } from "./busy";
import { markStepChange } from "./step-heading";

/** W17: an out-of-zone departure or arrival, before any price (R201). No address in any URL. */
export function OutOfZone() {
  const t = useTranslations("order");
  const router = useRouter();
  const [failed, setFailed] = useState<{ side: "sender" | "recipient"; draft: OrderDraft } | null>(
    null,
  );

  useEffect(() => {
    const draft = loadDraft();
    const side = draft
      ? addressOutOfZone(draft.sender.address)
        ? "sender"
        : addressOutOfZone(draft.recipient.address)
          ? "recipient"
          : null
      : null;
    if (!draft || !side) {
      // Nothing is out of zone: go to the first incomplete step.
      router.replace(STEP_PATHS[redirectFor(draft, "review", now()) ?? "review"]);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the draft is read after mount
    setFailed({ side, draft });
  }, [router]);

  if (!failed) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-d2">{t("outOfZone.title")}</h1>
        <StepBusy />
      </div>
    );
  }

  const departure = failed.side === "sender";
  const address = departure ? failed.draft.sender.address : failed.draft.recipient.address;
  const label = departure ? t("sender.address") : t("recipient.address");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-d2">{departure ? t("sender.title") : t("recipient.title")}</h1>
      <Card className="flex max-w-[720px] flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium">{label}</p>
          <p className="rounded-md border border-danger bg-danger-light px-3 py-2.5">
            {address.text || t("address.pinText")}
          </p>
          <p className="text-2xs font-medium text-danger">{t("outOfZone.hint")}</p>
        </div>
        <Alert tone="warning">
          <div>
            <b>{t("outOfZone.title")}</b>
            <br />
            {t("outOfZone.text")}
          </div>
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Button as={Link} href={STEP_PATHS[failed.side]} onClick={() => markStepChange()}>
            {t("outOfZone.change")}
          </Button>
          <Button as={Link} href="/zones" variant="secondary">
            {t("outOfZone.zones")}
          </Button>
          <Button
            as={Link}
            href="/contact"
            variant="ghost"
            className="border-transparent text-orange-dark"
          >
            {t("outOfZone.request")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
