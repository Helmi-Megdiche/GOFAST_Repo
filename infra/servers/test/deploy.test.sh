#!/usr/bin/env bash
# shellcheck disable=SC2016  # the single-quoted bash -c bodies are meant to expand in the child shell
# Tests for infra/servers/deploy.sh (#14 PR 4). Shell only: fake docker, curl and git on PATH record every call.
# Run: bash infra/servers/test/deploy.test.sh        (needs bash and flock; works on ubuntu and the CI runner)
# RV-12: the suite is also run against broken copies of deploy.sh ("twins"); each broken copy MUST make it fail.
# Fake values only: no real host, domain, key or token appears here.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
REAL="${DEPLOY_SH:-$HERE/../deploy.sh}"
A=$(printf 'a%.0s' $(seq 40)); B=$(printf 'b%.0s' $(seq 40)); C=$(printf 'c%.0s' $(seq 40))
TOKEN="FAKE-PULL-TOKEN-VALUE"; PW="fake-basic-password"; DOMAIN="staging.example.invalid"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0; VERBOSE=1

check() { # name, then a command that must succeed
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then pass=$((pass+1)); [ "$VERBOSE" = 1 ] && echo "  ok   $name"
  else fail=$((fail+1)); [ "$VERBOSE" = 1 ] && echo "  FAIL $name"; fi
  return 0
}

new_env() { # fresh server root, fake bin, empty call log
  T=$(mktemp -d "$TMP/t.XXXX"); ROOT="$T/root"; BIN="$T/bin"; CALLS="$T/calls"; : > "$CALLS"
  mkdir -p "$ROOT/secrets" "$ROOT/state" "$ROOT/repo/.git" "$BIN"
  printf 'GHCR_OWNER=owner-x\nGHCR_USER=user-x\nREPO_URL=https://example.invalid/repo.git\n' > "$ROOT/deploy.env"
  printf '%s\n' "$TOKEN" > "$ROOT/secrets/ghcr-token"
  printf '%s\n' "$PW" > "$ROOT/secrets/staging-basic-password"
  printf 'STAGING_DOMAIN=%s\nSTAGING_USER=gofast\nHTTPS_PORT=18443\n' "$DOMAIN" > "$ROOT/secrets/staging.env"
  cat > "$BIN/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "$CALLS"
case "$1" in
  login) cat > /dev/null ;;
  pull) if [ -n "${FAKE_PULL_FAIL:-}" ] && [[ "$*" == *"$FAKE_PULL_FAIL"* ]]; then exit 1; fi ;;
  compose) if [[ " $* " == *" up "* ]]; then echo "up API_IMAGE=$API_IMAGE WEB_IMAGE=$WEB_IMAGE" >> "$CALLS"; echo "$API_IMAGE" > "$FAKE_LAST_UP"; fi ;;
esac
exit 0
EOF
  cat > "$BIN/curl" <<'EOF'
#!/usr/bin/env bash
cat > /dev/null
echo "curl $*" >> "$CALLS"
last=$(cat "$FAKE_LAST_UP" 2>/dev/null || true)
if [ -n "${FAKE_HEALTH_FAIL:-}" ] && [[ "$last" == *"$FAKE_HEALTH_FAIL" ]]; then printf 503; else printf 200; fi
EOF
  cat > "$BIN/git" <<'EOF'
#!/usr/bin/env bash
echo "git $*" >> "$CALLS"
case " $* " in
  *" merge-base "*) if [ -n "${FAKE_NOT_ON_MAIN:-}" ] && [[ "$*" == *"$FAKE_NOT_ON_MAIN"* ]]; then exit 1; fi ;;
  *" clone "*) mkdir -p "${!#}/.git" ;;
esac
exit 0
EOF
  chmod +x "$BIN"/*
}

run_deploy() { # script, command ("UNSET" leaves SSH_ORIGINAL_COMMAND unset); sets OUT and RC; extra env via EXTRA
  local script="$1" cmd="$2"
  local -a envv=(PATH="$BIN:$PATH" GOFAST_ROOT="$ROOT" CALLS="$CALLS" FAKE_LAST_UP="$T/lastup" HEALTH_TRIES=2 HEALTH_SLEEP=0)
  [ "$cmd" = UNSET ] || envv+=("SSH_ORIGINAL_COMMAND=$cmd")
  # shellcheck disable=SC2086
  OUT=$(env -i "${envv[@]}" ${EXTRA:-} bash "$script" 2>&1); RC=$?
}

state() { cat "$ROOT/state/$1" 2>/dev/null || true; }
set_state() { printf '%s\n' "$2" > "$ROOT/state/$1"; }
has_call() { grep -qF -- "$1" "$CALLS"; }
no_secret_leak() { ! grep -qF -e "$TOKEN" -e "$PW" "$CALLS" && ! printf '%s' "$OUT" | grep -qF -e "$TOKEN" -e "$PW" -e "$DOMAIN"; }

suite() { # script
  local s="$1" bad c i holder
  # 1. Refused before any action: one loop over every bad command (RV-12).
  bad=("" "deploy" "deploy " "deploy abc" "deploy ${A:0:39}" "deploy ${A}a" "deploy ${A^^}" "deploy $A;id" "deploy $A extra"
       "deploy  $A" " deploy $A" "deploy $A"$'\n' "deploy $A"$'\nid' "deploy"$'\t'"$A" "rollback now" "rollback;id" "rollback "
       "ls" "docker ps" "deploy $A && id" 'deploy $(id)' "deploy ../$A" "bash" "scp -t /tmp")
  i=0
  for c in "${bad[@]}"; do
    i=$((i+1)); new_env; set_state current "$A"; set_state previous "$B"
    run_deploy "$s" "$c"
    check "refuse #$i: $(printf '%q' "$c")" bash -c '[ "$1" = 1 ] && [ ! -s "$2" ] && [[ "$3" == *refused* ]]' _ "$RC" "$CALLS" "$OUT"
    check "refuse #$i leaves state alone" bash -c '[ "$(cat "$1/current")" = "$2" ] && [ "$(cat "$1/previous")" = "$3" ]' _ "$ROOT/state" "$A" "$B"
  done
  new_env; run_deploy "$s" UNSET
  check "no SSH_ORIGINAL_COMMAND (an interactive login) is refused, no call" bash -c '[ "$1" = 1 ] && [ ! -s "$2" ]' _ "$RC" "$CALLS"

  # 2. Good deploy, first ever.
  new_env; run_deploy "$s" "deploy $A"
  check "first deploy: exit 0" test "$RC" = 0
  check "first deploy: current is the sha" test "$(state current)" = "$A"
  check "first deploy: no previous yet" test -z "$(state previous)"
  check "first deploy: pulls the api image tagged with the full sha" has_call "docker pull ghcr.io/owner-x/gofast-api:$A"
  check "first deploy: pulls the web image tagged with the full sha" has_call "docker pull ghcr.io/owner-x/gofast-web:$A"
  check "first deploy: compose up uses both tags" has_call "up API_IMAGE=ghcr.io/owner-x/gofast-api:$A WEB_IMAGE=ghcr.io/owner-x/gofast-web:$A"
  check "first deploy: staging override, --wait, no build" bash -c 'grep -q "compose.staging.yaml" "$1" && grep -q -- "--wait" "$1" && grep -q -- "--no-build" "$1"' _ "$CALLS"
  check "first deploy: checks /v1/health and /fr" bash -c 'grep -q "/v1/health" "$1" && grep -q "/fr" "$1"' _ "$CALLS"
  check "first deploy: login is on stdin (no -p, no token in a call)" bash -c 'grep -q "docker login ghcr.io -u user-x --password-stdin" "$1"' _ "$CALLS"
  check "first deploy: neither token, password nor domain in any call or output" no_secret_leak
  check "first deploy: code is checked out after the pull" bash -c 'p=$(grep -n "docker pull" "$1" | head -1 | cut -d: -f1); c=$(grep -n "checkout" "$1" | head -1 | cut -d: -f1); [ "$p" -lt "$c" ]' _ "$CALLS"

  # 3. Second deploy moves current to previous; the same sha again keeps previous.
  new_env; set_state current "$A"; run_deploy "$s" "deploy $B"
  check "second deploy: current B, previous A" bash -c '[ "$1" = 0 ] && [ "$2" = "$3" ] && [ "$4" = "$5" ]' _ "$RC" "$(state current)" "$B" "$(state previous)" "$A"
  run_deploy "$s" "deploy $B"
  check "same sha again: previous is not overwritten" bash -c '[ "$1" = "$2" ] && [ "$3" = "$4" ]' _ "$(state current)" "$B" "$(state previous)" "$A"

  # 4. Failed health check: roll back to what was running, exit non-zero.
  new_env; set_state current "$B"; set_state previous "$A"
  EXTRA="FAKE_HEALTH_FAIL=$C" run_deploy "$s" "deploy $C"
  check "failed health: exit non-zero" test "$RC" != 0
  check "failed health: tried the new sha first" has_call "up API_IMAGE=ghcr.io/owner-x/gofast-api:$C"
  check "failed health: then brought back the running sha" bash -c 'grep "^up " "$1" | tail -1 | grep -q "gofast-api:$2 "' _ "$CALLS" "$B"
  check "failed health: state unchanged (current B, previous A)" bash -c '[ "$1" = "$2" ] && [ "$3" = "$4" ]' _ "$(state current)" "$B" "$(state previous)" "$A"
  check "failed health: says it rolled back" bash -c '[[ "$1" == *"rolled back"* ]]' _ "$OUT"
  new_env; EXTRA="FAKE_HEALTH_FAIL=$A" run_deploy "$s" "deploy $A"
  check "first deploy failing: exit non-zero, nothing to roll back to, no state written" bash -c '[ "$1" != 0 ] && [[ "$2" == *"nothing to roll back"* ]] && [ ! -e "$3/current" ]' _ "$RC" "$OUT" "$ROOT/state"

  # 5. rollback command.
  new_env; set_state current "$B"; run_deploy "$s" rollback
  check "rollback without previous: refused, exit 1, zero calls" bash -c '[ "$1" = 1 ] && [ ! -s "$2" ] && [[ "$3" == *refused* ]]' _ "$RC" "$CALLS" "$OUT"
  new_env; run_deploy "$s" rollback
  check "rollback with no state at all: refused, zero calls" bash -c '[ "$1" = 1 ] && [ ! -s "$2" ]' _ "$RC" "$CALLS"
  new_env; set_state current "$B"; set_state previous "$A"; run_deploy "$s" rollback
  check "rollback: exit 0, current A, previous B" bash -c '[ "$1" = 0 ] && [ "$2" = "$3" ] && [ "$4" = "$5" ]' _ "$RC" "$(state current)" "$A" "$(state previous)" "$B"
  check "rollback: compose up with the previous images" has_call "up API_IMAGE=ghcr.io/owner-x/gofast-api:$A"

  # 6. A sha that is not on main is refused before any docker call (a fork commit can be fetched by hash).
  new_env; set_state current "$A"; EXTRA="FAKE_NOT_ON_MAIN=$B" run_deploy "$s" "deploy $B"
  check "sha not on main: refused, no docker call, state unchanged" bash -c '[ "$1" != 0 ] && ! grep -q "^docker" "$2" && [ "$(cat "$3/current")" = "$4" ]' _ "$RC" "$CALLS" "$ROOT/state" "$A"

  # 7. Pull failure changes nothing.
  new_env; set_state current "$A"; EXTRA="FAKE_PULL_FAIL=$B" run_deploy "$s" "deploy $B"
  check "pull failure: exit non-zero, no compose up, state unchanged" bash -c '[ "$1" != 0 ] && ! grep -q "^up " "$2" && [ "$(cat "$3/current")" = "$4" ]' _ "$RC" "$CALLS" "$ROOT/state" "$A"

  # 8. Not configured: refuse before docker.
  new_env; printf 'GHCR_USER=user-x\n' > "$ROOT/deploy.env"; run_deploy "$s" "deploy $A"
  check "deploy.env without GHCR_OWNER: exit non-zero, zero docker calls" bash -c '[ "$1" != 0 ] && ! grep -q "^docker" "$2"' _ "$RC" "$CALLS"
  new_env; printf 'GHCR_OWNER=Bad/Owner\nGHCR_USER=user-x\nREPO_URL=https://example.invalid/r.git\n' > "$ROOT/deploy.env"; run_deploy "$s" "deploy $A"
  check "an owner that is not a plain lowercase name is refused, zero docker calls" bash -c '[ "$1" != 0 ] && ! grep -q "^docker" "$2"' _ "$RC" "$CALLS"

  # 9. Two deploys at once: the second is refused, nothing runs.
  new_env; ( flock 9; sleep 4 ) 9> "$ROOT/state/lock" & holder=$!; sleep 0.6
  run_deploy "$s" "deploy $A"; kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null
  check "a deploy already running: refused, zero calls" bash -c '[ "$1" != 0 ] && [ ! -s "$2" ]' _ "$RC" "$CALLS"

  # 10. First run clones the repo; later runs do not.
  new_env; rmdir "$ROOT/repo/.git" "$ROOT/repo"; run_deploy "$s" "deploy $A"
  check "no checkout yet: clones once" has_call "git clone"
  new_env; run_deploy "$s" "deploy $A"
  check "checkout present: no clone" bash -c '! grep -q "git clone" "$1"' _ "$CALLS"
}

# ---- twins: broken copies of deploy.sh. Each marker is a comment at the end of the line it breaks.
mutate() { # marker, replacement line, output file
  local marker="$1" repl="$2" out="$3" line n=0
  : > "$out"
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" == *"# MUT-$marker"* ]]; then printf '%s\n' "$repl" >> "$out"; n=$((n+1)); else printf '%s\n' "$line" >> "$out"; fi
  done < "$REAL"
  [ "$n" -ge 1 ]
}

echo "== deploy.sh against the suite"
suite "$REAL"
real_fail=$fail
echo "   $pass ok, $fail failed"

twin_fail=0
echo "== twins: each broken copy of deploy.sh must make the suite fail"
declare -a TWINS=(
  'validate|  "deploy "*) action=deploy; sha="${cmd#deploy }" ;;'
  'norollback|if false; then'
  'noprevious|:'
  'nostate|:'
  'ancestor|:'
  'tokenargv|docker login ghcr.io -u "$GHCR_USER" -p "$(cat "$SEC/ghcr-token")" > /dev/null'
  'nolock|:'
  'owner|:'
)
for t in "${TWINS[@]}"; do
  name=${t%%|*}; repl=${t#*|}
  if ! mutate "$name" "$repl" "$TMP/mut-$name.sh"; then echo "  FAIL twin $name: marker MUT-$name not found in deploy.sh"; twin_fail=$((twin_fail+1)); continue; fi
  pass=0; fail=0; VERBOSE=0; suite "$TMP/mut-$name.sh"; VERBOSE=1
  if [ "$fail" -gt 0 ]; then echo "  ok   twin $name fails the suite as it must ($fail checks failed)"
  else echo "  FAIL twin $name: the suite still passes on the broken copy"; twin_fail=$((twin_fail+1)); fi
done

echo "== result: suite failures $real_fail, twins that did not fail $twin_fail"
[ "$real_fail" -eq 0 ] && [ "$twin_fail" -eq 0 ]
