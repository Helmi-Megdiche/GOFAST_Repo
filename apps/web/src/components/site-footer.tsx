import { useTranslations } from "next-intl";
import { Container, Logo } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";

type FooterLink = { href: string; label: string };

function Column({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-on-inverse">{title}</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-on-inverse-muted no-underline hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Logo and tagline, three link columns, then the contact line (placeholders until FastGo sends them). */
export function SiteFooter() {
  const t = useTranslations("footer");
  const p = useTranslations("placeholders");

  return (
    <footer data-inverse className="bg-inverse-deep text-on-inverse">
      <Container className="flex flex-col gap-10 py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div className="flex flex-col gap-3">
            <Link href="/" className="w-fit rounded-sm">
              <Logo variant="on-dark" className="h-[34px]" />
            </Link>
            <p className="max-w-[260px] text-sm text-on-inverse-muted">{t("tagline")}</p>
          </div>
          <Column
            title={t("servicesTitle")}
            links={[
              { href: "/services", label: t("offers") },
              { href: "/zones", label: t("zones") },
              { href: "/commercants", label: t("merchants") },
            ]}
          />
          <Column
            title={t("helpTitle")}
            links={[
              { href: "/aide", label: t("faq") },
              { href: "/contact", label: t("contact") },
              { href: "/livreur", label: t("driver") },
            ]}
          />
          <Column
            title={t("legalTitle")}
            links={[
              { href: "/legal/cgv", label: t("terms") },
              { href: "/legal/confidentialite", label: t("privacy") },
              { href: "/legal/mentions-legales", label: t("notice") },
            ]}
          />
        </div>
        <p className="border-t border-inverse-line pt-6 text-xs text-on-inverse-muted">
          {p("phone")} · {p("email")} · {p("address")}
        </p>
      </Container>
    </footer>
  );
}
