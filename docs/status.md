# GOFAST launch status

Snapshot of 8 Nov 2026, 18:00 Tunis time (week S1). Client priority: public site, client space and admin dashboard working on staging by G2, 21 Nov. Update this file when a PR merges or a blocker clears.

## Done

| Item | Where |
|---|---|
| Public site, order flow, sign-in | Merged: #4, #5 |
| Account base and client orders (orders, tracking, cancel with fees) | Merged: #6, #65 |
| GOFAST name, CODEOWNERS, GOFAST answers | Merged: #64, #59, #60 |
| Tests green on `main` `8f75f82`: 672 web + 23 i18n unit, 363 e2e with axe-core | CI run on #67 |
| CI on every PR: lint, typecheck, tests, build, e2e, Gitleaks (3 jobs green) | PR #67, waiting for merge |
| Server setup script: SSH keys only, firewall, auto updates, Docker | PR #68, needs servers |
| Test matrix, 118 scenarios: 10 covered, 15 partial, 22 not built yet, 71 blocked | PR #69, Moataz reviews |
| Host shortlist: Ooredoo Business, Orange Tunisie, Tunisie Telecom | `infra/servers/README.md` in PR #68 |
| #20 PR 4a: sign-in, sign-up, phone code and password reset on the API adapter, behind the `auth` flag (default stays mock). In review, not pushed. Do not set `auth=api` for real use until `account` is switched | Branch `web/GH-20-auth-api` |

## Blocked

| Item | Why |
|---|---|
| Servers, staging, deploy (#12, #14, #15) | No host chosen, no server ordered |
| API and back-office | Ala starts Monday 9 Nov. Holds the admin dashboard and the DR rights tests |
| Driver app | Moataz starts Monday 9 Nov. Holds the G2 position test |
| Invoices and claims (PR #66) | Round 1 review findings not fixed yet |
| Real phone tests (G2) | 3 Android phones and an iPhone needed. GOFAST phones arrive 20 Nov |
| Required checks before merge | Branch protection needs GitHub Pro on a private repo |

## To start, in order

| # | Who | Action |
|---|---|---|
| 1 | Helmi, now | Merge PR #67: `gh pr merge 67 --repo Helmi-Megdiche/GOFAST_Repo --merge --match-head-commit 4660fae` |
| 2 | Helmi, Monday | Ask the 3 hosts for quotes (two data centres in Tunisia, DDoS, Ubuntu 24.04, price). Questions in `infra/servers/README.md` |
| 3 | Helmi | Order 2 servers, run `setup.sh`, paste its check list in PR #68, then merge |
| 4 | All three | Add an SSH key on GitHub (github.com/settings/keys) |
| 5 | Helmi, Monday | Onboard Ala and Moataz: new repo URL, board write access, "Backlog" and "In review" columns |
| 6 | Helmi | Restart PR #66: Claude Code reads the round 1 review and pushes fixes |
| 7 | Helmi | Get GitHub Pro (Student Developer Pack), then require the 3 CI checks on `main` |
