"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { now } from "@/lib/order/clock";
import { emptyDraft, loadDraft, saveDraft, type OrderDraft } from "@/lib/order/draft";
import { redirectFor, STEP_PATHS, type StepId } from "@/lib/order/steps";
import { markStepChange } from "./step-heading";

/**
 * Loads the draft for a step and applies the step guard: someone who opens a later step directly
 * goes to the first incomplete one (and an out-of-zone address goes to W17). While the draft loads
 * the page shows its h1 and a busy placeholder.
 */
export function useOrderStep(step: StepId) {
  const router = useRouter();
  const [draft, setDraft] = useState<OrderDraft | null>(null);

  useEffect(() => {
    const loaded = loadDraft();
    const target = redirectFor(loaded, step, now());
    if (target) {
      router.replace(STEP_PATHS[target]);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the draft lives in localStorage, read after mount
    setDraft(loaded ?? emptyDraft());
  }, [router, step]);

  /** Saves a change right away (a reload keeps it, CMD-07). */
  const save = useCallback((change: (draft: OrderDraft) => OrderDraft) => {
    setDraft((current) => {
      const next = saveDraft(change(current ?? loadDraft() ?? emptyDraft()));
      return next;
    });
  }, []);

  const goTo = useCallback(
    (target: keyof typeof STEP_PATHS) => {
      markStepChange();
      router.push(STEP_PATHS[target]);
    },
    [router],
  );

  return { draft, save, goTo };
}
