"use client";

import { useSearchParams } from "next/navigation";
import { TrackingView } from "./tracking-view";

/**
 * Reads ?n= in the browser (so the page stays static) and hands it to the view. Until then the
 * page shows <TrackingView code="" /> as the Suspense fallback.
 */
export function TrackingLookup() {
  return <TrackingView code={useSearchParams().get("n") ?? ""} />;
}
