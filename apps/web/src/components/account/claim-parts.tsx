"use client";

import { useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, Icon, KeyValue, Ltr, type BadgeTone } from "@fastgo/ui";
import { DateTime, Money } from "@/components/money";
import {
  attachmentError,
  type AttachmentError,
  CLAIM_ATTACHMENT_MAX_BYTES,
  CLAIM_ATTACHMENT_MAX_FILES,
  CLAIM_ATTACHMENT_TYPES,
  CLAIM_FLAT_CAP_MILLIMES,
  CLAIM_REPLY_DELAY_HOURS,
  CLAIM_REPORT_DELAY_HOURS,
} from "@fastgo/domain";
import type { ClaimOrderInfo, ClaimState } from "@/lib/data/claims";

const STATE_LOOK: Record<ClaimState, BadgeTone> = {
  open: "info",
  toComplete: "warning",
  resolved: "success",
  archived: "neutral",
};

/** The state of a claim as a badge, with the mockup's names (H13) and "Archivée" (R804). */
export function ClaimStateBadge({ state }: { state: ClaimState }) {
  const t = useTranslations("claims.state");
  return <Badge tone={STATE_LOOK[state]}>{t(state)}</Badge>;
}

const MB = 1024 * 1024;
export const ATTACHMENT_MAX_MB = CLAIM_ATTACHMENT_MAX_BYTES / MB;

/**
 * Gives an Idempotency-Key per request (ADR-6), called from the submit handler: the same request
 * sent again after a lost answer reuses its key, so the claim or message is saved once; a changed
 * request gets a new key.
 */
export function useRequestKey(): (fingerprint: string) => string {
  const keys = useRef(new Map<string, string>());
  return (fingerprint) => {
    const known = keys.current.get(fingerprint);
    if (known) return known;
    const key = crypto.randomUUID();
    keys.current.set(fingerprint, key);
    return key;
  };
}

/** The text of an attachment problem (`claims.new.errors.attachment*`). */
export function useAttachmentMessage() {
  const t = useTranslations("claims.new.errors");
  return (error: AttachmentError | null): string | undefined => {
    if (error === "tooLarge") return t("attachmentTooLarge", { size: ATTACHMENT_MAX_MB });
    if (error === "badType") return t("attachmentBadType");
    if (error === "tooMany") return t("attachmentTooMany", { count: CLAIM_ATTACHMENT_MAX_FILES });
    return undefined;
  };
}

export function problemOf(files: File[]): AttachmentError | null {
  return attachmentError(files.map((f) => ({ name: f.name, sizeBytes: f.size, type: f.type })));
}

/**
 * Up to 5 images or PDF files (H12). The picker is a real file input kept off screen; the button is
 * the control a keyboard user reaches. The rule is decided by `problemOf`, shown as `error`.
 */
export function AttachmentsField({
  files,
  onChange,
  error,
  errorId,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  error?: string;
  errorId: string;
}) {
  const t = useTranslations("claims.new");
  const input = useRef<HTMLInputElement>(null);
  const helpId = useId();
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        multiple
        accept={CLAIM_ATTACHMENT_TYPES.join(",")}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          onChange([...files, ...Array.from(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-describedby={error ? `${helpId} ${errorId}` : helpId}
          data-invalid={error ? "true" : undefined}
          onClick={() => input.current?.click()}
        >
          <Icon name="file" />
          {t("attach")}
        </Button>
        <p id={helpId} className="text-2xs text-muted">
          {t("attachHelp", { size: ATTACHMENT_MAX_MB, count: CLAIM_ATTACHMENT_MAX_FILES })}
        </p>
      </div>
      {files.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-3 rounded-md border border-line bg-fill-subtle px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon name="file" size="sm" className="text-muted" />
                <bdi dir="ltr" className="truncate">
                  {file.name}
                </bdi>
              </span>
              <button
                type="button"
                aria-label={t("removeAttachment", { name: file.name })}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted hover:text-ink"
              >
                <Icon name="x" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-2xs font-medium text-danger">
          <Icon name="warn" size="sm" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * R801 (the report delay), R802 (the declared value, or the flat cap of the CGV) and R804 (the reply
 * time) as C07 shows them. The values come from constants.ts; no refund is computed.
 */
export function ClaimRules({ order }: { order: ClaimOrderInfo | null }) {
  const t = useTranslations("claims.rules");
  const declared = order?.declaredValueMillimes ?? null;
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-h5">{t("title")}</h3>
      <p className="text-sm">{t("reportDelay", { hours: CLAIM_REPORT_DELAY_HOURS })}</p>
      {order ? (
        <KeyValue
          items={[
            declared !== null
              ? { term: t("declaredValue"), value: <Money millimes={declared} /> }
              : { term: t("noDeclared"), value: <Money millimes={CLAIM_FLAT_CAP_MILLIMES} /> },
          ]}
        />
      ) : null}
      <p className="text-sm text-muted">{t("cap")}</p>
      <KeyValue
        items={[
          {
            term: t("replyTime"),
            value: t("replyWithin", { hours: CLAIM_REPLY_DELAY_HOURS }),
          },
        ]}
      />
    </Card>
  );
}

/** "Commande liée" block of C07 (order, delivery date). */
export function LinkedOrder({ order }: { order: ClaimOrderInfo }) {
  const t = useTranslations("claims.detail");
  return (
    <KeyValue
      items={[
        { term: t("linkedOrder"), value: <Ltr mono>{order.code}</Ltr> },
        ...(order.deliveredAt
          ? [{ term: t("deliveredOn"), value: <DateTime value={order.deliveredAt} style="date" /> }]
          : []),
      ]}
    />
  );
}
