"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Avatar, GoogleButton } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import { googleProfiles, googleSignIn } from "@/lib/data/google";
import type { GoogleProfileId } from "@/lib/data/fixtures/accounts";
import { withNext } from "@/lib/auth/next";

/**
 * "Continuer avec Google" (ESP-09): opens a mock account chooser for now (decision 19). A new
 * e-mail goes to W22; a known e-mail goes to W22 too, which asks for an e-mail code first (R103).
 */
export function GoogleSignIn({
  next,
  kind = "customer",
}: {
  next: string | null;
  kind?: "customer" | "merchant";
}) {
  const t = useTranslations("auth.google");
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  async function pick(id: GoogleProfileId) {
    await googleSignIn(id, kind);
    dialog.current?.close();
    router.push(withNext("/google-telephone", next));
  }

  return (
    <>
      <GoogleButton onClick={() => dialog.current?.showModal()}>{t("continue")}</GoogleButton>
      <dialog
        ref={dialog}
        aria-labelledby="google-chooser-title"
        className="m-auto w-[min(420px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-6 text-ink backdrop:bg-navy-deep/60"
      >
        <h2 id="google-chooser-title" className="text-h4">
          {t("chooserTitle")}
        </h2>
        <p className="mt-1 text-xs text-muted">{t("chooserText")}</p>
        <ul className="mt-4 flex flex-col gap-2">
          {googleProfiles().map((profile) => (
            <li key={profile.id}>
              <button
                type="button"
                onClick={() => void pick(profile.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-start hover:bg-fill-subtle"
              >
                <Avatar name={profile.name} tone="soft" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{profile.name}</span>
                  <span className="truncate text-xs text-muted">{profile.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="text-sm font-semibold text-orange-dark"
            onClick={() => dialog.current?.close()}
          >
            {t("close")}
          </button>
        </div>
      </dialog>
    </>
  );
}

export function OrDivider() {
  const t = useTranslations("auth");
  return (
    <div className="flex items-center gap-2.5 text-xs text-muted">
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      {t("or")}
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  );
}
