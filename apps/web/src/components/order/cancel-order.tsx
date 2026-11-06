"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Dialog } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { clearDraft } from "@/lib/order/draft";

/** W11 "Annuler": asks first, then deletes the draft and goes home ("Enregistrer et quitter" keeps it). */
export function CancelOrder() {
  const t = useTranslations("cmd");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        className="border-transparent text-orange-dark"
        onClick={() => setOpen(true)}
      >
        {t("cancel")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("cancelConfirm.title")}
        actions={
          <>
            <Button type="submit" variant="ghost" autoFocus>
              {t("cancelConfirm.keep")}
            </Button>
            <Button
              type="submit"
              variant="danger"
              onClick={() => {
                clearDraft();
                router.push("/");
              }}
            >
              {t("cancelConfirm.confirm")}
            </Button>
          </>
        }
      >
        {t("cancelConfirm.text")}
      </Dialog>
    </>
  );
}
