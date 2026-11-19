# Compose stack (#14)

PostgreSQL + PostGIS, PgBouncer, Redis, S3-compatible storage (SeaweedFS), and the apps: `migrate` (one-shot), `api`, `ws`, `worker`, `web`. Fake values only in `.env.example`.
The images are built from `infra/docker/` (one image for api, ws, worker and migrate; one for web). Caddy and the staging override are below.

## Laptop

```
cd infra/compose
docker compose --env-file .env.example up -d --build --wait   # db-setup, then migrate, then api, ws, worker, web
./check.sh                                                    # 66 checks, exit 1 if one fails
docker compose --env-file .env.example down -v                # stop and erase the data
```

Host ports are on 127.0.0.1 and away from the usual ones (Windows reserves ranges around 5433 to 5632):
PostgreSQL 15432, PgBouncer 16432, Redis 16379, S3 18333, web 13000, api 14000 (ws and worker only inside the network). Caddy is the one exception: 18080 and 18443 on the laptop.

To run the migrations from your own checkout instead: `pnpm --filter @fastgo/api db:migrate` with
`DATABASE_MIGRATOR_URL=postgres://fastgo_migrator:<FASTGO_MIGRATOR_PASSWORD>@127.0.0.1:15432/fastgo`.
Direct to PostgreSQL, never PgBouncer (advisory lock, one transaction per file). The `migrate` service does the same
from the api image. The API itself uses `fastgo_app` through PgBouncer.

Passwords go into connection URLs: on staging use URL-safe characters (letters, digits, `-`, `_`).
Only values identical in every environment may be `NEXT_PUBLIC_*`: they are inlined into the web image at build time (`SITE_URL`, `API_DOMAINS`), and one image goes to staging and production. Per-environment values stay runtime variables.
The five app containers run read-only (`/tmp` is a tmpfs), without capabilities and with `no-new-privileges`; the code is owned by root.

## Caddy (the only public door)

Caddy is the only service with public ports (80 and 443). Every other port is on 127.0.0.1. Routes, in `Caddyfile`:

| Path | Goes to |
|---|---|
| `/v1/*` | `api:4000` (Next never forwards `/v1`) |
| `/ws/*` | `ws:4001`, the `/ws` prefix removed: `/ws/health` reaches `/health` on the ws process. The WebSocket path for clients is `/ws/` |
| everything else | `web:3000` |

Caddy replaces `X-Forwarded-For` and `X-Real-IP` with the real client address (`header_up ... {remote_host}`) and drops client values, removes `Server`, and adds HSTS on staging and production. The api counts sign-ins per IP, so a forged `X-Forwarded-For` must not change the counted address: `check.sh` proves it with the per-IP limit.

**`TRUST_PROXY`**: the laptop stack runs through Caddy, so `.env.example` sets `TRUST_PROXY=1` (one hop). Staging fixes it at `1` in `compose.staging.yaml`. Without Caddy in front, keep `0`. The api (14000) and web (13000) host ports stay on 127.0.0.1 on the laptop only, for tools; there the forwarded header is client-written, so test limits through Caddy. **Staging publishes no api, ws or web host port** (`ports: !reset []` in `compose.staging.yaml`): with `TRUST_PROXY=1` anyone reaching 14000 directly could forge the client address. `check.sh staging` reads the config and tries the connection.

Laptop: `https://localhost:18443/fr` (ports 18080 and 18443, Caddy's internal certificate, `curl -k`). Ports are not 80, 443 or 8080 because those are often taken on a laptop; a server sets `CADDY_BIND=0.0.0.0`, `HTTP_PORT=80`, `HTTPS_PORT=443`.

## Staging override

```
docker compose -f compose.yaml -f compose.staging.yaml --env-file <staging env file> up -d --build --wait
./check.sh staging                  # 44 checks (laptop: 66)
```

- `STAGING_DOMAIN` sets the site address, automatic HTTPS. `STAGING_USER` and `STAGING_PASSWORD_HASH` (bcrypt, from `caddy hash-password`) protect **every** route with `basic_auth`: `/fr`, `/v1/*`, `/ws/*` and `robots.txt`. The hash lives in the server's env file, never in git.
- Every answer, 401 included, carries `X-Robots-Tag: noindex, nofollow`; `robots.txt` disallows everything.
- **Fake data only on staging.** No `db-setup` profile: `COMPOSE_PROFILES` is not set, the roles are created once by hand (`infra/servers/README.md`). `APP_ENV` is not `production`.
- Locally: `.env.staging.example` (fake domain `staging.gofast.test`, `CADDY_TLS=internal`, fake password `fake-staging-password`). Start `postgres`, run `db-setup` through the base file (`--profile setup run --rm db-setup`), then `up`. `check.sh staging` finds the domain through `curl --resolve`.

## Order (same on staging)

1. empty `postgres`, healthy
2. `db-setup.sql` once, by the superuser. Laptop: automatic, passwords from `.env.example`. Staging: by hand, from a terminal, 5 hidden prompts (`infra/servers/README.md`)
3. `migrate` as `fastgo_migrator`, direct. Laptop: waits for db-setup. Staging: the `setup` profile is off, so db-setup is not started and not waited for
4. api, ws and worker start only after `migrate` exited with 0

## Pinned images

Every image is pinned by tag and digest. Update the digest on purpose, in a PR.
