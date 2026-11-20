"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Field, Ltr, Select, Textarea } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { CLAIM_CATEGORIES, type ClaimCategory } from "@/lib/data/claim-model";
import { createClaim, getClaimContext, type ClaimContext } from "@/lib/data/claims";
import { useSession } from "@/lib/data/use-session";
import {
  AttachmentsField,
  ClaimRules,
  problemOf,
  useAttachmentMessage,
  useRequestKey,
} from "./claim-parts";
import { useLoader } from "./use-loader";

type Ready = Extract<ClaimContext, { status: "ready" }>;

/**
 * C07, new claim (ESP-06). `?commande=<code>` (the CMD-08 link) opens the form for that order;
 * `?facture=<number>` ("Contester" on C05) for one of that invoice's orders: with several, the
 * client must pick one first. The URL is the source of truth, as on C02.
 */
export function ClaimNew() {
  const t = useTranslations("claims.new");
  const params = useSearchParams();
  const commande = params.get("commande");
  const facture = params.get("facture");
  const { state, reload } = useLoader(
    (session) => getClaimContext(session, { commande, facture }),
    `${commande}|${facture}`,
  );

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
  const context = state.data;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/compte/reclamations" className="text-sm font-semibold text-orange-dark">
        {t("back")}
      </Link>
      {context.invoiceNumber ? (
        <p>{t.rich("contesting", { num: () => <Ltr mono>{context.invoiceNumber}</Ltr> })}</p>
      ) : null}
      {context.invoiceNumber && !context.selected ? (
        <PickOrder context={context} />
      ) : (
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
          <ClaimForm key={context.selected?.code ?? ""} context={context} />
          <ClaimRules order={context.selected} />
        </div>
      )}
    </div>
  );
}

/** An invoice of several orders: the client picks the order the claim is about, then the form opens. */
function PickOrder({ context }: { context: Ready }) {
  const t = useTranslations("claims.new");
  const o = useTranslations("offers");
  const router = useRouter();
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState(false);
  const legendId = useId();
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!chosen) {
      setError(true);
      return;
    }
    router.replace({
      pathname: "/compte/reclamations/nouvelle",
      query: { facture: context.invoiceNumber ?? "", commande: chosen },
    });
  };
  return (
    <Card className="max-w-xl">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <fieldset
          className="flex flex-col gap-3"
          aria-describedby={error ? `${legendId}-e` : undefined}
        >
          <legend id={legendId} className="text-h4">
            {t("pick.title")}
          </legend>
          <p className="text-muted">{t("pick.text")}</p>
          {context.orders.map((order) => (
            <label
              key={order.code}
              className="flex items-center gap-3 rounded-md border border-line px-3 py-2"
            >
              <input
                type="radio"
                name="commande"
                value={order.code}
                checked={chosen === order.code}
                onChange={() => {
                  setChosen(order.code);
                  setError(false);
                }}
                className="size-4 accent-orange"
              />
              <Ltr mono>{order.code}</Ltr>
              <span className="text-muted">{o(`${order.service}.name`)}</span>
            </label>
          ))}
          {error ? (
            <p id={`${legendId}-e`} role="alert" className="text-2xs font-medium text-danger">
              {t("errors.orderRequired")}
            </p>
          ) : null}
        </fieldset>
        <Button type="submit">{t("pick.continue")}</Button>
      </form>
    </Card>
  );
}

type Errors = Partial<Record<"order" | "category" | "message" | "attachments", string>>;

function ClaimForm({ context }: { context: Ready }) {
  const t = useTranslations("claims.new");
  const c = useTranslations("claims.category");
  const o = useTranslations("offers");
  const e = useTranslations("claims.new.errors");
  const attachmentMessage = useAttachmentMessage();
  const router = useRouter();
  const session = useSession();
  const formRef = useRef<HTMLFormElement>(null);
  const attachId = useId();
  const fromInvoice = context.invoiceNumber !== null;
  const [orderCode, setOrderCode] = useState(context.selected?.code ?? "");
  const [category, setCategory] = useState<ClaimCategory | "">(fromInvoice ? "billing" : "");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

  const categories = CLAIM_CATEGORIES.filter((value) => (value === "billing") === fromInvoice);
  const attachmentsProblem = attachmentMessage(problemOf(files));
  const keyFor = useRequestKey();

  // After a failed submit the focus goes to the first field in error.
  useEffect(() => {
    if (focusNonce === 0) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')
      ?.focus();
  }, [focusNonce]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !session) return;
    const next: Errors = {};
    if (!orderCode) next.order = e("orderRequired");
    if (!category) next.category = e("categoryRequired");
    if (!message.trim()) next.message = e("messageRequired");
    if (attachmentsProblem) next.attachments = attachmentsProblem;
    setErrors(next);
    setProblem(null);
    if (Object.keys(next).length > 0) {
      setFocusNonce((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const result = await createClaim(
        session,
        {
          orderCode,
          category: category as ClaimCategory,
          invoiceNumber: context.invoiceNumber,
          message,
          attachments: files.map((f) => ({ name: f.name, sizeBytes: f.size, type: f.type })),
        },
        keyFor(
          JSON.stringify([
            orderCode,
            category,
            context.invoiceNumber,
            message,
            files.map((f) => [f.name, f.size]),
          ]),
        ),
      );
      if (result.status === "created") {
        router.push(`/compte/reclamations/${result.ref}`);
        return;
      }
      setProblem(e("refused"));
    } catch {
      // The answer may have been lost after the claim was saved: the same key makes a retry safe.
      setProblem(e("network"));
    }
    setBusy(false);
  };

  return (
    <Card>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {context.selected || fromInvoice ? (
          <p className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium text-ink">{t("order")}</span>
            <Ltr mono>{orderCode}</Ltr>
          </p>
        ) : (
          <Field label={t("order")} error={errors.order} required>
            <Select value={orderCode} onChange={(event) => setOrderCode(event.target.value)}>
              <option value="">{t("orderPlaceholder")}</option>
              {context.orders.map((order) => (
                <option key={order.code} value={order.code}>
                  {t("orderOption", { code: order.code, service: o(`${order.service}.name`) })}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t("category")} error={errors.category} required>
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value as ClaimCategory | "")}
          >
            <option value="">{t("categoryPlaceholder")}</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {c(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("message")} error={errors.message} required>
          <Textarea value={message} onChange={(event) => setMessage(event.target.value)} />
        </Field>
        <AttachmentsField
          files={files}
          onChange={setFiles}
          error={errors.attachments ?? attachmentsProblem}
          errorId={attachId}
        />
        {problem ? <Alert tone="error">{problem}</Alert> : null}
        <Button type="submit" aria-disabled={busy || undefined}>
          {busy ? t("sending") : t("submit")}
        </Button>
      </form>
    </Card>
  );
}
