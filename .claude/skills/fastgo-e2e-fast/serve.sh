#!/usr/bin/env bash
# Build apps/web once and serve it on PORT for fast Playwright runs.
set -euo pipefail
PORT=${1:?usage: serve.sh PORT}
ROOT=$(git rev-parse --show-toplevel)
LOG=${TMPDIR:-/tmp}/fastgo-serve-$PORT.log
cd "$ROOT/apps/web"
pkill -f "next start -p $PORT" 2>/dev/null || true
FG_DEV_UI=1 pnpm exec next build >"$LOG" 2>&1 || { tail -30 "$LOG"; exit 1; }
(FG_DEV_UI=1 nohup pnpm exec next start -p "$PORT" >>"$LOG" 2>&1 &)
for _ in $(seq 1 40); do
  curl -s -o /dev/null "http://localhost:$PORT/fr" && { echo "serving on $PORT"; exit 0; }
  sleep 1
done
echo "server did not start, see $LOG"; exit 1
