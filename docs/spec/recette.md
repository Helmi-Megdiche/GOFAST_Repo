# Recette : test matrix

Owner: Moataz (`@mootazkraiem`), testing. Built on 8 Nov 2026 from `main` at `8f75f82` (PR #65 merged).

## Scope

- Every acceptance scenario of the cahier: T01 to T61, DR01 to DR36, EX01 to EX17 and CC1 to CC4 (118 IDs).
- Source: the cahier's tabs "Recette et tests" (scenarios, traceability matrix, gates, test levels, bug priorities) and "Rôles et droits" (DR, EX, CC). Scenario text is the cahier's, condensed into "situation → expected result (rules)".
- Level, priority and gate of a T row come from the cahier's traceability matrix: the levels of its rules, the highest priority among them, and every gate they name. DR and EX rows take T29's values, CC rows those of the scenario that tests them.
- Coverage is checked against the merged web work only: public site, order flow (Prompt 3), account base (PR 0) and client orders (PR A). There is no API, back-office, driver app or staging yet.

## Summary

| Group | Rows | Status |
|---|---|---|
| T | 61 | Covered 6, Partial 14, Not covered 13, Blocked 28 |
| DR | 36 | Not covered 1, Blocked 35 |
| EX | 17 | Covered 4, Partial 1, Not covered 8, Blocked 4 |
| CC | 4 | Blocked 4 |
| **All** | **118** | **Covered 10, Partial 15, Not covered 22, Blocked 71** |

## Status

| Status | Meaning |
|---|---|
| Covered | The test named in Evidence checks the full expected result, on the mock data layer. Rows marked "Rerun on the API" must pass again once the API exists |
| Partial | Part of the expected result is tested. The Evidence says what is missing |
| Not covered | Belongs to a web PR not merged yet (B to G), to L2, or to a manual check not done yet |
| Blocked | Needs something that does not exist yet: the API, the back-office, the driver app, servers and staging, or real phones |

## Test levels (cahier)

| Level | What it checks | Tools (cahier) | When | Blocks | In the repo today |
|---|---|---|---|---|---|
| Unit | Prices, state changes, invoices, cash reconciliation, rights | Jest | Every change | Merge | vitest in `apps/web` and `packages/i18n` (CLAUDE.md stack) |
| Integration | API with real PostgreSQL and Redis, TTN and SMS simulated | Jest, Testcontainers | Every merge | Merge | No API |
| Contract | Answers and errors match OpenAPI | Schemathesis | Every merge | Merge | No API |
| E2E ("Parcours") | Scenarios in the browser and the app | Playwright | Every night | Release | Playwright on every PR (PR #67, not merged) |
| Mobile ("Terrain") | Real Android phones and iPhone, weak network, locked screen | Manual, test log | End of S2, then before the pilot | G2, G3 | Not done |
| Load | FastGo's 12-month volume, with a margin for peaks | k6 | S6, then before L2 | G3 | Not done |
| Code security | Code, secrets, dependencies | Semgrep, Gitleaks, Trivy | Every merge | Merge | Gitleaks in PR #67 |
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

| PR | Content | State on 8 Nov |
|---|---|---|
| Prompt 3 | Public site, order flow, sign-in | Merged (#4, #5) |
| 0 | Account base, states, fixtures | Merged (#6) |
| A | Client orders, cancel | Merged (#65) |
| B | Profile, addresses, e-mail, closing (#28) | Not started |
| C | Invoices and claims (#29) | PR #66 open |
| D | Merchant space (#39) | Not started |
| E | Import and COD (#40) | Not started |
| F | Recipient link (#38) | Not started |
| G | Installable app (#37) | Not started |
| API, BO, Driver, Infra | `apps/api`, `apps/backoffice`, `apps/driver`, servers | Not in the repo |

Web rows follow the plan `docs/superpowers/plans/2026-11-05-prompt-4-umbrella.md`, section 11.

## Matrix

### Acceptance scenarios (T01 to T61)

| ID | Scenario and expected result | Level | Priority | Gate | PR | Status | Evidence |
|---|---|---|---|---|---|---|---|
| T01 | Un client connu commande sur un téléphone Android → Commande terminée en moins de 2 min et visible par l'agent dans les secondes qui suivent (R204, R209) | Unit, Integration | P1 | G3 | Prompt 3, A, BO | Partial | Price lines (R204): `e2e/order-flow.spec.ts` "W15 lists every price line...", `src/lib/data/account-orders.test.ts` "R204: ...". Agent sees it, auto-confirmation (R209): needs API and back-office |
| T02 | Une cliente commande depuis la version installée sur iPhone → Commande, suivi et facture fonctionnent ; le SMS de suivi arrive même sans notification autorisée (R102) | E2E | P1 | G3 | G | Blocked | PR G not built; needs a real iPhone. SMS only goes to the mock outbox |
| T03 | Le client clique deux fois ou perd le réseau en validant → Une seule commande existe (R202) | Integration | P1 | G3 | Prompt 3 | Covered | `e2e/order-flow.spec.ts` "a double click on Valider creates one order (R202)", "a lost answer, a reload and a retry give one order..."; `e2e/abuse.spec.ts` "two tabs pressing Valider...". Rerun on the API (Integration) |
| T04 | Le client saisit une adresse hors zone → Il le sait avant le prix, en français, en arabe ou en anglais (R201) | Integration | P2 | G3 | Prompt 3 | Partial | `e2e/order-flow.spec.ts` "an out-of-zone address shows W17 and no price anywhere (R201)"; `src/lib/data/orders.test.ts` "refuses an out-of-zone address (R201)". W17 checked in fr and ar only, not en |
| T05 | Le prix affiché dépasse sa durée de validité → Le nouveau prix s'affiche et le client le revalide (R205) | Unit | P2 | G3 | Prompt 3 | Covered | `src/lib/order/pricing.test.ts` "is valid for exactly 15 minutes"; `e2e/order-flow.spec.ts` "after 15 minutes the price is recalculated... (R205, fake clock)" |
| T06 | Le client annule avant l'arrivée du livreur, puis après, puis après la prise en charge → Gratuit, puis avec frais, puis renvoi vers une réclamation (R212) | Unit | P2 | G3 | A | Covered | `src/lib/data/cancel.test.ts`; `e2e/account.spec.ts` "T06 case 1", "T06 case 2", "T06 case 3", "stale page..." |
| T07 | Le client ouvre un compte avec Google → Son téléphone est vérifié, un e-mail connu ne crée pas de doublon, un compte livreur ou interne est refusé (R101, R103) | Integration, E2E | P2 | G3 | Prompt 3 | Partial | `e2e/auth.spec.ts` "Google, new e-mail...", "Google, known e-mail: e-mail code first...(R103)", "...another phone than the account's is refused". Refusing a driver or internal account: those accounts do not exist yet (API) |
| T08 | Un commerçant importe un fichier avec des erreurs → Les bonnes lignes passent et chaque erreur est expliquée (R206) | Unit | P1 | G3 | E | Not covered | PR E not built |
| T09 | On génère un très grand nombre de numéros de suivi → Aucun doublon ni suite devinable (R203) | Unit | P1 | G3 | 0 | Partial | `src/lib/data/orders.test.ts` "are FG-XXXX-XXXX, random and never reused, fixtures included". Not tested at a very large volume, and generation moves to the API |
| T10 | Un inconnu cherche un numéro de suivi → Il voit l'état, sans nom, adresse, téléphone ni position (R405) | Integration | P1 | G3 | 0 | Covered | `src/lib/data/data.test.ts` "publicTrackingOf keys are exactly the R405 allowlist", "...leaks no name, phone or address..."; `e2e/public-site.spec.ts` "tracking: a found parcel shows ... no personal data". Rerun on the API |
| T11 | Quelqu'un essaie d'ouvrir un lien au hasard ou expiré → L'accès est refusé et les essais automatiques sont bloqués (R406) | Integration | P1 | G3 | F | Partial | `src/lib/data/recipient-links.test.ts`: token random, not from the tracking code, 24 h expiry. Neutral page is PR F; blocking attempts needs the API |
| T12 | Le destinataire choisit un autre créneau après un échec → Le dispatch le voit et l'expéditeur est informé (R503) | E2E | P2 | G3 | F, BO | Not covered | PR F not built; dispatch side is back-office |
| T13 | Un livreur passe une journée avec l'écran verrouillé sur 3 téléphones Android d'entrée de gamme → La position continue et une coupure alerte le back-office (R302) | Integration | P1 | G2, G3 | Driver | Blocked | No driver app; needs 3 Android phones |
| T14 | Un dispatcher attribue une commande non confirmée, un véhicule sans papiers à jour ou un livreur au plafond → Le serveur refuse (R301, R302, R304) | Unit, Integration | P1 | G3, G2 | API, BO | Blocked | No API or back-office |
| T15 | Le livreur marque un colis Remis sans preuve → Le serveur refuse (R401) | Integration | P1 | G3, G4 | Driver, API | Blocked | No driver app or API |
| T16 | Le livreur remet un colis sans réseau, avec un bon code puis un faux → Le bon passe, le faux non, et le serveur revérifie au retour du réseau (R402) | Mobile | P1 | G3 | Driver | Blocked | No driver app; field test |
| T17 | La remise se fait loin de l'adresse → Elle passe et crée une alerte (R403, R404) | Integration | P2 | G3 | Driver, API | Blocked | No driver app or API |
| T18 | La livraison échoue → Motif et photo sont exigés ; après le dernier essai, le retour est proposé (R501, R502) | Unit, E2E | P2 | G3 | Driver | Blocked | No driver app. The client side shows failure reasons (`e2e/account.spec.ts` "R502 and T19..."), which is not this scenario |
| T19 | Une commande de 3 colis finit avec 2 remis et 1 rendu → Elle se termine en Livrée en partie, avec la bonne facture (R601) | Integration | P1 | G3, G4 | 0, C | Partial | State: `src/lib/data/fixtures.test.ts` "T19: 2 handed_over and 1 returned give partially_delivered", `src/lib/data/account-orders.test.ts`, `e2e/account.spec.ts` "R502 and T19...". The invoice is PR C, not merged |
| T20 | Quelqu'un tente un changement d'état non prévu → Le serveur refuse et rien ne change (États) | Integration | P1 | G3 | 0, API | Partial | `src/lib/data/states.test.ts`: every from → to pair, illegalTransition. Mock only; the server refusal needs the API |
| T21 | Un livreur fait une mission complète sur iPhone → Alerte, scan, preuve et espèces fonctionnent. S'il quitte l'application, il est prévenu et le back-office voit la position interrompue (R305, R407) | Mobile | P1 | G2, G3 | Driver | Blocked | No driver app; needs an iPhone |
| T22 | Une livraison se termine → La facture se crée en moins de 1 min, au bon montant et sans trou de numéro (R601, R603) | Integration | P1 | G3, G4 | API, BO | Blocked | No API or invoicing |
| T23 | La plateforme envoie une facture à TTN, puis TTN tombe en panne → Identifiant et QR reçus ; après la panne, aucune facture perdue ni envoyée deux fois (R604) | Integration | P1 | G2, G3 | API | Blocked | No API; needs TTN access |
| T24 | Le comptable corrige une facture → Elle reste inchangée et un avoir lié est validé par une autre personne (R602, R803) | Integration | P1 | G3 | C, BO | Not covered | PR C not merged; second-person validation is back-office |
| T25 | Un colis revient à l'expéditeur → Les frais prévus sont facturés, y compris pour un particulier (R605, R606) | Unit | P2 | G3 | API, BO | Blocked | No API or back-office |
| T26 | Un agent tente de saisir un règlement → Seul le comptable le peut, et une annulation laisse une trace (R608) | Integration | P1 | G3 | BO | Blocked | No back-office |
| T27 | Un livreur remet sa caisse avec un écart → Le montant attendu est juste, l'écart demande un motif, les deux reçus sortent, le plafond bloque (R702 à R705) | Integration, Unit, Manual | P1 | G3, G4 | Driver, BO | Blocked | No driver app or back-office |
| T28 | Un commerçant reçoit son relevé COD → Colis livrés, frais et reversement concordent au millime (R707) | Unit | P1 | G3, G4 | E | Not covered | PR E not built |
| T29 | Chaque rôle tente chaque action de la matrice → Les 409 cases sont appelées par l'API, avec 0 accès hors droits (Rôles et droits) | Integration | P1 | G3 | API | Blocked | No API: the 409 cells (DR01 to DR36, EX01 to EX17) must be called on the API |
| T30 | Une réclamation va jusqu'à l'archivage → Le client ne voit jamais les notes internes (R803, R804) | Integration | P1 | G3 | C | Not covered | PR C not merged |
| T31 | Un responsable exporte un rapport → Le fichier reprend les chiffres de l'écran (Rapports) | E2E | P2 | G3 | BO | Blocked | No back-office |
| T32 | On parcourt le site, le back-office et les applications en arabe et en anglais → Tous les textes sont traduits, le choix de langue est conservé et la mise en page reste correcte (Site) | E2E | P2 | G3 | All | Partial | Web pages in fr, ar, en: `e2e/languages.spec.ts`, every page in fr and ar in `e2e/order-flow.spec.ts` and the public pages. Back-office and apps do not exist |
| T33 | On audite l'inscription, la commande et le suivi → Pas de blocage d'accessibilité WCAG 2.1 AA (Qualité) | E2E (a11y) | P2 | G3 | All | Partial | axe-core on every public page, order-flow page (`e2e/order-flow.spec.ts`) and account page (`e2e/account.spec.ts`), fr and ar. Manual screen-reader check not done |
| T34 | On compare 20 écrans à la charte → Pas d'écart majeur (Charte graphique) | Manual | P3 | G3 | All | Not covered | Manual comparison of 20 screens with the charte, planned for S6. Screenshots exist (`apps/web/test-results/shots`) but no comparison is recorded |
| T35 | L'utilisateur change d'apparence (L2) → Le choix reste enregistré et les contrastes tiennent dans les deux modes (Charte graphique) | Manual | P3 | Recette de L2 | L2 | Not covered | L2: dark mode not shipped in L1 |
| T36 | Un commerçant sans contrat validé choisit le règlement sur compte → Le serveur refuse, puis accepte après la validation (R104) | Integration | P2 | G3 | D | Not covered | PR D not built. `e2e/order-flow.spec.ts` "'Compte client' appears only for a merchant with a validated contract (R104)" hides the option; it is not the server refusal |
| T37 | Un client ferme son compte → Son identité disparaît et ses factures restent (R105) | Integration | P2 | G3 | B | Not covered | PR B not built |
| T38 | Une majoration s'applique → Son nom apparaît avant la validation et le plafond tient (R207) | Unit | P2 | G3 | Prompt 3 | Partial | `src/lib/order/pricing.test.ts` "names the surcharge and leaves its ceiling unknown (R207: [PLAFOND])"; `e2e/order-flow.spec.ts` "W15 lists every price line... (R204, R207)". The cap cannot be tested until its value is set |
| T39 | Le poids constaté dépasse l'écart toléré → Le client est prévenu avant la facture (R208) | Integration | P2 | G3 | A | Covered | `src/lib/order/weight.test.ts` "warns only strictly above declared + tolerance"; `e2e/account.spec.ts` "R208: both weights, and a notice only when the gap is above the tolerance" |
| T40 | Une commande attend trop sa confirmation → Une alerte part, plus vite pour Express (R210) | Integration | P2 | G3 | BO | Blocked | No back-office |
| T41 | Un commerçant dépasse son plafond ou a une facture en retard → Le règlement sur compte s'arrête (R211) | Integration | P1 | G3 | D, E | Not covered | PR D and E not built |
| T42 | Un livreur ne répond pas, puis refuse plusieurs missions → La mission passe au suivant et le responsable logistique est alerté (R303) | Integration | P2 | G3 | Driver, BO | Blocked | No driver app or back-office |
| T43 | Un nouvel essai, un retour ou une collecte ratée entraîne des frais → Ces frais étaient annoncés et ils sont appliqués selon les CGV (R504, R505) | E2E, Unit | P2 | G3 | A, BO | Partial | `e2e/account.spec.ts` "R504: the fee of a new attempt (free) and of the return are shown...", "R505: after a failed pickup the dialog says a fee may apply...". Applying the fees is back-office |
| T44 | Le destinataire refuse un envoi en port dû → Le port et le retour reviennent à l'expéditeur (R607) | Unit | P2 | G3 | A, F, BO | Partial | `e2e/account.spec.ts` "R607: port dû needs the box..."; `src/lib/data/orders.test.ts` "R607: cashDelivery without the acceptance is refused...". Billing the sender after a refusal is back-office |
| T45 | Un livreur approche de son plafond d'espèces → Lui et le responsable logistique sont prévenus avant le plafond (R701) | Integration | P2 | G3 | Driver | Blocked | No driver app |
| T46 | FastGo n'a qu'un comptable → La direction reçoit son contrôle hebdomadaire (R706) | Manual | P2 | G3 | BO | Blocked | No back-office |
| T47 | Des colis COD sont encaissés → Le COD n'entre pas dans le chiffre d'affaires (R708) | Unit | P1 | G3 | E, D | Not covered | PR E not built; finance is back-office |
| T48 | Un client signale une perte après le délai, puis dans le délai → Le délai s'applique et l'indemnité respecte la valeur déclarée ou le forfait (R801, R802) | Unit | P2 | G3 | C, BO | Not covered | PR C not merged; compensation is back-office |
| T49 | Quelqu'un tente de modifier une ligne du journal d'audit → Le serveur refuse et l'empreinte révèle toute modification directe (R805) | Integration | P1 | G3 | API | Blocked | No API |
| T50 | Un expéditeur choisit l'anglais pour le SMS, et le destinataire passe en arabe → Les textes suivent la langue, avec le même code, le même montant et le même numéro (R903, R904) | E2E, Integration | P2 | G3 | A, F | Partial | `src/lib/data/orders.test.ts` "smsLanguage en: the order and the outbox message are en..."; `e2e/account.spec.ts` "R903: the SMS language chosen on W12...". Recipient switching to ar is PR F |
| T51 | On contrôle le dossier avant l'ouverture → La relecture des textes et la version des CGV qui fait foi sont signées (R905) | Manual | P2 | G4 | All | Not covered | Manual check before opening (G4) |
| T52 | Une grille change après la création d'une commande → La commande garde le prix de sa grille (R206) | Unit | P1 | G3 | A | Partial | `src/lib/data/account-orders.test.ts` "R206: a created order keeps the quote it was created with...". Merchant contract grids not built (plan H24) |
| T53 | Quelqu'un répète de faux codes SMS → Les essais sont bloqués et le téléphone reste non vérifié (R102) | E2E | P1 | G3 | Prompt 3 | Covered | `e2e/auth.spec.ts` "code: wrong code counts down, then locks after 5..."; `src/lib/data/orders.test.ts` "refuses before the phone is verified (R102)". Rerun on the API |
| T54 | La même personne prépare puis valide un changement de plafond ou une grille → Le serveur renvoie 403 (Rôles et droits) | Integration | P1 | G3 | API, BO | Blocked | No API or back-office |
| T55 | Deux commerçants utilisent la plateforme en même temps, à travers PgBouncer → Chacun voit seulement ses données, même si le contrôle de l'application est retiré pour le test (Durcissement) | Integration | P1 | G3 | Infra, API | Blocked | Needs the API and the servers (#12, #14) |
| T56 | L'application tente de modifier le journal d'audit ou une table hors de ses droits → PostgreSQL refuse, et les migrations passent avec leur utilisateur dédié (Durcissement) | Integration | P1 | G3 | Infra, API | Blocked | Needs the API and the servers (#12, #14) |
| T57 | Un administrateur tente d'effacer une sauvegarde verrouillée, puis on la restaure → L'effacement est refusé et la restauration réussit (Durcissement) | Manual | P1 | G3 | Infra, API | Blocked | Needs the API and the servers (#12, #14) |
| T58 | Le pare-feu en blocage reçoit du texte arabe, une photo, un import et une attaque courante → Les usages normaux passent et l'attaque est bloquée (Durcissement) | Security | P2 | G3 | Infra, API | Blocked | Needs the API and the servers (#12, #14) |
| T59 | Une tâche est rejouée, deux copies de l'API tournent, puis Redis s'arrête → Aucun doublon, les écrans restent à jour et aucune commande n'est perdue (Durcissement) | Integration | P1 | G3 | Infra, API | Blocked | Needs the API and the servers (#12, #14) |
| T60 | Le VPN du back-office tombe → L'équipe revient par le second point d'entrée ou l'accès d'urgence, et le journal en garde la trace (Durcissement) | Manual | P2 | G3 | Infra, API | Blocked | Needs the API and the servers (#12, #14) |
| T61 | Le serveur principal s'arrête, si FastGo a retenu le serveur de secours → La bascule suit la procédure, sa durée est mesurée et un seul serveur reste principal (Durcissement) | Manual | P1 | G3, si retenu | Infra, API | Blocked | Needs the API and the servers (#12, #14) |

### Internal team rights (DR01 to DR36)

Cahier key: D decides or validates, G manages, A acts in their own work, V sees, – no access (403).

| ID | Scenario and expected result | Level | Priority | Gate | PR | Status | Evidence |
|---|---|---|---|---|---|---|---|
| DR01 | Voir le suivi de l'activité: Dir V, Ops V, Agt V, Log V, SC V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR02 | Voir les chiffres financiers: Dir V, Ops V, Cpt V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR03 | Voir les commandes: Ops V, Agt V, Log V, SC V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR04 | Créer une commande par téléphone: Ops G, Agt G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR05 | Confirmer une commande en attente: Ops G, Agt G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR06 | Modifier ou annuler une commande: Ops G, Agt G, Log A, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR07 | Voir la file du dispatch et la carte: Ops V, Agt V, Log V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR08 | Attribuer ou retirer un livreur: Ops G, Log G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR09 | Voir les colis, retours et incidents: Ops V, Agt V, Log V, SC V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR10 | Traiter un incident ou un retour: Ops G, Agt G, Log G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR11 | Déclarer un colis perdu: Ops D, Agt A, Log A; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR12 | Voir un client: Dir V, Ops V, Agt V, SC V, Cpt V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR13 | Créer ou modifier un client: Ops G, Agt A, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR14 | Voir contrats et grilles de prix: Dir V, Ops V, Cpt V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR15 | Préparer un contrat ou une grille: Ops G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR16 | Valider un contrat commerçant: Ops D; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR17 | Valider une grille de prix: Dir D; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR18 | Voir ou modifier une zone: Dir V, Ops A, Log A, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR19 | Voir ou gérer livreurs et véhicules: Dir V, Ops V, Log G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR20 | Révoquer le téléphone d'un livreur: Log G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR21 | Traiter une réclamation: Dir V, Ops G, Agt A, Log V, SC G, Cpt V, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR22 | Proposer un avoir: SC A; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR23 | Valider un avoir: Ops D; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR24 | Émettre un avoir validé: Cpt A; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR25 | Voir ou gérer les factures: Dir V, Ops V, SC V, Cpt G, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR26 | Saisir ou annuler un règlement: Cpt G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR27 | Voir les caisses: Dir V, Ops V, Log V, Cpt V, Cai V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR28 | Compter une remise d'espèces: Cai A; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR29 | Valider un écart de caisse: Dir D, Cpt D; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR30 | Voir ou préparer un reversement COD: Dir V, Ops V, Cpt G, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR31 | Voir ou déposer des documents: Dir V, Ops V, Agt A, Log A, SC A, Cpt A, Adm G, RH G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR32 | Produire des rapports: Dir G, Ops G, Agt V, Log V, SC V, Cpt G, Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR33 | Créer des comptes et attribuer des rôles: Adm G; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR34 | Changer un plafond, un taux ou un droit comptable: Dir D, Adm A; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR35 | Consulter le journal d'audit: Dir V, Adm V; every other role gets 403 | Integration | P1 | G3 | API, BO | Blocked | Tested by T29 on the API; no API or back-office yet |
| DR36 | Gérer dossiers, congés, pointage et gains (L2): Dir V, RH G; every other role gets 403 | Integration | P1 | G3 | API, BO | Not covered | L2. Tested by T29 on the API; no API or back-office yet |

### Outside people's rights (EX01 to EX17)

Cahier key: V sees, M own data only (404 outside it), – no access.

| ID | Scenario and expected result | Level | Priority | Gate | PR | Status | Evidence |
|---|---|---|---|---|---|---|---|
| EX01 | Voir les offres, les zones et le contact: Visiteur V, Destinataire V, Particulier V, Commerçant V, Livreur V; out of scope gets 404 | Integration | P1 | G3 | Site | Covered | `e2e/public-site.spec.ts` public pages; `e2e/service-zone.spec.ts`. Rerun on the API |
| EX02 | Suivre un colis par son numéro: Visiteur V, Destinataire V, Particulier V, Commerçant V; out of scope gets 404 | Integration | P1 | G3 | 0 | Covered | `e2e/public-site.spec.ts` "tracking: a found parcel shows status, ETA, history and no personal data", "unknown number and invalid format" |
| EX03 | Ouvrir son lien de livraison: Destinataire M; out of scope gets 404 | Integration | P1 | G3 | F | Not covered | PR F not built |
| EX04 | Changer de créneau ou partager sa position: Destinataire M; out of scope gets 404 | Integration | P1 | G3 | F | Not covered | PR F not built |
| EX05 | Obtenir un prix: Visiteur V, Particulier V, Commerçant V; out of scope gets 404 | Integration | P1 | G3 | Prompt 3 | Covered | `e2e/order-flow.spec.ts` "W14 shows a price on every card..." (guest flow); price from the mock. Rerun on the API |
| EX06 | Passer une commande: Particulier M, Commerçant M; out of scope gets 404 | Integration | P1 | G3 | Prompt 3, A | Partial | `e2e/order-flow.spec.ts`, `e2e/abuse.spec.ts`; `src/lib/data/account-orders.test.ts` "scoped readers". The server 404 needs the API |
| EX07 | Annuler une commande: Particulier M, Commerçant M; out of scope gets 404 | Integration | P1 | G3 | A | Covered | `src/lib/data/cancel.test.ts` "another account's order is not found, and nothing changes", "an admin and a user of the company can both cancel..."; `e2e/account.spec.ts` "another account's order looks like an unknown code..." |
| EX08 | Importer des commandes: Commerçant M; out of scope gets 404 | Integration | P1 | G3 | E | Not covered | PR E not built |
| EX09 | Voir ses factures: Particulier M, Commerçant M; out of scope gets 404 | Integration | P1 | G3 | C | Not covered | PR C not merged |
| EX10 | Ouvrir et suivre une réclamation: Particulier M, Commerçant M; out of scope gets 404 | Integration | P1 | G3 | C | Not covered | PR C not merged |
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
| CC1 | Qui propose un avoir ne le valide pas, et qui le valide ne l'émet pas (rows DR22, DR23, DR24); 403 if the check fails | Integration | P1 | G3 | API, BO | Blocked | Tested by T24; no API or back-office yet |
| CC2 | Qui compte une caisse ne valide pas son écart (rows DR28, DR29); 403 if the check fails | Integration | P1 | G3 | API, BO | Blocked | Tested by T27; no API or back-office yet |
| CC3 | Qui demande un changement de plafond, de taux ou de droit ne l'approuve pas (rows DR34); 403 if the check fails | Integration | P1 | G3 | API, BO | Blocked | Tested by T54; no API or back-office yet |
| CC4 | Qui prépare une grille de prix ne la valide pas (rows DR15, DR17); 403 if the check fails | Integration | P1 | G3 | API, BO | Blocked | Tested by T54; no API or back-office yet |

## Blockers

| Blocker | Rows held | Unblocked by |
|---|---|---|
| No API | DR01 to DR35, CC1 to CC4, T14, T22, T23, T29, T49, T54; server-side half of T03, T10, T20, EX06 | `apps/api` (Ala) |
| No back-office | T12, T14, T24, T26, T31, T40, T46 and the back-office half of T01, T43, T44 | `apps/backoffice` (Ala) |
| No driver app | T13, T15 to T18, T21, T27, T42, T45, EX14 to EX17 | `apps/driver` (Moataz) |
| No servers or staging | T55 to T61, load and security tests | #12 (PR #68), #14, #15 (Helmi) |
| No real phones | T02, T13, T16, T21 (G2) | GOFAST phones (20 Nov) and team phones |
| CI not merged | Every count is manual (RV-09) | Merge PR #67 |

## How to update this file

- When a PR merges, update its rows: status and evidence (file and test name). Put the T, DR or EX id in the test name.
- A row is Covered only when a test checks the whole expected result. Read the test, not its name.
- Counts come from a run on the PR's head commit (RV-09).
