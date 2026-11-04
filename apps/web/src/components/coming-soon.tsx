import { useTranslations } from "next-intl";
import { Button, Container, Section } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";

/** Placeholder for pages that arrive later (/commander, /connexion, /inscription). Never indexed. */
export function ComingSoon({ page }: { page: "order" | "signIn" | "signUp" }) {
  const t = useTranslations("comingSoon");
  return (
    <Section compact>
      <Container className="flex flex-col items-start gap-4 py-10">
        <p className="text-eyebrow">{t("title")}</p>
        <h1 className="text-d2">{t(`pages.${page}`)}</h1>
        <p className="text-lead">{t("text")}</p>
        <Button as={Link} href="/">
          {t("home")}
        </Button>
      </Container>
    </Section>
  );
}
