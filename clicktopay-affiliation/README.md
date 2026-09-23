# Plateforme d'affiliation ClickToPay

Application permettant à un **agent de banque** de saisir la demande d'affiliation
d'un client e-commerçant à la plateforme ClickToPay, et au **banquier** de valider
ou de modifier les codes MCC Visa et Mastercard proposés.

Le **banquier est l'administrateur de sa banque** : il y crée et gère les comptes
agents, y saisit et y arbitre les dossiers, et ne voit rien au-delà. Le référentiel
MCC, commun à toutes les banques, lui reste fermé — il relève du seul
administrateur de la plateforme, qui conserve tous les droits sur toutes les
banques. *(Décisions D-1 et D-3 du commanditaire, `docs/decisions-commanditaire.md`.)*

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

| Rôle | Identifiant | Mot de passe | Banque |
| --- | --- | --- | --- |
| Agent | `agent@banque.tn` | `Agent#2026` | BQ001 |
| Banquier | `banquier@banque.tn` | `Banquier#2026` | BQ001 |
| Administrateur | `admin@clicktopay.tn` | `Admin#2026` | BQ001 |
| Agent (seconde banque) | `agent2@banque.tn` | `Agent#2026` | BQ002 |

Ces comptes sont créés par `npm run db:seed` — ils sont **quatre**, le dernier
rattaché à une seconde banque, sans quoi le cloisonnement inter-banques ne serait ni
démontrable ni testable. **À supprimer avant toute mise en production**
(`seed({ withDemoUsers: false })` ne les crée pas).

## Parcours fonctionnel

1. **L'agent saisit la demande** en cinq étapes : site marchand, société (RNE,
   matricule fiscal, forme juridique), contact et adresse physique, activité, puis
   codes MCC. Le banquier de la banque peut saisir et reprendre les mêmes dossiers.
2. **La plateforme propose les MCC** au fil de la saisie, classés par pertinence.
   Chaque proposition affiche son libellé et sa **description en français**, la
   définition officielle Visa, un score de pertinence et les termes de la demande
   qui ont déclenché la correspondance.
3. **L'agent retient un code par réseau** (Visa et Mastercard, indépendamment s'il
   le souhaite), justifie son choix, puis soumet la demande.
4. **Le banquier arbitre** : il valide les codes proposés, les remplace par
   d'autres, rejette la demande ou la renvoie à l'agent pour complément. Les
   propositions du moteur restent affichées à côté de sa décision. Il arbitre
   **tous** les dossiers de sa banque, y compris ceux qu'il a saisis lui-même :
   le contrôle à quatre yeux n'est plus imposé par la plateforme, seulement
   tracé par le journal (décision D-3, dans le prolongement de D-1).
5. **Tout est tracé** : chaque étape alimente un journal nominatif et horodaté, et
   le code initialement proposé par l'agent reste visible à côté du code retenu.
   Une modification de dossier y porte les valeurs **avant et après**, le RIB
   masqué — le contrôle à quatre yeux n'étant plus imposé, la trace est ce qui
   permet d'en rendre compte.

Statuts : `BROUILLON` → `SOUMISE` → `VALIDEE` | `REJETEE` | `COMPLEMENT_REQUIS`
(qui redevient modifiable puis re-soumissible).

## Administration

L'espace d'administration (`/administration`) est ouvert à deux profils, et il ne
leur montre pas la même chose :

| | `ADMIN` | `BANQUIER` |
| --- | --- | --- |
| Onglets | les cinq | trois : **Comptes**, **Banques**, **Journal** |
| Comptes | toutes banques, tous rôles | les comptes de **sa** banque ; il n'en crée et n'en modifie que des **agents** |
| Banques | création, modification, activation | consultation et correction de **sa** fiche ; ni création, ni activation |
| Référentiel MCC et import | oui | **non** — il est commun à toutes les banques |
| Journal | toutes banques, référentiel compris | les actions **concernant sa banque**, quel qu'en soit l'auteur — y compris celles d'un administrateur ; le référentiel MCC, commun, n'y figure pas |

Le corps d'une requête ne décide pas du périmètre : la banque de l'appelant écrase
celle qu'annonce la requête, et aucune modification ne peut faire sortir un compte
du périmètre de celui qui l'administre. Toutes ces bornes sont posées côté serveur
(`services/admin.js`, `perimetreAdministration()`), l'écran ne faisant que les
suivre.

### Comptes et banques

- Création de comptes avec rôle (`AGENT`, `BANQUIER`, `ADMIN`) et rattachement à
  une banque ; modification du rôle, de la banque et de l'identité. Pour un
  banquier, le rôle est figé sur `AGENT` et la banque sur la sienne : il ne peut
  ni s'attribuer des pairs, ni déplacer un compte hors de sa banque.
- Activation et désactivation : un compte désactivé ne peut plus se connecter.
- Réinitialisation du mot de passe par l'administrateur — ou par le banquier, sur
  les agents de sa banque. Le compte doit alors en
  définir un nouveau à la connexion suivante : **le serveur refuse toutes les
  autres routes** tant que ce n'est pas fait, l'écran n'est pas la seule barrière.
- Changement de mot de passe par l'utilisateur lui-même, l'ancien étant exigé.
- Politique : 10 caractères minimum, une minuscule, une majuscule et un chiffre.
- Gestion des banques affiliées (code, raison sociale, activation), avec le
  nombre de comptes et de demandes rattachés.

Deux garde-fous empêchent de verrouiller la plateforme : un administrateur ne
peut ni modifier son propre rôle ni se désactiver, et la plateforme refuse de
perdre son dernier administrateur actif. Une banque comptant encore des comptes
actifs ne peut pas être désactivée, et un banquier ne peut pas désactiver la
sienne — se couper l'accès à soi-même rendrait la banque inadministrable de
l'intérieur.

Toutes ces actions alimentent le journal d'administration (onglet **Journal**).

### Référentiel MCC

**Réservé à l'administrateur.** Le référentiel est commun à toutes les banques :
un banquier qui désactiverait un code le retirerait à ses concurrents. Son
administration, son import et son historique restent donc hors de portée du
profil `BANQUIER`, qui reçoit un 403 sur chacune de ces routes.

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

L'application a fait l'objet d'une campagne de recette structurée, menée par huit
agents sur quatre vagues. Tous les livrables sont dans `docs/` :

| Fichier | Contenu |
| --- | --- |
| `plan-de-tests.md` | 149 cas de test : préconditions, étapes, résultat attendu vérifiable, critère d'acceptation binaire, et 10 jeux de données avec les MCC attendus et leurs scores exacts |
| `revue-de-code.md` | 26 constats de revue, ancrés fichier et ligne |
| `resultats-vague2-front.md` / `-back.md` | Exécution des cas, filière interface et filière API |
| `resultats-vague3-front.md` / `-back.md` | Retest après correction, et recherche de régressions |
| `recette-coordination.md` | Protocole d'isolation entre agents : un port et une base par intervenant |
| `recette-tableau-de-bord.md` | Tableau de bord partagé et conventions de nommage |
| `verifier-environnement.sh` | Contrôle de l'environnement de recette en une commande |
| `rapport-recette.md` | Rapport de recette consolidé : défauts, critères d'acceptation, avis d'aptitude |
| `decisions-commanditaire.md` | Arbitrages du commanditaire (D-1, D-2, D-3) — ce document fait foi sur les points qu'il tranche |
| `journal-lot1.md` | Journal du lot 1 d'évolutions (EVO-01 à EVO-12) |
| `non-regression-lot1.md` | Non-régression après le lot 1 : ce qui a été rejoué, et ce qui a bougé |
| `journal-documentation.md` | Remise en cohérence du dossier avec le produit : ce qui a été corrigé, pourquoi, comment c'est vérifié, et ce qui reste à arbitrer |

### Ce que la campagne a corrigé

Les défauts les plus structurants tenaient moins à la logique métier qu'à ce qui
l'entoure :

- **la configuration ne validait rien** : `required(nom, repli)` ne pouvait pas
  lever, un repli étant toujours fourni. Une API démarrée en production sans
  `JWT_SECRET` tournait avec le secret de développement publié dans le dépôt ;
- **le cache du référentiel pouvait figer l'application** : une panne passagère
  laissait une promesse rejetée que rien ne remplaçait, et le contrôle de santé
  répondait « ok » pendant que toutes les routes échouaient ;
- **le moteur proposait des codes sans justification** : le bonus de pertinence
  e-commerce s'appliquant sans aucune correspondance, six codes remontaient avec
  une liste de termes justificatifs vide, et le filet de sécurité était
  inatteignable ;
- **la péremption des jetons comparait deux horloges** (Node et PostgreSQL) avec
  une précision à la seconde ; le jeton porte désormais l'empreinte du mot de
  passe sous lequel il a été émis ;
- **le journal d'audit pouvait mentir sur l'ordre des faits** : `now()` renvoie
  l'heure de début de transaction, pas celle de l'écriture.

### Points ouverts, à trancher avec la conformité

- **Le cumul de la saisie et de l'arbitrage est tranché, et assumé.** Le profil
  `ADMIN` peut saisir une demande, la soumettre et l'arbitrer seul, sur toutes les
  banques (décision D-1) ; depuis la décision D-3, le **banquier** le peut aussi
  sur sa propre banque — donc sur des volumes autrement plus importants. Le
  contrôle à quatre yeux n'est plus exigé par la plateforme : il reste
  **traçable a posteriori** (le journal conserve qui a saisi, qui a soumis et qui
  a décidé, avec l'horodatage), mais il n'est plus empêché a priori. La maîtrise
  du risque repose donc sur l'attribution des comptes et sur la relecture du
  journal. Le point n'est plus ouvert : il est arbitré.
- **Le garde-fou du dernier administrateur n'est atteignable qu'en concurrence** :
  séquentiellement, c'est la règle « on ne modifie pas son propre compte » qui
  protège la plateforme. Assouplir cette règle rouvrirait le risque.
- **La limitation de débit vit dans le processus** : en déploiement
  multi-instances, elle doit être déportée (Redis ou répartiteur de charge).
- **Le cache du référentiel est propagé par `LISTEN/NOTIFY`** : une notification
  perdue pendant le redémarrage d'une instance laisserait un cache périmé
  jusqu'au changement suivant.
- **La lecture des dossiers entre agents d'une même banque reste ouverte** : un
  agent voit les dossiers de ses collègues, même s'il ne peut pas les modifier.
  La décision D-3 dit qu'un agent ne « gère » pas les dossiers des autres ; en
  l'absence de précision sur la lecture, le comportement actuel est conservé.

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

**Aucune proposition sans terme justificatif.** Un code que le banquier ne peut
rattacher à aucun mot de la demande n'a pas sa place dans la liste : un score tiré
du seul bonus de pertinence e-commerce, sans la moindre correspondance, ne remonte
plus rien. `limit` est donc un **plafond et non une consigne de remplissage** — une
activité peu bavarde rend moins de propositions qu'une autre, et c'est le résultat
attendu. Quand il n'en reste aucune, le filet de sécurité joue : le code de repli
`5999` est servi seul, avec la mention explicite *aucune correspondance : code de
repli*. Les valeurs de référence, jeu par jeu, sont au § 4.3 de
`docs/plan-de-tests.md` — elles supposent un référentiel d'amorçage intact.

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
| POST | `/api/requests` | agent, banquier | Création d'une demande |
| GET | `/api/requests/:id` | tous | Détail d'une demande |
| PUT | `/api/requests/:id` | agent, banquier | Modification (brouillon ou complément requis) |
| POST | `/api/requests/:id/submit` | agent, banquier | Soumission au banquier |
| POST | `/api/requests/:id/decision` | banquier | Validation, rejet ou demande de complément |
| GET | `/api/requests/:id/suggestions` | tous | Propositions figées à la soumission |
| GET | `/api/requests/:id/events` | tous | Journal d'audit |
| GET | `/api/admin/users` | admin, banquier | Liste des comptes (le banquier : sa banque) |
| POST | `/api/admin/users` | admin, banquier | Création d'un compte (le banquier : un agent, dans sa banque) |
| PUT | `/api/admin/users/:id` | admin, banquier | Rôle, banque, identité, activation (le banquier : ni promotion, ni changement de banque) |
| POST | `/api/admin/users/:id/password` | admin, banquier | Réinitialisation du mot de passe |
| GET | `/api/admin/banks` | admin, banquier | Banques et volumétrie (le banquier : la sienne) |
| POST | `/api/admin/banks` | admin | Création d'une banque (administrateur seul) |
| PUT | `/api/admin/banks/:id` | admin, banquier | Raison sociale, activation (le banquier : sa fiche, hors activation) |
| GET | `/api/admin/mcc` | admin | Référentiel complet, codes désactivés inclus |
| POST | `/api/admin/mcc` | admin | Ajout d'un code |
| PUT | `/api/admin/mcc/:code` | admin | Modification ou (dés)activation d'un code |
| GET | `/api/admin/mcc/:code/history` | admin | Historique d'un code |
| GET | `/api/admin/mcc/export` | admin | Référentiel courant en `.xlsx` ou `.csv` |
| POST | `/api/admin/mcc/import-fichier` | admin | Lecture d'un fichier Excel/CSV : lignes, anomalies et rapport d'écart |
| POST | `/api/admin/mcc/import` | admin | Rapport d'écart, puis application |
| GET | `/api/mcc/secteurs` | tous | Secteurs et MCC rattachés (lus en base) |
| GET | `/api/admin/events` | admin, banquier | Journal d'administration (le banquier : filtré sur sa banque) |

Les routes `/api/admin/mcc*` sont les seules de l'espace d'administration à rester
strictement réservées à l'administrateur, référentiel commun oblige.

## Règles de sécurité appliquées

- Mots de passe hachés avec bcrypt (implémentation native, hors boucle
  d'événements) ; message d'erreur identique que le compte existe ou non, pour
  empêcher l'énumération.
- **Limitation de débit sur la connexion** : 10 tentatives par fenêtre de
  15 minutes, comptées par adresse IP *et* par compte visé, remises à zéro par
  une authentification réussie. Le compteur est incrémenté **avant** la
  validation du corps : un balayage d'adresses mal formées consomme le quota au
  même titre qu'une tentative recevable. Réglable par `LOGIN_RATE_LIMIT_MAX`. En
  déploiement multi-instances, ce compteur doit être déporté (Redis ou
  répartiteur de charge) : il vit dans le processus.
- **Les droits sont relus en base à chaque requête**, jamais déduits du jeton :
  un compte désactivé, une banque désactivée, un changement de rôle ou une
  mutation de banque prennent effet immédiatement, sans attendre l'expiration.
- **Une réinitialisation de mot de passe ferme les sessions ouvertes** : tout
  jeton émis avant le dernier changement est refusé.
- Cloisonnement par banque : une demande n'est lisible que par les utilisateurs de
  la banque émettrice (l'`ADMIN` voit tout). **Le refus est un 404, pas un 403**, et
  il est rigoureusement identique à celui d'un objet inexistant — dossiers comme
  comptes. Un 403 disait « cet identifiant existe, mais il n'est pas à vous » :
  balayer les identifiants suffisait alors à dénombrer les dossiers et le personnel
  d'une banque concurrente, ce qui est en soi une information commerciale, même sans
  accès au contenu.
- **Le journal d'administration est partitionné sur la banque concernée par
  l'action**, figée au moment de l'écriture — et non sur la banque actuelle de son
  auteur, qui change. Un compte muté d'une banque à l'autre n'emporte donc pas son
  historique avec lui, et une action d'un administrateur sur un compte reste visible
  de la banque de ce compte. Le référentiel MCC, commun à toutes les banques, est de
  portée plateforme et n'apparaît dans le journal d'aucune banque.
- **Les modifications d'un dossier sont tracées avec leurs valeurs avant et après**,
  et pas seulement par les noms des champs touchés. Depuis que la même personne peut
  saisir puis arbitrer un dossier (décisions D-1 et D-3), la trace est le seul
  contrôle qui subsiste : savoir qu'un RIB a changé sans savoir en quoi ne permet de
  rendre compte de rien. Le RIB y est masqué, quatre derniers caractères apparents.
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
npm test      # 166 tests : authentification, référentiel, moteur, workflow,
              # habilitations, administration, import, limitation de débit,
              # robustesse, concurrence et indexation
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

`tests/habilitations.test.js` éprouve la décision D-3 par ses **bornes** plutôt que
par ses permissions : une habilitation élargie se prouve par ce qu'elle refuse
encore. Le banquier y administre sa banque, y saisit et y arbitre — mais ne crée
ni banquier ni administrateur, ne promeut pas ses agents, ne déplace aucun compte,
ne touche ni au référentiel MCC, ni à une autre banque, ni à la sienne pour la
désactiver. Deux cas y portent le **journal** : les actions faites sur une autre
banque et celles faites sur le référentiel commun n'entrent pas dans le sien,
celles qu'un administrateur fait sur un compte de sa banque y entrent, et muter un
compte d'une banque à l'autre ne déplace pas son historique. Ils remplacent un cas
qui n'assertait que le type de la réponse et survivait au retrait du filtre.

`tests/import.test.js` porte les invariants de l'import : une simulation n'écrit
rien (base photographiée avant et après), rien n'est appliqué sans `apply: true`,
la désactivation des absents reste optionnelle et ne supprime jamais, les anomalies
portent leur numéro de ligne, et un code réintroduit par le fichier est remis en
service.

`tests/limitation.test.js` exerce la limitation de débit sur la route réelle, avec
un quota réaliste : un corps invalide est compté, une connexion réussie remet le
compteur à zéro, et au-delà du quota c'est un 429 avec `Retry-After` — connexion
valide comprise.

`tests/robustesse.test.js` est une suite adversariale, écrite à partir des
défauts réellement relevés en recette — chaque correctif y a son test de
non-régression : types hostiles (chaînes `"false"`, dates
impossibles, montants hors bornes, octets NUL, identifiants non numériques),
concurrence réelle (deux décisions, deux soumissions, deux rétrogradations
d'administrateurs, deux créations du même MCC en parallèle), cycle de vie des
jetons (désactivation, mutation de banque, réinitialisation) et aller-retour
Excel/CSV du référentiel.
