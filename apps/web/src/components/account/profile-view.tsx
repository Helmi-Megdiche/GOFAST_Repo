"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { switcherOrder, type Locale } from "@fastgo/i18n";
import { Alert, Badge, Button, Card, Checkbox, Chip, Field, Input, Ltr } from "@fastgo/ui";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { NotificationPrefs } from "@/lib/data/accounts";
import { profilePort } from "@/lib/data";
import { createPrefsQueue } from "@/lib/data/prefs-queue";
import type { PortProfile, ProfilePort } from "@/lib/data/ports";
import { unlinkGoogle } from "@/lib/data/profile";
import type { Session } from "@/lib/data/session";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { formatPhone } from "@fastgo/domain";
import { AuthRequiredError } from "@/lib/api/errors";
import { signInUrl } from "@/lib/api/unauthorized";
import { CloseAccountDialog } from "./close-account-dialog";
import { useLoader } from "./use-loader";

/** A 401 on a write: the session is gone, sign in again and come back here (S2). True when it redirected. */
function useSignInRedirect() {
  const locale = useLocale();
  return (error: unknown): boolean => {
    if (!(error instanceof AuthRequiredError)) return false;
    window.location.assign(signInUrl(locale, window.location.pathname));
    return true;
  };
}

/** C09 (ESP-02): details, notifications, Google, language and closing the account. */
export function ProfileView() {
  const t = useTranslations("profile");
  const port = profilePort();
  const { state, reload } = useLoader(
    (session) => port.get(session).then((profile) => ({ session, profile })),
    "profile",
  );

  if (state.status === "loading") {
    return (
      <p aria-busy="true" className="text-muted">
        {t("loading")}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <Alert tone="error">
        <span className="flex flex-col items-start gap-2">
          {t("error.title")}
          <Button size="sm" variant="secondary" onClick={reload}>
            {t("error.retry")}
          </Button>
        </span>
      </Alert>
    );
  }
  return <Sections port={port} session={state.data.session} initial={state.data.profile} />;
}

function Sections({
  port,
  session,
  initial,
}: {
  port: ProfilePort;
  session: Session;
  initial: PortProfile;
}) {
  const t = useTranslations("profile");
  const tCommon = useTranslations("common");
  const [profile, setProfile] = useState(initial);
  // What the last change said, announced politely: "Enregistré." or the failure.
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const saved = () => setNotice({ tone: "success", text: t("saved") });
  const failed = () => setNotice({ tone: "error", text: t("saveFailed") });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <InfoCard
          port={port}
          session={session}
          profile={profile}
          onChange={setProfile}
          onSaved={saved}
          onFailed={failed}
        />
      </div>
      <div className="flex flex-col gap-6">
        <NotificationsCard
          port={port}
          session={session}
          profile={profile}
          onChange={setProfile}
          onSaved={saved}
          onFailed={failed}
        />
        {port.googleAvailable ? (
          <GoogleCard
            session={session}
            profile={profile}
            onChange={setProfile}
            onUnlinked={() => setNotice({ tone: "success", text: t("google.unlinked") })}
            onFailed={failed}
          />
        ) : null}
        <LanguageCard port={port} session={session} onSaved={saved} onFailed={failed} />
        {port.closeAvailable ? <AccountCard session={session} /> : null}
        {!port.googleAvailable || !port.closeAvailable ? (
          // Hide and say so (20-d): no mock card is shown as a fact while the API has no route.
          <p className="text-sm text-muted">{tCommon("notAvailableYet")}</p>
        ) : null}
      </div>
      <div role="status" aria-live="polite" className="lg:col-span-2">
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      </div>
    </div>
  );
}

type CardProps = {
  port: ProfilePort;
  session: Session;
  profile: PortProfile;
  onChange: (profile: PortProfile) => void;
  onSaved: () => void;
  onFailed: () => void;
};

function InfoCard({ port, session, profile, onChange, onSaved, onFailed }: CardProps) {
  const t = useTranslations("profile.info");
  const message = useErrorMessage();
  const [name, setName] = useState(profile.name ?? "");
  const [error, setError] = useState<string | undefined>();
  const toSignIn = useSignInRedirect();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    let signedOut = false;
    const result = await port.updateName(session, name).catch((e: unknown) => {
      signedOut = toSignIn(e);
      return null;
    });
    if (signedOut) return;
    if (!result) return onFailed();
    if (result.status === "invalidName") {
      setError("required");
      document.getElementById("profile-name")?.focus();
      return;
    }
    setError(undefined);
    if (result.status === "ok") {
      onChange({ ...profile, name: name.trim() });
      onSaved();
    } else onFailed();
  }

  return (
    <Card as="section" aria-labelledby="info-title" className="flex flex-col gap-4">
      <h2 id="info-title" className="text-h4">
        {t("title")}
      </h2>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <Field label={t("name")} error={message(error)} required>
          <Input
            id="profile-name"
            value={name}
            autoComplete="name"
            dir="auto"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label={t("phone")} hint={t("phoneHint")}>
          <Input
            value={profile.phone ? formatPhone(profile.phone) : ""}
            readOnly
            dir="ltr"
            autoComplete="tel"
          />
        </Field>
        {profile.phoneVerified ? (
          <div>
            <Badge tone="success" icon="check">
              {t("phoneVerified")}
            </Badge>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-ink">{t("email")}</p>
          <p className="text-sm">
            {profile.email ? (
              <Ltr>{profile.email}</Ltr>
            ) : (
              <span className="text-muted">{t("noEmail")}</span>
            )}
          </p>
          {port.emailAvailable ? (
            <Link
              href="/compte/email"
              className="w-fit text-sm font-semibold text-orange-dark underline"
            >
              {profile.email ? t("changeEmail") : t("addEmail")}
            </Link>
          ) : null}
        </div>
        <Button type="submit" variant="secondary" className="self-start">
          {t("save")}
        </Button>
      </form>
    </Card>
  );
}

function NotificationsCard({ port, session, profile, onChange, onSaved, onFailed }: CardProps) {
  const t = useTranslations("profile.notifications");
  const keys = ["sms", "email", "offers"] as const;
  const toSignIn = useSignInRedirect();
  const [prefs, setPrefs] = useState(profile.notifications);
  // One request at a time, each built from the latest wanted state (20-d): two quick clicks keep both.
  const [queue] = useState(() =>
    createPrefsQueue({
      initial: profile.notifications,
      send: async (wanted) => {
        try {
          return (await port.setNotifications(session, wanted)).status === "ok";
        } catch (e) {
          toSignIn(e);
          throw e;
        }
      },
      onState: setPrefs,
    }),
  );
  useEffect(() => {
    queue.setOnResult((ok) => {
      if (ok) {
        onChange({ ...profile, notifications: queue.wanted() });
        onSaved();
      } else onFailed();
    });
  });

  return (
    <Card as="section" aria-labelledby="notifications-title" className="flex flex-col gap-3">
      <h2 id="notifications-title" className="text-h4">
        {t("title")}
      </h2>
      {keys.map((key: keyof NotificationPrefs) => (
        <Checkbox
          key={key}
          id={`notification-${key}`}
          label={t(key)}
          checked={prefs[key]}
          onChange={(event) => queue.set(key, event.target.checked)}
        />
      ))}
    </Card>
  );
}

function GoogleCard({
  session,
  profile,
  onChange,
  onUnlinked,
  onFailed,
}: Omit<CardProps, "onSaved" | "port"> & { onUnlinked: () => void }) {
  const t = useTranslations("profile.google");

  async function unlink() {
    const result = await unlinkGoogle(session).catch(() => null);
    if (result?.status === "ok") {
      onChange({ ...profile, google: false });
      onUnlinked();
    } else onFailed();
  }

  return (
    <Card as="section" aria-labelledby="google-title" className="flex flex-col gap-3">
      <h2 id="google-title" className="text-h4">
        {t("title")}
      </h2>
      {profile.google ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t("linked")}</p>
          <Button size="sm" variant="ghost" onClick={() => void unlink()}>
            {t("unlink")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">{t("none")}</p>
      )}
    </Card>
  );
}

/**
 * R902: the language picked here is saved on the account and the page changes language at once.
 * It changes no order and no notification preference.
 */
function LanguageCard({
  port,
  session,
  onSaved,
  onFailed,
}: {
  port: ProfilePort;
  session: Session;
  onSaved: () => void;
  onFailed: () => void;
}) {
  const t = useTranslations("profile.language");
  const current = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const toSignIn = useSignInRedirect();

  async function pick(locale: Locale) {
    if (locale === current) return;
    let signedOut = false;
    const result = await port.setLocale(session, locale).catch((e: unknown) => {
      signedOut = toSignIn(e);
      return null;
    });
    if (signedOut) return;
    if (result?.status !== "ok") return onFailed();
    onSaved();
    router.replace(pathname, { locale });
  }

  return (
    <Card as="section" aria-labelledby="language-title" className="flex flex-col gap-3">
      <h2 id="language-title" className="text-h4">
        {t("title")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {switcherOrder.map((locale) => (
          <Chip
            key={locale}
            lang={locale}
            aria-pressed={locale === current}
            onClick={() => void pick(locale)}
          >
            {t(`names.${locale}`)}
          </Chip>
        ))}
      </div>
    </Card>
  );
}

function AccountCard({ session }: { session: Session }) {
  const t = useTranslations("profile.account");
  const [open, setOpen] = useState(false);
  // R105: individuals only. A merchant admin or user sees no close action (closing a company is back-office work).
  const individual = session.kind === "customer" && session.role === null;

  return (
    <Card as="section" aria-labelledby="account-title" className="flex flex-col gap-3">
      <h2 id="account-title" className="text-h4">
        {t("title")}
      </h2>
      {individual ? (
        <>
          <p className="text-sm text-muted">{t("text")}</p>
          <Button variant="danger" className="self-start" onClick={() => setOpen(true)}>
            {t("close")}
          </Button>
          <CloseAccountDialog session={session} open={open} onClose={() => setOpen(false)} />
        </>
      ) : null}
    </Card>
  );
}
