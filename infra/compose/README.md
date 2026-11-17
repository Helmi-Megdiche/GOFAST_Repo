# Compose stack (#14)

PostgreSQL + PostGIS, PgBouncer, Redis and S3-compatible storage (SeaweedFS). Fake values only in `.env.example`.
Staging override, Caddy, the images (api, ws, worker, web) and the `migrate` service come in the next PRs.

## Laptop

```
cd infra/compose
docker compose --env-file .env.example up -d --wait   # also runs db-setup once (profile "setup")
pnpm --filter @fastgo/api db:migrate                    # with DATABASE_MIGRATOR_URL, see below
./check.sh                                              # 25 checks, exit 1 if one fails
docker compose --env-file .env.example down -v          # stop and erase the data
```

Host ports are on 127.0.0.1 and away from the usual ones (Windows reserves ranges around 5433 to 5632):
PostgreSQL 15432, PgBouncer 16432, Redis 16379, S3 18333.

`DATABASE_MIGRATOR_URL=postgres://fastgo_migrator:<FASTGO_MIGRATOR_PASSWORD>@127.0.0.1:15432/fastgo`
(direct to PostgreSQL, never PgBouncer: the migrator takes an advisory lock and runs one transaction per file).
The API itself uses `fastgo_app` through PgBouncer on 16432.

## Order (same on staging)

1. empty `postgres`, healthy
2. `db-setup.sql` once, by the superuser. Laptop: automatic, passwords from `.env.example`. Staging: by hand, from a terminal, 5 hidden prompts (`infra/servers/README.md`)
3. migrations as `fastgo_migrator`, direct
4. api, ws, worker start only after step 3 succeeded (PR 2)

## Pinned images

Every image is pinned by tag and digest. Update the digest on purpose, in a PR.
