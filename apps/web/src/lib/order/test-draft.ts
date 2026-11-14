/**
 * Test helper (unit tests only): a draft that is complete up to W15, priced at T0, with fake data.
 * Not used by the app.
 */
import { type ZoneResult } from "@fastgo/domain";
import { makeQuote, availableSlots } from "@/lib/order/example-data";
import { emptyDraft, type OrderDraft } from "./draft";
import { priceInputOf } from "./steps";

export const TEST_PHONE = "+216 20 000 000";
export const IN_ZONE: ZoneResult = {
  status: "in-zone",
  services: ["express", "standard", "scheduled"],
  zone: "A",
};

export function readyDraft(at: number): OrderDraft {
  const draft = emptyDraft(at);
  const ready: OrderDraft = {
    ...draft,
    sender: {
      address: {
        text: "Avenue Habib Bourguiba",
        confirmed: true,
        pin: null,
        zone: IN_ZONE,
        landmark: "",
      },
      name: "Yasmine K.",
      phone: TEST_PHONE,
      slot: availableSlots(at)[0]!,
    },
    recipient: {
      ...draft.recipient,
      address: {
        text: "Rue Ibn Khaldoun",
        confirmed: true,
        pin: null,
        zone: IN_ZONE,
        landmark: "",
      },
      name: "Amel B.",
      phone: "+216 50 000 000",
    },
    parcel: {
      type: "small",
      count: "1",
      weightKg: "2",
      content: "Vêtements",
      declaredValueMillimes: 48_500,
      fragile: true,
    },
    service: { code: "standard", slot: null },
    payment: "cashPickup",
    termsAccepted: true,
  };
  const quote = makeQuote(priceInputOf(ready)!, at);
  return { ...ready, quote, acceptedQuoteId: quote.id };
}
