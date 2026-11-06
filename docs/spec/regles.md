# Règles du cahier des charges (extrait pour le dépôt)

Extrait du cahier en ligne, 5 novembre 2026 : Règles de gestion, Rôles et droits, Technique, Annexe, Recette, décisions. En cas d'écart, le cahier fait foi. Ce fichier ne remplace pas `docs/spec/fonctionnalites.md`, qui garde les ID et les lots.

## Paramètres à fixer avec FastGo

Un administrateur peut les changer sans développement. Une valeur « proposée » n'est pas encore validée.

Valeurs reçues de GOFAST le 6 novembre 2026, provisoires : voir `reponses-gofast.md`.

| Paramètre | Proposition |
|---|---|
| Confirmation automatique | Montant à fixer |
| Code de remise obligatoire | Toujours avec du COD ; autre seuil à fixer |
| Plafond d'espèces par livreur | 500 TND, alerte avant le plafond |
| Validité du prix affiché | 15 min |
| Temps de réponse à une mission | À mesurer au pilote |
| Essais de livraison | 2, puis retour |
| Garde d'un colis non livré | À fixer |
| Écart de poids toléré | À fixer |
| Distance d'alerte à la remise | À fixer après le pilote |

## États d'une commande

La commande porte seule son état jusqu'à la prise en charge. Ensuite, chaque colis a le sien et la commande en déduit le résultat.

| État | Ce que voit le client | Ce qui le déclenche | Et ensuite |
|---|---|---|---|
| Reçue | Nous avons reçu votre commande | Le client valide | Confirmée ou Annulée |
| Confirmée | Votre commande est confirmée | Le système ou un agent la confirme | Attribuée ou Annulée |
| Attribuée | Un livreur vient chercher votre colis | Un livreur accepte la mission | Prise en charge, Collecte ratée, Annulée ou retour à Confirmée si le livreur est retiré |
| Collecte ratée | La collecte n'a pas pu se faire | Le livreur indique le motif sur place, avec une photo | Confirmée avec un nouveau créneau, ou Annulée |
| Prise en charge | Vos colis sont récupérés, avec leur nombre | Le livreur scanne au moins un colis | En route |
| En route | Votre livraison est en cours | Un colis part vers le destinataire ou passe au dépôt | Une des quatre issues |
| Livrée, Livrée en partie, Rendue, Perdue | L'issue et le détail par colis | Le dernier colis arrive à son état final | Fin |
| Annulée | Votre commande est annulée | Le client ou un agent habilité | Fin |

Une commande sans colis livré, avec des colis rendus et d'autres perdus, se termine en Rendue et signale la perte.

## États d'un colis

| État | Ce qui le déclenche | Et ensuite |
|---|---|---|
| À prendre | La commande est reçue | Pris ou Annulé |
| Pris | Scan à la collecte | Au dépôt, En route ou Perdu |
| Au dépôt | Passage au dépôt ou contrôle | En route, Retour ou Perdu |
| En route | Départ vers le destinataire | Remis, Remise ratée ou Perdu |
| Remise ratée | Motif et photo du livreur | Au dépôt, En route, Retour ou Perdu |
| Retour | Décision de renvoyer le colis | Rendu ou Perdu |
| Remis | Remise avec la preuve demandée | Fin |
| Rendu | Scan chez l'expéditeur | Fin |
| Perdu | Déclaration validée par le responsable des opérations | Au dépôt si le colis réapparaît |
| Annulé | Commande annulée ou colis jamais remis au livreur | Fin |

Le serveur refuse tout autre changement d'état. Chaque changement garde la date, son auteur et, pour un livreur, sa position. Un colis abîmé garde son état et ouvre une réclamation.

Une mission suit son propre fil : proposée, acceptée, refusée, expirée, livreur arrivé, terminée. L'heure d'arrivée du livreur sert ainsi de référence pour l'annulation et l'attente.

## Règles

### 1. Créer un compte

| Réf. | Règle |
|---|---|
| R101 | Un numéro de téléphone correspond à un seul client, et un e-mail aussi |
| R102 | Le téléphone est vérifié par SMS avant la première commande, avec un nombre d'essais limité |
| R103 | La connexion Google sert aux clients et aux commerçants. Un e-mail déjà connu rejoint son compte après vérification par code, et le téléphone reste demandé. Les livreurs et les équipes internes ne l'utilisent pas |
| R104 | Un commerçant règle sur compte une fois son contrat validé par le responsable des opérations |
| R105 | Fermer un compte efface l'identité de la personne ; les pièces comptables restent conservées |

### 2. Passer une commande

| Réf. | Règle |
|---|---|
| R201 | Une adresse hors zone est signalée avant le calcul du prix |
| R202 | Un double clic ou un nouvel envoi après une coupure ne crée jamais une seconde commande |
| R203 | Le numéro de suivi FG-XXXX-XXXX est tiré au hasard, impossible à deviner, et ne sert qu'une fois |
| R204 | Le prix affiche chaque élément : offre et zone, distance, poids, options, majoration, remise, TVA et timbre |
| R205 | Après sa durée de validité, le prix est recalculé et le client le revalide |
| R206 | Une commande prend la grille en vigueur le jour où elle est créée, celle du contrat pour un commerçant |
| R207 | Une majoration a un plafond et un nom visibles avant la validation |
| R208 | Si le poids constaté dépasse l'écart toléré, le client est prévenu avant la facture |
| R209 | Le système confirme seul un client vérifié, sans retard de paiement, sous le montant fixé et à faible risque. Un agent traite le reste |
| R210 | Une commande en attente de confirmation trop longtemps crée une alerte, plus vite pour Express |
| R211 | Le règlement sur compte s'arrête quand le plafond du contrat est dépassé ou qu'une facture reste impayée après le délai prévu |
| R212 | Le client annule gratuitement avant l'arrivée du livreur, avec frais ensuite selon les CGV. Après la prise en charge, il passe par une réclamation |

### 4. Remettre le colis

| Envoi | Preuve demandée |
|---|---|
| Pli ou colis courant, sans COD | Code du destinataire, ou photo avec position |
| Colis fragile, ou preuve renforcée demandée par le client | Code, ou signature et photo |
| Colis avec COD, ou valeur au-dessus du seuil fixé | Code ; à défaut, un agent valide au téléphone, avec signature et photo |

La preuve la plus forte l'emporte quand plusieurs cas s'appliquent.

| Réf. | Règle |
|---|---|
| R401 | Un colis passe à Remis seulement avec sa preuve. Des codes faux répétés renvoient vers un agent |
| R405 | Le suivi par numéro montre l'état, les dates et les villes, sans donnée personnelle ni position |
| R406 | Le lien du destinataire a son propre code aléatoire et cesse de fonctionner après la livraison, passé le délai fixé |

### 5. Quand la livraison échoue

| Réf. | Règle |
|---|---|
| R501 | Après le nombre d'essais fixé, le colis repart vers l'expéditeur |
| R502 | Le livreur indique un motif de la liste et prend une photo |
| R503 | Le destinataire peut choisir un autre créneau depuis son lien. Sans réponse dans le délai fixé, le retour commence |
| R504 | Les frais d'un nouvel essai et du retour sont annoncés à l'expéditeur dès la commande |
| R505 | Une collecte impossible à cause du client peut entraîner des frais de déplacement prévus aux CGV |

### 6. Facturer et encaisser

| Réf. | Règle |
|---|---|
| R601 | La facture ou la ligne mensuelle se crée seule à la fin du service, y compris pour un retour ou une annulation avec frais |
| R602 | Une facture émise reste telle quelle ; on la corrige avec un avoir |
| R603 | Les numéros se suivent sans trou chaque année : FAC-AAAA-NNNNNNN et AV-AAAA-NNNNNNN |
| R604 | Une fois l'adhésion TTN active, les factures concernées lui sont envoyées. En cas de panne, elles attendent et le comptable est alerté |
| R605 | Un particulier règle les frais de retour quand il récupère son colis ; sinon, le solde bloque ses prochaines commandes en espèces |
| R606 | Si le colis revient sans faute de FastGo, le port reste dû. Si FastGo est en faute, un avoir et un remboursement tracé sont faits |
| R607 | Si le destinataire refuse un envoi en port dû, le port et le retour reviennent à l'expéditeur, qui l'a accepté à la commande |

### 7. COD

| Réf. | Règle |
|---|---|
| R707 | Le COD est reversé selon le contrat, avec un relevé par colis et, si le contrat le prévoit, la déduction des factures échues |
| R708 | Le COD reste séparé du chiffre d'affaires de FastGo |

### 8. Traiter une réclamation

| Réf. | Règle |
|---|---|
| R801 | Les CGV fixent le délai pour signaler un dommage ou une perte |
| R802 | L'indemnité ne dépasse pas la valeur déclarée ; sans valeur déclarée, le forfait des CGV s'applique |
| R803 | Le service client propose l'avoir, le responsable des opérations le valide et le comptable l'émet |
| R804 | Un dossier clos peut être rouvert pendant un délai fixé, puis il est archivé |

### 9. Choisir la langue

| Réf. | Règle |
|---|---|
| R901 | La plateforme existe en français, en arabe et en anglais. Le français est la langue par défaut |
| R902 | Chaque utilisateur choisit sa langue depuis le site ou son compte. Ce choix reste enregistré et ne modifie ni ses commandes ni ses réglages |
| R903 | L'expéditeur ou l'agent choisit la langue du SMS envoyé au destinataire, le français par défaut. Le destinataire peut changer de langue sur son lien |
| R904 | Les SMS, les e-mails et les notifications partent dans la langue enregistrée. Le code, le montant et le numéro de suivi restent identiques dans les trois langues |

## Droits des personnes extérieures

M = ses propres données seulement. Hors de ce périmètre, le serveur renvoie 404.

| Réf. | Action | Visiteur | Destinataire | Particulier | Commerçant | Livreur |
|---|---|---|---|---|---|---|
| EX02 | Suivre un colis par son numéro | V | V | V | V | – |
| EX03 | Ouvrir son lien de livraison | – | M | – | – | – |
| EX04 | Changer de créneau ou partager sa position | – | M | – | – | – |
| EX06 | Passer une commande | – | – | M | M | – |
| EX07 | Annuler une commande | – | – | M | M | – |
| EX08 | Importer des commandes | – | – | – | M | – |
| EX09 | Voir ses factures | – | – | M | M | – |
| EX10 | Ouvrir et suivre une réclamation | – | – | M | M | – |
| EX11 | Voir ses relevés COD | – | – | – | M | – |
| EX12 | Gérer son équipe et ses points d'enlèvement | – | – | – | M | – |

Le cahier ne détaille pas les rôles à l'intérieur d'une entreprise : `company_members` porte seulement un champ `role`.

## Modèle de données utile aux espaces

| Table | Champs principaux | Contraintes |
|---|---|---|
| `accounts` | `kind`, `phone_e164`, `phone_verified_at`, `email`, `google_sub`, `password_hash`, `locale`, `status`, `closed_at` | Téléphone et e-mail uniques (R101) ; identité effacée à la fermeture (R105) |
| `companies` | `legal_name`, `tax_number`, `billing_address_id`, `status` | A des membres, des contrats et des points d'enlèvement |
| `company_members` | `company_id`, `account_id`, `role` | Unique par entreprise et par compte |
| `addresses` | `owner_id`, `label`, `line`, `landmark`, `location`, `zone_id`, `is_pickup_point` | Plusieurs points d'enlèvement par commerçant |
| `recipients` | `owner_id`, `name`, `phone_e164`, `address_id`, `locale` | Destinataires enregistrés par un client |
| `contracts` | `company_id`, `credit_limit_millimes`, `payment_terms_days`, `cod_cycle`, `status`, `approved_by` | Règlement sur compte après validation (R104, R211) |
| `orders` | `tracking_number`, `sender_id`, `quote_id`, `service`, `payment_mode`, `freight_payer`, `recipient_locale`, `status`, `total_millimes` | Numéro de suivi unique et aléatoire (R203) |
| `parcels` | `order_id`, `barcode`, `size`, `weight_declared_g`, `weight_measured_g`, `declared_value_millimes`, `cod_millimes`, `proof_level`, `attempts`, `status` | État propre à chaque colis |
| `missions` | `order_id`, `driver_id`, `kind`, `status`, `offered_at`, `expires_at`, `arrived_at`, `finished_at` | `kind` vaut `pickup` ou `delivery` |
| `status_events` | `subject_type`, `subject_id`, `from_status`, `to_status`, `actor_id`, `occurred_at` | Historique de chaque changement |
| `proofs` | `parcel_id`, `kind`, `code_verified`, `captured_at`, `location`, `file_id`, `validated_by` | Obligatoire pour passer à Remis (R401) |
| `delivery_codes` | `parcel_id`, `code_hash`, `failed_attempts`, `expires_at` | Un code par colis |
| `recipient_links` | `order_id`, `token_hash`, `locale`, `expires_at` | Code aléatoire propre au lien (R406) |
| `invoices` | `number`, `customer_id`, `issued_at`, `net_millimes`, `vat_millimes`, `stamp_millimes`, `total_millimes`, `status` | Numéro continu par an (R603) ; non modifiable après émission (R602) |
| `invoice_lines` | `invoice_id`, `order_id`, `label`, `net_millimes`, `vat_rate` | Une facture porte une ou plusieurs commandes |
| `credit_notes` | `number`, `invoice_id`, `total_millimes` | Avoir lié à une facture |
| `cod_payouts` | `company_id`, `period`, `collected_millimes`, `fees_millimes`, `net_millimes`, `status` | Un colis figure sur un seul reversement. Le COD reste hors chiffre d'affaires (R708) |
| `tickets` | `order_id`, `opened_by`, `category`, `status`, `closed_at`, `archived_at` | Réouverture pendant le délai fixé (R804) |
| `ticket_messages` | `ticket_id`, `author_id`, `body`, `is_internal` | Notes internes jamais visibles du client |

Pas d'effacement physique d'une donnée métier. La durée de garde suit la décision D9.

## Routes API concernées

| Route | Méthodes | Accès | Rejeu |
|---|---|---|---|
| `/v1/orders/{id}/cancel` | POST | Particulier et Commerçant (les leurs), Agent, Opérations, Logistique, Admin | État |
| `/v1/order-imports` | POST, GET /{id} | Commerçant | Clé |
| `/v1/tracking/{number}` | GET | Public, essais limités | Non |
| `/v1/recipient-links/{token}` | GET, PATCH | Destinataire avec le lien | État |
| `/v1/tickets` | POST, GET, POST /{id}/messages | Particulier et Commerçant (les leurs), Service client, Agent, Opérations, Admin | Clé |
| `/v1/invoices` | GET | Client (les siennes), Comptable, Direction, Opérations, Service client, Admin | Non |
| `/v1/cod-payouts` | GET, POST | Comptable ; lecture Commerçant (les siens), Direction, Opérations, Admin | Clé |

## Décisions encore ouvertes qui touchent ces écrans

| Réf. | Question | Recommandation du cahier |
|---|---|---|
| D2 | Dépôt ou points relais | Un seul dépôt ; durée de garde des colis non livrés à fixer |
| D4 | Coordonnées officielles | À fournir avant la mise en ligne (contact, factures, CGV) |
| D7 | Frais et indemnités | Frais d'annulation après arrivée du livreur, frais de retour, indemnité plafonnée à la valeur déclarée ; montants à fixer |
| D9 | Durées de conservation | Fixées avec l'expert-comptable pour les factures et avec un juriste pour les preuves et les positions |
| D10 | Périodicités des commerçants | Facture mensuelle, reversement COD hebdomadaire |

## Scénarios de recette concernés

| Réf. | Scénario | Résultat attendu |
|---|---|---|
| T02 | Une cliente commande depuis la version installée sur iPhone | Commande, suivi et facture fonctionnent ; le SMS de suivi arrive même sans notification autorisée |
| T06 | Le client annule avant l'arrivée du livreur, puis après, puis après la prise en charge | Gratuit, puis avec frais, puis renvoi vers une réclamation |
| T08 | Un commerçant importe un fichier avec des erreurs | Les bonnes lignes passent et chaque erreur est expliquée |
| T11 | Quelqu'un essaie d'ouvrir un lien au hasard ou expiré | L'accès est refusé et les essais automatiques sont bloqués |
| T12 | Le destinataire choisit un autre créneau après un échec | Le dispatch le voit et l'expéditeur est informé |
| T19 | Une commande de 3 colis finit avec 2 remis et 1 rendu | Elle se termine en Livrée en partie, avec la bonne facture |
| T24 | Le comptable corrige une facture | Elle reste inchangée et un avoir lié est validé par une autre personne |
| T28 | Un commerçant reçoit son relevé COD | Colis livrés, frais et reversement concordent au millime |
| T30 | Une réclamation va jusqu'à l'archivage | Le client ne voit jamais les notes internes |
| T36 | Un commerçant sans contrat validé choisit le règlement sur compte | Le serveur refuse, puis accepte après la validation |
| T37 | Un client ferme son compte | Son identité disparaît et ses factures restent |
| T41 | Un commerçant dépasse son plafond ou a une facture en retard | Le règlement sur compte s'arrête |
| T47 | Des colis COD sont encaissés | Le COD n'entre pas dans le chiffre d'affaires |
| T50 | Un expéditeur choisit l'anglais pour le SMS, et le destinataire passe en arabe | Les textes suivent la langue, avec le même code, le même montant et le même numéro |
