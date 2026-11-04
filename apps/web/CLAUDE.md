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
├─ e2e/                     Playwright tests (ui.spec.ts, routing.spec.ts)
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
   │  └─ [locale]/          the only layout. Sets <html lang dir>. dir="rtl" for ar.
   │     ├─ layout.tsx, page.tsx, not-found.tsx, [...rest]/page.tsx (unknown path -> localized 404)
   │     └─ dev/ui/page.tsx  component showcase (see below)
   ├─ components/           app-level components (site-header, locale-switcher, money)
   │  └─ dev/ui-showcase.tsx
   └─ lib/data/             mock data layer. Pages read from here; swapped for the API client later.
      └─ fixtures/          example data (names, amounts, tracking codes). Never in components.
```

## Languages

- Routes are `/fr`, `/ar`, `/en`. French is the default. `/` goes to the language the visitor chose
  last (cookie `NEXT_LOCALE`), otherwise `/fr`. The browser's Accept-Language header is ignored.
- `src/app/[locale]/layout.tsx` is the only place that sets `lang` and `dir`.
- Strings: `useTranslations()` / `getTranslations()`. Keys live in `packages/i18n/src/messages/{fr,en,ar}.json`,
  added in all three files in the same commit. Then run `pnpm --filter @fastgo/i18n ar-review`
  (the unit test fails if `AR-REVIEW.md` is out of date).
- Mockup translations are a reference only (`docs/ui/i18n/mockup-*.json`, keyed by the French text).
  Import strings page by page, with semantic keys.
- Server pages call `setRequestLocale(locale)` first, to stay statically renderable.
- Amounts and dates: `<Money millimes={...} />` and `<DateTime value={...} />` from `components/money.tsx`.
  They format with the shared helpers and wrap the result in `dir="ltr"`. Phone numbers and
  tracking codes: wrap in `<Ltr>` from `@fastgo/ui`.

## Styling rules (enforced by `pnpm lint`)

- Logical classes only: `ms-* me-* ps-* pe-* start-* end-* text-start text-end`. Never `ml-* mr-* left-* right-*`.
- No hex values here. Use the token classes (`bg-orange`, `text-ink`, `border-line`...). The Tailwind
  palette is replaced by the FastGo tokens, so default colors such as `bg-blue-500` do not exist.
- Dark mode is L2: tokens are ready (`[data-theme="dark"]`), there is no toggle.

## /dev/ui

`/fr/dev/ui` and `/ar/dev/ui` show every component. It is a 404 in production unless `FG_DEV_UI=1`
(set only for the Playwright build). Add each new `packages/ui` component to it, in fr and ar.

## Testing

`pnpm test:e2e` checks, for fr and ar at 1440 and 360 px: `lang` and `dir`, the font stack,
no horizontal scroll, axe-core (WCAG 2 A/AA), and saves a screenshot. Compare it with
`docs/ui/screenshots/<screen>.jpg` by eye, then list what still differs in the PR.
