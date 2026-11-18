import type { ReactNode } from "react";
import { RequireStaff } from "@/components/require-staff";
import { resolveLocale, type PageParams } from "@/lib/page";

/** The back-office shell: the guard, the sidebar of the role and `<main id="main">`. */
export default async function AppLayout({ children, params }: { children: ReactNode } & PageParams) {
  await resolveLocale(params);
  return <RequireStaff>{children}</RequireStaff>;
}
