import type { Locale } from "@fastgo/i18n";
import { normalizePhone } from "../phone";
import { isClosedSession } from "./accounts";
import { readTable, removeRow, writeRow } from "./mock-db";
import type { Session } from "./session";

/**
 * The address book of an account (CMD-02, C08): `addresses` and `recipients` of the cahier. Every
 * reader and writer is scoped by `session.accountId`: another account's row answers like a missing
 * one. Only the text is kept, never a zone: a saved address is checked again when it is used (R201).
 * There is no limit on saved items (H8).
 */
export const ADDRESSES = "fg.mock.addresses";
export const RECIPIENTS = "fg.mock.recipients";

export type SavedAddress = { id: string; label: string; text: string; landmark: string };
export type SavedRecipient = {
  id: string;
  name: string;
  /** +216XXXXXXXX. Masked by the pages that list it. */
  phone: string;
  address: string;
  landmark: string;
  /** R903: the language of the SMS and the link this recipient gets. */
  locale: Locale;
};

type AddressRow = SavedAddress & { accountId: string };
type RecipientRow = SavedRecipient & { accountId: string };

const strip = <T extends { accountId: string }>({ accountId: _account, ...rest }: T) => rest;

export function listAddresses(session: Session): SavedAddress[] {
  return Object.values(readTable<AddressRow>(ADDRESSES))
    .filter((row) => row.accountId === session.accountId)
    .map(strip);
}

export type SaveAddressResult = { status: "saved"; address: SavedAddress } | { status: "notFound" };

export function saveAddress(session: Session, input: Omit<SavedAddress, "id">): SaveAddressResult {
  // R105: a closed account writes nothing. Every writer of this file starts with this check.
  if (isClosedSession(session)) return { status: "notFound" };
  const row: AddressRow = {
    id: `adr-${crypto.randomUUID()}`,
    accountId: session.accountId,
    label: input.label.trim(),
    text: input.text.trim(),
    landmark: input.landmark.trim(),
  };
  writeRow(ADDRESSES, row.id, row);
  return { status: "saved", address: strip(row) };
}

export type BookResult = { status: "ok" } | { status: "notFound" };

export function updateAddress(
  session: Session,
  id: string,
  patch: Partial<Omit<SavedAddress, "id">>,
): BookResult {
  // R105: a closed account writes nothing. Every writer of this file starts with this check.
  if (isClosedSession(session)) return { status: "notFound" };
  const row = readTable<AddressRow>(ADDRESSES)[id];
  if (!row || row.accountId !== session.accountId) return { status: "notFound" };
  writeRow<AddressRow>(ADDRESSES, id, {
    ...row,
    label: patch.label?.trim() ?? row.label,
    text: patch.text?.trim() ?? row.text,
    landmark: patch.landmark?.trim() ?? row.landmark,
  });
  return { status: "ok" };
}

export function removeAddress(session: Session, id: string): BookResult {
  // R105: a closed account writes nothing. Every writer of this file starts with this check.
  if (isClosedSession(session)) return { status: "notFound" };
  const row = readTable<AddressRow>(ADDRESSES)[id];
  if (!row || row.accountId !== session.accountId) return { status: "notFound" };
  removeRow(ADDRESSES, id);
  return { status: "ok" };
}

export function savedRecipients(session: Session): SavedRecipient[] {
  return Object.values(readTable<RecipientRow>(RECIPIENTS))
    .filter((row) => row.accountId === session.accountId)
    .map(strip);
}

/** One recipient per phone and account (the same phone in another format is the same person). */
export function saveRecipient(
  session: Session,
  input: Omit<SavedRecipient, "id">,
):
  | { status: "saved"; recipient: SavedRecipient }
  | { status: "invalidPhone" }
  | { status: "notFound" } {
  // R105: a closed account writes nothing. Every writer of this file starts with this check.
  if (isClosedSession(session)) return { status: "notFound" };
  const phone = normalizePhone(input.phone);
  if (!phone) return { status: "invalidPhone" };
  const existing = Object.values(readTable<RecipientRow>(RECIPIENTS)).find(
    (row) => row.accountId === session.accountId && row.phone === phone,
  );
  const row: RecipientRow = {
    id: existing?.id ?? `rcp-${crypto.randomUUID()}`,
    accountId: session.accountId,
    name: input.name.trim(),
    phone,
    address: input.address.trim(),
    landmark: input.landmark.trim(),
    locale: input.locale,
  };
  writeRow(RECIPIENTS, row.id, row);
  return { status: "saved", recipient: strip(row) };
}

export function removeRecipient(session: Session, id: string): BookResult {
  // R105: a closed account writes nothing. Every writer of this file starts with this check.
  if (isClosedSession(session)) return { status: "notFound" };
  const row = readTable<RecipientRow>(RECIPIENTS)[id];
  if (!row || row.accountId !== session.accountId) return { status: "notFound" };
  removeRow(RECIPIENTS, id);
  return { status: "ok" };
}

/**
 * The address book emptied for an account, as the table contents to write (closing, R105). Returns
 * the two tables without that account's rows, so the caller writes them with its other changes.
 */
export function addressBookWithout(accountId: string): [string, unknown][] {
  const keep = <T extends { accountId: string }>(table: Record<string, T>) =>
    Object.fromEntries(Object.entries(table).filter(([, row]) => row.accountId !== accountId));
  return [
    [ADDRESSES, keep(readTable<AddressRow>(ADDRESSES))],
    [RECIPIENTS, keep(readTable<RecipientRow>(RECIPIENTS))],
  ];
}
