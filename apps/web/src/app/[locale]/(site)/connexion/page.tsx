import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SignInFromUrl } from "@/components/auth/with-next";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/connexion", "signIn", { noindex: true });

/** W18 (ESP-01). */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <AuthCard>
      <Suspense fallback={<SignInForm next={null} />}>
        <SignInFromUrl />
      </Suspense>
    </AuthCard>
  );
}
