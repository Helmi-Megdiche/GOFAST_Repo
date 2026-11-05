"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { now } from "@/lib/order/clock";
import { loadDraft } from "@/lib/order/draft";
import { redirectFor, STEP_PATHS } from "@/lib/order/steps";
import { StepBusy } from "./busy";

/** /commander: continues the saved draft at its first incomplete step (CMD-07), or starts at W11. */
export function OrderEntry() {
  const router = useRouter();
  useEffect(() => {
    router.replace(STEP_PATHS[redirectFor(loadDraft(), "review", now()) ?? "review"]);
  }, [router]);
  return <StepBusy />;
}
