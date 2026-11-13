"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Dialog, Field, Icon, Input, Ltr } from "@fastgo/ui";
import { useRouter } from "@/i18n/navigation";
import {
  listAddresses,
  removeAddress,
  removeRecipient,
  saveAddress,
  savedRecipients,
  updateAddress,
  type SavedAddress,
  type SavedRecipient,
} from "@/lib/data/address-book";
import { loadAddressBook } from "@/lib/data/address-book-reader";
import type { Session } from "@/lib/data/session";
import { useErrorMessage } from "@/lib/forms/use-error-message";
import { maskPhone } from "@/lib/phone";
import { seedFromSavedRecipient } from "@/lib/order/saved";
import { useLoader } from "./use-loader";

/** C08 (ESP-02, CMD-02): the saved addresses and the saved recipients of the account. */
export function AddressBookView() {
  const t = useTranslations("addressBook");
  const { state, reload } = useLoader(
    (session) => loadAddressBook(session).then((book) => ({ session, book })),
    "book",
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
  return <Book session={state.data.session} initial={state.data.book} />;
}

type Removing = { kind: "address" | "recipient"; id: string } | null;

function Book({
  session,
  initial,
}: {
  session: Session;
  initial: { addresses: SavedAddress[]; recipients: SavedRecipient[] };
}) {
  const t = useTranslations("addressBook");
  const router = useRouter();
  const [addresses, setAddresses] = useState(initial.addresses);
  const [recipients, setRecipients] = useState(initial.recipients);
  // "new", an address id being edited, or nothing.
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [removing, setRemoving] = useState<Removing>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const focusAdd = () => document.getElementById("address-add")?.focus();

  const refresh = () => {
    setAddresses(listAddresses(session));
    setRecipients(savedRecipients(session));
  };

  const confirmRemove = () => {
    if (!removing) return;
    if (removing.kind === "address") removeAddress(session, removing.id);
    else removeRecipient(session, removing.id);
    refresh();
    setNotice(null);
    // The removed card is gone: the focus goes back to the page's heading, not to nothing.
    document.getElementById("address-book-title")?.focus();
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="addresses-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="addresses-title" className="text-lead font-semibold">
            {t("addresses.title")}
          </h2>
          <Button
            id="address-add"
            onClick={() => {
              setNotice(null);
              setEditing("new");
            }}
          >
            <Icon name="plus" />
            {t("addresses.add")}
          </Button>
        </div>
        <p role="status" className="text-sm font-medium text-success">
          {notice}
        </p>
        {editing ? (
          <AddressForm
            key={editing}
            initial={addresses.find((a) => a.id === editing) ?? null}
            onCancel={() => {
              setEditing(null);
              focusAdd();
            }}
            onSave={(values) => {
              if (editing === "new") saveAddress(session, values);
              else updateAddress(session, editing, values);
              refresh();
              setEditing(null);
              setNotice(t("form.saved"));
              focusAdd();
            }}
          />
        ) : null}
        {addresses.length === 0 && !editing ? (
          <p className="text-muted">{t("addresses.empty")}</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {addresses.map((address) => (
              <li key={address.id} className="min-w-0">
                <Card className="flex h-full flex-col gap-2">
                  <Icon name="pin" />
                  <h3 className="text-h4">
                    <bdi>{address.label}</bdi>
                  </h3>
                  <p className="text-sm text-muted">
                    <bdi>{address.text}</bdi>
                  </p>
                  {address.landmark ? (
                    <p className="text-sm text-muted">
                      {t.rich("addresses.landmark", {
                        landmark: () => <bdi>{address.landmark}</bdi>,
                      })}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t("addresses.editLabel", { label: address.label })}
                      onClick={() => {
                        setNotice(null);
                        setEditing(address.id);
                      }}
                    >
                      <Icon name="edit" size="sm" />
                      {t("addresses.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t("addresses.removeLabel", { label: address.label })}
                      onClick={() => setRemoving({ kind: "address", id: address.id })}
                    >
                      {t("addresses.remove")}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recipients-title" className="flex flex-col gap-4">
        <h2 id="recipients-title" className="text-lead font-semibold">
          {t("recipients.title")}
        </h2>
        {recipients.length === 0 ? (
          <p className="text-muted">{t("recipients.empty")}</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recipients.map((recipient) => (
              <li key={recipient.id} className="min-w-0">
                <Card className="flex h-full flex-col gap-2">
                  <Icon name="user" />
                  <h3 className="text-h4">
                    <bdi>{recipient.name}</bdi>
                  </h3>
                  <p className="text-sm text-muted">
                    <bdi>{recipient.address}</bdi>
                  </p>
                  <p className="text-sm text-muted">
                    <Ltr>{maskPhone(recipient.phone)}</Ltr>
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t("recipients.sendToLabel", { name: recipient.name })}
                      onClick={() => {
                        void seedFromSavedRecipient(recipient).then(() =>
                          router.push("/commander"),
                        );
                      }}
                    >
                      {t("recipients.sendTo")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t("recipients.removeLabel", { name: recipient.name })}
                      onClick={() => setRemoving({ kind: "recipient", id: recipient.id })}
                    >
                      {t("recipients.remove")}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={
          removing?.kind === "recipient"
            ? t("removeDialog.recipientTitle")
            : t("removeDialog.addressTitle")
        }
        actions={
          <>
            <Button type="submit" variant="ghost" autoFocus>
              {t("removeDialog.keep")}
            </Button>
            <Button type="submit" variant="danger" onClick={confirmRemove}>
              {t("removeDialog.confirm")}
            </Button>
          </>
        }
      >
        <p>{t("removeDialog.text")}</p>
      </Dialog>
    </div>
  );
}

type AddressValues = { label: string; text: string; landmark: string };

/** Add or edit one address: a name, the address and an optional landmark. The zone is checked when it is used (R201). */
function AddressForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SavedAddress | null;
  onSave: (values: AddressValues) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("addressBook.form");
  const message = useErrorMessage();
  const headingId = useId();
  const labelRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<AddressValues>({
    label: initial?.label ?? "",
    text: initial?.text ?? "",
    landmark: initial?.landmark ?? "",
  });
  const [errors, setErrors] = useState<{ label?: string; text?: string }>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = {
      label: values.label.trim() === "" ? "required" : undefined,
      text: values.text.trim() === "" ? "required" : undefined,
    };
    setErrors(next);
    // The first field in error takes the focus.
    if (next.label) labelRef.current?.focus();
    else if (next.text) textRef.current?.focus();
    else onSave(values);
  }

  return (
    <form noValidate aria-labelledby={headingId} onSubmit={onSubmit}>
      <Card className="flex flex-col gap-4">
        <h3 id={headingId} className="text-h4">
          {initial ? t("editTitle") : t("addTitle")}
        </h3>
        <Field label={t("label")} hint={t("labelHint")} error={message(errors.label)} required>
          <Input
            ref={labelRef}
            value={values.label}
            onChange={(event) => setValues({ ...values, label: event.target.value })}
            autoFocus
          />
        </Field>
        <Field label={t("text")} error={message(errors.text)} required>
          <Input
            ref={textRef}
            value={values.text}
            autoComplete="street-address"
            onChange={(event) => setValues({ ...values, text: event.target.value })}
          />
        </Field>
        <Field label={t("landmark")}>
          <Input
            value={values.landmark}
            onChange={(event) => setValues({ ...values, landmark: event.target.value })}
          />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit">{t("save")}</Button>
          <Button variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
