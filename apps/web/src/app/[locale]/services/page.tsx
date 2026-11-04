import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Alert, Card, Container, Icon, Section, TBody, THead, Table, Td, Th, Tr } from "@fastgo/ui";
import { FeeValue, PriceValue, TextValue } from "@/components/placeholder-values";
import { PageHero } from "@/components/page-hero";
import { getServiceOffers } from "@/lib/data/services";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/services", "services");

function RowHeader({ children }: { children: ReactNode }) {
  return (
    <th scope="row" className="border-b border-row-line px-3.5 py-3 text-start font-semibold">
      {children}
    </th>
  );
}

/** Services and prices (FE-02, FE-03). Reference: W02-Services, without the price simulator (FE-10 is L2). */
export default async function ServicesPage({ params }: PageParams) {
  await resolveLocale(params);
  const t = await getTranslations("services");
  const o = await getTranslations("offers");
  const p = await getTranslations("placeholders");
  const catalog = await getServiceOffers();

  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} />
      <Section compact>
        <Container className="flex flex-col gap-6">
          <Card flush>
            <Table label={t("tableLabel")}>
              <THead>
                <Tr>
                  <Th>
                    <span className="sr-only">{t("tableLabel")}</span>
                  </Th>
                  {catalog.offers.map((offer) => (
                    <Th key={offer.code}>{o(`${offer.code}.name`)}</Th>
                  ))}
                </Tr>
              </THead>
              <TBody>
                <Tr>
                  <RowHeader>{t("rows.delay")}</RowHeader>
                  {catalog.offers.map((offer) => (
                    <Td key={offer.code}>{o(`${offer.code}.delayCell`)}</Td>
                  ))}
                </Tr>
                <Tr>
                  <RowHeader>{t("rows.cutoff")}</RowHeader>
                  {catalog.offers.map((offer) => (
                    <Td key={offer.code}>
                      <TextValue value={offer.cutoffTime} placeholder="time" />
                    </Td>
                  ))}
                </Tr>
                <Tr>
                  <RowHeader>{t("rows.price")}</RowHeader>
                  {catalog.offers.map((offer) => (
                    <Td key={offer.code}>
                      <PriceValue millimes={offer.fromPriceMillimes} />
                    </Td>
                  ))}
                </Tr>
                <Tr>
                  <RowHeader>{t("rows.proof")}</RowHeader>
                  {catalog.offers.map((offer) => (
                    <Td key={offer.code}>
                      <Icon name="check" className="text-success" />
                      <span className="sr-only">{t("included")}</span>
                    </Td>
                  ))}
                </Tr>
                <Tr>
                  <RowHeader>{t("rows.cod")}</RowHeader>
                  {catalog.offers.map((offer) => (
                    <Td key={offer.code}>{t("merchantsOnly")}</Td>
                  ))}
                </Tr>
              </TBody>
            </Table>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="flex flex-col gap-2">
              <h2 className="text-h4">{t("parcelTypes.title")}</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {catalog.parcelTypes.map((type) => (
                  <li key={type.code} className="flex items-center justify-between gap-4">
                    <span>{t(`parcelTypes.${type.code}`)}</span>
                    <span className="text-muted">
                      <TextValue value={type.limit} placeholder="limit" />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="flex flex-col gap-2">
              <h2 className="text-h4">{t("extras.title")}</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {catalog.extras.map((extra) => (
                  <li key={extra.code} className="flex items-center justify-between gap-4">
                    <span>{t(`extras.${extra.code}`)}</span>
                    <span className="text-muted">
                      <FeeValue millimes={extra.feeMillimes} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Alert tone="warning">
            <b>{t("forbiddenLabel")}</b> {p("list")}. {t("forbiddenNote")}
          </Alert>
        </Container>
      </Section>
    </>
  );
}
