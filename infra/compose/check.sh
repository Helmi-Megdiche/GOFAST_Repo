#!/usr/bin/env bash
# Checks the laptop stack (PR 1 and 2 of #14). Fake values from .env.example only.
#   cd infra/compose && docker compose --env-file .env.example up -d --wait && ./check.sh
# Every check has a "must fail" twin: a check that cannot fail proves nothing (RV-12).
# Exit code 0 only when every line is OK.
set -uo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash on Windows would rewrite container paths such as /app
cd "$(dirname "$0")"
set -a; . ./.env.example; set +a

DC=(docker compose --env-file .env.example)
fail=0
ok()  { printf 'OK    %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }

# psql as a given login, from inside the compose network, against a given host
psql_as() { # user password host port sql
  "${DC[@]}" run --rm -T --no-deps -e PGPASSWORD="$2" --entrypoint psql db-setup \
    -h "$3" -p "$4" -U "$1" -d fastgo -Atc "$5" 2>&1 | tail -1
}

# 1. services healthy
for s in postgres pgbouncer redis s3 api ws worker web; do
  st=$("${DC[@]}" ps --format '{{.Health}}' "$s")
  [ "$st" = healthy ] && ok "$s healthy" || bad "$s is '$st', expected healthy"
done

# 2. roles exist, none is superuser
n=$(psql_as postgres "$POSTGRES_PASSWORD" postgres 5432 \
  "select count(*) from pg_roles where rolname in ('fastgo_migrator','fastgo_app','fastgo_readonly','fastgo_worker','pgbouncer_auth','fastgo_public_reader')")
[ "$n" = 6 ] && ok "6 roles exist" || bad "roles found: $n, expected 6"
n=$(psql_as postgres "$POSTGRES_PASSWORD" postgres 5432 \
  "select count(*) from pg_roles where rolname like 'fastgo\\_%' and rolsuper")
[ "$n" = 0 ] && ok "no fastgo role is superuser" || bad "$n fastgo role(s) are superuser"

# 3. app logins work through PgBouncer; wrong password is refused (twin)
for pair in "fastgo_app:$FASTGO_APP_PASSWORD" "fastgo_readonly:$FASTGO_READONLY_PASSWORD" "fastgo_worker:$FASTGO_WORKER_PASSWORD"; do
  u=${pair%%:*}; p=${pair#*:}
  r=$(psql_as "$u" "$p" pgbouncer 5432 'select current_user')
  [ "$r" = "$u" ] && ok "$u logs in through PgBouncer" || bad "$u through PgBouncer: $r"
  r=$(psql_as "$u" "wrong-password" pgbouncer 5432 'select 1')
  case "$r" in *"authentication failed"*) ok "$u refused with a wrong password" ;; *) bad "$u with a wrong password: $r" ;; esac
done

# 4. the migrator must NOT go through PgBouncer (advisory lock, one transaction per file)
r=$(psql_as fastgo_migrator "$FASTGO_MIGRATOR_PASSWORD" pgbouncer 5432 'select 1')
case "$r" in *"no such user"*) ok "migrator refused by PgBouncer" ;; *) bad "migrator reached PgBouncer: $r" ;; esac
r=$(psql_as fastgo_migrator "$FASTGO_MIGRATOR_PASSWORD" postgres 5432 'select current_user')
[ "$r" = fastgo_migrator ] && ok "migrator logs in direct to PostgreSQL" || bad "migrator direct: $r"

# 5. auth_query leaks nothing: pgbouncer_auth cannot read pg_authid, and get_auth hides the migrator
r=$(psql_as pgbouncer_auth "$PGBOUNCER_AUTH_PASSWORD" postgres 5432 'select count(*) from pg_authid')
case "$r" in *"permission denied"*) ok "pgbouncer_auth cannot read pg_authid" ;; *) bad "pgbouncer_auth read pg_authid: $r" ;; esac
r=$(psql_as pgbouncer_auth "$PGBOUNCER_AUTH_PASSWORD" postgres 5432 "select count(*) from pgbouncer.get_auth('fastgo_migrator')")
[ "$r" = 0 ] && ok "get_auth hides the migrator" || bad "get_auth('fastgo_migrator') returned $r row(s)"
r=$(psql_as pgbouncer_auth "$PGBOUNCER_AUTH_PASSWORD" postgres 5432 "select count(*) from pgbouncer.get_auth('fastgo_app')")
[ "$r" = 1 ] && ok "get_auth returns fastgo_app" || bad "get_auth('fastgo_app') returned $r row(s)"

# 6. Redis needs its password
r=$("${DC[@]}" exec -T redis sh -c 'redis-cli ping' 2>&1 | tail -1)
[ "$r" = PONG ] && ok "redis answers with its password" || bad "redis ping with password: $r"
r=$("${DC[@]}" exec -T redis sh -c 'unset REDISCLI_AUTH; redis-cli ping' 2>&1)
case "$r" in *NOAUTH*|*"Authentication required"*) ok "redis refuses no password" ;; *) bad "redis without password: $r" ;; esac

# 7. S3 checks the keys: anonymous requests are refused, the env keys work, a wrong key is refused
AWSCLI=amazon/aws-cli@sha256:c5d442efed03350a3c3d7a42b23f42a8e7b76acf5dbb4b021f2641bcd36680ea # 2.41.0
NET="$("${DC[@]}" ps -q s3 | xargs docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')"
s3cli() { # secret args...
  local secret=$1; shift
  docker run --rm --network "$NET" -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$secret" \
    -e AWS_EC2_METADATA_DISABLED=true "$AWSCLI" --endpoint-url http://s3:8333 --region us-east-1 "$@" 2>&1
}
c=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${S3_PORT}/")
[ "$c" = 403 ] && ok "s3 refuses an unsigned GET (403)" || bad "s3 unsigned GET returned $c, expected 403"
c=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "http://127.0.0.1:${S3_PORT}/anon-check")
[ "$c" = 403 ] && ok "s3 refuses an unsigned bucket create (403)" || bad "s3 unsigned PUT returned $c, expected 403"
bucket="check-$$"
r=$(s3cli "$S3_SECRET_KEY" s3 mb "s3://$bucket" | tail -1)
case "$r" in "make_bucket: $bucket") ok "s3 signed bucket create works" ;; *) bad "s3 signed create: $r" ;; esac
r=$(s3cli "$S3_SECRET_KEY" s3 ls | grep -c " $bucket\$")
[ "$r" = 1 ] && ok "s3 signed list shows the bucket" || bad "s3 signed list: bucket not found"
r=$(s3cli "wrong-key" s3 ls)
case "$r" in *SignatureDoesNotMatch*|*InvalidAccessKeyId*|*AccessDenied*) ok "s3 refuses a wrong key" ;; *) bad "s3 with a wrong key: $r" ;; esac
s3cli "$S3_SECRET_KEY" s3 rb "s3://$bucket" >/dev/null

# 8. migrations applied (run from the host: pnpm --filter @fastgo/api db:migrate)
r=$(psql_as postgres "$POSTGRES_PASSWORD" postgres 5432 "select count(*) from information_schema.tables where table_schema in ('core','gestion')")
[ "${r:-0}" -gt 0 ] 2>/dev/null && ok "migrations applied ($r tables in core and gestion)" || bad "no table in core/gestion: run db:migrate (got '$r')"

# 9. the app images (PR 2): answers, runs as non-root, migrations are idempotent
c=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${API_PORT}/v1/health")
[ "$c" = 200 ] && ok "api /v1/health answers 200" || bad "api /v1/health returned $c, expected 200"
c=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${API_PORT}/v1/no-such-route")
[ "$c" = 404 ] && ok "api answers 404 on an unknown route" || bad "api unknown route returned $c, expected 404"
c=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${WEB_PORT}/fr")
[ "$c" = 200 ] && ok "web /fr answers 200" || bad "web /fr returned $c, expected 200"
c=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${WEB_PORT}/fr/no-such-page")
[ "$c" = 404 ] && ok "web answers 404 on an unknown page" || bad "web unknown page returned $c, expected 404"
for s in api ws worker web; do
  r=$("${DC[@]}" exec -T "$s" id -u)
  [ "$r" != 0 ] && ok "$s runs as a non-root user (uid $r)" || bad "$s runs as root"
done
r=$("${DC[@]}" run --rm -T --no-deps migrate 2>&1 | tail -1)
[ "$r" = "nothing to apply" ] && ok "migrate again: nothing to apply" || bad "second migrate run: $r"

# 10. hardening (round 1 of the review): code is read-only, /tmp is the only writable path
for s in api web; do
  "${DC[@]}" exec -T "$s" sh -c 'touch /app/write-test' >/dev/null 2>&1 \
    && bad "$s can write in /app" || ok "$s cannot write in /app"
  "${DC[@]}" exec -T "$s" sh -c 'touch /tmp/write-test && rm /tmp/write-test' >/dev/null 2>&1 \
    && ok "$s can write in /tmp" || bad "$s cannot write in /tmp"
done
for s in migrate api ws worker web; do
  r=$("${DC[@]}" config --format json | node -e '
    const s=JSON.parse(require("fs").readFileSync(0,"utf8")).services[process.argv[1]];
    const ok=s.read_only===true&&(s.cap_drop||[]).includes("ALL")&&(s.security_opt||[]).includes("no-new-privileges:true")&&s.tmpfs&&s.tmpfs.includes("/tmp");
    console.log(ok?"yes":"no")' "$s")
  [ "$r" = yes ] && ok "$s is hardened in compose (read_only, tmpfs, cap_drop, no-new-privileges)" || bad "$s is missing a hardening setting"
done

# 11. the dev UI is off in the image, and no image carries an env file
c=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${WEB_PORT}/fr/dev/ui")
[ "$c" = 404 ] && ok "web /fr/dev/ui answers 404 (dev UI is off)" || bad "web /fr/dev/ui returned $c, expected 404"
for img in "${API_IMAGE:-gofast-api:local}" "${WEB_IMAGE:-gofast-web:local}"; do
  r=$(docker run --rm --entrypoint sh "$img" -c 'find / -xdev -name ".env*" -not -name ".env.example" 2>/dev/null')
  [ -z "$r" ] && ok "$img holds no .env file" || bad "$img holds an env file: $r"
done

exit $fail
