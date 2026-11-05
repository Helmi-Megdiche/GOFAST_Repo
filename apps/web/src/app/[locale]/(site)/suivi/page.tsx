import { Suspense } from "react";
import { TrackingLookup } from "@/components/tracking/tracking-lookup";
import { TrackingView } from "@/components/tracking/tracking-view";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/suivi", "tracking");

/**
 * Public tracking (SUI-01, W04-Suivi). The number comes from ?n=, read in the browser so the page
 * stays statically rendered. The fallback is the page itself with an empty code: the server HTML
 * already has the h1 and the form.
 */
export default async function TrackingPage({ params }: PageParams) {
  await resolveLocale(params);
  return (
    <Suspense fallback={<TrackingView code="" />}>
      <TrackingLookup />
    </Suspense>
  );
}
