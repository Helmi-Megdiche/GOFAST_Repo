import { Suspense } from "react";
import { SignInForm } from "@/components/sign-in-form";
import { resolveLocale, type PageParams } from "@/lib/page";

/** A00. The form reads ?next= and ?refused= in the browser, so the page stays static. */
export default async function SignInPage({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
