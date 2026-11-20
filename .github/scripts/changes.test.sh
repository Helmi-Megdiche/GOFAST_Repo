#!/usr/bin/env bash
# shellcheck disable=SC2016  # the single-quoted sed programs and grep pattern contain a literal $ on purpose
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
  expect "$s" "Markdown inside apps/api follows the api rule" "$T $T $F" "apps/api/README.md$nl"
  expect "$s" "Markdown inside packages follows its rule"     "$T $T $T" "packages/i18n/AR-REVIEW.md$nl"

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
  # A path git quotes (spaces or non-ASCII) starts with a double quote and cannot be read: run everything (RV-26).
  expect "$s" "a quoted path runs everything"                 "$T $T $T" "\"docs/caf\\303\\251.png\"$nl"
  expect "$s" "a quoted path under apps/api keeps api"        "$T $T $T" "\"apps/api/\\303\\251.ts\"$nl"

  # --- Files that tests read are not "skip" files (#114 round 1, RV-26).
  expect "$s" "docs/spec is read by a unit test"              "$T $F $F" "docs/spec/technique-api.md$nl"
  expect "$s" "CLAUDE.md is read by a unit test"              "$T $F $F" "CLAUDE.md$nl"
  expect "$s" "infra/data is read by an api int test"         "$T $T $F" "infra/data/zones/ATTRIBUTION.md$nl"
  expect "$s" "infra/data non-md file"                        "$T $T $F" "infra/data/zones/delegations.geojson$nl"
  expect "$s" "docs/ui stays skip"                            "$F $F $F" "docs/ui/README.md$nl"
  expect "$s" "infra/servers stays skip"                      "$F $F $F" "infra/servers/setup.sh$nl"
  expect "$s" "a rename lists both paths: old api path counts" "$T $T $F" "docs/a.ts${nl}apps/api/a.ts$nl"

  tripwire "$s"
}

# RV-26 tripwire: every file a test (or script) in apps/ or packages/ reads from docs/, infra/ or as Markdown must give
# code=true. The paths come from the source itself, so a new test that reads a skipped file fails here.
ROOT=$(cd "$HERE/../.." && pwd)
SQ=$'\''
LIT="[\"${SQ}\`][^\"${SQ}\`]*(\\.md|docs/|infra/)[^\"${SQ}\`]*[\"${SQ}\`]"
norm() { # normalise a/b/../c to a/c
  local IFS=/ seg out=() p=$1
  for seg in $p; do
    case "$seg" in
      "" | .) ;;
      ..) [ "${#out[@]}" -gt 0 ] && unset 'out[${#out[@]}-1]' ;;
      *) out+=("$seg") ;;
    esac
  done
  printf '%s' "${out[*]}"
}
read_paths() { # prints every repo-relative path a source file reads that the old filter would skip
  local f lit dir res
  while IFS= read -r f; do
    dir=$(dirname "${f#"$ROOT"/}")
    # String literals that mention ../, docs/, infra/ or end in .md; no spaces, no ${...}, no URLs.
    while IFS= read -r lit; do
      lit=${lit:1:${#lit}-2}
      case "$lit" in *" "* | *'${'* | *://* | "") continue ;; esac
      case "$lit" in docs/* | infra/*) res=$(norm "$lit") ;; *..*) res=$(norm "$dir/$lit") ;; *) continue ;; esac
      case "$res" in docs/* | infra/* | *.md) printf '%s|%s\n' "$res" "${f#"$ROOT"/}" ;; esac
    done < <(grep -vE '^[[:space:]]*(//|\*|/\*)' "$f" 2> /dev/null | grep -oE "$LIT") # comment lines are not reads
  done < <(find "$ROOT/apps" "$ROOT/packages" \( -name node_modules -o -name dist -o -name .next -o -name test-results \) -prune -o \
    -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.js' \) -print)
}
TRIP_PATHS=$(read_paths | sort -u)
tripwire() {
  local s="$1" p reader out need
  # The tripwire must see the real reads (else it proves nothing): these two are known today.
  case "$TRIP_PATHS" in *docs/spec/technique-api.md*) ;; *) fail=$((fail + 1)); echo "  FAIL tripwire found no docs/spec read" ;; esac
  case "$TRIP_PATHS" in *infra/data/zones*) ;; *) fail=$((fail + 1)); echo "  FAIL tripwire found no infra/data read" ;; esac
  while IFS='|' read -r p reader; do
    [ -n "$p" ] || continue
    # The flag of the job that runs the reader: code for everything, and api for a reader under apps/api (api-int job).
    need="code=true"; case "$reader" in apps/api/*) need="code=true api=true" ;; esac
    out=$(printf '%s\n' "$p" | bash "$s" 2> /dev/null | head -n 2 | tr '\n' ' ')
    out=${out% }
    case "$reader" in apps/api/*) ;; *) out=${out%% *} ;; esac
    if [ "$out" = "$need" ]; then pass=$((pass + 1)); [ "${VERBOSE:-0}" = 1 ] && echo "  ok   tripwire: $p (read by $reader)"
    else fail=$((fail + 1)); [ "${VERBOSE:-0}" = 1 ] && echo "  FAIL tripwire: $reader reads $p, needs [$need], the filter gives [$out]"; fi
  done <<< "$TRIP_PATHS"
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

# Twins for the round 1 holes (RV-26). The sed puts a skip rule back in front of the others / removes the quoted-path rule.
twin_sed() { # name, sed expression
  local f="$TMP/twin-$1.sh"
  sed "$2" "$REAL" > "$f"
  if cmp -s "$f" "$REAL"; then echo "  BROKEN TWIN $1: the sed did not change the script"; twins_bad=$((twins_bad + 1)); return; fi
  suite "$f"
  if [ "$fail" -gt 0 ]; then echo "  ok   twin $1 fails ($fail cases)"
  else echo "  FAIL twin $1 still passes"; twins_bad=$((twins_bad + 1)); fi
}
twin_sed docs-first-again   '/^  case "\$f" in$/a\    docs/*) ;;'
twin_sed infra-first-again  '/^  case "\$f" in$/a\    infra/*) ;;'
twin_sed md-first-again     '/^  case "\$f" in$/a\    *.md) ;;'
twin no-quoted-rule drop quoted
twin no-docs-spec   drop docsspec
twin no-claude-md   drop claudemd
twin no-infra-data  drop infradata
# S1 (round 2): the tripwire checks the job that runs the reader. infra/data without api would skip api-int.
twin_sed infra-data-without-api '/# MUT-infradata$/s/; api=true//'

# B1: the diff in ci.yml must list a renamed file under both paths. The checker is run on the real ci.yml and on a copy
# without the flag, which must fail.
CI="${CI_YML:-$HERE/../workflows/ci.yml}"
ci_has_no_renames() { grep -qE 'git diff --name-only --no-renames "\$BASE_SHA" HEAD' "$1"; }
echo "== ci.yml lists renames as two paths"
if ci_has_no_renames "$CI"; then echo "  ok   ci.yml diff uses --no-renames"; else echo "  FAIL ci.yml diff has no --no-renames"; exit 1; fi
sed 's/ --no-renames//' "$CI" > "$TMP/ci-twin.yml"
if ci_has_no_renames "$TMP/ci-twin.yml"; then echo "  FAIL twin ci-without-no-renames still passes"; twins_bad=$((twins_bad + 1))
else echo "  ok   twin ci-without-no-renames fails"; fi

if [ "$twins_bad" != 0 ]; then echo "FAIL: $twins_bad twin(s) did not fail"; exit 1; fi
echo "all good: $real_pass cases, 24 twins failed as required"
