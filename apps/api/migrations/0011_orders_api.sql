-- GH-22 (PR 4b-2a): what the order API needs on top of 0004: the order carries its quote (lines, zones,
-- grid date), the pickup contact and slots, and the fields of the form; the history gets a sequence; the
-- creation history and the tracking SMS are written by definer functions; public tracking follows the contract.
-- No cancel column and no cancel function here: they come with 4b-2b.
-- A row made before this migration has no quote: every new column is nullable, and the CHECKs below only bind a row
-- that has a quote_id (the one the API writes). Every order the API creates has all of them.

do $$
begin
  if not pg_has_role(current_user, 'fastgo_order_writer', 'SET') then
    raise exception 'fastgo_migrator must be allowed to switch to the role fastgo_order_writer: run the server setup (infra/servers) first';
  end if;
end $$;

-- ---- the order columns --------------------------------------------------------------------------------

-- Sum of the amounts of a lines array. A line with no amount (vat and stamp until GOFAST confirms them) counts for 0.
create function core.lines_total(p_lines jsonb) returns bigint
  language sql immutable parallel safe set search_path = pg_catalog as $$
  select coalesce(sum((l ->> 'millimes')::bigint), 0)::bigint from jsonb_array_elements(p_lines) as l
$$;
-- The kinds of the lines that have no amount, in the order of the array.
create function core.null_line_kinds(p_lines jsonb) returns text[]
  language sql immutable parallel safe set search_path = pg_catalog as $$
  select coalesce(array_agg(l ->> 'kind' order by ord), '{}'::text[])
    from jsonb_array_elements(p_lines) with ordinality as t(l, ord) where (l ->> 'millimes') is null
$$;

alter table core.orders
  -- A plain uuid, no foreign key: the quote is purged after its expiry, the order keeps its own copy.
  add column quote_id uuid,
  add column lines jsonb check (jsonb_typeof(lines) = 'array'),
  add column null_lines text[],
  add column price_list_valid_from timestamptz,
  add column departure_zone_id uuid references core.zones (id),
  add column arrival_zone_id uuid references core.zones (id),
  -- True when an address of the quote had no pin: the order waits for an agent and is never confirmed automatically.
  add column address_unconfirmed boolean not null default false,
  add column sender_name text check (sender_name <> ''),
  add column sender_phone text check (sender_phone ~ '^\+216[0-9]{8}$'),
  add column pickup_slot_start timestamptz,
  add column pickup_slot_end timestamptz,
  add column delivery_slot_start timestamptz,
  add column delivery_slot_end timestamptz,
  add column delivery_instructions text not null default '',
  add column content text check (content <> ''),
  add column fragile boolean not null default false,
  add column packaging boolean not null default false,
  add column declared_value_millimes bigint check (declared_value_millimes >= 0),
  add column freight_payer_accepted boolean not null default false,
  add column terms_accepted_at timestamptz,
  -- R202: a keyed MAC of the request body, set with idempotency_scope. The scope of an order outlives its key until the worker
  -- purges it, so the same key with another body must be told apart from a replay. Not personal data, never shown or listed.
  add column idempotency_body_hash text;

alter table core.orders
  add constraint orders_api_complete check (quote_id is null or (
    lines is not null and null_lines is not null and price_list_valid_from is not null
    and departure_zone_id is not null and arrival_zone_id is not null and sender_name is not null
    and sender_phone is not null and pickup_slot_start is not null and pickup_slot_end is not null
    and content is not null and terms_accepted_at is not null)),
  -- R204: the total is the sum of the lines, the discount line included (it is negative); a null line adds nothing.
  add constraint orders_total_is_lines check (lines is null or total_millimes = core.lines_total(lines)),
  -- Q11: the order records which lines had no amount.
  add constraint orders_null_lines check (lines is null or null_lines = core.null_line_kinds(lines)),
  add constraint orders_pickup_slot check (quote_id is null or pickup_slot_end > pickup_slot_start),
  add constraint orders_delivery_slot check (quote_id is null or (
    (service = 'scheduled') = (delivery_slot_start is not null)
    and (delivery_slot_start is null) = (delivery_slot_end is null)
    and (delivery_slot_start is null or delivery_slot_end > delivery_slot_start))),
  -- R607: the sender accepted the freight-due terms when the recipient pays on delivery.
  add constraint orders_freight_accepted check (quote_id is null or payment_mode <> 'cashDelivery' or freight_payer_accepted);

-- The app writes these at creation, never after (no UPDATE grant: 0004 keeps `status` and the two keys for staff).
grant insert (quote_id, lines, null_lines, price_list_valid_from, departure_zone_id, arrival_zone_id,
              address_unconfirmed, sender_name, sender_phone, pickup_slot_start, pickup_slot_end,
              delivery_slot_start, delivery_slot_end, delivery_instructions, content, fragile, packaging,
              declared_value_millimes, freight_payer_accepted, terms_accepted_at, idempotency_body_hash)
  on core.orders to fastgo_app;
-- fastgo_readonly reads the same columns as before plus these: like recipients (name, phone), an order of a
-- person is readable for reports (the rule of 0004's core.protect: every column but a hash).
grant select (quote_id, lines, null_lines, price_list_valid_from, departure_zone_id, arrival_zone_id,
              address_unconfirmed, sender_name, sender_phone, pickup_slot_start, pickup_slot_end,
              delivery_slot_start, delivery_slot_end, delivery_instructions, content, fragile, packaging,
              declared_value_millimes, freight_payer_accepted, terms_accepted_at)
  on core.orders to fastgo_readonly;
-- The barcode and the position (1 to n, the order of the parcels in the request) are set with the parcel
-- (barcode format: PROVISIONAL, the API builds it). An old row has no position.
alter table core.parcels add column position integer check (position >= 1), add unique (order_id, position);
grant insert (barcode, position) on core.parcels to fastgo_app;
grant select (position) on core.parcels to fastgo_readonly;

-- ---- the history: a sequence for events that share an instant ------------------------------------------

alter table core.status_events add column seq bigint generated always as identity;
create index status_events_order_seq on core.status_events (order_id, occurred_at, seq);
grant select (seq) on core.status_events to fastgo_app;

-- ---- fastgo_order_writer: owner of the definer functions that write the history and read for the SMS ------

grant usage on schema core to fastgo_order_writer;
grant select (id, owner_account_id, owner_company_id, created_by, status, created_at, recipient_id, tracking_number, recipient_locale)
  on core.orders to fastgo_order_writer;
grant select (id, order_id, status) on core.parcels to fastgo_order_writer;
grant select (id, status) on core.accounts to fastgo_order_writer;
grant select (id, phone_e164) on core.recipients to fastgo_order_writer;
grant select (id, order_id, subject_type) on core.status_events to fastgo_order_writer;
grant insert (order_id, subject_type, subject_id, from_status, to_status, actor_id, occurred_at)
  on core.status_events to fastgo_order_writer;
create policy order_writer_select on core.orders for select to fastgo_order_writer using (true);
create policy order_writer_select on core.parcels for select to fastgo_order_writer using (true);
create policy order_writer_select on core.accounts for select to fastgo_order_writer using (true);
create policy order_writer_select on core.recipients for select to fastgo_order_writer using (true);
create policy order_writer_select on core.status_events for select to fastgo_order_writer using (true);
create policy order_writer_insert on core.status_events for insert to fastgo_order_writer with check (true);

-- The history of a new order: one event for the order, one per parcel, all at the instant the order was created
-- (one clock). The caller is the person who created it (RV-19: read from the stored order and account, not from a
-- claim); anyone else gets "not found", and an order that already has a history is refused (no second history).
create function core.record_order_created(p_order uuid) returns void
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
declare
  v_status text;
  v_at timestamptz;
  v_actor uuid := core.app_user_id();
begin
  select o.status, o.created_at into v_status, v_at from core.orders o
   where o.id = p_order and o.created_by = v_actor and v_actor is not null
     and (o.owner_account_id = v_actor or o.owner_company_id = core.app_company_id())
     and exists (select 1 from core.accounts a where a.id = v_actor and a.status = 'active');
  if not found then raise exception 'order not found' using errcode = 'no_data_found'; end if;
  if exists (select 1 from core.status_events e where e.order_id = p_order) then
    raise exception 'order already has a history' using errcode = 'unique_violation';
  end if;
  insert into core.status_events (order_id, subject_type, subject_id, from_status, to_status, actor_id, occurred_at)
    values (p_order, 'order', p_order, null, v_status, v_actor, v_at);
  insert into core.status_events (order_id, subject_type, subject_id, from_status, to_status, actor_id, occurred_at)
    select p_order, 'parcel', p.id, null, p.status, v_actor, v_at
      from core.parcels p where p.order_id = p_order order by p.id;
end $$;

-- R903, R105: the SMS of the outbox holds a template key and the order id, never a phone or a text. The worker
-- asks for them when it sends. Nothing when the order's account is closed (R105).
create function core.sms_tracking_payload(p_order uuid) returns jsonb
  language sql stable security definer set search_path = pg_catalog, core, pg_temp as $$
  select jsonb_build_object('phone', r.phone_e164, 'tracking_number', o.tracking_number, 'locale', o.recipient_locale)
    from core.orders o join core.recipients r on r.id = o.recipient_id
   where o.id = p_order
     and not exists (select 1 from core.accounts a where a.id = o.owner_account_id and a.status = 'closed')
$$;

-- Execute rights first, while the migrator still owns the functions; then the ownership (as in 0005): a function
-- created by the migrator would run with the migrator's rights.
revoke execute on function core.record_order_created(uuid) from public;
revoke execute on function core.sms_tracking_payload(uuid) from public;
grant execute on function core.record_order_created(uuid) to fastgo_app;
grant execute on function core.sms_tracking_payload(uuid) to fastgo_worker;
grant create on schema core to fastgo_order_writer;
alter function core.record_order_created(uuid) owner to fastgo_order_writer;
alter function core.sms_tracking_payload(uuid) owner to fastgo_order_writer;
revoke create on schema core from fastgo_order_writer;

-- ---- R405 public tracking, with the contract's keys -------------------------------------------------------

grant select (departure_zone_id, arrival_zone_id) on core.orders to fastgo_public_reader;
grant select (name_ar, name_en) on core.zones to fastgo_public_reader;
grant select (id, order_id, position, status) on core.parcels to fastgo_public_reader;
grant select (seq) on core.status_events to fastgo_public_reader;
create policy definer_select on core.parcels for select to fastgo_public_reader using (true);

drop function core.tracking(text);
-- No name, phone, street, amount, driver or position. The city names follow the language (fr when unknown).
create function core.tracking(p_number text, p_locale text) returns jsonb
  language sql stable security definer set search_path = pg_catalog, core, pg_temp as $$
  select jsonb_build_object(
           'status', o.status,
           'eta_at', null,
           'history', coalesce((select jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.occurred_at)
                                                 order by e.occurred_at, e.seq)
                                  from core.status_events e
                                 where e.order_id = o.id and e.subject_type = 'order'), '[]'::jsonb),
           'from_city', case p_locale when 'ar' then pz.name_ar when 'en' then pz.name_en else pz.name end,
           'to_city', case p_locale when 'ar' then dz.name_ar when 'en' then dz.name_en else dz.name end,
           'parcel_count', (select count(*) from core.parcels p where p.order_id = o.id and p.status <> 'canceled'),
           'parcel_outcomes', coalesce((select jsonb_agg(p.status order by p.position, p.id) from core.parcels p
                                         where p.order_id = o.id and p.status <> 'canceled'), '[]'::jsonb))
    from core.orders o
    left join core.addresses pa on pa.id = o.pickup_address_id
    left join core.recipients r on r.id = o.recipient_id
    left join core.addresses da on da.id = r.address_id
    left join core.zones pz on pz.id = coalesce(o.departure_zone_id, pa.zone_id)
    left join core.zones dz on dz.id = coalesce(o.arrival_zone_id, da.zone_id)
   where o.tracking_number = p_number
$$;
revoke execute on function core.tracking(text, text) from public;
grant execute on function core.tracking(text, text) to fastgo_app;
grant create on schema core to fastgo_public_reader;
alter function core.tracking(text, text) owner to fastgo_public_reader;
revoke create on schema core from fastgo_public_reader;

-- ---- the quote purge waits 24 h after the expiry (PROVISIONAL, supervisor), so a submit that crosses the
-- expiry answers 410 and not 404 ----------------------------------------------------------------------------

drop policy quotes_purge_worker on core.quotes;
create policy quotes_purge_worker on core.quotes for delete to fastgo_worker
  using (expires_at < now() - interval '24 hours');
