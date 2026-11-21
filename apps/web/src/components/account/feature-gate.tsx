"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@fastgo/ui";
import { profilePort } from "@/lib/data";
import { featureAvailable, type AccountFeature } from "./feature-available";

/**
 * Hide and say so: with the `account` flag on and no API route, the children never mount (so no
 * mock data is read or shown as a fact, RV-28) and a neutral notice takes their place.
 */
export function FeatureGate({
  feature,
  children,
}: {
  feature: AccountFeature;
  children: ReactNode;
}) {
  const t = useTranslations("common");
  if (featureAvailable(profilePort(), feature)) return <>{children}</>;
  return <Alert tone="info">{t("notAvailableYet")}</Alert>;
}
