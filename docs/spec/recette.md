# Recette : test matrix

Owner: Helmi (`@Helmi-Megdiche`), testing. Built on 20 Nov 2026 from `main` at `704dabd` (PR #126 merged). Every row was checked again against that commit by reading the cited test.

## Scope

- Every acceptance scenario of the cahier: T01 to T61, DR01 to DR36, EX01 to EX17 and CC1 to CC4 (118 IDs).
- Source: the cahier's tabs "Recette et tests" (scenarios, traceability matrix, gates, test levels, bug priorities) and "Rôles et droits" (DR, EX, CC). Scenario text is the cahier's, condensed into "situation → expected result (rules)".
- Level, priority and gate of a T row come from the cahier's traceability matrix: the levels of its rules, the highest priority among them, and every gate they name. DR and EX rows take T29's values, CC rows those of the scenario that tests them.
- Coverage is checked against what is merged on `main`: the web (public site, order flow, client space, profile, invoices and claims on the mock data layer, plus the API adapter behind the `auth`, `orders` and `account` flags), `packages/domain`, and the API (sessions, zones, quotes, orders, tracking, cancel) with its integration tests on real PostgreSQL, PgBouncer and Redis. There is no back-office, driver app or staging yet.
- Every test is named by its file and its exact name, read in the file. A row that says "Real API" is tested against the NestJS API in `apps/api/src/int`; "mock layer" means the web data layer only.

## Summary

| Group | Rows | Status |
|---|---|---|
| T | 61 | Covered 9, Partial 19, Not covered 8, Blocked 25 |
| DR | 36 | Not covered 1, Blocked 35 |
| EX | 17 | Covered 6, Partial 1, Not covered 6, Blocked 4 |
| CC | 4 | Blocked 4 |
| **All** | **118** | **Covered 15, Partial 20, Not covered 15, Blocked 68** |

On 8 Nov the total was Covered 10, Partial 15, Not covered 22, Blocked 71.

## Status

| Status | Meaning |
|---|---|
| Covered | The test named in Evidence checks the full expected result. The row says "Real API" when the API tests it, and "mock layer" when only the web data layer does; a mock-layer row says what must be rerun once the API route exists |
| Partial | Part of the expected result is tested. The Evidence says what is missing |
| Not covered | Belongs to a web PR not built yet (D to G), to L2, or to a manual check not done yet |
| Blocked | Needs something that does not exist yet: an API route, the back-office, the driver app, servers and staging, or real phones |

## Test levels (cahier)

| Level | What it checks | Tools (cahier) | When | Blocks | In the repo today |
|---|---|---|---|---|---|
| Unit | Prices, state changes, invoices, cash reconciliation, rights | Jest | Every change | Merge | vitest in `apps/web`, `apps/api`, `packages/domain`, `packages/contract`, `packages/i18n` and `packages/ui` (the cahier says Jest, the repo uses vitest) |
| Integration | API with real PostgreSQL and Redis, TTN and SMS simulated | Jest, Testcontainers | Every merge | Merge | Testcontainers (PostgreSQL + PostGIS, PgBouncer, Redis) in `apps/api/src/int`, CI job "API integration tests". TTN is not built |
| Contract | Answers and errors match OpenAPI | Schemathesis | Every merge | Merge | Schemathesis 4.33.4 in `apps/api/src/int/contract.int.test.ts` |
| E2E ("Parcours") | Scenarios in the browser and the app | Playwright | Every night | Release | Playwright in 3 shards on every PR (#67, #77), including the api-mode specs `auth-api`, `orders-api`, `profile-api` |
| Mobile ("Terrain") | Real Android phones and iPhone, weak network, locked screen | Manual, test log | End of S2, then before the pilot | G2, G3 | Not done |
| Load | FastGo's 12-month volume, with a margin for peaks | k6 | S6, then before L2 | G3 | Not done |
| Code security | Code, secrets, dependencies | Semgrep, Gitleaks, Trivy | Every merge | Merge | Gitleaks in CI on every PR (#67). Semgrep and Trivy not done |
| Application security | Common flaws, then external pentest | OWASP ZAP, external firm | Weekly, S6, before L2 | G3 | Not done |
| Fraud | False handover, false code, cash gap, double entry | Dedicated scenarios | S6 | G3 | Not done |
| Accessibility | WCAG 2.1 AA on sign-up, order and tracking | axe-core, manual screen reader | Every night, then S6 | G3 | axe-core in e2e; manual not done |
| Acceptance ("Recette") | The scenarios, played by future users | Checklist | S6, before L2 | G3 | Not done |
| Pilot | Real deliveries on one zone | Back-office measures | S7 and S8 | G4 | Not done |

"Manual" in the matrix is the cahier's "Recette" level.

## Bug priority (cahier)

| Priority | Examples | Fix during acceptance |
|---|---|---|
| P1 | Nobody can order or deliver, money or data at stake, security flaw | 24 h |
| P2 | A planned function works badly and no simple workaround exists | 3 working days |
| P3 | Simple workaround exists, or display defect | Before go-live if possible, else next delivery |

The cahier numbers them 1 to 3; P1 to P3 here are the same values. There is no P0.

## Gates (cahier)

| Gate | Due | Conditions to continue |
|---|---|---|
| G1 Cadrage | End of S1 | Decisions taken or defaults kept; mockups validated; TTN, ANCE and INPDP files filed; legal invoicing owner named by FastGo |
| G2 Preuve terrain | End of S2 | Continuous position for a service day, locked screen, on 3 entry-level models; alert in under 30 s; on iPhone, position and alert checked with the app open; TTN test invoice accepted, or written confirmation from the accountant that paper invoices are legal meanwhile |
| G3 Prêt pour le pilote | End of S6 | Launch scenarios pass, including a full order on iPhone; load test at FastGo's volume; pentest with no open critical or high flaw; TTN proof; T55 to T60 pass |
| G4 Ouverture | End of S8 | O3 and O4 reached on the pilot; O1, O2, O6 and O8 measured; no open P1 or P2 bug |

G3 passes when the G2 and G3 rows are green. Rows with G3, G4 are checked again on the pilot deliveries.

## PR mapping

| PR | Content | State on 20 Nov |
|---|---|---|
| Prompt 3 | Public site, order flow, sign-in | Merged (#4, #5) |
| 0 | Account base, states, fixtures | Merged (#6) |
| A | Client orders, cancel | Merged (#65) |
| B | Profile, addresses, e-mail, closing (#28) | Merged on the mock layer (#74). On the API: profile pushed on `web/GH-20-account-profile` (20-d), addresses and recipients in #122 |
| C | Invoices and claims (#29) | Merged (#66), mock layer only |
| D | Merchant space (#39) | Not built |
| E | Import and COD (#40) | Not built |
| F | Recipient link (#38) | Not built |
| G | Installable app (#37) | Not built |
| API | `apps/api` and `packages/contract` | Merged: contract (#85), skeleton (#88), database (#90), sessions (#97, #104), zones and quote (#101), orders and tracking (#110), cancel and confirm (#116). No invoicing, claims, dispatch or driver routes |
| Domain | `packages/domain` | Merged (#84, #87, #89) |
| BO, Driver | `apps/backoffice`, `apps/driver` | Not in the repo (back-office #25; the driver application form is #73) |
| Infra | Servers and CI | Merged: #68, #105, #108, #111, #113. Staging not deployed (#14, #15) |

Web rows follow the plan `docs/superpowers/plans/2026-11-05-prompt-4-umbrella.md`, section 11.

## Matrix

### Acceptance scenarios (T01 to T61)

| ID | Scenario and expected result | Level | Priority | Gate | PR | Status | Evidence |
|---|---|---|---|---|---|---|---|
| T01 | Un client connu commande sur un téléphone Android → Commande terminée en moins de 2 min et visible par l'agent dans les secondes qui suivent (R204, R209) | Unit, Integration | P1 | G3 | Prompt 3, A, BO | Partial | Price lines on the real API: `apps/api/src/int/pricing.int.test.ts` "R204_T01: prices a pinned quote, keeps it, and reads it back". Web: `apps/web/e2e/order-flow.spec.ts` "W15 lists every price line". Missing: the order done in under 2 min on a phone (field test) and the agent seeing it in seconds (back-office #25) |
| T02 | Une cliente commande depuis la version installée sur iPhone → Commande, suivi et facture fonctionnent ; le SMS de suivi arrive même sans notification autorisée (R102) | E2E | P1 | G3 | G | Blocked | PR G (installable app) not built; needs a real iPhone (G2, about 25 Nov). SMS only goes to the outbox |
| T03 | Le client clique deux fois ou perd le réseau en validant → Une seule commande existe (R202) | Integration | P1 | G3 | Prompt 3 | Covered | Real API: `apps/api/src/int/orders.api.int.test.ts` "R202: the same key and body answer the same 201 and create one order; another body is KEY_REUSED", "R202: two calls with the same key at once create one order, both answers are the same, and the proof is spent once". Web: `apps/web/e2e/order-flow.spec.ts` "a double click on Valider creates one order (R202)" |
| T04 | Le client saisit une adresse hors zone → Il le sait avant le prix, en français, en arabe ou en anglais (R201) | Integration | P2 | G3 | Prompt 3 | Partial | Server on the real API: `apps/api/src/int/pricing.int.test.ts` "R201_T04: out of zone is 422 with one entry per address, before any price, and no row is written". Web: `apps/web/e2e/order-flow.spec.ts` "an out-of-zone address shows W17 and no price anywhere (R201)". Missing: W17 is checked in fr and ar, not in en |
| T05 | Le prix affiché dépasse sa durée de validité → Le nouveau prix s'affiche et le client le revalide (R205) | Unit | P2 | G3 | Prompt 3 | Covered | Real API: `apps/api/src/int/pricing.int.test.ts` "R205_T05: 200 until the last millisecond, 410 QUOTE_EXPIRED from expires_at on". Domain: `packages/domain/src/order/pricing.test.ts` "is valid for exactly 15 minutes" |
| T06 | Le client annule avant l'arrivée du livreur, puis après, puis après la prise en charge → Gratuit, puis avec frais, puis renvoi vers une réclamation (R212) | Unit | P2 | G3 | A | Covered | Real API: `apps/api/src/int/orders.api.int.test.ts` "cancels for free as the owner: the order, its parcels, the events with the person, and the order answers its cancel", "after the driver arrived the fee is 5 DT: accepting none is feeRequired and writes nothing, accepting applies stores the amount and ends the mission", "a failed pickup: the back office decides (no amount); the pickup on: claimOnly; a final state: notCancellable (409, field status)". Web (mock layer): `apps/web/e2e/account.spec.ts` "T06 case 1: free before the driver arrives, no fee line, the order ends canceled", "T06 case 2: after the driver arrived the dialog shows the fee before the confirm", "T06 case 3: after pickup there is no cancel button, only a claim" |
| T07 | Le client ouvre un compte avec Google → Son téléphone est vérifié, un e-mail connu ne crée pas de doublon, un compte livreur ou interne est refusé (R101, R103) | Integration, E2E | P2 | G3 | Prompt 3 | Partial | `apps/web/e2e/auth.spec.ts` "Google, known e-mail: e-mail code first, then the phone is still required (R103)", "Google, known e-mail: another phone than the account's is refused (item 15)". Missing: refusing a driver or internal account (those accounts do not exist yet) |
| T08 | Un commerçant importe un fichier avec des erreurs → Les bonnes lignes passent et chaque erreur est expliquée (R206) | Unit | P1 | G3 | E | Not covered | PR E not built |
| T09 | On génère un très grand nombre de numéros de suivi → Aucun doublon ni suite devinable (R203) | Unit | P1 | G3 | 0 | Partial | Real API: `apps/api/src/int/orders.api.int.test.ts` "R203: a tracking number already used is drawn again, in a savepoint, and the order is still created once". Web: `apps/web/src/lib/data/orders.test.ts` "are FG-XXXX-XXXX, random and never reused, fixtures included". Missing: a test at a very large volume |
| T10 | Un inconnu cherche un numéro de suivi → Il voit l'état, sans nom, adresse, téléphone ni position (R405) | Integration | P1 | G3 | 0 | Covered | Real API: `apps/api/src/int/orders.api.int.test.ts` "answers the public tracking in the asked language, with nothing personal". Web (mock layer): `apps/web/e2e/public-site.spec.ts` tracking tests |
| T11 | Quelqu'un essaie d'ouvrir un lien au hasard ou expiré → L'accès est refusé et les essais automatiques sont bloqués (R406) | Integration | P1 | G3 | F | Partial | The API blocks guessing of tracking numbers (R405): `apps/api/src/int/orders.api.int.test.ts` "an unknown number is 404, a malformed one 400, and too many misses from one IP are 429 with Retry-After (T11)". Missing: the recipient link of R406 (PR F, #38) and its blocked attempts |
| T12 | Le destinataire choisit un autre créneau après un échec → Le dispatch le voit et l'expéditeur est informé (R503) | E2E | P2 | G3 | F, BO | Not covered | PR F (recipient link, #38) not built; the dispatch side is back-office (#25) |
| T13 | Un livreur passe une journée avec l'écran verrouillé sur 3 téléphones Android d'entrée de gamme → La position continue et une coupure alerte le back-office (R302) | Integration | P1 | G2, G3 | Driver | Blocked | No driver app (Helmi); needs 3 Android phones (G2, about 25 Nov) |
| T14 | Un dispatcher attribue une commande non confirmée, un véhicule sans papiers à jour ou un livreur au plafond → Le serveur refuse (R301, R302, R304) | Unit, Integration | P1 | G3, G2 | API, BO | Blocked | No dispatch or assignment route on the API, no back-office (#25) |
| T15 | Le livreur marque un colis Remis sans preuve → Le serveur refuse (R401) | Integration | P1 | G3, G4 | Driver, API | Blocked | No driver app and no proof-of-delivery route on the API |
| T16 | Le livreur remet un colis sans réseau, avec un bon code puis un faux → Le bon passe, le faux non, et le serveur revérifie au retour du réseau (R402) | Mobile | P1 | G3 | Driver | Blocked | No driver app; field test on phones |
| T17 | La remise se fait loin de l'adresse → Elle passe et crée une alerte (R403, R404) | Integration | P2 | G3 | Driver, API | Blocked | No driver app and no delivery route on the API |
| T18 | La livraison échoue → Motif et photo sont exigés ; après le dernier essai, le retour est proposé (R501, R502) | Unit, E2E | P2 | G3 | Driver | Blocked | No driver app |
| T19 | Une commande de 3 colis finit avec 2 remis et 1 rendu → Elle se termine en Livrée en partie, avec la bonne facture (R601) | Integration | P1 | G3, G4 | 0, C | Partial | State: `packages/domain/src/states.test.ts` "the four outcomes (T19: partially_delivered when one parcel came back)"; `apps/web/src/lib/data/fixtures.test.ts` "T19: 2 handed_over and 1 returned give partially_delivered". Invoice on the mock fixture: `apps/web/src/lib/data/invoices.test.ts` "T19: the invoice bills all three parcels' freight plus the return fee from the constant". Missing: the invoice created by the API (R601, no invoicing on the API) |
| T20 | Quelqu'un tente un changement d'état non prévu → Le serveur refuse et rien ne change (États) | Integration | P1 | G3 | 0, API | Partial | Domain: `packages/domain/src/states.test.ts` "order table". Server: `apps/api/src/int/orders-cancel-db.int.test.ts` "a final state is never cancelled again: the definer refuses it, and a second cancel does not overwrite canceled_at, the fee or canceled_by". Missing: the other transitions (assign, pickup, delivery) have no API route yet |
| T21 | Un livreur fait une mission complète sur iPhone → Alerte, scan, preuve et espèces fonctionnent. S'il quitte l'application, il est prévenu et le back-office voit la position interrompue (R305, R407) | Mobile | P1 | G2, G3 | Driver | Blocked | No driver app; needs an iPhone (G2, about 25 Nov) |
| T22 | Une livraison se termine → La facture se crée en moins de 1 min, au bon montant et sans trou de numéro (R601, R603) | Integration | P1 | G3, G4 | API, BO | Blocked | No invoicing on the API (R601, R603) |
| T23 | La plateforme envoie une facture à TTN, puis TTN tombe en panne → Identifiant et QR reçus ; après la panne, aucune facture perdue ni envoyée deux fois (R604) | Integration | P1 | G2, G3 | API | Blocked | No invoicing on the API; needs TTN access |
| T24 | Le comptable corrige une facture → Elle reste inchangée et un avoir lié est validé par une autre personne (R602, R803) | Integration | P1 | G3 | C, BO | Partial | Web, mock layer: `apps/web/src/lib/data/invoices.test.ts` "the module exports readers only: no writer of an invoice", "R803: a credit note not issued yet is invisible, in the invoice, the list and by number"; `apps/web/e2e/billing.spec.ts` "R602: a corrected invoice shows its credit note, and the credit note shows its invoice". Missing: the accountant's correction and the validation by a second person (back-office #25, no invoicing on the API) |
| T25 | Un colis revient à l'expéditeur → Les frais prévus sont facturés, y compris pour un particulier (R605, R606) | Unit | P2 | G3 | API, BO | Blocked | No invoicing on the API, no back-office (#25) |
| T26 | Un agent tente de saisir un règlement → Seul le comptable le peut, et une annulation laisse une trace (R608) | Integration | P1 | G3 | BO | Blocked | No back-office (#25) |
| T27 | Un livreur remet sa caisse avec un écart → Le montant attendu est juste, l'écart demande un motif, les deux reçus sortent, le plafond bloque (R702 à R705) | Integration, Unit, Manual | P1 | G3, G4 | Driver, BO | Blocked | No driver app, no back-office (#25) |
| T28 | Un commerçant reçoit son relevé COD → Colis livrés, frais et reversement concordent au millime (R707) | Unit | P1 | G3, G4 | E | Not covered | PR E (import and COD, #40) not built |
| T29 | Chaque rôle tente chaque action de la matrice → Les 409 cases sont appelées par l'API, avec 0 accès hors droits (Rôles et droits) | Integration | P1 | G3 | API | Blocked | The 409 cells (DR01 to DR36, EX01 to EX17) must be called on the API; only part of the routes exist and the back-office (#25) does not. The database half exists: `apps/api/src/int/rights.int.test.ts` "has RLS on and forced, no right for PUBLIC, and exactly the expected rights for the app" is a grant test, not the matrix. Rights matrix tests: Ala |
| T30 | Une réclamation va jusqu'à l'archivage → Le client ne voit jamais les notes internes (R803, R804) | Integration | P1 | G3 | C | Partial | Database: `apps/api/src/int/orders.int.test.ts` "T30: an internal ticket note is never visible to the customer". Web, mock layer: `apps/web/src/lib/data/claims.test.ts` "the fixture has an internal note, and the client never receives it"; `apps/web/e2e/billing.spec.ts` "T30: the internal note is not in the page". Missing: the claim routes on the API and the staff side to the archiving |
| T31 | Un responsable exporte un rapport → Le fichier reprend les chiffres de l'écran (Rapports) | E2E | P2 | G3 | BO | Blocked | No back-office (#25) |
| T32 | On parcourt le site, le back-office et les applications en arabe et en anglais → Tous les textes sont traduits, le choix de langue est conservé et la mise en page reste correcte (Site) | E2E | P2 | G3 | All | Partial | Web pages in fr, ar, en: `apps/web/e2e/languages.spec.ts` and the public pages. Back-office and apps do not exist |
| T33 | On audite l'inscription, la commande et le suivi → Pas de blocage d'accessibilité WCAG 2.1 AA (Qualité) | E2E (a11y) | P2 | G3 | All | Partial | axe-core on every public page and the order-flow and account pages, fr and ar, in the e2e shards on every PR. Manual screen-reader check not done |
| T34 | On compare 20 écrans à la charte → Pas d'écart majeur (Charte graphique) | Manual | P3 | G3 | All | Not covered | Manual comparison of 20 screens with the charte, planned for S6. No comparison is recorded |
| T35 | L'utilisateur change d'apparence (L2) → Le choix reste enregistré et les contrastes tiennent dans les deux modes (Charte graphique) | Manual | P3 | Recette de L2 | L2 | Not covered | L2: dark mode not shipped in L1 |
| T36 | Un commerçant sans contrat validé choisit le règlement sur compte → Le serveur refuse, puis accepte après la validation (R104) | Integration | P2 | G3 | D | Partial | Server refusal on the real API: `apps/api/src/int/orders.api.int.test.ts` "payment on account: contractRequired; freight due without the acceptance: freightPayerRequired (R607)". Missing: the acceptance after the contract is validated (merchant space PR D, #39, and back-office) |
| T37 | Un client ferme son compte → Son identité disparaît et ses factures restent (R105) | Integration | P2 | G3 | B | Covered | Mock layer: `apps/web/src/lib/data/close-account.test.ts` "erases the identity, marks the account closed, and signs out", "keeps every invoice and credit note text byte for byte (buyerSnapshot, R602)"; `apps/web/e2e/profile.spec.ts` "close the account: sign-in fails, the same phone signs up again and sees nothing old (T37)". Not on the API yet: the close route is hidden in api mode (`apps/web/e2e/profile-api.spec.ts` "C09: no e-mail link, no Google card, no close card on the API; the page says so"); rerun when it exists |
| T38 | Une majoration s'applique → Son nom apparaît avant la validation et le plafond tient (R207) | Unit | P2 | G3 | Prompt 3 | Partial | `packages/domain/src/order/pricing.test.ts` "names the surcharge and leaves its ceiling unknown (R207: [PLAFOND])". The cap cannot be tested until its value is set |
| T39 | Le poids constaté dépasse l'écart toléré → Le client est prévenu avant la facture (R208) | Integration | P2 | G3 | A | Covered | `packages/domain/src/order/weight.test.ts` "warns only strictly above declared + tolerance"; `apps/web/e2e/account.spec.ts` "R208: both weights, and a notice only when the gap is above the tolerance" |
| T40 | Une commande attend trop sa confirmation → Une alerte part, plus vite pour Express (R210) | Integration | P2 | G3 | BO | Blocked | No back-office (#25) |
| T41 | Un commerçant dépasse son plafond ou a une facture en retard → Le règlement sur compte s'arrête (R211) | Integration | P1 | G3 | D, E | Not covered | PR D (merchant space, #39) and PR E (#40) not built |
| T42 | Un livreur ne répond pas, puis refuse plusieurs missions → La mission passe au suivant et le responsable logistique est alerté (R303) | Integration | P2 | G3 | Driver, BO | Blocked | No driver app, no back-office (#25) |
| T43 | Un nouvel essai, un retour ou une collecte ratée entraîne des frais → Ces frais étaient annoncés et ils sont appliqués selon les CGV (R504, R505) | E2E, Unit | P2 | G3 | A, BO | Partial | Fees are shown to the client: `apps/web/e2e/account.spec.ts` "T06 case 2: after the driver arrived the dialog shows the fee before the confirm". Missing: applying the fees of a new attempt and a return (back-office #25) |
| T44 | Le destinataire refuse un envoi en port dû → Le port et le retour reviennent à l'expéditeur (R607) | Unit | P2 | G3 | A, F, BO | Partial | `apps/web/src/lib/data/orders.test.ts` "R607: cashDelivery without the acceptance is refused, with it the order stores it"; API: `apps/api/src/int/orders.api.int.test.ts` "payment on account: contractRequired; freight due without the acceptance: freightPayerRequired (R607)". Missing: billing the sender after a refusal (back-office #25) |
| T45 | Un livreur approche de son plafond d'espèces → Lui et le responsable logistique sont prévenus avant le plafond (R701) | Integration | P2 | G3 | Driver | Blocked | No driver app |
| T46 | FastGo n'a qu'un comptable → La direction reçoit son contrôle hebdomadaire (R706) | Manual | P2 | G3 | BO | Blocked | No back-office (#25) |
| T47 | Des colis COD sont encaissés → Le COD n'entre pas dans le chiffre d'affaires (R708) | Unit | P1 | G3 | E, D | Not covered | PR E not built; finance is back-office (#25) |
| T48 | Un client signale une perte après le délai, puis dans le délai → Le délai s'applique et l'indemnité respecte la valeur déclarée ou le forfait (R801, R802) | Unit | P2 | G3 | C, BO | Partial | `apps/web/e2e/billing.spec.ts` "R801 R802 R804: the delay, the declared value or the flat cap, the reply time" checks what the client is shown. Missing: a test of the compensation calculation itself (back-office #25) |
| T49 | Quelqu'un tente de modifier une ligne du journal d'audit → Le serveur refuse et l'empreinte révèle toute modification directe (R805) | Integration | P1 | G3 | API | Partial | Refusal: `apps/api/src/int/rights.int.test.ts` "refuses UPDATE, DELETE and TRUNCATE for the app, and even for a superuser (trigger)". Missing: the fingerprint (empreinte) that reveals a direct change is not built |
| T50 | Un expéditeur choisit l'anglais pour le SMS, et le destinataire passe en arabe → Les textes suivent la langue, avec le même code, le même montant et le même numéro (R903, R904) | E2E, Integration | P2 | G3 | A, F | Partial | `apps/web/src/lib/data/orders.test.ts` "smsLanguage en: the order and the outbox message are en, stored as template + params". Missing: the recipient switching to ar (PR F) |
| T51 | On contrôle le dossier avant l'ouverture → La relecture des textes et la version des CGV qui fait foi sont signées (R905) | Manual | P2 | G4 | All | Not covered | Manual check before opening (G4) |
| T52 | Une grille change après la création d'une commande → La commande garde le prix de sa grille (R206) | Unit | P1 | G3 | A | Partial | Real API: `apps/api/src/int/pricing.int.test.ts` "R206_T52: a price that starts later does not apply early (read from core.prices)"; `apps/api/src/int/pricing-db.int.test.ts` "R206_T52_precedence: an OLD zone row beats a NEWER default row that is already in force". Web: `apps/web/src/lib/data/account-orders.test.ts` "R206: a created order keeps the quote it was created with, whatever the clock says later". Missing: merchant contract grids (not built) |
| T53 | Quelqu'un répète de faux codes SMS → Les essais sont bloqués et le téléphone reste non vérifié (R102) | E2E | P1 | G3 | Prompt 3 | Covered | Real API: `apps/api/src/int/phone-check.int.test.ts` "counts wrong codes: attempts_left goes down, the 5th wrong locks, the next is locked", "20 parallel wrong codes get at most 5 tries (the counter rises before the compare)"; `apps/api/src/int/orders.api.int.test.ts` "an unverified phone with no proof: phoneRequired; a quote that expired: 410; an unknown quote: 404". Web: `apps/web/e2e/auth.spec.ts` "code: wrong code counts down, then locks after 5; the right code no longer works while locked"; `apps/web/src/lib/data/orders.test.ts` "refuses before the phone is verified (R102)" |
| T54 | La même personne prépare puis valide un changement de plafond ou une grille → Le serveur renvoie 403 (Rôles et droits) | Integration | P1 | G3 | API, BO | Blocked | No approval routes on the API, no back-office (#25) |
| T55 | Deux commerçants utilisent la plateforme en même temps, à travers PgBouncer → Chacun voit seulement ses données, même si le contrôle de l'application est retiré pour le test (Durcissement) | Integration | P1 | G3 | Infra, API | Covered | On the Testcontainers PgBouncer (transaction mode, 1 server connection): `apps/api/src/int/db.int.test.ts` "both merchants share ONE backend and each sees only their own rows", "CONTROL: set_config(..., false) DOES leak through the same PgBouncer"; `apps/api/src/int/auth.int.test.ts` "each session sees only its own company". To repeat on staging for G3 (#14) |
| T56 | L'application tente de modifier le journal d'audit ou une table hors de ses droits → PostgreSQL refuse, et les migrations passent avec leur utilisateur dédié (Durcissement) | Integration | P1 | G3 | Infra, API | Covered | `apps/api/src/int/rights.int.test.ts` "has RLS on and forced, no right for PUBLIC, and exactly the expected rights for the app", "refuses UPDATE, DELETE and TRUNCATE for the app, and even for a superuser (trigger)", "only the migrator owns tables"; migrations: `apps/api/src/int/prices-migration.int.test.ts` |
| T57 | Un administrateur tente d'effacer une sauvegarde verrouillée, puis on la restaure → L'effacement est refusé et la restauration réussit (Durcissement) | Manual | P1 | G3 | Infra, API | Blocked | Needs staging and a locked backup (#14, #15) |
| T58 | Le pare-feu en blocage reçoit du texte arabe, une photo, un import et une attaque courante → Les usages normaux passent et l'attaque est bloquée (Durcissement) | Security | P2 | G3 | Infra, API | Blocked | Needs staging with the firewall (#14, #15) |
| T59 | Une tâche est rejouée, deux copies de l'API tournent, puis Redis s'arrête → Aucun doublon, les écrans restent à jour et aucune commande n'est perdue (Durcissement) | Integration | P1 | G3 | Infra, API | Blocked | Needs staging with two API copies and a Redis stop (#14, #15) |
| T60 | Le VPN du back-office tombe → L'équipe revient par le second point d'entrée ou l'accès d'urgence, et le journal en garde la trace (Durcissement) | Manual | P2 | G3 | Infra, API | Blocked | Needs the VPN and the staging entry points (#14, #15) |
| T61 | Le serveur principal s'arrête, si FastGo a retenu le serveur de secours → La bascule suit la procédure, sa durée est mesurée et un seul serveur reste principal (Durcissement) | Manual | P1 | G3, si retenu | Infra, API | Blocked | Needs staging and a second server, if GOFAST keeps it (#14, #15) |

### Internal team rights (DR01 to DR36)

Cahier key: D decides or validates, G manages, A acts in their own work, V sees, – no access (403).

| ID | Scenario and expected result | Level | Priority | Gate | PR | Status | Evidence |
|---|---|---|---|---|---|---|---|
| DR01 | Voir le suivi de l'activité: Dir V, Ops V, Agt V, Log V, SC V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR02 | Voir les chiffres financiers: Dir V, Ops V, Cpt V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR03 | Voir les commandes: Ops V, Agt V, Log V, SC V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR04 | Créer une commande par téléphone: Ops G, Agt G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR05 | Confirmer une commande en attente: Ops G, Agt G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR06 | Modifier ou annuler une commande: Ops G, Agt G, Log A, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR07 | Voir la file du dispatch et la carte: Ops V, Agt V, Log V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR08 | Attribuer ou retirer un livreur: Ops G, Log G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR09 | Voir les colis, retours et incidents: Ops V, Agt V, Log V, SC V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR10 | Traiter un incident ou un retour: Ops G, Agt G, Log G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR11 | Déclarer un colis perdu: Ops D, Agt A, Log A; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR12 | Voir un client: Dir V, Ops V, Agt V, SC V, Cpt V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR13 | Créer ou modifier un client: Ops G, Agt A, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR14 | Voir contrats et grilles de prix: Dir V, Ops V, Cpt V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR15 | Préparer un contrat ou une grille: Ops G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR16 | Valider un contrat commerçant: Ops D; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR17 | Valider une grille de prix: Dir D; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR18 | Voir ou modifier une zone: Dir V, Ops A, Log A, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR19 | Voir ou gérer livreurs et véhicules: Dir V, Ops V, Log G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR20 | Révoquer le téléphone d'un livreur: Log G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR21 | Traiter une réclamation: Dir V, Ops G, Agt A, Log V, SC G, Cpt V, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR22 | Proposer un avoir: SC A; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR23 | Valider un avoir: Ops D; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR24 | Émettre un avoir validé: Cpt A; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR25 | Voir ou gérer les factures: Dir V, Ops V, SC V, Cpt G, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR26 | Saisir ou annuler un règlement: Cpt G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR27 | Voir les caisses: Dir V, Ops V, Log V, Cpt V, Cai V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR28 | Compter une remise d'espèces: Cai A; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR29 | Valider un écart de caisse: Dir D, Cpt D; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR30 | Voir ou préparer un reversement COD: Dir V, Ops V, Cpt G, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR31 | Voir ou déposer des documents: Dir V, Ops V, Agt A, Log A, SC A, Cpt A, Adm G, RH G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR32 | Produire des rapports: Dir G, Ops G, Agt V, Log V, SC V, Cpt G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR33 | Créer des comptes et attribuer des rôles: Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR34 | Changer un plafond, un taux ou un droit comptable: Dir D, Adm A; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR35 | Consulter le journal d'audit: Dir V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; the role matrix waits for the back-office (#25) and the DR and EX tests (Ala) |
| DR36 | Gérer dossiers, congés, pointage et gains (L2): Dir V, RH G; every other role gets 403 | Integration | P1 | G3 | API, BO | Not covered | L2. Tested by T29 on the API; the role matrix waits for the back-office (#25) |

### Outside people's rights (EX01 to EX17)

Cahier key: V sees, M own data only (404 outside it), – no access.

| ID | Scenario and expected result | Level | Priority | Gate | PR | Status | Evidence |
|---|---|---|---|---|---|---|---|
| EX01 | Voir les offres, les zones et le contact: Visiteur V, Destinataire V, Particulier V, Commerçant V, Livreur V; out of scope gets 404 | Integration | P1 | G3 | Site | Covered | `apps/web/e2e/service-zone.spec.ts` and the public pages; zones on the API: `apps/api/src/int/pricing.int.test.ts` "in zone from a pin, out of zone from a pin, from a picked zone, and a paused délégation" |
| EX02 | Suivre un colis par son numéro: Visiteur V, Destinataire V, Particulier V, Commerçant V; out of scope gets 404 | Integration | P1 | G3 | 0 | Covered | Real API: `apps/api/src/int/orders.api.int.test.ts` "an unknown number is 404, a malformed one 400, and too many misses from one IP are 429 with Retry-After (T11)" |
| EX03 | Ouvrir son lien de livraison: Destinataire M; out of scope gets 404 | Integration | P1 | G3 | F | Not covered | PR F not built |
| EX04 | Changer de créneau ou partager sa position: Destinataire M; out of scope gets 404 | Integration | P1 | G3 | F | Not covered | PR F not built |
| EX05 | Obtenir un prix: Visiteur V, Particulier V, Commerçant V; out of scope gets 404 | Integration | P1 | G3 | Prompt 3 | Covered | Real API: `apps/api/src/int/pricing.int.test.ts` "R204_T01: prices a pinned quote, keeps it, and reads it back". Web: `apps/web/e2e/order-flow.spec.ts` "W15 lists every price line". The API tests do not call the quote without a session |
| EX06 | Passer une commande: Particulier M, Commerçant M; out of scope gets 404 | Integration | P1 | G3 | Prompt 3, A | Partial | Real API: `apps/api/src/int/orders.api.int.test.ts` "each customer lists and reads only their own orders, newest first, with a cursor; another's order is 404". Missing: a merchant team creating for its company, tested on the API |
| EX07 | Annuler une commande: Particulier M, Commerçant M; out of scope gets 404 | Integration | P1 | G3 | A | Covered | Real API: `apps/api/src/int/orders.api.int.test.ts` "RV-19: another customer's order is 404, whatever the fee; a company member cancels the company's order; staff cancel free by default or record the fee on purpose (Q10)" |
| EX08 | Importer des commandes: Commerçant M; out of scope gets 404 | Integration | P1 | G3 | E | Not covered | PR E not built |
| EX09 | Voir ses factures: Particulier M, Commerçant M; out of scope gets 404 | Integration | P1 | G3 | C | Covered | Mock layer: `apps/web/src/lib/data/invoices.test.ts` "another account's invoice or credit note answers like a missing one"; `apps/web/e2e/billing.spec.ts` "another account's invoice answers exactly like a missing one". No invoice route on the API yet: rerun when it exists |
| EX10 | Ouvrir et suivre une réclamation: Particulier M, Commerçant M; out of scope gets 404 | Integration | P1 | G3 | C | Covered | Mock layer: `apps/web/src/lib/data/claims.test.ts` "another account's claim answers exactly like a missing one"; `apps/web/e2e/billing.spec.ts` "another account's claim answers exactly like a missing one". No claim route on the API yet: rerun when it exists |
| EX11 | Voir ses relevés COD: Commerçant M; out of scope gets 404 | Integration | P1 | G3 | E | Not covered | PR E not built |
| EX12 | Gérer son équipe et ses points d'enlèvement: Commerçant M; out of scope gets 404 | Integration | P1 | G3 | D | Not covered | PR D not built |
| EX13 | Utiliser l'API et les notifications (L2): Commerçant M; out of scope gets 404 | Integration | P1 | G3 | L2 | Not covered | L2 |
| EX14 | Voir, accepter ou refuser ses missions: Livreur M; out of scope gets 404 | Integration | P1 | G3 | Driver | Blocked | No driver app |
| EX15 | Changer un état et déposer une preuve: Livreur M; out of scope gets 404 | Integration | P1 | G3 | Driver | Blocked | No driver app |
| EX16 | Envoyer sa position pendant le service: Livreur M; out of scope gets 404 | Integration | P1 | G3 | Driver | Blocked | No driver app |
| EX17 | Voir sa caisse et ses reçus: Livreur M; out of scope gets 404 | Integration | P1 | G3 | Driver | Blocked | No driver app |

### Cross checks (CC1 to CC4)

| ID | Scenario and expected result | Level | Priority | Gate | PR | Status | Evidence |
|---|---|---|---|---|---|---|---|
| CC1 | Qui propose un avoir ne le valide pas, et qui le valide ne l'émet pas (rows DR22, DR23, DR24); 403 if the check fails | Integration | P1 | G3 | API, BO | Blocked | Tested by T24; no credit note route on the API, no back-office (#25) |
| CC2 | Qui compte une caisse ne valide pas son écart (rows DR28, DR29); 403 if the check fails | Integration | P1 | G3 | API, BO | Blocked | Tested by T27; no cash route on the API, no back-office (#25) |
| CC3 | Qui demande un changement de plafond, de taux ou de droit ne l'approuve pas (rows DR34); 403 if the check fails | Integration | P1 | G3 | API, BO | Blocked | Tested by T54; no approval route on the API, no back-office (#25) |
| CC4 | Qui prépare une grille de prix ne la valide pas (rows DR15, DR17); 403 if the check fails | Integration | P1 | G3 | API, BO | Blocked | Tested by T54; no approval route on the API, no back-office (#25) |

## Blockers

| Blocker | Rows held | Unblocked by |
|---|---|---|
| API routes missing (invoicing, claims, dispatch, driver, approvals, audit chain) | T14, T22, T23, T54, the API half of T19, T20, T24, T30, T36, T49 and T52 | `apps/api` (Ala, #22 and follow-ups) |
| No back-office | T12, T14, T24, T25, T26, T27, T31, T40, T42, T46, T54, CC1 to CC4 and the back-office half of T01, T43, T44, T48 | `apps/backoffice` (Ala, #25) |
| Role matrix tests | T29, DR01 to DR35, CC1 to CC4 (DR36 is L2). The database grant test of T56 exists; the 409 cells need the routes and the back-office | DR and EX tests (Ala) |
| No driver app | T13, T15 to T18, T21, T27, T42, T45, EX14 to EX17 | `apps/driver` (Helmi) |
| No servers or staging | T57 to T61, the repeat of T55 on staging, load and security tests | #14, #15 (Helmi) |
| No real phones | T02, T13, T16, T21 (G2) | GOFAST phones (about 25 Nov) and team phones |
| No TTN access | T23 | TTN test account (GOFAST, accountant) |
| Counts are manual | Every count here comes from reading the tests at one commit (RV-09) | Re-read at each update |

## How to update this file

- When a PR merges, update its rows: status and evidence (file and test name). Put the T, DR or EX id in the test name.
- A row is Covered only when a test checks the whole expected result. Read the test, not its name.
- Counts come from a run on the PR's head commit (RV-09).
