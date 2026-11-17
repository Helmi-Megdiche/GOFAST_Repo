import { randomUUID } from "node:crypto";
import type { components } from "@fastgo/contract";
import {
  addressPriceKey,
  isQuoteValid,
  MAX_PARCEL_WEIGHT_G,
  MAX_PARCELS,
  PRICE_LINES,
  priceLines,
  sumLines,
  type ParcelTypeCode,
  type PriceLines,
  type PriceTable,
  type ServiceCode,
} from "@fastgo/domain";
import type { Keys } from "../auth/crypto.ts";
import { ipKey } from "../auth/ip.ts";
import type { RateLimiter } from "../auth/rate-limit.ts";
import { ApiError, type FieldError } from "../http/errors.ts";

type Schemas = components["schemas"];
/**
 * The body as it may arrive: the contract's defaults (`packaging`, `fragile`, `landmark`) are optional
 * on the wire, though the generated type lists them as present.
 */
type AddressIn = Omit<Schemas["AddressInput"], "landmark"> & { landmark?: string };
export type QuoteRequest = Omit<Schemas["QuoteRequest"], "packaging" | "fragile" | "departure" | "arrival"> & {
  packaging?: boolean;
  fragile?: boolean;
  departure: AddressIn;
  arrival: AddressIn;
};
export type QuoteOut = Schemas["Quote"];
export type CatalogOut = Schemas["ServiceCatalog"];
export type ZoneCheckRequest = Schemas["ZoneCheckRequest"];
export type ZoneCheckOut = Schemas["ZoneCheck"];
type LineOut = QuoteOut["lines"][number];

/** PROVISIONAL (not in the cahier): the limit of the two public routes that cost a lookup, per IP. */
export const PRICING_LIMITS = { perIp: { limit: 120, windowMs: 60_000 } } as const;

export type ZoneRow = { id: string; name: string; governorate: string | null };
/** One row of `core.prices` in force. `withPackaging` true is the packaging supplement per parcel. */
export type PriceRow = {
  serviceCode: ServiceCode;
  withPackaging: boolean;
  millimes: number | null;
  zoneId: string | null;
  validFrom: Date;
};
/** `core.pricing_settings`. A null is a value GOFAST has not given. */
export type Settings = {
  distanceMillimes: number;
  weightIncludedG: number;
  weightPerKgMillimes: number;
  retryFeeMillimes: number;
  returnFeeMillimes: number;
  quoteValidityMs: number;
  maxParcels: number;
  maxParcelWeightG: number | null;
  taxBasis: "ttc" | "ht" | null;
  vatMillimes: number | null;
  stampMillimes: number | null;
  fragileFeeMillimes: number | null;
  declaredValueFeeMillimes: number | null;
  rainActive: boolean;
  rainSurchargeMillimes: number | null;
  rainCeilingMillimes: number | null;
};
/** A quote as it is kept (`core.quotes`): zone ids and keyed hashes, never an address text. */
export type StoredQuote = {
  id: string;
  departureKeyHash: string;
  arrivalKeyHash: string;
  service: ServiceCode;
  parcelType: ParcelTypeCode;
  parcels: { weight_g: number }[];
  packaging: boolean;
  fragile: boolean;
  declaredValueMillimes: number | null;
  departureZoneId: string;
  arrivalZoneId: string;
  departurePinned: boolean;
  arrivalPinned: boolean;
  lines: LineOut[];
  totalMillimes: number;
  taxBasis: "ttc" | "ht" | null;
  amountHtMillimes: number | null;
  amountTtcMillimes: number | null;
  surcharge: QuoteOut["surcharge"];
  priceListValidFrom: Date;
  quotedAt: Date;
  expiresAt: Date;
};

/** A quote as it is read: the arrival zone's name is joined from `core.zones`, it is not stored. */
export type ReadQuote = StoredQuote & { arrivalZoneName: string };

/** What the service needs from the database. `Tx` stays opaque here: only the repo knows it. */
export interface PricingStore<Tx = never> {
  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  zones(tx: Tx): Promise<ZoneRow[]>;
  zoneAt(tx: Tx, pin: { x: number; y: number }): Promise<ZoneRow | null>;
  activeZone(tx: Tx, id: string): Promise<ZoneRow | null>;
  settingsRow(tx: Tx): Promise<Settings>;
  priceList(tx: Tx, at: Date, zoneId: string | null): Promise<PriceRow[]>;
  saveQuote(tx: Tx, quote: StoredQuote): Promise<void>;
  readQuote(tx: Tx, id: string): Promise<ReadQuote | null>;
}

export type Deps = {
  store: PricingStore;
  keys: Keys;
  limiter: RateLimiter;
  /** The clock: the only source of time of the module. */
  now?: () => Date;
  newId?: () => string;
};
export type Ctx = { ip: string; requestId: string };

const SERVICES: ServiceCode[] = ["express", "standard", "scheduled"];
const PARCEL_TYPES: ParcelTypeCode[] = ["document", "small", "medium", "large"];
const secs = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

type Resolved = { zone: ZoneRow; pinned: boolean };
type Grid = Map<string, PriceRow>;

export class PricingService {
  private readonly now: () => Date;
  private readonly newId: () => string;
  constructor(private readonly d: Deps) {
    this.now = d.now ?? (() => new Date());
    this.newId = d.newId ?? randomUUID;
  }

  private async limit(scope: string, ctx: Ctx): Promise<void> {
    const key = `rl:${scope}:${this.d.keys.mac(scope, ipKey(ctx.ip))}`;
    const r = await this.d.limiter.hit(key, PRICING_LIMITS.perIp.limit, PRICING_LIMITS.perIp.windowMs);
    if (!r.allowed) throw new ApiError("TOO_MANY_ATTEMPTS", [], secs(r.retryAfterMs));
  }

  /** The rows in force, by `service/withPackaging`. */
  private async grid(tx: never, at: Date, zoneId: string | null): Promise<Grid> {
    const rows = await this.d.store.priceList(tx, at, zoneId);
    return new Map(rows.map((r) => [`${r.serviceCode}/${r.withPackaging}`, r]));
  }

  /** A service is offered when it is active (it has a row) and has a base price in force. */
  private offered(grid: Grid): ServiceCode[] {
    return SERVICES.filter((s) => grid.get(`${s}/false`)?.millimes != null).sort();
  }

  // ---- GET /v1/services ----------------------------------------------------------------------

  async listServices(): Promise<CatalogOut> {
    const at = this.now();
    return this.d.store.run(async (tx) => {
      const [zones, settings, grid] = await Promise.all([
        this.d.store.zones(tx),
        this.d.store.settingsRow(tx),
        this.grid(tx, at, null),
      ]);
      return {
        offers: this.offered(grid).map((code) => ({
          code,
          from_price_millimes: grid.get(`${code}/false`)?.millimes ?? null,
          packaging_price_millimes: grid.get(`${code}/true`)?.millimes ?? null,
          cutoff_time: null,
        })),
        parcel_types: PARCEL_TYPES.map((code) => ({ code, limit: null })),
        extras: [
          { code: "fragile", fee_millimes: settings.fragileFeeMillimes },
          { code: "declaredValue", fee_millimes: settings.declaredValueFeeMillimes },
          { code: "retry", fee_millimes: settings.retryFeeMillimes },
          { code: "return", fee_millimes: settings.returnFeeMillimes },
        ],
        zones: zones.map((z) => ({ id: z.id, name: z.name, governorate: z.governorate ?? "" })),
      };
    });
  }

  // ---- POST /v1/zone-checks ------------------------------------------------------------------

  async createZoneCheck(body: ZoneCheckRequest, ctx: Ctx): Promise<ZoneCheckOut> {
    await this.limit("zone-check-ip", ctx);
    const at = this.now();
    return this.d.store.run(async (tx) => {
      const zone =
        "pin" in body
          ? await this.d.store.zoneAt(tx, body.pin)
          : await this.d.store.activeZone(tx, body.zone_id);
      if (!zone)
        return { status: "out_of_zone", zone_id: null, zone_name: null, services: [], reason: "outOfZone" };
      const services = this.offered(await this.grid(tx, at, zone.id));
      return { status: "in_zone", zone_id: zone.id, zone_name: zone.name, services, reason: null };
    });
  }

  // ---- POST /v1/quotes -----------------------------------------------------------------------

  /** R201: a pin decides the zone; without one, the picked délégation must be active. */
  private async resolve(tx: never, a: AddressIn): Promise<Resolved | "outOfZone" | "addressUnconfirmed"> {
    if (a.pin) {
      const zone = await this.d.store.zoneAt(tx, a.pin);
      return zone ? { zone, pinned: true } : "outOfZone";
    }
    if (a.zone_id) {
      const zone = await this.d.store.activeZone(tx, a.zone_id);
      return zone ? { zone, pinned: false } : "outOfZone";
    }
    return "addressUnconfirmed";
  }

  async createQuote(body: QuoteRequest, ctx: Ctx): Promise<QuoteOut> {
    await this.limit("quote-ip", ctx);
    const quotedAt = this.now();
    return this.d.store.run(async (tx) => {
      // 1. The zone of each address (R201), before anything else: no price, no row.
      const [departure, arrival] = [await this.resolve(tx, body.departure), await this.resolve(tx, body.arrival)];
      const zoneFields: FieldError[] = [];
      if (typeof departure === "string") zoneFields.push({ name: "departure", reason: departure });
      if (typeof arrival === "string") zoneFields.push({ name: "arrival", reason: arrival });
      if (typeof departure === "string" || typeof arrival === "string")
        throw new ApiError("RULE_REFUSED", zoneFields);

      const settings = await this.d.store.settingsRow(tx);

      // 2. The parcels.
      const maxParcels = Math.min(settings.maxParcels, MAX_PARCELS);
      if (body.parcels.length > maxParcels)
        throw new ApiError("RULE_REFUSED", [{ name: "parcels", reason: "tooManyParcels" }]);
      const maxWeight = settings.maxParcelWeightG ?? MAX_PARCEL_WEIGHT_G;
      const heavy: FieldError[] = [];
      body.parcels.forEach((p, i) => {
        if (p.weight_g > maxWeight) heavy.push({ name: `parcels.${i}.weight_g`, reason: "tooHeavy" });
      });
      if (heavy.length > 0) throw new ApiError("RULE_REFUSED", heavy);

      // 3. Every price the quote needs must exist. The price list is the one in force at `quotedAt`
      // for the arrival zone (R206: the grid of the day the quote is made).
      const grid = await this.grid(tx, quotedAt, arrival.zone.id);
      const base = grid.get(`${body.service}/false`);
      const packagingRow = grid.get(`${body.service}/true`);
      const missing: FieldError[] = [];
      if (base?.millimes == null) missing.push({ name: "service", reason: "priceUnavailable" });
      if (body.fragile && settings.fragileFeeMillimes == null)
        missing.push({ name: "fragile", reason: "priceUnavailable" });
      // A declared value is not a price element (R204 has no such line): it is stored, it serves the
      // R802 cap, and it never changes the price.
      if (body.packaging && packagingRow?.millimes == null)
        missing.push({ name: "packaging", reason: "priceUnavailable" });
      if (settings.rainActive && settings.rainSurchargeMillimes == null)
        missing.push({ name: "surcharge", reason: "priceUnavailable" });
      if (missing.length > 0 || base?.millimes == null) throw new ApiError("RULE_REFUSED", missing);

      // 4. The price, by the domain rules.
      const packaging = body.packaging ?? false;
      const fragile = body.fragile ?? false;
      const row = { base: base.millimes, vat: settings.vatMillimes ?? 0, packaging: packagingRow?.millimes ?? null };
      const table: PriceTable = {
        rows: Object.fromEntries(
          SERVICES.map((s) => [s, Object.fromEntries(PARCEL_TYPES.map((t) => [t, row]))]),
        ) as PriceTable["rows"],
        distance: settings.distanceMillimes,
        // Whole kilograms: the domain counts every started kilogram above the included weight.
        weight: { includedKg: Math.floor(settings.weightIncludedG / 1000), perKg: settings.weightPerKgMillimes },
        optionsFragile: settings.fragileFeeMillimes ?? 0,
        surcharge: {
          code: "rain",
          amount: settings.rainActive ? (settings.rainSurchargeMillimes ?? 0) : 0,
          ceiling: settings.rainCeilingMillimes,
        },
        discount: 0,
        stamp: settings.stampMillimes ?? 0,
      };
      const lines = priceLines(
        {
          service: body.service,
          parcelType: body.parcel_type,
          parcels: body.parcels.map((p) => ({ weightG: p.weight_g })),
          fragile,
          packaging,
          zone: arrival.zone.id,
          from: departure.zone.id,
          to: arrival.zone.id,
        },
        table,
      );
      const id = this.newId();
      const expiresAt = new Date(quotedAt.getTime() + settings.quoteValidityMs);
      const out = lineOut(lines, settings);
      const stored: StoredQuote = {
        id,
        departureKeyHash: this.d.keys.mac("quote-address", addressPriceKey({ text: body.departure.text, pin: body.departure.pin ?? null })),
        arrivalKeyHash: this.d.keys.mac("quote-address", addressPriceKey({ text: body.arrival.text, pin: body.arrival.pin ?? null })),
        service: body.service,
        parcelType: body.parcel_type,
        parcels: body.parcels.map((p) => ({ weight_g: p.weight_g })),
        packaging,
        fragile,
        declaredValueMillimes: body.declared_value_millimes ?? null,
        departureZoneId: departure.zone.id,
        arrivalZoneId: arrival.zone.id,
        departurePinned: departure.pinned,
        arrivalPinned: arrival.pinned,
        lines: out,
        totalMillimes: sumLines(lines),
        taxBasis: settings.taxBasis,
        // No formula for HT and TTC is given yet: both stay null (plan 4b-1).
        amountHtMillimes: null,
        amountTtcMillimes: null,
        surcharge: settings.rainActive ? { code: "rain", ceiling_millimes: settings.rainCeilingMillimes } : null,
        priceListValidFrom: base.validFrom,
        quotedAt,
        expiresAt,
      };
      await this.d.store.saveQuote(tx, stored);
      return toQuote(stored, arrival.zone.name);
    });
  }

  // ---- GET /v1/quotes/{id} -------------------------------------------------------------------

  async getQuote(id: string): Promise<QuoteOut> {
    const at = this.now();
    const stored = await this.d.store.run((tx) => this.d.store.readQuote(tx, id));
    if (!stored) throw new ApiError("NOT_FOUND");
    // R205: valid until the last millisecond before expires_at.
    if (!isQuoteValid({ expiresAt: stored.expiresAt.toISOString() }, at.getTime()))
      throw new ApiError("QUOTE_EXPIRED");
    return toQuote(stored, stored.arrivalZoneName);
  }
}

/** The contract's lines. VAT and stamp are null until the settings give them. */
function lineOut(lines: PriceLines, settings: Settings): LineOut[] {
  return PRICE_LINES.map((kind): LineOut => {
    const l = lines[kind];
    if (kind === "discount")
      return { kind, unit_millimes: l.unitMillimes ?? 0, count: l.count, millimes: l.totalMillimes } as LineOut;
    if ((kind === "vat" && settings.vatMillimes == null) || (kind === "stamp" && settings.stampMillimes == null))
      return { kind, unit_millimes: null, count: 1, millimes: null };
    return { kind, unit_millimes: l.unitMillimes, count: l.count, millimes: l.totalMillimes };
  });
}

function toQuote(s: StoredQuote, zoneName: string): QuoteOut {
  return {
    id: s.id,
    service: s.service,
    parcel_type: s.parcelType,
    zone_id: s.arrivalZoneId,
    zone_name: zoneName,
    parcels: s.parcels as QuoteOut["parcels"],
    packaging: s.packaging,
    fragile: s.fragile,
    lines: s.lines,
    total_millimes: s.totalMillimes,
    tax_basis: s.taxBasis,
    amount_ht_millimes: s.amountHtMillimes,
    amount_ttc_millimes: s.amountTtcMillimes,
    departure_pinned: s.departurePinned,
    arrival_pinned: s.arrivalPinned,
    surcharge: s.surcharge,
    quoted_at: s.quotedAt.toISOString(),
    expires_at: s.expiresAt.toISOString(),
  };
}
