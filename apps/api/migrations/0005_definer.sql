-- SECURITY DEFINER functions for the few things that must work without an identity (public tracking,
-- the recipient link, login, sign-up). Each is owned by fastgo_public_reader (NOLOGIN), whose rights
-- are the narrowest that make it work, and runs with a fixed search_path. EXECUTE is for fastgo_app only.
-- Changing the owner needs fastgo_migrator to be a member of fastgo_public_reader: the server setup
-- (infra/servers) does `grant fastgo_public_reader to fastgo_migrator`.

do $$
begin
  if not pg_has_role(current_user, 'fastgo_public_reader', 'member') then
    raise exception 'fastgo_migrator must be a member of fastgo_public_reader: run the server setup (infra/servers) first';
  end if;
end $$;

-- What the owner may read. R405: the public page shows the state, dates and zone names only, so
-- orders, addresses, recipients and history are opened column by column and without any personal field.
grant select (id, tracking_number, status, created_at, updated_at, pickup_address_id, recipient_id)
  on core.orders to fastgo_public_reader;
grant select (id, zone_id) on core.addresses to fastgo_public_reader;
grant select (id, address_id) on core.recipients to fastgo_public_reader;
grant select (id, name) on core.zones to fastgo_public_reader;
grant select (order_id, subject_type, to_status, occurred_at) on core.status_events to fastgo_public_reader;
grant select on core.recipient_links, core.accounts, core.company_members to fastgo_public_reader;
-- Sign-up writes the three identity tables, nothing else.
grant insert on core.accounts, core.companies, core.company_members to fastgo_public_reader;

-- The tables force RLS, so the owner needs policies too. They read every row: the functions below
-- filter, and no login can call them but through fastgo_app.
create policy definer_select on core.orders for select to fastgo_public_reader using (true);
create policy definer_select on core.addresses for select to fastgo_public_reader using (true);
create policy definer_select on core.recipients for select to fastgo_public_reader using (true);
create policy definer_select on core.status_events for select to fastgo_public_reader using (true);
create policy definer_select on core.recipient_links for select to fastgo_public_reader using (true);
create policy definer_select on core.accounts for select to fastgo_public_reader using (true);
create policy definer_select on core.company_members for select to fastgo_public_reader using (true);
create policy definer_insert on core.accounts for insert to fastgo_public_reader with check (true);
create policy definer_insert on core.companies for insert to fastgo_public_reader with check (true);
create policy definer_insert on core.company_members for insert to fastgo_public_reader with check (true);

-- R405: public tracking. State, dates and zone names; no name, phone, street, amount or position.
create function core.tracking(p_number text) returns jsonb
  language sql stable security definer set search_path = pg_catalog, core as $$
  select jsonb_build_object(
           'status', o.status,
           'createdAt', o.created_at,
           'updatedAt', o.updated_at,
           'pickupZone', pz.name,
           'deliveryZone', dz.name,
           'history', coalesce((select jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.occurred_at)
                                                 order by e.occurred_at)
                                  from core.status_events e
                                 where e.order_id = o.id and e.subject_type = 'order'), '[]'::jsonb))
    from core.orders o
    left join core.addresses pa on pa.id = o.pickup_address_id
    left join core.zones pz on pz.id = pa.zone_id
    left join core.recipients r on r.id = o.recipient_id
    left join core.addresses da on da.id = r.address_id
    left join core.zones dz on dz.id = da.zone_id
   where o.tracking_number = p_number
$$;

-- R406: the recipient link. The caller passes the hash of the token; an expired link returns nothing.
create function core.recipient_link(p_token_hash text)
  returns table (tracking_number text, locale text, expires_at timestamptz)
  language sql stable security definer set search_path = pg_catalog, core as $$
  select o.tracking_number, l.locale, l.expires_at
    from core.recipient_links l
    join core.orders o on o.id = l.order_id
   where l.token_hash = p_token_hash and l.expires_at > now()
$$;

-- Login: the app never reads the hash, this function hands it to the API, which compares it.
create function core.account_for_login(p_phone text, p_email text)
  returns table (id uuid, role text, password_hash text, locale text, status text, company_id uuid)
  language sql stable security definer set search_path = pg_catalog, core as $$
  select a.id, a.role, a.password_hash, a.locale, a.status,
         (select m.company_id from core.company_members m where m.account_id = a.id
           order by m.created_at limit 1)
    from core.accounts a
   where (p_phone is not null and a.phone_e164 = p_phone)
      or (p_email is not null and lower(a.email) = lower(p_email))
   limit 1
$$;

-- Sign-up (R101): an individual, or a merchant with the company it is the first member of.
-- No other role can be created here; staff and drivers are created by staff. A duplicate phone or
-- e-mail raises unique_violation for the API to turn into an error.
create function core.create_account(p_role text, p_full_name text, p_phone text, p_email text,
                                    p_password_hash text, p_locale text default 'fr',
                                    p_company_name text default null)
  returns table (new_account_id uuid, new_company_id uuid)
  language plpgsql security definer set search_path = pg_catalog, core as $$
declare
  v_account uuid := gen_random_uuid();
  v_company uuid;
begin
  if p_role not in ('individual', 'merchant') then
    raise exception 'role % cannot sign up', p_role using errcode = 'insufficient_privilege';
  end if;
  if (p_role = 'merchant') <> (p_company_name is not null) then
    raise exception 'a merchant needs a company name and an individual has none' using errcode = 'check_violation';
  end if;
  insert into core.accounts (id, kind, role, full_name, phone_e164, email, password_hash, locale)
    values (v_account, case when p_role = 'merchant' then 'merchant' else 'customer' end, p_role,
            p_full_name, p_phone, p_email, p_password_hash, p_locale);
  if p_company_name is not null then
    v_company := gen_random_uuid();
    insert into core.companies (id, legal_name) values (v_company, p_company_name);
    insert into core.company_members (company_id, account_id, role) values (v_company, v_account, 'owner');
  end if;
  return query select v_account, v_company;
end $$;

-- Ownership: a function created by the migrator would run with the migrator's rights.
grant create on schema core to fastgo_public_reader;
alter function core.tracking(text) owner to fastgo_public_reader;
alter function core.recipient_link(text) owner to fastgo_public_reader;
alter function core.account_for_login(text, text) owner to fastgo_public_reader;
alter function core.create_account(text, text, text, text, text, text, text) owner to fastgo_public_reader;
revoke create on schema core from fastgo_public_reader;

revoke all on function core.tracking(text) from public;
revoke all on function core.recipient_link(text) from public;
revoke all on function core.account_for_login(text, text) from public;
revoke all on function core.create_account(text, text, text, text, text, text, text) from public;
grant execute on function core.tracking(text) to fastgo_app;
grant execute on function core.recipient_link(text) to fastgo_app;
grant execute on function core.account_for_login(text, text) to fastgo_app;
grant execute on function core.create_account(text, text, text, text, text, text, text) to fastgo_app;
