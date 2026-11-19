#!/usr/bin/env bash
# The decision behind the "E2E (Playwright, axe-core)" check (#114). Inputs, as environment variables:
#   CODE, WEB    outputs of the `changes` job (.github/scripts/changes.sh)
#   SHARDS, API  results of the `e2e-shard` and `e2e-api` jobs (success, failure, cancelled, skipped)
#   PRIOR        "true" when this tree already passed e2e on its pull request (push to main)
# Exit 0 = green, 1 = red. A job counts as fine only when it succeeded, or was skipped for a reason that is
# written here; every other status (failure, cancelled, an unexpected skip, an empty value) is red.
# Tested, with broken copies that must fail, by .github/scripts/e2e-verdict.test.sh.
set -uo pipefail

CODE="${CODE-}"; WEB="${WEB-}"; SHARDS="${SHARDS-}"; API="${API-}"; PRIOR="${PRIOR-}"
echo "code=$CODE web=$WEB shards=$SHARDS api=$API prior=$PRIOR"

shards_ok=false
[ "$SHARDS" = success ] && shards_ok=true # MUT-shardsuccess
# Skipped on purpose: no web code changed (an API-only change), or the same tree already passed on its PR.
[ "$SHARDS" = skipped ] && [ "$WEB" = false ] && shards_ok=true # MUT-webskip
[ "$SHARDS" = skipped ] && [ "$PRIOR" = true ] && shards_ok=true # MUT-prior

api_ok=false
[ "$API" = success ] && api_ok=true # MUT-apisuccess
# Skipped on purpose: only docs, Markdown, infra or deploy.yml changed, or the same tree already passed on its PR.
[ "$API" = skipped ] && [ "$CODE" = false ] && api_ok=true # MUT-apiskip
[ "$API" = skipped ] && [ "$PRIOR" = true ] && api_ok=true # MUT-priorapi

if [ "$shards_ok" = true ] && [ "$api_ok" = true ]; then
  echo "e2e passed, or was not needed for this change."
  exit 0
fi
[ "$shards_ok" = true ] || echo "The web e2e shards did not pass (or did not run although they should have)."
[ "$api_ok" = true ] || echo "The api-mode e2e did not pass (or did not run although it should have)."
exit 1
