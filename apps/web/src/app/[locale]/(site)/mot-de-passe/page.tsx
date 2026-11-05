import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forgot-form";
import { ForgotFromUrl } from "@/components/auth/with-next";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/mot-de-passe", "passwordForgot", { noindex: true });

/** W21. */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <AuthCard>
      <Suspense fallback={<ForgotForm next={null} />}>
        <ForgotFromUrl />
      </Suspense>
    </AuthCard>
  );
}
