#!/usr/bin/env bash
# GOFAST staging deploy: the ONE command the `deploy` SSH user may run (#14 PR 4).
# Installed by setup.sh at /opt/gofast/deploy.sh (root:root 755) and forced in authorized_keys:
#   command="/opt/gofast/deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding
# The client's request arrives in SSH_ORIGINAL_COMMAND. Only two forms are accepted, and anything else is
# refused BEFORE any action (RV-22): `deploy <40 lowercase hex chars>` and `rollback`.
#
# Exit codes: 0 done and healthy; 1 refused, failed with nothing changed, or failed and rolled back;
#             2 failed and the rollback failed too (look at the server).
# Rollback is CODE ONLY: migrations are forward only (expand, then contract in a later release).
#
# Never `set -x` here: the pull token and the health-check password pass through this script.
# `GOFAST_ROOT` exists for the tests; sshd does not carry client environment variables into a forced command.
set -uo pipefail
umask 077

ROOT="${GOFAST_ROOT:-/opt/gofast}"
SEC="$ROOT/secrets"
ST="$ROOT/state"
REPO="$ROOT/repo"

say() { printf '%s\n' "$*"; }
refuse() { say "refused: $*"; exit 1; }
die() { say "error: $*"; exit 1; }

# --- 1. The command. Nothing else runs until this passes.
cmd="${SSH_ORIGINAL_COMMAND-}"
action=""; sha=""
case "$cmd" in
  rollback) action=rollback ;;
  "deploy "*) sha="${cmd#deploy }"; if [ "${#sha}" -eq 40 ] && [[ "$sha" != *[!0123456789abcdef]* ]]; then action=deploy; fi ;; # MUT-validate
esac
[ -n "$action" ] || refuse "only 'deploy <40-hex sha>' and 'rollback' are allowed"

# --- 2. Configuration, read as data (never sourced). Checked before the first docker call.
GHCR_OWNER=""; GHCR_USER=""; REPO_URL=""
[ -r "$ROOT/deploy.env" ] || die "missing $ROOT/deploy.env"
while IFS='=' read -r k v; do
  case "$k" in GHCR_OWNER) GHCR_OWNER=$v ;; GHCR_USER) GHCR_USER=$v ;; REPO_URL) REPO_URL=$v ;; *) ;; esac
done < "$ROOT/deploy.env"
[[ "$GHCR_OWNER" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "GHCR_OWNER in deploy.env must be a plain lowercase name" # MUT-owner
[[ "$GHCR_USER" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || die "GHCR_USER in deploy.env is missing or not a plain login"
[[ "$REPO_URL" =~ ^https://[A-Za-z0-9./_-]+$ ]] || die "REPO_URL in deploy.env must be a plain https URL"

DOMAIN=""; BASIC_USER=""; PORT=443
[ -r "$SEC/staging.env" ] || die "missing $SEC/staging.env"
while IFS='=' read -r k v; do
  case "$k" in STAGING_DOMAIN) DOMAIN=$v ;; STAGING_USER) BASIC_USER=$v ;; HTTPS_PORT) PORT=$v ;; *) ;; esac
done < "$SEC/staging.env"
[[ "$DOMAIN" =~ ^[a-z0-9][a-z0-9.-]*$ ]] || die "STAGING_DOMAIN in staging.env is missing or invalid"
[[ "$BASIC_USER" =~ ^[A-Za-z0-9_.-]+$ ]] || die "STAGING_USER in staging.env is missing or invalid"
[[ "$PORT" =~ ^[0-9]{2,5}$ ]] || die "HTTPS_PORT in staging.env is invalid"
[ -r "$SEC/ghcr-token" ] || die "missing the GHCR pull token file"
[ -r "$SEC/staging-basic-password" ] || die "missing the staging basic-auth password file"

# --- 3. One deploy at a time. A second one is refused, never interleaved.
mkdir -p "$ST" || die "cannot create $ST"
exec 9> "$ST/lock" || die "cannot open the lock"
flock -n 9 || refuse "another deploy is already running" # MUT-nolock

cur=$(head -n 1 "$ST/current" 2>/dev/null || true)
prev=$(head -n 1 "$ST/previous" 2>/dev/null || true)
if [ "$action" = rollback ]; then
  [ -n "$prev" ] || refuse "no previous release to roll back to" # MUT-noprevious
  sha="$prev"
fi

# --- 4. The code. The compose files come from this checkout, so the sha must be a commit of main:
# a commit that only exists in a fork can be fetched by hash, and must never be deployed.
[ -d "$REPO/.git" ] || git clone --quiet "$REPO_URL" "$REPO" || die "cannot clone the repository"
git -C "$REPO" fetch --quiet origin main || die "cannot fetch main"
git -C "$REPO" merge-base --is-ancestor "$sha" origin/main || refuse "$sha is not a commit of main" # MUT-ancestor

# --- 5. Registry login with the READ-ONLY pull token, on stdin (never in an argument), in a throwaway config
# directory that is deleted on exit, so the token is not left on disk.
DOCKER_CONFIG=$(mktemp -d) || die "cannot create a temporary directory"
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
docker login ghcr.io -u "$GHCR_USER" --password-stdin < "$SEC/ghcr-token" > /dev/null || die "registry login failed" # MUT-tokenargv

# Pull both images, then put that commit's compose files in place. Fails here change nothing.
prepare() { # sha
  docker pull "ghcr.io/$GHCR_OWNER/gofast-api:$1" > /dev/null || return 1
  docker pull "ghcr.io/$GHCR_OWNER/gofast-web:$1" > /dev/null || return 1
  git -C "$REPO" checkout --quiet --detach "$1" || return 1
}

# Both pages through Caddy, past the staging basic-auth wall. The password goes to curl on stdin as a config
# line, so it is in no argument list. TLS is checked normally; --resolve points the real name at this host.
probe() { # path -> http code
  local pw; pw=$(head -n 1 "$SEC/staging-basic-password"); pw=${pw//\\/\\\\}; pw=${pw//\"/\\\"}
  printf 'user = "%s:%s"\n' "$BASIC_USER" "$pw" |
    curl -K - -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$DOMAIN:$PORT:127.0.0.1" "https://$DOMAIN:$PORT$1"
}
healthy() {
  local i
  for ((i = 1; i <= ${HEALTH_TRIES:-12}; i++)); do
    if [ "$(probe /v1/health)" = 200 ] && [ "$(probe /fr)" = 200 ]; then return 0; fi
    sleep "${HEALTH_SLEEP:-5}"
  done
  return 1
}

# Start the stack on that sha (the migrate service runs first and the others wait for it), then check it.
switch() { # sha
  API_IMAGE="ghcr.io/$GHCR_OWNER/gofast-api:$1" WEB_IMAGE="ghcr.io/$GHCR_OWNER/gofast-web:$1" \
    docker compose --project-directory "$REPO/infra/compose" \
      -f "$REPO/infra/compose/compose.yaml" -f "$REPO/infra/compose/compose.staging.yaml" \
      --env-file "$SEC/staging.env" up -d --wait --no-build > /dev/null || return 1
  healthy
}

say "deploying ${sha:0:12}"
prepare "$sha" || die "could not pull or check out ${sha:0:12}; nothing changed"

if ! switch "$sha"; then
  if [ -n "$cur" ] && [ "$cur" != "$sha" ]; then # MUT-norollback
    say "health check failed: rolling back to ${cur:0:12}"
    if prepare "$cur" && switch "$cur"; then
      say "rolled back to ${cur:0:12} (code only; migrations are not undone)"
      exit 1
    fi
    say "rollback to ${cur:0:12} failed too: the server needs a look"
    exit 2
  fi
  say "health check failed and there is nothing to roll back to (first deploy)"
  exit 1
fi

# Healthy: the old release becomes `previous` (unless it is the same sha again).
if [ -n "$cur" ] && [ "$cur" != "$sha" ]; then printf '%s\n' "$cur" > "$ST/previous"; fi
printf '%s\n' "$sha" > "$ST/current" # MUT-nostate
say "deployed ${sha:0:12}"
exit 0
