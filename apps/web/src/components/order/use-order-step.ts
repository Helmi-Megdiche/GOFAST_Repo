"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { findOrderByKey } from "@/lib/data/orders";
import { now } from "@/lib/order/clock";
import { editDraft, emptyDraft, loadDraft, saveDraft, type OrderDraft } from "@/lib/order/draft";
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
  const shown = useRef<OrderDraft | null>(null);

  /** Reads the saved draft again and applies the guard (on open, and after a refused edit). */
  const reload = useCallback(() => {
    const loaded = loadDraft();
    const target = redirectFor(loaded, step, now());
    if (target) {
      router.replace(STEP_PATHS[target]);
      return;
    }
    // W11 with no draft yet: save the empty one, so an edit can tell "new" from "cleared elsewhere".
    const next = loaded ?? saveDraft(emptyDraft());
    shown.current = next;
    setDraft(next);
  }, [router, step]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the draft lives in localStorage, read after mount
    reload();
  }, [reload]);

  /**
   * Saves a change right away (a reload keeps it, CMD-07), merged into the latest saved draft.
   * Refused when another tab cleared the draft (its order is shown if it exists) or is waiting for
   * an order answer (R202): this tab then shows what is saved instead.
   */
  const save = useCallback(
    (change: (draft: OrderDraft) => OrderDraft) => {
      const mine = shown.current;
      const next = mine ? editDraft(mine.idempotencyKey, change) : null;
      if (next) {
        shown.current = next;
        setDraft(next);
        return;
      }
      if (mine && loadDraft() == null) {
        void findOrderByKey(mine.idempotencyKey).then((code) => {
          if (code) router.replace(`/commander/confirmation?n=${code}`);
          else reload();
        });
        return;
      }
      reload();
    },
    [reload, router],
  );

  const goTo = useCallback(
    (target: keyof typeof STEP_PATHS) => {
      markStepChange();
      router.push(STEP_PATHS[target]);
    },
    [router],
  );

  return { draft, save, goTo, reload };
}
