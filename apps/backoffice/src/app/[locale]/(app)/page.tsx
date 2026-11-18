import { resolveLocale, type PageParams } from "@/lib/page";

/** "/" in a language: the guard of the layout sends the person to the landing page of their role. */
export default async function HomePage({ params }: PageParams) {
  await resolveLocale(params);
  return null;
}
