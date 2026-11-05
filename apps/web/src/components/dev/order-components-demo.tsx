"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  CodeInput,
  Field,
  GoogleButton,
  MapPlaceholder,
  RadioCard,
  type MapPoint,
} from "@fastgo/ui";
import { Money } from "@/components/money";
import { devUiFixtures as data } from "@/lib/data/fixtures/dev-ui";

/** /dev/ui only: the components added for the order flow and sign-in. */
export function RadioCardDemo() {
  const t = useTranslations("devUi.order");
  const o = useTranslations("offers");
  const [value, setValue] = useState("standard");
  return (
    <fieldset className="flex max-w-[520px] flex-col gap-2">
      <legend className="pb-2 text-sm font-medium">{t("radioLegend")}</legend>
      {(["express", "standard", "scheduled"] as const).map((code) => (
        <RadioCard
          key={code}
          name="dev-service"
          value={code}
          checked={value === code}
          onChange={() => setValue(code)}
          title={o(`${code}.name`)}
          description={o(`${code}.delay`)}
          end={<Money millimes={data.kpi.fees} />}
        />
      ))}
    </fieldset>
  );
}

export function CodeInputDemo() {
  const t = useTranslations("devUi.order");
  const [code, setCode] = useState("482");
  return (
    <Field label={t("codeLabel")} className="max-w-[360px]">
      <CodeInput length={6} value={code} onValueChange={setCode} />
    </Field>
  );
}

export function MapDemo() {
  const t = useTranslations("devUi.order");
  const [pin, setPin] = useState<MapPoint | null>({ x: 0.47, y: 0.53 });
  return (
    <div className="flex max-w-[640px] flex-col gap-2">
      <MapPlaceholder
        pin={pin}
        onPlace={setPin}
        label={t("mapLabel")}
        instructions={t("mapInstructions")}
      />
      {pin ? (
        <p className="text-xs text-muted" role="status">
          {t("pinAt", { x: Math.round(pin.x * 100), y: Math.round(pin.y * 100) })}
        </p>
      ) : null}
    </div>
  );
}

export function GoogleDemo() {
  const t = useTranslations("auth.google");
  return (
    <div className="max-w-[420px]">
      <GoogleButton>{t("continue")}</GoogleButton>
    </div>
  );
}
