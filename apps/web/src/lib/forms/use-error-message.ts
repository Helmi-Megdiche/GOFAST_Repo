import { useTranslations } from "next-intl";
import type { FormErrorCode } from "./schemas";

/** Turns a schema error code ("required", "trackingInvalid"...) into text in the active language. */
export function useErrorMessage() {
  const t = useTranslations("forms.errors");
  return (code: string | undefined) => (code ? t(code as FormErrorCode) : undefined);
}
