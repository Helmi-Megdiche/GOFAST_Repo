import { now } from "../order/clock";
import { addressPriceKey, isQuoteValid, priceKey } from "../order/pricing";
import { fingerprint, type OrderRequest } from "../order/request";
import { isSlotInFuture } from "../order/slots";
import { servicesOffered } from "../order/steps";
import {
  isValidTrackingCode,
  normalizeTrackingCode,
  randomTrackingCode,
  type RandomBytes,
} from "../tracking-code";
import { readJson, removeKey } from "../storage";
import { isVerifiedPhoneForSession } from "./accounts";
import { mockDelay } from "./delay";
import { FOUND_TRACKING_CODE } from "./fixtures/tracking";
import {
  FAIL_NEXT_ORDER_REQUEST_KEY,
  FAIL_NEXT_ORDER_RESPONSE_KEY,
  readTable,
  writeRow,
} from "./mock-db";
import { isTargetVerified } from "./otp";
import { canPayOnAccount, getSession } from "./session";
import type { PublicParcel } from "./tracking";

/** Mock of POST /v1/orders with an Idempotency-Key header (R202, R203). */
export type OrderError =
  | "idempotencyConflict"
  | "outOfZone"
  | "phoneNotVerified"
  | "quoteExpired"
  | "quoteNotAccepted"
  | "serviceUnavailable"
  | "paymentNotAllowed"
  | "slotPast"
  | "termsRequired";

export type CreateOrderResult =
  { status: "created"; code: string; replay: boolean } | { status: "refused"; error: OrderError };

/** Thrown when the request or its answer was lost (simulated network cut): the order may exist. */
export class NetworkError extends Error {
  constructor() {
    super("network");
    this.name = "NetworkError";
  }
}

type StoredOrder = {
  code: string;
  idempotencyKey: string;
  fingerprint: string;
  createdAt: string;
  pickup: { startUtc: string; endUtc: string };
  /** Shown on W16 only ("Amel B. a reçu son lien"). Never returned by public tracking. */
  recipientName: string;
};

const ORDERS = "fg.mock.orders";
const KEYS = "fg.mock.idempotency";

/** Codes already used, including the fixtures: a code is never given twice (R203). */
function issuedCodes(): Set<string> {
  return new Set([FOUND_TRACKING_CODE, ...Object.keys(readTable<StoredOrder>(ORDERS))]);
}

export function uniqueTrackingCode(randomBytes?: RandomBytes): string {
  const issued = issuedCodes();
  for (;;) {
    const code = randomTrackingCode(randomBytes);
    if (!issued.has(code)) return code;
  }
}

function check(request: OrderRequest, at: number): OrderError | null {
  if (request.sender.zone.status !== "in-zone" || request.recipient.zone.status !== "in-zone")
    return "outOfZone";
  const phone = request.sender.phone;
  if (
    !isTargetVerified({ channel: "sms", value: phone }, "order") &&
    !isVerifiedPhoneForSession(phone)
  ) {
    return "phoneNotVerified";
  }
  if (!servicesOffered(request.sender.zone, request.recipient.zone).includes(request.service.code))
    return "serviceUnavailable";
  if (!isQuoteValid(request.quote, at)) return "quoteExpired";
  const zone = request.recipient.zone;
  const current = priceKey({
    service: request.service.code,
    parcelType: request.parcel.type,
    weightKg: request.parcel.weightKg,
    fragile: request.parcel.fragile,
    zone: zone.zone,
    from: addressPriceKey({ text: request.sender.address, pin: request.sender.pin }),
    to: addressPriceKey({ text: request.recipient.address, pin: request.recipient.pin }),
  });
  if (current !== priceKey(request.quote.input)) return "quoteExpired";
  if (request.acceptedQuoteId !== request.quote.id) return "quoteNotAccepted";
  if (request.payment === "account" && !canPayOnAccount(getSession())) return "paymentNotAllowed";
  if (!isSlotInFuture(request.sender.slot, at)) return "slotPast";
  if (request.service.code === "scheduled" && !isSlotInFuture(request.service.slot, at))
    return "slotPast";
  if (!request.termsAccepted) return "termsRequired";
  return null;
}

export async function createOrder(
  request: OrderRequest,
  idempotencyKey: string,
  randomBytes?: RandomBytes,
): Promise<CreateOrderResult> {
  await mockDelay();
  if (readJson(FAIL_NEXT_ORDER_REQUEST_KEY) === true) {
    removeKey(FAIL_NEXT_ORDER_REQUEST_KEY);
    throw new NetworkError();
  }
  const at = now();
  const print = fingerprint(request);

  const known = readTable<{ fingerprint: string; code: string }>(KEYS)[idempotencyKey];
  if (known) {
    if (known.fingerprint !== print) return { status: "refused", error: "idempotencyConflict" };
    return { status: "created", code: known.code, replay: true };
  }

  const error = check(request, at);
  if (error) return { status: "refused", error };

  const code = uniqueTrackingCode(randomBytes);
  const order: StoredOrder = {
    code,
    idempotencyKey,
    fingerprint: print,
    createdAt: new Date(at).toISOString(),
    pickup: { startUtc: request.sender.slot.startUtc, endUtc: request.sender.slot.endUtc },
    recipientName: request.recipient.name,
  };
  writeRow(ORDERS, code, order);
  writeRow(KEYS, idempotencyKey, { fingerprint: print, code });

  if (readJson(FAIL_NEXT_ORDER_RESPONSE_KEY) === true) {
    removeKey(FAIL_NEXT_ORDER_RESPONSE_KEY);
    throw new NetworkError();
  }
  return { status: "created", code, replay: false };
}

/**
 * After a lost answer: did the order with this key reach the server? Lets the page offer a new key
 * only when the answer proves no order exists.
 */
export async function findOrderByKey(idempotencyKey: string): Promise<string | null> {
  await mockDelay();
  return readTable<{ code: string }>(KEYS)[idempotencyKey]?.code ?? null;
}

/** W16 details for an order created on this device, or null (unknown or invalid ?n=). */
export async function getOrderConfirmation(code: string): Promise<{
  code: string;
  recipientName: string;
  pickup: { startUtc: string; endUtc: string };
} | null> {
  await mockDelay(0);
  if (!isValidTrackingCode(code)) return null;
  const order = readTable<StoredOrder>(ORDERS)[normalizeTrackingCode(code)];
  return order
    ? { code: order.code, recipientName: order.recipientName, pickup: order.pickup }
    : null;
}

/** Public tracking of a new order: status, dates and cities only (SUI-01), no name or address. */
export function publicParcelOf(code: string): PublicParcel | null {
  const order = readTable<StoredOrder>(ORDERS)[normalizeTrackingCode(code)];
  if (!order) return null;
  return {
    currentStep: "created",
    etaUtc: null,
    fromCity: null,
    toCity: null,
    history: [{ step: "created", atUtc: order.createdAt }],
  };
}

/** "Bon de commande" (W16): a small static sample PDF marked as an example (decision 20). */
export const ORDER_SLIP_EXAMPLE_PATH = "/examples/bon-de-commande-exemple.pdf";

export async function getOrderSlip(code: string): Promise<{ href: string } | null> {
  return (await getOrderConfirmation(code)) ? { href: ORDER_SLIP_EXAMPLE_PATH } : null;
}
