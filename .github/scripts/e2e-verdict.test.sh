#!/usr/bin/env bash
# shellcheck disable=SC2016  # the single-quoted sed programs contain a literal $ on purpose
# Tests for .github/scripts/e2e-verdict.sh (#114): the decision behind the "E2E (Playwright, axe-core)" check.
# Run: bash .github/scripts/e2e-verdict.test.sh. RV-12: a table of every combination that matters, plus twins
# (broken copies of the script) that MUST make the table fail. Fake values only.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
REAL="${VERDICT_SH:-$HERE/e2e-verdict.sh}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

# verdict <script> <name> <green|red> CODE WEB SHARDS API PRIOR
verdict() {
  local s="$1" name="$2" want="$3"; shift 3
  local rc=0 got
  CODE=$1 WEB=$2 SHARDS=$3 API=$4 PRIOR=$5 bash "$s" > /dev/null 2>&1 || rc=$?
  [ "$rc" = 0 ] && got=green || got=red
  if [ "$got" = "$want" ]; then pass=$((pass + 1)); [ "${VERBOSE:-0}" = 1 ] && echo "  ok   $name"
  else fail=$((fail + 1)); [ "${VERBOSE:-0}" = 1 ] && echo "  FAIL $name: want $want got $got"; fi
  return 0
}

suite() {
  local s="$1"; pass=0; fail=0
  #       name                                                  want   CODE  WEB   SHARDS     API        PRIOR
  verdict "$s" "web change, all passed"                         green  true  true  success    success    false
  verdict "$s" "docs only: both skipped"                        green  false false skipped    skipped    false
  verdict "$s" "api only: shards skipped, api e2e passed (#114)" green true  false skipped    success    false
  verdict "$s" "push: same tree passed on its PR"               green  true  true  skipped    skipped    true
  # Red: something failed.
  verdict "$s" "a shard failed"                                 red    true  true  failure    success    false
  verdict "$s" "a shard was cancelled"                          red    true  true  cancelled  success    false
  verdict "$s" "api e2e failed, shards passed"                  red    true  true  success    failure    false
  verdict "$s" "api e2e cancelled, shards passed"               red    true  true  success    cancelled  false
  verdict "$s" "api only: api e2e failed (shards skipped)"      red    true  false skipped    failure    false
  verdict "$s" "api only: api e2e cancelled"                    red    true  false skipped    cancelled  false
  verdict "$s" "both failed"                                    red    true  true  failure    failure    false
  # Red: something that should have run did not (a failed `checks` job skips both).
  verdict "$s" "web change, checks failed: both skipped"        red    true  true  skipped    skipped    false
  verdict "$s" "api only, checks failed: api e2e skipped"       red    true  false skipped    skipped    false
  verdict "$s" "web change, shards ran, api e2e skipped"        red    true  true  success    skipped    false
  verdict "$s" "web change, api e2e ran, shards skipped"        red    true  true  skipped    success    false
  # Red: the `changes` job itself failed (empty outputs): nothing may be taken as "not needed".
  verdict "$s" "changes failed: empty outputs, all skipped"     red    ""    ""    skipped    skipped    ""
  verdict "$s" "changes failed, api e2e skipped, shards skipped" red   ""    ""    skipped    skipped    false
  verdict "$s" "web empty, code true: shards skipped"           red    true  ""    skipped    success    false
  verdict "$s" "code empty, web false: nothing is excused"      red    ""    false skipped    skipped    false
  # PRIOR only excuses a skip, never a failure.
  verdict "$s" "prior passed but a shard failed"                red    true  true  failure    skipped    true
  verdict "$s" "prior passed but api e2e failed"                red    true  true  skipped    failure    true
}

echo "== e2e-verdict.sh: the table"
VERBOSE=1 suite "$REAL"
real_pass=$pass; real_fail=$fail
echo "   $real_pass ok, $real_fail failed"
[ "$real_fail" = 0 ] || { echo "FAIL: the real script does not pass its own table"; exit 1; }

echo "== twins (each broken copy must fail the table)"
twins_bad=0; n=0
twin() { # name, sed expression applied to the script
  local f="$TMP/twin-$1.sh"; n=$((n + 1))
  sed "$2" "$REAL" > "$f"
  if cmp -s "$f" "$REAL"; then echo "  BROKEN TWIN $1: the sed did not change the script"; twins_bad=$((twins_bad + 1)); return; fi
  suite "$f"
  if [ "$fail" -gt 0 ]; then echo "  ok   twin $1 fails ($fail cases)"
  else echo "  FAIL twin $1 still passes"; twins_bad=$((twins_bad + 1)); fi
}
twin webskip-always-ok       '/# MUT-webskip$/s/ \&\& \[ "\$WEB" = false \]//'
twin webskip-never-ok        '/# MUT-webskip$/d'
twin web-empty-is-false      '/# MUT-webskip$/s/"\$WEB" = false/"$WEB" != true/'
twin apiskip-always-ok       '/# MUT-apiskip$/s/ \&\& \[ "\$CODE" = false \]//'
twin apiskip-never-ok        '/# MUT-apiskip$/d'
twin code-empty-is-false     '/# MUT-apiskip$/s/"\$CODE" = false/"$CODE" != true/'
twin prior-no-shard-excuse   '/# MUT-prior$/d'
twin prior-no-api-excuse     '/# MUT-priorapi$/d'
twin prior-excuses-failure   '/# MUT-prior$/s/\[ "\$SHARDS" = skipped \] \&\& //'
twin api-success-not-needed  '/# MUT-apisuccess$/d'
twin shard-success-not-needed '/# MUT-shardsuccess$/d'

if [ "$twins_bad" != 0 ]; then echo "FAIL: $twins_bad twin(s) did not fail"; exit 1; fi
echo "all good: $real_pass cases, $n twins failed as required"
