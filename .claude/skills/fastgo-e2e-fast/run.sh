#!/usr/bin/env bash
# Run Playwright against an already running server on PORT; print only the summary and failures.
set -uo pipefail
PORT=${1:?usage: run.sh PORT [playwright args...]}; shift
ROOT=$(git rev-parse --show-toplevel)
CFG=$(mktemp --suffix=.config.ts)
cat >"$CFG" <<CFGEOF
import base from "$ROOT/apps/web/playwright.config";
export default { ...base, testDir: "$ROOT/apps/web/e2e", use: { ...base.use, baseURL: "http://localhost:$PORT" }, webServer: undefined };
CFGEOF
cd "$ROOT/apps/web"
PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright pnpm exec playwright test -c "$CFG" --reporter=line "$@" 2>&1 \
  | grep -E "^\s+[0-9]+\) |Error:|Expected|Received|> [0-9]+ \||\"id\"|  [0-9]+ (passed|failed|flaky|skipped)"
rm -f "$CFG"
