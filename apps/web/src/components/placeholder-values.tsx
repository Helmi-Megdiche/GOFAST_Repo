import { useTranslations } from "next-intl";
import { Money } from "./money";

/**
 * Values FastGo has not given us yet arrive as null from the data layer. The page then shows
 * the placeholder in the active language ([PRIX] TND, [HEURE], [LIMITE], [TARIF]).
 */
export function PriceValue({ millimes }: { millimes: number | null }) {
  const t = useTranslations("placeholders");
  return millimes === null ? <>{t("priceTnd")}</> : <Money millimes={millimes} />;
}

export function FeeValue({ millimes }: { millimes: number | null }) {
  const t = useTranslations("placeholders");
  return millimes === null ? <>{t("fee")}</> : <Money millimes={millimes} />;
}

export function TextValue({
  value,
  placeholder,
}: {
  value: string | null;
  placeholder: "time" | "limit" | "cityFrom" | "cityTo";
}) {
  const t = useTranslations("placeholders");
  return <>{value ?? t(placeholder)}</>;
}
