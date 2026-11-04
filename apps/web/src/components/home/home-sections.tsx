import { useTranslations } from "next-intl";
import { Button, Card, Container, Icon, KeyValue, Ltr, Section, type IconName } from "@fastgo/ui";
import { DateTime, Money } from "@/components/money";
import { PriceValue } from "@/components/placeholder-values";
import { Link } from "@/i18n/navigation";
import { HOME_EXAMPLE } from "@/lib/data/fixtures/home-example";
import type { ServiceCatalog } from "@/lib/data/services";

/** Three promises and the link to the merchants page. */
export function PromiseStrip() {
  const t = useTranslations("home.promise");
  const items: { icon: IconName; text: string }[] = [
    { icon: "rcpt", text: t("price") },
    { icon: "shield", text: t("proof") },
    { icon: "cash", text: t("cash") },
  ];
  return (
    <section className="border-b border-line bg-surface">
      <Container className="flex flex-wrap items-center gap-x-8 gap-y-3 py-4 text-sm font-medium">
        {items.map((item) => (
          <div key={item.icon} className="flex items-center gap-2">
            <Icon name={item.icon} className="text-orange" />
            <span>{item.text}</span>
          </div>
        ))}
        <Link
          href="/commercants"
          className="ms-auto flex items-center gap-1.5 font-semibold text-ink underline underline-offset-4"
        >
          {t("merchants")}
          <Icon name="ar" size="sm" />
        </Link>
      </Container>
    </section>
  );
}

/** Express, Standard, Programmée with the starting price (placeholder until FastGo sets it). */
export function OffersSection({ offers }: { offers: ServiceCatalog["offers"] }) {
  const t = useTranslations("home.offers");
  const o = useTranslations("offers");
  const c = useTranslations("common");

  return (
    <Section>
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-d2">{t("title")}</h2>
          <Button as={Link} href="/services" variant="secondary" size="sm" className="text-sm">
            {t("compare")}
          </Button>
        </div>
        <ul className="grid border-t-2 border-navy sm:grid-cols-3">
          {offers.map((offer) => (
            <li
              key={offer.code}
              className="flex flex-col gap-1.5 border-line pt-6 pb-2 not-first:border-t not-first:pt-6 sm:pe-8 sm:not-first:border-t-0 sm:not-first:border-s sm:not-first:ps-8"
            >
              <h3 className="mb-2.5 font-display text-[clamp(26px,2.5vw,33px)] leading-[1.1] font-extrabold tracking-[-0.025em] italic rtl:font-bold rtl:tracking-normal rtl:not-italic">
                {o(`${offer.code}.delay`)}
              </h3>
              <p className="text-base font-semibold">{o(`${offer.code}.name`)}</p>
              <p className="text-base text-muted">{o(`${offer.code}.tagline`)}</p>
              <p className="mt-3 text-sm font-medium">
                {c("from")} <PriceValue millimes={offer.fromPriceMillimes} />
              </p>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

/** Four numbered steps and what the recipient receives. All figures are fake and labelled "Exemple". */
export function StepsSection() {
  const t = useTranslations("home");
  const steps = ["order", "pickup", "recipient", "proof"] as const;

  return (
    <Section tone="tint">
      <Container className="flex flex-col gap-12 md:flex-row md:items-center md:gap-[72px]">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <h2 className="text-d2">{t("steps.title")}</h2>
          <ol className="flex flex-col gap-6">
            {steps.map((step, index) => (
              <li key={step} className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    index === 3 ? "bg-orange text-navy-deep" : "bg-navy text-white"
                  }`}
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-h4">{t(`steps.${step}.title`)}</h3>
                  <p className="text-muted">{t(`steps.${step}.text`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-muted">{t("steps.payment")}</p>
        </div>

        <div className="flex w-full flex-col gap-3 md:w-[360px] md:shrink-0">
          <p className="text-sm font-semibold">{t("recipient.title")}</p>
          <Card className="flex flex-col gap-3 rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">{t("example.arrivesAround")}</span>
              <Ltr mono className="text-xs text-muted">
                {HOME_EXAMPLE.trackingCode}
              </Ltr>
            </div>
            <p className="font-display text-[56px] leading-none font-bold">
              <DateTime value={HOME_EXAMPLE.etaUtc} style="time" />
            </p>
            <p className="text-sm text-muted">
              {t("recipient.status", {
                driver: t("example.driver"),
                merchant: t("example.merchant"),
              })}
            </p>
            <hr className="border-line" />
            <KeyValue
              items={[
                {
                  term: t("recipient.cashToPay"),
                  value: <Money millimes={HOME_EXAMPLE.cashToPayMillimes} />,
                },
                { term: t("recipient.code"), value: <Ltr>{HOME_EXAMPLE.deliveryCode}</Ltr> },
              ]}
            />
            {/* An illustration of the recipient's button, not a control */}
            <Button as="span" fullWidth>
              <Icon name="pin" size="sm" />
              {t("recipient.share")}
            </Button>
          </Card>
          <p className="text-xs text-muted">{t("recipient.note")}</p>
        </div>
      </Container>
    </Section>
  );
}

/** Merchant pitch with an example statement. */
export function MerchantsBand() {
  const t = useTranslations("home.merchants");
  const { statement } = HOME_EXAMPLE;

  return (
    <Section tone="deep">
      <Container className="flex flex-col gap-10 md:flex-row md:items-center md:gap-14">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <h2 className="text-d2">{t("title")}</h2>
          <p className="text-lead text-on-inverse-muted!">{t("text")}</p>
          <div className="pt-2">
            <Button as={Link} href="/commercants" size="lg">
              {t("cta")}
            </Button>
          </div>
        </div>
        <Card className="w-full text-ink md:w-[360px] md:shrink-0">
          <p className="text-xs text-muted">{t("receivable")}</p>
          <p className="font-display text-[34px] leading-tight font-bold">
            <Money millimes={statement.receivableMillimes} />
          </p>
          <hr className="my-3.5 border-line" />
          <KeyValue
            items={[
              { term: t("collected"), value: <Money millimes={statement.collectedMillimes} /> },
              { term: t("fees"), value: <Money millimes={statement.feesMillimes} /> },
            ]}
          />
          <p className="mt-3 text-xs text-muted">{t("sample")}</p>
        </Card>
      </Container>
    </Section>
  );
}

/** "Votre quartier est-il couvert ?" with the launch city placeholder. */
export function CoverageBand() {
  const t = useTranslations("home.coverage");
  const p = useTranslations("placeholders");
  return (
    <Section compact>
      <Container className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <h2 className="text-d3">{t("title")}</h2>
          <p className="text-muted">{t("text", { city: p("city") })}</p>
        </div>
        <Button as={Link} href="/zones" variant="secondary" size="sm" className="text-sm">
          {t("cta")}
        </Button>
      </Container>
    </Section>
  );
}
