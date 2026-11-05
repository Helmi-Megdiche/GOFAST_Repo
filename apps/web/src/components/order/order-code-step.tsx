"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@fastgo/i18n";
import { Alert, Card } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { AccountExists, CodeVerification } from "@/components/auth/code-verification";
import {
  createLightAccount,
  findByPhone,
  isVerifiedPhoneForSession,
  sessionFor,
} from "@/lib/data/accounts";
import { getSession, setSession } from "@/lib/data/session";
import { saveDraft } from "@/lib/order/draft";
import { draftPhoneVerified, STEP_PATHS } from "@/lib/order/steps";
import { submitOrder } from "@/lib/order/submit";
import { maskPhone, normalizePhone } from "@/lib/phone";
import { StepBusy } from "./busy";
import { markStepChange } from "./step-heading";
import { useOrderStep } from "./use-order-step";

/**
 * W20 inside the order flow (CMD-03): the right code creates the light account, then the order,
 * exactly once (same idempotency key). A phone that already has an account is asked to sign in.
 */
export function OrderCodeStep({ heading }: { heading: ReactNode }) {
  const { draft, goTo } = useOrderStep("review");
  const t = useTranslations("order");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const started = useRef(false);

  async function placeOrder(verified: NonNullable<typeof draft>): Promise<ReactNode | void> {
    const result = await submitOrder(verified, locale);
    if (result.status === "created") {
      markStepChange();
      router.push(`/commander/confirmation?n=${result.code}`);
      return;
    }
    if (result.status === "refused")
      return <Alert tone="error">{t(`review.errors.${result.error}`)}</Alert>;
    // Lost answer or incomplete draft: W15 offers the retry with the same payload.
    goTo("review");
  }

  // Not ready to validate (no payment or CGV): back to W15. Already verified: order right away.
  useEffect(() => {
    if (!draft || started.current) return;
    if (!draft.payment || !draft.termsAccepted) {
      goTo("review");
      return;
    }
    if (draftPhoneVerified(draft) || isVerifiedPhoneForSession(draft.sender.phone)) {
      started.current = true;
      void placeOrder(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const phone = draft ? normalizePhone(draft.sender.phone) : null;
  const skip =
    draft != null && (draftPhoneVerified(draft) || isVerifiedPhoneForSession(draft.sender.phone));

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4">
      <Card className="flex flex-col gap-4 p-8 text-center">
        {heading}
        {draft && phone && !skip && draft.payment && draft.termsAccepted ? (
          <CodeVerification
            target={{ channel: "sms", value: phone }}
            maskedTarget={maskPhone(phone)}
            purpose="order"
            onVerified={async () => {
              const session = getSession();
              const owner = findByPhone(phone);
              // R101: this phone belongs to another account. Said only after the right code.
              if (owner && owner.id !== session?.accountId) {
                return (
                  <AccountExists
                    signInHref={`/${locale}/connexion?next=${encodeURIComponent(STEP_PATHS.review)}`}
                  />
                );
              }
              const verified = saveDraft({ ...draft, verifiedPhone: phone });
              if (!owner) {
                const created = createLightAccount({ name: draft.sender.name, phone });
                if (created.status === "created") setSession(sessionFor(created.account));
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
