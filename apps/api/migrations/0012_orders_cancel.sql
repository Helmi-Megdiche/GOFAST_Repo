-- GH-22 (PR 4b-2b): cancel (R212), confirm and auto-confirm (R209). What the order keeps when it is canceled, the two settings,
-- and the definer functions that are now the only way to change the status of an order.
-- The rules are not in SQL: R212 (which fee) and R209 (whether to confirm) are decided by packages/domain, in the API, under
-- the lock taken by core.lock_order. The functions below check WHO may ask, compare-and-set the expected status, and write.
-- Only the API login calls them (the same trust as every definer of 0005, 0006 and 0011).

-- ---- what a canceled order keeps ------------------------------------------------------------------------------------

alter table core.orders
  add column canceled_at timestamptz,
  add column cancel_fee text check (cancel_fee in ('none', 'applies', 'backOfficeDecides')),
  add column cancel_fee_millimes bigint check (cancel_fee_millimes >= 0),
  add column canceled_by uuid references core.accounts (id),
  -- A date and a fee go together; the amount is set exactly when the fee applies (R212, R601 reads the stored amount). `is not distinct
  -- from` because with no fee `null = 'applies'` is null, and a CHECK lets null through.
  add constraint orders_cancel_fee check ((canceled_at is null) = (cancel_fee is null)
    and (cancel_fee is not distinct from 'applies') = (cancel_fee_millimes is not null)),
  -- An order made by the API says when it was canceled (a row made before 0011 has no quote and is not held to it).
  add constraint orders_canceled_at check (quote_id is null or (status = 'canceled') = (canceled_at is not null));
grant select (canceled_at, cancel_fee, cancel_fee_millimes, canceled_by) on core.orders to fastgo_readonly;

-- D7 and D8 (reponses-gofast.md): 5 DT after the driver arrived, automatic confirmation up to 100 DT. PROVISIONAL, admin-editable.
alter table core.pricing_settings
  add column cancel_fee_millimes bigint not null default 5000 check (cancel_fee_millimes >= 0),
  add column auto_confirm_max_millimes bigint not null default 100000 check (auto_confirm_max_millimes >= 0);

-- ---- RV-21: the app login no longer writes a status ---------------------------------------------------------------
-- 0004 let staff UPDATE `status` (no lock, so a staff write could overwrite a cancel). Every state change now goes through a
-- definer; #26 adds its own for assignment and the rest. The two keys an agent may correct stay.
revoke update on core.orders from fastgo_app;
grant update (pickup_address_id, recipient_id) on core.orders to fastgo_app;
-- The same for the parcels and the missions (RV-01: staff could move a parcel of a canceled order back to `to_collect`, and those
-- paths lock the child, then the order, the other way round from lock_order, so they could deadlock with it). No code of the API
-- writes them; #26 (assignment, scans) adds definers that do, and they lock the order first.
revoke update (status) on core.parcels from fastgo_app;
revoke update on core.missions from fastgo_app; -- refused (42501), not 0 rows; the policy goes too, so a later grant alone lets nothing through
drop policy missions_update on core.missions;

-- ---- the API clock in the triggers (R406) ---------------------------------------------------------------------------
-- The definers pass `p_at` with set_config('app.at', ..., true); only the order writer is believed, so no other login can
-- backdate `updated_at` or `ended_at`. Without the setting nothing changes: now().
create or replace function core.orders_touch() returns trigger
  language plpgsql set search_path = pg_catalog as $$
declare
  v_end constant text[] := array['delivered', 'partially_delivered', 'returned', 'lost', 'canceled'];
  v_at timestamptz;
begin
  if current_user = 'fastgo_order_writer' then
    v_at := nullif(current_setting('app.at', true), '')::timestamptz;
  end if;
  v_at := coalesce(v_at, now());
  new.updated_at := v_at;
  if new.status is distinct from old.status then
    new.ended_at := case when new.status = any (v_end) then v_at else null end;
  end if;
  return new;
end $$;

create or replace function core.touch_updated_at() returns trigger
  language plpgsql set search_path = pg_catalog as $$
declare v_at timestamptz;
begin
  if current_user = 'fastgo_order_writer' then
    v_at := nullif(current_setting('app.at', true), '')::timestamptz;
  end if;
  new.updated_at := coalesce(v_at, now());
  return new;
end $$;

-- ---- what the order writer may do now ------------------------------------------------------------------------------

grant select (total_millimes, address_unconfirmed, lines, canceled_at, cancel_fee, cancel_fee_millimes) on core.orders to fastgo_order_writer;
grant update (status, canceled_at, cancel_fee, cancel_fee_millimes, canceled_by) on core.orders to fastgo_order_writer;
grant update (status) on core.parcels to fastgo_order_writer;
grant select (occurred_at) on core.status_events to fastgo_order_writer; -- history_time: the last event of the order
grant select (id, order_id, kind, status, end_reason, arrived_at, offered_at, created_at) on core.missions to fastgo_order_writer;
grant update (status, end_reason, finished_at) on core.missions to fastgo_order_writer;
grant select (role) on core.accounts to fastgo_order_writer;
create policy order_writer_update on core.orders for update to fastgo_order_writer using (true) with check (true);
create policy order_writer_update on core.parcels for update to fastgo_order_writer using (true) with check (true);
create policy order_writer_select on core.missions for select to fastgo_order_writer using (true);
create policy order_writer_update on core.missions for update to fastgo_order_writer using (true) with check (true);

-- ---- the definers ---------------------------------------------------------------------------------------------------

-- The time of a change to an order: the API's clock, but never before the last event already written for it. The API reads its clock
-- after taking the lock; this is the second net, for two API processes whose clocks differ a little. The history then reads in the
-- order the operations committed (`seq` breaks a tie).
create function core.history_time(p_order uuid, p_at timestamptz) returns timestamptz
  language sql stable set search_path = pg_catalog, core, pg_temp as $$
  select greatest(p_at, coalesce((select max(e.occurred_at) from core.status_events e where e.order_id = p_order), p_at))
$$;

-- Who is asking, from the STORED account (RV-19, RV-20), never from a claim: the person must be an active account, and either
-- own the order (or sit in its company) or hold a staff role of the mode. Another account's order is "not found".
--   cancel: the owner, or agent, operations, logistics, admin.   confirm: agent, operations, admin.   creator: who made it.
create function core.assert_order_actor(p_order uuid, p_mode text) returns void
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
declare
  v_actor uuid := core.app_user_id();
  v_role text;
begin
  if v_actor is null then raise exception 'forbidden' using errcode = 'insufficient_privilege'; end if;
  select a.role into v_role from core.accounts a where a.id = v_actor and a.status = 'active';
  if not found then raise exception 'forbidden: no active account' using errcode = 'insufficient_privilege'; end if;
  perform 1 from core.orders o
   where o.id = p_order
     and case p_mode
           when 'cancel' then o.owner_account_id = v_actor or o.owner_company_id = core.app_company_id()
                              or v_role in ('agent', 'operations', 'logistics', 'admin')
           when 'confirm' then v_role in ('agent', 'operations', 'admin')
           when 'creator' then o.created_by = v_actor and (o.owner_account_id = v_actor or o.owner_company_id = core.app_company_id())
           else false end;
  if not found then raise exception 'order not found' using errcode = 'no_data_found'; end if;
end $$;

-- Locks the order (FOR NO KEY UPDATE: a parcel or a mission added meanwhile does not wait for it), then its pickup missions (always in this order), and says what the API needs to decide: the state, the total,
-- the lines, whether an address is unconfirmed, when the driver arrived (the latest pickup mission that is not refused, expired
-- or ended early), and the cancel already stored. It decides nothing. The locks last until the end of the transaction.
create function core.lock_order(p_order uuid, p_mode text default 'cancel') returns jsonb
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
declare
  v_order record;
  v_arrived timestamptz;
begin
  perform core.assert_order_actor(p_order, p_mode);
  select o.status, o.total_millimes, o.address_unconfirmed, o.lines, o.cancel_fee, o.cancel_fee_millimes, o.canceled_at
    into v_order from core.orders o where o.id = p_order for no key update;
  perform 1 from core.missions m where m.order_id = p_order and m.kind = 'pickup' for no key update;
  select m.arrived_at into v_arrived from core.missions m
   where m.order_id = p_order and m.kind = 'pickup' and m.status not in ('refused', 'expired') and m.end_reason is null
   order by m.offered_at desc, m.created_at desc limit 1;
  return jsonb_build_object(
    'status', v_order.status, 'total_millimes', v_order.total_millimes, 'address_unconfirmed', v_order.address_unconfirmed,
    'lines', coalesce(v_order.lines, '[]'::jsonb), 'pickup_arrived_at', v_arrived,
    'cancel_fee', v_order.cancel_fee, 'cancel_fee_millimes', v_order.cancel_fee_millimes, 'canceled_at', v_order.canceled_at);
end $$;

-- Cancels: compare-and-set on the status the API saw under the lock. The fee is the one the API computed from the domain rule;
-- here it is only checked to be one of the three, with an amount exactly when it applies (the amount is the setting, read once by the API). In one go: the order,
-- its to_collect parcels (canceled), its active pickup mission (finished, orderCanceled), and an event for each with the actor.
create function core.cancel_order(p_order uuid, p_status text, p_fee text, p_fee_millimes bigint, p_at timestamptz) returns void
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
declare
  v_actor uuid := core.app_user_id();
  v_status text;
  v_at timestamptz;
begin
  perform core.assert_order_actor(p_order, 'cancel');
  select o.status into v_status from core.orders o where o.id = p_order for no key update;
  v_at := core.history_time(p_order, p_at);
  perform 1 from core.missions m where m.order_id = p_order and m.kind = 'pickup' for no key update;
  if v_status is distinct from p_status then
    raise exception 'order state conflict: expected %, found %', p_status, v_status using errcode = 'serialization_failure';
  end if;
  -- A final state is never canceled (again): without this a second cancel with p_status = 'canceled' would pass the compare-and-set
  -- and overwrite canceled_at, the fee and canceled_by. The states are those of packages/domain FINAL_ORDER_STATES; which states
  -- may be canceled is still the domain rule (R212), the API decides it; this is only the net.
  if v_status in ('delivered', 'partially_delivered', 'returned', 'lost', 'canceled') then
    raise exception 'order in a final state cannot be canceled: %', v_status using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p_fee is null or p_fee not in ('none', 'applies', 'backOfficeDecides') then
    raise exception 'invalid cancel fee' using errcode = 'invalid_parameter_value';
  end if;
  -- The amount is the setting as the API read it ONCE, under the lock (core.pricing_settings is not read again here: a setting edited
  -- in between would raise a 22023 and a 500). The CHECK of the table keeps it non-negative.
  if (p_fee = 'applies') is distinct from (p_fee_millimes is not null) then
    raise exception 'invalid cancel fee amount' using errcode = 'invalid_parameter_value';
  end if;

  perform set_config('app.at', v_at::text, true);
  update core.orders set status = 'canceled', canceled_at = v_at, cancel_fee = p_fee,
         cancel_fee_millimes = case when p_fee = 'applies' then p_fee_millimes end, canceled_by = v_actor
   where id = p_order;
  insert into core.status_events (order_id, subject_type, subject_id, from_status, to_status, actor_id, occurred_at)
    values (p_order, 'order', p_order, p_status, 'canceled', v_actor, v_at);
  with u as (update core.parcels set status = 'canceled' where order_id = p_order and status = 'to_collect' returning id)
  insert into core.status_events (order_id, subject_type, subject_id, from_status, to_status, actor_id, occurred_at)
    select p_order, 'parcel', u.id, 'to_collect', 'canceled', v_actor, v_at from u;
  with old as (select m.id, m.status from core.missions m
                where m.order_id = p_order and m.kind = 'pickup' and m.status in ('proposed', 'accepted', 'arrived') and m.end_reason is null),
       u as (update core.missions m set status = 'finished', end_reason = 'orderCanceled', finished_at = v_at
              from old where m.id = old.id returning m.id)
  insert into core.status_events (order_id, subject_type, subject_id, from_status, to_status, actor_id, occurred_at)
    select p_order, 'mission', old.id, old.status, 'finished', v_actor, v_at from old join u on u.id = old.id;
end $$;

-- An agent confirms (R209: the others). Compare-and-set `received` to `confirmed`, with the event and the actor.
create function core.confirm_order(p_order uuid, p_at timestamptz) returns void
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
declare
  v_status text;
  v_at timestamptz;
begin
  perform core.assert_order_actor(p_order, 'confirm');
  select o.status into v_status from core.orders o where o.id = p_order for no key update;
  if v_status is distinct from 'received' then
    raise exception 'order state conflict: %', v_status using errcode = 'serialization_failure';
  end if;
  v_at := core.history_time(p_order, p_at);
  perform set_config('app.at', v_at::text, true);
  update core.orders set status = 'confirmed' where id = p_order;
  insert into core.status_events (order_id, subject_type, subject_id, from_status, to_status, actor_id, occurred_at)
    values (p_order, 'order', p_order, 'received', 'confirmed', core.app_user_id(), v_at);
end $$;

-- The system confirms (R209): the API has decided with canAutoConfirm (domain) under the lock; here only the compare-and-set and the
-- event, with no actor (the system). Its time is never before the `received` event, which is at created_at (`seq` breaks a tie).
create function core.auto_confirm_order(p_order uuid, p_at timestamptz) returns void
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
declare
  v_status text;
  v_created timestamptz;
  v_at timestamptz;
begin
  perform core.assert_order_actor(p_order, 'creator');
  select o.status, o.created_at into v_status, v_created from core.orders o where o.id = p_order for no key update;
  if v_status is distinct from 'received' then
    raise exception 'order state conflict: %', v_status using errcode = 'serialization_failure';
  end if;
  v_at := core.history_time(p_order, greatest(p_at, v_created));
  perform set_config('app.at', v_at::text, true);
  update core.orders set status = 'confirmed' where id = p_order;
  insert into core.status_events (order_id, subject_type, subject_id, from_status, to_status, actor_id, occurred_at)
    values (p_order, 'order', p_order, 'received', 'confirmed', null, v_at);
end $$;

-- Execute rights first, while the migrator still owns the functions; then the ownership (as in 0005 and 0011).
revoke execute on function core.history_time(uuid, timestamptz) from public;
revoke execute on function core.assert_order_actor(uuid, text) from public;
revoke execute on function core.lock_order(uuid, text) from public;
revoke execute on function core.cancel_order(uuid, text, text, bigint, timestamptz) from public;
revoke execute on function core.confirm_order(uuid, timestamptz) from public;
revoke execute on function core.auto_confirm_order(uuid, timestamptz) from public;
grant execute on function core.lock_order(uuid, text) to fastgo_app;
grant execute on function core.cancel_order(uuid, text, text, bigint, timestamptz) to fastgo_app;
grant execute on function core.confirm_order(uuid, timestamptz) to fastgo_app;
grant execute on function core.auto_confirm_order(uuid, timestamptz) to fastgo_app;
grant create on schema core to fastgo_order_writer;
alter function core.history_time(uuid, timestamptz) owner to fastgo_order_writer;
alter function core.assert_order_actor(uuid, text) owner to fastgo_order_writer;
alter function core.lock_order(uuid, text) owner to fastgo_order_writer;
alter function core.cancel_order(uuid, text, text, bigint, timestamptz) owner to fastgo_order_writer;
alter function core.confirm_order(uuid, timestamptz) owner to fastgo_order_writer;
alter function core.auto_confirm_order(uuid, timestamptz) owner to fastgo_order_writer;
revoke create on schema core from fastgo_order_writer;
