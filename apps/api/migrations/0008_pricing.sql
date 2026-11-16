-- Zones, prices and quotes for issue #10 (plan PR 4b-1). The plan names this file 0007_pricing; 0007 is
-- taken by rls_fixes, so it is 0008.

-- Zones: one row per délégation (decided 16 Nov: Tunis, Ariana, Ben Arous, Manouba, all on). The
-- polygons come from a one-time OpenStreetMap extract loaded by a seed (infra/data/zones, ODbL); the
-- column stays nullable so a zone can exist before its polygon does.
alter table core.zones add column governorate text
  constraint zones_governorate_check check (governorate in ('Tunis', 'Ariana', 'Ben Arous', 'Manouba'));
create index zones_area_gist on core.zones using gist (area);

-- The zone of a point (R201). A point on a border counts as inside (ST_Covers). On a border shared by
-- two zones, one zone comes back, the first by name. Active zones only, so a paused délégation is out
-- of zone. x = longitude, y = latitude (the contract's Pin).
create function core.zone_at(lon double precision, lat double precision) returns uuid
  language sql stable parallel safe set search_path = pg_catalog, core
  as $$
    select z.id from core.zones z
     where z.active and z.area is not null
       and public.ST_Covers(z.area, public.ST_SetSRID(public.ST_MakePoint(lon, lat), 4326)::public.geography)
     order by z.name
     limit 1
  $$;
revoke execute on function core.zone_at(double precision, double precision) from public;
grant execute on function core.zone_at(double precision, double precision) to fastgo_app;

-- Prices (R204, R206): versioned and per zone. A quote reads the rows in force at `at`
-- (`valid_from <= at`, the latest per key), and a row with a zone beats the one without. `zone_id` null
-- = every zone. `with_packaging = false` is the base price of the service; `with_packaging = true` is the
-- GOFAST packaging supplement per parcel (+2000: 12 - 10 and 17 - 15), not a total.
alter table core.prices drop constraint prices_pkey;
alter table core.prices add column id bigint generated always as identity primary key;
alter table core.prices add column zone_id uuid references core.zones (id);
alter table core.prices add column valid_from timestamptz not null default now();
create unique index prices_version_key on core.prices
  (service_code, with_packaging, coalesce(zone_id, '00000000-0000-0000-0000-000000000000'::uuid), valid_from);
-- The three services of the cahier exist (a service is offered only while it has a base price in force).
insert into core.services (code, active) values ('standard', true), ('express', true), ('scheduled', true)
  on conflict (code) do nothing;
-- Seed: GOFAST's answers of 6 Nov 2026 (reponses-gofast.md). Programmée has no price ([PRIX]).
insert into core.prices (service_code, with_packaging, millimes, zone_id, valid_from) values
  ('standard', false, 10000, null, '2026-11-06T00:00:00Z'),
  ('standard', true, 2000, null, '2026-11-06T00:00:00Z'),
  ('express', false, 15000, null, '2026-11-06T00:00:00Z'),
  ('express', true, 2000, null, '2026-11-06T00:00:00Z'),
  ('scheduled', false, null, null, '2026-11-06T00:00:00Z'),
  ('scheduled', true, null, null, '2026-11-06T00:00:00Z');

-- Settings of the price: ONE row. A null is a value GOFAST has not given (the pages show a placeholder).
-- Edited later by the back-office, with the audit log (BO-13); the app only reads it.
create table core.pricing_settings (
  id boolean primary key default true check (id),
  distance_millimes bigint not null default 0 check (distance_millimes >= 0),
  weight_included_g integer not null default 2000 check (weight_included_g > 0),
  weight_per_kg_millimes bigint not null default 0 check (weight_per_kg_millimes >= 0),
  retry_fee_millimes bigint not null default 0 check (retry_fee_millimes >= 0),
  return_fee_millimes bigint not null default 5000 check (return_fee_millimes >= 0),
  quote_validity_ms bigint not null default 900000 check (quote_validity_ms > 0),
  max_parcels integer not null default 10 check (max_parcels > 0),
  max_parcel_weight_g integer check (max_parcel_weight_g > 0),
  tax_basis text check (tax_basis in ('ttc', 'ht')),
  vat_millimes bigint check (vat_millimes >= 0),
  stamp_millimes bigint check (stamp_millimes >= 0),
  fragile_fee_millimes bigint check (fragile_fee_millimes >= 0),
  declared_value_fee_millimes bigint check (declared_value_fee_millimes >= 0),
  rain_active boolean not null default false,
  rain_surcharge_millimes bigint check (rain_surcharge_millimes >= 0),
  rain_ceiling_millimes bigint check (rain_ceiling_millimes >= 0)
);
insert into core.pricing_settings (id) values (true);
select core.reference('core.pricing_settings');

-- Quotes (R204, R205). The route is public, so a quote has no owner. It keeps an HMAC of each address
-- key, never the address text (RV-18). The app inserts and reads, and never changes or deletes one.
create table core.quotes (
  id uuid primary key default gen_random_uuid(),
  departure_key_hmac text not null,
  arrival_key_hmac text not null,
  service_code text not null references core.services (code),
  parcel_type text not null check (parcel_type in ('document', 'small', 'medium', 'large')),
  parcels jsonb not null,
  packaging boolean not null,
  fragile boolean not null,
  declared_value_millimes bigint check (declared_value_millimes >= 0),
  departure_zone_id uuid not null references core.zones (id),
  arrival_zone_id uuid not null references core.zones (id),
  departure_pinned boolean not null,
  arrival_pinned boolean not null,
  lines jsonb not null,
  total_millimes bigint not null check (total_millimes >= 0),
  tax_basis text check (tax_basis in ('ttc', 'ht')),
  amount_ht_millimes bigint check (amount_ht_millimes >= 0),
  amount_ttc_millimes bigint check (amount_ttc_millimes >= 0),
  surcharge jsonb,
  price_list_valid_from timestamptz not null,
  quoted_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at > quoted_at)
);
select core.protect('core.quotes', 'select, insert');
create policy quotes_select on core.quotes for select to fastgo_app using (true);
create policy quotes_insert on core.quotes for insert to fastgo_app with check (true);
