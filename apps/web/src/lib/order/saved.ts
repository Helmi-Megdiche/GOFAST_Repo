import type { SavedRecipient } from "../data/address-book";
import { checkZone } from "../data/zones";
import { updateDraft, type AddressDraft } from "./draft";

/**
 * A saved address used on W11 or W12 (CMD-02). Only its text was saved, so the zone is checked now:
 * an address that left the zone arrives out of zone and the step goes to W17 (R201). It counts as
 * confirmed: the person chose it themselves.
 */
export async function addressDraftFromSaved(text: string, landmark: string): Promise<AddressDraft> {
  return { text, confirmed: true, pin: null, zone: await checkZone(text), landmark };
}

/** "Lui envoyer un colis" (C08): the recipient of the draft is this saved recipient; the sender is untouched. */
export async function seedFromSavedRecipient(recipient: SavedRecipient): Promise<void> {
  const address = await addressDraftFromSaved(recipient.address, recipient.landmark);
  updateDraft((draft) => ({
    ...draft,
    recipient: {
      ...draft.recipient,
      address,
      name: recipient.name,
      phone: recipient.phone,
      smsLanguage: recipient.locale,
      save: false,
    },
  }));
}
