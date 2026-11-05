import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { SignUpFromUrl } from "@/components/auth/with-next";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/inscription", "signUp", { noindex: true });

/** W19 (ESP-01). */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <AuthCard wide>
      <Suspense fallback={<SignUpForm next={null} />}>
        <SignUpFromUrl />
      </Suspense>
    </AuthCard>
  );
}
