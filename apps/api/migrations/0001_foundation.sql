-- Foundation: prerequisites, identity tables, reference tables, addresses.
-- Roles and extensions are created by a superuser (infra/servers/ and the test harness), never
-- here: this file only checks that they exist and grants. No password appears in any migration.

do $$
declare r text;
begin
  foreach r in array array['fastgo_migrator', 'fastgo_app', 'fastgo_readonly', 'fastgo_worker',
                           'fastgo_public_reader'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      raise exception 'role % is missing: run the server setup (infra/servers) first', r;
    end if;
  end loop;
  if not exists (select 1 from pg_extension where extname = 'postgis') then
    raise exception 'extension postgis is missing: run the server setup first';
  end if;
end $$;

grant usage on schema core, gestion to fastgo_app, fastgo_readonly, fastgo_worker;
grant usage on schema core to fastgo_public_reader;

-- Reference tables -------------------------------------------------------------------------

create table core.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- Polygons are not given yet (D1 names the four governorates only).
  area public.geography(MultiPolygon, 4326),
  active boolean not null default true
);
select core.reference('core.zones');

create table core.services (
  code text primary key check (code in ('express', 'standard', 'scheduled')),
  active boolean not null default true
);
select core.reference('core.services');

-- One price per service and packaging option; `millimes` is null while GOFAST gave none
-- ("Programmee" stays [PRIX]).
create table core.prices (
  service_code text not null references core.services (code),
  with_packaging boolean not null,
  millimes bigint check (millimes >= 0),
  updated_at timestamptz not null default now(),
  primary key (service_code, with_packaging)
);
select core.reference('core.prices');

-- Identity ---------------------------------------------------------------------------------

-- One row per person: customers, merchant users, staff, drivers. `role` is what the session
-- carries; a merchant user acts for a company through `company_members`.
create table core.accounts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('customer', 'merchant', 'staff')),
  role text not null check (role in ('individual', 'merchant', 'agent', 'operations', 'logistics',
    'customer_service', 'accountant', 'management', 'admin', 'driver', 'cashier')),
  full_name text,
  phone_e164 text unique check (phone_e164 ~ '^\+216[0-9]{8}$'),
  phone_verified_at timestamptz,
  email text,
  google_sub text unique,
  password_hash text,
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en')),
  status text not null default 'active' check (status in ('active', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'closed') = (closed_at is not null))
);
-- R101: unique, and case does not matter for an e-mail.
create unique index accounts_email_key on core.accounts (lower(email)) where email is not null;
select core.protect('core.accounts', 'select, update');

create policy accounts_select on core.accounts for select to fastgo_app
  using (id = core.app_user_id() or core.staff_reads_customers());
create policy accounts_update on core.accounts for update to fastgo_app
  using (id = core.app_user_id() or core.actor_has('admin'))
  with check (id = core.app_user_id() or core.actor_has('admin'));
-- No INSERT policy: an account is created by core.create_account() only (sign-up, PR 4a).

create table core.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  tax_number text,
  billing_address_id uuid,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select core.protect('core.companies', 'select, insert, update');

create policy companies_select on core.companies for select to fastgo_app
  using (id = core.app_company_id() or core.staff_reads_customers());
create policy companies_insert on core.companies for insert to fastgo_app
  with check (core.app_role() = 'merchant' or core.staff_writes_customers());
create policy companies_update on core.companies for update to fastgo_app
  using (id = core.app_company_id() or core.staff_writes_customers())
  with check (id = core.app_company_id() or core.staff_writes_customers());

create table core.company_members (
  company_id uuid not null references core.companies (id),
  account_id uuid not null references core.accounts (id),
  -- The cahier does not detail the roles inside a company.
  role text not null check (role <> ''),
  created_at timestamptz not null default now(),
  primary key (company_id, account_id)
);
select core.protect('core.company_members', 'select, insert, update');

create policy members_select on core.company_members for select to fastgo_app
  using (company_id = core.app_company_id() or account_id = core.app_user_id()
         or core.staff_reads_customers());
create policy members_insert on core.company_members for insert to fastgo_app
  with check (company_id = core.app_company_id() or core.staff_writes_customers());
create policy members_update on core.company_members for update to fastgo_app
  using (company_id = core.app_company_id() or core.staff_writes_customers())
  with check (company_id = core.app_company_id() or core.staff_writes_customers());

-- Addresses and recipients --------------------------------------------------------------

create table core.addresses (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid references core.accounts (id),
  owner_company_id uuid references core.companies (id),
  label text,
  line text not null,
  landmark text not null default '',
  location public.geography(Point, 4326),
  zone_id uuid references core.zones (id),
  is_pickup_point boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(owner_account_id, owner_company_id) = 1)
);
create index addresses_owner_account on core.addresses (owner_account_id);
create index addresses_owner_company on core.addresses (owner_company_id);
select core.protect('core.addresses', 'select, insert, update');

create policy addresses_select on core.addresses for select to fastgo_app
  using (core.owns(owner_account_id, owner_company_id) or core.staff_reads_customers());
create policy addresses_insert on core.addresses for insert to fastgo_app
  with check (core.owns(owner_account_id, owner_company_id) or core.staff_writes_customers());
create policy addresses_update on core.addresses for update to fastgo_app
  using (core.owns(owner_account_id, owner_company_id) or core.staff_writes_customers())
  with check (core.owns(owner_account_id, owner_company_id) or core.staff_writes_customers());

alter table core.companies add constraint companies_billing_address_fk
  foreign key (billing_address_id) references core.addresses (id);

create table core.recipients (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid references core.accounts (id),
  owner_company_id uuid references core.companies (id),
  name text not null,
  phone_e164 text not null check (phone_e164 ~ '^\+216[0-9]{8}$'),
  address_id uuid references core.addresses (id),
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(owner_account_id, owner_company_id) = 1)
);
create index recipients_owner_account on core.recipients (owner_account_id);
create index recipients_owner_company on core.recipients (owner_company_id);
select core.protect('core.recipients', 'select, insert, update');

create policy recipients_select on core.recipients for select to fastgo_app
  using (core.owns(owner_account_id, owner_company_id) or core.staff_reads_customers());
create policy recipients_insert on core.recipients for insert to fastgo_app
  with check (core.owns(owner_account_id, owner_company_id) or core.staff_writes_customers());
create policy recipients_update on core.recipients for update to fastgo_app
  using (core.owns(owner_account_id, owner_company_id) or core.staff_writes_customers())
  with check (core.owns(owner_account_id, owner_company_id) or core.staff_writes_customers());
