"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, Logo, NavGroup, NavItem, Sidebar, UserMenu } from "@fastgo/ui";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { groupsFor, pathOf } from "@/lib/nav";
import type { BackofficeRole } from "@fastgo/domain";
import { LocaleSwitcher } from "./locale-switcher";
import { useSession } from "./session";

/**
 * The shell of every back-office page: the sidebar of the role (only what its DR rows allow, with no count badges: they are example
 * data in the mockup), the user menu, and `<main id="main">`. In 25b the screens are placeholders; the dashboard is #26.
 */
export function AppShell({ role, name, children }: { role: BackofficeRole; name: string; children: ReactNode }) {
  const t = useTranslations("backoffice");
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useSession();

  return (
    <div className="min-h-screen bg-page md:flex">
      <Sidebar
        label={t("shell.navLabel")}
        logo={<Logo variant="on-dark" className="h-8 w-auto" />}
        menuLabel={t("shell.menu")}
        closeLabel={t("shell.closeMenu")}
        footer={
          <UserMenu name={name} roleLabel={t(`roles.${role}`)} label={t("shell.user")}>
            <LocaleSwitcher />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void signOut().then(() => router.replace("/connexion"));
              }}
            >
              {t("shell.signOut")}
            </Button>
          </UserMenu>
        }
      >
        {groupsFor(role).map((group) => (
          <NavGroup key={group.key} label={t(`nav.groups.${group.key}`)}>
            {group.items.map((item) => (
              <NavItem key={item.id} as={Link} href={pathOf(item.slug)} icon={item.icon} current={pathname === pathOf(item.slug)}>
                {t(`nav.items.${item.label}`)}
              </NavItem>
            ))}
          </NavGroup>
        ))}
      </Sidebar>
      <main id="main" className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
