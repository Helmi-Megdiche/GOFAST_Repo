import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { NewPasswordFromUrl } from "@/components/auth/with-next";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/mot-de-passe/nouveau", "passwordNew", { noindex: true });

/** New password: proposed step, not in the mockup. */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <AuthCard>
      <Suspense fallback={<NewPasswordForm next={null} />}>
        <NewPasswordFromUrl />
      </Suspense>
    </AuthCard>
  );
}
