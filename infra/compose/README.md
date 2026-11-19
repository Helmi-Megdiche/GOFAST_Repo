# Compose stack (#14)

PostgreSQL + PostGIS, PgBouncer, Redis, S3-compatible storage (SeaweedFS), and the apps: `migrate` (one-shot), `api`, `ws`, `worker`, `web`. Fake values only in `.env.example`.
The images are built from `infra/docker/` (one image for api, ws, worker and migrate; one for web). Staging override and Caddy come in the next PRs.

## Laptop

```
cd infra/compose
docker compose --env-file .env.example up -d --build --wait   # db-setup, then migrate, then api, ws, worker, web
./check.sh                                                    # 50 checks, exit 1 if one fails
docker compose --env-file .env.example down -v                # stop and erase the data
```

Host ports are on 127.0.0.1 and away from the usual ones (Windows reserves ranges around 5433 to 5632):
PostgreSQL 15432, PgBouncer 16432, Redis 16379, S3 18333, web 13000, api 14000 (ws and worker only inside the network).

To run the migrations from your own checkout instead: `pnpm --filter @fastgo/api db:migrate` with
`DATABASE_MIGRATOR_URL=postgres://fastgo_migrator:<FASTGO_MIGRATOR_PASSWORD>@127.0.0.1:15432/fastgo`.
Direct to PostgreSQL, never PgBouncer (advisory lock, one transaction per file). The `migrate` service does the same
from the api image. The API itself uses `fastgo_app` through PgBouncer.

Passwords go into connection URLs: on staging use URL-safe characters (letters, digits, `-`, `_`).
Only values identical in every environment may be `NEXT_PUBLIC_*`: they are inlined into the web image at build time (`SITE_URL`, `API_DOMAINS`), and one image goes to staging and production. Per-environment values stay runtime variables.
The five app containers run read-only (`/tmp` is a tmpfs), without capabilities and with `no-new-privileges`; the code is owned by root.

## Order (same on staging)

1. empty `postgres`, healthy
2. `db-setup.sql` once, by the superuser. Laptop: automatic, passwords from `.env.example`. Staging: by hand, from a terminal, 5 hidden prompts (`infra/servers/README.md`)
3. `migrate` as `fastgo_migrator`, direct. Laptop: waits for db-setup. Staging: db-setup is not a compose service, so it is not waited for
4. api, ws and worker start only after `migrate` exited with 0

## Pinned images

Every image is pinned by tag and digest. Update the digest on purpose, in a PR.
