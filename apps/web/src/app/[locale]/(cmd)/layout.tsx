import type { ReactNode } from "react";
import { CmdHeader } from "@/components/order/cmd-header";
import { resolveLocale, type PageParams } from "@/lib/page";

type Props = PageParams & { children: ReactNode };

/**
 * Order flow chrome (W11 to W17, decision 1): logo, language, "Enregistrer et quitter", no site
 * nav or footer. lang and dir stay in [locale]/layout.tsx, the only place that sets them.
 */
export default async function CmdLayout({ children, params }: Props) {
  await resolveLocale(params);
  return (
    <>
      <CmdHeader />
      <main id="main" className="min-h-[calc(100dvh-56px)] bg-surface">
        {children}
      </main>
    </>
  );
}
