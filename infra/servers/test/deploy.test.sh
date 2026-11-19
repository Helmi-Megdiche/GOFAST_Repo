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
# One api digest and one web digest per commit (fake, one repeated hex digit). A state record is "<sha> <api> <web>".
AD="sha256:$(printf '1%.0s' $(seq 64))"; AW="sha256:$(printf '2%.0s' $(seq 64))"
BD="sha256:$(printf '3%.0s' $(seq 64))"; BW="sha256:$(printf '4%.0s' $(seq 64))"
CD="sha256:$(printf '5%.0s' $(seq 64))"; CW="sha256:$(printf '6%.0s' $(seq 64))"
RA="$A $AD $AW"; RB="$B $BD $BW"
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
  # FAKE_NOT_ANCESTOR="<x>,<y>": `git merge-base --is-ancestor <x> <y>` says no, every other ancestor question says yes.
  cat > "$BIN/git" <<'EOF'
#!/usr/bin/env bash
echo "git $*" >> "$CALLS"
case " $* " in
  *" merge-base "*) if [ -n "${FAKE_NOT_ANCESTOR:-}" ] && [[ "$*" == *"--is-ancestor ${FAKE_NOT_ANCESTOR//,/ }" ]]; then exit 1; fi ;;
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
img() { printf 'ghcr.io/owner-x/gofast-%s@%s' "$1" "$2"; } # name digest: the only form that may be pulled or run

suite() { # script
  local s="$1" bad c i holder
  # 1. Refused before any action: one loop over every bad command (RV-12). Zero calls of any kind.
  bad=("" "deploy" "deploy " "deploy abc" "deploy ${A:0:39}" "deploy ${A}a" "deploy ${A^^}" "deploy $A;id" "deploy $A extra"
       "deploy  $A" " deploy $A" "deploy $A"$'\n' "deploy $A"$'\nid' "deploy"$'\t'"$A" "rollback now" "rollback;id" "rollback "
       "ls" "docker ps" "deploy $A && id" 'deploy $(id)' "deploy ../$A" "bash" "scp -t /tmp"
       # the commit alone, or with one digest, is no longer a command
       "deploy $A" "deploy $A $AD" "deploy $A $AD $AW extra" "deploy $A $AD $AW "$'\n' "deploy $A $AD;id $AW" "deploy $A $AD  $AW"
       # a digest must be sha256: and exactly 64 lowercase hex characters
       "deploy $A tag:latest $AW" "deploy $A latest $AW" "deploy $A $AD latest" "deploy $A ${AD}0 $AW" "deploy $A ${AD%?} $AW"
       "deploy $A ${AD^^} $AW" "deploy $A sha1:${AD#sha256:} $AW" "deploy $A ${AD/1/g} $AW" "deploy $A $AD ${AW/2/G}" "deploy $A @$AD $AW"
       "deploy $A $AD $AW@$BD")
  i=0
  for c in "${bad[@]}"; do
    i=$((i+1)); new_env; set_state current "$RB"; set_state previous "$RA"
    run_deploy "$s" "$c"
    check "refuse #$i: $(printf '%q' "$c")" bash -c '[ "$1" = 1 ] && [ ! -s "$2" ] && [[ "$3" == *refused* ]]' _ "$RC" "$CALLS" "$OUT"
    check "refuse #$i leaves state alone" bash -c '[ "$(cat "$1/current")" = "$2" ] && [ "$(cat "$1/previous")" = "$3" ]' _ "$ROOT/state" "$RB" "$RA"
  done
  new_env; run_deploy "$s" UNSET
  check "no SSH_ORIGINAL_COMMAND (an interactive login) is refused, no call" bash -c '[ "$1" = 1 ] && [ ! -s "$2" ]' _ "$RC" "$CALLS"

  # 2. Good deploy, first ever.
  new_env; run_deploy "$s" "deploy $A $AD $AW"
  check "first deploy: exit 0" test "$RC" = 0
  check "first deploy: current holds the sha and both digests" test "$(state current)" = "$RA"
  check "first deploy: no previous yet" test -z "$(state previous)"
  check "first deploy: pulls the api image by digest" has_call "docker pull $(img api "$AD")"
  check "first deploy: pulls the web image by digest" has_call "docker pull $(img web "$AW")"
  check "first deploy: nothing is pulled by tag" bash -c '! grep "^docker pull" "$1" | grep -q "gofast-[a-z]*:"' _ "$CALLS"
  check "first deploy: compose up runs the digests, not tags" has_call "up API_IMAGE=$(img api "$AD") WEB_IMAGE=$(img web "$AW")"
  check "first deploy: staging override, --wait, no build" bash -c 'grep -q "compose.staging.yaml" "$1" && grep -q -- "--wait" "$1" && grep -q -- "--no-build" "$1"' _ "$CALLS"
  check "first deploy: checks /v1/health and /fr" bash -c 'grep -q "/v1/health" "$1" && grep -q "/fr" "$1"' _ "$CALLS"
  check "first deploy: login is on stdin (no -p, no token in a call)" bash -c 'grep -q "docker login ghcr.io -u user-x --password-stdin" "$1"' _ "$CALLS"
  check "first deploy: neither token, password nor domain in any call or output" no_secret_leak
  check "first deploy: code is checked out after the pull" bash -c 'p=$(grep -n "docker pull" "$1" | head -1 | cut -d: -f1); c=$(grep -n "checkout" "$1" | head -1 | cut -d: -f1); [ "$p" -lt "$c" ]' _ "$CALLS"

  # 3. Second deploy moves current to previous; the same sha again keeps previous.
  new_env; set_state current "$RA"; run_deploy "$s" "deploy $B $BD $BW"
  check "second deploy: current B, previous A, digests kept with them" bash -c '[ "$1" = 0 ] && [ "$2" = "$3" ] && [ "$4" = "$5" ]' _ "$RC" "$(state current)" "$RB" "$(state previous)" "$RA"
  run_deploy "$s" "deploy $B $BD $BW"
  check "same sha again: previous is not overwritten" bash -c '[ "$1" = "$2" ] && [ "$3" = "$4" ]' _ "$(state current)" "$RB" "$(state previous)" "$RA"

  # 4. Failed health check: roll back to what was running, by its digests, exit non-zero.
  new_env; set_state current "$RB"; set_state previous "$RA"
  EXTRA="FAKE_HEALTH_FAIL=$CD" run_deploy "$s" "deploy $C $CD $CW"
  check "failed health: exit non-zero" test "$RC" != 0
  check "failed health: tried the new digests first" has_call "up API_IMAGE=$(img api "$CD")"
  check "failed health: then brought back the running digests" bash -c 'grep "^up " "$1" | tail -1 | grep -q "gofast-api@$2 "' _ "$CALLS" "$BD"
  check "failed health: pulled the running release by digest again" has_call "docker pull $(img api "$BD")"
  check "failed health: state unchanged (current B, previous A)" bash -c '[ "$1" = "$2" ] && [ "$3" = "$4" ]' _ "$(state current)" "$RB" "$(state previous)" "$RA"
  check "failed health: says it rolled back" bash -c '[[ "$1" == *"rolled back"* ]]' _ "$OUT"
  new_env; EXTRA="FAKE_HEALTH_FAIL=$AD" run_deploy "$s" "deploy $A $AD $AW"
  check "first deploy failing: exit non-zero, nothing to roll back to, no state written" bash -c '[ "$1" != 0 ] && [[ "$2" == *"nothing to roll back"* ]] && [ ! -e "$3/current" ]' _ "$RC" "$OUT" "$ROOT/state"

  # 5. rollback command: runs the digests stored with `previous`.
  new_env; set_state current "$RB"; run_deploy "$s" rollback
  check "rollback without previous: refused, exit 1, zero calls" bash -c '[ "$1" = 1 ] && [ ! -s "$2" ] && [[ "$3" == *refused* ]]' _ "$RC" "$CALLS" "$OUT"
  new_env; run_deploy "$s" rollback
  check "rollback with no state at all: refused, zero calls" bash -c '[ "$1" = 1 ] && [ ! -s "$2" ]' _ "$RC" "$CALLS"
  new_env; set_state current "$RB"; set_state previous "$RA"; run_deploy "$s" rollback
  check "rollback: exit 0, current A, previous B" bash -c '[ "$1" = 0 ] && [ "$2" = "$3" ] && [ "$4" = "$5" ]' _ "$RC" "$(state current)" "$RA" "$(state previous)" "$RB"
  check "rollback: compose up with the previous digests" has_call "up API_IMAGE=$(img api "$AD") WEB_IMAGE=$(img web "$AW")"
  check "rollback: pulls the previous digests, not tags" bash -c 'grep -q "docker pull .*gofast-api@$2" "$1" && ! grep "^docker pull" "$1" | grep -q "gofast-[a-z]*:"' _ "$CALLS" "$AD"
  new_env; set_state current "$RB"; set_state previous "$RA"; EXTRA="FAKE_NOT_ANCESTOR=$B,$A" run_deploy "$s" rollback
  check "rollback to an older commit is allowed (that is what it is for)" bash -c '[ "$1" = 0 ] && [ "$2" = "$3" ]' _ "$RC" "$(state current)" "$RA"

  # 6. A sha that is not on main is refused before any docker call (a fork commit can be fetched by hash).
  new_env; set_state current "$RA"; EXTRA="FAKE_NOT_ANCESTOR=$B,origin/main" run_deploy "$s" "deploy $B $BD $BW"
  check "sha not on main: refused, no docker call, state unchanged" bash -c '[ "$1" != 0 ] && ! grep -q "^docker" "$2" && [ "$(cat "$3/current")" = "$4" ]' _ "$RC" "$CALLS" "$ROOT/state" "$RA"

  # 6b. RV-25: CI finishes in any order, so an older commit must never replace a newer one that already runs.
  new_env; set_state current "$RB"; set_state previous "$RA"; EXTRA="FAKE_NOT_ANCESTOR=$B,$A" run_deploy "$s" "deploy $A $AD $AW"
  check "older than current: exit 1, zero docker calls, state unchanged" bash -c '[ "$1" = 1 ] && ! grep -q "^docker" "$2" && [ "$(cat "$3/current")" = "$4" ] && [ "$(cat "$3/previous")" = "$5" ]' _ "$RC" "$CALLS" "$ROOT/state" "$RB" "$RA"
  check "older than current: the message says to use rollback" bash -c '[[ "$1" == *"older than current"* && "$1" == *"use rollback"* ]]' _ "$OUT"
  new_env; set_state current "$RB"; EXTRA="FAKE_NOT_ANCESTOR=$B,$B" run_deploy "$s" "deploy $B $BD $BW"
  check "the same sha again is never 'older'" test "$RC" = 0
  new_env; set_state current "$RA"; run_deploy "$s" "deploy $B $BD $BW"
  check "a descendant of current deploys" test "$RC" = 0
  new_env; run_deploy "$s" "deploy $A $AD $AW"
  check "with no current the ancestor question is not asked" bash -c '! grep "merge-base" "$1" | grep -qv "origin/main"' _ "$CALLS"

  # 7. Pull failure changes nothing.
  new_env; set_state current "$RA"; EXTRA="FAKE_PULL_FAIL=$BD" run_deploy "$s" "deploy $B $BD $BW"
  check "pull failure: exit non-zero, no compose up, state unchanged" bash -c '[ "$1" != 0 ] && ! grep -q "^up " "$2" && [ "$(cat "$3/current")" = "$4" ]' _ "$RC" "$CALLS" "$ROOT/state" "$RA"

  # 8. Not configured: refuse before docker.
  new_env; printf 'GHCR_USER=user-x\n' > "$ROOT/deploy.env"; run_deploy "$s" "deploy $A $AD $AW"
  check "deploy.env without GHCR_OWNER: exit non-zero, zero docker calls" bash -c '[ "$1" != 0 ] && ! grep -q "^docker" "$2"' _ "$RC" "$CALLS"
  new_env; printf 'GHCR_OWNER=Bad/Owner\nGHCR_USER=user-x\nREPO_URL=https://example.invalid/r.git\n' > "$ROOT/deploy.env"; run_deploy "$s" "deploy $A $AD $AW"
  check "an owner that is not a plain lowercase name is refused, zero docker calls" bash -c '[ "$1" != 0 ] && ! grep -q "^docker" "$2"' _ "$RC" "$CALLS"
  new_env; set_state current "$A"; run_deploy "$s" "deploy $B $BD $BW"
  check "a state record without digests is refused, zero docker calls, state unchanged" bash -c '[ "$1" != 0 ] && ! grep -q "^docker" "$2" && [ "$(cat "$3/current")" = "$4" ]' _ "$RC" "$CALLS" "$ROOT/state" "$A"

  # 9. Two deploys at once: the second is refused, nothing runs.
  new_env; ( flock 9; sleep 4 ) 9> "$ROOT/state/lock" & holder=$!; sleep 0.6
  run_deploy "$s" "deploy $A $AD $AW"; kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null
  check "a deploy already running: refused, zero calls" bash -c '[ "$1" != 0 ] && [ ! -s "$2" ]' _ "$RC" "$CALLS"

  # 10. First run clones the repo; later runs do not.
  new_env; rmdir "$ROOT/repo/.git" "$ROOT/repo"; run_deploy "$s" "deploy $A $AD $AW"
  check "no checkout yet: clones once" has_call "git clone"
  new_env; run_deploy "$s" "deploy $A $AD $AW"
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
  'validate|elif [[ "$cmd" == "deploy "* ]]; then action=deploy; read -r _ sha api web <<< "$cmd"'
  'digest|re_deploy='"'"'^deploy ([0-9a-f]{40}) ([^ ]+) ([^ ]+)$'"'"
  'pulltag|img() { printf "ghcr.io/%s/gofast-%s:latest" "$GHCR_OWNER" "$1"; }'
  'older|:'
  'staterec|:'
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
