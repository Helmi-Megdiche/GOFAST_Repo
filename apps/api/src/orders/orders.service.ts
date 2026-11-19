import type { components } from "@fastgo/contract";
import { addressPriceKey, checkOrderSlots, isQuoteValid, MAX_PARCELS, proofLevelFor, randomTrackingCode } from "@fastgo/domain";
import type { ProofLevel } from "@fastgo/domain";
import type { Keys } from "../auth/crypto.ts";
import type { PhoneChecks } from "../auth/phone-check.ts";
import type { RateLimiter } from "../auth/rate-limit.ts";
import { ApiError, type FieldError } from "../http/errors.ts";
import { canonical } from "../http/idempotency.ts";
import type { Actor } from "../http/session.ts";
import type { PriceSpec, Priced, ReadQuote, Settings } from "../pricing/pricing.service.ts";

export type OrderCreate = components["schemas"]["OrderCreate"];
export type OrderOut = components["schemas"]["Order"];
export type OrderListOut = components["schemas"]["OrderList"];
export type TrackingOut = components["schemas"]["PublicTracking"];
type Locale = "fr" | "ar" | "en";

/** PROVISIONAL (supervisor, #22): the public tracking, per IP: all calls, then the numbers that do not exist (T11). */
export const TRACKING_LIMITS = {
  perIp: { limit: 120, windowMs: 60_000 },
  misses: { limit: 20, windowMs: 600_000 },
} as const;

/**
 * The print of the order's body, kept on the order with its idempotency scope (R202). The same key with another body must never
 * be answered with the order of the first one, even in the hours between the expiry of the key and its purge.
 */
export const bodyHashOf = (keys: Keys, body: OrderCreate): string => keys.mac("order-body", canonical(body));

export type AccountRow = { status: string; phone: string | null; phoneVerified: boolean };

/** Everything the transaction that creates an order needs: all checks are done, nothing is left to decide. */
export type OrderPlan = {
  scope: string | null;
  at: Date;
  actor: Actor;
  quote: ReadQuote;
  body: OrderCreate;
  freightPayer: "sender" | "recipient";
  proofLevel: ProofLevel;
  addressUnconfirmed: boolean;
  nullLines: string[];
  /** The account phone was proved by this order: mark it verified in the same transaction. */
  markPhoneVerified: boolean;
  newTrackingNumber: () => string;
  /** `bodyHashOf` of the request: stored with the scope. */
  bodyHash: string;
};

export type ListQuery = {
  status?: string[];
  from?: string;
  to?: string;
  tracking?: string;
  cursor?: string;
  limit: number;
};

/** A 23505 on the idempotency scope: the same order was created by another call of the same key. */
export class ScopeTaken extends Error {}

/** What the service needs from the database. Each method is one transaction. */
export interface OrdersPort {
  /** The order that holds this idempotency scope, with the print of the body it was made from. */
  findByScope(actor: Actor, scope: string): Promise<{ order: OrderOut; bodyHash: string | null } | null>;
  readQuote(actor: Actor, id: string): Promise<ReadQuote | null>;
  readAccount(actor: Actor): Promise<AccountRow | null>;
  settings(actor: Actor): Promise<Settings>;
  /** One transaction: addresses, recipient, order (tracking number retried in a savepoint), parcels, history, outbox. */
  insert(plan: OrderPlan): Promise<OrderOut>;
  list(actor: Actor, q: ListQuery): Promise<OrderListOut | "badCursor">;
  get(actor: Actor, id: string): Promise<OrderOut | null>;
  tracking(number: string, locale: Locale): Promise<TrackingOut | null>;
}

export type OrdersDeps = {
  port: OrdersPort;
  /** The price of the quote's inputs on the grid in force at `at` (the pricing module). */
  priceAt: (spec: PriceSpec, at: Date) => Promise<Priced>;
  keys: Keys;
  checks: Pick<PhoneChecks, "consume">;
  limiter: RateLimiter;
  now?: () => Date;
  newTrackingNumber?: () => string;
};

const secs = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
const refuse = (name: string, reason: string) => new ApiError("RULE_REFUSED", [{ name, reason }]);
const same = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The orders of GH-22 (PR 4b-2a): create, list, get and the public tracking. Cancel and confirm come in 4b-2b. */
export class OrdersService {
  private readonly now: () => Date;
  constructor(private readonly d: OrdersDeps) {
    this.now = d.now ?? (() => new Date());
  }

  // ---- POST /v1/orders --------------------------------------------------------------------------------------

  /**
   * R202, R204, R206, RV-05. Every refusal comes before the first write, and the phone proof (a write to Redis that
   * cannot be undone) is spent after all of them.
   */
  async create(actor: Actor, body: OrderCreate, ctx: { scope: string | null }): Promise<OrderOut> {
    const { port } = this.d;
    const bodyHash = bodyHashOf(this.d.keys, body);
    // A call that finds the order of its own key (a second call whose first one finished, or lost its lease) answers it again: no
    // check, no proof spent. Only for the same body: the scope of an order outlives its key by up to the purge interval, and
    // another body with that key is KEY_REUSED, never the old order.
    if (ctx.scope) {
      const done = await port.findByScope(actor, ctx.scope);
      if (done) {
        if (done.bodyHash !== bodyHash) throw new ApiError("KEY_REUSED");
        return done.order;
      }
    }
    const at = this.now();

    // 0. The slots (R503): a window that ends before it starts, a delivery slot that is not for `scheduled` (or missing for it), a
    // pickup window already over. Refused here, so the CHECKs of the database never see them and the proof is not spent.
    const slots = checkOrderSlots({ serviceCode: body.service.code, serviceSlot: body.service.slot, pickupSlot: body.sender.slot }, at.getTime());
    if (slots.length > 0) throw new ApiError("RULE_REFUSED", slots);

    // 1. The quote: unknown (or purged, 24 h after its expiry) is 404, expired is 410.
    const quote = await port.readQuote(actor, body.quote_id);
    if (!quote) throw new ApiError("NOT_FOUND");
    if (!isQuoteValid({ expiresAt: quote.expiresAt.toISOString() }, at.getTime())) throw new ApiError("QUOTE_EXPIRED");

    // 2. The body is the quote: parcels, service, packaging and the two addresses.
    const settings = await port.settings(actor);
    const parcels = body.parcel.parcels;
    if (parcels.length > Math.min(settings.maxParcels, MAX_PARCELS)) throw refuse("parcel.parcels", "tooManyParcels");
    const changed: FieldError[] = [];
    if (!same(parcels.map((p) => p.weight_g), quote.parcels.map((p) => p.weight_g)))
      changed.push({ name: "parcel.parcels", reason: "quoteChanged" });
    if (body.service.code !== quote.service) changed.push({ name: "service.code", reason: "quoteChanged" });
    if (body.parcel.type !== quote.parcelType) changed.push({ name: "parcel.type", reason: "quoteChanged" });
    if ((body.parcel.packaging ?? false) !== quote.packaging) changed.push({ name: "parcel.packaging", reason: "quoteChanged" });
    if ((body.parcel.fragile ?? false) !== quote.fragile) changed.push({ name: "parcel.fragile", reason: "quoteChanged" });
    if ((body.parcel.declared_value_millimes ?? null) !== quote.declaredValueMillimes)
      changed.push({ name: "parcel.declared_value_millimes", reason: "quoteChanged" });
    if (changed.length > 0) throw new ApiError("RULE_REFUSED", changed);
    const keyOf = (a: { text: string; pin?: { x: number; y: number } | null }) =>
      this.d.keys.mac("quote-address", addressPriceKey({ text: a.text, pin: a.pin ?? null }));
    const wrong: FieldError[] = [];
    if (keyOf(body.sender.address) !== quote.departureKeyHash) wrong.push({ name: "sender.address", reason: "addressMismatch" });
    if (keyOf(body.recipient.address) !== quote.arrivalKeyHash) wrong.push({ name: "recipient.address", reason: "addressMismatch" });
    if (wrong.length > 0) throw new ApiError("RULE_REFUSED", wrong);

    // 3. The grid of today gives the quote's price and date, then the total the customer saw (RV-05, R206).
    const priced = await this.d.priceAt(
      {
        service: quote.service,
        parcelType: quote.parcelType,
        parcels: quote.parcels,
        fragile: quote.fragile,
        packaging: quote.packaging,
        departureZoneId: quote.departureZoneId,
        arrivalZoneId: quote.arrivalZoneId,
      },
      at,
    );
    if (priced.totalMillimes !== quote.totalMillimes || priced.priceListValidFrom.getTime() !== quote.priceListValidFrom.getTime())
      throw refuse("quote_id", "quoteChanged");
    if (body.accepted_total_millimes !== quote.totalMillimes) throw refuse("accepted_total_millimes", "quoteChanged");

    // 4. Payment: no contract exists yet (4b-2b and PR 3b); freight due needs the acceptance (R607).
    if (body.payment_mode === "account") throw refuse("payment_mode", "contractRequired");
    if (body.payment_mode === "cashDelivery" && body.freight_payer_accepted !== true)
      throw refuse("freight_payer_accepted", "freightPayerRequired");

    // 5. The stored account (RV-19, RV-20): closed is refused; an unverified phone needs the proof.
    const account = await port.readAccount(actor);
    if (!account || account.status !== "active") throw new ApiError("ACCESS_DENIED");
    // The proof is for the sender's phone: none is needed only when that phone is the account's own and it is verified.
    const needsProof = !(account.phoneVerified && account.phone === body.sender.phone);
    const proofId = body.phone_check_id ?? null;
    if (needsProof && !proofId) throw refuse("phone_check_id", "phoneRequired");

    // 6. The proof, last of all the refusals. A proof for another sender phone lets this order through; the
    // account is marked verified only when the proved phone is the account's own.
    if (needsProof && proofId) {
      if (!(await this.d.checks.consume(proofId, body.sender.phone, "order"))) throw refuse("phone_check_id", "invalid");
    }

    const plan: OrderPlan = {
      scope: ctx.scope,
      at,
      actor,
      quote,
      body,
      freightPayer: body.payment_mode === "cashDelivery" ? "recipient" : "sender",
      proofLevel: proofLevelFor(
        { fragile: quote.fragile, codMillimes: null },
        { totalDeclaredValueMillimes: quote.declaredValueMillimes, strongerProofRequested: false },
      ),
      addressUnconfirmed: !(quote.departurePinned && quote.arrivalPinned),
      nullLines: quote.lines.filter((l) => l.millimes === null).map((l) => l.kind),
      markPhoneVerified: needsProof && proofId !== null && account.phone === body.sender.phone,
      newTrackingNumber: this.d.newTrackingNumber ?? randomTrackingCode,
      bodyHash,
    };
    try {
      return await port.insert(plan);
    } catch (error) {
      if (!(error instanceof ScopeTaken) || !ctx.scope) throw error;
      // The same key created the order in another transaction: answer that order (R202).
      const done = await port.findByScope(actor, ctx.scope);
      if (!done) throw new ApiError("STATE_CONFLICT");
      if (done.bodyHash !== bodyHash) throw new ApiError("KEY_REUSED");
      return done.order;
    }
  }

  // ---- GET /v1/orders, GET /v1/orders/{id} ------------------------------------------------------------------

  async list(actor: Actor, q: ListQuery): Promise<OrderListOut> {
    const page = await this.d.port.list(actor, q);
    if (page === "badCursor") throw new ApiError("VALIDATION_FAILED", [{ name: "cursor", reason: "invalid" }]);
    return page;
  }

  /** Another account's order, like an unknown one, is 404 (the RLS shows an owner only their own). */
  async get(actor: Actor, id: string): Promise<OrderOut> {
    const order = await this.d.port.get(actor, id);
    if (!order) throw new ApiError("NOT_FOUND");
    return order;
  }

  // ---- GET /v1/tracking/{number} ----------------------------------------------------------------------------

  /**
   * R405, T11. Public. 120 a minute per IP, and 20 numbers that do not exist per 10 minutes: past that, every call
   * of the IP is refused until the window ends, so the numbers cannot be guessed.
   */
  async tracking(number: string, locale: Locale, ctx: { ip: string }): Promise<TrackingOut> {
    const { missKey } = await this.trackingGate(ctx.ip);
    const found = await this.d.port.tracking(number, locale);
    if (!found) {
      await this.d.limiter.hit(missKey, TRACKING_LIMITS.misses.limit, TRACKING_LIMITS.misses.windowMs);
      throw new ApiError("NOT_FOUND");
    }
    return found;
  }

  /**
   * A number that does not have the FG-XXXX-XXXX shape is refused by the guard (400) before the route runs. The guard calls this first,
   * so it counts in the 120 a minute and as a miss like a number that does not exist: a script cannot guess numbers with malformed ones
   * for free. Past a limit it is the 429, not the 400.
   */
  async malformedTracking(ctx: { ip: string }): Promise<void> {
    const { missKey } = await this.trackingGate(ctx.ip);
    await this.d.limiter.hit(missKey, TRACKING_LIMITS.misses.limit, TRACKING_LIMITS.misses.windowMs);
  }

  /** The two limits, in this order: the 120 a minute (counted), then the misses already made (read). */
  private async trackingGate(ip: string): Promise<{ missKey: string }> {
    const ipKey = this.d.keys.mac("tracking-ip", ip);
    const all = await this.d.limiter.hit(`rl:tracking:${ipKey}`, TRACKING_LIMITS.perIp.limit, TRACKING_LIMITS.perIp.windowMs);
    if (!all.allowed) throw new ApiError("TOO_MANY_ATTEMPTS", [], secs(all.retryAfterMs));
    const missKey = `rl:tracking-miss:${ipKey}`;
    const seen = await this.d.limiter.peek(missKey);
    if (seen.count >= TRACKING_LIMITS.misses.limit) throw new ApiError("TOO_MANY_ATTEMPTS", [], secs(seen.retryAfterMs));
    return { missKey };
  }
}
