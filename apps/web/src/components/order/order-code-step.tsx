"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useLocale } from "next-intl";
import type { Locale } from "@fastgo/i18n";
import { Card } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { AccountExists, CodeVerification } from "@/components/auth/code-verification";
import { claimOrderPhone, isVerifiedPhoneForSession } from "@/lib/data/accounts";
import { editDraft } from "@/lib/order/draft";
import { draftPhoneProven, STEP_PATHS } from "@/lib/order/steps";
import { handOffRefusal, submitOrder } from "@/lib/order/submit";
import { maskPhone, normalizePhone } from "@/lib/phone";
import { StepBusy } from "./busy";
import { markStepChange } from "./step-heading";
import { useOrderStep } from "./use-order-step";

/**
 * W20 inside the order flow (CMD-03): the right code creates the light account (for a guest),
 * then the order, exactly once (same idempotency key). A phone that already has an account is
 * asked to sign in. The order is sent only from the verified callback, never on opening the page.
 */
export function OrderCodeStep({ heading }: { heading: ReactNode }) {
  const { draft, goTo } = useOrderStep("review");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const started = useRef(false);

  const phone = draft ? normalizePhone(draft.sender.phone) : null;
  // Nothing to check here (no payment or CGV, answer pending, phone already verified and still
  // accepted by the server): W15. A verification past its window needs a new code.
  const needsCode =
    draft != null &&
    phone != null &&
    draft.payment != null &&
    draft.termsAccepted &&
    (draft.payment !== "cashDelivery" || draft.freightPayerAccepted === true) &&
    draft.pendingSubmit == null &&
    !draftPhoneProven(draft) &&
    !isVerifiedPhoneForSession(draft.sender.phone);

  useEffect(() => {
    if (draft && !needsCode && !started.current) goTo("review");
  }, [draft, needsCode, goTo]);

  async function placeOrder(verified: NonNullable<typeof draft>): Promise<void> {
    const result = await submitOrder(verified);
    if (result.status === "created") {
      markStepChange();
      router.push(`/commander/confirmation?n=${result.code}`);
      return;
    }
    // Refused (W15 shows why, and recalculates an expired price), lost (W15 offers the retry with
    // the same payload) or incomplete: W15 handles each.
    if (result.status === "refused") handOffRefusal(result.error);
    goTo("review");
  }

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4">
      <Card className="flex flex-col gap-4 p-8 text-center">
        {heading}
        {draft && phone && needsCode ? (
          <CodeVerification
            target={{ channel: "sms", value: phone }}
            maskedTarget={maskPhone(phone)}
            purpose="order"
            onVerified={async () => {
              started.current = true;
              // R101: this phone belongs to another account. Said only after the right code.
              if (claimOrderPhone({ name: draft.sender.name, phone }) === "accountExists") {
                return (
                  <AccountExists
                    signInHref={`/${locale}/connexion?next=${encodeURIComponent(STEP_PATHS.review)}`}
                  />
                );
              }
              const verified = editDraft(draft.idempotencyKey, (latest) => ({
                ...latest,
                verifiedPhone: phone,
              }));
              if (!verified) {
                goTo("review");
                return;
              }
              return placeOrder(verified);
            }}
          />
        ) : (
          <StepBusy />
        )}
      </Card>
    </div>
  );
}
