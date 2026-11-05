"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Button } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { attachPhone, createAccount, findByEmail, sessionFor } from "@/lib/data/accounts";
import { clearPendingGoogle, markGoogleEmailVerified, pendingGoogle } from "@/lib/data/google";
import { consumeVerification } from "@/lib/data/otp";
import { setSession } from "@/lib/data/session";
import { currentFlow, endFlow, type AuthFlow } from "@/lib/auth/flow";
import { withNext } from "@/lib/auth/next";
import { safeNext } from "@/lib/auth/safe-next";
import { maskEmail, maskPhone, normalizePhone } from "@/lib/phone";
import { AccountExists, CodeVerification } from "./code-verification";

/**
 * W20 on the web chrome: the code step of sign-up, password reset and Google. The step in progress
 * lives in memory only, so a reload (which forgets the sign-up password) goes back to W19.
 */
export function CodePage({ next }: { next: string | null }) {
  const t = useTranslations("auth.code");
  const router = useRouter();
  const locale = useLocale();
  const [flow, setFlow] = useState<AuthFlow | null | undefined>(undefined);

  useEffect(() => {
    const found = currentFlow();
    if (!found) {
      router.replace(withNext("/inscription", next));
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the flow is read after mount
    setFlow(found);
  }, [router, next]);

  const heading = <h1 className="text-d3">{t("title")}</h1>;
  if (!flow) return heading;

  const signInHref = `/${locale}/connexion${next ? `?next=${encodeURIComponent(safeNext(next))}` : ""}`;
  const finish = () => {
    endFlow();
    router.push(safeNext(flow.next || next));
  };

  if (flow.kind === "googleEmail") {
    const pending = pendingGoogle();
    if (!pending) return heading;
    return (
      <>
        {heading}
        <CodeVerification
          target={{ channel: "email", value: pending.email }}
          maskedTarget={maskEmail(pending.email)}
          purpose="googleEmail"
          onVerified={async () => {
            markGoogleEmailVerified();
            endFlow();
            router.push(withNext("/google-telephone", next));
          }}
        />
      </>
    );
  }

  const phone = normalizePhone(flow.kind === "signUp" ? flow.account.phone : flow.phone) ?? "";
  const purpose =
    flow.kind === "signUp" ? "signUp" : flow.kind === "reset" ? "reset" : "googlePhone";

  async function onVerified(): Promise<ReactNode | void> {
    if (!flow) return;
    if (flow.kind === "reset") {
      router.push(withNext("/mot-de-passe/nouveau", next));
      return;
    }
    if (flow.kind === "signUp") {
      const created = createAccount({ ...flow.account, phone });
      if (created.status === "phoneTaken") return <AccountExists signInHref={signInHref} />;
      if (created.status === "emailTaken") return <EmailTaken signInHref={signInHref} />;
      if (created.status !== "created") return;
      consumeVerification({ channel: "sms", value: phone });
      setSession(sessionFor(created.account));
      finish();
      return;
    }
    // Google: a known e-mail joins its account (R103), a new one creates the account. Phone always required.
    const pending = pendingGoogle();
    if (!pending) return;
    const known = findByEmail(pending.email);
    const result = known
      ? attachPhone(known.id, phone)
      : createAccount({
          kind: pending.kind,
          name: pending.name,
          phone,
          email: pending.email,
          google: true,
        });
    if (result.status === "phoneTaken") return <AccountExists signInHref={signInHref} />;
    if (result.status !== "created") return;
    consumeVerification({ channel: "sms", value: phone });
    setSession(sessionFor(result.account));
    clearPendingGoogle();
    finish();
  }

  return (
    <>
      {heading}
      <CodeVerification
        target={{ channel: "sms", value: phone }}
        maskedTarget={maskPhone(phone)}
        purpose={purpose}
        onVerified={onVerified}
      />
    </>
  );
}

function EmailTaken({ signInHref }: { signInHref: string }) {
  const t = useTranslations("auth.signUp");
  const s = useTranslations("auth.signIn");
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning">{t("emailTaken")}</Alert>
      <Button as="a" href={signInHref}>
        {s("submit")}
      </Button>
    </div>
  );
}
