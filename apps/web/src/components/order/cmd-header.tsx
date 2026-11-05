import { useTranslations } from "next-intl";
import { Container, Logo } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "../locale-switcher";

/**
 * Order flow chrome (decision 1): logo, language choice and "Enregistrer et quitter". No site nav,
 * no footer, no dark-mode button (L2). The draft is saved on every change, so leaving keeps it.
 */
export function CmdHeader() {
  const t = useTranslations("cmd");
  return (
    <header data-inverse className="bg-inverse text-on-inverse">
      <Container className="flex items-center justify-between gap-2 py-2 sm:gap-3 sm:py-3">
        <Link href="/" aria-label={t("homeLabel")} className="shrink-0 rounded-sm">
          <Logo variant="on-dark" alt="" className="h-[24px] sm:h-[36px]" />
        </Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          <LocaleSwitcher variant="on-dark" />
          <Link
            href="/"
            className="min-w-0 text-end text-xs leading-tight font-medium text-on-inverse underline-offset-4 hover:underline sm:text-sm"
          >
            {t("saveAndQuit")}
          </Link>
        </div>
      </Container>
    </header>
  );
}
