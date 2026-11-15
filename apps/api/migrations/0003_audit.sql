-- Audit trail (gestion). The app and the worker can only INSERT; management and admin can read;
-- nobody can change or remove a row (triggers stop even the owner and a superuser's UPDATE,
-- DELETE and TRUNCATE).

create table gestion.audit_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  action text not null check (action <> ''),
  entity text not null check (entity <> ''),
  entity_id text,
  details jsonb not null default '{}',
  request_id text
);
create index audit_events_entity on gestion.audit_events (entity, entity_id);
create index audit_events_at on gestion.audit_events (at);

-- Not readable by fastgo_readonly: details may name people.
select core.protect('gestion.audit_events', 'insert, select', false);

-- An event is written as the actor of the request (or as nobody: a system job).
create policy audit_insert_app on gestion.audit_events for insert to fastgo_app
  with check (actor_id is not distinct from core.app_user_id()
    and actor_role is not distinct from core.app_role());
create policy audit_select_app on gestion.audit_events for select to fastgo_app
  using (core.staff_reads_audit());

grant insert on gestion.audit_events to fastgo_worker;
create policy audit_insert_worker on gestion.audit_events for insert to fastgo_worker
  with check (actor_id is null);

create or replace function gestion.audit_events_immutable() returns trigger
  language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'audit_events is append-only (% refused)', tg_op using errcode = 'insufficient_privilege';
end $$;

create trigger audit_events_no_change before update or delete on gestion.audit_events
  for each row execute function gestion.audit_events_immutable();
create trigger audit_events_no_truncate before truncate on gestion.audit_events
  for each statement execute function gestion.audit_events_immutable();
