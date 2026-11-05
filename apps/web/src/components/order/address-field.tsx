"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, MapPlaceholder, type MapPoint } from "@fastgo/ui";
import { suggestAddresses } from "@/lib/data/addresses";
import { checkPoint, checkZone } from "@/lib/data/zones";
import type { AddressDraft } from "@/lib/order/draft";
import { useErrorMessage } from "@/lib/forms/use-error-message";

/**
 * Address search + map pin (CMD-02). Free text alone never continues (decision 4): the visitor
 * picks a suggestion or places the pin, then the zone is checked. Landmark is a separate field.
 */
export function AddressField({
  label,
  value,
  onChange,
  error,
  autoComplete,
}: {
  label: string;
  value: AddressDraft;
  onChange: (next: AddressDraft) => void;
  error?: string;
  autoComplete?: string;
}) {
  const t = useTranslations("order.address");
  const message = useErrorMessage();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  // The zone check answers after the visitor may have typed again: merge into the latest value.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  useEffect(() => {
    if (value.confirmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the list once confirmed
      setSuggestions([]);
      return;
    }
    let active = true;
    void suggestAddresses(value.text).then((found) => {
      if (active) setSuggestions(found);
    });
    return () => {
      active = false;
    };
  }, [value.text, value.confirmed]);

  async function confirmText(text: string) {
    onChange({ ...latest.current, text, confirmed: true, pin: null, zone: null });
    setChecking(true);
    const zone = await checkZone(text);
    setChecking(false);
    onChange({ ...latest.current, text, confirmed: true, pin: null, zone });
  }

  // The pin is the address now: its label replaces the typed text, which may name another place.
  async function placePin(pin: MapPoint) {
    const text = t("pinText");
    onChange({ ...latest.current, text, confirmed: true, pin, zone: null });
    setChecking(true);
    const zone = await checkPoint(pin);
    setChecking(false);
    onChange({ ...latest.current, text, confirmed: true, pin, zone });
  }

  const status = checking
    ? t("checking")
    : !value.confirmed
      ? null
      : value.zone?.status === "in-zone"
        ? t("inZone")
        : value.zone?.status === "out-of-zone"
          ? t("outOfZone")
          : value.zone?.status === "unknown"
            ? t("unknown")
            : null;

  return (
    <div className="flex flex-col gap-3">
      <Field label={label} hint={t("hint")} error={message(error)} required>
        <Input
          value={value.text}
          autoComplete={autoComplete ?? "off"}
          aria-controls={suggestions.length > 0 ? listId : undefined}
          onChange={(event) =>
            onChange({
              ...value,
              text: event.target.value,
              confirmed: false,
              pin: null,
              zone: null,
            })
          }
        />
      </Field>
      {suggestions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-2xs font-medium text-muted">{t("suggestionsLabel")}</p>
          <ul id={listId} className="flex flex-col gap-1">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => void confirmText(suggestion)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-start text-sm hover:bg-fill-subtle"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <MapPlaceholder
        pin={value.pin}
        onPlace={(pin) => void placePin(pin)}
        onMove={(pin) => onChange({ ...value, pin, confirmed: false, zone: null })}
        label={t("mapLabel", { field: label })}
        instructions={t("mapInstructions")}
      />
      <p
        role="status"
        className={
          value.zone?.status === "out-of-zone" || value.zone?.status === "unknown"
            ? "text-xs font-medium text-danger"
            : "text-xs font-medium text-success"
        }
      >
        {status}
      </p>
    </div>
  );
}
