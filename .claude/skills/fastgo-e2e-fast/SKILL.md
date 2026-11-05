---
name: fastgo-e2e-fast
description: Run FastGo Playwright e2e tests quickly and cheaply. Use whenever you need to run, iterate on or debug apps/web e2e tests (order flow, auth, public site), instead of calling `pnpm test:e2e` repeatedly.
---

# Fast e2e loop for apps/web

The scripts need bash (and `git`, `curl`); they do not run in PowerShell.

`pnpm test:e2e` rebuilds the app every run (about 5 min). For iteration, build once and reuse the server.

1. Pick a free port (3100 is used by `pnpm test:e2e`; parallel agents take 3101, 3102...).
2. `bash .claude/skills/fastgo-e2e-fast/serve.sh <port>`: builds with `FG_DEV_UI=1`, starts `next start` in the background, waits until it answers. Rebuild after every source change (the server serves the old build otherwise).
3. `bash .claude/skills/fastgo-e2e-fast/run.sh <port> <spec or grep args...>`: runs Playwright against that server and prints only the summary and the failing lines (test title, Error, Expected/Received, the source line). Example: `run.sh 3101 e2e/auth.spec.ts --grep "W18"`.
4. For a failure, read `apps/web/test-results/port-<port>/<test>/error-context.md` (page snapshot; each port has its own folder, so parallel runs do not overwrite each other). `run.sh` exits with Playwright's status: that is cheaper than screenshots.
5. Stop the server with `pkill -f "next start -p <port>"` before running `pnpm test:e2e` on 3100.

Container notes: the browser for the pinned Playwright is linked at `/root/.cache/ms-playwright`; `run.sh` keeps a `PLAYWRIGHT_BROWSERS_PATH` you already set and otherwise uses that folder if it exists. If it is missing, link `/opt/pw-browsers/chromium_headless_shell-*` to `/root/.cache/ms-playwright/chromium_headless_shell-<pinned build>`.

Locator lessons from this project:
- Field labels include a hidden `*`: use `getByRole("textbox", { name, exact: true })`, or `input[name=...]` for password fields.
- Amounts contain a no-break space: in regexes use `\s`, or `toContainText` (it normalises spaces).
- Scope alerts to `main` (Next has its own route announcer with role alert).
- Chromium ignores `<noscript>` with JavaScript off: check the server HTML with `request.get`.
- Controlled radios that update after an async call: `click()` then `expect(...).toBeChecked()`.
