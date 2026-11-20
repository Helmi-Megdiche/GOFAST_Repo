# GOFAST launch status

Snapshot of 20 Nov 2026 (week S2). Source: GitHub (merged PRs, open issues and PRs). Update this file when a PR merges or a blocker clears.

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
| Web: API client and sign-in | #95 typed API client and data-layer adapters, no screen switched. #98 sign-in, sign-up, phone code and reset on the API adapter, behind the `auth` flag. #100 order draft v2. #121 client orders, cancel and tracking on the API adapter, behind the `orders` flag |
| Web: UI and brand | #64 GOFAST name instead of FastGo. #93 visible focus on the file-attach control |
| Domain (`@fastgo/domain`) | #84 pure rules. #87 parcel count, per-parcel weight and packaging. #89 order, parcel and mission states as pure guards |
| API | #85 contract (`openapi.yaml`, `packages/contract`). #88 NestJS skeleton (api, ws, worker). #90 database layer: roles, RLS, orders, parcels, missions. #97 sessions, sign-up, sign-in, phone checks, reset, and #104 code attempts (#9 closed 19 Nov). #101 zones, services and price quote, with the two RLS fixes of migration 0004 (#10 and #96 done). #110 create, list and read orders, public tracking, tracking SMS (4b-2a). #116 cancel, confirm and automatic confirmation (4b-2b). #119 database pool errors and close() timeout |
| E2E and CI | #67 GitHub Actions on every PR. #77 e2e under 7 minutes, 3 shards. #81 three racing e2e checks fixed. #91 abuse.spec waits for hydration. #86 skip e2e on `main` when the same tree passed on its PR. #103 e2e flakes under load. #115 narrower change filters |
| Infra | #68 server base setup and database setup script. #105 laptop compose stack. #108 Docker images and hardened containers. #111 Caddy, staging override, offboard.sh. #113 deploy job (GHCR, by digest, rollback) |
| Docs and repo | #70 status snapshot of 8 Nov. #71 CI rule, test matrix, status and servers in CLAUDE.md. #72 owners are two people. #59 CODEOWNERS. #60 GOFAST answers of 6 Nov. #99 and #102 status snapshots. #107 and #109 REVIEW.md rules |

## In progress

| Issue | What | Who | Left to do |
|---|---|---|---|
| #22 | Orders, states, public tracking, cancel | Ala | 4b-2a (#110) and 4b-2b (#116) merged. Read gaps in #120. Issue still open |
| #20 | Web on the real API | Helmi | 20-d (profile on the API, `account` switch plan) pushed on `web/GH-20-account-profile`, Report 1 on the issue. Then addresses and recipients (#122) |
| #75 | `packages/domain` | Helmi | PR 3 |
| #62 | Driver application, documents | Helmi | Review of the document storage part |
| #94 | Handover of `apps/api` to Ala | Ala | #10 and #9 done. Take #22 (open), #25, #122 |

## Blocked or waiting

| Item | Waiting for | Who |
|---|---|---|
| #14, #15 staging and deploy to staging | Code merged (#105, #108, #111, #113). Host order, then `infra/servers/setup.sh`. Temporary host abroad, fake data only | Helmi |
| #69 recette matrix (T, DR, EX, CC) | The matrix exists in `docs/spec/recette.md`, 118 rows checked against `main` at `704dabd` (20 Nov): Covered 15, Partial 20, Not covered 15, Blocked 68 (T 61, DR 36, EX 17, CC 4). PR #69 is open, waiting for review | Helmi |
| GOFAST open questions (#17, #94 section 8) | Answers through Helmi: TTC or HT, VAT, stamp duty, packaging price on Programmée, company members, ticket categories, SMS provider, what closes with a merchant account, Google sign-up type | GOFAST, accountant |
| Real phone tests (G2) | 3 Android phones and an iPhone. G2 moved from 21 Nov to about 25 Nov (Helmi, 20 Nov) | GOFAST |
| Required checks before merge | Turn them on in the repo settings. The repo is public since 19 Nov (GOFAST agreed in writing), so it is free | Helmi |

## Rule kept

Nobody sets `NEXT_PUBLIC_API_DOMAINS=auth` for real use until `account` is switched too. With `account` on, the profile is on the API and every screen without an API route is hidden and says so (table in `apps/web/CLAUDE.md`). Still to move before `auth` goes live: the `accounts.ts` reads in the order flow (follow-up issue).

## Next actions

| # | Who | Action |
|---|---|---|
| 1 | Ala | #22 what is left, with the read gaps (#120); #122 address book and recipients routes; e-mail route and balance route (follow-up issue) |
| 2 | Helmi | Supervisor review of #20 20-d, then #122 on the web side |
| 3 | Helmi | Order the staging host, then run `infra/servers/setup.sh` |
| 4 | Helmi | Merge PR #69 after review, then update the matrix rows when a PR covers them |
| 5 | Helmi | Send the open questions to GOFAST (#17) |
