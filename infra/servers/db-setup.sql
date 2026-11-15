-- One-time database setup for a GOFAST host (#12), done by the PostgreSQL superuser BEFORE the first
-- migration. The migrations create no role and no password. Mirrors apps/api/src/int/harness.ts:
-- change both together. Safe to run again (it asks for the 4 passwords again each time).
--
-- Run it from a terminal. The script asks for the 4 passwords (migrator, app, readonly, worker) with
-- psql's \password: hidden prompt, typed twice, hashed on the client with SCRAM-SHA-256. The plain
-- password never reaches the server, its log or the process list, and is never written in a file.
--   psql "postgres://postgres@127.0.0.1:5432/fastgo" -f infra/servers/db-setup.sql
--
-- It stops with an error when it is not run in a terminal, or when password_encryption on the server
-- is not scram-sha-256 (the hash would be weaker).

\set ON_ERROR_STOP on

-- Fail early: \password needs a terminal.
\! test -t 0
select :SHELL_EXIT_CODE <> 0 as not_a_terminal \gset
\if :not_a_terminal
  do $$ begin raise exception 'db-setup.sql asks for the passwords: run it from a terminal, not from a pipe or a job.'; end $$;
\endif

-- Fail early: the hash is made with the server's setting.
select current_setting('password_encryption') <> 'scram-sha-256' as weak_hash \gset
\if :weak_hash
  do $$ begin raise exception 'password_encryption must be scram-sha-256 (see postgresql.conf), then reload and run this script again.'; end $$;
\endif

-- The roles are created without a password; \password sets it below.
select format('create role %I login', r) from unnest(array[
  'fastgo_migrator', 'fastgo_app', 'fastgo_readonly', 'fastgo_worker']) r
 where not exists (select 1 from pg_roles where rolname = r) \gexec
select 'create role fastgo_public_reader nologin'
 where not exists (select 1 from pg_roles where rolname = 'fastgo_public_reader') \gexec

\echo 'Password for fastgo_migrator, fastgo_app, fastgo_readonly, fastgo_worker (in this order):'
\password fastgo_migrator
\password fastgo_app
\password fastgo_readonly
\password fastgo_worker

-- Migration 0005 hands the SECURITY DEFINER functions to fastgo_public_reader. SET only: the migrator
-- may switch to that role but does not inherit its rights. 0005 stops if this line is missing.
grant fastgo_public_reader to fastgo_migrator with inherit false, set true;

create extension if not exists postgis;
grant create on database fastgo to fastgo_migrator;
grant create on schema public to fastgo_migrator;
grant usage on schema public to fastgo_app, fastgo_readonly, fastgo_worker;
