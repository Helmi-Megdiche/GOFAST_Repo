# FastGo platform

Delivery platform for FastGo (documents and parcels, Tunisia). Three engineers build it, each working with Claude Code. This file is shared: keep it short, change it only through a pull request, and tell the team when you do.

## Product in one paragraph

Customers order a delivery on the website (or the installable web app on iPhone and Android), a driver picks it up and delivers it with proof, the recipient follows it through a personal link without an account, and FastGo staff run orders, dispatch, cash, invoices (El Fatoora / TTN) and COD payouts from a back-office. Payment is cash or merchant account. Online payment is L3.

- Spec: `docs/spec/fonctionnalites.md` (feature IDs such as FE-01, CMD-03, BO-06). The full cahier des charges is the online doc; ask Helmi for anything not in this repo.
- Business rules: `docs/spec/regles.md` (rules R101–R904, order and parcel states, data model, API routes and the acceptance scenarios for these screens). It is the binding extract of the cahier; when it and a mockup disagree, it wins.
- UI reference: `docs/ui/` (152 screens). Read `docs/ui/README.md` before any UI work.
- Lots: L1 = launch (end of week 8), L2 = after launch, L3 = later. Do not build L2 or L3 items unless the ticket says so.

## Stack (decided, do not change without the team)

- Monorepo: pnpm workspaces + Turborepo, TypeScript strict everywhere.
- `apps/web`: Next.js (App Router), React, Tailwind. Public site, order flow, auth, client space, merchant space, recipient link.
- `apps/backoffice`: Next.js. Separate app because it is deployed behind a VPN with 2FA.
- `apps/driver`: React in Capacitor (Android) + PWA (iPhone).
- `apps/api`: NestJS modular monolith, REST + WebSocket, OpenAPI, routes under `/v1`. Three processes from one codebase: api, ws, worker.
- `packages/ui`: design tokens (CSS variables plus a Tailwind v4 theme file; v4 has no JS presets), shared components, icons.
- `packages/i18n`: message catalogs fr / ar / en and helpers.
- `packages/config`: shared eslint, tsconfig, prettier.
- Data: PostgreSQL + PostGIS, row-level security, separate DB users, PgBouncer, Redis (sessions, queues), S3-compatible storage.
- No microservices, no RabbitMQ, no Kubernetes.

## Rules that apply to every change

- **Money** is an integer number of millimes (`48500` = 48,500 TND). Never floats. Format with the shared helper only.
- **Time** is stored in UTC, shown in Africa/Tunis.
- **Three languages everywhere**: fr (default), ar (RTL), en. No user-visible string in code; every string goes in `packages/i18n`. Add the key in all three files in the same commit. Arabic needs a native-speaker review before release: add every new Arabic key to `packages/i18n/AR-REVIEW.md`.
- **RTL**: use logical CSS only (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`). Never `ml-*`, `mr-*`, `left-*`, `right-*`, `text-left` for layout. Numbers, amounts, phone numbers and tracking codes stay LTR inside Arabic text (`dir="ltr"` on that element).
- **Design tokens**: colors, fonts, radii and spacing come from `packages/ui`. No hex values in app code.
- **Dark mode** exists in the mockups but is L2: build with tokens so it can be switched on later, do not ship the toggle in L1.
- **Accessibility**: labels on every input, visible focus, contrast AA, keyboard reachable. axe-core must pass on every page.
- **Mobile first**: every web page works at 360 px wide with no horizontal scroll.
- **Secrets**: never in code, never in commits, never pasted into a prompt. Use `.env.local` (git-ignored) and `.env.example` with fake values.
- **Personal data**: test data uses fake names and Tunisian-format fake phones. Never real customer data in fixtures, screenshots or prompts.

## Working with Claude Code

- One ticket = one branch = one pull request. Branch name: `<area>/<ticket-id>-short-name`, for example `web/FE-01-home`.
- Commit messages start with the feature or rule IDs: `FE-01 CMD-02: address search field`.
- For anything bigger than one component, start in plan mode, read the plan, then let Claude build.
- Before opening a PR, run `pnpm lint && pnpm typecheck && pnpm test` and the Playwright screenshot check for touched pages. Fix failures, do not skip them.
- Every PR is reviewed by another engineer, a human. Claude can draft the PR description; the author reads the full diff before asking for review.
- Do not edit a package owned by another engineer without telling them. Owners: `apps/web` Helmi (@Helmi-Megdiche), `apps/backoffice` and finance modules Ala (@AlaaSalem12), `apps/driver` Moataz (@mootazkraiem), infrastructure Helmi, testing Moataz. `packages/ui` and `packages/i18n` are shared: changes there need one approval from another owner.
- If the spec and the mockup disagree, the spec wins. Note the gap in the PR.
- If Claude is unsure about a business rule, it stops and asks. It does not invent prices, fees, thresholds or legal text. Placeholders stay visible as `[PRIX]`, `[VILLE]`, `[TÉLÉPHONE]`.
- Read `REVIEW.md` before every push. Reviewer findings are binding; disagree with evidence and wait.
- Update this file when a team-wide decision changes. Put app-specific notes in `apps/<app>/CLAUDE.md`.

## Commands

Node 24 LTS (`.node-version`), pnpm 12 through corepack (`corepack enable`). Run everything from the repo root.

If `pnpm` fails with `Cannot find matching keyid`, the corepack bundled with your Node is too old: `npm install -g corepack@latest`, then `corepack enable` again.

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspaces |
| `pnpm dev` | Dev servers. Web: http://localhost:3000 (redirects to `/fr`) |
| `pnpm build` | Production build of every app |
| `pnpm lint` | ESLint. Also fails on physical CSS classes (`ml-*`, `text-left`...) and on hex colors outside `packages/ui` |
| `pnpm typecheck` | `tsc` in strict mode, every workspace |
| `pnpm test` | Unit tests (vitest): money and date formatting (French `14 h 20`), catalog parity, placeholders and the 15-minute guarantee in the catalogs, `AR-REVIEW.md` in sync, and in `apps/web` the mock data layer, form schemas, tracking-code validator and `?type=` parsing |
| `pnpm test:e2e` | Playwright: builds `apps/web`, then routing tests, `/dev/ui`, and every public page at 1440 and 360 px in fr and ar with axe-core and no horizontal scroll. Also: tracking, zone check and contact flows, 5 MB attachment edge, URL as the source of truth on `/suivi`, pages with JavaScript off, focus after submit, header at 900 to 1440 px in fr, ar and en, metadata and hreflang. Screenshots go to `apps/web/test-results/shots` (git-ignored) |
| `pnpm format` | Prettier (never touches `docs/ui`) |
| `pnpm --filter @fastgo/i18n ar-review` | Regenerate `packages/i18n/AR-REVIEW.md` after adding Arabic keys |

First time only: `pnpm --filter @fastgo/web exec playwright install chromium`.

Before a PR: `pnpm lint && pnpm typecheck && pnpm test`, then `pnpm test:e2e` for the pages you touched, and compare the screenshots with `docs/ui/screenshots`.
