# Prompts for the web UI (Engineer 1)

Paste them into Claude Code one at a time, from the repo root. Wait for each one to finish, review the result in the browser, commit, then go to the next prompt. Start each prompt in plan mode (Shift+Tab twice), read the plan, then accept.

All four prompts build the UI with mock data. No API, no database. Each page reads from a typed mock layer (`apps/web/src/lib/data/`) that will be swapped for the real API client later without touching the pages.

---

## Prompt 1: monorepo, design system, languages

```
Read CLAUDE.md and docs/ui/README.md first.

Set up the monorepo described in CLAUDE.md, with only what the web UI needs for now:
- pnpm workspaces + Turborepo, TypeScript strict, shared eslint/prettier/tsconfig in packages/config.
- apps/web: latest stable Next.js (App Router) with Tailwind CSS v4.
- packages/ui: design tokens taken from docs/ui/fg.css (:root values, and the .th-d values kept for a later dark mode), exposed as CSS variables and as a Tailwind theme. Fonts Poppins, Inter, JetBrains Mono and Noto Sans Arabic through next/font, with Noto Sans Arabic used automatically when dir="rtl".
- packages/ui components, built from the classes in fg.css and checked against the screenshots: Button (primary, secondary, ghost, sizes, full width), Input, Select, Textarea, Field (label, hint, error), Card, Badge, Table, KPI tile, Stepper, Tabs, Alert, Avatar, LanguageSwitcher (FR, EN, عربي), Logo, Icon (lucide-react, names mapped from the {i:name} icons in docs/ui/sources).
- packages/i18n: fr, ar, en catalogs. Seed en and ar from docs/ui/i18n/mockup-en.json and mockup-ar.json. Add a helper to format millimes as TND (48500 -> "48,500 TND" in fr, matching the mockup) and dates in Africa/Tunis. Create packages/i18n/AR-REVIEW.md listing every Arabic key, since all of them need a native-speaker review.
- apps/web uses next-intl with routes /fr, /ar, /en (fr default). <html lang> and dir="rtl" are set per locale.
- A /dev/ui page in apps/web that shows every component in fr and in ar, so we can check RTL.
- Playwright set up with one test that opens /dev/ui at 1440 and 360 wide, in fr and ar, saves screenshots to apps/web/test-results/shots, and runs axe-core.

Use logical CSS properties only (see CLAUDE.md). No hex values outside packages/ui.
When done, fill in the Commands section of CLAUDE.md and create apps/web/CLAUDE.md with the folder layout you chose.
```

---

## Prompt 2: public site

```
Read CLAUDE.md, apps/web/CLAUDE.md and docs/ui/README.md.

Build the public site pages in apps/web, in fr, ar and en, from these reference screens (HTML in docs/ui/screens, images in docs/ui/screenshots, compact source in docs/ui/sources/web.txt):
- Main (home, FE-01), with Main-AR and Main-EN as the language references
- W02-Services (FE-02, FE-03), W03-Commercants, W04-Suivi (SUI-01), W05-Zones (FE-04), W06-Aide, W07-Contact (FE-06), W08-Livreur, W09-Legal (FE-05), W10-Introuvable (404)

Shared header and footer as in the screenshots, with the mobile menu. Header buttons link to the order flow and sign-in routes even if those pages are empty for now.
Forms (tracking number, contact, zone check) validate on the client and call functions in src/lib/data that return mock results, including the error and not-found cases.
Keep placeholders like [PRIX], [VILLE], [TÉLÉPHONE] visible.
Skip the dark-mode toggle (L2) and do not build FE-08 SEO pages or FE-09 analytics (moved to L2).

For each page, extend the Playwright test: 1440 and 360 wide, fr and ar, axe-core clean, no horizontal scroll at 360.
Then compare each screenshot with docs/ui/screenshots/<screen>.jpg and fix differences in layout, spacing, type sizes and colors. List what still differs at the end.
```

---

## Prompt 3: order flow and sign-in

```
Read CLAUDE.md, apps/web/CLAUDE.md and docs/spec/fonctionnalites.md (CMD and ESP sections).

Build the order flow and authentication pages from docs/ui (sources in cmd chrome and web.txt):
- W11-Cmd1 to W15-Cmd5: the 5-step order (sender, recipient, parcel, service, review), CMD-01 to CMD-08. Price summary updates at each step from a mock pricing function. Draft kept in local storage if the page reloads (CMD-07); the submit button cannot create two orders on double click.
- W16-Confirmation (tracking number, PDF order slip button, CMD-06), W17-HorsZone.
- Order without an account: phone check by SMS code creates a light account (CMD-03), using W20-Code.
- W18-Connexion, W19-Inscription, W20-Code, W21-MotDePasse, W22-GooglePhone (ESP-01, ESP-09). Google sign-in is a button that calls a mock for now.
- Address field: search input + map pin + landmark text (CMD-02). Use a placeholder map component for now; the map provider is decided later.

Form state with react-hook-form and zod. Every error message in fr, ar, en.
Same Playwright and screenshot comparison steps as before, plus one test that goes through the 5 steps and checks the double-click case.
```

---

## Prompt 4: client space, merchant space, recipient link

```
Read CLAUDE.md, apps/web/CLAUDE.md and docs/spec/fonctionnalites.md (ESP, PRO, SUI sections).

Build from docs/ui:
- Client space C01 to C09 (ESP-02 to ESP-06).
- Merchant space P01 to P07 and P09 (PRO-01 to PRO-06). P09 labels: A6 PDF only, thermal is L2. Skip P08 (API, L2).
- Recipient link D1 to D5, mobile first, no account, opened by a token in the URL (SUI-02, SUI-03). D1AR-Suivi and D1EN-Suivi are the language references.
- PWA manifest and install prompt for the client side (FE-13), following IP01 and IP02.

Also from Prompt 3, left for the client space:
- CMD-08: cancelling an order (L1 in the spec). W16 has no cancel button yet.
- CMD-02: remembered addresses and saved recipients for the next order ("Enregistrer ce destinataire" is mock only today).
- ESP-01, item 13 of PR #5 (confirmed by Helmi): an "add or confirm my e-mail" screen in the client space. The e-mail typed at sign-up is never attached to the account until a code sent to that address confirms it, so until this screen ships a new account cannot sign in by e-mail.
  - It sends a code to the e-mail address and attaches the e-mail only after the right code (a wrong or expired code attaches nothing).
  - It gives the same answer whether or not the e-mail already belongs to an account (no account enumeration) when the code is sent and when a code is wrong or expired. Only after the right code, which proves the person controls the address, may the screen say the e-mail is already used (as W20 does for a phone).
  - R101 stays enforced: an e-mail that belongs to another customer is never attached, even after the right code.
  - Every text and error is in fr, ar and en.
  - Once the e-mail is confirmed, the account can sign in by e-mail (W18).

Tests for the e-mail screen (unit and Playwright):
- The e-mail is not attached after "send code", nor after a wrong or expired code; it is attached after the right code.
- The answer and screen after "send code" are identical for an e-mail with an account and one without (same text, same next step), and a wrong code gives the same error for both.
- An e-mail already on another account is not attached after the right code (R101), and the other account is unchanged.
- The screen, its errors and its success message render in fr, ar (RTL) and en, with axe-core passing.
- After confirmation, W18 sign-in by e-mail works for that account; before it, it fails as it does today.

Protect /compte and /pro routes with a mock session. Mock data must include the empty states (no order yet, no invoice) and the error states.
Same Playwright and screenshot comparison steps as before.
```
