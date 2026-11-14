"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { switcherOrder, type Locale } from "@fastgo/i18n";
import { Alert, Badge, Button, Card, Checkbox, Chip, Field, Input, Ltr } from "@fastgo/ui";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { NotificationPrefs } from "@/lib/data/accounts";
import {
  getProfile,
  setAccountLocale,
  setNotifications,
  unlinkGoogle,
  updateName,
  type Profile,
} from "@/lib/data/profile";
import type { Session } from "@/lib/data/session";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { formatPhone } from "@fastgo/domain";
import { CloseAccountDialog } from "./close-account-dialog";
import { useLoader } from "./use-loader";

/** C09 (ESP-02): details, notifications, Google, language and closing the account. */
export function ProfileView() {
  const t = useTranslations("profile");
  const { state, reload } = useLoader(
    (session) => getProfile(session).then((profile) => ({ session, profile })),
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
  return <Sections session={state.data.session} initial={state.data.profile} />;
}

function Sections({ session, initial }: { session: Session; initial: Profile }) {
  const t = useTranslations("profile");
  const [profile, setProfile] = useState(initial);
  // What the last change said, announced politely: "Enregistré." or the failure.
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const saved = () => setNotice({ tone: "success", text: t("saved") });
  const failed = () => setNotice({ tone: "error", text: t("saveFailed") });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <InfoCard
          session={session}
          profile={profile}
          onChange={setProfile}
          onSaved={saved}
          onFailed={failed}
        />
      </div>
      <div className="flex flex-col gap-6">
        <NotificationsCard
          session={session}
          profile={profile}
          onChange={setProfile}
          onSaved={saved}
          onFailed={failed}
        />
        <GoogleCard
          session={session}
          profile={profile}
          onChange={setProfile}
          onUnlinked={() => setNotice({ tone: "success", text: t("google.unlinked") })}
          onFailed={failed}
        />
        <LanguageCard session={session} onSaved={saved} onFailed={failed} />
        <AccountCard session={session} />
      </div>
      <div role="status" aria-live="polite" className="lg:col-span-2">
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      </div>
    </div>
  );
}

type CardProps = {
  session: Session;
  profile: Profile;
  onChange: (profile: Profile) => void;
  onSaved: () => void;
  onFailed: () => void;
};

function InfoCard({ session, profile, onChange, onSaved, onFailed }: CardProps) {
  const t = useTranslations("profile.info");
  const message = useErrorMessage();
  const [name, setName] = useState(profile.name ?? "");
  const [error, setError] = useState<string | undefined>();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await updateName(session, name).catch(() => null);
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
        <div>
          <Badge tone="success" icon="check">
            {t("phoneVerified")}
          </Badge>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-ink">{t("email")}</p>
          <p className="text-sm">
            {profile.email ? (
              <Ltr>{profile.email}</Ltr>
            ) : (
              <span className="text-muted">{t("noEmail")}</span>
            )}
          </p>
          <Link
            href="/compte/email"
            className="w-fit text-sm font-semibold text-orange-dark underline"
          >
            {profile.email ? t("changeEmail") : t("addEmail")}
          </Link>
        </div>
        <Button type="submit" variant="secondary" className="self-start">
          {t("save")}
        </Button>
      </form>
    </Card>
  );
}

function NotificationsCard({ session, profile, onChange, onSaved, onFailed }: CardProps) {
  const t = useTranslations("profile.notifications");
  const keys = ["sms", "email", "offers"] as const;

  async function toggle(key: keyof NotificationPrefs, value: boolean) {
    const result = await setNotifications(session, { [key]: value }).catch(() => null);
    if (result?.status === "ok") {
      onChange({ ...profile, notifications: { ...profile.notifications, [key]: value } });
      onSaved();
    } else onFailed();
  }

  return (
    <Card as="section" aria-labelledby="notifications-title" className="flex flex-col gap-3">
      <h2 id="notifications-title" className="text-h4">
        {t("title")}
      </h2>
      {keys.map((key) => (
        <Checkbox
          key={key}
          id={`notification-${key}`}
          label={t(key)}
          checked={profile.notifications[key]}
          onChange={(event) => void toggle(key, event.target.checked)}
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
}: Omit<CardProps, "onSaved"> & { onUnlinked: () => void }) {
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
  session,
  onSaved,
  onFailed,
}: {
  session: Session;
  onSaved: () => void;
  onFailed: () => void;
}) {
  const t = useTranslations("profile.language");
  const current = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  async function pick(locale: Locale) {
    if (locale === current) return;
    const result = await setAccountLocale(session, locale).catch(() => null);
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
