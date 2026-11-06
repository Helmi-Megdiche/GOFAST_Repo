# apps/web

Public site, order flow, auth, client space, merchant space, recipient link. Owner: Engineer 1.
Read the root `CLAUDE.md` first. This file only covers what is specific to this app.

## Stack

Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, next-intl 4, TypeScript strict.
Playwright + axe-core for end-to-end checks. Everything runs on mock data for now.

## Folder layout

```
apps/web/
├─ public/brand/            logo-dark.png (navy backgrounds), logo-light.png (light backgrounds)
├─ public/examples/         bon-de-commande-exemple.pdf (W16 sample slip, marked EXEMPLE, fake data)
├─ e2e/                     Playwright tests (ui, routing, public-site, order-flow, auth) + helpers.ts
├─ playwright.config.ts     builds and serves the app on :3100 with FG_DEV_UI=1
└─ src/
   ├─ proxy.ts              next-intl routing ("/" -> cookie language or /fr). Next 16 name for middleware.
   ├─ global.d.ts           typed message keys and Locale for next-intl
   ├─ i18n/
   │  ├─ routing.ts         locales fr, ar, en; prefix always; detection off
   │  ├─ request.ts         loads the catalogs from @fastgo/i18n, sets the Africa/Tunis time zone
   │  └─ navigation.ts      Link, usePathname, useRouter, redirect: use these, not next/link
   ├─ app/
   │  ├─ fonts.ts           next/font: Poppins, Inter, JetBrains Mono, Noto Sans Arabic
   │  ├─ globals.css        Tailwind + @fastgo/ui theme, scans packages/ui for classes
   │  └─ [locale]/
   │     ├─ layout.tsx      <html lang dir> (the only place), fonts, intl provider, skip link. No chrome.
   │     ├─ (site)/         route group (not in the URL): layout.tsx = header, <main id="main">, footer
   │     │  ├─ page.tsx (home), not-found.tsx, [...rest]/page.tsx (unknown path -> localized 404)
   │     │  ├─ services, commercants, suivi, zones, aide, contact, livreur, legal/[doc]   public site (French slugs in every language)
   │     │  ├─ connexion, inscription, code, mot-de-passe(/nouveau), google-telephone   W18 to W22, noindex
   │     │     │  └─ dev/ui/page.tsx  component showcase (see below)
   │     ├─ (account)/      client space chrome (header, SpaceNav, sign-out, footer): compte (C01 skeleton), noindex
   │     ├─ (pro)/          merchant space chrome, same parts: pro (P01 skeleton), noindex
   │     └─ (cmd)/          order chrome: logo, language, "Enregistrer et quitter", no nav or footer
   │        └─ commander/   entry (first incomplete step), expediteur, destinataire, colis, service,
   │                        verification, code, confirmation, hors-zone (W11 to W17), all noindex
   ├─ components/           app-level components (site-header/footer, mobile-menu, money, page-hero...)
   │  ├─ home/, tracking/, zones/, help/, contact/, driver/   one folder per page that has client forms
   │  ├─ order/             cmd header, step frame, one component per step, price aside, address field
   │  ├─ auth/              W18 to W22 forms, the shared code step (W20), mock Google chooser
   │  └─ dev/ui-showcase.tsx
   └─ lib/
      ├─ data/              mock data layer. Pages read from here; swapped for the API client later.
      │  └─ fixtures/       example data (names, amounts, tracking codes). Never in components.
      ├─ forms/             zod schemas (error codes, not text) and useErrorMessage
      ├─ order/             constants (every unsourced value), draft (the one localStorage module), clock,
      │                     pricing, slots, proof, schemas, steps (guard), request, submit (idempotency)
      ├─ auth/              safeNext (?next= only on this site), in-memory auth flow
      ├─ seo.ts, page.ts    title/description/canonical/hreflang helper, locale + metadata helpers
      ├─ storage.ts         safe localStorage access (missing, full or broken storage never breaks a page)
      ├─ phone.ts, digits.ts   Tunisian phone normalize/mask, Arabic-Indic digits to Latin
      └─ tracking-code.ts, limits.ts   shared validator and generator (FG-XXXX-XXXX), the 5 MB limit
```

## Mock data rules

- Functions in `lib/data` return codes, keys, ISO UTC dates and millimes. **Never display text.** Words come from the catalogs.
- Values GOFAST has not given yet (prices, hours, limits, fees, cities) are `null`: the page prints the
  placeholder in the active language (`placeholders.*`: `[PRIX]`, `[HEURE]`, `[LIMITE]`, `[TARIF]`, `[VILLE]`...).
- `NEXT_PUBLIC_SITE_URL` (see `.env.example`) feeds the canonical and hreflang links.
- `pnpm --filter @fastgo/web test` runs the unit tests of the data layer and the form schemas.

## Order flow and sign-in (Prompt 3)

- The mock "server" keeps its tables in localStorage on this device (`lib/data/mock-db.ts`):
  `fg.mock.accounts`, `fg.mock.codes` (no code is stored: the n-th code sent is a fixture),
  `fg.mock.orders`, `fg.mock.idempotency`, and since ESP-00 the order model: `fg.mock.accountOrders`,
  `parcels`, `missions`, `statusEvents`, `deliveryCodes`, `recipientLinks`, `outbox`, plus `fg.mock.seed`
  ("orders-v1": the fixture orders are built once through `transition`) and `fg.mock.failNext:<op>`.
  The session is `fg.mock.session` (account id, user id, role, kind, contract,
  verified flag, masked phone only); sign-out never touches the `fg.mock.*` tables. The draft is `fg.order.draft.v1`. Nothing else.
- Fixture values, mock only, never in the UI (`lib/data/fixtures/accounts.ts`): password
  `fastgo-demo-2026`; customer `+216 98 000 001`; merchants `+216 71 000 001` (contract validated)
  and `+216 71 000 002` (pending); SMS / e-mail codes `482615`, then `731904`, then `590286`;
  Google chooser: Amel B. (new e-mail) and Sami T. (known e-mail). Team members of the validated
  merchant (same password): Yasmine K. `+216 71 000 011` (admin) and Walid H. `+216 71 000 012`
  (user); both land on `/pro`. Other fake customers: Lina M. (no orders), Karim S., Hana R.
- `localStorage["fg.mock.failNextOrderResponse"] = "true"` makes the next order answer get lost
  after the order was created, and `fg.mock.failNextOrderRequest` loses the next request before
  any order exists (tests of the network cut, R202).
- Zones (`lib/data/zones.ts`): Avenue Habib Bourguiba, Rue Ibn Khaldoun and an in-zone pin offer
  Express, Standard and Programmée (W14); Rue de Marseille offers Express and Standard only (W05's
  answer, and the disabled Programmée card); Route de Sousse is out of zone.
- Unsourced values (code length, validity, resend delay, attempts, password length, draft
  retention) live in `lib/order/constants.ts` only. Prices are example fixtures
  (`lib/data/fixtures/pricing.ts`), labelled "Montants d'exemple".
- Steps read the draft in the browser: each page server-renders its h1 and a busy placeholder, and
  `<noscript>` says ordering needs JavaScript.

## Languages

- Routes are `/fr`, `/ar`, `/en`. French is the default. `/` goes to the language the visitor chose
  last (cookie `NEXT_LOCALE`), otherwise `/fr`. The browser's Accept-Language header is ignored.
- `src/app/[locale]/layout.tsx` is the only place that sets `lang` and `dir`.
- Strings: `useTranslations()` / `getTranslations()`. Keys live in `packages/i18n/src/messages/{fr,en,ar}.json`,
  added in all three files in the same commit. Then run `pnpm --filter @fastgo/i18n ar-review`
  (the unit test fails if `AR-REVIEW.md` is out of date).
- Mockup translations are a reference only (`docs/ui/i18n/mockup-*.json`, keyed by the French text).
  Import strings page by page, with semantic keys.
- Server pages and route-group layouts call `resolveLocale(params)` (`lib/page.ts`) first, to stay
  statically renderable. A layout that skips it makes every page below it render on demand.
- Amounts and dates: `<Money millimes={...} />` and `<DateTime value={...} />` from `components/money.tsx`.
  They format with the shared helpers and wrap the result in `dir="ltr"`. Phone numbers and
  tracking codes: wrap in `<Ltr>` from `@fastgo/ui`.

## Styling rules (enforced by `pnpm lint`)

- Logical classes only: `ms-* me-* ps-* pe-* start-* end-* text-start text-end`. Never `ml-* mr-* left-* right-*`.
- No hex values here. Use the token classes (`bg-orange`, `text-ink`, `border-line`...). The Tailwind
  palette is replaced by the GOFAST tokens, so default colors such as `bg-blue-500` do not exist.
- Dark mode is L2: tokens are ready (`[data-theme="dark"]`), there is no toggle.

## /dev/ui

`/fr/dev/ui` and `/ar/dev/ui` show every component. It is a 404 in production unless `FG_DEV_UI=1`
(set only for the Playwright build). Add each new `packages/ui` component to it, in fr and ar.

## Testing

`pnpm test:e2e` checks, for fr and ar at 1440 and 360 px: `lang` and `dir`, the font stack,
no horizontal scroll, axe-core (WCAG 2 A/AA), and saves a screenshot. Compare it with
`docs/ui/screenshots/<screen>.jpg` by eye, then list what still differs in the PR.
The references are the 1440 px pages scaled to 1080 px, so compare the 1440 px shots.

`e2e/order-flow.spec.ts` and `e2e/auth.spec.ts` cover W11 to W22: every page in fr and ar at 1440 and
360 px, the 5 steps with the SMS code, the double click and the lost answer (R202), the price lines
and the 15-minute expiry with a fake clock (R204, R205, R207), R101, R103, R104, the step guard, the
draft, `?next=`, and every code case. Tests use `page.clock` and the fixture codes.

`e2e/public-site.spec.ts` covers the public site:
- every page in fr and ar at 1440 and 360 px, the home page in en, metadata and hreflang;
- the tracking, zone check, contact (captcha, 5 MB exactly and 5 MB + 1 byte) and driver flows;
- `/suivi`: the URL is the source of truth (search, `?n=` in lower case, bad number, nav link, Back);
- `/fr/suivi` and `/fr/contact` with JavaScript off (the h1 and the form are in the server HTML), and
  forms that take personal data use `method="post"`;
- focus: the captcha and the Suivre button keep it while busy, the confirmation takes it after sending;
- `?type=` on `/contact` (`constructor`, `__proto__` fall back to Question);
- the header at 900, 1000, 1100, 1200 and 1440 px in fr, ar and en: one row, no overlap, no overflow,
  logo 42 px and 44 px buttons from 1200 px, burger menu below 1100 px.
