import type { components } from "@fastgo/contract";
import type { OrderRequest } from "../order/request";

export type OrderCreate = components["schemas"]["OrderCreate"];

/**
 * The web OrderRequest as the contract's OrderCreate. The client never sends a zone (the server
 * resolves it).
 */
export function toOrderCreate(request: OrderRequest, phoneCheckId?: string): OrderCreate {
  const { sender, recipient, parcel, service } = request;
  return {
    quote_id: request.quote.id,
    accepted_total_millimes: request.quote.totalMillimes,
    sender: {
      name: sender.name,
      phone: sender.phone,
      address: { text: sender.address, landmark: sender.landmark, pin: sender.pin },
      slot: { start_at: sender.slot.startUtc, end_at: sender.slot.endUtc },
    },
    recipient: {
      name: recipient.name,
      phone: recipient.phone,
      address: { text: recipient.address, landmark: recipient.landmark, pin: recipient.pin },
      instructions: recipient.instructions,
      sms_locale: recipient.smsLanguage,
      save: recipient.save,
    },
    parcel: {
      type: parcel.type,
      parcels: parcel.weightsG.map((weight_g) => ({ weight_g })),
      content: parcel.content,
      declared_value_millimes: parcel.declaredValueMillimes,
      fragile: parcel.fragile,
      packaging: parcel.packaging,
    },
    service: {
      code: service.code,
      slot: service.slot ? { start_at: service.slot.startUtc, end_at: service.slot.endUtc } : null,
    },
    payment_mode: request.payment,
    freight_payer_accepted: request.freightPayerAccepted,
    terms_accepted: true,
    ...(phoneCheckId ? { phone_check_id: phoneCheckId } : {}),
  };
}

/**
 * The exact bytes sent with an Idempotency-Key. A retry re-sends these, never a re-serialization
 * (R202).
 */
export function serializeOrderBody(request: OrderRequest, phoneCheckId?: string): string {
  return JSON.stringify(toOrderCreate(request, phoneCheckId));
}
