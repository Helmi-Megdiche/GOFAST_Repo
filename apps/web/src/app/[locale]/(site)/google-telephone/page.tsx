import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { GooglePhone } from "@/components/auth/google-phone";
import { GooglePhoneFromUrl } from "@/components/auth/with-next";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/google-telephone", "googlePhone", { noindex: true });

/** W22 (ESP-09). */
export default async function Page({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <AuthCard>
      <Suspense fallback={<GooglePhone next={null} />}>
        <GooglePhoneFromUrl />
      </Suspense>
    </AuthCard>
  );
}
