"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@fastgo/ui";
import { requestCaptchaToken } from "@/lib/data/captcha";

/**
 * Captcha stand-in (FE-06): ticking the box asks the mock for a token, which the form sends
 * with the request. The real provider is not chosen: only `requestCaptchaToken` and
 * `verifyCaptcha` in src/lib/data/captcha.ts change when it is.
 *
 * While the token is requested the box is not disabled (a disabled control loses the keyboard
 * focus): it is marked aria-busy and changes are ignored.
 */
export function CaptchaMock({
  token,
  onToken,
  error,
}: {
  token: string;
  onToken: (token: string) => void;
  error?: string;
}) {
  const t = useTranslations("contact.form");
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-md border border-line bg-fill-subtle p-3">
      <Checkbox
        id="captcha"
        label={busy ? t("captchaChecking") : t("captcha")}
        checked={token !== ""}
        aria-busy={busy}
        error={error}
        onChange={async (event) => {
          if (busy) return;
          if (!event.target.checked) {
            onToken("");
            return;
          }
          setBusy(true);
          onToken(await requestCaptchaToken());
          setBusy(false);
        }}
      />
    </div>
  );
}
