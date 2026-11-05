#!/usr/bin/env bash
# Lint, typecheck, unit tests and e2e for the FastGo monorepo, printing only totals and failures.
set -uo pipefail
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
T=${TMPDIR:-/tmp}
pnpm lint >"$T/fastgo-verify-lint.log" 2>&1; echo "lint: exit $?"; grep -E "error|warning" "$T/fastgo-verify-lint.log" | head -20
pnpm typecheck >"$T/fastgo-verify-tsc.log" 2>&1; echo "typecheck: exit $?"; grep -E "error TS" "$T/fastgo-verify-tsc.log" | head -20
pnpm test >"$T/fastgo-verify-unit.log" 2>&1; echo "unit: exit $?"; grep -E "Tests |FAIL|×" "$T/fastgo-verify-unit.log" | head -20
pnpm test:e2e >"$T/fastgo-verify-e2e.log" 2>&1; echo "e2e: exit $?"
grep -E "  [0-9]+ (passed|failed|flaky|skipped)|^\S+:\s+[0-9]+\) |Error:" "$T/fastgo-verify-e2e.log" | head -40
