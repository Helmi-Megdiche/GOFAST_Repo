#!/usr/bin/env bash
# GOFAST staging deploy: the ONE command the `deploy` SSH user may run (#14 PR 4).
# Installed by setup.sh at /opt/gofast/deploy.sh (root:root 755) and forced in authorized_keys:
#   restrict,command="/opt/gofast/deploy.sh"
# The client's request arrives in SSH_ORIGINAL_COMMAND. Only two forms are accepted, and anything else is
# refused BEFORE any action (RV-22):
#   `deploy <40-hex commit> <api sha256:64hex> <web sha256:64hex>`   and   `rollback`
# Images are pulled and run by DIGEST only (image@sha256:...): a tag can be moved, a digest cannot, so what CI
# built and tested is exactly what runs. The commit, and both digests, are kept in state/current and
# state/previous, one line each, so a rollback also runs by digest.
# RV-25: CI runs finish in any order, so an older commit is refused when a newer one is already running.
# After the pulls, both images must carry the revision label of that commit, else refused before `compose up`.
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
action=""; sha=""; api=""; web=""
re_deploy='^deploy ([0-9a-f]{40}) (sha256:[0-9a-f]{64}) (sha256:[0-9a-f]{64})$' # MUT-digest
if [ "$cmd" = rollback ]; then action=rollback
elif [[ "$cmd" =~ $re_deploy ]]; then action=deploy; sha=${BASH_REMATCH[1]}; api=${BASH_REMATCH[2]}; web=${BASH_REMATCH[3]} # MUT-validate
fi
[ -n "$action" ] || refuse "only 'deploy <40-hex sha> <api sha256:digest> <web sha256:digest>' and 'rollback' are allowed"

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

# A release record is one line: "<sha> <api digest> <web digest>". A damaged record stops everything.
re_rec='^([0-9a-f]{40}) (sha256:[0-9a-f]{64}) (sha256:[0-9a-f]{64})$'
split_rec() { # record -> R_SHA R_API R_WEB (all empty for an empty record)
  R_SHA=""; R_API=""; R_WEB=""
  [ -n "$1" ] || return 0
  [[ "$1" =~ $re_rec ]] || return 1 # MUT-staterec
  R_SHA=${BASH_REMATCH[1]}; R_API=${BASH_REMATCH[2]}; R_WEB=${BASH_REMATCH[3]}
}
cur_rec=$(head -n 1 "$ST/current" 2>/dev/null || true)
prev_rec=$(head -n 1 "$ST/previous" 2>/dev/null || true)
split_rec "$cur_rec" || die "state/current is not a release record (sha and two digests)"
cur=$R_SHA; cur_api=$R_API; cur_web=$R_WEB
split_rec "$prev_rec" || die "state/previous is not a release record (sha and two digests)"
if [ "$action" = rollback ]; then
  [ -n "$R_SHA" ] || refuse "no previous release to roll back to" # MUT-noprevious
  sha=$R_SHA; api=$R_API; web=$R_WEB
fi

# --- 4. The code. The compose files come from this checkout, so the sha must be a commit of main:
# a commit that only exists in a fork can be fetched by hash, and must never be deployed.
[ -d "$REPO/.git" ] || git clone --quiet "$REPO_URL" "$REPO" || die "cannot clone the repository"
git -C "$REPO" fetch --quiet origin main || die "cannot fetch main"
git -C "$REPO" merge-base --is-ancestor "$sha" origin/main || refuse "$sha is not a commit of main" # MUT-ancestor
# RV-25: never let an older commit replace a newer one (CI runs finish in any order). The same sha is fine.
# `rollback` is the deliberate way back, so it skips this.
if [ "$action" = deploy ] && [ -n "$cur" ] && [ "$cur" != "$sha" ]; then
  git -C "$REPO" merge-base --is-ancestor "$cur" "$sha" || refuse "${sha:0:12} is older than current ${cur:0:12}, use rollback" # MUT-older
fi

# --- 5. Registry login with the READ-ONLY pull token, on stdin (never in an argument), in a throwaway config
# directory that is deleted on exit, so the token is not left on disk.
DOCKER_CONFIG=$(mktemp -d) || die "cannot create a temporary directory"
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
docker login ghcr.io -u "$GHCR_USER" --password-stdin < "$SEC/ghcr-token" > /dev/null || die "registry login failed" # MUT-tokenargv

# Pull both images, then put that commit's compose files in place. Fails here change nothing.
img() { printf 'ghcr.io/%s/gofast-%s@%s' "$GHCR_OWNER" "$1" "$2"; } # name digest: the only image form ever pulled or run # MUT-pulltag
# The commit a pulled image says it was built from (CI sets this label on both images). A digest and a commit
# arrive as separate words, so a valid commit of main could be paired with another real image of the same owner;
# the label ties each digest to the commit. It is not proof against a forged build (that needs signing, L2).
rev_of() { docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1" 2> /dev/null; }
prepare() { # sha api-digest web-digest
  docker pull "$(img api "$2")" > /dev/null || return 1
  docker pull "$(img web "$3")" > /dev/null || return 1
  [ "$(rev_of "$(img api "$2")")" = "$1" ] || { say "refused: the api image is not built from ${1:0:12}"; return 1; } # MUT-labelapi
  [ "$(rev_of "$(img web "$3")")" = "$1" ] || { say "refused: the web image is not built from ${1:0:12}"; return 1; } # MUT-labelweb
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
switch() { # api-digest web-digest
  API_IMAGE="$(img api "$1")" WEB_IMAGE="$(img web "$2")" \
    docker compose --project-directory "$REPO/infra/compose" \
      -f "$REPO/infra/compose/compose.yaml" -f "$REPO/infra/compose/compose.staging.yaml" \
      --env-file "$SEC/staging.env" up -d --wait --no-build > /dev/null || return 1
  healthy
}

say "deploying ${sha:0:12}"
prepare "$sha" "$api" "$web" || die "could not pull or check out ${sha:0:12}; nothing changed"

if ! switch "$api" "$web"; then
  if [ -n "$cur" ] && [ "$cur" != "$sha" ]; then # MUT-norollback
    say "health check failed: rolling back to ${cur:0:12}"
    if prepare "$cur" "$cur_api" "$cur_web" && switch "$cur_api" "$cur_web"; then
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
if [ -n "$cur" ] && [ "$cur" != "$sha" ]; then printf '%s\n' "$cur_rec" > "$ST/previous"; fi
printf '%s %s %s\n' "$sha" "$api" "$web" > "$ST/current" # MUT-nostate
say "deployed ${sha:0:12}"
exit 0
