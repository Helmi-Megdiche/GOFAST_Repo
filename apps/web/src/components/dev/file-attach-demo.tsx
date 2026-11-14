"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileAttach } from "@fastgo/ui";
import { MAX_ATTACHMENT_BYTES } from "@fastgo/domain";

/** /dev/ui only: the attachment control with the 5 MB rule. */
export function FileAttachDemo() {
  const t = useTranslations("devUi.more");
  const [file, setFile] = useState<File | null>(null);
  const tooLarge = file !== null && file.size > MAX_ATTACHMENT_BYTES;

  return (
    <FileAttach
      label={t("attachLabel")}
      removeLabel={t("attachRemove")}
      value={file}
      onChange={setFile}
      error={tooLarge ? t("attachError") : undefined}
      className="max-w-[360px]"
    />
  );
}
