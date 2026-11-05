# PR 0 (web/ESP-00-account-base) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the base every Prompt 4 part builds on: the order, parcel and mission state machines of `regles.md` with their event log, parcels and account orders written by `createOrder`, the public tracking shape, the session with user and role, the two space shells with their guard, and the `Dialog` and responsive table in `packages/ui`.

**Architecture:** Everything stays in the localStorage mock (`fg.mock.*` tables via `lib/data/mock-db.ts`). One module, `lib/data/states.ts`, owns every state change and writes `fg.mock.statusEvents`. Pages never read tables; they call `lib/data/*` readers that take the session. The guard is client-side (ADR-2).

**Tech Stack:** Next.js 16 App Router, next-intl, TypeScript strict, vitest, Playwright with axe, Tailwind v4 logical classes, pnpm.

**Spec:** `docs/superpowers/plans/2026-11-05-prompt-4-umbrella.md` (ADR-1 to ADR-6, section 2 "PR 0"), which argues from `docs/spec/regles.md`. Read both sections before any task.

## Global Constraints

- Money is integer millimes; weights are integer grams. No float anywhere in money or weight paths.
- Every user-visible string is in `packages/i18n/src/messages/{fr,ar,en}.json`, added through `.claude/skills/fastgo-i18n-keys/merge.py` (fastgo-i18n-keys skill), which also regenerates `AR-REVIEW.md`.
- Logical CSS only; tokens only, no hex in app code; amounts, codes and phones in `dir="ltr"`.
- axe-core clean, one h1, 360 px with no horizontal scroll, on every new page in fr, ar and en.
- Fake data only: fake names, `+216` fake phones.
- Code identifiers for states are exactly the umbrella's: order `received confirmed assigned pickup_failed picked_up in_transit delivered partially_delivered returned lost canceled`; parcel `to_collect taken at_depot in_transit delivery_failed returning handed_over returned lost canceled`; mission `proposed accepted refused expired arrived finished`; `endReason` `null | "driverRemoved" | "pickupFailed" | "orderCanceled"`.
- Commit messages start with the IDs (`ESP-00`, plus rule IDs); new commits only; each commit ends with the two attribution lines from the session.
- Run `pnpm lint && pnpm typecheck && pnpm test` before each commit that touches code.

## Review Focus

1. A page reload after an earlier version of the mock wrote `fg.mock.session` without `userId`/`role` must still give a working session (old session object): Task 5 test `getSession upgrades an old session`.
2. Fixtures re-seeding on every read would wipe orders the user created: Task 4 test `seed runs once and keeps created orders`.
3. A tracking code typed in lower case or with spaces on `/suivi` must still find a fixture order now stored in `fg.mock.accountOrders`: Task 4 test `lookupTracking normalizes the code`.
4. An order created before this PR (only in `fg.mock.orders`, no account order) must still show on W16 and `/suivi` as `received`: Task 3 test `legacy order still tracks`.
5. A Dialog closed with Escape must return focus to the button that opened it and call `onClose`: Task 6 e2e on `/dev/ui`.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/web/src/lib/order/split.ts` (new) | `splitWhole`, `kgTextToGrams` |
| `apps/web/src/lib/data/order-model.ts` (new) | Types and table keys of `AccountOrder`, `Parcel`, `Mission`, `StatusEvent`, `DeliveryCode`, `OutboxMessage`, `RecipientLink`; raw table read/write helpers |
| `apps/web/src/lib/data/states.ts` (new) | The three transition tables, `transition`, `deriveOrderOutcome`, mission helpers |
| `apps/web/src/lib/order/proof.ts` (modify) | add `proofLevelFor`, `handoverCodeRequired`; `proofFor` stays for W15 |
| `apps/web/src/lib/data/recipient-links.ts` (new) | `mintRecipientToken`, `mintRecipientLink`, expiry on final state |
| `apps/web/src/lib/data/outbox.ts` (new) | `writeOutbox` |
| `apps/web/src/lib/data/orders.ts` (modify) | `createOrder` also writes the account order, parcels, codes, link and outbox |
| `apps/web/src/lib/data/account-orders.ts` (new) | session-scoped readers, `publicTrackingOf` |
| `apps/web/src/lib/data/tracking.ts` (modify) | `lookupTracking` returns `PublicTracking` |
| `apps/web/src/lib/data/fixtures/orders.ts` (new) | fixture orders, built through `transition` by `seedOrderFixtures()` |
| `apps/web/src/lib/data/session.ts`, `accounts.ts`, `fixtures/accounts.ts` (modify) | `userId`, `role`, team members, `homeFor` |
| `apps/web/src/lib/data/mock-db.ts` (modify) | `consumeFailNext` |
| `packages/ui/src/components/dialog.tsx` (new), `table.tsx` (modify) | `Dialog`, stacked table |
| `apps/web/src/components/account/*` (new) | `RequireSession`, space nav, sign-out |
| `apps/web/src/app/[locale]/(account)/…`, `(pro)/…` (new) | the two shells, `/compte` (C01 skeleton) and `/pro` (P01 skeleton) |

---

### Task 1: `splitWhole` and `kgTextToGrams`

**Files:**
- Create: `apps/web/src/lib/order/split.ts`
- Test: `apps/web/src/lib/order/split.test.ts`

**Interfaces:**
- Produces: `splitWhole(total: number, n: number): number[]`; `kgTextToGrams(text: string): number | { refused: "tooManyDecimals" | "invalid" }`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(splitWhole(1000, 3)).toEqual([333, 333, 334]);
expect(splitWhole(100000, 3)).toEqual([33333, 33333, 33334]);
expect(splitWhole(5, 1)).toEqual([5]);
// property: for n in 1..99 and 200 random integer totals in 0..10_000_000,
// parts.length === n, every part is an integer >= 0, sum === total.
expect(kgTextToGrams("0.1")).toBe(100);
expect(kgTextToGrams("1.005")).toBe(1005);
expect(kgTextToGrams("2")).toBe(2000);
expect(kgTextToGrams("2,5")).toBe(2500);          // W13 accepts a comma
expect(kgTextToGrams("١٫٥")).toBe(1500);           // Arabic-Indic digits and separator, via toLatinDigits
expect(kgTextToGrams("1.0005")).toEqual({ refused: "tooManyDecimals" });
expect(kgTextToGrams("abc")).toEqual({ refused: "invalid" });
```

- [ ] **Step 2: Run** `pnpm --filter @fastgo/web exec vitest run src/lib/order/split.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** `splitWhole` throws on `n < 1` or a non-integer total. `kgTextToGrams` uses `toLatinDigits` from `lib/digits.ts`, accepts `.`, `,` or `٫` as the separator, and builds grams as `integerPart * 1000 + Number(decimals.padEnd(3, "0"))` with string operations only (no `Number(text) * 1000`).
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `ESP-00 CMD-03: splitWhole and kgTextToGrams, integers only`.

### Task 2: state machines, event log, derivation (TDD, superpowers:test-driven-development)

**Files:**
- Create: `apps/web/src/lib/data/order-model.ts`, `apps/web/src/lib/data/states.ts`
- Test: `apps/web/src/lib/data/states.test.ts`

**Interfaces:**
- Produces, in `order-model.ts`:
  - table keys `ACCOUNT_ORDERS = "fg.mock.accountOrders"`, `PARCELS = "fg.mock.parcels"`, `MISSIONS = "fg.mock.missions"`, `STATUS_EVENTS = "fg.mock.statusEvents"`, `DELIVERY_CODES = "fg.mock.deliveryCodes"`, `RECIPIENT_LINKS = "fg.mock.recipientLinks"`, `OUTBOX = "fg.mock.outbox"`;
  - `type AccountOrder = { code; ownerAccountId: string | null; createdByUserId: string | null; createdAt; service; sender: {name; phone: string | null; address; city: string | null}; recipient: {name; phone; address; city: string | null}; pickupPointId: string | null; recipientLocale: Locale; status: OrderStatus; lossReported: boolean; totalMillimes: number; priceLines: {kind: PriceLine; millimes: number}[]; paymentMode: PaymentCode; freightPayer: "sender" | "recipient"; freightPayerAccepted: boolean; strongerProofRequested: boolean; cancel: {at: string; fee: "none" | "applies" | "backOfficeDecides"} | null; etaUtc: string | null }`;
  - `type Parcel = { id; orderCode; index: number; barcode; size: ParcelTypeCode; weightDeclaredG: number; weightMeasuredG: number | null; declaredValueMillimes: number | null; codMillimes: number | null; fragile: boolean; proofLevel: ProofLevel; attempts: number; status: ParcelStatus; failure: {reason: string; photo: string} | null; proof: {kind: ProofLevel; capturedAt: string} | null }`;
  - `type Mission = { id; orderCode; kind: "pickup" | "delivery"; status: MissionStatus; offeredAt; expiresAt: string | null; arrivedAt: string | null; finishedAt: string | null; endReason: EndReason }`;
  - `type StatusEvent = { id; subjectType: "order" | "parcel" | "mission"; subjectId; fromStatus; toStatus; actorId: string; occurredAt: string; endReason?: EndReason }`.
- Produces, in `states.ts`:
  - `ORDER_NEXT`, `PARCEL_NEXT`, `MISSION_NEXT` (records of allowed next states, copied from the umbrella's tables), `DERIVED_ORDER_STATES`, `FINAL_ORDER_STATES`, `FINAL_PARCEL_STATES` (`handed_over returned lost canceled`);
  - `type Refusal = "illegalTransition" | "derivedState" | "orderNotAssigned" | "noParcelTaken" | "endReasonInternal" | "notFound"`;
  - `transition(subject: {type: "order" | "parcel" | "mission"; id: string}, to: string, actorId: string, options?: {endReason?: EndReason; at?: number}): {ok: true} | {refused: Refusal; from?: string; to?: string}` — *Ruling (5 Nov 2026):* a non-null `options.endReason` is always refused with `endReasonInternal`, before anything is read or written; only the order cascades end a mission early, through an internal function;
  - `deriveOrderOutcome(parcels: ParcelStatus[]): DerivedOutcome` (pure, `canceled` ignored);
  - `activePickupMission(orderCode: string): Mission | null` (latest pickup mission not `refused`, `expired` nor ended with an `endReason`);
  - `createMission(orderCode: string, kind: "pickup" | "delivery", at?: number): Mission` (status `proposed`, writes an event `null → proposed`).

Rules the tests pin (all from the umbrella, ADR-1):
- order transition to a derived state → `{refused: "derivedState"}`;
- order `assigned → confirmed` finishes the active pickup mission with `driverRemoved`; `assigned → pickup_failed` with `pickupFailed`; parcels untouched;
- order `→ canceled` finishes the active pickup mission with `orderCanceled` and moves every `to_collect` parcel to `canceled` (actor `system`), in the same call. *Ruling: the cascade lives in `transition` so fixtures are consistent; PR A's `cancelOrder` calls it.*
- parcel `→ taken` reads the order first: refused `orderNotAssigned` unless the order is `assigned` or its status is `picked_up` or later (and not `canceled`);
- mission `→ finished`: with `endReason: null` only from `arrived`, and for a pickup mission refused `noParcelTaken` unless one parcel of the order was scanned (status neither `to_collect` nor `canceled`; ruling of 5 Nov 2026, the old test on `taken` left pickups stuck); on success every `to_collect` parcel goes `canceled` (actor `system`). An early end (a non-null `endReason`) is allowed from `proposed`, `accepted` or `arrived`, parcels untouched, but only as the result of an order change (`assigned → confirmed`, `assigned → pickup_failed`, `→ canceled`); a direct call is refused with `endReasonInternal` and changes nothing. `picked_up → lost` is a listed order move reached only by derivation (a direct order transition to `lost` stays `derivedState`). `arrivedAt` is set on `→ arrived`, `finishedAt` on `→ finished`;
- every parcel change recomputes `lossReported` (any counted parcel `lost`); if the order is not final, it computes `deriveOrderOutcome` and, when the result differs from `order.status`, writes one order event (actor `system`) and updates `order.status`. A final order never changes status (H4);
- when the order becomes final (derived or `canceled`), the order's recipient link gets `expiresAt` (Task 3 provides `expireRecipientLink(orderCode, at)`; until Task 3, a no-op import is not allowed — define the function in `recipient-links.ts` in this task as a stub that sets `expiresAt` on the order's link row if it exists);
- each successful change writes exactly one event for its subject (plus the cascade's own events).

- [ ] **Step 1: Write the failing tests** in `states.test.ts`, with a `beforeEach` that clears localStorage and builds a 3-parcel order through helpers in the test file (`makeOrder(n)`, which writes an `AccountOrder` in `received` and `n` parcels in `to_collect` with `writeRow`):
  - generated matrix: for each of the three tables, every listed pair passes (with the preconditions above set up) and every other pair returns `illegalTransition` (order pairs into derived states return `derivedState`). Mission pairs are called directly, so `proposed → finished` and `accepted → finished` return `illegalTransition` there; those early ends are tested through the order cascade for all three end reasons from `proposed`, `accepted` and `arrived`, plus the direct call refused with `endReasonInternal` with every table and the event log unchanged;
  - `first scan writes picked_up`: `received→confirmed→assigned`, scan parcel 1 → order `picked_up`, exactly one order event `assigned→picked_up` with actor `system`;
  - `change that keeps the outcome writes no order event` (scan parcel 2 after parcel 1);
  - `normal finish cancels to_collect`; `noParcelTaken` (no scanned parcel: refused, parcels `to_collect`, order `assigned`, mission `arrived`, no event); the finish after the scanned parcel moved on: P1 `taken → in_transit` (order stays `in_transit`), P1 `taken → lost` (order reaches `lost`, one order event), P1 `→ handed_over` (order reaches `delivered`, one order event), P1 to P3 `taken → at_depot` (nothing to cancel), each canceling the parcels still `to_collect`;
  - `retry after driver removed` and `retry after failed pickup` exactly as the umbrella's PR 0 list;
  - scan refused with `orderNotAssigned` in `received`, `confirmed`, `pickup_failed`, and after `→ canceled` (parcel already `canceled`: still `orderNotAssigned`, never `illegalTransition`);
  - `deriveOrderOutcome`: `["taken","taken"]` → `picked_up`; each of `in_transit at_depot delivery_failed returning handed_over` with the other `taken` → `in_transit`; all `handed_over` → `delivered`; `["handed_over","handed_over","returned"]` → `partially_delivered` (T19); `["handed_over","lost"]` → `partially_delivered`; `["returned","lost"]` → `returned`; all `lost` → `lost`; `["handed_over","canceled"]` → `delivered`;
  - `lossReported` true for returned + lost and for handed_over + lost;
  - H4: final order, parcel `lost → at_depot`: parcel changes, `lossReported` false, no order event, status unchanged;
  - each change writes one event with `fromStatus`, `toStatus`, `actorId`, `occurredAt`.
- [ ] **Step 2: Run** `pnpm --filter @fastgo/web exec vitest run src/lib/data/states.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `order-model.ts` and `states.ts`. Reads and writes go through `readTable`/`writeRow`; times through `now()` from `lib/order/clock.ts` unless `options.at` is given. Event ids from `crypto.randomUUID()`.
- [ ] **Step 4: Run** — Expected: PASS. Then `pnpm --filter @fastgo/web test` — all pass.
- [ ] **Step 5: Commit** `ESP-00: order, parcel and mission states with one transition function and the event log`.

### Task 3: proof level, recipient link, outbox, and `createOrder`

**Files:**
- Modify: `apps/web/src/lib/order/proof.ts`, `apps/web/src/lib/order/constants.ts`, `apps/web/src/lib/order/request.ts`, `apps/web/src/lib/data/orders.ts`, `apps/web/src/lib/data/mock-db.ts`
- Create: `apps/web/src/lib/data/recipient-links.ts` (replace Task 2's stub), `apps/web/src/lib/data/outbox.ts`
- Test: `proof.test.ts`, `recipient-links.test.ts`, `orders.test.ts` (extend), `mock-db.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 `splitWhole`, `kgTextToGrams`; Task 2 types and `transition`.
- Produces:
  - `type ProofLevel = "codeOrPhotoWithPosition" | "codeOrSignatureAndPhoto" | "codeOrAgentPhoneWithSignatureAndPhoto"`;
  - `proofLevelFor(parcel: {fragile: boolean; codMillimes: number | null}, order: {totalDeclaredValueMillimes: number | null; strongerProofRequested: boolean}, threshold?: number | null): ProofLevel` — strongest wins; COD on the parcel, or the order total strictly above the threshold, gives the strongest; fragile or `strongerProofRequested` gives the middle one;
  - `handoverCodeRequired(parcel, order, threshold?): boolean` — COD on the parcel, or order total above the threshold;
  - `RECIPIENT_LINK_AFTER_DELIVERY_MS = 24 * HOUR` in `constants.ts`, comment `// unsourced: "délai fixé", R406`;
  - `mintRecipientToken(randomBytes?: (n: number) => Uint8Array): string` — 22 base64url chars from 16 bytes of `crypto.getRandomValues`;
  - `mintRecipientLink(orderCode: string, locale: Locale): string` (returns the token); `expireRecipientLink(orderCode: string, at: number): void`;
  - `type OutboxMessage = { id; ownerAccountId: string | null; orderCode; channel: "sms"; template: "trackingLink"; params: { senderName: string; senderPhone: string | null; trackingCode: string; linkToken: string }; locale: Locale; createdAt }`; `writeOutbox(message: Omit<OutboxMessage, "id" | "createdAt">): void`;
  - `consumeFailNext(op: string): boolean` in `mock-db.ts`, reading and removing `fg.mock.failNext:<op>`; `FAIL_NEXT_ORDER_RESPONSE_KEY` and `FAIL_NEXT_ORDER_REQUEST_KEY` keep working as aliases (createOrder checks both the alias and `consumeFailNext("createOrder.response")` / `"createOrder.request"`);
  - `OrderRequest.parcel` gains `weightText: string` (the W13 text, from the draft) — `weightKg` stays for pricing.
- `createOrder` after the existing checks and inside the same non-replay branch:
  - `freightPayer` from `request.payment`: `cashDelivery` → `"recipient"`, `cashPickup` and `account` → `"sender"`; `freightPayerAccepted: false` (PR A adds the W15 checkbox; *ruling: R607 refusal is PR A's*);
  - `recipientLocale = request.recipient.smsLanguage`;
  - `priceLines` from `request.quote` (each line kept), `totalMillimes` the quote total;
  - `ownerAccountId`/`createdByUserId` from `getSession()` (null for a guest);
  - N = `request.parcel.count` parcels of `size = request.parcel.type`, `weightDeclaredG` = `splitWhole(kgTextToGrams(weightText), N)`, `declaredValueMillimes` = `splitWhole(value, N)` or all `null`, `codMillimes: null`, `proofLevel` from `proofLevelFor` with the order total, barcode `${code}-${index}` (1-based), one `deliveryCodes` row per parcel (4 random digits, `failedAttempts: 0`, `expiresAt: null`);
  - order status `received` with an event `null → received` (actor = session user or `"guest"`), parcels `to_collect` with their events;
  - one recipient link; one outbox message (`template: "trackingLink"`, locale `recipientLocale`);
  - a replayed key writes none of these again.

- [ ] **Step 1: Write the failing tests:**
  - `proofLevelFor`: plain → `codeOrPhotoWithPosition`; fragile → `codeOrSignatureAndPhoto`; `strongerProofRequested` → `codeOrSignatureAndPhoto`; COD → strongest; fragile + COD → strongest; threshold `100_000`, 3 parcels with total `150_000` (shares `50_000`) → every parcel strongest; same order with COD on one parcel and threshold `null` → only that parcel strongest; threshold `null` never triggers;
  - `mintRecipientToken` with fixed bytes gives a 22-char `/^[A-Za-z0-9_-]{22}$/` string; two calls with real randomness differ; the token does not contain the tracking code;
  - `createOrder` with count 3, weight `"2,5"`, declared value 100 000: 3 parcels of `[833, 833, 834]` g and `[33333, 33333, 33334]` millimes, statuses `to_collect`, order `received`;
  - `freightPayer`: `cashDelivery` → `recipient`, `cashPickup` → `sender`, `account` (validated merchant session) → `sender`;
  - `smsLanguage: "en"` → `recipientLocale: "en"` and the outbox message locale `en`, stored as `{template, params, locale}`;
  - replayed key: still one order, 3 parcels, one link, one outbox message;
  - `legacy order still tracks`: a row written only in `fg.mock.orders` (Prompt 3 shape) is still found by `getOrderConfirmation`;
  - `consumeFailNext("x")` is true once after setting `fg.mock.failNext:x`, then false; the Prompt 3 alias keys still make `createOrder` throw `NetworkError`.
- [ ] **Step 2: Run** the four test files — Expected: FAIL.
- [ ] **Step 3: Implement** as specified; `buildOrderRequest` copies `parcel.weightKg` text into `weightText`. `fingerprint` must not change for an identical draft (add `weightText` to the request but exclude nothing else).
- [ ] **Step 4: Run** `pnpm --filter @fastgo/web test` — Expected: PASS, including every Prompt 3 test.
- [ ] **Step 5: Commit** `ESP-00 R203 R406 R903 R607: createOrder writes parcels, codes, link and outbox`.

### Task 4: fixtures through `transition`, scoped readers, public tracking

**Files:**
- Create: `apps/web/src/lib/data/fixtures/orders.ts`, `apps/web/src/lib/data/account-orders.ts`
- Modify: `apps/web/src/lib/data/tracking.ts`, `apps/web/src/lib/data/fixtures/tracking.ts`, `apps/web/src/lib/data/fixtures/accounts.ts`, `apps/web/src/components/tracking/tracking-view.tsx`
- Test: `account-orders.test.ts`, `fixtures.test.ts`, `data.test.ts` (adjust tracking)

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces:
  - `seedOrderFixtures(): void` — idempotent: runs only when `fg.mock.seed` is not `"orders-v1"`, then sets it; never touches rows it did not create. Every reader in `account-orders.ts` and `tracking.ts` calls it first;
  - `listAccountOrders(session: Session): AccountOrder[]` (owner = `session.accountId`, newest first); `getAccountOrder(session: Session, code: string): AccountOrder | {notFound: true}` (another account's order gives the same `notFound`); `parcelsOf(orderCode): Parcel[]`; `orderHistory(orderCode): {status: OrderStatus; atUtc: string}[]` (order events only);
  - `type PublicTracking = { status: OrderStatus; etaUtc: string | null; history: {status: OrderStatus; atUtc: string}[]; fromCity: string | null; toCity: string | null; parcelCount: number; parcelOutcomes: ParcelStatus[] }` and `publicTrackingOf(code: string): PublicTracking | null`. *Ruling: `etaUtc` is kept in the allowlist because SUI-01 shows the estimated time and it is not personal data; listed in the PR.*
  - `lookupTracking(code)` returns `{status: "found"; tracking: PublicTracking} | {status: "not-found"} | {status: "invalid-format"}`. The `TrackingStep` type and `FOUND_PARCEL` are removed; `FOUND_TRACKING_CODE` stays and is a fixture order in `in_transit` with `etaUtc "2026-11-04T13:20:00Z"`.
- New fixture accounts (fake): `acc-customer-empty` (Lina M., `+21698000003`), `acc-customer-other` (Karim S., `+21698000004`), `acc-customer-return-due` (Hana R., `+21698000005`, field `returnBalanceMillimes: 7000`, marked "mock field" in a comment).
- Fixture orders for `acc-customer` (built only with `createMission` and `transition`, times fixed in Nov 2026): one in each of `received`, `confirmed`, `assigned` before `arrivedAt`, `assigned` after `arrivedAt`, `pickup_failed`, `picked_up`, `in_transit`, `delivered`, `canceled`, `returned` with `lossReported` (returned + lost), and a 3-parcel order ending `partially_delivered` (T19: 2 `handed_over`, 1 `returned`); every `handed_over` parcel gets a `proof` matching its `proofLevel`. One order for `acc-customer-other`. Two orders for `acc-merchant-validated`, one with COD on each of its 2 parcels.

- [ ] **Step 1: Write the failing tests:**
  - `seed runs once and keeps created orders`: seed, create an order with `createOrder`, call a reader again: the created order is still there and fixture counts are unchanged;
  - every fixture order's events replay through the transition tables (each event's `from → to` is an allowed pair, or a derived order event);
  - R401: every `handed_over` fixture parcel has `proof.kind === proofLevel`;
  - `acc-customer` has an order in each status listed above; T19 order is `partially_delivered`;
  - `getAccountOrder` for another account's code returns `{notFound: true}`, same as an unknown code; `listAccountOrders(acc-customer-empty)` is empty;
  - `publicTrackingOf` keys equal exactly `["etaUtc","fromCity","history","parcelCount","parcelOutcomes","status","toCity"]` (sorted), and its JSON contains no fixture name, phone or address;
  - `lookupTracking normalizes the code`: `"fg-7k4m-2qxp"` and `" FG 7K4M 2QXP "` find the fixture (as Prompt 3 did).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**, then update `tracking-view.tsx` to show `tracking.status` with the client wording (`orders.client.<status>` keys, Task 7) and the history with `orders.status.<status>` names. The timeline shows the order events only.
- [ ] **Step 4: Run** `pnpm --filter @fastgo/web test` — Expected: PASS.
- [ ] **Step 5: Commit** `ESP-00 R401 R405 SUI-01: fixtures built through transitions, scoped readers, public tracking shape`.

### Task 5: session with user and role, team members, `homeFor`

**Files:**
- Modify: `apps/web/src/lib/data/session.ts`, `apps/web/src/lib/data/accounts.ts`, `apps/web/src/lib/data/fixtures/accounts.ts`, `apps/web/src/lib/auth/safe-next.ts` and the sign-in success paths that use `DEFAULT_AFTER_SIGN_IN`
- Test: `session.test.ts` (new), `accounts-auth.test.ts` (extend)

**Interfaces:**
- Produces:
  - `Session` gains `userId: string` and `role: "admin" | "user" | null`;
  - `getSession upgrades an old session`: a stored session without `userId` gets `userId = accountId`; without `role` gets `null` for a customer and `"admin"` for a merchant;
  - `FIXTURE_TEAM_MEMBERS: {userId; accountId; name; phone; role: "admin" | "user"}[]` — `usr-yasmine-admin` (Yasmine K., `+21671000011`, admin) and `usr-yasmine-user` (Walid H., `+21671000012`, user), both on `acc-merchant-validated`. Signing in with a member's phone and `FIXTURE_PASSWORD` gives `{accountId: "acc-merchant-validated", userId, role, kind: "merchant", contract: "validated"}`;
  - `sessionFor(account)`: `userId = account.id`, `role = null` for a customer, `"admin"` for the merchant account itself;
  - `homeFor(session: Session): "/compte" | "/pro"`; after sign-in with no `next`, the redirect is `homeFor(session)`; a `next` stays honoured by `safeNext`;
  - `signOut()` also removes the order draft key (from `lib/order/draft.ts`) and never touches `fg.mock.*` tables.
- [ ] **Step 1: Write the failing tests** for each bullet above (one test each).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm --filter @fastgo/web test` — PASS.
- [ ] **Step 5: Commit** `ESP-00 PRO-06 EX12: session carries user and role; team members; homeFor`.

### Task 6: `Dialog` and the stacked table in `packages/ui`

**Files:**
- Create: `packages/ui/src/components/dialog.tsx`
- Modify: `packages/ui/src/components/table.tsx`, `packages/ui/src/index.ts`, `apps/web/src/components/dev/ui-showcase.tsx` (and its fixture `fixtures/dev-ui.ts`)
- Test: `apps/web/e2e/ui.spec.ts` (extend)

**Interfaces:**
- Produces:
  - `Dialog({ open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; actions: ReactNode })` — native `<dialog>` opened with `showModal()` in an effect when `open`, closed with `close()`; `aria-labelledby` on its title id; the `close` event calls `onClose`; actions live inside `<form method="dialog">` so a plain button closes it; the safe button gets `autoFocus` from the caller. No `role="dialog"`, no focus trap, no scroll lock (modern-web-guidance `dialog`);
  - `Table` gains `stacked?: boolean`: the region gets `@container`, and below 600 px of container width rows render as cards; `Td` gains `label?: string`, shown only in stacked mode (`@[600px]:hidden` span), so each cell names its column. Th headers are visually hidden in stacked mode but stay in the DOM.
- [ ] **Step 1: Write the failing e2e** in `ui.spec.ts`: on `/fr/dev/ui`, the dialog demo opens, focus is on the safe button, Escape closes it, focus returns to the opener, and a live text shows "fermé"; at 360 px the stacked demo table has no horizontal overflow and each cell shows its column label; axe clean.
- [ ] **Step 2: Run** `PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright pnpm --filter @fastgo/web exec playwright test e2e/ui.spec.ts` (fastgo-e2e-fast skill for the fast path) — FAIL.
- [ ] **Step 3: Implement**, with the demo strings in `packages/i18n` (`ui.dialog.*`, `ui.table.stacked*`). Move the existing draft-cancel dialog (`components/order/cancel-order.tsx`) onto `Dialog`, keeping its `cmd.cancelConfirm.*` keys.
- [ ] **Step 4: Run** the e2e and `pnpm --filter @fastgo/web exec playwright test e2e/order-flow.spec.ts` — PASS.
- [ ] **Step 5: Commit** `ESP-00: Dialog and stacked table in packages/ui` (the PR lists this as a `packages/ui` change for the engineers).

### Task 7: state wording, the two shells and the guard

**Files:**
- Delete: `apps/web/src/app/[locale]/(site)/compte/page.tsx` (two groups serving `/compte` is a build error)
- Create: `apps/web/src/app/[locale]/(account)/layout.tsx`, `(account)/compte/page.tsx`, `(pro)/layout.tsx`, `(pro)/pro/page.tsx`, `apps/web/src/components/account/require-session.tsx`, `space-nav.tsx`, `space-nav-items.ts`, `sign-out-button.tsx`
- Modify: `packages/i18n/src/messages/*.json` (via the fastgo-i18n-keys skill), `apps/web/CLAUDE.md`, `apps/web/src/components/coming-soon.tsx` (drop the `account` page if unused)
- Test: `apps/web/e2e/account.spec.ts` (new), `apps/web/e2e/public-site.spec.ts` (adjust `/suivi`)

**Interfaces:**
- Consumes: Task 5 `getSession`, `homeFor`, `signOut`; Task 4 `lookupTracking`.
- Produces:
  - catalog keys `orders.status.<id>` (cahier names: Reçue, Confirmée, Attribuée, Collecte ratée, Prise en charge, En route, Livrée, Livrée en partie, Rendue, Perdue, Annulée), `orders.client.<id>` (fr verbatim from the umbrella's order table; `picked_up` is `{count, plural, one {Votre colis est récupéré} other {Vos # colis sont récupérés}}`, the four outcomes `"Issue de la livraison : {outcome}. Le détail par colis suit."`), `parcels.status.<id>` (À prendre, Pris, Au dépôt, En route, Remise ratée, Retour, Remis, Rendu, Perdu, Annulé); the old `tracking.steps.*` keys are removed with `merge.py --remove`;
  - `SPACE_NAV: Record<"customer" | "merchant", {key; href; ready: boolean; roles?: ("admin" | "user")[]}[]>` with every entry of the umbrella's part A–F routes (`/compte`, `/compte/commandes`, `/compte/factures`, `/compte/reclamations`, `/compte/adresses`, `/compte/profil`; `/pro`, `/pro/commandes`, `/pro/import`, and for `admin` only `/pro/cod`, `/pro/factures`, `/pro/releves`, `/pro/entreprise`). Only `ready` entries render; PR 0 sets `ready` on `/compte` and `/pro` only. *Ruling: no dead links in PR 0; each later PR flips its flag.*
  - `RequireSession({ kind: "customer" | "merchant"; role?: "admin" | "user"; children })` — renders the server h1 and a busy placeholder until mounted, a `<noscript>` note; no session → `router.replace("/connexion?next=<current path>")`; wrong kind → `router.replace(homeFor(session))`; wrong role → "not allowed" text (`account.guard.notAllowed`);
  - `/compte` (C01 skeleton): h1 `account.home.title`, the slots as named empty regions for parts A, B and G (orders in progress, last deliveries, "À régler", frequent recipients, install banner) each rendering nothing yet; `/pro` (P01 skeleton) the same with its slots. Both `noindex`, metadata through `localizedMetadata`;
  - the sign-out button in both shells calls `signOut()` then goes to `/connexion`.
- [ ] **Step 1: Write the failing e2e** in `account.spec.ts`: no session on `/fr/compte` → `/fr/connexion?next=%2Fcompte` (also `/pro`); customer on `/fr/pro` → `/fr/compte`; merchant signs in with no `next` → `/fr/pro`; team member `user` signs in → `/fr/pro`; sign-out clears the session and the order draft (localStorage checked) and keeps `fg.mock.accountOrders`; `checkPage` on `/compte` and `/pro` in fr and ar at both viewports. In `public-site.spec.ts`, `/suivi?n=FG-7K4M-2QXP` shows "Votre livraison est en cours" in fr and its ar and en strings, the ETA "14 h 20", and the HTML contains no fixture name or phone; a created order shows "Nous avons reçu votre commande".
- [ ] **Step 2: Run** with the fastgo-e2e-fast skill — FAIL.
- [ ] **Step 3: Implement.** Add every string with the fastgo-i18n-keys skill (fr, en, ar together; AR-REVIEW regenerated). Update `apps/web/CLAUDE.md`: the new tables (`accountOrders parcels missions statusEvents deliveryCodes recipientLinks outbox seed failNext:<op>`), the folder map (`(account)`, `(pro)`), the team-member fixtures.
- [ ] **Step 4: Run** `pnpm lint && pnpm typecheck && pnpm test`, then `PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright bash .claude/skills/fastgo-verify-pr/verify.sh` — Expected: all green.
- [ ] **Step 5: Commit** `ESP-00 ESP-03 PRO-01 SUI-01: state wording, client and merchant shells with the session guard`.

### Task 8: review and PR

- [ ] **Step 1:** fresh reviewer subagent with `engineering:code-review` on `origin/main..HEAD` against this plan, the umbrella and `regles.md`; fix each finding in new commits.
- [ ] **Step 2:** fastgo-verify-pr (`verify.sh`) and superpowers:verification-before-completion: paste the real counts.
- [ ] **Step 3:** push `git push -u origin web/ESP-00-account-base`; open the PR (not merged). The description lists: the rulings marked *Ruling* above, the `packages/ui` and `packages/i18n` changes for the engineers to review when they join (Helmi merges while working alone), the `CLAUDE.md` change, the deferred fixtures (contracts, invoices and claims arrive with parts C and D, which define their models), and the real test counts.

## Self-review

- Spec coverage (umbrella section 2, PR 0): states, events, derived states, scans, finishes, retries, H4 (Task 2); `splitWhole`, kg text (Task 1); proof by order total, link, outbox, `freightPayer`, `recipientLocale`, replay (Task 3); fixtures through `transition`, R401, R405 allowlist, `/suivi` (Tasks 4, 7); ADR-2 session, roles, guard, `homeFor`, sign-out (Tasks 5, 7); ADR-5 `consumeFailNext` (Task 3); `Dialog` and table (Task 6); first commit with `regles.md` (done, `f4dfc55`). ADR-3's route `/l/[token]`, `Referrer-Policy` and ADR-4's manifest are built in PRs F and G, which own their pages.
- Deferred with reason: contracts, invoices and claims fixtures (models defined in PRs C and D).
- Types used across tasks: `ProofLevel`, `OrderStatus`, `ParcelStatus`, `EndReason`, `Session.role` are defined once (Tasks 2, 3, 5) and only consumed after.
