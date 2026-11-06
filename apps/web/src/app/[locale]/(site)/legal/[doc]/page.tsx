import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Chip, ChipNav, Container, Section } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { resolveLocale } from "@/lib/page";
import { pageMetadata } from "@/lib/seo";

// Unknown documents are a 404, not an empty page.
export const dynamicParams = false;

const DOCS = [
  { slug: "cgv", key: "cgv" },
  { slug: "confidentialite", key: "privacy" },
  { slug: "mentions-legales", key: "notice" },
  { slug: "cookies", key: "cookies" },
] as const;

type Props = { params: Promise<{ locale: string; doc: string }> };

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => DOCS.map((doc) => ({ locale, doc: doc.slug })));
}

export async function generateMetadata({ params }: Props) {
  const { locale, doc: slug } = await params;
  const doc = DOCS.find((item) => item.slug === slug);
  if (!doc || !routing.locales.includes(locale as (typeof routing.locales)[number])) return {};
  return pageMetadata({
    locale: locale as (typeof routing.locales)[number],
    path: `/legal/${doc.slug}`,
    key: doc.key,
  });
}

const CGV_SECTIONS = ["purpose", "cancellation", "liability", "data"] as const;

/** Legal documents (FE-05, W09-Legal). Every text is [TEXTE] until GOFAST's legal adviser provides it. */
export default async function LegalDocPage({ params }: Props) {
  await resolveLocale(params);
  const { doc: slug } = await params;
  const doc = DOCS.find((item) => item.slug === slug);
  if (!doc) notFound();

  const t = await getTranslations("legal");
  const p = await getTranslations("placeholders");

  return (
    <Section compact>
      <Container className="flex flex-col gap-8 md:flex-row">
        <ChipNav label={t("nav")} className="md:w-60 md:shrink-0">
          {DOCS.map((item) => (
            <Chip
              key={item.slug}
              as={Link}
              href={`/legal/${item.slug}`}
              aria-current={item.slug === doc.slug ? "page" : undefined}
            >
              {t(`docs.${item.key}`)}
            </Chip>
          ))}
        </ChipNav>
        <article className="flex max-w-[720px] min-w-0 flex-1 flex-col gap-4">
          <h1 className="text-d2">{t(`titles.${doc.key}`)}</h1>
          <p className="text-sm text-muted">{t("note")}</p>
          {doc.key === "cgv" ? (
            CGV_SECTIONS.map((section) => (
              <section key={section} className="flex flex-col gap-1">
                <h2 className="text-h4">{t(`cgvSections.${section}`)}</h2>
                <p className="text-muted">{p("text")}</p>
              </section>
            ))
          ) : (
            <p className="text-muted">{p("text")}</p>
          )}
        </article>
      </Container>
    </Section>
  );
}
