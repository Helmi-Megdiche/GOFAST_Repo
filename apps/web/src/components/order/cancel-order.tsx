"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { clearDraft } from "@/lib/order/draft";

/** W11 "Annuler": asks first, then deletes the draft and goes home ("Enregistrer et quitter" keeps it). */
export function CancelOrder() {
  const t = useTranslations("cmd");
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button
        variant="ghost"
        className="border-transparent text-orange-dark"
        onClick={() => dialog.current?.showModal()}
      >
        {t("cancel")}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="cancel-title"
        className="m-auto w-[min(420px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-6 text-ink backdrop:bg-navy-deep/60"
      >
        <h2 id="cancel-title" className="text-h4">
          {t("cancelConfirm.title")}
        </h2>
        <p className="mt-2 text-sm text-muted">{t("cancelConfirm.text")}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => dialog.current?.close()}>
            {t("cancelConfirm.keep")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clearDraft();
              dialog.current?.close();
              router.push("/");
            }}
          >
            {t("cancelConfirm.confirm")}
          </Button>
        </div>
      </dialog>
    </>
  );
}
