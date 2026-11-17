-- One-time database setup for a GOFAST host (#12), done by the PostgreSQL superuser BEFORE the first
-- migration. The migrations create no role and no password. The roles, the PostGIS extension and the
-- fastgo_public_reader grant mirror apps/api/src/int/harness.ts: change both together. Differs on purpose:
-- pgbouncer_auth and pgbouncer.get_auth are only here, because the integration tests connect direct to
-- PostgreSQL and never use PgBouncer. Safe to run again (it sets the passwords again each time).
--
-- Real hosts (interactive): the script asks for the 5 passwords (migrator, app, readonly, worker,
-- pgbouncer_auth) with psql's \password: hidden prompt, typed twice, hashed on the client with
-- SCRAM-SHA-256. The plain password never reaches the server, its log or the process list.
--   psql "postgres://postgres@127.0.0.1:5432/fastgo" -f infra/servers/db-setup.sql
--
-- Laptop and CI (no terminal): pass the passwords as psql variables, fake values only. The plain
-- password then reaches the server, which hashes it. A real host never uses this mode.
--   psql ... -v pw_migrator=x -v pw_app=x -v pw_readonly=x -v pw_worker=x -v pw_pgbouncer=x -f db-setup.sql
--
-- It stops with an error when the interactive mode has no terminal, or when password_encryption on
-- the server is not scram-sha-256 (the hash would be weaker).

\set ON_ERROR_STOP on

select :{?pw_migrator} and :{?pw_app} and :{?pw_readonly} and :{?pw_worker} and :{?pw_pgbouncer} as from_vars \gset

\if :from_vars
  -- Variable mode: no terminal needed.
\else
  -- Fail early: \password needs a terminal.
  \! test -t 0
  select :SHELL_EXIT_CODE <> 0 as not_a_terminal \gset
  \if :not_a_terminal
    do $$ begin raise exception 'db-setup.sql asks for the passwords: run it from a terminal, or pass -v pw_migrator=... (laptop, fake values only).'; end $$;
  \endif
\endif

-- Fail early: the hash is made with the server's setting.
select current_setting('password_encryption') <> 'scram-sha-256' as weak_hash \gset
\if :weak_hash
  do $$ begin raise exception 'password_encryption must be scram-sha-256 (see postgresql.conf), then reload and run this script again.'; end $$;
\endif

-- The roles are created without a password; it is set below.
select format('create role %I login', r) from unnest(array[
  'fastgo_migrator', 'fastgo_app', 'fastgo_readonly', 'fastgo_worker', 'pgbouncer_auth']) r
 where not exists (select 1 from pg_roles where rolname = r) \gexec
select 'create role fastgo_public_reader nologin'
 where not exists (select 1 from pg_roles where rolname = 'fastgo_public_reader') \gexec

\if :from_vars
  alter role fastgo_migrator password :'pw_migrator';
  alter role fastgo_app password :'pw_app';
  alter role fastgo_readonly password :'pw_readonly';
  alter role fastgo_worker password :'pw_worker';
  alter role pgbouncer_auth password :'pw_pgbouncer';
\else
  \echo 'Password for fastgo_migrator, fastgo_app, fastgo_readonly, fastgo_worker, pgbouncer_auth (in this order):'
  \password fastgo_migrator
  \password fastgo_app
  \password fastgo_readonly
  \password fastgo_worker
  \password pgbouncer_auth
\endif

-- Migration 0005 hands the SECURITY DEFINER functions to fastgo_public_reader. SET only: the migrator
-- may switch to that role but does not inherit its rights. 0005 stops if this line is missing.
grant fastgo_public_reader to fastgo_migrator with inherit false, set true;

create extension if not exists postgis;
grant create on database fastgo to fastgo_migrator;
grant create on schema public to fastgo_migrator;
grant usage on schema public to fastgo_app, fastgo_readonly, fastgo_worker;

-- PgBouncer logs in as pgbouncer_auth and looks the app logins up here (auth_query), so no password
-- or hash is written in a PgBouncer file. The function returns the hash of the three app logins only.
create schema if not exists pgbouncer;
create or replace function pgbouncer.get_auth(p_usename text)
returns table (usename name, passwd text)
language sql security definer set search_path = pg_catalog as $$
  select rolname, rolpassword from pg_authid
   where rolname = p_usename and rolcanlogin
     and rolname in ('fastgo_app', 'fastgo_readonly', 'fastgo_worker')
$$;
revoke all on function pgbouncer.get_auth(text) from public;
grant usage on schema pgbouncer to pgbouncer_auth;
grant execute on function pgbouncer.get_auth(text) to pgbouncer_auth;
