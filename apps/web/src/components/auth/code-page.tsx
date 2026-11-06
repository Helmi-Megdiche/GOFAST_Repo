"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Button } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import { attachPhone, createAccount, findByEmail, sessionFor } from "@/lib/data/accounts";
import { clearPendingGoogle, markGoogleEmailVerified, pendingGoogle } from "@/lib/data/google";
import { consumeVerification } from "@/lib/data/otp";
import { getSession, setSession } from "@/lib/data/session";
import { currentFlow, endFlow, type AuthFlow } from "@/lib/auth/flow";
import { afterSignInPath, withNext } from "@/lib/auth/next";
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
    // Google: no sign-in in progress (expired, signed out, another tab), or a known e-mail not
    // confirmed yet (R103, e.g. changed in another tab): back to W22, which asks for the e-mail code.
    if (
      (found.kind === "googleEmail" || found.kind === "googlePhone") &&
      !googleStepAllowed(found)
    ) {
      endFlow();
      router.replace(withNext("/google-telephone", next));
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the flow is read after mount
    setFlow(found);
  }, [router, next]);

  const heading = <h1 className="text-d3">{t("title")}</h1>;
  if (!flow) return heading;

  const signInHref = `/${locale}/connexion${next ? `?next=${encodeURIComponent(safeNext(next))}` : ""}`;
  // After the account is created the session exists: no ?next= means the person's home.
  const destination = () => {
    const session = getSession();
    return session ? afterSignInPath(flow.next || next, session) : safeNext(flow.next || next);
  };
  const finish = () => {
    endFlow();
    router.push(destination());
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
      // The SMS code proves the phone only. The typed e-mail is never attached here: it will be
      // attached after a code sent to it. Taken or not, the same message (no e-mail enumeration).
      const typedEmail = flow.account.email.trim() !== "";
      const created = createAccount({ ...flow.account, phone, email: null });
      if (created.status === "phoneTaken") return <AccountExists signInHref={signInHref} />;
      if (created.status !== "created") return;
      consumeVerification({ channel: "sms", value: phone }, "signUp");
      setSession(sessionFor(created.account));
      if (typedEmail) {
        endFlow();
        return <EmailLater onContinue={() => router.push(destination())} />;
      }
      finish();
      return;
    }
    // Google: a known e-mail joins its account (R103), a new one creates the account. Phone always
    // required. Checked again here: another tab may have changed the Google sign-in meanwhile.
    const pending = pendingGoogle();
    if (!pending || !googleStepAllowed(flow)) {
      endFlow();
      router.replace(withNext("/google-telephone", next));
      return;
    }
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
    if (result.status === "phoneMismatch") {
      return <PhoneMismatch href={withNext("/google-telephone", next)} />;
    }
    if (result.status !== "created") return;
    consumeVerification({ channel: "sms", value: phone }, "googlePhone");
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

/**
 * The Google step may go on only while a Google sign-in is in progress, and, for the phone step,
 * once a known e-mail was confirmed with its code (R103).
 */
function googleStepAllowed(flow: AuthFlow): boolean {
  const pending = pendingGoogle();
  if (!pending) return false;
  return flow.kind !== "googlePhone" || !pending.known || pending.emailVerified;
}

/** Sign-up with an e-mail, taken or not (PR #5 review, item 13). */
function EmailLater({ onContinue }: { onContinue: () => void }) {
  const t = useTranslations("auth.signUp");
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="info">{t("emailLater")}</Alert>
      <Button onClick={onContinue}>{t("emailLaterContinue")}</Button>
    </div>
  );
}

/** Google, known e-mail: the SMS was for another phone than the account's (item 15). */
function PhoneMismatch({ href }: { href: ReturnType<typeof withNext> }) {
  const t = useTranslations("auth.googlePhone");
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning">{t("phoneMismatch")}</Alert>
      <Button as={Link} href={href}>
        {t("changePhone")}
      </Button>
    </div>
  );
}
