-- Orders and what hangs on them: parcels, missions, status history, proofs, delivery codes,
-- recipient links, outbox, tickets. Drivers see nothing yet (their policies come with the driver app).
-- State columns are text + CHECK; a test compares them with packages/contract/schemas/common.yaml.
-- Money is bigint millimes. Every policy subselect reads a table that already exists above it.

create table core.orders (
  id uuid primary key default gen_random_uuid(),
  tracking_number text not null unique check (tracking_number ~ '^FG-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  owner_account_id uuid references core.accounts (id),
  owner_company_id uuid references core.companies (id),
  created_by uuid references core.accounts (id),
  -- Idempotent creation (x-replay: key): the same scope returns the same order.
  idempotency_scope text unique,
  service text not null check (service in ('express', 'standard', 'scheduled')),
  payment_mode text not null check (payment_mode in ('cashPickup', 'cashDelivery', 'account')),
  freight_payer text not null check (freight_payer in ('sender', 'recipient')),
  recipient_locale text not null default 'fr' check (recipient_locale in ('fr', 'ar', 'en')),
  status text not null default 'received' check (status in ('received', 'confirmed', 'assigned',
    'pickup_failed', 'picked_up', 'in_transit', 'delivered', 'partially_delivered', 'returned',
    'lost', 'canceled')),
  total_millimes bigint not null check (total_millimes >= 0),
  pickup_address_id uuid not null references core.addresses (id),
  recipient_id uuid not null references core.recipients (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(owner_account_id, owner_company_id) = 1)
);
create index orders_owner_account on core.orders (owner_account_id, created_at desc);
create index orders_owner_company on core.orders (owner_company_id, created_at desc);
create index orders_status on core.orders (status);
select core.protect('core.orders', 'select, insert, update');

-- The pickup address and the recipient belong to the owner of the order (no pointing at a tenant's row).
create policy orders_select on core.orders for select to fastgo_app
  using (core.owns(owner_account_id, owner_company_id) or core.staff_reads_customers());
create policy orders_insert on core.orders for insert to fastgo_app
  with check ((core.owns(owner_account_id, owner_company_id) or core.staff_writes_customers())
    and exists (select 1 from core.addresses a
                 where a.id = pickup_address_id
                   and a.owner_account_id is not distinct from core.orders.owner_account_id
                   and a.owner_company_id is not distinct from core.orders.owner_company_id)
    and exists (select 1 from core.recipients r
                 where r.id = recipient_id
                   and r.owner_account_id is not distinct from core.orders.owner_account_id
                   and r.owner_company_id is not distinct from core.orders.owner_company_id));
create policy orders_update on core.orders for update to fastgo_app
  using (core.owns(owner_account_id, owner_company_id) or core.staff_writes_customers())
  with check (core.owns(owner_account_id, owner_company_id) or core.staff_writes_customers());

create table core.parcels (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references core.orders (id),
  barcode text unique,
  size text not null check (size in ('document', 'small', 'medium', 'large')),
  weight_declared_g integer not null check (weight_declared_g > 0),
  weight_measured_g integer check (weight_measured_g > 0),
  declared_value_millimes bigint not null default 0 check (declared_value_millimes >= 0),
  cod_millimes bigint not null default 0 check (cod_millimes >= 0),
  proof_level text not null check (proof_level in ('codeOrPhotoWithPosition',
    'codeOrSignatureAndPhoto', 'codeOrAgentPhoneWithSignatureAndPhoto')),
  attempts integer not null default 0 check (attempts >= 0),
  status text not null default 'to_collect' check (status in ('to_collect', 'taken', 'at_depot',
    'in_transit', 'delivery_failed', 'returning', 'handed_over', 'returned', 'lost', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index parcels_order on core.parcels (order_id);
select core.protect('core.parcels', 'select, insert, update');

-- A parcel is as visible as its order (the subselect goes through the RLS of orders).
create policy parcels_select on core.parcels for select to fastgo_app
  using (exists (select 1 from core.orders o where o.id = order_id));
create policy parcels_insert on core.parcels for insert to fastgo_app
  with check (exists (select 1 from core.orders o where o.id = order_id));
create policy parcels_update on core.parcels for update to fastgo_app
  using (exists (select 1 from core.orders o where o.id = order_id))
  with check (exists (select 1 from core.orders o where o.id = order_id));

create table core.missions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references core.orders (id),
  driver_id uuid references core.accounts (id),
  kind text not null check (kind in ('pickup', 'delivery')),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'refused',
    'expired', 'arrived', 'finished')),
  end_reason text check (end_reason in ('driverRemoved', 'pickupFailed', 'orderCanceled')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz,
  arrived_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index missions_order on core.missions (order_id);
create index missions_driver on core.missions (driver_id) where driver_id is not null;
select core.protect('core.missions', 'select, insert, update');

-- Dispatch is staff work. A driver reads his missions with the driver app (not in this lot).
create policy missions_select on core.missions for select to fastgo_app
  using (core.staff_reads_customers());
create policy missions_insert on core.missions for insert to fastgo_app
  with check (core.staff_writes_customers());
create policy missions_update on core.missions for update to fastgo_app
  using (core.staff_writes_customers())
  with check (core.staff_writes_customers());

-- Status history: append-only. Not readable by fastgo_readonly (a position is personal data, D9).
create table core.status_events (
  id uuid primary key default gen_random_uuid(),
  -- Set by the client for a driver action replayed after being offline: the same id is stored once.
  event_id uuid not null unique default gen_random_uuid(),
  order_id uuid not null references core.orders (id),
  subject_type text not null check (subject_type in ('order', 'parcel', 'mission')),
  subject_id uuid not null,
  from_status text,
  to_status text not null check (to_status <> ''),
  actor_id uuid references core.accounts (id),
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  location public.geography(Point, 4326)
);
create index status_events_order on core.status_events (order_id, occurred_at);
create index status_events_subject on core.status_events (subject_type, subject_id);
select core.protect('core.status_events', 'select, insert', false);

create policy status_events_select on core.status_events for select to fastgo_app
  using (exists (select 1 from core.orders o where o.id = order_id));
create policy status_events_insert on core.status_events for insert to fastgo_app
  with check (actor_id is not distinct from core.app_user_id()
    and exists (select 1 from core.orders o where o.id = order_id));

-- D9: the position is kept for a limited time, then the worker empties it. That is the only change
-- the table accepts, and only from the worker login.
grant select, update (location) on core.status_events to fastgo_worker;
create policy status_events_select_worker on core.status_events for select to fastgo_worker using (true);
create policy status_events_purge_worker on core.status_events for update to fastgo_worker
  using (true) with check (location is null);

create or replace function core.status_events_guard() returns trigger
  language plpgsql set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' and current_user = 'fastgo_worker' and new.location is null
     and (to_jsonb(new) - 'location') = (to_jsonb(old) - 'location') then
    return new;
  end if;
  raise exception 'status_events is append-only (% refused)', tg_op using errcode = 'insufficient_privilege';
end $$;
create trigger status_events_no_change before update or delete on core.status_events
  for each row execute function core.status_events_guard();
create trigger status_events_no_truncate before truncate on core.status_events
  for each statement execute function core.status_events_guard();

create table core.proofs (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references core.parcels (id),
  kind text not null check (kind in ('code', 'photo', 'signature', 'agentPhone')),
  code_verified boolean not null default false,
  captured_at timestamptz not null default now(),
  location public.geography(Point, 4326),
  file_id text,
  validated_by uuid references core.accounts (id),
  created_at timestamptz not null default now()
);
create index proofs_parcel on core.proofs (parcel_id);
select core.protect('core.proofs', 'select, insert', false);

create policy proofs_select on core.proofs for select to fastgo_app
  using (exists (select 1 from core.parcels p where p.id = parcel_id));
create policy proofs_insert on core.proofs for insert to fastgo_app
  with check (core.staff_writes_customers()
    and exists (select 1 from core.parcels p where p.id = parcel_id));

-- A 4-digit code is guessable offline: only an HMAC with a key from the environment is stored.
-- The app never reads the hash and never counts attempts: a definer function does (PR 4b).
create table core.delivery_codes (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null unique references core.parcels (id),
  code_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
select core.protect('core.delivery_codes', 'select, insert', false);
select core.hide_hashes_from_app('core.delivery_codes');

create policy delivery_codes_select on core.delivery_codes for select to fastgo_app
  using (core.staff_reads_customers());
create policy delivery_codes_insert on core.delivery_codes for insert to fastgo_app
  with check (core.staff_writes_customers()
    and exists (select 1 from core.parcels p where p.id = parcel_id));

create table core.recipient_links (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references core.orders (id),
  token_hash text not null unique,
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index recipient_links_order on core.recipient_links (order_id);
select core.protect('core.recipient_links', 'select, insert', false);
select core.hide_hashes_from_app('core.recipient_links');

-- The recipient opens the link through core.recipient_link(token_hash) (definer), never by SELECT.
create policy recipient_links_select on core.recipient_links for select to fastgo_app
  using (exists (select 1 from core.orders o where o.id = order_id));
create policy recipient_links_insert on core.recipient_links for insert to fastgo_app
  with check (exists (select 1 from core.orders o where o.id = order_id));

-- Messages to send (SMS, WhatsApp, e-mail) written in the same transaction as the change.
create table core.outbox (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic <> ''),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  processed_at timestamptz
);
create index outbox_pending on core.outbox (created_at) where processed_at is null;
select core.protect('core.outbox', 'insert', false);
create policy outbox_insert on core.outbox for insert to fastgo_app with check (true);
grant select, update (attempts, processed_at) on core.outbox to fastgo_worker;
create policy outbox_select_worker on core.outbox for select to fastgo_worker using (true);
create policy outbox_update_worker on core.outbox for update to fastgo_worker using (true) with check (true);

create table core.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references core.orders (id),
  opened_by uuid not null references core.accounts (id),
  -- The cahier gives no list of categories or ticket states yet: any non-empty text.
  category text not null check (category <> ''),
  status text not null default 'open' check (status <> ''),
  closed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index tickets_opened_by on core.tickets (opened_by);
create index tickets_order on core.tickets (order_id);
select core.protect('core.tickets', 'select, insert, update', false);

create policy tickets_select on core.tickets for select to fastgo_app
  using (opened_by = core.app_user_id() or core.staff_reads_customers()
         or (order_id is not null and exists (select 1 from core.orders o where o.id = order_id)));
create policy tickets_insert on core.tickets for insert to fastgo_app
  with check (opened_by = core.app_user_id()
    and (order_id is null or exists (select 1 from core.orders o where o.id = order_id)));
create policy tickets_update on core.tickets for update to fastgo_app
  using (core.staff_handles_tickets())
  with check (core.staff_handles_tickets());

create table core.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references core.tickets (id),
  author_id uuid not null references core.accounts (id),
  body text not null check (body <> ''),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index ticket_messages_ticket on core.ticket_messages (ticket_id, created_at);
select core.protect('core.ticket_messages', 'select, insert', false);

-- T30: an internal note is never visible to the customer.
create policy ticket_messages_select on core.ticket_messages for select to fastgo_app
  using (core.staff_reads_customers()
         or (not is_internal and exists (select 1 from core.tickets t where t.id = ticket_id)));
create policy ticket_messages_insert on core.ticket_messages for insert to fastgo_app
  with check (author_id = core.app_user_id()
    and (core.staff_handles_tickets()
         or (not is_internal and exists (select 1 from core.tickets t where t.id = ticket_id))));
