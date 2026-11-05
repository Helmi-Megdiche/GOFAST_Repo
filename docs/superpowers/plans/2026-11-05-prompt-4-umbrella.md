# Prompt 4 plan (revised against `regles.md`): client space, merchant space, recipient link, PWA

## Context

Prompt 4 of `docs/prompts/web-ui.md` builds the last web surfaces on mock data. They are:
- the client space (C01–C09, ESP-02 to ESP-06);
- the merchant space (P01–P07 and P09, PRO-01 to PRO-06);
- the recipient link (D1–D5, SUI-02 and SUI-03);
- the installable web app (FE-13, from IP01 and IP02).

Prompt 3 also left these for Prompt 4:
- CMD-08: cancelling an order;
- CMD-02: remembered addresses and saved recipients;
- PRO-04: COD for merchants;
- the "add or confirm my e-mail" screen (ESP-01, item 13 of PR #5), with its tests.

**Sources, in this order.**
1. `regles.md`, the cahier extract Helmi sent on 5 Nov 2026. It wins over the earlier readings of this plan.
2. `docs/spec/fonctionnalites.md`, which keeps the feature IDs and lots.
3. The mockups.

- When the spec or the rules disagree with a mockup, the spec and the rules win, and the gap is noted.
- Anything `regles.md` does not cover goes to **Helmi**, not FastGo (section 10b). FastGo gets only the values the cahier marks "à fixer" and the open decisions D2 to D10 (section 10a).

**Starting point.**
- PR #5 is merged: on 5 Nov `origin/main` is `7d3f41e` and contains `c215500`.
- Then PR 0 is cut from the new `main`. **Its first commit** adds:
  - `docs/spec/regles.md`, the uploaded file unchanged;
  - this plan, as `docs/superpowers/plans/2026-11-05-prompt-4-umbrella.md`;
  - one line in `CLAUDE.md` under "Product" pointing to `docs/spec/regles.md`. It is a team-wide file, so the PR says so and the team is told.
- The local branch `web/ESP-02-client-space` has no commits and is deleted.

## 1. Decisions shared by every part (ADRs, from engineering:architecture)

### ADR-1: order, parcel and mission states, as in `regles.md`

**Context.**
- Prompt 3's `StoredOrder` has no owner, no state and no parcels.
- `regles.md` defines three separate state machines:
  - an order carries its own state until pickup (Prise en charge);
  - after that, each parcel has its own state and the order's result is derived from the parcels;
  - a mission has its own thread, and its `arrivedAt` is the reference for cancelling.
- "Le serveur refuse tout autre changement d'état."

**Decision: one spelling everywhere.**
- The code identifiers below are the only names used in the data, the tests and the catalog keys (`orders.status.<id>`, `parcels.status.<id>`).
- The French label is the cahier's name. The text the client sees is the cahier's "Ce que voit le client" column, verbatim in fr.
- ar and en are translations that go to AR-REVIEW.

**Order (`OrderStatus`, in `lib/data/states.ts`):**

| id | Cahier name | Client sees (fr, verbatim) | Allowed next |
|---|---|---|---|
| `received` | Reçue | Nous avons reçu votre commande | `confirmed`, `canceled` |
| `confirmed` | Confirmée | Votre commande est confirmée | `assigned`, `canceled` |
| `assigned` | Attribuée | Un livreur vient chercher votre colis | `picked_up`, `pickup_failed`, `canceled`, `confirmed` (driver removed) |
| `pickup_failed` | Collecte ratée | La collecte n'a pas pu se faire | `confirmed` (new slot), `canceled` |
| `picked_up` | Prise en charge | Vos colis sont récupérés, avec leur nombre (`{count}` parcels) | `in_transit` |
| `in_transit` | En route | Votre livraison est en cours | one of the four outcomes, derived |
| `delivered` | Livrée | the outcome and the detail per parcel | end |
| `partially_delivered` | Livrée en partie | the outcome and the detail per parcel | end |
| `returned` | Rendue | the outcome and the detail per parcel | end |
| `lost` | Perdue | the outcome and the detail per parcel | end |
| `canceled` | Annulée | Votre commande est annulée | end |

**Parcel (`ParcelStatus`):**

| id | Cahier name | Allowed next |
|---|---|---|
| `to_collect` | À prendre | `taken`, `canceled` |
| `taken` | Pris | `at_depot`, `in_transit`, `lost` |
| `at_depot` | Au dépôt | `in_transit`, `returning`, `lost` |
| `in_transit` | En route | `handed_over`, `delivery_failed`, `lost` |
| `delivery_failed` | Remise ratée | `at_depot`, `in_transit`, `returning`, `lost` |
| `returning` | Retour | `returned`, `lost` |
| `handed_over` | Remis | end |
| `returned` | Rendu | end |
| `lost` | Perdu | `at_depot` (the parcel turns up again) |
| `canceled` | Annulé | end |

**Mission (`MissionStatus`, `kind: "pickup"|"delivery"`):**
- The states: `proposed`, `accepted`, `refused`, `expired`, `arrived` ("livreur arrivé"), `finished`.
- The cahier lists these states but not their transitions. Transitions (my reading, accepted by Helmi as H1):
  - `proposed` → `accepted`, `refused` or `expired`;
  - `accepted` → `arrived`;
  - `arrived` → `finished`.
  - **Early end:** the active mission goes to `finished` with an `endReason`, from `proposed`, `accepted` or `arrived`:
    - `"driverRemoved"` when the order goes `assigned → confirmed`;
    - `"pickupFailed"` when the order goes `assigned → pickup_failed`;
    - `"orderCanceled"` when the order is canceled.
- A mission row holds `offeredAt`, `expiresAt`, `arrivedAt`, `finishedAt` and `endReason: null|"driverRemoved"|"pickupFailed"|"orderCanceled"`.
- **"The pickup mission"** always means the order's latest pickup mission that is not `refused`, `expired` or ended with an `endReason`. Its `arrivedAt` is the one CMD-08 reads.

**One transition function and an event log.**
- `transition(subject: {type: "order"|"parcel"|"mission", id}, to, actorId): {ok} | {refused: "illegalTransition", from, to}` in `lib/data/states.ts`.
- It uses only the tables above.
- Every change writes `fg.mock.statusEvents` (`subjectType, subjectId, fromStatus, toStatus, actorId, occurredAt`). A driver's position is **not** stored in the mock: there is no driver app here.
- Fixtures are built **through `transition`**, so an illegal fixture fails the tests.
- **Derived order states** ("La commande porte seule son état jusqu'à la prise en charge. Ensuite, chaque colis a le sien"):
  - a direct `transition(order, …)` to `picked_up`, `in_transit`, `delivered`, `partially_delivered`, `returned` or `lost` is refused with `{refused: "derivedState"}`;
  - instead, every parcel transition recomputes `deriveOrderOutcome` and, when the result differs from the order's last state, writes the order event itself (`actorId: "system"`), in the same write. C03 and `/suivi` read those order events;
  - the order reaches `picked_up` on the first parcel `to_collect → taken` ("Le livreur scanne au moins un colis");
  - **a scan checks the order first:** `transition(parcel, "taken")` reads the order before the parcel table, and refuses with `{refused: "orderNotAssigned"}` unless the order is `assigned` (first scan) or already `picked_up` or later (the other parcels of the same pickup). So a scan in `received`, `confirmed` or `pickup_failed`, or after a cancel (parcel already `canceled`), always returns `orderNotAssigned`, never `illegalTransition`;
  - **only a normal pickup finish** (`arrived → finished` with `endReason: null`) moves the parcels still `to_collect` to `canceled` ("colis jamais remis au livreur"), actor `system`;
  - **a normal finish needs a taken parcel:** `arrived → finished` with `endReason: null` is refused with `{refused: "noParcelTaken"}` unless at least one parcel of the order is `taken`. So a normal finish can never cancel every parcel while the order stays `assigned`;
  - an early end with `driverRemoved` or `pickupFailed` **does not touch the parcels**: they stay `to_collect` for the next mission. With `orderCanceled`, `cancelOrder` cancels them itself (part A);
  - **a final order stays final** (H4, decided). If a `lost` parcel turns up (`lost → at_depot`), the parcel's state changes and `lossReported` is recomputed, but no order event is written and the order outcome does not change.

**Parcels in the mock.**
- An order has one or more parcels, in table `fg.mock.parcels`. Each parcel has:
  - `barcode`, `size`;
  - `weightDeclaredG` and `weightMeasuredG|null`;
  - `declaredValueMillimes|null` and `codMillimes|null`;
  - `proofLevel`, `attempts` and `status`;
  - `failure: {reason, photo}|null` (R502) and `proof: {kind, capturedAt}|null`.
- The handover code is one per parcel, in table `fg.mock.deliveryCodes` (`parcelId, code, failedAttempts, expiresAt`).
  - The cahier stores `code_hash`. **Mock only:** the mock keeps the code itself, because the recipient link must show it (D1, H2 decided). The server-side gap goes to the cahier v2 list (section 18).
  - Only the recipient-link reader can see this table.
- **Parcels from W13 (listed default, section 9).** The W13 fields are `type`, `count`, `weightKg` and `declaredValueMillimes`, one set for the whole order (the code on `web/CMD-01-order-flow` and the W13 mockup both show one "Nombre de colis", one "Poids estimé" and one "Valeur déclarée"). `regles.md` puts `weight_declared_g`, `declared_value_millimes` and `cod_millimes` on `parcels` and says nothing on splitting, so nothing contradicts this:
  - a count of N creates N parcels of that `size`;
  - `splitWhole(total: number, n: number): number[]` in `lib/order/split.ts` gives each parcel `floor(total / n)` and the **last parcel the remainder**, so the parts sum to the total exactly. It is used for the weight (in grams) and for the declared value (millimes, when set; otherwise every parcel has `null`);
  - **kg to grams, no float:** `kgTextToGrams(text): number | {refused: "tooManyDecimals"}` in `lib/order/split.ts` converts W13's decimal text with integers only (integer part × 1000 + the decimals right-padded to 3 digits). More than 3 decimals is refused;
  - for a merchant, W13 shows one "Montant à encaisser" **per parcel** (N fields, part E). The W13 mockup has no COD field at all; PRO-04 wins and the gap is noted in PR E.
  - **one import row is one order with one parcel** (part E).
- **`deriveOrderOutcome(parcels): "picked_up"|"in_transit"|"delivered"|"partially_delivered"|"returned"|"lost"`.**
  - While any parcel is not final:
    - `in_transit` once any counted parcel is `in_transit`, `at_depot`, `delivery_failed`, `returning` or final;
    - otherwise (every counted parcel `taken`) `picked_up`.
  - `canceled` parcels are **ignored** (H3, decided). After pickup at least one parcel is `taken`, so the set that counts is never empty.
  - When every counted parcel is final:
    - all `handed_over`: `delivered`;
    - at least one `handed_over` and the others `returned` or `lost`: `partially_delivered`. T19 (2 handed over and 1 returned) is sourced; `handed_over + lost` is my reading, accepted as H3;
    - none `handed_over` and at least one `returned`: `returned` ("…se termine en Rendue et signale la perte");
    - all `lost`: `lost`.
  - `lossReported: true` whenever **any** counted parcel is `lost`, whatever the outcome. It is recomputed on every parcel change, including after the order is final (H4).
  - Once the order is final, `deriveOrderOutcome` is no longer applied to it (H4).
- **Proof level (section 4 table):** `proofLevelFor(parcel, order)` returns one of these, the strongest when several apply:
  - `codeOrPhotoWithPosition`: a normal parcel with no COD;
  - `codeOrSignatureAndPhoto`: fragile, or stronger proof asked by the client (`order.strongerProofRequested`, default `false`; not offered on any L1 screen, H22 decided, so only a fixture sets it);
  - `codeOrAgentPhoneWithSignatureAndPhoto`: COD on this parcel, or the **order's total declared value** (the sum over its parcels, W13's value before the split) above the threshold. The threshold never compares one parcel's share. COD still sets the level per parcel.
  - **One threshold** (H23, decided): `PROOF_VALUE_THRESHOLD_MILLIMES = null` covers both "valeur au-dessus du seuil fixé" (proof table) and "autre seuil à fixer" (required code, parameter table). There is no second constant.
  - A handover code is always required on a parcel with COD, and on every parcel of an order whose total declared value is above that threshold once it is set (parameter table, proposed).
  - Fixture check (R401): every `handed_over` parcel has a proof that matches its level.
- **Public `/suivi` (R405).**
  - `publicTrackingOf(order)` returns only `{status: OrderStatus, history: [{status, atUtc}], fromCity, toCity, parcelCount, parcelOutcomes: ParcelStatus[]}`.
  - It returns no name, phone, address, driver, position or code.
  - Prompt 3's `TrackingStep` and its `tracking.*` keys are **replaced** by the order states above. `/suivi` shows the client wording.
  - A unit test checks the returned keys against a fixed allowlist.

**Other fields of `AccountOrder`** (in `lib/data/account-orders.ts`, table `fg.mock.accountOrders`):
- `code`, `ownerAccountId`, `createdByUserId`;
- `service`, `sender`, `recipient`, `pickupPointId`;
- `recipientLocale` (R903): copied from the existing W12 field `recipient.smsLanguage` (`draft.ts`, already sent in the order request but not stored today). PR A stores it; no new form field;
- `status`, while the order carries it (until `picked_up`);
- `totalMillimes` and `priceLines: [{kind, millimes}]`: the quote fixed at creation, each element kept (R204), never priced again (R206);
- `paymentMode: "cashPickup"|"cashDelivery"|"account"`, `freightPayer: "sender"|"recipient"`, `freightPayerAccepted: boolean` (R607);
- `strongerProofRequested: boolean`;
- `cancel: {at, fee: "none"|"applies"|"backOfficeDecides"}|null`.

**`createOrder`:**
- It writes the order, its parcels, the recipient link and the tracking SMS to `fg.mock.outbox`, all inside its existing idempotent path. A replayed key writes none of these again.
- **The outbox keeps `{template, params, locale}`**, never rendered text. `params` holds the sender's name and phone, so closing an account can erase them (part B).
- **It sets `freightPayer` from the payment mode:** `cashDelivery` gives `recipient`; `cashPickup` and `account` give `sender`. The request does not carry it.
- **The tracking SMS is written once, at creation (`received`).** That is the "commande prise" moment of SUI-04 and T02; no other state sends it in the mock.
- It creates the N parcels from W13 with `splitWhole` (above).
- `codMillimes` is `null` for individuals' orders. PR E adds the per-parcel COD fields to the merchant order flow (PRO-04); the import and the fixtures fill it too.

**Consequences.**
- One model feeds C01–C03, P01, P04, P05, D1–D5 and `/suivi`.
- `apps/web/CLAUDE.md` lists the new tables.
- `fg.mock.orders` stays the idempotency store.

### ADR-2: access by mock session, checked in the browser

- **Context.** The session lives in localStorage (`lib/data/session.ts`), so the server cannot read it.
- **`Session` gains `userId` and `role`:**
  - `role: "admin"|"user"|null`, where `null` means an individual customer;
  - inside a company, the cahier gives only a `role` field (`company_members.role`), with no names;
  - **roles (H5, decided):** `admin` and `user`. The admin manages the team, the pickup points and the company, and sees COD, invoices and statements. A user creates, tracks and cancels the company's orders. Both see all the company's orders.
  - `sessionFor` sets them, and team-member fixtures get their own phones.
- **After sign-in,** `homeFor(session)` sends a merchant to `/pro` and a customer to `/compte`.
- **Routing:**
  - PR 0 deletes the placeholder `(site)/compte/page.tsx`, since two groups serving `/compte` is a build error;
  - `apps/web/CLAUDE.md` gets the new folder map.
- **Static pages:**
  - `[code]` and the filters are read on the client, with `useParams` and `useSearchParams` inside `<Suspense>`;
  - "not found" is rendered on the client.
- **The guard** (`components/account/require-session.tsx`, props `kind` and an optional `role`):
  - it shows the server h1, a busy placeholder and a `<noscript>` note;
  - with no session, it redirects to `/connexion?next=`;
  - with the wrong space, it redirects to the other space's home;
  - with the wrong role, it shows "not allowed".
- **Not found (EX02–EX12):** M means "ses propres données seulement. Hors de ce périmètre, le serveur renvoie 404". Every data function takes the session, and a record outside the session's scope returns the same `notFound` as a missing record.
- **Sign-out** clears the session, the pending Google sign-in and the order draft. It never clears the `fg.mock.*` tables, which play the server.
- **Rejected:** a cookie read by `proxy.ts`. It would be a second source of truth with no server state behind it.

### ADR-3: the recipient link (R406, R903, T11, T50)

- **Route.** `/[locale]/l/[token]`. There is **one link per order** (`recipient_links.order_id`), stored in `fg.mock.recipientLinks` as `{orderCode, locale, expiresAt|null}`.
- **Token.** 22 base64url characters from `crypto.getRandomValues(16 bytes)`. "Son propre code aléatoire": the token is not derived from the tracking number. The mock keys the table by the token, where the real API keeps `token_hash`.
- **Expiry (R406, "cesse de fonctionner après la livraison, passé le délai fixé"):**
  - when the order reaches a final state, `expiresAt` = that time + `RECIPIENT_LINK_AFTER_DELIVERY_MS`;
  - that constant is in `lib/order/constants.ts` at **24 h**, marked `// unsourced: "délai fixé", R406`, and listed in section 9.
- **A bad token** (unknown, expired, or a canceled order) gets one neutral page in the mock: same text, `noindex`.
  - **Real API (see section 12):** it returns 404 and limits the attempts (T11: "les essais automatiques sont bloqués"). The mock cannot block repeated attempts, so the e2e test checks only the identical neutral page.
- **Language:**
  - the default language is `recipientLocale` (R903, fr by default), and the recipient can switch;
  - the tracking number, the amount and the code are the same characters in fr, ar and en, inside `dir="ltr"` (R904, T50).
- **Referrer:**
  - `headers()` in `next.config.ts` sets `Referrer-Policy: no-referrer` on `/:locale/l/:path*`, with `metadata.referrer` as a backup;
  - a test checks that no request from `/l/` carries a Referer.

### ADR-4: the PWA has a manifest and no service worker in L1

- **Manifest.** A per-locale manifest route, `app/[locale]/manifest.webmanifest/route.ts`, with:
  - `lang`, `dir`, `name`, `start_url /<locale>/compte`, `scope /`, `display: standalone`;
  - one shared `id`;
  - its own check of `params.locale`, returning 404 for an unknown locale, because the proxy skips paths that contain a dot.
- **Install:**
  - Android and Chrome: `beforeinstallprompt`, behind a C01 banner;
  - iPhone: the IP01 steps;
  - the banner is hidden in `display-mode: standalone`.
- **No service worker.** Push is APP-04, which is L2. T02 says the tracking SMS "arrive même sans notification autorisée". So SMS (the mock outbox) is what carries the important messages.

### ADR-5: errors in the mock layer

- Every new data function throws `NetworkError` for a network failure. A business refusal is a tagged result.
- `consumeFailNext(op)` in `mock-db.ts` reads and removes `fg.mock.failNext:<op>`.
- The keys `failNextOrderResponse` and `failNextOrderRequest` stay as aliases, so the Prompt 3 tests still work.

### ADR-6: replays follow the cahier's API table

Section "Routes API concernées", column "Rejeu":
- **Cancel** (`/v1/orders/{id}/cancel`): replay **by state**. Cancelling an order that is already `canceled` returns `canceled` again, with no key.
- **Import** (`/v1/order-imports`): replay **by key**.
- **Claims** (`/v1/tickets`): replay **by key**.
- **Recipient link** (`/v1/recipient-links/{token}`, PATCH): replay **by state**. Choosing the same slot again is a no-op.
- **COD payouts:** read only, for the merchant.

### Shared UI rules (design:accessibility-review and modern-web-guidance)

This section is unchanged from the first plan.

**Tables** (C02, C04, C06, P03, P04, P05, P07):
- a real `<table>` with a `<caption>` and `<th scope>`;
- wrapped in `role="region" tabindex="0" aria-labelledby=<caption>`;
- below 600 px, the table becomes stacked cards through `@container`, with the column labels injected (guide `responsive-table`);
- logical properties only.

**Filters** (C02):
- the chips are a `ChipNav` of links that write the filter into `?statut=`, and the URL is the source of truth, as on `/suivi`;
- the search field has a label;
- the result count is announced in a polite live region.

**Confirmations** (cancel an order, close the account, remove a team member, remove an address):
- a native `<dialog>` opened with `showModal()`, named with `aria-labelledby`;
- `autofocus` on the safe button;
- closed with `<form method="dialog">`;
- no `role="dialog"`, no focus trap, no body scroll lock (guide `dialog`);
- this needs a `Dialog` component in `packages/ui`, which needs another owner's approval.

**Other rules:**
- **Charts** (P01): a text alternative plus the same data in a visually hidden table.
- **Maps** (D2): the keyboard path of `MapPlaceholder`, with its live region (WCAG 2.5.7).
- **Privacy:**
  - phones are masked in lists, on labels and on the link;
  - the cause of a permission request is explained before the browser prompt (guide `privacy`);
  - sign-out clears the session and the draft.
- **Names:** CMD-08 uses `CancelPlacedOrder` and the `orders.cancel.*` namespace. The existing draft-cancel dialog (`cancel-order.tsx`, `cmd.cancelConfirm.*`) keeps its meaning and moves onto `Dialog`.
- **Pages:**
  - every page in fr, ar and en, at 1440 and 360 px, with no horizontal scroll, one h1 and axe clean;
  - focus goes to the h1 after each route change and to the first error after a failed submit;
  - amounts, codes and phones stay in `dir="ltr"`.

## 2. Part 0 and part A: the base, then client orders (ESP-03, ESP-04, CMD-08, SUI-05)

**PR 0, branch `web/ESP-00-account-base`.**
- First commit: `docs/spec/regles.md`, the umbrella plan, and the `CLAUDE.md` pointer.
- Then:
  - ADR-1 to ADR-6, with `states.ts`, `account-orders.ts`, parcels, missions, the event log, `deriveOrderOutcome`, `proofLevelFor`, `publicTrackingOf`, the outbox and recipient-link minting in `createOrder`;
  - the new `/suivi` texts;
  - the `(account)` and `(pro)` shells, with every nav entry and every C01 and P01 slot in place;
  - `Dialog` and the responsive table (`packages/ui`, with `/dev/ui` entries);
  - all fixtures: accounts, contracts, orders with parcels, built through `transition`.
- **Tests (unit, `states.test.ts`):**
  - every allowed transition in the three tables passes;
  - every other pair is refused (a generated matrix);
  - a direct order transition to each derived state is refused with `derivedState`;
  - the first parcel scan writes the order's `picked_up` event; a parcel change that alters the outcome writes exactly one order event, and one that does not alters nothing;
  - a normal pickup finish (`endReason: null`) cancels the parcels still `to_collect`;
  - **retry after driver removed:** `assigned → confirmed` ends the mission with `driverRemoved`; the parcels stay `to_collect`; a new mission, then `confirmed → assigned`, and every parcel can be scanned `to_collect → taken`;
  - **retry after failed pickup:** `assigned → pickup_failed` ends the mission with `pickupFailed`; the parcels stay `to_collect`; `pickup_failed → confirmed` (new slot), a new mission, `assigned`, and every parcel can be scanned;
  - a scan in `received`, `confirmed` or `pickup_failed` is refused with `orderNotAssigned`; **after a cancel** (parcel `canceled`) the scan returns `orderNotAssigned`, not `illegalTransition`;
  - **`noParcelTaken`:** `arrived → finished` with `endReason: null` and no parcel `taken` is refused, the parcels stay `to_collect` and the order stays `assigned`; with one parcel `taken` it passes and cancels the rest;
  - `kgTextToGrams`: `"0.1"` = 100, `"1.005"` = 1005, `"2"` = 2000; `"1.0005"` is refused with `tooManyDecimals`;
  - **threshold on the order total** (test threshold injected): a 3-parcel order whose total declared value is above it while each share is below gives every parcel the strongest level; COD on one parcel raises only that parcel;
  - **`freightPayer`:** `createOrder` with `cashDelivery` stores `recipient`, with `cashPickup` stores `sender`, with `account` stores `sender`;
  - the outbox SMS is stored as `{template, params, locale}`;
  - **H4:** on a final order, a `lost` parcel going `lost → at_depot` changes the parcel, recomputes `lossReported`, and writes no order event;
  - `splitWhole(1000, 3)` is `[333, 333, 334]`, `splitWhole(100000, 3)` is `[33333, 33333, 33334]`, `splitWhole(5, 1)` is `[5]`; for N from 1 to 99 and random totals, the parts sum to the total and every part is an integer ≥ 0;
  - `createOrder` with W13 count 3 creates 3 parcels of the chosen `size`, with the split weights and values;
  - each change writes one event;
  - `deriveOrderOutcome`: `picked_up` while every counted parcel is `taken`; `in_transit` once one is `in_transit`, `at_depot`, `delivery_failed`, `returning` or final; all four outcomes, T19 (2 handed over + 1 returned gives `partially_delivered`), returned + lost gives `returned` with `lossReported`, handed over + lost gives `lossReported`, and canceled parcels are ignored;
  - `proofLevelFor`: each row of the section 4 table, and the strongest level winning when several apply;
  - every `handed_over` fixture parcel has its proof (R401);
  - `publicTrackingOf` keys match the allowlist (R405);
  - a replayed `createOrder` key writes no second order, parcel, link or SMS.
- **Tests (e2e, `suivi`):** each order state shows its client wording in fr, ar and en, with no personal data in the HTML.

**PR A, branch `web/ESP-04-client-orders`.**

| Route | Screen | Builds |
|---|---|---|
| `/compte` | C01 | Greeting. Orders in progress, as a list (ESP-03 is plural). Last deliveries. The "À régler" tile. The slots for part B (frequent recipients) and part G (install banner) |
| `/compte/commandes` | C02 | Search, the mockup's chips plus the month chip, in `?statut=&mois=&q=`. A canceled order shows under "Toutes". Pagination |
| `/compte/commandes/[code]` | C03 | Timeline from the event log. Each parcel with its state, attempts and failure reason. Price fixed at creation, each `priceLines` element shown (R204, R206). Declared and measured weight per parcel when measured (R208, below). Order slip. Proof per parcel (SUI-05). The CMD-08 action (below) |
| `/commander/confirmation` | W16 | The same CMD-08 action |
| `/commander/verification` | W15 | R504: "Frais d'un nouvel essai : [FRAIS]" and "Frais de retour : [FRAIS]" before validating (D7). R607: when the recipient pays the freight, a required checkbox restating R607 (the sender pays if the recipient refuses, amounts `[FRAIS]`); validating is blocked until it is checked, and `freightPayerAccepted` is stored |

**R903.** W12 already has "Langue du SMS et du lien" (`recipient.smsLanguage`, fr by default). PR A only carries it into the stored order as `recipientLocale`. No W12 change.

**R208 (weight).** C03 shows "Poids déclaré" and "Poids mesuré" when `weightMeasuredG` is set. The notice "le client est prévenu avant la facture" needs the tolerance, which is "à fixer": `WEIGHT_TOLERANCE_G = null`, so no notice is computed and none is shown until it is set.

**CMD-08 (R212, T06, EX07).** The rule: "Le client annule gratuitement avant l'arrivée du livreur, avec frais ensuite selon les CGV. Après la prise en charge, il passe par une réclamation".

`cancelOption(order, pickupMission)` returns:
- `free` in `received` and `confirmed`, and in `assigned` while the pickup mission has no `arrivedAt`;
- `withFee` in `assigned` once `arrivedAt` is set, before `picked_up`. The dialog shows "Des frais d'annulation s'appliquent selon les CGV : [FRAIS]" **before** the client confirms. The amount is D7.
- `mayHaveFee` in `pickup_failed` (H6, decided): the failure may not be the client's fault (R505), so the back-office decides. The dialog says "Des frais d'annulation peuvent s'appliquer selon les CGV : [FRAIS]" **before** the client confirms;
- `free` in `confirmed` again after `pickup_failed` (new slot): the new pickup mission has no `arrivedAt` (H6, decided);
- `claimOnly` from `picked_up` on: **no cancel button**, only "Ouvrir une réclamation", which opens C07 with this order;
- `none` for a final state.

`cancelOrder(session, code, {acceptedFee: boolean}): canceled{fee} | feeRequired | claimOnly | notCancellable | notFound`:
- it checks the state and the mission again at call time;
- `withFee` or `mayHaveFee` without `acceptedFee` returns `feeRequired`, and the dialog re-opens showing the fee line;
- `cancel.fee` is `"none"` for `free`, `"applies"` for `withFee`, `"backOfficeDecides"` for `mayHaveFee`;
- **one write** cascades: the order to `canceled`, every parcel `to_collect → canceled` ("Annulé : Commande annulée"), and the pickup mission to `finished` with `endReason: "orderCanceled"`;
- a final state other than `canceled` returns `notCancellable`;
- replay by state: a canceled order returns `canceled` again, with no new event;
- R601 (the invoice for a cancel with a fee) is issued by the back-office; the mock records only `cancel.fee`.
- Who can cancel: an individual for their own orders, and both company roles (`admin`, `user`) for the company's orders (EX07, H5 decided).

**Mock data.**
- `acc-customer` has orders in every order state:
  - `assigned` both before and after `arrivedAt`;
  - `pickup_failed`;
  - one 3-parcel order ending `partially_delivered` (T19).
- `acc-customer-empty` (Lina M., `+216 98 000 003`) has nothing.
- An order of another account, for the not-found check.
- Flags: `listOrders`, `cancelOrder`.

**Tests.**
- **Unit:**
  - `cancelOption` for every order state, for `assigned` with and without `arrivedAt`, for `pickup_failed` (`mayHaveFee`), and for `confirmed` after `pickup_failed` (`free`);
  - `cancelOrder`: free (`fee: "none"`), `feeRequired`, then `canceled{fee:"applies"}` with `acceptedFee`, `canceled{fee:"backOfficeDecides"}` from `pickup_failed`, `claimOnly` and `notCancellable`;
  - a `user` and an `admin` of the company can both cancel a company order;
  - the cascade: parcels `canceled`, mission `finished` with `orderCanceled`, all in one write;
  - replay by state;
  - **R605:** `createOrder` for `acc-customer-return-due` returns `returnBalanceDue` with `cashPickup` and with `cashDelivery`; with a zero balance both pass. ("Compte client" is not a pass case: R104 refuses it for an individual);
  - **R607:** `createOrder` with `cashDelivery` (so `freightPayer: "recipient"`) and `freightPayerAccepted: false` is refused; with `true` it passes;
  - **R903:** a request with `recipient.smsLanguage: "en"` stores `recipientLocale: "en"`, and the outbox SMS is in en;
  - not-found for another account's order;
  - lists are scoped;
  - search and filter.
- **E2e (`account.spec.ts`):**
  - **T06 in three cases:**
    - free cancel in `confirmed`;
    - after arrival, the dialog shows `[FRAIS]` before the confirm, and the order ends `canceled`;
    - after pickup, there is no cancel button and the claim link opens C07 pre-filled.
  - Cancel from `pickup_failed` shows "peuvent s'appliquer … [FRAIS]" before the confirm.
  - **R605:** the return-due customer chooses "cash on pickup", then "cash on delivery"; each time W15 says what is owed (`returnBalanceMillimes`, money helper) and that it must be settled first.
  - **R607:** W15 blocks validation until the port dû box is checked.
  - **R903:** pick "English" in W12's existing "Langue du SMS et du lien", and the outbox SMS is in en.
  - **W13 parcels:** an order with "Nombre de colis" 3 shows 3 parcels on C03, whose weights add up to the W13 weight.
  - **R204, R208:** C03 shows each price line, and both weights on a measured parcel.
  - **Stale page:** C03 opened while free, then the mission arrives in another tab, then confirm gives the fee dialog. And C03 opened while free, then `picked_up`, then confirm gives "passez par une réclamation" with no cancel.
  - Double-click cancel.
  - W15 shows the R504 lines.
  - Guard and redirects (no session, wrong space, merchant lands on `/pro`).
  - Sign-out clears the draft.
  - Empty states, and the error flags with retry.
  - Another account's order shows not-found.
  - The filters survive a reload.
  - `checkPage` on C01–C03.
- **Shots:** C01, C02 and C03.
- **Not built:** C02 "Exporter" (H7, not in L1) and C03 "Contacter le livreur" (ESP-07 is L2, SUI-08 is L3). Both are listed as mockup gaps in the PR.

## 3. Part B: profile, addresses, e-mail, closing (ESP-02, CMD-02, ESP-01)

**PR B, branch `web/ESP-02-profile-addresses`.** The routes are unchanged: `/compte/adresses` (C08), `/compte/profil` (C09) and `/compte/email`.

**Unchanged from the first plan:**
- **Address book and saved recipients** (cahier tables `addresses` and `recipients`, with `locale` on the recipient):
  - mock tables `fg.mock.addresses` and `fg.mock.recipients`;
  - picking a saved address or recipient on W11 and W12, through the `seedFromHome` path;
  - "Enregistrer ce destinataire" is saved only when the order is created;
  - deduplication by phone;
  - a saved address that is now out of zone goes to W17 (R201);
  - no limit on saved items (H8, decided).
- **The e-mail screen,** with the five Prompt 4 tests:
  - `CodePurpose` `"emailConfirm"`;
  - `attachEmail` enforces R101;
  - the same answer whether or not the e-mail has an account;
  - "already used" only after the right code;
  - the `EmailLater` link after sign-up.
- **Preferences.** SMS and e-mail are mock flags. "Offres FastGo" is off by default. "Apparence" is L2 and not built.

**Changed.**
- **Language (R902).**
  - The language chosen in C09 is saved on the account (`accounts.locale`) and applied at sign-in.
  - It does not change any order (`recipientLocale` stays as it was), any notification preference or any other setting.
  - **The site switcher, for a signed-in user, also saves `accounts.locale`**, exactly as C09 does (R902 "depuis le site ou son compte"). Signed out, it changes only the page.
- **Closing the account (R105, T37, H10 decided).**
  - `closeAccount(session): closed | refused{reason: "activeOrder"|"amountDue"}` follows "Fermer un compte efface l'identité de la personne ; les pièces comptables restent conservées".
  - **Individual customers only** (`role: null`). C09 shows no close action to merchants or team members. Closing a company is back-office work, listed as a gap (section 11).
  - **It refuses** while the account has an order that is not final (`activeOrder`), or an amount due: an unpaid invoice or `returnBalanceMillimes > 0` (`amountDue`). The dialog shows the reason, with a link to the orders or the invoices, and no close button. No delay before closing.
  - Otherwise, in one write:
    - it sets `status: "closed"` and `closedAt`;
    - it erases the name, phone, e-mail and Google link, which frees the phone and the e-mail (R101);
    - **in the person's own order copies,** `sender.name` becomes "Compte fermé" (an i18n key) and `sender.phone` becomes `null`. The recipient copies are not the person's identity and stay;
    - **in the outbox,** the sender's name and phone are erased from the `params` of that account's messages; `template` and `locale` stay;
    - it empties the address book (saved addresses and saved recipients);
    - it signs out;
    - it **deletes no business record**: orders, parcels, invoices, credit notes, claims and events stay ("Pas d'effacement physique d'une donnée métier").
  - **Accounting documents keep their buyer.** Each invoice and credit note stores `buyerSnapshot: {name, address, taxNumber|null}` at issue, and C05 reads only that. Closing never changes an issued invoice (R602).
  - **A new sign-up with the same phone** creates a new account with a new id. It sees none of the old account's orders, invoices, claims or addresses, because every reader is scoped by account id.
  - The dialog text says the identity is erased and the invoices are kept. The retention period is D9, so the text gives no duration.
- **Unlinking Google** (H11, decided): allowed, because a password can still be set through the SMS reset path. R103's phone stays required.
- **Phone in C09** (H20, decided): read-only in L1.

**Tests (added to the first plan's list).**
- **Unit, `closeAccount`:**
  - refused with `activeOrder` while one order is `in_transit`; refused with `amountDue` with an unpaid invoice, and with a return balance; nothing changes after a refusal;
  - after closing, identity fields are null;
  - in every order of that account, `sender.name` is the "Compte fermé" key and `sender.phone` is `null`, while `recipient` is unchanged;
  - in every outbox message of that account, `params` holds no sender name or phone, and `template` and `locale` are unchanged;
  - `closeAccount` is not offered to a merchant `admin` or `user` session (C09 shows no close action), unit and e2e;
  - phone and e-mail are free, so `createAccount` with them succeeds;
  - the invoice, order and claim counts for that account are unchanged;
  - each invoice's and credit note's rendered text (from `buyerSnapshot`) is byte-for-byte the same before and after;
  - nothing is removed from any business table; the address book is empty;
  - the new account for the same phone has a different id, and `listOrders`, `listInvoices`, `listClaims` and the address book all return empty for it.
- **E2e:**
  - closing with an active order shows the reason and no close button;
  - close the account, then sign-in fails;
  - the same phone signs up again and C01, C02, C04, C06 and C08 are empty;
  - **T37:** the old account's invoices are still in the invoice table, checked through the invoice reader that the back-office would use (`listInvoicesForAccountId`, test-only).
  - **R902:** pick العربية in C09, then sign out and back in, and the page opens in ar.
  - **R902:** signed in, pick English in the site switcher, then sign out and back in, and the page opens in en; signed out, the switcher saves nothing.
  - **R902:** an existing order's `recipientLocale` and the notification preferences are unchanged after either language change.

## 4. Part C: invoices and claims (ESP-05, ESP-06)

**PR C, branch `web/ESP-05-invoices-claims`.** The routes are unchanged: C04 `/compte/factures`, C05 `/compte/factures/[number]`, C06 `/compte/reclamations`, C07 `/compte/reclamations/nouvelle` and `/compte/reclamations/[ref]`.

**Invoices.**
- **The mock model follows the cahier:**
  - `invoices` (`number, customerId, issuedAt, netMillimes, vatMillimes, stampMillimes, totalMillimes, status`), plus the mock field `buyerSnapshot` (part B);
  - `invoice_lines` (`invoiceId, orderId, label, netMillimes, vatRate`). One invoice covers **one or more orders**.
  - `credit_notes` (`number, invoiceId, totalMillimes`).
- **R603:**
  - numbers match `^FAC-\d{4}-\d{7}$` and `^AV-\d{4}-\d{7}$`;
  - in the fixtures, each year's numbers are continuous with no gap.
- **R602 and T24: an issued invoice never changes.**
  - The mock layer has **no** function that writes an issued invoice.
  - A correction is a credit note linked by `invoiceId`. C05 shows "Corrigée par l'avoir AV-…" with a link, and the credit note shows its invoice.
  - The second-person validation in T24 is back-office work, out of scope.
- **Amounts:**
  - every amount is stored on the invoice and never computed;
  - the fixture amounts are labelled "Montants d'exemple";
  - `vatRate` is `null` and shows `[TVA]`;
  - the stamp line always shows (R204), as an amount from the data.
- **R604:** the TTN identifier and QR show only when the invoice has them. Fixtures have none, because TTN membership is not active yet.
- **R708:** an invoice never contains COD.
- **ESP-05:** invoices, receipts and credit notes each have their PDF (static example files marked EXEMPLE).
- **R601 and R606 (T19 fixture).** The invoice for the T19 order bills **every** parcel's freight ("le port reste dû", "y compris pour un retour"), plus a return-fee line shown as `[FRAIS]` for the returned parcel. Who pays a return after a refusal is decided by the back-office; the client-visible R607 acceptance is in part A.

**Claims** (`tickets`, `ticket_messages`).
- **A claim needs an order.**
  - "Contester" on C05: if the invoice covers one order, the claim opens with it.
  - If it covers more than one, the user **must pick the order** from that invoice's orders before the form opens.
- **R804, reopening:**
  - a closed claim can be reopened until `closedAt + CLAIM_REOPEN_WINDOW_MS`, then it is archived (`archivedAt`);
  - the constant is in `constants.ts` at **30 days**, marked `// unsourced: "délai fixé", R804`, and listed in section 9;
  - an archived claim is read-only.
- **T30:** messages with `isInternal: true` are never returned to the client. A fixture has one, and a test checks it is absent from the client's data shape and from the page.
- **R801:** C07 shows "Délai pour signaler un dommage ou une perte : selon les CGV, [DÉLAI CGV]" (D4 and the CGV).
- **Damaged parcel** ("Un colis abîmé garde son état et ouvre une réclamation"): a C07 claim of type damage on a `handed_over` parcel leaves the parcel's state unchanged.
- **R802:** C07 shows the declared value of the linked order, or "Sans valeur déclarée, le forfait des CGV s'applique : [FORFAIT]". No amount is ever computed.
- **R803:** the client sees a credit note only once it is issued. The proposal and validation happen in the back-office.
- **Attachments** (H12, decided): 5 MB per file, images and PDF only, at most 5 files. `CLAIM_ATTACHMENT_MAX_BYTES`, `CLAIM_ATTACHMENT_MAX_FILES` and the accepted types are in `constants.ts`, marked unsourced and listed in section 9.
- **Claim status names** (H13, decided): the mockup's names for now. The reopen route goes on the cahier v2 list.
- **Unsourced in C07:** the reply time "sous 48 h" (F4).

**Tests.**
- **Unit:**
  - the R603 regex on every fixture number, and no gap per year;
  - no writer for an issued invoice (the module exports none, checked by its export list);
  - a credit note links to its invoice;
  - a multi-order invoice lists its orders;
  - reopening before and after the window;
  - an archived claim refuses a message;
  - the internal note is filtered out;
  - a damage claim leaves the parcel's state unchanged;
  - the T19 invoice bills three parcels' freight and shows the `[FRAIS]` return line;
  - replaying a message key does not duplicate it (ADR-6).
- **E2e:**
  - "Contester" on a one-order invoice gets that order;
  - on a two-order invoice, the user must pick the order;
  - reopening a closed claim, and "Archivée" after the window (with a mocked clock);
  - the internal note is not in the page;
  - the corrected invoice shows its credit note;
  - another account's invoice or claim shows not-found;
  - the attachment edges: a 5 MB file passes and 5 MB + 1 byte is refused; a sixth file is refused; a `.docx` is refused;
  - `checkPage` on C04–C07.

## 5. Part D: merchant space (PRO-01, PRO-03, PRO-05, PRO-06)

**PR D, branch `web/PRO-01-merchant-space`.** The routes are unchanged:
- P01 `/pro`;
- the "Informations" tab `/pro/entreprise` (`legal_name`, `tax_number`);
- P06 `/pro/entreprise/points`, P07 `/pro/entreprise/equipe`, P09 `/pro/entreprise/etiquettes`;
- `/pro/releves`;
- the W11 pickup point picker (PRO-03; `addresses.is_pickup_point`).

**Contract and payment on account (R104, R211, T36, T41).**
- `contracts` fixture per company: `{creditLimitMillimes, paymentTermsDays, codCycle, deductOverdueInvoices, status, approvedBy}`. `deductOverdueInvoices` is the R707 "si le contrat le prévoit" flag; its fixture values are examples (unsourced).
- **Merchant prices (R206, "celle du contrat").** The cahier gives no contract price grid, so the mock prices merchants with the public quote and labels it. Left out, see section 11.
  - Boutique Yasmine is `validated`, with example values labelled "Exemple de contrat".
  - Atelier Nour is `pending`.
- `accountPaymentAllowed(session, orderTotalMillimes, now, pendingMillimes = 0)` returns (`pendingMillimes` is the import's rows already accepted in this run, part E; 0 elsewhere):
  - `allowed`;
  - `contractNotValidated` (R104);
  - `creditLimit`: **the credit used plus `pendingMillimes` plus this order is above `creditLimitMillimes`** (strictly above; exactly at the limit is allowed). The credit used is the sum of unpaid invoices plus on-account orders not yet invoiced, never COD (R708). This order's own amount counts (H14, decided);
  - `overdueInvoice`: an unpaid invoice past `issuedAt + paymentTermsDays`.
- **`createOrder` re-checks it,** with the new refusal `accountPaymentStopped{reason}`:
  - W15 shows the reason in fr, ar and en, and offers the other payment modes;
  - P01 shows the same reason on the "Encours" tile;
  - T36 (pending, then validated) is the existing R104 path, retested here.
- **Roles (EX12, H5 decided).** The admin manages the team, the pickup points and the company, and sees COD (P04, P05), invoices and statements. A user creates, tracks and cancels the company's orders; P04, P05, the invoices, `/pro/releves`, P06, P07 and the "Informations" tab show "not allowed" to a user, and their nav entries are hidden.
- **Labels.** A6 PDF only. Thermal is L2, and the spec wins over the mockup. There is one barcode per parcel (`parcels.barcode`); the symbology stays a visible placeholder (H15, decided).
- **Company tax number** (H21, decided): required, with no format check.
- **Not built (listed as mockup gaps in the PR):**
  - the P01 aside "Pourquoi des retours ?" (PRO-09, L3);
  - P01 "Livraisons par jour" is removed (H16, not in L1).

**Tests (added to the first plan's list).**
- **Unit:**
  - `accountPaymentAllowed` returns each of its four results;
  - **R211 boundary:** with credit used + order total exactly equal to `creditLimitMillimes`, `allowed`; one millime more, `creditLimit`;
  - a `user` is refused P04, P05, invoices and statements; an `admin` is allowed;
  - a `user` is refused P06, P07 and the "Informations" tab; an `admin` is allowed;
  - COD is not counted in the credit used;
  - `createOrder` refuses a stale "Compte client" choice once the limit is passed.
- **E2e:**
  - **T41:** go over the limit, and W15 shows why and refuses "Compte client"; add an overdue invoice, and the same;
  - **T36:** a pending merchant is refused, then the contract is validated (mock helper), then accepted;
  - P01 shows the reason;
  - the W11 pickup point picker;
  - a role lowered in another tab is refused;
  - a `user` opening P06, P07 or `/pro/entreprise` sees "not allowed", and their nav entries are hidden;
  - team members sign in with their own phones;
  - `checkPage` on P01, P06, P07, P09 and the new tabs.

**R605 (individuals).** This lives in part A, because it is a customer rule.
- "Un particulier règle les frais de retour quand il récupère son colis ; sinon, le solde bloque ses prochaines commandes en espèces."
- A fixture `acc-customer-return-due` has `returnBalanceMillimes` > 0. This is a **mock field**: the cahier data model has no such column, and the real API would derive it from unpaid return fees.
- `createOrder` refuses both cash modes (`cashPickup` and `cashDelivery`) with `returnBalanceDue`. W15 says what is owed and that it must be settled first. "Compte client" is not an option for an individual (R104).
- The unit and e2e tests are listed in A's test list.

## 6. Part E: import and COD (PRO-02, PRO-04)

**PR E, branch `web/PRO-04-cod-import`.** The routes are unchanged: P02 `/pro/import`, P03 `/pro/import/rapport`, P04 `/pro/cod` and P05 `/pro/cod/[period]`.

**Import (T08, EX08).**
- **The rule:** valid rows go through, and every bad row is explained.
- **The file (H19, decided):** the columns are P02's list ("Nom et téléphone du destinataire", "Adresse et ville", "Contenu et poids", "Montant COD, si besoin"), and numbers use the fr format by default (`1 234,500`). Both are listed in section 9.
- **One row is one order with one parcel.**
- **Limits (unsourced, in `constants.ts`, listed in section 9):** `IMPORT_MAX_BYTES = 10 * 1024 * 1024` (10 485 760 bytes, the same 1024 × 1024 reading as `MAX_ATTACHMENT_BYTES` in `lib/limits.ts`; P02 mockup: "10 Mo au maximum") and `IMPORT_MAX_ROWS = 1000`. A file above either is refused whole, before any row is read or created, with the limit shown.
- **Payment mode.** P02's column list has no payment mode, and `regles.md` keeps `payment_mode` per order. So P02 gets one "Mode de paiement" select for the file, next to "Tous les colis partent de", offering only the modes this merchant may use. Each row takes that mode. A per-row column is a cahier v2 question (section 18).
- Each row is checked, in file order:
  - the phone with `orderPhone`;
  - the zone with `checkZone` (R201, before any price);
  - COD with `parseMillimes`;
  - **on account:** each row is priced with the same mock pricing as the order flow (`priceLines`, `lib/order/pricing.ts`), labelled "Montant d'exemple". Then `accountPaymentAllowed(session, rowTotal, now, pendingMillimes)`, where `pendingMillimes` is the sum of the rows already accepted in this run. A row that would cross the limit stays in the report with the reason `creditLimit`; the rows before it are created. Each later row is checked the same way, so a smaller later row that still fits passes (unsourced default, section 9: R211 only stops an order that crosses the limit);
  - **a pending merchant** (R104): P02 does not offer "Compte client", and a forced on-account file gives every row the reason `contractNotValidated`.
- The report gives each bad row with **the file's own line number, the field and the reason**.
- **"Créer les N commandes valides" is one idempotent action** (replay by key, ADR-6):
  - it creates the valid rows only, re-running the on-account check at that time;
  - the bad rows stay in the report;
  - the user fixes a bad row inline, which re-checks only that row, and it can then be created with a new action and a new key.
- Every CSV the app writes escapes the formula characters. Input is read as UTF-8 with BOM handling.
- **Excel (decided):** `read-excel-file` 9.3.14, in `apps/web` only, loaded with a dynamic import on P02. PR E reruns `npm audit` when it adds the package and reports the result in the PR.

**COD (R707, R708, T28, T47, D10).**
- **COD sits on each parcel** (`parcels.codMillimes`).
- **COD in the order flow (PRO-04).** For a merchant session only, W13 shows one optional "Montant à encaisser" **per parcel** ("Colis 1", "Colis 2"… for a count of N), each parsed with `parseMillimes`. A parcel with COD gets the COD proof level and a required handover code. Individuals never see the fields. The W13 mockup has no COD field; PRO-04 wins and the gap is noted in the PR.
- **A parcel is on exactly one payout** (`cod_payouts`, with each parcel's `payoutId`). The fixtures and a unit test enforce it.
- **A statement matches to the millime (T28):**
  - for each payout, `collected` = the sum of the COD of its `handed_over` parcels;
  - `fees` = the sum of the fee lines;
  - `net` = `collected − fees − deductedInvoices`;
  - the deducted invoices appear only when the contract allows it (R707);
  - P04, P05 and the downloaded CSV all show the same three numbers.
- **R708 and T47:** COD never counts in invoices, in the credit used or in any turnover figure. A unit test checks that invoice totals and credit used do not change when COD is added.
- **Payout frequency** comes from `contract.codCycle`. The fixture value is `"weekly"` (D10, recommended in the cahier). The **day and the minimum stay open** (F7), so the "chaque vendredi" text shows `[JOUR DE REVERSEMENT]`.
- Fees per parcel are fixture amounts labelled "Montants d'exemple".

**Tests.**
- **Unit:**
  - the CSV parser cases (quotes, CRLF, BOM, Arabic, Arabic-Indic digits);
  - row errors with their line number;
  - formula escaping;
  - a replayed import key;
  - after a partial create, the bad rows remain;
  - a file of exactly 10 485 760 bytes passes, one of 10 485 761 bytes is refused whole; 1,001 rows are refused whole; exactly 1,000 rows pass;
  - each accepted row creates one order with one parcel;
  - on account with room for two rows: rows 1 and 2 pass, row 3 stays with `creditLimit` (its `pendingMillimes` is rows 1 + 2), and a smaller row 4 that fits passes;
  - each row's price comes from `priceLines` and is labelled "Montant d'exemple";
  - a pending merchant's on-account rows all get `contractNotValidated`;
  - the P02 payment select offers "Compte client" only to a validated contract;
  - a parcel on one payout only;
  - T28 sums for every fixture payout;
  - R708.
- **E2e:**
  - **T08:** a 10-row file with 3 bad rows creates 7 orders, shows 3 explained rows, and after one fix and a second create, 8 orders;
  - a double click creates one batch;
  - **T28:** P04, P05 and the CSV agree;
  - a merchant with count 2 enters two COD amounts on W13, and each created parcel carries its own, with the COD proof level; a customer sees no COD field;
  - an on-account import that crosses the limit creates the rows before it and reports the crossing row with its reason;
  - a pending merchant sees no "Compte client" on P02;
  - a `user` cannot open P04 or P05;
  - `checkPage` on P02–P05.

## 7. Part F: recipient link (SUI-02, SUI-03)

**PR F, branch `web/SUI-02-recipient-link`.** The routes are unchanged: `/l/[token]` (D1, D4, D5 depending on the state), `/l/[token]/position` (D2) and `/l/[token]/creneau` (D3).

**What the link shows (SUI-02).**
- The ETA, the amount to pay, the instructions and the handover codes.
- **Handover codes (H2, decided):** one per parcel (`delivery_codes`), each shown from `in_transit` until that parcel is final, in `dir="ltr"`, with the D1 warning. With more than one parcel, each code is labelled with its parcel ("Colis 1 sur 2", plus its barcode).
- The driver's name is **hidden** (H2, decided). The mockup shows it; the gap is noted in the PR.
- **Amount to pay on delivery:** `amountDueOnDelivery(order, parcels): number` in `lib/data/recipient-links.ts`, integer millimes =
  - **COD:** the sum of `codMillimes` over parcels still heading to the recipient: `taken`, `at_depot`, `in_transit`, `delivery_failed`. Never `returning`, `returned`, `handed_over`, `lost` or `canceled`;
  - **plus freight, once,** `order.totalMillimes` when `freightPayer` is `recipient`, only until the first handover and only while at least one parcel can still be delivered. After the first `handed_over`, or when every remaining parcel is `returning`, it is 0: R607 moves it to the sender.
  - It is shown with the shared money helper; 0 shows "Rien à payer".
- **Failure reasons (H17, decided):** the mockup's three reasons, listed for FastGo (F12).

**Actions (SUI-03, EX04).**
- Share the position and correct the landmark, until the parcel is final.
- **R503 and T12: choose another slot after a failed handover** (`delivery_failed`):
  - **it is not a state change.** It is stored in its own table `fg.mock.slotChoices`, keyed by `(parcelId, attempt)` (`parcelId, attempt, slot, chosenAt, chosenVia: "recipientLink"`), with its own event in `fg.mock.slotChoiceEvents`. Nothing is written to `fg.mock.statusEvents`, and the parcel stays `delivery_failed`;
  - **one choice on D3 applies to every `delivery_failed` parcel of the order that has attempts left**, one record per parcel for its current attempt;
  - choosing the same slot again is a no-op (no record, no event); a different slot for the same attempt replaces the choice and writes one event; **a new attempt allows a new choice**;
  - it is shown to the sender on C03 ("Le destinataire a choisi un nouveau créneau") and in `/pro/commandes` (T12: "l'expéditeur est informé");
  - the dispatch side is back-office work, out of scope;
  - "Sans réponse dans le délai fixé, le retour commence": D4 shows "Choisissez sous [DÉLAI]" (F6).
- **R501:** `MAX_DELIVERY_ATTEMPTS = 2` in `constants.ts`, marked `// proposed in the cahier ("Essais de livraison : 2, puis retour")`. D4 shows `MAX_DELIVERY_ATTEMPTS − parcel.attempts` attempts left. At 0, no slot choice: the page says the parcel goes back to the sender.
- **R502:** the failure reason comes from a list, which the cahier does not give (H17). The fixtures use the mockup's three reasons.
- **Not built:**
  - D1's "Je ne serai pas là" before any failure;
  - D3's "Laisser à un voisin" and "Je refuse ce colis";
  - all three are H18; R607 covers who pays after a refusal, not whether the link offers it.
  - D5's star rating (ESP-07, L2).
- D4 "Appeler FastGo" is a `tel:` link to `[TÉLÉPHONE]`, until FastGo gives its official contact details (D4).

**Expiry (R406, T11)** follows ADR-3.

**Tests.**
- **Unit:**
  - one link per order;
  - the token is random and not derived from the tracking code;
  - before a final state the link is valid; at final + 24 h − 1 ms valid; at final + 24 h expired;
  - a canceled order's link gives the neutral answer;
  - the allowed actions per parcel state;
  - attempts left;
  - a slot cannot be chosen at 0 attempts left;
  - choosing a slot writes one `slotChoices` record and one `slotChoiceEvents` event, writes nothing to `statusEvents`, and leaves the parcel `delivery_failed`;
  - replaying the same slot writes no record and no event;
  - **keyed by attempt:** a choice on a 2-parcel order with both `delivery_failed` and attempts left writes one record per parcel; a parcel at 0 attempts left gets none; after a second failure (attempt 2) a new choice is accepted and the attempt-1 record stays;
  - `amountDueOnDelivery`: COD only (2 parcels of 20 000 and 15 000, prepaid) = 35 000; freight only (no COD, recipient pays, total 8 500) = 8 500; both = 43 500; prepaid with no COD = 0; the result is always an integer;
  - **COD excluded** for a parcel `returning`, `returned`, `handed_over`, `lost` or `canceled` (one case each);
  - **freight after the first handover is 0:** 2 parcels, one `handed_over`, the other `in_transit` with 15 000 COD, recipient pays 8 500 → 15 000;
  - **all remaining returning → 0:** recipient pays, every non-final parcel `returning` → 0;
  - a 2-parcel order shows two labelled codes from `in_transit`, and a parcel that becomes final stops showing its code while the other still does.
- **E2e:**
  - **T11:** a random token, an expired one and a malformed one give the identical neutral page;
  - **T12:** after a failure, choose a slot, then C03 of the sender shows it;
  - **T50:** the same order in fr, ar and en shows the same code, amount and tracking-number characters;
  - **2-parcel order:** D1 shows "Colis 1 sur 2" and "Colis 2 sur 2", each with its own code, and the amount to pay is the sum;
  - the driver's name is not in the page HTML;
  - an English SMS in the outbox and the recipient switching to ar (R903);
  - the `noindex` and `no-referrer` headers, and no Referer;
  - keyboard-only position sharing;
  - the stale-page refusal;
  - `checkPage`, and shots against D1–D5, D1AR and D1EN.

## 8. Part G: installable app (FE-13)

**PR G, branch `web/FE-13-pwa`.** As in the first plan:
- the per-locale manifest, with its 404 test for an unknown locale;
- IP01 at `/compte/installer`;
- the C01 banner;
- IP02 as an **information page with no permission request** (decided);
- the SUI-04 moments in IP02 and in C09.

**Added: T02.** In an emulated standalone iPhone context (Playwright WebKit with the iPhone profile, `display-mode: standalone` emulated):
- order, tracking and the invoice page work;
- the outbox holds the tracking SMS written at creation (`received`, the "commande prise" moment, ADR-1) while `Notification.permission` is `default` or `denied`.

The manual Lighthouse and device checks stay.

## 9. Values (redone): S sourced, P proposed in the cahier, U unsourced

| Value | Where | Status | In the code |
|---|---|---|---|
| Price valid for 15 min | CMD-04, parameter table | **P** (parameter table, "Proposition"; R205 sets the rule, not the value) | existing `QUOTE_VALIDITY_MS` |
| Delivery attempts: 2, then return | D4 | **P** (parameter table, R501) | `MAX_DELIVERY_ATTEMPTS = 2` |
| Handover code always with COD | link, proof | **P** (parameter table) | `proofLevelFor` |
| Value threshold for stronger proof and for a required code (one threshold, H23) | proof | U, "seuil fixé", "à fixer" | `PROOF_VALUE_THRESHOLD_MILLIMES = null` |
| Splitting W13's whole-order weight and declared value across N parcels, last parcel takes the remainder | `createOrder` | U, listed default (cahier silent) | `splitWhole` |
| COD contract option "deduct overdue invoices" | P05 | U per contract (R707 sets the rule) | fixture `deductOverdueInvoices` |
| Invoice numbering `FAC-AAAA-NNNNNNN`, `AV-AAAA-NNNNNNN` | C04, C05 | S (R603) | regex, enforced |
| COD payout weekly, monthly invoice | P04, statements | **P** (D10) | fixture `codCycle: "weekly"` |
| COD payout day, minimum, transfer method | P04 | U (D10 leaves them open) | `[JOUR DE REVERSEMENT]` |
| Recipient link: how long it works after delivery | link | U ("délai fixé", R406) | `RECIPIENT_LINK_AFTER_DELIVERY_MS = 24 h`, listed |
| Claim reopening window | C07 | U ("délai fixé", R804) | `CLAIM_REOPEN_WINDOW_MS = 30 days`, listed |
| Recipient reply time before the return starts | D4 | U ("délai fixé", R503) | `[DÉLAI]` |
| How long an undelivered parcel is kept | D4 | U (D2, "à fixer") | not shown |
| Cancellation fee after arrival, return fee, retry fee | CMD-08, W15 | U (D7, amounts to fix) | `[FRAIS]` |
| Fee for cancelling after a failed pickup | `pickup_failed` cancel | U (R212, R505, CGV) | "peuvent s'appliquer : [FRAIS]", back-office decides (H6) |
| Claim reporting delay, flat-rate indemnity | C07 | U (R801, R802, CGV) | `[DÉLAI CGV]`, `[FORFAIT]` |
| Credit limit, payment terms | P01, W15 | U, per contract | contract fixture, "Exemple de contrat" |
| VAT rate | C05 | U | `[TVA]` |
| Fiscal stamp amount | C05 | U (FIN-04 "paramétrables") | an amount from the data, example |
| FastGo address, matricule fiscal, phone | C05, D4 | U (D4) | `[ADRESSE]`, `[MATRICULE]`, `[TÉLÉPHONE]` |
| Retention of invoices, proofs and positions | C09 | U (D9) | no duration shown |
| Fees per delivery and per return on COD statements | P05 | U | fixture amounts, "Montants d'exemple" |
| Claim reply time "sous 48 h" | C07 | U (mockup only) | `[DÉLAI DE RÉPONSE]` |
| Import file size | P02 | U (mockup "10 Mo au maximum"; 1024 × 1024 bytes per MB, as `lib/limits.ts`) | `IMPORT_MAX_BYTES = 10 * 1024 * 1024` |
| Import on account: after a row is stopped by the limit, a smaller later row that fits still passes | P02, P03 | U, listed default (R211 only stops an order that crosses the limit) | import loop with `pendingMillimes` |
| Import row price | P03 | U (mock pricing of the order flow, "Montant d'exemple") | `priceLines` |
| Import row limit | P02 | U | `IMPORT_MAX_ROWS = 1000` |
| Import columns and number format | P02 | U (P02 mockup columns; fr format default, H19) | parser config |
| Claim attachments: 5 MB per file, images and PDF, at most 5 files | C07 | U (H12) | `CLAIM_ATTACHMENT_MAX_BYTES`, `CLAIM_ATTACHMENT_MAX_FILES`, accepted types |
| Failure reasons (the mockup's three) | D4, C03 | U (R502 gives no list, H17) | fixture list |
| Handover code length (4 in D1) | D1 | U | fixture, length not enforced |
| Slots offered to the recipient | D3 | U | fixtures |
| Weight tolerance | C03 (R208) | U, "à fixer" | `WEIGHT_TOLERANCE_G = null`: both weights shown, no notice |
| Auto-confirmation amount, response time, cash ceiling per driver | none | P or U, back-office or driver | out of scope |
| PWA icons, name | manifest | U | generated from `public/brand` |

## 10. Questions (redone)

### 10a. For FastGo: business values the cahier leaves to FastGo

**Status: to send with FastGo's reply to the cahier.** Not sent yet.

The rule: FastGo gets the values the cahier marks "à fixer" or "Proposition", the open decisions D2 to D10, and the business durations the cahier calls "délai fixé" without a value. Only FastGo can set those; everything about how the cahier should be read goes to Helmi.

- **F1** (D7). The amounts of the cancellation fee after the driver arrives (including after a failed pickup), the retry fee and the return fee.
- **F2** (D4). The official address, matricule fiscal, phone and contact details for invoices, the CGV and D4's "Appeler FastGo".
- **F3** (D9). The retention periods (invoices with the accountant; proofs and positions with a lawyer), and whether C09 should state them.
- **F4** (no D; mockup only). The claim reply time shown in C07 ("sous 48 h" in the mockup).
- **F5** (no D; R406 "délai fixé"). How long the recipient link works after delivery (24 h in the mock until then).
- **F6** (R503 "délai fixé", no D; and D2). The recipient's reply delay before the return starts, and how long an undelivered parcel is kept.
- **F7** (D10). The COD payout day, minimum and transfer method (weekly is the recommendation).
- **F8** (no D; R804 "délai fixé"). The claim reopening window (30 days in the mock until then).
- **F9** (no D; parameter table "Proposition"). Confirm the proposed values: price valid 15 min, 2 delivery attempts (R501), and a handover code always with COD.
- **F10** (D4 and the CGV; R801, R802). The reporting delay for damage and loss, and the flat-rate indemnity.
- **F11** (no D; "à fixer"). The weight tolerance (R208), and the value threshold for stronger proof and a required code (one threshold, H23).
- **F12** (no D; R502). The failure reason list. The mock uses the mockup's three reasons until then.
- **F13** (no D; mockup only). The import limits (10 MB from the mockup, 1,000 rows in the mock) and the claim attachment limits (5 MB per file, images and PDF, at most 5 files).

Lawyer's list: R607 checkbox wording, with the other legal texts.

### 10b. Decided by Helmi (5 Nov 2026)

No open questions for Helmi remain. H9 is removed (correction 7).

| # | Decision | Where it applies |
|---|---|---|
| H1 | My mission reading is accepted, with early ends `driverRemoved`, `pickupFailed` and `orderCanceled` | ADR-1 |
| H2 | Codes shown from `in_transit` until the parcel is final; driver's name hidden; the mock keeps the code, and the server form goes on the cahier v2 list | ADR-1, part F, section 18 |
| H3 | Canceled parcels are ignored; `handed_over + lost` is Livrée en partie | ADR-1 |
| H4 | A final order stays final when a lost parcel turns up; the parcel changes and `lossReported` is recomputed | ADR-1 |
| H5 | Roles `admin` and `user`. Admin: team, points, company, COD, invoices, statements. User: creates, tracks and cancels the company's orders | ADR-2, parts A, D, E |
| H6 | Cancel from `pickup_failed`: "peuvent s'appliquer" with `[FRAIS]`, back-office decides. From `confirmed` after it: free | part A |
| H7 | C02 "Exporter" not built in L1 | part A |
| H8 | No limit on saved addresses and recipients | part B |
| H10 | Closing refused with an active order or an amount due; sender copies anonymized; address book emptied | part B |
| H11 | Unlinking Google allowed (a password can be set through the SMS reset path) | part B |
| H12 | Attachments: 5 MB per file, images and PDF, at most 5 files, unsourced | part C, section 9 |
| H13 | The mockup's status names for now; reopen route on the cahier v2 list | part C, section 18 |
| H14 | The new order's amount counts toward the limit | part D |
| H15 | Barcode symbology stays a placeholder | part D |
| H16 | P01 "Livraisons par jour" removed, gap listed | part D |
| H17 | The mockup's three failure reasons, listed for FastGo (F12) | part F |
| H18 | "Je ne serai pas là", "Laisser à un voisin", "Je refuse ce colis" not built in L1 | part F |
| H19 | fr number format by default, columns from P02, listed | part E, section 9 |
| H20 | Phone read-only in C09 in L1 | part B |
| H21 | Tax number required, with no format check | part D |
| H22 | "Preuve renforcée demandée par le client" not built in L1 | ADR-1 |
| H23 | One threshold, the existing `PROOF_VALUE_THRESHOLD_MILLIMES` | ADR-1, section 9 |
| H24 | Merchants priced with the public quote in the mock | part D |

### 10c. Decided: stack and notifications

1. **Excel import: approved.** `read-excel-file` 9.3.14, added to `apps/web` only, loaded with a dynamic import on P02. PR E reruns `npm audit` when it adds the package. The 5 Nov check showed MIT, 4 dependencies, 7 packages and 0 vulnerabilities, against `xlsx` 0.18.5 (high) and `exceljs` 4.4.0 (moderate).
2. **Notifications: decided.** IP02 is an information page with no permission request. SMS carries the important messages (T02). Push is L2 (APP-04).

**Removed:** Q1 (states, now in regles.md), Q2 (R212), Q16 (R211) and Q26 (regles.md).

## 11. Rules and scenarios touching Prompt 4: where they are built and tested

| Ref. | PR | Test |
|---|---|---|
| R101 | B | `attachEmail` refuses an e-mail used elsewhere; `closeAccount` frees the phone and e-mail |
| R102 | B | the e-mail code limits come from Prompt 3's `otp.ts` (reused) |
| R103 | B | unlinking Google keeps the phone |
| R104, T36 | D | pending refused, then validated accepted |
| R105, T37 | B | individuals only (no close action for merchants or team members); refused with an active order or an amount due; identity erased, including sender copies and outbox `params`; invoices keep `buyerSnapshot`; phone free; a new sign-up sees nothing old |
| R201 | B, E | saved address out of zone goes to W17; import zone error before price |
| R202 | A, E | double-click cancel; double-click import |
| R203 | 0 | existing; link token not derived from it |
| R204 | A, C | C03 shows each stored price line; every invoice line shown, including the stamp |
| R206 | A | C03 shows the price stored at creation after a fixture price change (individuals; merchant grid left out) |
| R208 | A | C03 shows declared and measured weight; no notice while the tolerance is `null` |
| R211, T41 | D, E | limit and overdue invoice each stop payment on account, on W15 and P01; exactly at the limit allowed, one millime above stopped; import rows checked cumulatively |
| R212, T06 | A | the three cases, `pickup_failed` ("peuvent s'appliquer"), and the stale page |
| R401 | 0 | fixture invariant: proof on every `handed_over` parcel |
| Proof table (section 4) | 0 | `proofLevelFor`, one row each, plus the strongest-wins case |
| R405 | 0 | `publicTrackingOf` key allowlist; `/suivi` HTML has no personal data |
| R406, T11 | F | expiry boundaries; the identical neutral page |
| R501 | F | attempts left; no slot at 0 |
| R502 | F | failure reason shown (the mockup's three, F12) |
| R503, T12 | F | a slot after failure, keyed by parcel and attempt, applied to every `delivery_failed` parcel with attempts left, in its own record and event, not a state change; a new attempt allows a new choice; shown to the sender |
| R504 | A | W15 fee lines |
| R505 | A | "peuvent s'appliquer : [FRAIS]" on cancel from `pickup_failed` (H6) |
| R601 | A, C | `cancel.fee` recorded; the T19 invoice bills the returned parcel's freight too |
| R606 | C | T19 invoice fixture: every parcel's freight plus the `[FRAIS]` return line |
| R607 | 0, A, F | `freightPayer` set from the payment mode (`cashDelivery` → `recipient`) (0); W15 port dû acceptance required, `createOrder` refuses without it (A); recipient freight 0 after the first handover or when every remaining parcel is returning (F) |
| R602, T24 | C | no writer for issued invoices; the correction shows as a linked credit note |
| R603 | C | regex and no gap per year |
| R604 | C | TTN fields shown only when present |
| R605 | A | return balance refuses `cashPickup` and `cashDelivery`; W15 says what is owed and that it must be settled first |
| R707, T28 | E | the payout sums; deducted invoices only when `deductOverdueInvoices` is set |
| PRO-04 COD entry | E | one COD field per parcel on W13 for merchants, COD proof level; customers see no field |
| W13 parcels | 0, A | count N gives N parcels; `splitWhole` sums exactly |
| Recipient amount to pay | F | `amountDueOnDelivery`: COD only, freight only, both, prepaid; COD excluded for `returning`, `returned`, `handed_over`, `lost`, `canceled`; freight 0 after the first handover; all remaining returning gives 0 |
| T08 limits and payment | E | one row = one order with one parcel; exactly 10 485 760 bytes passes, one more refused; 1,000 rows; payment mode per merchant; rows priced with `priceLines`; `pendingMillimes` = rows accepted in the run; pending merchant refused on account |
| Damaged parcel | C | a damage claim leaves the parcel's state unchanged |
| R708, T47 | E, D | COD outside invoices and credit used |
| R801, R802 | C | the CGV placeholders in C07 |
| R803 | C | only issued credit notes are visible |
| R804 | C | reopen within the window, then archived |
| R901 | all | fr is the default, and every page is in fr, ar and en |
| R902 | B | saved on the account from C09 and from the site switcher when signed in; orders and settings unchanged |
| R903, R904, T50 | A, F, 0 | W12's existing "Langue du SMS et du lien" (`smsLanguage`) stored as `recipientLocale` (A); outbox `{template, params, locale}` in that language; same code, amount and number in 3 languages (F) |
| T02 | G | standalone context, SMS without permission |
| T08 | E | valid rows created, bad rows explained |
| T19 | 0, C | `partially_delivered` derived; its invoice fixture bills all three parcels plus the return line |
| T30 | C | internal note never in the client data or the page |
| EX02 | 0 | `/suivi` stays public |
| EX03, EX04 | F | link only, with no account |
| EX06–EX12 | A–E | another account's record gives not-found; merchant-only pages refuse a customer |
| States: order, parcel, mission | 0 | the transition matrix, derived order states refused directly, the scan checks the order first (`orderNotAssigned`, also after a cancel), a normal finish with no parcel taken refused (`noParcelTaken`), `in_transit`/`picked_up` derivation, both retry paths keep parcels `to_collect`, a final order stays final, the event log |

**Left out, with the reason:**
- **R205, R207:** order flow, done in Prompt 3.
- **R208's notice:** the tolerance is "à fixer", so no notice is computed (the weights are shown).
- **R206 for merchants:** the cahier gives no contract price grid; the mock uses the public quote (H24).
- **Not in L1 (Helmi, 5 Nov), listed as mockup gaps in their PRs:** C02 "Exporter" (H7), P01 "Livraisons par jour" (H16), D1 "Je ne serai pas là" and D3 "Laisser à un voisin", "Je refuse ce colis" (H18), stronger proof chosen by the client (H22).
- **R209, R210:** auto-confirmation and its alerts are back-office.
- **Closing a company account (R105):** back-office work; C09 shows no close action to merchants or team members. Listed as a gap in PR B.
- **R606, R607 billing decision after a refusal:** back-office. The client-visible parts are mapped above.
- **"Distance d'alerte à la remise":** driver app.
- **R401's second sentence** (repeated wrong codes): driver side.
- **T24's second person:** back-office.
- **The cash ceiling per driver and the mission response time:** driver app.
- **The driver's position in status events:** no driver app in this repo.

## 12. Notes for the real API (from the cahier's route table)

- `/v1/recipient-links/{token}`:
  - it returns **404** for an unknown or expired token;
  - it **limits attempts** (T11);
  - it stores only `token_hash`.
  - The mock shows a neutral page instead and cannot rate-limit.
- `/v1/orders/{id}/cancel` replays by state. `/v1/order-imports` and `/v1/tickets` replay by key. The mock follows this (ADR-6).
- `/v1/tracking/{number}` is public with limited attempts. The mock does not limit.
- Every access check is done by the server, which returns 404 outside the caller's scope (EX table). The client guard is only the fallback.
- `delivery_codes` keeps `code_hash` (H2).
- `/v1/tickets` has no reopen action in the cahier's route table; the mock's reopen (R804) needs one (H13).
- The real API derives a return balance (R605) from unpaid return fees; `returnBalanceMillimes` exists only in the mock.

## 13. Branches and PRs

| PR | Branch | Content | Needs |
|---|---|---|---|
| 0 | `web/ESP-00-account-base` | `regles.md`, ADR-1 to ADR-6, both shells, `Dialog` and the table, all fixtures, `/suivi` states | PR #5 merged. While Helmi works alone he merges PR 0, and the PR lists the `packages/ui` and `packages/i18n` changes for the engineers to review when they join |
| A | `web/ESP-04-client-orders` | C01–C03, CMD-08, SUI-05, the W15 R504 lines, the W15 R607 acceptance, R903 storage (`recipientLocale`), R605 | 0 |
| B | `web/ESP-02-profile-addresses` | C08, C09 (R902, R105), the e-mail screen, CMD-02 | A |
| C | `web/ESP-05-invoices-claims` | C04–C07 (R602–R604, R801–R804) | A |
| D | `web/PRO-01-merchant-space` | P01, P06, P07, P09, the company tab, statements, R211, pickup points in W11 | C and B |
| E | `web/PRO-04-cod-import` | P02–P05 (T08, T28, R707, R708) | D (Excel approved; rerun `npm audit`) |
| F | `web/SUI-02-recipient-link` | D1–D5 (R406, R501–R503, T11, T12, T50) | A |
| G | `web/FE-13-pwa` | manifest, IP01, banner, IP02, T02 | A |

- The same applies to later PRs: while Helmi works alone he merges them, and each PR lists its `packages/ui` and `packages/i18n` changes for the engineers to review when they join.
- **Order:** 0, then A. Then B and C in sequence, then D, then E. F and G in parallel worktrees after A.
- **Before each PR,** a detailed task plan with superpowers:writing-plans in `docs/superpowers/plans/`.
- **The working rules for each PR are unchanged:**
  - new commits only;
  - the three catalogs and `AR-REVIEW.md` in the same commit (fastgo-i18n-keys);
  - fastgo-e2e-fast while building;
  - an `engineering:code-review` subagent before the PR;
  - fastgo-verify-pr and verification-before-completion before each push;
  - shots compared with the mockups, with the differences listed.

## 14. Review focus

1. **Another account's record opened by URL** must give the same not-found as a missing record (A, C, D, E).
2. **A stale page** must be refused, and the page must then show the new state. The cases:
   - cancel after the driver arrived or after pickup;
   - paying on account after the limit was passed;
   - choosing a slot after delivery;
   - an admin action after the role was lowered.
3. **A state change outside the tables** must be refused, including through fixtures (0).
4. **Money must match to the millime:** COD statements, credit used without COD, and invoices with their credit notes (C, D, E).
5. **The recipient token:** a guessed or expired token, a Referer leak, and the same code and amount in all three languages (F).

## 15. Verification for each PR

- `pnpm lint`, `pnpm typecheck` and `pnpm test`.
- Then `PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright bash .claude/skills/fastgo-verify-pr/verify.sh`.
- Compare the 1440 px fr and ar shots with `docs/ui/screenshots`.
- For G, Lighthouse installability on a build.
- The PR text gives the real counts, the mockup differences, the section 9 values and the open questions.

## 16. How this revision was made

- **Skills:**
  - `superpowers:writing-plans` (structure, review focus, one plan per PR);
  - `engineering:architecture` (ADR-1 to ADR-6; ADR-1 rewritten, ADR-6 new);
  - `engineering:code-review`, through a fresh reviewer subagent (results in section 17).
  - From the first round, `design:accessibility-review` and `modern-web-guidance` (`responsive-table`, `dialog`, `privacy`; no install guide exists) still shape section 1.
- **Checks:** `npm view` and `npm audit` on `read-excel-file`, `exceljs` and `xlsx` for the Excel decision (section 10c, item 1), and a check that `origin/main` does not contain PR #5.

## 17. Reviewer results (fresh subagent, engineering:code-review, against `regles.md`)

Verdict before the fixes: **request changes**. It found the state and transition tables matched the cahier exactly. It raised 24 findings: 3 blocking, 14 should-fix and 7 minor. All 24 are folded in above:

| # | Severity | Finding | Fixed in |
|---|---|---|---|
| 1 | Blocking | Derived order states had no writer; direct order transitions not refused | ADR-1 "Derived order states", PR 0 tests |
| 2 | Should-fix | `canceled` parcels undefined in the derivation | ignored by default, mission end cancels `to_collect`, H3 |
| 3 | Should-fix | No loss signal on `handed_over + lost` | `lossReported` on any lost parcel; inference flagged |
| 4 | Should-fix | No mission exit on driver removal or cancel | `endReason`, "the pickup mission" defined, H1 |
| 5 | Should-fix | Free cancel from `pickup_failed` invented a fee rule | `[FRAIS]` by default, H6 extended |
| 6 | Should-fix | No cascade, no final-state result | one-write cascade, `notCancellable` |
| 7 | Blocking | R607 acceptance missing from W15 | PR A W15 checkbox and tests |
| 8 | Blocking | T19 invoice billed only handed-over parcels | all parcels plus return line (R601, R606) |
| 9 | Should-fix | Closing the account could change issued invoices | `buyerSnapshot`, byte-equal test, address book |
| 10 | Should-fix | R208 left out though client-visible | both weights on C03, `WEIGHT_TOLERANCE_G = null` |
| 11 | Should-fix | 15 min marked S, it is "Proposition" | P, added to F9 |
| 12 | Should-fix | FastGo routing rule contradicted F4, F5, F6, F8 | rule restated; every F has a D or "no D" |
| 13 | Should-fix | Stronger proof by the client had no UI or question | `strongerProofRequested`, H22 |
| 14 | Should-fix | No COD entry in the order flow | superseded: COD is one field per parcel on W13 (PRO-04, part E) |
| 15 | Minor | One threshold for two cahier thresholds | superseded: one threshold, `PROOF_VALUE_THRESHOLD_MILLIMES` (H23) |
| 16 | Should-fix | R903 sender choice had no screen | superseded: W12 already has "Langue du SMS et du lien"; no new control, PR A only stores it |
| 17 | Should-fix | R204 breakdown not stored; R206 merchant grid unmapped | `priceLines`; grid left out, H24 |
| 18 | Minor | R707 contract flag missing | `deductOverdueInvoices` |
| 19 | Minor | Damaged parcel and alert distance unmapped | damage claim test; distance left out |
| 20 | Should-fix | R605 tests missing from A; mock field unflagged | tests in A; field marked mock |
| 21 | Minor | R801 cited D7 | D4 and the CGV |
| 22 | Minor | Which state sends the tracking SMS | once, at `received` |
| 23 | Minor | Driver's first name shown while H2 open | hidden by default |
| 24 | Minor | No reopen route in the cahier API | section 12, H13 |

A second review, on the sections changed by Helmi's corrections, is in section 19.

## 18. Cahier v2 corrections (to send to Helmi for the next cahier version)

1. **Handover code on the server.** `delivery_codes` keeps only `code_hash`, but the recipient link must show the code (D1). The server needs a recoverable form (encrypted) for the link, while phones (driver app) receive only the hash. The mock keeps the code itself.
2. **Mission ends.** Add the transitions and the end reasons `driverRemoved`, `pickupFailed` and `orderCanceled`. Only a normal finish cancels parcels never handed over.
3. **Scan rule.** A parcel can be taken (`to_collect → taken`) only while its order is `assigned` or already picked up.
4. **Derivation.** Canceled parcels are ignored; `handed_over + lost` is Livrée en partie; a final order stays final when a lost parcel turns up, and the loss flag is recomputed.
5. **Cancel after a failed pickup.** Fees "peuvent s'appliquer", decided by the back-office (R212 with R505).
6. **One proof threshold.** Merge "valeur au-dessus du seuil fixé" (proof table) and "autre seuil à fixer" (required code) into one parameter.
7. **Company roles.** Name `admin` and `user` in `company_members.role`, with the rights decided in H5.
8. **Closing an account (R105).** Refused with an active order or an amount due; the person's identity is erased from their own order copies too; accounting documents keep a buyer snapshot (add `buyer_snapshot` to `invoices` and `credit_notes`).
9. **Return balance (R605).** Name where an individual's unpaid return fees are kept (no column today).
10. **Claim reopening (R804).** Add a reopen action to `/v1/tickets`.
11. **Recipient slot choice (R503).** Add a table for the recipient's slot choice and its event; it is not a parcel state.
12. **Import.** Add a payment mode (per file or per row) and the column list to the import contract; the P02 columns have none.
13. **W13 split.** State how a whole-order weight and declared value are split across parcels (the mock: equal parts, last takes the remainder).
14. **Language from the site switcher (R902).** State that a signed-in user's choice in the switcher saves `accounts.locale`.
15. **Prise en charge → Perdue.** The order table lists only Prise en charge → En route, but a parcel may go Pris → Perdu. When the only counted parcel is lost right after the scan, the derived order goes Prise en charge → Perdue directly. The mock writes that derived event (pinned in `states.test.ts`); add the pair to the order table, or state that the order passes through En route.

## 19. Second review (fresh subagent, engineering:code-review, changed sections only)

Verdict: **request changes**, with 17 findings (2 blocking, 8 should-fix, 7 minor). All 17 are ruled by Helmi and applied. No third full review was run, by Helmi's decision.

| # | Finding | Ruling (Helmi, 5 Nov) | Applied in |
|---|---|---|---|
| 1 | A scan after a cancel hit the parcel table first | The scan checks the order first, so a scan after a cancel always returns `orderNotAssigned`; tested | ADR-1, PR 0 tests, section 11 |
| 2 | A normal finish with no scan cancelled every parcel | `arrived → finished` with `endReason: null` is refused with `noParcelTaken` unless one parcel is `taken`; tested | ADR-1, PR 0 tests, section 11 |
| 3 | kg to grams in floats | From the decimal text, no float, more than 3 decimals refused; 0.1, 1.005, 2 give 100, 1005, 2000 | ADR-1 (`kgTextToGrams`), PR 0 tests |
| 4 | Threshold compared each parcel's share | The order's total declared value; COD still sets the level per parcel | ADR-1 proof level, PR 0 tests |
| 5 | `freightPayer` had no type or source | `"sender"\|"recipient"`, set by `createOrder`: `cashDelivery` → `recipient`, `cashPickup` and `account` → `sender`; each tested | ADR-1, PR 0 and PR A tests, section 11 |
| 6 | Amount due counted returning COD and late freight | COD only for `taken`, `at_depot`, `in_transit`, `delivery_failed`; recipient freight once, until the first handover and while a parcel can still be delivered, else 0 (R607) | part F, its tests, section 11 |
| 7 | Slot choice not keyed by attempt | Keyed by parcel and attempt; one D3 choice applies to every `delivery_failed` parcel with attempts left; a new attempt allows a new choice | part F, its tests, section 11 |
| 8 | Import cumulative check had no pending amount or price | `pendingMillimes` = rows accepted in this run; rows priced with the order flow's mock pricing, "Montant d'exemple"; skip-ahead kept as an unsourced default | parts D and E, section 9, section 11 |
| 9 | Import row unit undefined | One row is one order with one parcel | ADR-1, part E |
| 10 | 10 MB byte value | Same convention as `lib/limits.ts` (1024 × 1024): 10 485 760 bytes, tested at the exact value | part E, section 9, section 11 |
| 11 | `closeAccount` scope and outbox text | Individuals only; no close action for merchants or team members; company closing is back-office, a gap; the outbox keeps template and params, and closing erases the sender's name and phone from them; tested | ADR-1, part B, section 11 |
| 12 | Stale rows 14–16 in section 17 | Marked superseded by the current decisions | section 17 |
| 13 | Role type | `"admin"\|"user"\|null` | ADR-2 |
| 14 | Role tests missing | `user` refusal tests for P06, P07 and the company tab | part D tests |
| 15 | Stale decision label in section 16 | Removed | section 16 |
| 16 | W12 label | "Langue du SMS et du lien" | part A, sections 11 and 17 |
| 17 | `in_transit` wording | `in_transit` once any parcel is `in_transit`, `at_depot`, `delivery_failed`, `returning` or final; otherwise `picked_up` | ADR-1, PR 0 tests |

Also ruled the same day: R605 has no "Compte client" pass case and refuses both cash modes (part A, part D, section 11); PR A's row lists the R607 acceptance and R903 storage (section 13); the R607 checkbox wording is on the lawyer's list (section 10a); PR 0's "Needs" and the merge rule for later PRs (section 13).
