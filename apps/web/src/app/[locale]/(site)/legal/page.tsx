import { redirect } from "@/i18n/navigation";
import { resolveLocale, type PageParams } from "@/lib/page";

/** /legal has no content of its own: it opens the terms of sale. */
export default async function LegalIndexPage({ params }: PageParams) {
  const locale = await resolveLocale(params);
  redirect({ href: "/legal/cgv", locale });
}
