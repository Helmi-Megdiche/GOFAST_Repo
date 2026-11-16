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

-- No session created before this instant is valid. A password reset moves it forward, so an old
-- session dies even when its Redis index has expired or a sign-in raced the reset. The default is the
-- epoch, not now(): a session is dated by the API clock, and only a reset (also dated by the API
-- clock) moves this forward, so the database clock never decides whether a session is valid.
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
     set password_hash = p_hash, updated_at = p_at, sessions_valid_from = p_at
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
  returns table (role text, status text, company_id uuid, sessions_valid_from timestamptz)
  language sql stable security definer set search_path = pg_catalog, core, pg_temp as $$
  select a.role, a.status,
         (select m.company_id from core.company_members m where m.account_id = a.id
           order by m.created_at, m.company_id limit 1),
         a.sessions_valid_from
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
