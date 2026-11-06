import { now } from "../order/clock";
import { DELIVERY_CODE_DIGITS } from "../order/constants";
import { addressPriceKey, isQuoteValid, priceKey, type PriceLine } from "../order/pricing";
import { fingerprint, type OrderRequest } from "../order/request";
import { isSlotInFuture } from "../order/slots";
import { proofLevelFor } from "../order/proof";
import { servicesOffered } from "../order/steps";
import {
  isValidTrackingCode,
  normalizeTrackingCode,
  randomTrackingCode,
  type RandomBytes,
} from "../tracking-code";
import { splitWhole, kgTextToGrams } from "../order/split";
import { readJson, removeKey } from "../storage";
import { isVerifiedPhoneForSession } from "./accounts";
import { mockDelay } from "./delay";
import { FIXTURE_ORDER_CODES } from "./fixtures/orders";
import {
  consumeFailNext,
  FAIL_NEXT_ORDER_REQUEST_KEY,
  FAIL_NEXT_ORDER_RESPONSE_KEY,
  readTable,
  writeRow,
} from "./mock-db";
import {
  ACCOUNT_ORDERS,
  DELIVERY_CODES,
  PARCELS,
  STATUS_EVENTS,
  type AccountOrder,
  type DeliveryCode,
  type Parcel,
  type StatusEvent,
} from "./order-model";
import { isTargetVerified } from "./otp";
import { writeOutbox } from "./outbox";
import { mintRecipientLink } from "./recipient-links";
import { canPayOnAccount, getSession } from "./session";

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
  return new Set([...FIXTURE_ORDER_CODES, ...Object.keys(readTable<StoredOrder>(ORDERS))]);
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

/** The Prompt 3 alias key and the generic failNext key both work; both are consumed. */
function consumeFailNextWithAlias(op: string, aliasKey: string): boolean {
  const alias = readJson(aliasKey) === true;
  if (alias) removeKey(aliasKey);
  return consumeFailNext(op) || alias;
}

/** DELIVERY_CODE_DIGITS random digits, rejection-sampled so every code is equally likely. */
function randomDeliveryCode(): string {
  const modulus = 10 ** DELIVERY_CODE_DIGITS;
  const limit = Math.floor(2 ** 32 / modulus) * modulus; // the largest multiple of modulus in a Uint32
  for (;;) {
    const [n] = crypto.getRandomValues(new Uint32Array(1));
    if (n! < limit) return String(n! % modulus).padStart(DELIVERY_CODE_DIGITS, "0");
  }
}

const FREIGHT_PAYER = {
  cashDelivery: "recipient",
  cashPickup: "sender",
  account: "sender",
} as const;

/**
 * Writes the account order, its parcels with their delivery codes, the first status events, the
 * recipient link and the "trackingLink" SMS in the outbox (ESP-00, R203 R406 R903 R607).
 */
function writeAccountOrder(code: string, request: OrderRequest, at: number): void {
  const session = getSession();
  const iso = new Date(at).toISOString();
  // The person who orders (a team member for a merchant), not the account that owns the order.
  const actor = session?.userId ?? "guest";
  const recipientLocale = request.recipient.smsLanguage;
  const { count, declaredValueMillimes } = request.parcel;
  const grams = kgTextToGrams(request.parcel.weightText);
  if (typeof grams !== "number") throw new Error("createOrder: weightText was validated before");
  const weights = splitWhole(grams, count);
  const values =
    declaredValueMillimes == null
      ? Array.from({ length: count }, () => null)
      : splitWhole(declaredValueMillimes, count);
  const strongerProofRequested = false;

  const order: AccountOrder = {
    code,
    ownerAccountId: session?.accountId ?? null,
    createdByUserId: session?.userId ?? null,
    createdAt: iso,
    service: request.service.code,
    sender: {
      name: request.sender.name,
      phone: request.sender.phone,
      address: request.sender.address,
      city: null,
    },
    recipient: {
      name: request.recipient.name,
      phone: request.recipient.phone,
      address: request.recipient.address,
      city: null,
    },
    pickupPointId: null,
    recipientLocale,
    status: "received",
    lossReported: false,
    totalMillimes: request.quote.totalMillimes,
    priceLines: Object.entries(request.quote.lines).map(([kind, millimes]) => ({
      kind: kind as PriceLine,
      millimes,
    })),
    paymentMode: request.payment,
    // R607: the recipient pays the freight on delivery only for "cashDelivery"; the W15 checkbox
    // (and the refusal when it is missing) is PR A's, so it stays false here.
    freightPayer: FREIGHT_PAYER[request.payment],
    freightPayerAccepted: false,
    strongerProofRequested,
    cancel: null,
    etaUtc: null,
  };
  writeRow(ACCOUNT_ORDERS, code, order);
  writeEvent("order", code, null, "received", actor, iso);

  for (let i = 0; i < count; i++) {
    const parcel: Parcel = {
      id: `${code}-p${i + 1}`,
      orderCode: code,
      index: i + 1,
      barcode: `${code}-${i + 1}`,
      size: request.parcel.type,
      weightDeclaredG: weights[i]!,
      weightMeasuredG: null,
      declaredValueMillimes: values[i]!,
      codMillimes: null,
      fragile: request.parcel.fragile,
      proofLevel: proofLevelFor(
        { fragile: request.parcel.fragile, codMillimes: null },
        { totalDeclaredValueMillimes: declaredValueMillimes, strongerProofRequested },
      ),
      attempts: 0,
      status: "to_collect",
      failure: null,
      proof: null,
    };
    writeRow(PARCELS, parcel.id, parcel);
    writeEvent("parcel", parcel.id, null, "to_collect", actor, iso);
    writeRow<DeliveryCode>(DELIVERY_CODES, parcel.id, {
      parcelId: parcel.id,
      code: randomDeliveryCode(),
      failedAttempts: 0,
      expiresAt: null,
    });
  }

  const linkToken = mintRecipientLink(code, recipientLocale);
  writeOutbox({
    ownerAccountId: session?.accountId ?? null,
    orderCode: code,
    channel: "sms",
    template: "trackingLink",
    params: {
      senderName: request.sender.name,
      senderPhone: request.sender.phone,
      trackingCode: code,
      linkToken,
    },
    locale: recipientLocale,
  });
}

function writeEvent(
  subjectType: StatusEvent["subjectType"],
  subjectId: string,
  fromStatus: string | null,
  toStatus: string,
  actorId: string,
  occurredAt: string,
): void {
  const id = crypto.randomUUID();
  writeRow<StatusEvent>(STATUS_EVENTS, id, {
    id,
    subjectType,
    subjectId,
    fromStatus,
    toStatus,
    actorId,
    occurredAt,
  });
}

/** The answer for a key already stored: the same order again, or a conflict if the request differs. */
function replayOf(idempotencyKey: string, print: string): CreateOrderResult | null {
  const known = readTable<{ fingerprint: string; code: string }>(KEYS)[idempotencyKey];
  if (!known) return null;
  if (known.fingerprint !== print) return { status: "refused", error: "idempotencyConflict" };
  return { status: "created", code: known.code, replay: true };
}

export async function createOrder(
  request: OrderRequest,
  idempotencyKey: string,
  randomBytes?: RandomBytes,
): Promise<CreateOrderResult> {
  await mockDelay();
  if (consumeFailNextWithAlias("createOrder.request", FAIL_NEXT_ORDER_REQUEST_KEY)) {
    throw new NetworkError();
  }
  return withOrderLock(() => createOrderNow(request, idempotencyKey, randomBytes));
}

/**
 * The real server serialises two requests with the same key in its database. The mock does it with
 * a Web Lock shared by every tab of the browser, so two tabs pressing Valider at once give one order.
 */
async function withOrderLock<T>(work: () => T): Promise<T> {
  const locks = typeof window === "undefined" ? undefined : window.navigator.locks;
  return locks ? locks.request("fg.mock.createOrder", () => work()) : work();
}

function createOrderNow(
  request: OrderRequest,
  idempotencyKey: string,
  randomBytes?: RandomBytes,
): CreateOrderResult {
  const at = now();
  const print = fingerprint(request);

  const known = replayOf(idempotencyKey, print);
  if (known) return known;

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
  writeAccountOrder(code, request, at);

  if (consumeFailNextWithAlias("createOrder.response", FAIL_NEXT_ORDER_RESPONSE_KEY)) {
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

/** "Bon de commande" (W16): a small static sample PDF marked as an example (decision 20). */
export const ORDER_SLIP_EXAMPLE_PATH = "/examples/bon-de-commande-exemple.pdf";

export async function getOrderSlip(code: string): Promise<{ href: string } | null> {
  return (await getOrderConfirmation(code)) ? { href: ORDER_SLIP_EXAMPLE_PATH } : null;
}
