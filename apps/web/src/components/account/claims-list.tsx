"use client";

import { useTranslations } from "next-intl";
import { Alert, Button, Card, Ltr, Table, TBody, Td, Th, THead, Tr } from "@fastgo/ui";
import { DateTime } from "@/components/money";
import { Link } from "@/i18n/navigation";
import { listClaims } from "@/lib/data/claims";
import { ClaimStateBadge } from "./claim-parts";
import { useLoader } from "./use-loader";

/** C06 (ESP-06): the account's claims, most recently updated first. */
export function ClaimsList() {
  const t = useTranslations("claims.list");
  const c = useTranslations("claims.category");
  const { state, reload } = useLoader((session) => listClaims(session), "claims");

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
  const rows = state.data;
  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h2 className="text-h4">{t("emptyTitle")}</h2>
        <p className="text-muted">{t("emptyText")}</p>
        <Button as={Link} href="/compte/reclamations/nouvelle">
          {t("new")}
        </Button>
      </Card>
    );
  }
  return (
    <Table label={t("title")} caption={t("caption")} stacked>
      <THead>
        <Tr>
          <Th>{t("columns.ref")}</Th>
          <Th>{t("columns.subject")}</Th>
          <Th>{t("columns.order")}</Th>
          <Th>{t("columns.status")}</Th>
          <Th>{t("columns.updated")}</Th>
          <Th>
            <span className="sr-only">{t("columns.action")}</span>
          </Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.ref}>
            <Td label={t("columns.ref")}>
              <Ltr mono>{row.ref}</Ltr>
            </Td>
            <Td label={t("columns.subject")}>{c(row.category)}</Td>
            <Td label={t("columns.order")}>
              <Ltr mono>{row.orderCode}</Ltr>
            </Td>
            <Td label={t("columns.status")}>
              <ClaimStateBadge state={row.state} />
            </Td>
            <Td label={t("columns.updated")}>
              <DateTime value={row.updatedAt} />
            </Td>
            <Td>
              <Button
                as={Link}
                href={`/compte/reclamations/${row.ref}`}
                size="sm"
                variant="secondary"
                aria-label={t("openOf", { ref: row.ref })}
              >
                {t("open")}
              </Button>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
