import { NoRole } from "@/components/no-role";
import { resolveLocale, type PageParams } from "@/lib/page";

export default async function NoRolePage({ params }: PageParams) {
  await resolveLocale(params);
  return <NoRole />;
}
