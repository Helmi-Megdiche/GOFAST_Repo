import type { ReactNode } from "react";
import { Card, Logo } from "@fastgo/ui";
import { resolveLocale, type PageParams } from "@/lib/page";

/** A00 and /sans-role: no back-office chrome, one card on the navy page (docs/ui A00-Connexion). */
export default async function AuthLayout({ children, params }: { children: ReactNode } & PageParams) {
  await resolveLocale(params);
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-navy-deep p-4">
      <Card className="flex w-full max-w-[420px] flex-col gap-6 p-6 sm:p-8">
        <Logo variant="on-light" className="h-10 w-auto self-start" />
        {children}
      </Card>
    </main>
  );
}
