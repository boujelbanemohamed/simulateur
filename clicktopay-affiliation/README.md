# Plateforme d'affiliation ClickToPay

Application permettant à un **agent de banque** de saisir la demande d'affiliation
d'un client e-commerçant à la plateforme ClickToPay, et au **banquier** de valider
ou de modifier les codes MCC Visa et Mastercard proposés.

```
clicktopay-affiliation/
├── server/   API Node.js / Express + PostgreSQL
├── web/      Interface React (Vite)
└── tools/    Extraction du référentiel MCC depuis le PDF Visa
```

## Démarrage rapide

Prérequis : Node.js ≥ 20 et PostgreSQL ≥ 14.

```bash
# 1. Base de données
createuser clicktopay --pwprompt          # mot de passe : clicktopay
createdb clicktopay --owner clicktopay
createdb clicktopay_test --owner clicktopay   # uniquement pour les tests

# 2. API
cd server
cp .env.example .env                      # ajuster DATABASE_URL et JWT_SECRET
npm install
npm run db:seed                           # crée le schéma, charge les 279 MCC et les comptes de démonstration
npm start                                 # http://localhost:4000

# 3. Interface
cd ../web
npm install
npm run dev                               # http://localhost:5173
```

### Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
| --- | --- | --- |
| Agent | `agent@banque.tn` | `Agent#2026` |
| Banquier | `banquier@banque.tn` | `Banquier#2026` |
| Administrateur | `admin@clicktopay.tn` | `Admin#2026` |

Ces comptes sont créés par `npm run db:seed`. **À supprimer avant toute mise en
production** (`seed({ withDemoUsers: false })` ne les crée pas).

## Parcours fonctionnel

1. **L'agent saisit la demande** en cinq étapes : site marchand, société (RNE,
   matricule fiscal, forme juridique), contact et adresse physique, activité, puis
   codes MCC.
2. **La plateforme propose les MCC** au fil de la saisie, classés par pertinence.
   Chaque proposition affiche son libellé et sa **description en français**, la
   définition officielle Visa, un score de pertinence et les termes de la demande
   qui ont déclenché la correspondance.
3. **L'agent retient un code par réseau** (Visa et Mastercard, indépendamment s'il
   le souhaite), justifie son choix, puis soumet la demande.
4. **Le banquier arbitre** : il valide les codes proposés, les remplace par
   d'autres, rejette la demande ou la renvoie à l'agent pour complément. Les
   propositions du moteur restent affichées à côté de sa décision.
5. **Tout est tracé** : chaque étape alimente un journal nominatif et horodaté, et
   le code initialement proposé par l'agent reste visible à côté du code retenu.

Statuts : `BROUILLON` → `SOUMISE` → `VALIDEE` | `REJETEE` | `COMPLEMENT_REQUIS`
(qui redevient modifiable puis re-soumissible).

## Administration

Le profil `ADMIN` dispose d'un espace dédié (`/administration`) en cinq onglets.

### Comptes et banques

- Création de comptes avec rôle (`AGENT`, `BANQUIER`, `ADMIN`) et rattachement à
  une banque ; modification du rôle, de la banque et de l'identité.
- Activation et désactivation : un compte désactivé ne peut plus se connecter.
- Réinitialisation du mot de passe par l'administrateur. Le compte doit alors en
  définir un nouveau à la connexion suivante : **le serveur refuse toutes les
  autres routes** tant que ce n'est pas fait, l'écran n'est pas la seule barrière.
- Changement de mot de passe par l'utilisateur lui-même, l'ancien étant exigé.
- Politique : 10 caractères minimum, une minuscule, une majuscule et un chiffre.
- Gestion des banques affiliées (code, raison sociale, activation), avec le
  nombre de comptes et de demandes rattachés.

Deux garde-fous empêchent de verrouiller la plateforme : un administrateur ne
peut ni modifier son propre rôle ni se désactiver, et la plateforme refuse de
perdre son dernier administrateur actif. Une banque comptant encore des comptes
actifs ne peut pas être désactivée.

Toutes ces actions alimentent le journal d'administration (onglet **Journal**).

### Référentiel MCC

- Édition d'un code : libellé, description française, mots-clés du moteur,
  pertinence e-commerce, niveau de vigilance, note affichée au banquier, et
  libellés officiels du réseau.
- Activation et désactivation d'un code. Un code désactivé disparaît du
  catalogue des agents et devient non sélectionnable — **rien n'est supprimé**,
  car les demandes déjà validées y font référence.
- Ajout d'un code absent du manuel (code local ouvert par l'acquéreur).
- Historique par code : action, auteur, date, champs réellement modifiés et motif.
- Toute modification s'applique immédiatement aux propositions faites aux agents,
  sans redéploiement.

### Import en masse : Excel et CSV

Pour un code isolé, aucun fichier n'est nécessaire : l'onglet **Référentiel MCC**
écrit directement en base. L'onglet **Import du référentiel** ne sert qu'à
répercuter plusieurs centaines de codes d'un coup, par exemple à la parution
d'une nouvelle édition du manuel Visa.

Le cycle prévu est celui des équipes métier :

1. **Télécharger** le référentiel courant en `.xlsx` ou en `.csv`.
2. **Corriger dans Excel**, puis réimporter le même fichier.
3. **Analyse** — un rapport d'écart liste les codes ajoutés, modifiés (champ par
   champ, avant et après) et absents du fichier. Rien n'est écrit à ce stade.
4. **Application** — après une confirmation explicite. Les codes absents du
   fichier ne sont désactivés que si la case correspondante est cochée, et ne
   sont jamais supprimés. Chaque code touché est historisé avec le motif.

La lecture est faite pour des fichiers produits par des humains :

- l'ordre des colonnes est libre et les colonnes supplémentaires sont ignorées ;
- les en-têtes sont reconnus avec leurs variantes (`Code`, `Code MCC`, `MCC` ;
  `Libellé`, `Intitulé`, `Désignation` ; `Vigilance`, `Niveau de risque`…) ;
- les valeurs métier sont traduites (`Forte`/`Moyenne`/`Faible`,
  `Standard`/`Sensible`/`Interdit`) ;
- un code rendu en nombre par Excel est normalisé, les mots-clés se séparent par
  virgule, point-virgule ou retour à la ligne ;
- une ligne illisible, un code en doublon ou une valeur non reconnue **remontent
  dans un rapport d'anomalies avec leur numéro de ligne**, jamais en silence.

L'aller-retour export → réimport est vérifié sans perte sur les 279 codes, dans
les deux formats. Un référentiel en JSON reste accepté pour un usage technique.

## Recette

L'application a été passée en revue par deux recettes indépendantes — une sur
l'API, une pilotant un vrai navigateur. Les défauts trouvés sont corrigés et
couverts par des tests. Deux points restent ouverts et relèvent d'une décision
métier :

- **Le profil `ADMIN` cumule les droits d'agent et de banquier**, sur toutes les
  banques : il peut saisir une demande, la soumettre et l'arbitrer seul. C'est
  pratique en exploitation, mais cela supprime le contrôle à quatre yeux. À
  trancher avec la conformité.
- **Le cache du référentiel est propagé par `LISTEN/NOTIFY`** entre instances.
  C'est suffisant pour un cluster classique, mais une notification perdue
  (redémarrage d'une instance pendant l'écriture) laisserait un cache périmé
  jusqu'au prochain changement.

## Le référentiel MCC

Les 279 codes descriptifs proviennent du **Visa Merchant Data Standards Manual
(avril 2026)**. Les MCC étant normalisés ISO 18245, ces codes sont communs à Visa
et à Mastercard ; la plateforme les propose donc pour les deux réseaux tout en
laissant le banquier fixer une valeur différente par réseau si l'acquéreur le
demande.

Chaîne de production du référentiel :

```
visa-merchant-data-standards-manual.pdf
  └─ tools/extract.py        → texte brut du PDF
  └─ tools/parse_mcc.py      → server/data/mcc-visa-raw.json  (code, libellé, définition, activités incluses, MCC voisins)
                    +
     server/data/mcc-fr.json  (overlay métier : libellé et description FR, mots-clés,
                               pertinence e-commerce, niveau de risque, notes)
  └─ npm run build:mcc       → server/data/mcc-catalog.json   (fichier consommé par l'application)
```

**La base de données fait foi.** `mcc-catalog.json` ne sert qu'à l'amorçage
initial : `npm run db:seed` n'insère que les codes absents et ne touche jamais à
ceux qui existent, pour que les ajustements faits par la conformité survivent à
un redéploiement. `seed({ forceMcc: true })` force le rejeu du fichier d'origine,
ce qui écrase ces ajustements — à réserver aux environnements de test.

Au quotidien, la mise à jour se fait donc depuis l'écran d'administration ou par
l'import d'une nouvelle édition, pas par le code. Régénérer le fichier d'amorçage
depuis un nouveau PDF reste possible : relancer les deux scripts Python,
compléter `mcc-fr.json` pour les codes ajoutés, puis `npm run build:mcc`.

> Le *Quick Reference Booklet* de Mastercard n'a pas pu être téléchargé depuis
> l'environnement de développement (le CDN Mastercard renvoie un 403). Les codes
> sont identiques puisque normalisés ISO 18245 ; si vous souhaitez afficher en
> plus les libellés propres à Mastercard, ajoutez-les dans `mcc-fr.json` sous une
> clé dédiée et exposez-la dans `scripts/build-mcc-catalog.js`.

### Niveaux de risque

Chaque MCC porte un niveau de vigilance, **modifiable depuis l'écran
d'administration** :

- `STANDARD` — aucune restriction ;
- `SENSIBLE` — affiché avec un bandeau « Vigilance renforcée » (pharmacie, jeux
  d'argent adjacents, transfert d'argent, bijouterie, télémarketing…) ;
- `INTERDIT` — jamais proposé et refusé par l'API, aussi bien à la saisie de
  l'agent qu'à la décision du banquier (jeux d'argent, contenus adultes,
  crypto-actifs, codes techniques réseau).

Ces classements reflètent les pratiques courantes d'acquisition e-commerce ; ils
relèvent de la politique de votre banque et doivent être revus avec la conformité.

## Indexation : ce qu'un code importé devient pour le moteur

C'est le point le plus sensible du produit : un code ajouté par import n'a de
valeur que s'il est effectivement proposé aux agents.

**Le rafraîchissement est automatique.** Après toute écriture, le catalogue est
relu et l'index reconstruit, puis la modification est propagée aux autres
instances par `LISTEN/NOTIFY`. Un code importé est proposable immédiatement,
sans redéploiement ni redémarrage.

**L'index est pré-calculé.** Au chargement du catalogue, chaque MCC reçoit sa
table de jetons pondérés et ses expressions. Le moteur ne retokenise plus les
280 codes à chaque frappe : le coût est passé de 11,8 ms à 4,1 ms par appel, et
il ne dépend plus de la taille du référentiel.

**Les mots-clés sont dérivés à l'import.** Le manuel Visa ne fournit aucun
lexique métier : un code importé arriverait muet. `services/motsCles.js` dérive
donc des mots-clés de son libellé et de sa description — jetons signifiants,
bigrammes du libellé, et variantes singulier/pluriel, pour que « borne de
recharge » retrouve « Bornes de recharge ». Ces mots-clés dérivés sont affichés
en lecture seule sur la fiche du code, et recalculés à chaque modification du
libellé.

**Les secteurs sont en base.** Le rattachement d'un MCC à un secteur d'activité
est passé du code source aux tables `sectors` et `mcc_sectors` : un code importé
peut donc être rattaché, depuis l'écran d'administration ou par la colonne
`Secteur` du fichier, et bénéficier du coup de pouce qui remonte les bons codes
quand l'agent déclare son secteur. Un MCC peut relever de plusieurs secteurs.

Effet mesuré sur un code importé sans aucun mot-clé métier :

| Formulation de l'agent | Avant | Après |
| --- | --- | --- |
| Mots du libellé | rang 1 | rang 1 |
| Même mot au singulier | absent | rang 2 |
| Secteur déclaré au formulaire | aucun effet | rang 3 |
| Vocabulaire du client (« patinette ») | absent | absent, puis rang 1 après saisie du lexique |

La dernière ligne est la limite honnête de l'exercice : **aucune dérivation ne
devine un synonyme absent du texte**. C'est pourquoi le rapport d'import compte
les codes arrivant sans mots-clés ni secteur et les liste explicitement — ils
seront trouvables sur les mots de leur libellé, mais pas sur le vocabulaire
spontané d'un commerçant. Renseigner la colonne `Mots-clés` du fichier, ou
compléter le code après import, reste le seul moyen d'y parvenir.

## Le moteur de proposition

`server/src/services/mccSuggestion.js` calcule un score à partir de :

- les **expressions métier complètes** trouvées dans le descriptif d'activité (poids fort) ;
- les **correspondances mot à mot** avec le libellé, les mots-clés saisis, les
  mots-clés dérivés, la description française et la définition anglaise ;
- le **secteur d'activité** déclaré, qui amorce la liste avec les codes les plus
  fréquents pour ce type de commerce ;
- le **modèle de vente** : livraison numérique, paiement récurrent, place de marché ;
- la **pertinence e-commerce** intrinsèque du code.

Le score brut est ramené sur une échelle bornée 1–99 par une courbe saturante :
aucune proposition n'affiche 100 %, et l'écart entre deux codes reste lisible. Les
termes ayant déclenché la correspondance sont renvoyés avec chaque proposition,
pour que le choix du banquier soit un arbitrage éclairé et non un acte de foi.

## API

Toutes les routes sauf `/api/health` et `/api/auth/login` exigent un jeton JWT
(`Authorization: Bearer <token>`).

| Méthode | Route | Rôle | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | — | Connexion, renvoie le jeton et le profil |
| GET | `/api/auth/me` | tous | Profil courant |
| POST | `/api/auth/password` | tous | Changement de son propre mot de passe |
| GET | `/api/mcc` | tous | Catalogue et recherche plein texte |
| GET | `/api/mcc/secteurs` | tous | Secteurs d'activité du formulaire |
| GET | `/api/mcc/:code` | tous | Fiche d'un MCC |
| POST | `/api/mcc/suggest` | tous | Propositions Visa et Mastercard pour une activité |
| GET | `/api/requests` | tous | Liste filtrable (statut, recherche, périmètre banque) |
| GET | `/api/requests/stats` | tous | Compteurs par statut |
| POST | `/api/requests` | agent | Création d'une demande |
| GET | `/api/requests/:id` | tous | Détail d'une demande |
| PUT | `/api/requests/:id` | agent | Modification (brouillon ou complément requis) |
| POST | `/api/requests/:id/submit` | agent | Soumission au banquier |
| POST | `/api/requests/:id/decision` | banquier | Validation, rejet ou demande de complément |
| GET | `/api/requests/:id/suggestions` | tous | Propositions figées à la soumission |
| GET | `/api/requests/:id/events` | tous | Journal d'audit |
| GET | `/api/admin/users` | admin | Liste des comptes |
| POST | `/api/admin/users` | admin | Création d'un compte |
| PUT | `/api/admin/users/:id` | admin | Rôle, banque, identité, activation |
| POST | `/api/admin/users/:id/password` | admin | Réinitialisation du mot de passe |
| GET | `/api/admin/banks` | admin | Banques et volumétrie |
| POST | `/api/admin/banks` | admin | Création d'une banque |
| PUT | `/api/admin/banks/:id` | admin | Raison sociale, activation |
| GET | `/api/admin/mcc` | admin | Référentiel complet, codes désactivés inclus |
| POST | `/api/admin/mcc` | admin | Ajout d'un code |
| PUT | `/api/admin/mcc/:code` | admin | Modification ou (dés)activation d'un code |
| GET | `/api/admin/mcc/:code/history` | admin | Historique d'un code |
| GET | `/api/admin/mcc/export` | admin | Référentiel courant en `.xlsx` ou `.csv` |
| POST | `/api/admin/mcc/import-fichier` | admin | Lecture d'un fichier Excel/CSV : lignes, anomalies et rapport d'écart |
| POST | `/api/admin/mcc/import` | admin | Rapport d'écart, puis application |
| GET | `/api/mcc/secteurs` | tous | Secteurs et MCC rattachés (lus en base) |
| GET | `/api/admin/events` | admin | Journal d'administration |

## Règles de sécurité appliquées

- Mots de passe hachés avec bcrypt (implémentation native, hors boucle
  d'événements) ; message d'erreur identique que le compte existe ou non, pour
  empêcher l'énumération.
- **Limitation de débit sur la connexion** : 10 tentatives par fenêtre de
  15 minutes, comptées par adresse IP *et* par compte visé, remises à zéro par
  une authentification réussie. Réglable par `LOGIN_RATE_LIMIT_MAX`. En
  déploiement multi-instances, ce compteur doit être déporté (Redis ou
  répartiteur de charge) : il vit dans le processus.
- **Les droits sont relus en base à chaque requête**, jamais déduits du jeton :
  un compte désactivé, une banque désactivée, un changement de rôle ou une
  mutation de banque prennent effet immédiatement, sans attendre l'expiration.
- **Une réinitialisation de mot de passe ferme les sessions ouvertes** : tout
  jeton émis avant le dernier changement est refusé.
- Cloisonnement par banque : une demande n'est lisible que par les utilisateurs de
  la banque émettrice (l'`ADMIN` voit tout).
- Rôles vérifiés côté serveur sur chaque route sensible, jamais uniquement dans
  l'interface.
- Validation de tous les corps de requête par zod, avec retour d'erreur champ par
  champ. **Aucune coercition permissive** : la chaîne `"false"` ne vaut pas
  `true`, une date inexistante, un montant hors capacité de colonne ou un octet
  NUL sont refusés en 400 plutôt que remontés en erreur 500.
- **Garde-fous de concurrence** : les transitions de statut sont portées par la
  clause `WHERE` de la mise à jour, et la population d'administrateurs est
  protégée par un verrou consultatif. Deux décisions, deux soumissions ou deux
  rétrogradations simultanées ne peuvent plus aboutir ensemble.
- MCC `INTERDIT` ou désactivés refusés côté API, et pas seulement masqués dans
  l'interface.
- Obligation de changer un mot de passe réinitialisé imposée par le serveur, pas
  par l'écran.
- Aucune suppression destructive : comptes, banques et codes MCC sont désactivés,
  jamais effacés, pour préserver l'intégrité des demandes déjà traitées.

## Tests

```bash
cd server
npm test      # 94 tests : authentification, référentiel, moteur, workflow,
              # habilitations, administration, robustesse, concurrence et indexation
```

Les tests utilisent la base `clicktopay_test`, rejouée à chaque exécution. Ils
couvrent notamment : le cloisonnement inter-banques, le refus des MCC interdits,
l'obligation de commentaire sur un rejet, l'immuabilité d'une demande soumise, le
cycle complément requis → re-soumission, le blocage tant qu'un mot de passe
réinitialisé n'est pas changé, la protection du dernier administrateur, l'effet
immédiat d'un changement de vigilance sur le moteur, et le fait qu'un `db:seed`
ne réécrit pas les ajustements de la conformité.

`tests/indexation.test.js` vérifie qu'un code importé est réellement proposable :
dérivation des mots-clés, variantes singulier/pluriel, rattachement à un secteur,
reconstruction de l'index au changement de libellé, et signalement des codes sans
lexique métier.

`tests/robustesse.test.js` est une suite adversariale, écrite à partir des
défauts relevés en recette : types hostiles (chaînes `"false"`, dates
impossibles, montants hors bornes, octets NUL, identifiants non numériques),
concurrence réelle (deux décisions, deux soumissions, deux rétrogradations
d'administrateurs, deux créations du même MCC en parallèle), cycle de vie des
jetons (désactivation, mutation de banque, réinitialisation) et aller-retour
Excel/CSV du référentiel.
