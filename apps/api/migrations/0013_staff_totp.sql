-- GH-25 (PR 25a), T60 and cahier p.54: the internal teams sign in with a second factor (TOTP, an authenticator app).
-- core.staff_totp holds the secret of each enrolled staff account, ENCRYPTED by the API with TOTP_KEY (AES-256-GCM, bound to the
-- account id): the database never sees a usable secret. The app login has no right on the table: it asks two definer functions,
-- and the operator (enrolment, emergency reset) uses two others with the migrator login only. Independent of every other migration.

do $$
begin
  if not pg_has_role(current_user, 'fastgo_staff_auth', 'SET') then
    raise exception 'fastgo_migrator must be allowed to switch to the role fastgo_staff_auth: run the server setup (infra/servers) first';
  end if;
end $$;

create table core.staff_totp (
  account_id uuid primary key references core.accounts (id),
  -- nonce (12) + tag (16) + ciphertext: never a plain secret.
  secret_enc bytea not null check (octet_length(secret_enc) > 28),
  enrolled_at timestamptz not null default now(),
  -- The last 30-second step used: a code is usable once (compare-and-set below).
  last_step bigint not null default 0 check (last_step >= 0)
);
-- Row level security on and forced, and NO right for the app, the worker, the read-only login or PUBLIC (RV-19, RV-21).
alter table core.staff_totp enable row level security;
alter table core.staff_totp force row level security;
revoke all on core.staff_totp from public;

-- ---- what the owner of the definers may do -------------------------------------------------------------------------

grant usage on schema core, gestion to fastgo_staff_auth;
grant select, insert, delete on core.staff_totp to fastgo_staff_auth;
grant update (last_step) on core.staff_totp to fastgo_staff_auth;
grant select (id, role, status) on core.accounts to fastgo_staff_auth;
grant insert on gestion.audit_events to fastgo_staff_auth;
create policy staff_auth_all on core.staff_totp for all to fastgo_staff_auth using (true) with check (true);
create policy staff_auth_select on core.accounts for select to fastgo_staff_auth using (true);
create policy staff_auth_insert on gestion.audit_events for insert to fastgo_staff_auth with check (true);

-- ---- called by the API (the app login) --------------------------------------------------------------------------------

-- The encrypted secret of an ACTIVE back-office account (a driver, a customer and a merchant never have one here), or null.
create function core.staff_totp_secret(p_account uuid) returns bytea
  language sql stable security definer set search_path = pg_catalog, core, pg_temp as $$
  select t.secret_enc from core.staff_totp t join core.accounts a on a.id = t.account_id
   where t.account_id = p_account and a.status = 'active'
     and a.role in ('agent', 'operations', 'logistics', 'customer_service', 'accountant', 'management', 'admin', 'cashier')
$$;

-- A code is usable once: compare-and-set on the step. False when the step is not newer than the last one used (a replay).
create function core.staff_totp_use(p_account uuid, p_step bigint) returns boolean
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
declare v_done boolean;
begin
  update core.staff_totp set last_step = p_step where account_id = p_account and last_step < p_step;
  get diagnostics v_done = row_count;
  return v_done;
end $$;

-- ---- called by the operator (the migrator login, never the app) ---------------------------------------------------------

-- Enrols an active back-office account that has no enrolment. The secret arrives already encrypted. Audited, with no secret.
create function core.staff_totp_enrol(p_account uuid, p_secret_enc bytea) returns void
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
begin
  perform 1 from core.accounts a
   where a.id = p_account and a.status = 'active'
     and a.role in ('agent', 'operations', 'logistics', 'customer_service', 'accountant', 'management', 'admin', 'cashier');
  if not found then raise exception 'not an active staff account' using errcode = 'no_data_found'; end if;
  if exists (select 1 from core.staff_totp t where t.account_id = p_account) then
    raise exception 'already enrolled: reset it first' using errcode = 'unique_violation';
  end if;
  insert into core.staff_totp (account_id, secret_enc) values (p_account, p_secret_enc);
  insert into gestion.audit_events (actor_id, actor_role, action, entity, entity_id, details)
    values (null, null, 'staff.totp.enrolled', 'account', p_account::text, jsonb_build_object('via', 'operator'));
end $$;

-- T60, p.67 "accès d'urgence tracé": a lost phone is reset by ANOTHER active admin, who gives a reason; the account enrols again at
-- its next sign-in. The audit event keeps the admin, the target and the reason, never a secret.
create function core.staff_totp_reset(p_account uuid, p_by uuid, p_reason text) returns void
  language plpgsql security definer set search_path = pg_catalog, core, pg_temp as $$
begin
  if p_by is not distinct from p_account then
    raise exception 'a second admin must do it: not the account itself' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from core.accounts a where a.id = p_by and a.status = 'active' and a.role = 'admin';
  if not found then raise exception 'only an active admin may reset' using errcode = 'insufficient_privilege'; end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a reason is required' using errcode = 'invalid_parameter_value';
  end if;
  delete from core.staff_totp where account_id = p_account;
  if not found then raise exception 'not enrolled' using errcode = 'no_data_found'; end if;
  insert into gestion.audit_events (actor_id, actor_role, action, entity, entity_id, details)
    values (p_by, 'admin', 'staff.totp.emergency_reset', 'account', p_account::text, jsonb_build_object('reason', btrim(p_reason)));
end $$;

-- Execute rights first, while the migrator still owns the functions; then the ownership (as in 0005).
revoke execute on function core.staff_totp_secret(uuid) from public;
revoke execute on function core.staff_totp_use(uuid, bigint) from public;
revoke execute on function core.staff_totp_enrol(uuid, bytea) from public;
revoke execute on function core.staff_totp_reset(uuid, uuid, text) from public;
grant execute on function core.staff_totp_secret(uuid) to fastgo_app;
grant execute on function core.staff_totp_use(uuid, bigint) to fastgo_app;
grant create on schema core to fastgo_staff_auth;
alter function core.staff_totp_secret(uuid) owner to fastgo_staff_auth;
alter function core.staff_totp_use(uuid, bigint) owner to fastgo_staff_auth;
alter function core.staff_totp_enrol(uuid, bytea) owner to fastgo_staff_auth;
alter function core.staff_totp_reset(uuid, uuid, text) owner to fastgo_staff_auth;
revoke create on schema core from fastgo_staff_auth;
-- The operator's two functions are for the migrator login: it was their owner, and the ownership change took that implicit right
-- with it, so the new owner grants it back (as in 0010: set_config('role'), not SET ROLE).
select set_config('role', 'fastgo_staff_auth', true);
grant execute on function core.staff_totp_enrol(uuid, bytea) to fastgo_migrator;
grant execute on function core.staff_totp_reset(uuid, uuid, text) to fastgo_migrator;
select set_config('role', 'fastgo_migrator', true);
