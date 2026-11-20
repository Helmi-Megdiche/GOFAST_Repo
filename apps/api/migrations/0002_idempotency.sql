-- R202: the first answer of a keyed request, kept 24 h and shared by every API process.
-- No RLS on purpose: the rows belong to no person; only the API (read/write) and the worker
-- (purge) have rights, nobody else. The scope is "<account>|<METHOD path>|<key>".

create table core.idempotency_keys (
  scope text primary key,
  -- The paying account (or "anonymous" calls: null). Text, because the scope is built from it.
  account_id text,
  fingerprint text not null,
  -- The lease: only the caller holding this token may complete or abort the row.
  token uuid not null,
  locked_until timestamptz not null,
  expires_at timestamptz not null,
  status text not null check (status in ('running', 'done')),
  response_status integer,
  body jsonb,
  created_at timestamptz not null default now(),
  check ((status = 'done') = (response_status is not null))
);
create index idempotency_keys_account on core.idempotency_keys (account_id);
create index idempotency_keys_expires on core.idempotency_keys (expires_at);

revoke all on core.idempotency_keys from public;
grant select, insert, update, delete on core.idempotency_keys to fastgo_app;
grant select, delete on core.idempotency_keys to fastgo_worker;
