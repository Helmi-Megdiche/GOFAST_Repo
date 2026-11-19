#!/usr/bin/env bash
# Tests for .github/scripts/changes.sh (#114). Shell only, no dependencies: run `bash .github/scripts/changes.test.sh`.
# RV-12: a table of file lists with the three expected outputs, every rule and every pattern in a list has a case,
# and the suite is also run against broken copies of the script ("twins"). Each twin MUST make it fail.
# Fake file names only.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
REAL="${CHANGES_SH:-$HERE/changes.sh}"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
nl=$'\n'

fail=0; pass=0
# expect <script> <name> <expected "code api web"> <file list, one per line>. Counts into pass/fail.
expect() {
  local script="$1" name="$2" want="$3" files="$4" got
  got=$(printf '%s' "$files" | bash "$script" 2> /dev/null | tr '\n' ' ')
  got=${got% }
  # The output is exactly three lines, in this order: code=, api=, web=.
  local c=${want%% *} rest=${want#* }; local a=${rest%% *} w=${rest#* }
  local exp="code=$c api=$a web=$w"
  if [ "$got" = "$exp" ]; then pass=$((pass + 1)); [ "${VERBOSE:-0}" = 1 ] && echo "  ok   $name"
  else fail=$((fail + 1)); [ "${VERBOSE:-0}" = 1 ] && echo "  FAIL $name: want [$exp] got [$got]"; fi
  return 0
}

suite() { # script -> sets pass/fail
  local s="$1"; pass=0; fail=0
  local T=true F=false

  # --- The cases named in #114.
  expect "$s" "deploy.yml alone: nothing"                     "$F $F $F" ".github/workflows/deploy.yml$nl"
  expect "$s" "deploy.yml + ci.yml: everything"               "$T $T $T" ".github/workflows/deploy.yml${nl}.github/workflows/ci.yml$nl"
  expect "$s" "apps/api alone: no web"                        "$T $T $F" "apps/api/src/main.ts$nl"
  expect "$s" "apps/api + packages/domain: web too"           "$T $T $T" "apps/api/src/main.ts${nl}packages/domain/src/x.ts$nl"
  expect "$s" "apps/web alone: no api"                        "$T $F $T" "apps/web/src/app/page.tsx$nl"
  expect "$s" "docs alone: nothing"                           "$F $F $F" "docs/status.md$nl"
  expect "$s" "push event (no file list): everything"        "$T $T $T" ""

  # --- Rule 1, each pattern on a file no other rule would catch (docs/* and infra/* use non-Markdown files).
  expect "$s" "docs/* (non-md file)"                          "$F $F $F" "docs/ui/screen.png$nl"
  expect "$s" "infra/* (non-md file)"                         "$F $F $F" "infra/servers/deploy.sh$nl"
  expect "$s" "*.md at the root"                              "$F $F $F" "README.md$nl"
  expect "$s" "*.md inside an app"                            "$F $F $F" "apps/web/CLAUDE.md$nl"
  expect "$s" "first match wins: Markdown inside apps/api"    "$F $F $F" "apps/api/README.md$nl"

  # --- Rule 3, apps/api (never web), and the files next to it that are not under apps/api.
  expect "$s" "apps/api/package.json is api, not shared"      "$T $T $F" "apps/api/package.json$nl"
  expect "$s" "apps/api test file"                            "$T $T $F" "apps/api/test/x.int.test.ts$nl"

  # --- Rule 4, one case per pattern of the shared list (RV-12: loop over the list, not one sample).
  expect "$s" "shared: packages/*"                            "$T $T $T" "packages/ui/src/x.ts$nl"
  expect "$s" "shared: turbo.json"                            "$T $T $T" "turbo.json$nl"
  expect "$s" "shared: package.json"                          "$T $T $T" "package.json$nl"
  expect "$s" "shared: pnpm-lock.yaml"                        "$T $T $T" "pnpm-lock.yaml$nl"
  expect "$s" "shared: pnpm-workspace.yaml"                   "$T $T $T" "pnpm-workspace.yaml$nl"
  expect "$s" "shared: .node-version"                         "$T $T $T" ".node-version$nl"
  expect "$s" "shared: .github/workflows/ci.yml"              "$T $T $T" ".github/workflows/ci.yml$nl"
  expect "$s" "shared: .github/scripts/changes.sh"            "$T $T $T" ".github/scripts/changes.sh$nl"
  expect "$s" "shared: another workflow is not deploy.yml"    "$T $T $T" ".github/workflows/other.yml$nl"
  expect "$s" "package.json inside apps/web is not the root"  "$T $F $T" "apps/web/package.json$nl"

  # --- Rule 5, everything else is web code only.
  expect "$s" "apps/backoffice"                               "$T $F $T" "apps/backoffice/src/x.ts$nl"
  expect "$s" "apps/driver"                                   "$T $F $T" "apps/driver/src/x.ts$nl"
  expect "$s" "unknown root file"                             "$T $F $T" "something.txt$nl"

  # --- OR across files (the strongest result per output wins, nothing is lost).
  expect "$s" "api + docs: docs add nothing"                  "$T $T $F" "docs/x.png${nl}apps/api/src/a.ts$nl"
  expect "$s" "deploy.yml + docs: still nothing"              "$F $F $F" ".github/workflows/deploy.yml${nl}docs/x.png$nl"
  expect "$s" "deploy.yml + apps/api: api only"               "$T $T $F" ".github/workflows/deploy.yml${nl}apps/api/src/a.ts$nl"
  expect "$s" "deploy.yml + apps/web: web only"               "$T $F $T" ".github/workflows/deploy.yml${nl}apps/web/src/a.ts$nl"
  expect "$s" "api + web: both"                               "$T $T $T" "apps/api/src/a.ts${nl}apps/web/src/a.ts$nl"
  expect "$s" "order does not matter (shared last)"           "$T $T $T" "docs/x.png${nl}apps/api/src/a.ts${nl}turbo.json$nl"
  expect "$s" "last line without a newline is read"           "$T $T $T" "docs/x.png${nl}turbo.json"
  expect "$s" "blank lines are ignored"                       "$F $F $F" "${nl}docs/x.png${nl}${nl}"
  # A path git quotes (spaces or non-ASCII) starts with a double quote: it matches no rule, so it runs web code. Safe side.
  expect "$s" "a quoted path falls to the safe default"       "$T $F $T" "\"docs/caf\\303\\251.png\"$nl"
}

echo "== changes.sh: the table"
VERBOSE=1 suite "$REAL"
real_pass=$pass; real_fail=$fail
echo "   $real_pass ok, $real_fail failed"
[ "$real_fail" = 0 ] || { echo "FAIL: the real script does not pass its own table"; exit 1; }

echo "== twins (each broken copy must fail the table)"
# A twin is the real script with one marked line deleted ("drop") or with that line's action widened ("web").
twin() { # name, mode (drop|web), marker
  local name="$1" mode="$2" mark="$3" f="$TMP/twin-$1.sh"
  case "$mode" in
    drop) sed "/# MUT-$mark\$/d" "$REAL" > "$f" ;;
    web) sed "/# MUT-$mark\$/s/code=true; api=true ;;/code=true; api=true; web=true ;;/" "$REAL" > "$f" ;;
  esac
  if cmp -s "$f" "$REAL"; then echo "  BROKEN TWIN $name: the marker MUT-$mark was not found"; twins_bad=$((twins_bad + 1)); return; fi
  suite "$f"
  if [ "$fail" -gt 0 ]; then echo "  ok   twin $name fails ($fail cases)"
  else echo "  FAIL twin $name still passes"; twins_bad=$((twins_bad + 1)); fi
}
twins_bad=0
twin apis-back-in-web web  api       # apps/api/* put back into the web rule (the #114 twin)
twin no-deploy-line   drop deploy    # the deploy.yml line dropped (the #114 twin)
twin no-docs          drop docs
twin no-infra         drop infra
twin no-md            drop md
twin no-api           drop api
twin no-packages      drop packages
twin no-turbo         drop turbo
twin no-package-json  drop pkgjson
twin no-lock          drop lock
twin no-workspace     drop workspace
twin no-node-version  drop nodever
twin no-github        drop github
twin no-other         drop other
twin no-push          drop empty

if [ "$twins_bad" != 0 ]; then echo "FAIL: $twins_bad twin(s) did not fail"; exit 1; fi
echo "all good: $real_pass cases, 15 twins failed as required"
