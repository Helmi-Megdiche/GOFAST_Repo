import { useTranslations } from "next-intl";
import { Button } from "@fastgo/ui";
import { SiteHeader } from "@/components/site-header";
import { Link } from "@/i18n/navigation";

// The full 404 page (W10-Introuvable) is built with the public site.
export default function NotFound() {
  const t = useTranslations();
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-4 py-16 md:px-6"
      >
        <h1 className="text-d2">{t("notFound.title")}</h1>
        <Button as={Link} href="/">
          {t("common.home")}
        </Button>
      </main>
    </>
  );
}
