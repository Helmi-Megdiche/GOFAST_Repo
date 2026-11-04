import { Suspense } from "react";
import { TrackingLookup } from "@/components/tracking/tracking-lookup";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/suivi", "tracking");

/**
 * Public tracking (SUI-01, W04-Suivi). The number can come from ?n= (the home page uses it):
 * it is read in the browser, so the page itself stays statically rendered.
 */
export default async function TrackingPage({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <Suspense>
      <TrackingLookup />
    </Suspense>
  );
}
