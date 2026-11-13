"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Select } from "@fastgo/ui";
import {
  listAddresses,
  savedRecipients,
  type SavedAddress,
  type SavedRecipient,
} from "@/lib/data/address-book";
import { getSession } from "@/lib/data/session";

/**
 * "Adresse enregistrée" / "Destinataire enregistré" on W11 and W12 (CMD-02): fills the step from the
 * signed-in account's address book. It renders nothing when nobody is signed in or the book has no
 * such item. Only mounted once the draft is read in the browser, so the book can be read here.
 */
function SavedSelect<T extends { id: string }>({
  label,
  items,
  describe,
  onPick,
}: {
  label: string;
  items: T[];
  describe: (item: T) => string;
  onPick: (item: T) => void;
}) {
  const t = useTranslations("order.saved");
  if (items.length === 0) return null;
  return (
    <Field label={label}>
      <Select
        value=""
        onChange={(event) => {
          const item = items.find((candidate) => candidate.id === event.target.value);
          if (item) onPick(item);
        }}
      >
        <option value="">{t("placeholder")}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {describe(item)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function SavedAddressPicker({ onPick }: { onPick: (address: SavedAddress) => void }) {
  const t = useTranslations("order.saved");
  const [items] = useState(() => {
    const session = getSession();
    return session ? listAddresses(session) : [];
  });
  return (
    <SavedSelect
      label={t("addressLabel")}
      items={items}
      describe={(address) => address.label}
      onPick={onPick}
    />
  );
}

export function SavedRecipientPicker({ onPick }: { onPick: (recipient: SavedRecipient) => void }) {
  const t = useTranslations("order.saved");
  const [items] = useState(() => {
    const session = getSession();
    return session ? savedRecipients(session) : [];
  });
  return (
    <SavedSelect
      label={t("recipientLabel")}
      items={items}
      describe={(recipient) => recipient.name}
      onPick={onPick}
    />
  );
}
