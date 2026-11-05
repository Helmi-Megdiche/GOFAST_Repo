import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { CodePage } from "@/components/auth/code-page";
import { CodeFromUrl } from "@/components/auth/with-next";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/code", "code", { noindex: true });

/** W20 on the web chrome: sign-up, reset and Google. */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <AuthCard>
      <Suspense fallback={<CodePage next={null} />}>
        <CodeFromUrl />
      </Suspense>
    </AuthCard>
  );
}
