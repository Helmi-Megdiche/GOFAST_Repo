import { getTranslations } from "next-intl/server";
import { Button, Card, Container, Icon, KeyValue, Section, type IconName } from "@fastgo/ui";
import { Money } from "@/components/money";
import { Link } from "@/i18n/navigation";
import { MERCHANT_EXAMPLE } from "@/lib/data/fixtures/home-example";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/commercants", "merchants");

const BENEFITS: {
  key: "import" | "cod" | "returns" | "pickups" | "invoice" | "connect";
  icon: IconName;
}[] = [
  { key: "import", icon: "ul" },
  { key: "cod", icon: "cash" },
  { key: "returns", icon: "ref" },
  { key: "pickups", icon: "bldg" },
  { key: "invoice", icon: "rcpt" },
  { key: "connect", icon: "code" },
];

/** Merchant offer. Reference: W03-Commercants. The quote form is replaced by a link to /contact?type=devis. */
export default async function MerchantsPage({ params }: PageParams) {
  await resolveLocale(params);
  const t = await getTranslations("merchants");
  const example = MERCHANT_EXAMPLE;

  return (
    <>
      <Section tone="dark" compact>
        <Container className="flex flex-col gap-10 md:flex-row md:items-center md:gap-12">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <p className="text-eyebrow text-accent-on-inverse!">{t("eyebrow")}</p>
            <h1 className="text-d1-md">{t("title")}</h1>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button as="a" href="#devis" size="lg">
                {t("quote")}
              </Button>
              <Button as={Link} href="/inscription" variant="inverse" size="lg">
                {t("signUp")}
              </Button>
            </div>
          </div>
          <Card className="w-full text-ink md:w-[360px] md:shrink-0">
            <p className="mb-2.5 font-semibold">{t("statement.title")}</p>
            <KeyValue
              items={[
                {
                  term: t("statement.delivered"),
                  value: t("statement.deliveredValue", { count: example.delivered }),
                },
                {
                  term: t("statement.returned"),
                  value: t("statement.deliveredValue", { count: example.returned }),
                },
                {
                  term: t("statement.collected"),
                  value: <Money millimes={example.collectedMillimes} />,
                },
                { term: t("statement.fees"), value: <Money millimes={example.feesMillimes} /> },
              ]}
            />
            <hr className="my-3 border-line" />
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{t("statement.receivable")}</span>
              <span className="font-display text-[22px] font-bold">
                <Money millimes={example.receivableMillimes} />
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">{t("statement.sample")}</p>
          </Card>
        </Container>
      </Section>

      <Section>
        <Container className="flex flex-col gap-8">
          <h2 className="max-w-[640px] text-d2">{t("benefits.title")}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <li key={benefit.key}>
                <Card className="flex h-full flex-col gap-2">
                  <Icon name={benefit.icon} size="lg" className="text-orange-dark" />
                  <h3 className="text-h4">{t(`benefits.${benefit.key}.title`)}</h3>
                  <p className="text-sm text-muted">{t(`benefits.${benefit.key}.text`)}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section tone="tint" id="devis">
        <Container className="flex flex-col items-start gap-4">
          <h2 className="text-d2">{t("talk.title")}</h2>
          <p className="text-lead">{t("talk.text")}</p>
          <Button as={Link} href="/contact?type=devis" size="lg">
            {t("talk.cta")}
          </Button>
        </Container>
      </Section>
    </>
  );
}
