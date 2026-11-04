import { useTranslations } from "next-intl";
import { Button, Container, Logo } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";
import { HeaderNav } from "./header-nav";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileMenu } from "./mobile-menu";

/**
 * Navy header: logo, five links, language choice, "Connexion" and "Commander".
 * Below 900 px the links and buttons move into the mobile menu. No dark-mode toggle (L2).
 */
export function SiteHeader() {
  const t = useTranslations("nav");

  return (
    <header data-inverse className="relative bg-inverse text-on-inverse">
      <Container className="flex items-center gap-4 py-2 md:py-3.5">
        <Link href="/" className="shrink-0 rounded-sm">
          <Logo variant="on-dark" className="h-[30px] md:h-[32px]" />
        </Link>
        <HeaderNav className="hidden min-w-0 flex-1 md:block" />
        <div className="hidden items-center gap-3 md:flex">
          <LocaleSwitcher variant="on-dark" />
          <Button as={Link} href="/connexion" variant="inverse" size="sm" className="text-sm">
            {t("signIn")}
          </Button>
          <Button as={Link} href="/commander" size="sm" className="text-sm">
            {t("order")}
          </Button>
        </div>
        <MobileMenu />
      </Container>
    </header>
  );
}
