#!/usr/bin/env bash
# Checks the stack. Fake values from the env example files only.
#   Laptop:  cd infra/compose && docker compose --env-file .env.example up -d --build --wait && ./check.sh
#   Staging override on a laptop (fake domain, Caddy's internal certificate): see README, then ./check.sh staging
# Every check has a "must fail" twin: a check that cannot fail proves nothing (RV-12).
# Exit code 0 only when every line is OK.
set -uo pipefail
export MSYS_NO_PATHCONV=1  # Git Bash on Windows would rewrite container paths such as /app
cd "$(dirname "$0")"
MODE=${1:-laptop}
case "$MODE" in
  laptop) ENVFILE=.env.example; DC=(docker compose --env-file .env.example) ;;
  staging) ENVFILE=.env.staging.example; DC=(docker compose -f compose.yaml -f compose.staging.yaml --env-file .env.staging.example) ;;
  *) echo "usage: ./check.sh [laptop|staging]" >&2; exit 2 ;;
esac
set -a; . "./$ENVFILE"; set +a

fail=0
ok()  { printf 'OK    %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }

# --- helpers for the Caddy checks (PR 3) ------------------------------------------------------------
BASE="https://localhost:${HTTPS_PORT}"
code() { curl -sk -o /dev/null -w '%{http_code}' "$@"; }
hdrs() { curl -sk -o /dev/null -D - "$@" | tr -d ''; }            # response headers
has_hdr() { local h=$1; shift; hdrs "$@" | grep -qi "^$h:"; }
# a "header must be absent" check needs an answer first: no answer proves nothing
no_hdr() { local h=$1; shift; local out; out=$(hdrs "$@"); [ -n "$out" ] && ! printf '%s\n' "$out" | grep -qi "^$h:"; }
# Reads `docker compose config --format json`; prints api, ws, web and worker entries that publish a port.
app_ports() {
  node -e '
    const svc=JSON.parse(require("fs").readFileSync(0,"utf8")).services, bad=[];
    for (const n of ["api","ws","web","worker"]) for (const p of (svc[n]||{}).ports||[]) bad.push(n+":"+p.target);
    console.log(bad.join(" "))' || echo "config unreadable"
}
# Is something accepting TCP connections on 127.0.0.1:$1? (a refused connection means nothing listens)
listens() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
# Reads `docker compose config --format json`; prints every published port that breaks the rule: only
# caddy may publish outside 127.0.0.1 (and only 80 and 443); caddy must publish exactly those two.
port_offenders() {
  node -e '
    const svc=JSON.parse(require("fs").readFileSync(0,"utf8")).services, bad=[];
    for (const [n,s] of Object.entries(svc)) for (const p of s.ports||[]) {
      if (n==="caddy" ? ![80,443].includes(Number(p.target)) : p.host_ip!=="127.0.0.1") bad.push(n+":"+p.target);
    }
    const c=(svc.caddy&&svc.caddy.ports||[]).map(p=>Number(p.target)).sort().join();
    if (c!=="443,80") bad.push("caddy publishes "+c);
    console.log(bad.join(" "))' || echo "config unreadable"
}
# Fake sign-in from a forged address. Each call uses its own identifier, so only the per-IP limit
# (20 per 15 minutes, auth.service.ts LIMITS.signInPerIp) can ever answer 429.
signin() { # base forged-address n
  curl -sk -o /dev/null -w '%{http_code}' -H 'content-type: application/json'     -H "X-Forwarded-For: $2" -H "X-Real-IP: $2"     -d "$(printf '{"identifier":"+216200%05d","password":"x"}' "$3")" "$1/v1/sessions"
}
reset_login_limits() {
  "${DC[@]}" exec -T redis redis-cli eval "for _,k in ipairs(redis.call('keys','rl:login-*')) do redis.call('del',k) end return 1" 0 >/dev/null
}
# Spends the per-IP limit with 20 calls, each claiming another address; prints the 429 count of those 20,
# then the answer of a 21st call that claims yet another address.
spend_limit() { # base
  local i early=0 c
  for i in $(seq 1 20); do c=$(signin "$1" "1.2.3.$i" "$i"); [ "$c" = 429 ] && early=$((early+1)); done
  echo "$early $(signin "$1" 9.9.9.9 99)"
}

# psql as a given login, from inside the compose network, against a given host
psql_as() { # user password host port sql
  "${DC[@]}" run --rm -T --no-deps -e PGPASSWORD="$2" --entrypoint psql db-setup \
    -h "$3" -p "$4" -U "$1" -d fastgo -Atc "$5" 2>&1 | tail -1
}

# 1. services healthy
for s in postgres pgbouncer redis s3 api ws worker web caddy; do
  st=$("${DC[@]}" ps --format '{{.Health}}' "$s")
  [ "$st" = healthy ] && ok "$s healthy" || bad "$s is '$st', expected healthy"
done


# ======================= staging override (./check.sh staging) =======================
if [ "$MODE" = staging ]; then
  FAKE_PW=fake-staging-password   # the plain value behind STAGING_PASSWORD_HASH in .env.staging.example (fake)
  S=(--resolve "$STAGING_DOMAIN:$HTTPS_PORT:127.0.0.1")
  SB="https://$STAGING_DOMAIN:$HTTPS_PORT"
  sc()  { code "${S[@]}" "$@"; }
  sh_() { hdrs "${S[@]}" "$@"; }
  AUTH=(-u "$STAGING_USER:$FAKE_PW")
  BADAUTH=(-u "$STAGING_USER:wrong-password")

  for p in /fr /v1/health /ws/health; do
    c=$(sc "$SB$p");              [ "$c" = 401 ] && ok "staging $p without credentials: 401" || bad "staging $p without credentials: $c, expected 401"
    c=$(sc "${BADAUTH[@]}" "$SB$p"); [ "$c" = 401 ] && ok "staging $p with a wrong password: 401" || bad "staging $p with a wrong password: $c, expected 401"
    c=$(sc "${AUTH[@]}" "$SB$p"); [ "$c" = 200 ] && ok "staging $p with the right credentials: 200" || bad "staging $p with the right credentials: $c, expected 200"
  done
  # a route that does not exist is refused too (basic_auth runs before routing, not per route)
  c=$(sc "$SB/v1/no-such-route"); [ "$c" = 401 ] && ok "staging unknown /v1 route without credentials: 401, not 404" || bad "staging unknown route: $c, expected 401"
  c=$(sc -X POST -H 'content-type: application/json' -d '{}' "$SB/v1/sessions"); [ "$c" = 401 ] && ok "staging POST /v1/sessions without credentials: 401" || bad "staging POST /v1/sessions: $c, expected 401"

  # X-Robots-Tag on every answer: 401, 200 and 404 alike
  for spec in "401 $SB/fr" "401 $SB/v1/health" "401 $SB/ws/health" "200 $SB/fr -u $STAGING_USER:$FAKE_PW" "200 $SB/v1/health -u $STAGING_USER:$FAKE_PW" "404 $SB/v1/no-such-route -u $STAGING_USER:$FAKE_PW" "404 $SB/fr/no-such-page -u $STAGING_USER:$FAKE_PW"; do
    set -- $spec; want=$1; shift
    h=$(sh_ "$@"); st=$(printf '%s' "$h" | head -1 | cut -d' ' -f2)
    if [ "$st" = "$want" ] && printf '%s\n' "$h" | grep -qi '^x-robots-tag: noindex, nofollow$'; then ok "staging answer $want $1 carries X-Robots-Tag: noindex, nofollow"
    else bad "staging answer (want $want, got $st) $1: X-Robots-Tag missing or wrong"; fi
  done
  r=$(curl -sk "${S[@]}" "${AUTH[@]}" "$SB/robots.txt")
  case "$r" in *"Disallow: /"*) ok "staging robots.txt disallows all" ;; *) bad "staging robots.txt: $r" ;; esac
  c=$(sc "$SB/robots.txt"); [ "$c" = 401 ] && ok "staging robots.txt is behind basic_auth too" || bad "staging robots.txt without credentials: $c"
  sh_ "${AUTH[@]}" "$SB/fr" | grep -qi '^strict-transport-security:' && ok "staging sends HSTS" || bad "staging: no HSTS"
  no_hdr server "${S[@]}" "$SB/fr" && ok "staging sends no Server header (also on the 401)" || bad "staging leaks a Server header (or gave no answer)"
  # twin of the 401 and noindex checks: the open (laptop) mode must answer 200 with no header. Ran once by hand
  # against the laptop stack in this PR; here, the wrong-password 401 and the 200 with the right one are each other's twin.

  # staging does not run db-setup, and Caddy is the only public port
  svcs=$("${DC[@]}" config --services)
  printf '%s\n' "$svcs" | grep -qx caddy && ! printf '%s\n' "$svcs" | grep -qx db-setup && ok "staging: db-setup is not part of the stack (setup profile off)" || bad "staging: db-setup is in the stack, or config unreadable"
  r=$("${DC[@]}" ps -a --format '{{.Service}}' | grep -cx db-setup); [ "$r" = 0 ] && ok "staging: db-setup container was never started" || bad "staging: db-setup ran"
  printf '%s\n' "$(COMPOSE_PROFILES=setup "${DC[@]}" config --services)" | grep -qx db-setup && ok "twin: with the setup profile on, db-setup does appear (so the check above can fail)" || bad "twin: setup profile did not add db-setup"
  r=$(CADDY_BIND=0.0.0.0 "${DC[@]}" config --format json | port_offenders)
  [ -z "$r" ] && ok "staging compose: only caddy publishes outside 127.0.0.1 (80 and 443)" || bad "staging compose: ports to fix: $r"
  # api, ws, web and worker publish nothing on staging: with TRUST_PROXY=1 a direct caller of the api could
  # claim any address. Read the config, then try the connection. Twins: the base (laptop) config does publish
  # api and web, and the probe does see Caddy's own listener.
  r=$("${DC[@]}" config --format json | app_ports); [ -z "$r" ] && ok "staging compose: api, ws, web and worker publish no host port" || bad "staging compose: app ports published: $r"
  r=$(docker compose -f compose.yaml --env-file "$ENVFILE" config --format json | app_ports)
  [ -n "$r" ] && ok "twin: the base config does publish app ports ($r), so the check above can fail" || bad "twin: app_ports found nothing in the base config"
  for p in "${API_PORT:-14000}" "${WEB_PORT:-13000}"; do
    listens "$p" && bad "staging: something listens on 127.0.0.1:$p (the api or web is reachable without Caddy)" || ok "staging: nothing listens on 127.0.0.1:$p"
  done
  listens "$HTTPS_PORT" && ok "twin: the probe sees Caddy's listener on $HTTPS_PORT, so 'nothing listens' can fail" || bad "twin: listens() cannot see the Caddy port $HTTPS_PORT"
  # the browser only opens its login box when the 401 asks for it: handle_errors must not drop WWW-Authenticate
  sh_ "$SB/fr" | grep -qi '^www-authenticate: *basic' && ok "staging 401 carries WWW-Authenticate: Basic (the browser opens the login box)" || bad "staging 401 has no WWW-Authenticate: Basic"
  sh_ "${AUTH[@]}" "$SB/fr" | grep -qi '^www-authenticate:' && bad "staging 200 carries WWW-Authenticate" || ok "twin: the 200 with credentials has no WWW-Authenticate (header check can tell the two apart)"
  r=$("${DC[@]}" exec -T api printenv TRUST_PROXY); [ "$r" = 1 ] && ok "staging api: TRUST_PROXY=1 (one hop: Caddy)" || bad "staging api TRUST_PROXY is '$r', expected 1"
  r=$("${DC[@]}" ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' | grep '^migrate '); [ "$r" = "migrate exited 0" ] && ok "staging: migrate exited 0" || bad "staging migrate: $r"
  exit $fail
fi

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
for s in migrate api ws worker web caddy; do
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


# 12. through Caddy (PR 3): /v1 reaches the api, /fr reaches web, /ws reaches the ws process, headers
r=$(curl -sk "$BASE/v1/health"); c=$(code "$BASE/v1/health")
{ [ "$c" = 200 ] && case "$r" in *'"status"'*) true ;; *) false ;; esac; } && ok "Caddy: /v1/health reaches the api (200, JSON)" || bad "Caddy /v1/health: $c $r"
r=$(curl -sk "$BASE/v1/no-such-route"); c=$(code "$BASE/v1/no-such-route")   # twin: web would answer an HTML 404
{ [ "$c" = 404 ] && case "$r" in *'"code"'*) true ;; *) false ;; esac; } && ok "Caddy: /v1/* never reaches web (the 404 is the api's JSON)" || bad "Caddy /v1/no-such-route: $c $r"
r=$(curl -sk "$BASE/fr"); c=$(code "$BASE/fr")
{ [ "$c" = 200 ] && case "$r" in *'<html'*) true ;; *) false ;; esac; } && ok "Caddy: /fr reaches web (200, HTML)" || bad "Caddy /fr: $c"
r=$(curl -sk "$BASE/ws/health"); c=$(code "$BASE/ws/health")
{ [ "$c" = 200 ] && case "$r" in *'"process":"ws"'*) true ;; *) false ;; esac; } && ok "Caddy: /ws/health reaches the ws process (prefix removed)" || bad "Caddy /ws/health: $c $r"
c=$(code "$BASE/ws/no-such-route")   # twin: the ws process answers its own 404, so /ws is not routed to web
[ "$c" = 404 ] && ok "Caddy: /ws/* unknown path is the ws process's 404" || bad "Caddy /ws/no-such-route: $c"
no_hdr server "$BASE/fr" && ok "Caddy sends no Server header" || bad "Caddy leaks a Server header (or gave no answer)"
has_hdr x-content-type-options "$BASE/fr" && ok "Caddy sets X-Content-Type-Options" || bad "Caddy: no X-Content-Type-Options"
no_hdr x-robots-tag "$BASE/fr" && ok "laptop (open mode) has no X-Robots-Tag: the header check can fail" || bad "laptop answers carry X-Robots-Tag (it is staging only)"

# 13. forged address (the main PR 3 check). The api limits sign-ins per IP, 20 per 15 minutes. A client
# that sends its own X-Forwarded-For must not change which address the api counts.
reset_login_limits
read -r early last <<<"$(spend_limit "$BASE")"
[ "$early" = 0 ] && ok "forged address via Caddy: 20 calls with 20 claimed addresses, none refused early" || bad "forged address via Caddy: $early of the first 20 refused"
[ "$last" = 429 ] && ok "forged address via Caddy: a 21st call with a new claimed address is refused (429)" || bad "forged address via Caddy: 21st call answered $last, expected 429"
[ "$(signin "$BASE" 8.8.8.8 98)" = 429 ] && ok "forged address via Caddy: still 429 with another claimed address" || bad "forged address via Caddy: another address got through"
# Twin: the same calls straight to the api (no Caddy), which trusts one hop. The forged value is then the
# address the api counts, so the 21st call with a new value gets through. If this twin ever stops
# passing, the check above proves nothing. (Caddy's header_up is what stands between the two.)
reset_login_limits
read -r early last <<<"$(spend_limit "http://127.0.0.1:${API_PORT}")"
[ "$early" = 0 ] && [ "$last" != 429 ] && ok "twin: straight to the api, the claimed address is trusted (21st call answered $last, not 429)" || bad "twin: straight to the api the forged address did not get through ($early early, 21st $last)"
reset_login_limits

# 14. only Caddy publishes a port outside 127.0.0.1 (read from the resolved compose file)
r=$(CADDY_BIND=0.0.0.0 "${DC[@]}" config --format json | port_offenders)
[ -z "$r" ] && ok "compose: only caddy publishes outside 127.0.0.1 (80 and 443), checked with CADDY_BIND=0.0.0.0" || bad "compose: ports to fix: $r"
r=$(CADDY_BIND=0.0.0.0 "${DC[@]}" config --format json | node -e '
  const j=JSON.parse(require("fs").readFileSync(0,"utf8")); delete j.services.postgres.ports[0].host_ip; console.log(JSON.stringify(j))' | port_offenders)
[ "$r" = "postgres:5432" ] && ok "twin: postgres published without 127.0.0.1 is reported" || bad "twin: the port check did not report a public postgres (got '$r')"

exit $fail
