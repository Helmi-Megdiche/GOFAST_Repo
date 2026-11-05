---
name: fastgo-verify-pr
description: Final FastGo verification before pushing or updating a PR. Use before claiming work is done, before pushing, and before writing PR test counts.
---

# Verify before a PR

1. `bash .claude/skills/fastgo-verify-pr/verify.sh`: runs lint, typecheck, unit tests and the full e2e suite (port 3100 must be free) and prints only the totals and failures. Logs go to `$TMPDIR/fastgo-verify-*.log`.
2. Screenshots: shots are in `apps/web/test-results/shots/<ref>-<locale>-<width>.png`. Compare the 1440 px shots with `docs/ui/screenshots/<ref>.jpg` (the references are 1440 px pages scaled to 1080). Look at a few, not all: the pages the change touched, in fr and ar.
3. Report exact counts from the script output (unit per package, e2e passed/failed). Never claim a pass you did not see in this run.
4. PR text: real counts, differences from the mockup, unsourced values, items that did not reproduce, decisions awaiting confirmation.
