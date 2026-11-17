import { sql } from "drizzle-orm";
import type { Db, Tx } from "../db/index.ts";
import type { PriceRow, PricingStore, ReadQuote, Settings, StoredQuote, ZoneRow } from "./pricing.service.ts";

type Raw = Record<string, unknown>;
/** bigint and numeric come back from the driver as strings: millimes stay integers. */
const int = (v: unknown): number => Number(v);
const intOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * Reads and writes of the pricing module. The app has no identity here (the routes are public), so
 * every call runs without an actor: `core.quotes` is insert and select only for the app, and the
 * reference tables are read only.
 */
export class PricingRepo implements PricingStore<Tx> {
  constructor(private readonly db: Db) {}

  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.withNoActor(fn);
  }

  /** The active délégations, for the picker (never the polygon). */
  async zones(tx: Tx): Promise<ZoneRow[]> {
    const r = await tx.execute(
      sql`select id, name, name_ar, name_en, governorate from core.zones
           where active and governorate is not null order by governorate, name`,
    );
    return (r.rows as Raw[]).map(zoneRow);
  }

  /** R201: `core.zone_at` (ST_Covers, active zones, one zone on a shared border). x = longitude. */
  async zoneAt(tx: Tx, pin: { x: number; y: number }): Promise<ZoneRow | null> {
    const r = await tx.execute(
      sql`select z.id, z.name, z.name_ar, z.name_en, z.governorate from core.zones z where z.id = core.zone_at(${pin.x}, ${pin.y})`,
    );
    const row = (r.rows as Raw[])[0];
    return row ? zoneRow(row) : null;
  }

  async activeZone(tx: Tx, id: string): Promise<ZoneRow | null> {
    const r = await tx.execute(
      sql`select id, name, name_ar, name_en, governorate from core.zones where id = ${id} and active`,
    );
    const row = (r.rows as Raw[])[0];
    return row ? zoneRow(row) : null;
  }

  async settingsRow(tx: Tx): Promise<Settings> {
    const r = await tx.execute(sql`select * from core.pricing_settings`);
    const s = (r.rows as Raw[])[0];
    if (!s) throw new Error("core.pricing_settings has no row");
    return {
      distanceMillimes: int(s.distance_millimes),
      weightIncludedG: int(s.weight_included_g),
      weightPerKgMillimes: int(s.weight_per_kg_millimes),
      retryFeeMillimes: int(s.retry_fee_millimes),
      returnFeeMillimes: int(s.return_fee_millimes),
      quoteValidityMs: int(s.quote_validity_ms),
      maxParcels: int(s.max_parcels),
      maxParcelWeightG: intOrNull(s.max_parcel_weight_g),
      taxBasis: (s.tax_basis as Settings["taxBasis"]) ?? null,
      vatMillimes: intOrNull(s.vat_millimes),
      stampMillimes: intOrNull(s.stamp_millimes),
      fragileFeeMillimes: intOrNull(s.fragile_fee_millimes),
      declaredValueFeeMillimes: intOrNull(s.declared_value_fee_millimes),
      rainActive: Boolean(s.rain_active),
      rainSurchargeMillimes: intOrNull(s.rain_surcharge_millimes),
      rainCeilingMillimes: intOrNull(s.rain_ceiling_millimes),
    };
  }

  /**
   * R204, R206: the price rows in force at `at` (`valid_from <= at`), one per service and packaging
   * option. A row of the zone beats the default row (zone null), and the latest start wins. A service
   * that is not active has no row.
   */
  async priceList(tx: Tx, at: Date, zoneId: string | null): Promise<PriceRow[]> {
    const r = await tx.execute(
      sql`select distinct on (p.service_code, p.with_packaging)
                 p.service_code, p.with_packaging, p.millimes, p.zone_id, p.valid_from
            from core.prices p join core.services s on s.code = p.service_code and s.active
           where p.valid_from <= ${at.toISOString()}::timestamptz
             and (p.zone_id is null or p.zone_id = ${zoneId}::uuid)
           order by p.service_code, p.with_packaging, (p.zone_id is null), p.valid_from desc`,
    );
    return (r.rows as Raw[]).map((p) => ({
      serviceCode: p.service_code as PriceRow["serviceCode"],
      withPackaging: Boolean(p.with_packaging),
      millimes: intOrNull(p.millimes),
      zoneId: (p.zone_id as string | null) ?? null,
      validFrom: new Date(p.valid_from as string | Date),
    }));
  }

  async saveQuote(tx: Tx, q: StoredQuote): Promise<void> {
    await tx.execute(
      sql`insert into core.quotes
            (id, departure_key_hash, arrival_key_hash, service_code, parcel_type, parcels, packaging, fragile,
             declared_value_millimes, departure_zone_id, arrival_zone_id, departure_pinned, arrival_pinned,
             lines, total_millimes, tax_basis, amount_ht_millimes, amount_ttc_millimes, surcharge,
             price_list_valid_from, quoted_at, expires_at)
          values (${q.id}, ${q.departureKeyHash}, ${q.arrivalKeyHash}, ${q.service}, ${q.parcelType},
                  ${JSON.stringify(q.parcels)}::jsonb, ${q.packaging}, ${q.fragile}, ${q.declaredValueMillimes},
                  ${q.departureZoneId}, ${q.arrivalZoneId}, ${q.departurePinned}, ${q.arrivalPinned},
                  ${JSON.stringify(q.lines)}::jsonb, ${q.totalMillimes}, ${q.taxBasis}, ${q.amountHtMillimes},
                  ${q.amountTtcMillimes}, ${q.surcharge === null ? null : JSON.stringify(q.surcharge)}::jsonb,
                  ${q.priceListValidFrom.toISOString()}::timestamptz, ${q.quotedAt.toISOString()}::timestamptz,
                  ${q.expiresAt.toISOString()}::timestamptz)`,
    );
  }

  async readQuote(tx: Tx, id: string): Promise<ReadQuote | null> {
    const r = await tx.execute(
      sql`select q.*, dz.name as departure_zone_name, az.name as arrival_zone_name from core.quotes q
            join core.zones dz on dz.id = q.departure_zone_id
            join core.zones az on az.id = q.arrival_zone_id where q.id = ${id}`,
    );
    const q = (r.rows as Raw[])[0];
    if (!q) return null;
    return {
      id: q.id as string,
      departureZoneName: q.departure_zone_name as string,
      arrivalZoneName: q.arrival_zone_name as string,
      departureKeyHash: q.departure_key_hash as string,
      arrivalKeyHash: q.arrival_key_hash as string,
      service: q.service_code as ReadQuote["service"],
      parcelType: q.parcel_type as ReadQuote["parcelType"],
      parcels: q.parcels as ReadQuote["parcels"],
      packaging: Boolean(q.packaging),
      fragile: Boolean(q.fragile),
      declaredValueMillimes: intOrNull(q.declared_value_millimes),
      departureZoneId: q.departure_zone_id as string,
      arrivalZoneId: q.arrival_zone_id as string,
      departurePinned: Boolean(q.departure_pinned),
      arrivalPinned: Boolean(q.arrival_pinned),
      lines: q.lines as ReadQuote["lines"],
      totalMillimes: int(q.total_millimes),
      taxBasis: (q.tax_basis as ReadQuote["taxBasis"]) ?? null,
      amountHtMillimes: intOrNull(q.amount_ht_millimes),
      amountTtcMillimes: intOrNull(q.amount_ttc_millimes),
      surcharge: (q.surcharge as ReadQuote["surcharge"]) ?? null,
      priceListValidFrom: new Date(q.price_list_valid_from as string | Date),
      quotedAt: new Date(q.quoted_at as string | Date),
      expiresAt: new Date(q.expires_at as string | Date),
    };
  }
}

const zoneRow = (z: Raw): ZoneRow => ({
  id: z.id as string,
  name: z.name as string,
  nameAr: z.name_ar as string,
  nameEn: z.name_en as string,
  governorate: (z.governorate as string | null) ?? null,
});
