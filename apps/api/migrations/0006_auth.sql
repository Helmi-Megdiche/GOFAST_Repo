-- Accounts, sign-in and sessions (PR 4a, issue #9).
-- The functions of 0005 are owned by fastgo_public_reader and fastgo_migrator cannot replace them
-- (no inherit, and SET ROLE is banned in migrations), so what 4a needs comes as new functions.

-- Notification choices (R902, contract NotificationPrefs). A person edits their own; the defaults
-- are PROVISIONAL (sms and e-mail on, offers off: offers need an opt-in).
alter table core.accounts
  add column notify_sms boolean not null default true,
  add column notify_email boolean not null default true,
  add column notify_offers boolean not null default false;
-- RV-21: column by column. The three columns carry no secret, so the read-only login may read them.
grant select (notify_sms, notify_email, notify_offers) on core.accounts to fastgo_app, fastgo_readonly;
grant update (notify_sms, notify_email, notify_offers) on core.accounts to fastgo_app;

-- The session cut-off. A password reset moves it (always to a new value). A session keeps the value read
-- together with the password hash at sign-in and is refused when the account holds another one, so an
-- old session dies even when its Redis index has expired or a sign-in raced the reset. No clock decides.
alter table core.accounts add column sessions_valid_from timestamptz not null default 'epoch';
grant select (sessions_valid_from) on core.accounts to fastgo_app, fastgo_readonly;

-- What the definer functions below may change on an account: four columns, nothing else.
grant update (phone_verified_at, password_hash, updated_at, sessions_valid_from) on core.accounts to fastgo_public_reader;
create policy definer_update on core.accounts for update to fastgo_public_reader using (true) with check (true);

-- The phone was proved with a code (R101, R102). Only moves a missing proof forward, never back.
create function core.mark_phone_verified(p_account uuid, p_at timestamptz) returns boolean
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
declare v_count integer;
begin
  update core.accounts
     set phone_verified_at = p_at, updated_at = p_at
   where id = p_account and status = 'active' and phone_verified_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;

-- Password reset: a person (individual or merchant, active) found by the phone that proved a code.
-- Staff and drivers do not reset by SMS. Returns the account id, or null (unknown phone, closed
-- account, other role): the API gives the same answer in every case. Returns no hash.
create function core.set_password(p_phone text, p_hash text, p_at timestamptz) returns uuid
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
declare v_id uuid;
begin
  update core.accounts
     set password_hash = p_hash, updated_at = p_at,
         sessions_valid_from = greatest(p_at, sessions_valid_from + interval '1 millisecond')
   where phone_e164 = p_phone and status = 'active' and role in ('individual', 'merchant')
  returning id into v_id;
  return v_id;
end $$;

-- Rehash at sign-in when the Argon2 settings changed. Compare and swap: a concurrent reset wins.
create function core.rehash_password(p_id uuid, p_old text, p_new text) returns boolean
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
declare v_count integer;
begin
  update core.accounts set password_hash = p_new
   where id = p_id and password_hash = p_old and status = 'active';
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;

-- RV-19: a session carries no role. At each request the API asks what the account is now, so a
-- role change or a closed account applies at once. No hash, no phone, no name.
create function core.session_account(p_id uuid)
  returns table (role text, status text, company_id uuid, valid_from text)
  language sql stable security definer set search_path = pg_catalog, core, pg_temp as $$
  select a.role, a.status,
         (select m.company_id from core.company_members m where m.account_id = a.id
           order by m.created_at, m.company_id limit 1),
         extract(epoch from a.sessions_valid_from)::text
    from core.accounts a where a.id = p_id
$$;

-- Same order as 0005: EXECUTE for the app only, then the owner.
revoke all on function core.mark_phone_verified(uuid, timestamptz) from public;
revoke all on function core.set_password(text, text, timestamptz) from public;
revoke all on function core.rehash_password(uuid, text, text) from public;
revoke all on function core.session_account(uuid) from public;
grant execute on function core.mark_phone_verified(uuid, timestamptz) to fastgo_app;
grant execute on function core.set_password(text, text, timestamptz) to fastgo_app;
grant execute on function core.rehash_password(uuid, text, text) to fastgo_app;
grant execute on function core.session_account(uuid) to fastgo_app;

grant create on schema core to fastgo_public_reader;
alter function core.mark_phone_verified(uuid, timestamptz) owner to fastgo_public_reader;
alter function core.set_password(text, text, timestamptz) owner to fastgo_public_reader;
alter function core.rehash_password(uuid, text, text) owner to fastgo_public_reader;
alter function core.session_account(uuid) owner to fastgo_public_reader;
revoke create on schema core from fastgo_public_reader;

-- The SMS text and phone sit in the outbox payload until the worker has sent the message. Once sent
-- (or finally failed) the worker empties the payload: the table keeps no code and no phone.
grant update (payload) on core.outbox to fastgo_worker;
drop policy outbox_update_worker on core.outbox;
create policy outbox_update_worker on core.outbox for update to fastgo_worker using (true)
  with check (processed_at is null or payload = '{}'::jsonb);

-- Login with the session cut-off in the same read as the hash: the session keeps this value and is
-- refused when the account's value is different, so no clock is involved (an old hash always comes
-- with the old value). 0005's account_for_login stays as it is (the migrator cannot replace it).
create function core.login_account(p_phone text, p_email text)
  returns table (id uuid, role text, password_hash text, locale text, status text, company_id uuid,
                 valid_from text)
  language plpgsql stable security definer set search_path = pg_catalog, core, pg_temp as $$
begin
  if (p_phone is null) = (p_email is null) then
    raise exception 'give exactly one of phone and e-mail' using errcode = 'invalid_parameter_value';
  end if;
  return query
    select a.id, a.role, a.password_hash, a.locale, a.status,
           (select m.company_id from core.company_members m where m.account_id = a.id
             order by m.created_at, m.company_id limit 1),
           extract(epoch from a.sessions_valid_from)::text
      from core.accounts a
     where (p_phone is not null and a.phone_e164 = p_phone)
        or (p_email is not null and lower(a.email) = lower(p_email));
end $$;

-- Is this phone one a reset may be sent to? The same filter as set_password (active individual or
-- merchant). The answer stays inside the API: an unknown phone gets the same 204, no SMS (Q1).
create function core.can_reset_password(p_phone text) returns boolean
  language sql stable security definer set search_path = pg_catalog, core, pg_temp as $$
  select exists (select 1 from core.accounts
                  where phone_e164 = p_phone and status = 'active' and role in ('individual', 'merchant'))
$$;

revoke all on function core.login_account(text, text) from public;
revoke all on function core.can_reset_password(text) from public;
grant execute on function core.login_account(text, text) to fastgo_app;
grant execute on function core.can_reset_password(text) to fastgo_app;
grant create on schema core to fastgo_public_reader;
alter function core.login_account(text, text) owner to fastgo_public_reader;
alter function core.can_reset_password(text) owner to fastgo_public_reader;
revoke create on schema core from fastgo_public_reader;
