import { useTranslations } from "next-intl";
import { Button, Container, Logo } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";
import { HeaderNav } from "./header-nav";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileMenu } from "./mobile-menu";

/**
 * Navy header: logo, five links, language choice, "Connexion" and "Commander".
 * Below 1100 px the links and buttons move into the mobile menu. No dark-mode toggle (L2).
 */
export function SiteHeader() {
  const t = useTranslations("nav");

  return (
    <header data-inverse className="relative bg-inverse text-on-inverse">
      <Container className="flex items-center gap-4 py-2 min-[1100px]:py-3.5">
        <Link href="/" className="shrink-0 rounded-sm">
          <Logo variant="on-dark" className="h-[30px] min-[1100px]:h-[32px] lg:h-[42px]" />
        </Link>
        <HeaderNav className="hidden min-w-0 flex-1 min-[1100px]:block" />
        <div className="hidden items-center gap-3 min-[1100px]:flex">
          <LocaleSwitcher variant="on-dark" />
          {/* compact from 1100 px (burger menu below), the mockup size (h-11, 16 px text) from 1200 px */}
          <Button
            as={Link}
            href="/connexion"
            variant="inverse"
            size="sm"
            className="text-sm lg:h-11 lg:rounded-md lg:px-[18px] lg:text-md"
          >
            {t("signIn")}
          </Button>
          <Button
            as={Link}
            href="/commander"
            size="sm"
            className="text-sm lg:h-11 lg:rounded-md lg:px-[18px] lg:text-md"
          >
            {t("order")}
          </Button>
        </div>
        <MobileMenu />
      </Container>
    </header>
  );
}
