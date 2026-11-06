import type { ReactNode } from "react";
import { Container } from "@fastgo/ui";
import { SignOutButton } from "@/components/account/sign-out-button";
import { SpaceNav } from "@/components/account/space-nav";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { resolveLocale, type PageParams } from "@/lib/page";

type Props = PageParams & { children: ReactNode };

/** Client space chrome (ESP-02): site header, the space nav and sign-out beside the page. */
export default async function AccountLayout({ children, params }: Props) {
  await resolveLocale(params);
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Container className="flex flex-col gap-6 py-8 md:flex-row md:items-start">
          <aside className="flex flex-col items-start gap-4 md:w-56">
            <SpaceNav kind="customer" />
            <SignOutButton />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
