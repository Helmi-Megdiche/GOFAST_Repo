#!/usr/bin/env bash
# Run Playwright against an already running server on PORT; print only the summary and failures.
# Artifacts go to apps/web/test-results/port-PORT/ so parallel runs on different ports do not collide.
# Exit status is Playwright's own.
set -uo pipefail
PORT=${1:?usage: run.sh PORT [playwright args...]}; shift
ROOT=$(git rev-parse --show-toplevel)
CFG=$(mktemp --suffix=.config.ts)
trap 'rm -f "$CFG"' EXIT
cat >"$CFG" <<CFGEOF
import base from "$ROOT/apps/web/playwright.config";
export default { ...base, testDir: "$ROOT/apps/web/e2e", outputDir: "$ROOT/apps/web/test-results/port-$PORT", use: { ...base.use, baseURL: "http://localhost:$PORT" }, webServer: undefined };
CFGEOF
if [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && [ -d /root/.cache/ms-playwright ]; then export PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright; fi
cd "$ROOT/apps/web"
pnpm exec playwright test -c "$CFG" --reporter=line "$@" 2>&1 \
  | grep -E "^\s+[0-9]+\) |Error:|Expected|Received|> [0-9]+ \||\"id\"|  [0-9]+ (passed|failed|flaky|skipped)"
STATUS=${PIPESTATUS[0]}
rm -f "$CFG"
exit "$STATUS"
