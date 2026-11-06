# Réponses de GOFAST (6 novembre 2026)

Source : « GOFAST, Cahier de réponses et orientations fonctionnelles », 6 novembre 2026, réponse au document « Informations à fournir pour le développement ». GOFAST le présente comme un document de travail que sa direction doit encore approuver : **chaque valeur ci-dessous est provisoire** et doit rester modifiable par un administrateur, avec un journal des changements (qui, quand, ancienne et nouvelle valeur).

Ces valeurs remplissent les paramètres que le cahier laisse à GOFAST. Elles ne modifient pas le cahier. En cas d'écart, le cahier fait foi, sauf décision de Helmi notée ici.

## Décisions de Helmi (6 novembre)

- **Nom :** la marque affichée devient **GOFAST** (site, textes, factures, documents). Les identifiants internes restent (`@fastgo/*`, clés `fg.*`, nom du dépôt). Le préfixe de suivi reste `FG-XXXX-XXXX` (R203).
- **Plafond d'espèces :** deux plafonds, comme GOFAST le demande. Le livreur suit séparément les espèces des commandes de commerçants (B2B, COD compris) et celles des particuliers (B2C). Plafond B2B 1 000 DT, plafond B2C 500 DT. Un plafond atteint déclenche la remise de caisse.
- **Société :** l'équipe travaille comme si GOFAST était déjà immatriculée (TTN, Google Play). Helmi prévient GOFAST lui-même. Les données légales restent des marques visibles (`[MATRICULE]`, `[ADRESSE LÉGALE]`, `[TÉLÉPHONE]`) jusqu'aux documents.
- **Frais d'annulation (R212) :** GOFAST écrit « après arrivée / déplacement du livreur ». Le cahier dit « après l'arrivée » : les frais s'appliquent à partir de `arrived_at`.

## Zones et dépôt

| Réf. | Valeur |
|---|---|
| D1 | Grand Tunis : Tunis, Ariana, Ben Arous, Manouba. Extension plus tard |
| D2 | Un seul dépôt central, El Menzah 7, après le Grand Hôtel. Pas de points relais. Garde d'un colis non livré : 48 h après notification, sans frais, puis retour |

## Tarifs (grille unique pour le Grand Tunis)

| Service | Prix |
|---|---|
| Standard | 10 DT (10000 millimes) |
| Standard avec emballage GOFAST | 12 DT (12000) |
| Express, moins de 12 h après la collecte effective | 15 DT (15000) |
| Express avec emballage GOFAST | 17 DT (17000) |

TTC ou HT : non tranché. TVA et timbre (R204) : ne rien coder avant la confirmation écrite de l'expert-comptable. L'offre « Programmée » du site n'a pas de prix : elle reste `[PRIX]`.

## Risque, preuve et caisse

| Réf. | Valeur |
|---|---|
| D8 / R209 | Confirmation automatique jusqu'à 100 DT (100000 millimes), sous réserve des contrôles. Au-dessus : un agent confirme |
| D8 | Code de remise toujours demandé avec du COD, 4 chiffres. Aucun autre seuil de valeur donné |
| D8 | Plafond d'espèces : B2B 1 000 DT, B2C 500 DT (décision ci-dessus). Remise aussi chaque jour en fin de service. Chaque remise : reçu numérique, heure, montant déclaré, montant vérifié, responsable qui valide. Aucun dépassement sans accord du responsable |

## Frais et délais

| Réf. | Valeur |
|---|---|
| D7 / R212 | Annulation avant l'arrivée du livreur : gratuite. Après l'arrivée : 5 DT |
| D7 / R504 | Deuxième essai : gratuit. Retour à l'expéditeur après échec : 5 DT, s'il a lieu |
| R505 | Collecte impossible à cause du client : 5 DT |
| R501 | 2 essais, puis retour |
| R503 | 24 h pour répondre après la notification d'échec, puis retour |
| R503 | Créneaux : 08 h-10 h, 10 h-12 h, 12 h-14 h, 14 h-16 h, 16 h-20 h |
| R502 | Motifs : destinataire absent, téléphone injoignable, destinataire refuse le colis, adresse incorrecte ou introuvable, autre (commentaire obligatoire). Heure et preuve de passage enregistrées |
| R208 | Écart toléré : 500 g jusqu'à 5 kg, 10 % au-delà. Au-delà, le commerçant accepte le nouveau prix avant la livraison |
| R801 | Signalement d'un dommage ou d'une perte : 48 h après la livraison ou la constatation |
| R802 | Sans valeur déclarée : 100 DT au plus |
| R804 | Réouverture d'une réclamation : 30 jours. Réponse sous 48 h |
| D10 / R707 | Facture commerçant mensuelle. Reversement COD chaque mardi, virement bancaire ou postal, sans minimum, avec relevé |
| R205 | Prix valable 15 min |
| R406 | Lien du destinataire actif 24 h après la fin de la livraison |
| Import | 10 Mo et 1 000 lignes au plus |
| Pièces jointes | Images et PDF, 5 Mo par fichier, 5 fichiers |

## Conservation (D9)

Factures 10 ans, preuves de livraison 12 mois, positions GPS 90 jours. À confirmer par l'expert-comptable et le juriste.

## Autres décisions confirmées

D3 livreurs salariés et indépendants, même parcours, statut visible dans l'administration ; retenue sur écart de caisse seulement après avis juridique. D5 facturation et caisse dans la plateforme, export comptable. D6 démarrage le lundi 9 novembre 2026. D11 téléphone personnel (Android 10+, iOS 16.4+) ou prêté. D12 B2B et B2C dès l'ouverture, repas et courses plus tard. D14 hébergement en Tunisie. D15 pas d'App Store, version installable sur iPhone.

Livreurs (page Devenir livreur) : véhicules scooter, moto, voiture, utilitaire léger. Pièces : CIN, permis adapté, carte grise, assurance, photo du véhicule, téléphone, coordonnées bancaires ou postales. Rien d'autre sans avis juridique.

Rôles internes cités par GOFAST, rapprochés du cahier : responsable d'exploitation = Opérations, responsable caisse = Comptable.

## Hors L1 pour l'instant

Notification 30 min avant l'arrivée du livreur : proposée « sous réserve de faisabilité », absente du cahier. Non construite en L1.

## Encore ouvert

Coordonnées légales (adresse du siège, matricule, téléphone, e-mail `contact@gofast.tn` à créer), TTC ou HT, TVA et timbre, prix de l'offre Programmée, responsable de la facturation légale, pièces TTN, ANCE et INPDP, compte Google Play, nom de domaine, nom d'expéditeur des SMS, titulaire des comptes, logo GOFAST en SVG et couleurs, icônes de l'application, relecteurs de l'arabe et de l'anglais.
