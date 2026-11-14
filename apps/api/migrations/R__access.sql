-- ACCESS RULES: the only place that lists which role may do what. Applied before the versioned
-- migrations and again whenever this file changes (the runner keeps its checksum). The role lists
-- are provisional until the rights matrix (DR/EX, Ala) is detailed; a change is made HERE only.
--
-- Identity reaches the database through three transaction-local settings, set by the API with
-- one bound `select set_config(name, value, true)` per transaction (the cahier's SET LOCAL):
-- app.user_id, app.company_id, app.role. After a local set_config on a pooled connection the
-- setting reads '' (not NULL) in the next transaction, so every reader goes through nullif.

create schema if not exists core;
create schema if not exists gestion;

create or replace function core.app_user_id() returns uuid
  language sql stable parallel safe set search_path = pg_catalog
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function core.app_company_id() returns uuid
  language sql stable parallel safe set search_path = pg_catalog
  as $$ select nullif(current_setting('app.company_id', true), '')::uuid $$;

create or replace function core.app_role() returns text
  language sql stable parallel safe set search_path = pg_catalog
  as $$ select nullif(current_setting('app.role', true), '') $$;

create or replace function core.actor_has(variadic roles text[]) returns boolean
  language sql stable parallel safe set search_path = pg_catalog, core
  as $$ select coalesce(core.app_role() = any (roles), false) $$;

-- The rows of a customer: his own, or his company's.
create or replace function core.owns(owner_account_id uuid, owner_company_id uuid) returns boolean
  language sql stable parallel safe set search_path = pg_catalog, core
  as $$
    select (owner_account_id is not null and owner_account_id = core.app_user_id())
        or (owner_company_id is not null and owner_company_id = core.app_company_id())
  $$;

-- Role groups. One function per decision, named by what it allows.
create or replace function core.staff_reads_customers() returns boolean
  language sql stable parallel safe set search_path = pg_catalog, core
  as $$ select core.actor_has('agent', 'operations', 'logistics', 'customer_service',
                              'accountant', 'management', 'admin') $$;

create or replace function core.staff_writes_customers() returns boolean
  language sql stable parallel safe set search_path = pg_catalog, core
  as $$ select core.actor_has('agent', 'operations', 'admin') $$;

create or replace function core.staff_reads_finance() returns boolean
  language sql stable parallel safe set search_path = pg_catalog, core
  as $$ select core.actor_has('accountant', 'management', 'operations', 'customer_service',
                              'admin') $$;

create or replace function core.staff_writes_finance() returns boolean
  language sql stable parallel safe set search_path = pg_catalog, core
  as $$ select core.actor_has('accountant', 'admin') $$;

create or replace function core.staff_writes_settings() returns boolean
  language sql stable parallel safe set search_path = pg_catalog, core
  as $$ select core.actor_has('admin') $$;

create or replace function core.staff_reads_audit() returns boolean
  language sql stable parallel safe set search_path = pg_catalog, core
  as $$ select core.actor_has('management', 'admin') $$;

-- Helpers the migrations call, so no table is created with open rights or without RLS.
-- A new table: core.protect('core.t', 'select, insert') (RLS on and forced, rights to the app and
-- to the read-only user). Nothing is granted to PUBLIC.
create or replace function core.protect(tbl regclass, app_rights text, readonly boolean default true)
  returns void language plpgsql set search_path = pg_catalog as $$
declare cols text;
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('alter table %s force row level security', tbl);
  execute format('revoke all on %s from public', tbl);
  execute format('grant %s on %s to fastgo_app', app_rights, tbl);
  if readonly then
    -- SELECT on every column except the hashes.
    select string_agg(quote_ident(attname), ', ' order by attnum) into cols
      from pg_attribute
     where attrelid = tbl and attnum > 0 and not attisdropped and attname !~ '_hash$';
    execute format('grant select (%s) on %s to fastgo_readonly', cols, tbl);
    execute format('drop policy if exists readonly_select on %s', tbl);
    execute format('create policy readonly_select on %s for select to fastgo_readonly using (true)', tbl);
  end if;
end $$;

-- A reference table (zones, services, prices): readable by everyone who may connect, written by
-- nobody but the migrator. No row of a person, so no RLS.
create or replace function core.reference(tbl regclass) returns void
  language plpgsql set search_path = pg_catalog as $$
begin
  execute format('revoke all on %s from public', tbl);
  execute format('grant select on %s to fastgo_app, fastgo_readonly, fastgo_worker', tbl);
end $$;

-- A table with a credential column (`*_hash`): the app logs in through a SECURITY DEFINER function
-- and never reads the hash, so SELECT is column by column, without it.
create or replace function core.hide_hashes_from_app(tbl regclass) returns void
  language plpgsql set search_path = pg_catalog as $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_attribute
   where attrelid = tbl and attnum > 0 and not attisdropped and attname !~ '_hash$';
  execute format('revoke select on %s from fastgo_app', tbl);
  execute format('grant select (%s) on %s to fastgo_app', cols, tbl);
end $$;
