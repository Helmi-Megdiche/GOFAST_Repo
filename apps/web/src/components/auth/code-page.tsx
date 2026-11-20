"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Button } from "@fastgo/ui";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@fastgo/i18n";
import { attachPhone, createAccount, findByEmail, findById, sessionFor } from "@/lib/data/accounts";
import { clearPendingGoogle, markGoogleEmailVerified, pendingGoogle } from "@/lib/data/google";
import { consumeVerification } from "@/lib/data/otp";
import { sharedAuthPort } from "@/lib/data";
import { getSession, setSession } from "@/lib/data/session";
import { currentFlow, endFlow, type AuthFlow } from "@/lib/auth/flow";
import { afterSignInPath, withNext } from "@/lib/auth/next";
import { safeNext, maskEmail, maskPhone, normalizePhone } from "@fastgo/domain";
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
    // R902: the language saved on the account (a Google sign-in may join an older account).
    const session = getSession();
    const saved = session ? findById(session.accountId)?.locale : undefined;
    router.push(destination(), saved ? { locale: saved } : undefined);
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

  async function onVerified(checkId?: string): Promise<ReactNode | void> {
    if (!flow) return;
    if (flow.kind === "reset") {
      // The proof stays in memory with the flow (never in storage or the URL).
      flow.phoneCheckId = checkId;
      router.push(withNext("/mot-de-passe/nouveau", next));
      return;
    }
    if (flow.kind === "signUp") {
      flow.phoneCheckId = checkId;
      // The SMS code proves the phone only. The typed e-mail is never attached here: it will be
      // attached after a code sent to it. Taken or not, the same message (no e-mail enumeration).
      const typedEmail = flow.account.email.trim() !== "";
      const created = await sharedAuthPort().signUp(
        { ...flow.account, phone, locale: locale as Locale },
        checkId,
      );
      if (created.status === "phoneTaken") return <AccountExists signInHref={signInHref} />;
      if (created.status === "tooShort" || created.status === "notVerified") {
        endFlow();
        router.replace(withNext("/inscription", next));
        return;
      }
      if (created.status === "wait" || created.status === "unavailable") {
        return (
          <SignUpRetry
            wait={created.status === "wait" ? Date.parse(created.retryAt) : null}
            onRetry={() => onVerified(checkId)}
          />
        );
      }
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
          locale: locale as Locale,
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
        auth={
          flow.kind === "signUp" || flow.kind === "reset"
            ? { port: sharedAuthPort(), purpose: flow.kind }
            : undefined
        }
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

/** The account call did not answer (or asked to wait): the verified code is kept, the person retries. */
function SignUpRetry({
  wait,
  onRetry,
}: {
  wait: number | null;
  onRetry: () => Promise<ReactNode | void>;
}) {
  const n = useTranslations("auth.notices");
  const [replaced, setReplaced] = useState<ReactNode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (wait == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [wait]);
  if (replaced) return <>{replaced}</>;
  const waiting = wait != null && wait > now;
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <Alert tone="error">
        {waiting ? n("wait", { seconds: Math.ceil((wait - now) / 1000) }) : n("unavailable")}
      </Alert>
      <Button
        aria-disabled={busy || waiting || undefined}
        onClick={() => {
          if (busy || waiting) return;
          setBusy(true);
          void onRetry()
            .then((node) => {
              if (node) setReplaced(node);
            })
            .finally(() => setBusy(false));
        }}
      >
        {n("retry")}
      </Button>
    </div>
  );
}

/** Sign-up with an e-mail, taken or not (PR #5 review, item 13). */
function EmailLater({ onContinue }: { onContinue: () => void }) {
  const t = useTranslations("auth.signUp");
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="info">{t("emailLater")}</Alert>
      <div className="flex flex-wrap gap-3">
        <Button as={Link} href="/compte/email">
          {t("emailLaterConfirm")}
        </Button>
        <Button variant="ghost" onClick={onContinue}>
          {t("emailLaterContinue")}
        </Button>
      </div>
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
