"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Dialog } from "@fastgo/ui";

/** /dev/ui demo of Dialog: the safe button takes the focus, Escape or any button closes it. */
export function DialogDemo() {
  const t = useTranslations("devUi.dialog");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-3">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("open")}
      </Button>
      <p role="status" data-testid="dialog-state" className="text-sm text-muted">
        {open ? t("stateOpen") : t("stateClosed")}
      </p>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("title")}
        actions={
          <>
            <Button type="submit" variant="ghost" autoFocus>
              {t("keep")}
            </Button>
            <Button type="submit" variant="danger">
              {t("confirm")}
            </Button>
          </>
        }
      >
        {t("text")}
      </Dialog>
    </div>
  );
}
