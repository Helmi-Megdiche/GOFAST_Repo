-- One-time database setup for a GOFAST host (#12), done by the PostgreSQL superuser BEFORE the first
-- migration. The migrations create no role and no password. Mirrors apps/api/src/int/harness.ts:
-- change both together. Safe to run again.
--
-- Run it with the passwords as psql variables, never written in a file:
--   psql "postgres://postgres@127.0.0.1:5432/fastgo" -v ON_ERROR_STOP=1 \
--     -v migrator_pw="$MIGRATOR_PW" -v app_pw="$APP_PW" \
--     -v readonly_pw="$READONLY_PW" -v worker_pw="$WORKER_PW" \
--     -f infra/servers/db-setup.sql

select format('create role %I login', r) from unnest(array[
  'fastgo_migrator', 'fastgo_app', 'fastgo_readonly', 'fastgo_worker']) r
 where not exists (select 1 from pg_roles where rolname = r) \gexec
select 'create role fastgo_public_reader nologin'
 where not exists (select 1 from pg_roles where rolname = 'fastgo_public_reader') \gexec

alter role fastgo_migrator password :'migrator_pw';
alter role fastgo_app password :'app_pw';
alter role fastgo_readonly password :'readonly_pw';
alter role fastgo_worker password :'worker_pw';

-- Migration 0005 hands the SECURITY DEFINER functions to fastgo_public_reader. SET only: the migrator
-- may switch to that role but does not inherit its rights. 0005 stops if this line is missing.
grant fastgo_public_reader to fastgo_migrator with inherit false, set true;

create extension if not exists postgis;
grant create on database fastgo to fastgo_migrator;
grant create on schema public to fastgo_migrator;
grant usage on schema public to fastgo_app, fastgo_readonly, fastgo_worker;
