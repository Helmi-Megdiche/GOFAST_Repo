import { useTranslations } from "next-intl";
import { Button, Container, Ltr, Section } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";

/** Page not found (W10-Introuvable). Inside the layout, so the header and footer stay. */
export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <Section>
      <Container className="flex flex-col items-center gap-4 text-center">
        {/* orange-dark, not orange: plain orange on white is below 3:1 even for large text */}
        <p className="font-display text-[96px] leading-none font-bold text-orange-dark">
          <Ltr>404</Ltr>
        </p>
        <h1 className="text-d2">{t("title")}</h1>
        <p className="text-lead">{t("text")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button as={Link} href="/">
            {t("home")}
          </Button>
          <Button as={Link} href="/suivi" variant="secondary">
            {t("track")}
          </Button>
        </div>
      </Container>
    </Section>
  );
}
