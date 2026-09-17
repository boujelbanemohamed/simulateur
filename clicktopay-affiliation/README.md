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

Pour mettre à jour le référentiel après une nouvelle édition du manuel : relancer
les deux scripts Python, compléter `mcc-fr.json` pour les codes ajoutés, puis
`npm run build:mcc && npm run db:seed`.

> Le *Quick Reference Booklet* de Mastercard n'a pas pu être téléchargé depuis
> l'environnement de développement (le CDN Mastercard renvoie un 403). Les codes
> sont identiques puisque normalisés ISO 18245 ; si vous souhaitez afficher en
> plus les libellés propres à Mastercard, ajoutez-les dans `mcc-fr.json` sous une
> clé dédiée et exposez-la dans `scripts/build-mcc-catalog.js`.

### Niveaux de risque

Chaque MCC porte un niveau de vigilance, **paramétrable dans `mcc-fr.json`** :

- `STANDARD` — aucune restriction ;
- `SENSIBLE` — affiché avec un bandeau « Vigilance renforcée » (pharmacie, jeux
  d'argent adjacents, transfert d'argent, bijouterie, télémarketing…) ;
- `INTERDIT` — jamais proposé et refusé par l'API, aussi bien à la saisie de
  l'agent qu'à la décision du banquier (jeux d'argent, contenus adultes,
  crypto-actifs, codes techniques réseau).

Ces classements reflètent les pratiques courantes d'acquisition e-commerce ; ils
relèvent de la politique de votre banque et doivent être revus avec la conformité.

## Le moteur de proposition

`server/src/services/mccSuggestion.js` calcule un score à partir de :

- les **expressions métier complètes** trouvées dans le descriptif d'activité (poids fort) ;
- les **correspondances mot à mot** avec le libellé, les mots-clés, la description
  française et la définition anglaise du MCC ;
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

## Règles de sécurité appliquées

- Mots de passe hachés avec bcrypt ; message d'erreur identique que le compte
  existe ou non, pour empêcher l'énumération.
- Cloisonnement par banque : une demande n'est lisible que par les utilisateurs de
  la banque émettrice (l'`ADMIN` voit tout).
- Rôles vérifiés côté serveur sur chaque route sensible, jamais uniquement dans
  l'interface.
- Validation de tous les corps de requête par zod, avec retour d'erreur champ par
  champ.
- MCC `INTERDIT` refusés côté API, et pas seulement masqués dans l'interface.

## Tests

```bash
cd server
npm test      # 35 tests : authentification, référentiel, moteur, workflow, habilitations
```

Les tests utilisent la base `clicktopay_test`, rejouée à chaque exécution. Ils
couvrent notamment : le cloisonnement inter-banques, le refus des MCC interdits,
l'obligation de commentaire sur un rejet, l'immuabilité d'une demande soumise et
le cycle complément requis → re-soumission.
