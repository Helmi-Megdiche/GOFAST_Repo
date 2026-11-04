# Fonctionnalités (copie du cahier des charges)

Source : onglet « Fonctionnalités » du cahier en ligne. Le cahier fait foi. Lot : L1 lancement, L2 extension, L3 plus tard.

Décision du 4 novembre 2026 (charge) : passent en L2 FE-08, FE-09, PRO-06 (étiquettes thermiques, A6 PDF reste en L1), GES-02, GES-03, la version complète de BO-05 (règle simple en L1), BO-17 au-delà d'un rapport et de l'export CSV, FIN-07 automatique (liste des impayés en L1), l'anglais des écrans internes (back-office, application livreur). ESP-09 reste en L1.


## Site public

| ID | Fonction | Lot |
|---|---|---|
| FE-01 | Accueil : promesse, boutons « Commander » et « Suivre un colis », étapes, offres, encart commerçants, contact | L1 |
| FE-02 | Offres Express (moins de 1 h), Standard (dans la journée), Programmée (créneau choisi), avec conditions et heure limite | L1 |
| FE-03 | Types de colis, limites de poids et de dimensions, objets interdits, options | L1 |
| FE-04 | Zones desservies avec message clair si l'adresse est hors zone | L1 |
| FE-05 | FAQ, devenir livreur, mentions légales, CGV, confidentialité | L1 |
| FE-06 | Contact : formulaire avec pièce jointe de 5 Mo et captcha ; ticket ouvert et accusé de réception automatiques | L1 |
| FE-07 | Français, arabe (RTL) et anglais sur toutes les pages, le back-office et l'application livreur, avec un choix de langue sur chaque espace, mobile d'abord | L1 |
| FE-08 | Référencement : pages par ville et par offre, balises, plan du site, données structurées en FR et AR | L1 |
| FE-09 | Mesure d'audience après consentement : visites, départs du formulaire, commandes | L1 |
| FE-10 | Simulateur de prix et carte des zones | L2 |
| FE-11 | Page commerçants avec demande de devis | L2 |
| FE-12 | Plan d'accès au siège si une adresse est communiquée | L3 |
| FE-13 | Version installable (PWA) sur iPhone et Android : commande, suivi, factures et réclamations, avec le SMS pour les messages importants | L1 |

## Commande

| ID | Fonction | Lot |
|---|---|---|
| CMD-01 | Formulaire en 5 étapes : expéditeur, destinataire, colis, service, récapitulatif | L1 |
| CMD-02 | Adresse par recherche, repère sur carte et point de repère en texte, mémorisés pour la prochaine commande | L1 |
| CMD-03 | Commande sans compte préalable : téléphone vérifié par code, compte léger créé | L1 |
| CMD-04 | Prix détaillé et garanti 15 min ; majorations nuit, pluie et forte demande affichées et plafonnées | L1 |
| CMD-05 | Espèces à l'enlèvement, espèces à la livraison, compte client | L1 |
| CMD-06 | Numéro de suivi aléatoire, bon de commande PDF, confirmation par SMS et e-mail | L1 |
| CMD-07 | Brouillon conservé sur coupure réseau ; double clic sans doublon | L1 |
| CMD-08 | Annulation par le client jusqu'à l'arrivée du livreur | L1 |
| CMD-09 | Paiement en ligne par carte et portefeuille, avec remboursement tracé | L3 |
| CMD-10 | Codes promo | L2 |
| CMD-11 | Reprise d'une commande passée et commandes récurrentes | L3 |

## Suivi et destinataire

| ID | Fonction | Lot |
|---|---|---|
| SUI-01 | Suivi public par numéro : statut, historique daté, heure estimée, villes, sans donnée personnelle | L1 |
| SUI-02 | Lien personnel sans compte pour le destinataire : heure estimée, montant à payer, code de remise, consignes | L1 |
| SUI-03 | Depuis ce lien : partager sa position, corriger son repère, choisir un nouveau créneau après un échec | L1 |
| SUI-04 | Notifications limitées aux moments utiles : commande prise, départ du livreur, échec, livraison | L1 |
| SUI-05 | Preuve de livraison consultable par l'expéditeur | L1 |
| SUI-06 | Position du livreur sur carte pendant la livraison | L2 |
| SUI-07 | Notifications WhatsApp avec SMS en secours | L2 |
| SUI-08 | Appel masqué entre client et livreur | L3 |

## Espace client

| ID | Fonction | Lot |
|---|---|---|
| ESP-01 | Inscription par e-mail ou téléphone avec code, connexion, mot de passe oublié | L1 |
| ESP-02 | Profil, carnet d'adresses et de destinataires, préférences, suppression du compte | L1 |
| ESP-03 | Tableau de bord : commandes en cours, dernières livraisons, montant dû | L1 |
| ESP-04 | Liste, recherche et détail des commandes | L1 |
| ESP-05 | Factures, reçus et avoirs en PDF, avec statut de règlement | L1 |
| ESP-06 | Réclamations liées à une commande, pièces jointes, suivi des échanges | L1 |
| ESP-07 | Notation du livreur, chat, mode clair et sombre sur le site, les espaces et les applications, avec suivi automatique du réglage de l'appareil | L2 |
| ESP-08 | Programme de fidélité en remises sur facture | L3 |
| ESP-09 | Connexion avec Google pour les clients et les commerçants, téléphone vérifié une fois par SMS | L1 |

## Commerçants

| ID | Fonction | Lot |
|---|---|---|
| PRO-01 | Compte entreprise : raison sociale, matricule fiscal, plusieurs utilisateurs avec rôle | L1 |
| PRO-02 | Import CSV ou Excel avec rapport d'erreurs ligne par ligne | L1 |
| PRO-03 | Plusieurs points d'enlèvement | L1 |
| PRO-04 | COD : montants collectés, frais déduits, reversements et relevé téléchargeable | L1 |
| PRO-05 | Relevés mensuels et encours autorisé | L1 |
| PRO-06 | Étiquettes A6 ou thermiques avec code-barres | L1 |
| PRO-07 | API, environnement de test, clés et webhooks signés | L2 |
| PRO-08 | Modules Shopify et WooCommerce : commandes importées et statuts renvoyés | L2 |
| PRO-09 | Analyse des retours par produit, ville et motif | L3 |

## Back-office

| ID | Fonction | Lot |
|---|---|---|
| BO-01 | Tableau de bord : compteurs, retards, échecs, alertes, comparaison de périodes | L1 |
| BO-02 | Carte des livreurs et des courses en cours | L1 |
| BO-03 | Liste filtrable des commandes, fiche détaillée, historique complet, export CSV | L1 |
| BO-04 | Commande prise par téléphone, modification avant enlèvement avec recalcul du prix | L1 |
| BO-05 | Score de risque (refus, impayés) qui confirme automatiquement les commandes sûres et envoie les autres à un agent | L1 |
| BO-06 | File de dispatch : suggestions de livreurs avec la raison de chaque choix, affectation manuelle | L1 |
| BO-07 | Mode de secours : affectation par téléphone saisie ensuite si la carte ou les alertes tombent | L1 |
| BO-08 | Colis : un code-barres par colis, poids constaté, mouvements, file des colis non livrés | L1 |
| BO-09 | Incidents, nouvelles tentatives et retours | L1 |
| BO-10 | Clients : fiche, adresses, historique, conditions, suspension motivée | L1 |
| BO-11 | Livreurs : dossier, candidatures, documents à échéance, zones, performance, caisse | L1 |
| BO-12 | Réclamations : catégorie, priorité, file, fil d'échanges, notes internes, modèles, avoirs validés | L1 |
| BO-13 | Zones en polygones, tarifs, frais supplémentaires | L1 |
| BO-14 | Simulation de l'effet d'un changement de prix avant application, avec validation | L2 |
| BO-15 | Dispatch automatique et tournées ordonnées | L2 |
| BO-16 | Délais de traitement des réclamations avec alerte | L2 |
| BO-17 | Rapports : commandes, réussite et échecs, livreurs, clients, délais, satisfaction (écran, Excel, PDF) | L1 pour les 3 premiers, L2 ensuite |
| BO-18 | Campagnes SMS et e-mail aux clients consentants | L3 |

## Application client Android

| ID | Fonction | Lot |
|---|---|---|
| APP-01 | Connexion par téléphone et code SMS, français, arabe et anglais | L2 |
| APP-02 | Accueil : adresse de livraison en premier, commande en cours, destinataires fréquents | L2 |
| APP-03 | Commande en 5 écrans avec prix visible à chaque étape, repère sur carte et contacts du téléphone | L2 |
| APP-04 | Suivi sur carte, livreur joignable, notifications push | L2 |
| APP-05 | Commandes, preuves de livraison, notation | L2 |
| APP-06 | Factures, adresses, destinataires, aide et réclamations | L2 |
| APP-07 | Paiement en ligne quand le prestataire est activé | L3 |

## Application livreur

| ID | Fonction | Lot |
|---|---|---|
| LIV-01 | Application Android et version installable sur iPhone, connexion par appareil reconnu et code PIN | L1 |
| LIV-02 | Statut disponible ou indisponible ; position envoyée pendant le service seulement, écran verrouillé compris sur Android, application ouverte sur iPhone | L1 |
| LIV-03 | Alerte de mission sonore avec délai d'acceptation, refus motivé | L1 |
| LIV-04 | Liste des missions et navigation vers Google Maps ou Waze | L1 |
| LIV-05 | Scan à la collecte et à la remise, colis par colis | L1 |
| LIV-06 | Statuts : arrivée à la collecte, colis pris, en livraison, livré, échec avec motif et photo | L1 |
| LIV-07 | Preuve selon le niveau de risque : code, signature, photo | L1 |
| LIV-08 | Saisie des espèces et reçu au client | L1 |
| LIV-09 | Caisse du jour, plafond visible, double confirmation à la remise | L1 |
| LIV-10 | Hors ligne : actions et photos gardées sur l'appareil, code vérifié sur place, envoi au retour du réseau ; sur iPhone, quand l'application est rouverte | L1 |
| LIV-11 | Gains, historique, planning | L2 |

## Finance

| ID | Fonction | Lot |
|---|---|---|
| FIN-01 | Facture automatique en fin de prestation, y compris retour et annulation avec frais | L1 |
| FIN-02 | Facture mensuelle groupée pour les commerçants, avec contrôle du comptable | L1 |
| FIN-03 | El Fatoora : fichier TEIF, signature, envoi à TTN, identifiant et QR reçus, file de reprise ; envoi activé dès que l'adhésion TTN est ouverte | L1 |
| FIN-04 | Avoirs, TVA et timbre fiscal paramétrables | L1 |
| FIN-05 | Règlements hors ligne : espèces, virement, chèque, justificatif, imputation, annulation tracée | L1 |
| FIN-06 | Caisse livreur : montant attendu, comptage, écart motivé, reçu des deux côtés | L1 |
| FIN-07 | Relances à J+0, J+15, J+30 par e-mail et SMS | L1 |
| FIN-08 | Reversements COD avec relevé et déduction des factures échues si le contrat le prévoit | L1 |
| FIN-09 | Export vers le logiciel de l'expert-comptable | L1 |
| FIN-10 | Paiements en ligne rapprochés des versements du prestataire | L3 |
| FIN-11 | Import de relevé bancaire | L3 |

## Gestion interne

| ID | Fonction | Lot |
|---|---|---|
| GES-01 | Contrats et grilles tarifaires versionnés, avec date d'effet | L1 |
| GES-02 | Documents liés à une commande, un client, un livreur ou un véhicule : recherche, droits, durée de conservation | L1 |
| GES-03 | Véhicules : assurance et visite technique, alertes à 30 et 7 jours, blocage d'affectation si expirées | L1 |
| GES-04 | Indicateurs de base : volumes, chiffre d'affaires, créances, COD à reverser | L1 |
| GES-05 | Comptabilité connectée : journaux, grand livre, balance, clôture | L2 |
| GES-06 | RH : dossiers, congés, pointage, gains par course, fiches de gains, export de paie | L2 |
| GES-07 | Flotte : kilométrage, carburant, entretiens, matériel, dépenses avec justificatif | L2 |
| GES-08 | Tableaux de direction : coût, marge, performance par zone et par offre | L2 |
| GES-09 | Tournées récurrentes et capacité par zone | L2 |
| GES-10 | Devis commerçants et achats fournisseurs | L3 |
