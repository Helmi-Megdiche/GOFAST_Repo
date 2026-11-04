import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { resolveLocale, type PageParams } from "@/lib/page";

type Props = PageParams & { children: ReactNode };

/**
 * Public site chrome: header with the site nav, <main id="main">, footer.
 * lang and dir stay in [locale]/layout.tsx, the only place that sets them.
 */
export default async function SiteLayout({ children, params }: Props) {
  // next-intl needs this in every layout that renders translated server components; without it the
  // header reads the request headers and every page under this group stops being prerendered.
  await resolveLocale(params);

  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
