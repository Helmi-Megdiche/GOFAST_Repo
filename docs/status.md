# GOFAST launch status

Snapshot of 17 Nov 2026, 21:30 Tunis time (week S2). Source: GitHub (merged PRs, open issues and PRs). Update this file when a PR merges or a blocker clears.

## Team

| Who | Owns |
|---|---|
| Helmi (@Helmi-Megdiche) | Web, driver app, e2e and tests, infrastructure. Decides and merges |
| Ala (@AlaaSalem12) | API (from 16 Nov, handover in #94), back-office, finance, API tests (rights matrix, load, TTN outage) |
| Moataz | Has left the project (#72). CODEOWNERS now lists two people |

## Done since 8 Nov

| Area | Merged PRs |
|---|---|
| Web: client space | #65 client orders, cancel and fees. #66 invoices and claims. #74 profile, addresses, e-mail, close account (ESP-02). #73 driver application form (FE-05) |
| Web: API client and sign-in | #95 typed API client and data-layer adapters, no screen switched. #98 sign-in, sign-up, phone code and reset on the API adapter, behind the `auth` flag |
| Web: UI and brand | #64 GOFAST name instead of FastGo. #93 visible focus on the file-attach control |
| Domain (`@fastgo/domain`) | #84 pure rules. #87 parcel count, per-parcel weight and packaging. #89 order, parcel and mission states as pure guards |
| API | #85 contract (`openapi.yaml`, `packages/contract`). #88 NestJS skeleton (api, ws, worker). #90 database layer: roles, RLS, orders, parcels, missions. #97 sessions, sign-up, sign-in, phone checks, reset (Ala reviews, #9 stays open). #101 zones, services and price quote, with the two RLS fixes of migration 0004 (#10 and #96 done, merge commit 67fa35f) |
| E2E and CI | #67 GitHub Actions on every PR. #77 e2e under 7 minutes, 3 shards. #81 three racing e2e checks fixed. #91 abuse.spec waits for hydration. #86 skip e2e on `main` when the same tree passed on its PR |
| Infra | #68 server base setup and database setup script |
| Docs and repo | #70 status snapshot of 8 Nov. #71 CI rule, test matrix, status and servers in CLAUDE.md. #72 owners are two people. #59 CODEOWNERS. #60 GOFAST answers of 6 Nov |

## In progress

| Issue | What | Who | Left to do |
|---|---|---|---|
| #9 | API accounts and sign-in, part 4a-2: Google sign-in, close account | Ala | Plan first, then build |
| #22 | Orders, states, public tracking, cancel | Ala | Plan PR 4b-2 OK with changes (supervisor, 17 Nov). After the #9 fix PR: 4b-2a (create, list, get, tracking, SMS), then 4b-2b (cancel, confirm, auto-confirm) |
| #20 | Web on the real API | Helmi | Account screens are next (profile, addresses, close account) |
| #75 | `packages/domain` | Helmi | PR 3 |
| #62 | Driver application, documents | Helmi | Review of the document storage part |
| #94 | Handover of `apps/api` to Ala | Ala | Read the note, review PR #97, take #10, #22, #25 |

## Blocked or waiting

| Item | Waiting for | Who |
|---|---|---|
| #14, #15 staging and deploy to staging | Host order. Plan: temporary host abroad, fake data only, from about Wed 18 Nov | Helmi |
| #9 `attempts_left` is sent at `error` level, the contract puts it in `fields[].details` | API fix, contract wins, add a test | Ala |
| #9 password reset burns the proof before the length check | Check the length first, as sign-up does | Ala |
| #69 recette matrix (T, DR, EX, CC) | PR #69 is open, not merged | Helmi, reviewer |
| GOFAST open questions (#17, #94 section 8) | Answers through Helmi: TTC or HT, VAT, stamp duty, packaging price on Programmée, company members, ticket categories, SMS provider, what closes with a merchant account, Google sign-up type | GOFAST, accountant |
| Real phone tests (G2) | 3 Android phones and an iPhone. GOFAST phones arrive 20 Nov | GOFAST |
| Required checks before merge | GitHub Pro on a private repo | Helmi |

## Rule kept

Nobody sets `NEXT_PUBLIC_API_DOMAINS=auth` for real use until `account` is switched too. Sign-in on the API and the account screens on mock data do not match.

## Next actions

| # | Who | Action |
|---|---|---|
| 1 | Ala | #9 fix PR (reset checks the length before spending the proof; attempts_left in fields[].details), then #22 PR 4b-2a |
| 2 | Helmi | Order the staging host, then run `infra/servers/setup.sh` |
| 3 | Helmi | #20 account screens on the API adapter |
| 4 | Helmi | Merge or close PR #69 after review |
| 5 | Helmi | Send the open questions to GOFAST (#17) |
