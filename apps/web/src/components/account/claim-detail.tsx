"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Field, KeyValue, Ltr, Textarea } from "@fastgo/ui";
import { DateTime } from "@/components/money";
import { Link } from "@/i18n/navigation";
import {
  getClaim,
  postClaimMessage,
  reopenClaim,
  type ClaimDetail,
  type ClaimMessageView,
} from "@/lib/data/claims";
import { useSession } from "@/lib/data/use-session";
import {
  AttachmentsField,
  ClaimRules,
  ClaimStateBadge,
  LinkedOrder,
  problemOf,
  useAttachmentMessage,
  useRequestKey,
} from "./claim-parts";
import { useLoader } from "./use-loader";

/** C07, one claim (ESP-06): the thread without internal notes (T30), the reply, the reopening (R804). */
export function ClaimDetailView({ reference }: { reference: string }) {
  const t = useTranslations("claims.detail");
  const { state, reload } = useLoader((session) => getClaim(session, reference), reference);
  // Kept here, not in Found: the page shows "loading" while it reloads, which would drop the notice.
  const [notice, setNotice] = useState<"notClosed" | "closedNow" | null>(null);

  if (state.status === "loading") {
    return (
      <p aria-busy="true" className="text-muted">
        {t("loading")}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <Alert tone="error">
        <span className="flex flex-col items-start gap-2">
          {t("error.title")}
          <Button size="sm" variant="secondary" onClick={reload}>
            {t("error.retry")}
          </Button>
        </span>
      </Alert>
    );
  }
  if (state.data.status === "notFound") {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h2 className="text-h4">{t("notFound.title")}</h2>
        <p className="text-muted">{t("notFound.text")}</p>
        <Button as={Link} href="/compte/reclamations" variant="secondary">
          {t("back")}
        </Button>
      </Card>
    );
  }
  return (
    <Found claim={state.data.claim} onChanged={reload} notice={notice} setNotice={setNotice} />
  );
}

type Notice = "notClosed" | "closedNow" | null;

function Found({
  claim,
  onChanged,
  notice,
  setNotice,
}: {
  claim: ClaimDetail;
  onChanged: () => void;
  notice: Notice;
  setNotice: (notice: Notice) => void;
}) {
  const t = useTranslations("claims.detail");
  const c = useTranslations("claims.category");
  return (
    <div className="flex flex-col gap-6">
      <Link href="/compte/reclamations" className="text-sm font-semibold text-orange-dark">
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-2xl font-semibold text-ink">{c(claim.category)}</h2>
          <Ltr mono className="text-muted">
            {claim.ref}
          </Ltr>
        </div>
        <ClaimStateBadge state={claim.state} />
      </div>

      {notice ? (
        <Alert tone="info">{t(notice === "notClosed" ? "reopen.notClosed" : "closedNow")}</Alert>
      ) : null}
      {claim.state === "toComplete" ? <Alert tone="warning">{t("toComplete")}</Alert> : null}
      {claim.state === "archived" ? <Alert tone="info">{t("archived")}</Alert> : null}

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <h3 className="text-h5">{t("thread")}</h3>
            <ul className="flex flex-col gap-4">
              {claim.messages.map((message) => (
                <MessageItem key={message.id} message={message} />
              ))}
            </ul>
          </Card>
          {claim.canReply ? (
            <ReplyForm
              reference={claim.ref}
              onChanged={onChanged}
              onStale={(kind) => {
                setNotice(kind);
                onChanged();
              }}
            />
          ) : null}
          {claim.canReopen ? (
            <ReopenBlock
              claim={claim}
              onChanged={onChanged}
              onStale={(kind) => {
                setNotice(kind);
                onChanged();
              }}
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <LinkedOrder order={claim.order} />
            {claim.invoiceNumber ? (
              <KeyValue
                items={[
                  {
                    term: t("invoice"),
                    value: (
                      <Link
                        href={`/compte/factures/${claim.invoiceNumber}`}
                        className="text-orange-dark"
                      >
                        <Ltr mono>{claim.invoiceNumber}</Ltr>
                      </Link>
                    ),
                  },
                ]}
              />
            ) : null}
            <Link
              href={`/compte/commandes/${claim.order.code}`}
              className="text-sm font-semibold text-orange-dark"
            >
              {t("viewOrder")}
            </Link>
          </Card>
          <ClaimRules order={claim.order} />
        </div>
      </div>
    </div>
  );
}

function MessageItem({ message }: { message: ClaimMessageView }) {
  const t = useTranslations("claims.detail");
  return (
    <li className="flex flex-col gap-1 border-b border-line pb-4 last:border-b-0 last:pb-0">
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
        <span className="font-medium text-ink">
          {message.from === "you" ? t("you") : t("staff")}
        </span>
        <DateTime value={message.at} />
      </p>
      <p className="whitespace-pre-line">{message.body}</p>
      {message.attachments.length > 0 ? (
        <ul aria-label={t("attachments")} className="flex flex-wrap gap-2 text-sm">
          {message.attachments.map((file, index) => (
            <li key={`${file.name}-${index}`} className="rounded-sm bg-fill-subtle px-2 py-1">
              <bdi dir="ltr">{file.name}</bdi>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ReplyForm({
  reference,
  onChanged,
  onStale,
}: {
  reference: string;
  onChanged: () => void;
  onStale: (kind: "closedNow") => void;
}) {
  const t = useTranslations("claims.detail.reply");
  const e = useTranslations("claims.new.errors");
  const attachmentMessage = useAttachmentMessage();
  const session = useSession();
  const attachId = useId();
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attachmentsProblem = attachmentMessage(problemOf(files));
  const keyFor = useRequestKey();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !session) return;
    setProblem(null);
    if (!message.trim()) {
      setError(e("messageRequired"));
      return;
    }
    setError(undefined);
    if (attachmentsProblem) return;
    setBusy(true);
    try {
      const result = await postClaimMessage(
        session,
        reference,
        {
          message,
          attachments: files.map((f) => ({ name: f.name, sizeBytes: f.size, type: f.type })),
        },
        keyFor(JSON.stringify([reference, message, files.map((f) => [f.name, f.size])])),
      );
      if (result.status === "sent") {
        setMessage("");
        setFiles([]);
        onChanged();
      } else if (result.status === "closed" || result.status === "archived") {
        onStale("closedNow");
      } else {
        setProblem(e("refused"));
      }
    } catch {
      setProblem(e("network"));
    }
    setBusy(false);
  };

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t("label")} error={error} required>
          <Textarea value={message} onChange={(event) => setMessage(event.target.value)} />
        </Field>
        <AttachmentsField
          files={files}
          onChange={setFiles}
          error={attachmentsProblem}
          errorId={attachId}
        />
        {problem ? <Alert tone="error">{problem}</Alert> : null}
        <Button type="submit" aria-disabled={busy || undefined} className="self-start">
          {t("submit")}
        </Button>
      </form>
    </Card>
  );
}

function ReopenBlock({
  claim,
  onChanged,
  onStale,
}: {
  claim: ClaimDetail;
  onChanged: () => void;
  onStale: (kind: "notClosed") => void;
}) {
  const t = useTranslations("claims.detail.reopen");
  const e = useTranslations("claims.new.errors");
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const onReopen = async () => {
    if (busy || !session) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await reopenClaim(session, claim.ref);
      if (result.status === "reopened") onChanged();
      else onStale("notClosed");
    } catch {
      setProblem(e("network"));
    }
    setBusy(false);
  };

  return (
    <Card className="flex flex-col items-start gap-3">
      <p>{t("text")}</p>
      {claim.reopenableUntil ? (
        <KeyValue
          items={[
            { term: t("until"), value: <DateTime value={claim.reopenableUntil} style="date" /> },
          ]}
        />
      ) : null}
      {problem ? <Alert tone="error">{problem}</Alert> : null}
      <Button type="button" onClick={onReopen} aria-disabled={busy || undefined}>
        {t("button")}
      </Button>
    </Card>
  );
}
