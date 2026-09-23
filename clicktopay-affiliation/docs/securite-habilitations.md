# Revue de sécurité — modèle d'habilitation élargi (D-1, D-3)

Agent sécurité. Objet : éprouver, par des requêtes réelles, le cloisonnement
entre banques après l'ouverture de l'administration au banquier (D-3) et le
maintien de tous les droits à l'administrateur (D-1). Le code a servi à choisir
quoi essayer ; les constats ci-dessous ne reposent que sur des requêtes
**exécutées** contre une instance vive.

## Banc d'essai

Base et API montées à part, sans toucher aux ports 4000 / 4100 / 5173 des autres
agents.

- Base : `clicktopay_sec` (créée via le superutilisateur `postgres`, le rôle
  `clicktopay` n'ayant pas `CREATEDB` sur cette instance — signalé), schéma et
  amorçage par `node src/db/seed.js`.
- API : `PORT=4200 DATABASE_URL=postgres://clicktopay:clicktopay@127.0.0.1:5432/clicktopay_sec LOGIN_RATE_LIMIT_MAX=5000 node src/index.js`
- PostgreSQL était déjà en écoute (aucun `pg_ctlcluster` nécessaire).

**Deux banques réellement peuplées :**

| Banque | id | Comptes (id) |
| --- | --- | --- |
| BQ001 (banque A) | 1 | agentA `agent@banque.tn` (1), banquierA `banquier@banque.tn` (2) |
| BQ002 (banque B) | 2 | agentB `agent2@banque.tn` (3), banquierB `banquierB@banque.tn` (5), agentB2 `agentB2@banque.tn` (6) |
| — | — | admin `admin@clicktopay.tn` (4), rattaché à la banque 1 |

Dossiers : `reqA` (id 1, banque A, saisi par agentA), `reqB` (id 2, banque B,
saisi par agentB). Le banquier B et l'agent B2 ont été créés puis ont changé leur
mot de passe imposé avant usage.

**Préambule rejouable** — chaque commande de ce rapport suppose ces jetons :

```bash
B=http://127.0.0.1:4200
jeton(){ curl -s $B/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq -r .token; }
ADMIN=$(jeton admin@clicktopay.tn 'Admin#2026')
BQA=$(jeton banquier@banque.tn 'Banquier#2026')      # banquier banque A
BQB=$(jeton banquierB@banque.tn 'BanquierB#2027')    # banquier banque B
AGB=$(jeton agent2@banque.tn 'Agent#2026')           # agent banque B
```

## Décompte

**Plus de 90 requêtes rejouables**, réparties sur 14 familles : lectures et
écritures inter-banques par identifiant, énumération 403/404, référentiel MCC,
création/désactivation de banques, création de comptes hors rôle/banque,
modification hors périmètre, auto-escalade, filtres de liste forcés, cloisonnement
du journal, cycle de vie et forge du jeton, fuzzing de validation, courses
concurrentes, limites du rôle agent.

- **Bornes franchies : 0.** Les quatre bornes (MCC, création de banques,
  création d'agents avec écrasement de banque, modification sans sortie de
  périmètre) ont toutes tenu.
- **Failles avérées : 3** — une mineure (énumération), deux moyennes portant sur
  le **journal**, donc sur le seul contrôle compensatoire que D-1 conserve.

---

## Failles avérées

### SEC-01 — Énumération inter-banques par distinction 403 / 404 — gravité mineure

**Requête (exécutée) :**
```bash
# Un dossier qui existe mais appartient à une autre banque -> 403 au message distinct
curl -s -o /dev/null -w "%{http_code}\n" $B/api/requests/1 -H "Authorization: Bearer $BQB"
#   403  {"error":"Cette demande appartient à une autre banque."}
# Un identifiant qui n'existe pas -> 404
curl -s -o /dev/null -w "%{http_code}\n" $B/api/requests/999 -H "Authorization: Bearer $BQB"
#   404  {"error":"Demande 999 introuvable"}
# Idem sur les comptes
curl -s $B/api/admin/users/1 -H "Authorization: Bearer $BQB"    # 403 "Ce compte appartient à une autre banque."
curl -s $B/api/admin/users/999 -H "Authorization: Bearer $BQB"  # 404 "Utilisateur 999 introuvable"
```

**Ce qui devrait se produire :** une ressource hors périmètre devrait être
indistinguable d'une ressource inexistante (même code, même message).

**Ce qui se produit :** un objet **existant** dans une autre banque répond `403`
avec un message explicite (« appartient à une autre banque »), un objet
**inexistant** répond `404` « introuvable ». La différence est stable et vérifiée
sur `/api/requests/:id`, `/api/requests/:id/events`, `/api/requests/:id/suggestions`
et `/api/admin/users/:id`. Elle joue pour le banquier sur les comptes et les
dossiers, et pour l'agent sur les dossiers (l'agent est arrêté plus tôt sur les
routes de comptes, réservées aux profils ADMIN/BANQUIER).

**Impact métier :** un banquier de la banque B peut, en balayant les
identifiants, dénombrer les dossiers et les comptes existants de toute la
plateforme et savoir lesquels appartiennent à une autre banque, sans jamais en
lire le contenu. Fuite d'existence, sans fuite de contenu.

### SEC-02 — Le journal d'administration fuit ou efface des lignes lors d'une mutation de compte — gravité moyenne

Le filtre de banque du journal (`listAdminEvents`) retient les lignes dont
**l'auteur appartient aujourd'hui** à la banque de l'appelant
(`e.user_id IN (SELECT id FROM users WHERE bank_id = $banque)`). Il ne regarde pas
la banque **sur laquelle portait l'action**. Déplacer un compte d'une banque à une
autre fait donc franchir la cloison à tout son historique.

**Requête (exécutée) :**
```bash
# 1. Avant : le banquier B voit les actions de son agent B2 (ex. son changement de mot de passe)
curl -s "$B/api/admin/events?limit=500" -H "Authorization: Bearer $BQB" \
  | jq '[.items[]|select(.userName=="Bea AgentB2")]|length'          # -> 1

# 2. L'administrateur mute l'agent B2 (id 6) de la banque 2 vers la banque 1
curl -s $B/api/admin/users/6 -X PUT -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"bankId":1}'              # 200, bankId:1

# 3. Après : le banquier A (banque 1) voit maintenant une action commise dans la banque 2
curl -s "$B/api/admin/events?limit=500" -H "Authorization: Bearer $BQA" \
  | jq '[.items[]|select(.userName=="Bea AgentB2")|{entity,action}]'
#   [{"entity":"USER","action":"CHANGEMENT_MOT_DE_PASSE"}]   <- action faite quand il était en banque 2
# 4. …et le banquier B ne la voit plus
curl -s "$B/api/admin/events?limit=500" -H "Authorization: Bearer $BQB" \
  | jq '[.items[]|select(.userName=="Bea AgentB2")]|length'          # -> 0
```

**Ce qui devrait se produire :** une ligne de journal appartient à la banque où
l'action a eu lieu ; une mutation ultérieure du compte ne devrait ni la révéler à
une autre banque, ni la soustraire à la banque d'origine.

**Ce qui se produit :** la ligne suit le compte. Le banquier de la banque
d'accueil lit une action réalisée entièrement dans une autre banque
(« un banquier ne voit pas les actions faites sur les autres banques » est mis en
défaut), et la banque d'origine perd cette ligne de sa piste d'audit.

**Portée honnête :** le déclencheur — muter un compte entre banques — est réservé
à l'administrateur ; le banquier ne peut pas le provoquer lui-même, il en
bénéficie passivement. Cela n'ouvre pas d'accès aux dossiers (les
`request_events` sont cloisonnés par la banque du dossier, qui ne bouge jamais),
mais cela rend le journal d'administration non stable : sa partition dépend d'un
état vivant (`bank_id`) et non de l'événement.

**Impact métier :** après qu'un compte a changé de banque, un banquier peut lire
dans son journal des lignes décrivant des actions survenues dans une autre banque,
et la banque d'origine ne peut plus rendre compte de ces mêmes actions.

### SEC-03 — La modification d'un dossier n'est journalisée que par nom de champ, sans valeurs avant/après — gravité moyenne

D-1 énonce que la maîtrise du risque repose sur un journal qui conserve
« qui, quoi, quand, et depuis le lot 1 les valeurs avant et après ». C'est vrai
des modifications de **comptes** (`updateUser` trace `{avant, apres}`). Ce ne
l'est pas des modifications de **dossiers**.

**Requête (exécutée)** — un banquier saisit, modifie, soumet puis arbitre
lui-même son dossier (cumul assumé par D-1) :
```bash
RID=$(curl -s $B/api/requests -H "Authorization: Bearer $BQB" -H 'Content-Type: application/json' \
 -d '{"siteName":"CumulTest","siteUrl":"https://cumul.tn","companyName":"Cumul SA","rne":"CUM123456","contactFirstName":"C","contactLastName":"U","contactEmail":"c@u.tn","contactPhone":"+21620000009","addressLine1":"1 rue","city":"Tunis","activityDescription":"vente en ligne de produits electroniques test cumul","proposedVisaMcc":"5651","proposedMastercardMcc":"5651"}' | jq -r .id)
# modification d'un champ métier sensible (raison sociale, MCC proposé)
curl -s $B/api/requests/$RID -X PUT -H "Authorization: Bearer $BQB" -H 'Content-Type: application/json' \
 -d '{"proposedVisaMcc":"5691","companyName":"Cumul SA MODIFIEE"}' >/dev/null
curl -s $B/api/requests/$RID/events -H "Authorization: Bearer $BQB" \
 | jq -c '.[]|select(.type=="MODIFICATION")|.payload'
#   {"champs":["companyName","proposedVisaMcc"]}
```

**Ce qui devrait se produire :** pour tenir la promesse de D-1, la ligne de
modification devrait porter l'ancienne et la nouvelle valeur de chaque champ
touché, comme le fait déjà le journal des comptes.

**Ce qui se produit :** la ligne ne porte que la **liste des noms** de champs
modifiés. On sait que `companyName` et `proposedVisaMcc` ont changé, jamais de
quelle valeur vers quelle valeur.

**Atténuation :** les valeurs qui portent la décision — MCC proposés et MCC
retenus — sont bien capturées, elles, dans les événements `SOUMISSION` et
`VALIDATION_AVEC_MODIFICATION` (proposés vs retenus). L'arbitrage lui-même reste
donc reconstituable. Le trou porte sur les autres champs (raison sociale,
adresse, contact, **RIB / titulaire du compte**, volumétrie).

**Impact métier :** un banquier qui saisit puis valide lui-même un dossier peut en
changer le RIB ou la raison sociale sans que le journal conserve la valeur
d'origine — seul le fait qu'« un champ a changé » subsiste, ce qui prive le
contrôle interne du second regard que D-1 remplace précisément par le journal.

---

## Ce qui a tenu — bornes et défenses vérifiées

Chaque ligne ci-dessous a été **attaquée** et a répondu par un refus.

**Borne 1 — Référentiel MCC réservé à l'administrateur.** Le banquier B est
refusé (`403 "Action réservée aux profils : ADMIN"`) sur `GET /api/admin/mcc`,
`GET /api/admin/mcc/:code`, `GET /api/admin/mcc/:code/history`,
`GET /api/admin/mcc/export`, `POST /api/admin/mcc`, `PUT /api/admin/mcc/:code`,
`POST /api/admin/mcc/import`, `POST /api/admin/mcc/import-fichier`. (La route
opérationnelle `/api/mcc`, lecture du catalogue des codes actifs, reste ouverte à
tous : c'est la sélection nécessaire à la saisie, non l'administration du
référentiel.)

**Borne 2 — Création/désactivation de banques.** `POST /api/admin/banks` → 403 ;
`PUT /api/admin/banks/1` (autre banque) → 403 « Vous ne gérez que votre propre
banque » ; `PUT /api/admin/banks/2 {"active":false}` (sa banque) → 403 « Seul un
administrateur peut activer ou désactiver une banque ». Le banquier peut
uniquement renommer sa propre banque (`PUT /api/admin/banks/2 {"name":...}` → 200),
ce qui est autorisé.

**Borne 3 — Création d'agents seulement, dans sa banque.** `POST /api/admin/users`
avec `role:"BANQUIER"` ou `role:"ADMIN"` → 403. Avec `role:"AGENT","bankId":1`
(banque A dans le corps) → 201 mais le compte est créé en **banque 2** : la banque
de l'appelant écrase celle du corps (vérifié par relecture, `bankId:2`).

**Borne 4 — Une modification ne fait pas sortir du périmètre.** Sur l'agent B2
(banque 2) : `{"role":"BANQUIER"}` → 403, `{"role":"ADMIN"}` → 403,
`{"bankId":1}` → 403, `{"bankId":1,"role":"BANQUIER"}` → 403. Le banquier ne peut
pas non plus s'éditer lui-même (compte de rôle BANQUIER, hors de son périmètre
« agents ») : `PUT /api/admin/users/5 {"role":"ADMIN"}` → 403, même
`{"firstName":...}` sur soi → 403.

**Accès direct inter-banques (toutes routes).** Banquier B et agent B contre les
objets de la banque A : `GET/PUT /api/requests/1`, `/1/events`, `/1/suggestions`,
`/1/submit`, `/1/decision`, `GET/PUT /api/admin/users/1`, `/1/password` — **tous
403**. Aucun objet d'une autre banque n'a été lu ni modifié.

**Filtres de liste.** `GET /api/admin/users?bankId=1` par le banquier B ne remonte
que des comptes de banque 2 ; `?role=ADMIN` remonte 0 (l'admin est en banque 1) ;
`GET /api/admin/banks` ne montre que la sienne ; `GET /api/requests` et
`/api/requests/stats` restent bornés à la banque 2. Le filtre n'est pas
contournable par paramètre : il est posé côté serveur, en AND.

**Cloisonnement et auteur du journal (hors SEC-02).** Le banquier B ne voit que
les lignes de sa banque ; chaque action d'un banquier est tracée avec son auteur
et son rôle (`CREATION`, `MODIFICATION`, `SOUMISSION`,
`VALIDATION_AVEC_MODIFICATION` toutes attribuées à « Bruno BanqueB / BANQUIER »),
y compris quand un même banquier saisit **et** arbitre — le cumul D-1/D-3 est
intégralement imputable.

**Cycle de vie du jeton.** Après promotion AGENT→BANQUIER par l'admin, l'ancien
jeton gagne aussitôt les droits (rôle relu en base — comportement voulu). Après
désactivation : ancien jeton → `401 Compte désactivé`. Après réinitialisation du
mot de passe : ancien jeton → `401 Mot de passe modifié`. Aucun jeton ne survit à
la révocation ou au changement de mot de passe.

**Courses concurrentes.** 10 soumissions simultanées du même dossier : un seul
`200`, neuf `409`, un seul événement `SOUMISSION`. 10 arbitrages simultanés : un
seul `200`, neuf `409`, une seule décision. Les gardes SQL (`UPDATE … WHERE
status IN (…)`) et le verrou consultatif du dernier administrateur tiennent.

**Limites du rôle agent.** L'agent ne peut pas arbitrer (`POST /1/decision` →
403 « réservée aux profils BANQUIER ») ni modifier le dossier d'un collègue de sa
propre banque (403). Il peut en revanche **lire** les dossiers de ses collègues
(200) — comportement explicitement retenu par D-3 (« visibilité ouverte »), donc
attendu, non un défaut.

---

## Pistes non concluantes

Tentées sans succès — leur valeur est de dire ce qui a été essayé.

- **Forge de jeton.** Un jeton forgé avec le **secret de développement**
  (publié dans le dépôt) est accepté et confère les droits ADMIN, mais uniquement
  parce que le banc tourne en mode développement : `config.js` refuse de démarrer
  en production avec ce secret ou un secret de moins de 32 caractères. Un jeton
  signé d'un **mauvais secret** → 401, et `alg:"none"` → 401. La forge n'est donc
  pas une faille du modèle d'habilitation, mais une exigence de déploiement, déjà
  verrouillée pour la production. Le rôle et la banque inscrits dans un jeton sont
  d'ailleurs ignorés (relus en base à chaque appel) : un jeton forgé
  `role:"AGENT",bankId:999` sur l'identifiant d'un admin agit tout de même en ADMIN
  banque 1.
- **Type confusion sur `bankId`.** `bankId:[1]` passe la validation
  (`Number([1])===1`) mais l'écrasement de banque du banquier neutralise l'effet
  (compte créé en banque 2) ; pour l'administrateur, fixer une banque n'est pas un
  franchissement. `bankId:[2]` ou `"2"` en modification se ramènent au numéro 2 et
  restent dans le périmètre. `role` en tableau/objet/`null`, `bankId:null` →
  rejetés en 400.
- **Auto-escalade en plusieurs temps.** Créer un agent puis le promouvoir
  banquier : la promotion est refusée. Se faire promouvoir par un pair : aucun
  pair ne peut être créé (création limitée aux agents). Aucun chemin, direct ou
  détourné, ne fait naître un second banquier ou un administrateur depuis un
  banquier.
- **Bornes d'identifiant.** `-1`, `0`, `99999999999`, `abc`, `1.5` → 400 propre.
  `2e3` est lu comme 2000 et `1%20` comme 1 (tolérance de `Number()`), mais ces
  identifiants restent soumis aux mêmes contrôles de périmètre : aucune fuite,
  simple curiosité de parsing.
- **Caractères de contrôle et chaînes longues.** Octet NUL → 400 « Caractères de
  contrôle non autorisés » ; `siteName` de 5000 caractères → 400 « 160 caractères
  au maximum ». Rien n'atteint PostgreSQL en 500.
- **Course TOCTOU sur la modification de compte / de dossier.** Les écritures
  portent leur garde dans la clause `WHERE` (statut, ou verrou consultatif sur la
  population d'administrateurs) ; aucune fenêtre exploitée.

---

## Avis sur la solidité du cloisonnement

Le cloisonnement inter-banques est **solide sur l'axe des accès**. Les quatre
bornes de D-3 tiennent, y compris sous requêtes forgées, type confusion, courses
et rejeu de jeton. La règle de périmètre est écrite une seule fois
(`perimetreAdministration`) et toutes les routes de comptes s'y ramènent ; les
filtres de liste et les contrôles d'objet sont posés côté serveur, jamais
délégués à l'affichage. Aucune requête n'a permis de lire ou d'écrire un objet
d'une autre banque, ni de fabriquer un banquier ou un administrateur, ni de
toucher au référentiel commun.

La réserve porte sur le **journal**, précisément là où D-1 place toute la maîtrise
du risque une fois la séparation des tâches abandonnée. Deux points l'affaiblissent :
sa partition par banque est calculée sur la banque **vivante** de l'auteur, si
bien qu'une mutation de compte fait franchir la cloison à un historique (SEC-02) ;
et la modification d'un dossier n'y consigne que les **noms** des champs changés,
pas leurs valeurs (SEC-03), contredisant la garantie « avant/après » sur laquelle
D-1 s'appuie. Aucun des deux n'ouvre l'accès aux données d'une autre banque, mais
tous deux entament la capacité du journal à rendre compte a posteriori — le seul
contrôle qui reste. À traiter avant mise en service, l'entorse au contrôle à
quatre yeux étant assumée à la seule condition que la trace soit entière.

SEC-01 est mineure : fuite d'existence, jamais de contenu.

## Nettoyage

Base `clicktopay_sec` supprimée et API du port 4200 arrêtée en fin de revue.
Aucun fichier du projet modifié hormis ce livrable.
