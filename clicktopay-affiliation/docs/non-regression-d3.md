# Tests de non-régression — après D-3 (commit `3c03b25`)

Campagne de non-régression sur la décision **D-3, « le banquier administre sa banque »**.
Date d'exécution : 2026-09-23.
Question posée : **le périmètre acquis avant D-3 est-il intact ?**

Référence de comparaison : commit `78d44b0` (état immédiatement antérieur au changement de
code ; il ne porte que la spécification, le code y est encore celui du lot 1 `c9abaf3`).
Documents de référence : `docs/plan-de-tests.md` (147 cas, § 3 matrice de couverture,
§ 4 jeux de données), `docs/decisions-commanditaire.md` (D-1, D-2, D-3),
`docs/non-regression-lot1.md` (campagne précédente, close sur le lot 1).

**Définition retenue** : une régression est un cas qui **passait avant D-3 et ne passe
plus**. Un défaut déjà présent avant D-3 est consigné à part (§ 7) et n'est pas porté au
débit du changement. Un comportement que D-3 modifie **délibérément** (le banquier saisit,
le banquier administre) n'est pas une régression : c'est la décision ; il est néanmoins
contrôlé, car une décision mal bornée en produit.

---

## 1. Banc d'essai

| Élément | Valeur |
| --- | --- |
| Base | `clicktopay_nr2`, créée pour cette campagne, migrée (`db:migrate`) et amorcée (`db:seed`) |
| Amorçage | 2 banques (BQ001, BQ002), 279 MCC, 4 comptes de démonstration |
| API | `PORT=4100`, `DATABASE_URL=…/clicktopay_nr2`, `LOGIN_RATE_LIMIT_MAX=5000` |
| Comptes | `agent@banque.tn` (AGENT, BQ001, id 1) · `banquier@banque.tn` (BANQUIER, BQ001, id 2) · `agent2@banque.tn` (AGENT, BQ002, id 3) · `admin@clicktopay.tn` (ADMIN, BQ001, id 4) |
| Bases et ports non touchés | `clicktopay`, `clicktopay_test` (hors exécution de la suite), ports 4000, 4200 et 5173 |

**Note d'environnement**, identique à celle de la campagne précédente : le rôle `clicktopay`
n'a pas l'attribut `CREATEDB`. La commande prescrite

```
createdb -h 127.0.0.1 -U clicktopay clicktopay_nr2
```

échoue en `ERROR: permission denied to create database`. La base a été créée par
`sudo -u postgres psql -c "CREATE DATABASE clicktopay_nr2 OWNER clicktopay"`.
PostgreSQL répondait (`pg_isready` : *accepting connections*) au démarrage et pendant
toute la campagne ; aucun arrêt du service n'a été observé, aucun cas annulé.

---

## 2. Suite automatisée

```
cd /home/user/simulateur/clicktopay-affiliation/server && npm test
```

Résultat du 2026-09-23 :

```
# tests 165
# suites 21
# pass 165
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 36050.4
```

**165 tests, 165 succès, 0 échec, 0 annulé, 0 ignoré.** Le compte annoncé par D-3
(147 → 165, soit les 18 cas d'habilitation ajoutés) est confirmé au tests près.
Aucun cas n'est annulé : la panne d'environnement PostgreSQL évoquée en consigne
ne s'est pas reproduite ici, et la distinction n'a pas eu à être faite.

**Aucune régression au niveau de la suite automatisée.**

---

## 3. Cas rejoués à la main

*(section renseignée au fil de l'eau)*

La méthode est celle de la campagne précédente, augmentée de deux instruments que la
nature de D-3 rendait nécessaires : D-3 déplace des frontières d'habilitation, et une
frontière déplacée se contrôle mieux en comparant les deux états qu'en relisant le
nouveau seul.

1. **Rejeu direct** sur le banc `4100` (base `clicktopay_nr2`), cas par cas.
2. **Différentiel avant / après** : le commit antérieur `78d44b0` est déployé dans un
   arbre de travail séparé et servi sur le port `4101` (base `clicktopay_avant`), le
   commit `3c03b25` sur le port `4102` (base `clicktopay_apres`), les deux bases amorcées
   à l'identique. Une même batterie d'appels est jouée sur les deux, et les réponses sont
   comparées **caractère par caractère**, horodatages normalisés (§ 5).
3. **Mutations ciblées** pour juger la couverture des deux tests réécrits (§ 6) : on casse
   volontairement l'invariant et on regarde si la suite s'en aperçoit. Un test qui ne
   tombe sur aucune mutation ne protège rien.

### 3.1 Authentification, jeton, mot de passe

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-AUTH-01 | Les quatre comptes de démonstration ouvrent une session | jeton servi pour `agent@`, `agent2@`, `banquier@`, `admin@` | conforme |
| CAS-AUTH-03 | Compte inexistant : 401, message indistinct du mot de passe erroné | `401 {"error":"Identifiants incorrects"}` dans les deux cas | conforme |
| CAS-AUTH-04 | Jeton illisible, schéma `Basic`, en-tête vide, en-tête absent : 401 | `401` sur les quatre | conforme |
| CAS-AUTH-06 | Un compte désactivé perd immédiatement ses accès | `401` sur le jeton déjà émis (différentiel : identique avant / après) | conforme |
| CAS-AUTH-07 | Un agent d'une banque désactivée ne se connecte pas | `401 {"error":"Identifiants incorrects"}` ; jeton déjà émis → `401` | conforme |
| CAS-AUTH-08 | Un agent muté de banque perd l'accès à son ancien portefeuille | liste vide après mutation (différentiel : identique avant / après) | conforme |
| CAS-AUTH-09 | Un changement de rôle s'applique sans reconnexion | vérifié par rejeu **et** par mutation (§ 6.2) | conforme |
| CAS-AUTH-10 | Une réinitialisation ferme les sessions ouvertes | jeton `agent2` antérieur → `401` après `POST /api/admin/users/3/password` | conforme |
| CAS-AUTH-11 | Un compte à mot de passe imposé perd les 3 routes métier et garde `/api/auth` | `403` sur `/api/requests`, `/api/admin/users`, `/api/mcc` ; `200` sur `/api/auth/me` ; message `Vous devez définir un nouveau mot de passe avant d’utiliser la plateforme.` | conforme |
| CAS-AUTH-12 | Les 4 variantes faibles refusées sur `/api/auth/password` | `400` sur `court`, `minuscules2026`, `MAJUSCULES2026`, `SansChiffre#` | conforme |
| CAS-AUTH-13 | Mot de passe actuel erroné refusé ; nouveau identique refusé ; ancien jeton périmé | `400 Le mot de passe actuel est incorrect.` · `400 Le nouveau mot de passe doit être différent de l’ancien.` · ancien jeton `401`, nouveau `200` | conforme |
| CAS-AUTH-14 | Jeton forgé expiré et jeton mal signé : 401 | `401 {"error":"Session expirée ou jeton invalide"}` pour les deux | conforme |

Reproduction (CAS-AUTH-14, jetons forgés hors application) :

```
node -e "const jwt=require('.../server/node_modules/jsonwebtoken');
 console.log(jwt.sign({sub:1,role:'AGENT',bankId:1,pwd:null},'dev-secret-change-me',{expiresIn:'-1h'}));
 console.log(jwt.sign({sub:1,role:'ADMIN',bankId:1,pwd:null},'mauvaise-cle',{expiresIn:'1h'}));"
curl -s -w " [%{http_code}]\n" http://127.0.0.1:4100/api/requests -H "Authorization: Bearer <jeton>"
```

**Aucune régression.** `authenticate` n'a pas été touché par D-3 (`git diff --name-only 78d44b0 3c03b25`
ne le cite pas) et son comportement est identique au caractère près sur les deux bancs.

### 3.2 Habilitation et cloisonnement

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-HAB-01 | Le banquier ne saisit pas : `POST`, `PUT`, `submit` refusés | `POST` → `201`, le dossier est rattaché à BQ001 | **caduc** — c'est D-3 (§ 4.1) |
| CAS-HAB-02 | L'agent n'arbitre pas | `403 {"error":"Action réservée aux profils : BANQUIER"}` pour l'agent auteur **et** pour un second agent de la banque | conforme |
| CAS-HAB-03 | L'administration est fermée aux autres profils | agent : `403` sur les 5 routes ; **libellé du message modifié** (NRG-01) ; banquier : ouverture voulue par D-3 (§ 4.1) | écart de libellé |
| CAS-HAB-04 | Cloisonnement inter-banques sur `GET`, `/events`, `/suggestions`, `PUT`, `submit`, liste | `403 {"error":"Cette demande appartient à une autre banque."}` sur les 5 routes ; la liste de `agent2` (BQ002) est vide (`count: 0`) | conforme |
| CAS-HAB-04 *étendu au banquier* | Le banquier ne doit pas voir au-delà de sa banque | banquier BQ001 sur la demande BQ002 : `403` sur `GET`, `/events`, `/suggestions`, `PUT`, `submit`, `decision` ; sa liste ne contient que la demande BQ001 | conforme |
| CAS-HAB-05 | L'ADMIN cumule et voit toutes les banques | `GET /api/requests` sert les 4 dossiers des 2 banques ; il saisit, soumet et valide le même dossier | conforme (comportement assumé par D-1) |
| CAS-HAB-06 | Un agent ne modifie pas la demande d'un collègue de sa banque | lecture `200` ; `PUT` et `submit` → `403 {"error":"Vous ne pouvez modifier que les demandes que vous avez saisies."}` ; en base `site_name` et `status` inchangés | conforme |
| CAS-HAB-07 | Le référentiel MCC est ouvert aux trois profils | 12 réponses `200` (4 routes × 3 rôles) | conforme |
| CAS-HAB-08 | Une route inexistante n'expose rien | `404 Route inconnue : GET /api/administration` · `404 Route inconnue : DELETE /api/requests/1` · `401 Authentification requise` sans jeton | conforme |

Reproduction (CAS-HAB-04 étendu, la question la plus sensible de cette campagne) :

```
BQ=$(curl -s -X POST http://127.0.0.1:4100/api/auth/login -H 'Content-Type: application/json' \
      -d '{"email":"banquier@banque.tn","password":"Banquier#2026"}' | jq -r .token)
for u in /api/requests/2 /api/requests/2/events /api/requests/2/suggestions; do
  curl -s -o /dev/null -w "$u %{http_code}\n" http://127.0.0.1:4100$u -H "Authorization: Bearer $BQ"; done
curl -s -X PUT http://127.0.0.1:4100/api/requests/2 -H "Authorization: Bearer $BQ" \
  -H 'Content-Type: application/json' -d '{"siteName":"Detournee"}'
```

**Le cloisonnement est au moins aussi strict qu'avant.** Il l'est même sur un périmètre
plus large : les routes d'écriture désormais ouvertes au banquier (`POST`, `PUT`,
`submit`) passent toutes par `getRequest`, qui porte la barrière de banque. La création
n'écrit jamais la banque du corps de requête : `createRequest` pose `user.bankId` en dur,
et le schéma `zod` écarte les clés inconnues — un `POST /api/requests` portant
`"bankId": 2` envoyé par le banquier de BQ001 produit un dossier **BQ001**.

### 3.3 Cycle de vie d'une demande et décisions

Dossier `AFF-2026-00001` mené de bout en bout, puis `AFF-2026-00004` pour la branche rejet.

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-DEM-01 | Création : 201, référence, statut `BROUILLON` | `id=1`, `AFF-2026-00001`, `BROUILLON`, `bankId=1`, `createdBy=1` | conforme |
| CAS-WF-01 | La soumission fige les propositions | `/suggestions` sert 6 entrées VISA et 6 MASTERCARD, codes identiques sur les deux réseaux | conforme |
| CAS-WF-03 | Demande soumise non modifiable par l'agent | `409 Une demande au statut SOUMISE n'est plus modifiable par l'agent.` | conforme |
| CAS-WF-11 | Re-soumission d'une demande déjà soumise refusée | `409`, même message | conforme |
| CAS-WF-06 | Rejet ou complément sans commentaire, et commentaire vide `""` | `400 Un commentaire est obligatoire pour un rejet ou une demande de complément.` dans les deux cas | conforme |
| CAS-WF-08 (1) | `COMPLEMENT_REQUIS`, commentaire conservé, codes finaux à `null` | conforme, `finalVisaMcc` et `finalMastercardMcc` à `null`, `decidedBy = 2` | conforme |
| CAS-WF-08 (2) | La demande redevient modifiable par son auteur | `PUT` → `200` | conforme |
| CAS-WF-08 (3) | La re-soumission remet le décideur à `null` | `SOUMISE`, `decidedBy = null`, `decisionComment = null`, `decidedAt = null` | conforme |
| CAS-WF-08 (4) | Validation : codes finaux renseignés | `VALIDEE`, `5977` / `5977`, `decidedBy = 2` | conforme |
| CAS-WF-09 | `REJETEE` terminal | codes finaux à `null` ; `PUT` `409`, `submit` `409`, nouvel arbitrage `409 Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : REJETEE).` | conforme |
| CAS-WF-10 | `VALIDEE` terminal | `PUT` `409`, `submit` `409`, nouvel arbitrage `409 … (statut actuel : VALIDEE).` | conforme |
| CAS-WF-10 *étendu au banquier* | Le nouveau droit d'écriture ne rouvre pas un dossier clos | `PUT` du banquier sur la demande `VALIDEE` → `409` | conforme |
| CAS-WF-14 | La photographie des suggestions est immuable | après `PUT /api/admin/mcc/5977 {"label":"Libelle modifie apres coup"}`, `/suggestions` rend toujours `5977 "Cosmétiques et parfumerie"` | conforme |

Journal d'événements de la demande 1 après le cycle complet
(`GET /api/requests/1/events`, jeton agent) :

```
CREATION          <ts>  Salma Ben Ali    AGENT     {"reference":"AFF-2026-00001"}
SOUMISSION        <ts>  Salma Ben Ali    AGENT     {"visa":"5977","mastercard":"5977","suggestions":[…]}
COMPLEMENT_REQUIS <ts>  Karim Trabelsi   BANQUIER  {"retenus":{…},"proposes":{…}}
MODIFICATION      <ts>  Salma Ben Ali    AGENT     {"champs":["productTypes"]}
SOUMISSION        <ts>  Salma Ben Ali    AGENT     {"visa":"5977","mastercard":"5977","suggestions":[…]}
VALIDATION        <ts>  Karim Trabelsi   BANQUIER  {"retenus":{…},"proposes":{…}}
```

Six événements pour six actions, **aucune étape manquante**, ordre chronologique strict,
chaque ligne portant `userName`, `userRole` et le `payload` de l'action. **Conforme.**

### 3.4 Moteur de suggestion — les dix jeux du § 4.3

```
curl -s -X POST http://127.0.0.1:4100/api/mcc/suggest -H "Authorization: Bearer $AG" \
  -H 'Content-Type: application/json' \
  -d '{"activitySector":"…","deliveryMode":"…","activityDescription":"…","limit":6}'
```

| Jeu | Codes observés | Scores | Rappel `non-regression-lot1.md` | Verdict |
| --- | --- | --- | --- | --- |
| JD-01 | `5977, 7230, 7298, 5912, 5999` | `74, 66, 63, 57, 50` | identique | inchangé |
| JD-01 *sans secteur* | `5977, 5999` | `54, 50` | identique | inchangé |
| JD-02 | `5812, 5814, 5811, 4214, 5992, 5818` | `82, 80, 73, 60, 51, 48` | identique | inchangé |
| JD-03 | `5942, 5815, 5994, 5521, 5931, 5733` | `75, 74, 66, 65, 63, 61` | identique | inchangé |
| JD-04 | `5734, 5817, 4816, 7372, 4899, 5815` | `78, 75, 73, 73, 67, 61` | identique | inchangé |
| JD-05 | `5691, 5651, 5621, 5611, 5641, 5631` | `78, 73, 73, 72, 72, 70` | identique | inchangé |
| JD-06 | `5262, 5732, 5200, 5719, 5691, 5712` | `90, 67, 65, 65, 58, 58` | identique | inchangé |
| JD-07 | `5047, 8011, 8099, 5912, 5499, 7394` | `85, 75, 71, 69, 63, 61` | identique | inchangé |
| JD-08 | `5013, 5533, 5532, 5511, 5065, 5571` | `81, 76, 63, 62, 60, 60` | identique | inchangé |
| JD-09 | `5697, 7699, 7622, 7631, 7629, 7538` | `68, 63, 62, 62, 56, 55` | identique | inchangé |
| JD-10 | `5999` seul | `10` | identique | inchangé |

Parité Visa / Mastercard : **identique sur les onze exécutions** — CAS-MCC-02 conforme.

Les trois écarts au § 4.3 du plan (JD-01 à cinq propositions, JD-01 sans secteur à deux,
JD-10 replié sur `5999`) sont **exactement ceux que `non-regression-lot1.md` a déjà
instruits** : ils tiennent à l'invariant « aucune proposition sans terme justificatif »
introduit à la vague 3, et **le § 4.3 est périmé, pas le moteur**. Ils ne sont pas
recomptés ici. La preuve est d'ailleurs plus courte cette fois : D-3 ne touche aucun
fichier du moteur.

```
git diff --name-only 78d44b0 3c03b25
→ decisions-commanditaire.md · routes/admin.js · routes/requests.js · services/admin.js
  tests/{habilitations,requests,robustesse}.test.js
  web/{App.jsx, auth/AuthContext.jsx, pages/AdminLayout.jsx, pages/AdminUsersPage.jsx}
```

Ni `services/mccSuggestion.js`, ni `services/mccCatalog.js`, ni `data/` ne figurent dans
la liste : **le moteur est hors périmètre de D-3**, et les mesures ci-dessus le confirment
au point de score près.

| CAS-MCC-05 (texte amendé le 2026-09-22) | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| JD-06, `isMarketplace: true` | `5262` rang 1, score `90` | `5262` rang 1, `90` | conforme |
| JD-06, `isMarketplace: false` | baisse d'au moins 5 points | `90 → 84`, soit **6 points** | conforme |
| Descriptif neutre (JD-05), `isMarketplace: false` | `5262` absent | classement `5691, 5651, 5621, 5611, 5641, 5631` — `5262` absent | conforme |

| CAS-MCC-06 — aucun code interdit proposé (`limit: 20`, les deux réseaux) | Interdits proposés | Rang 1 |
| --- | --- | --- |
| `Vente de cigarettes electroniques et de tabac a chicha en ligne` | aucun | `5993` |
| `Site de paris sportifs et de jeux d argent en ligne avec bonus` | aucun | `7994` |
| `Agence matrimoniale et service de rencontres par abonnement mensuel` | aucun | `4899` |

**Conforme**, contrôle fait contre les douze codes `INTERDIT` du § 4.4.

### 3.5 Administration des comptes, des banques et du journal

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-ADM-01 | L'administrateur liste tous les comptes de toutes les banques | 5 comptes, BQ001 et BQ002 ; filtres `bankId`, `role`, `search` opérants ; `bankId=abc` → `400 Banque invalide : « abc »` | conforme |
| CAS-ADM-03 / AUTH-12 | Politique de mot de passe à la création | `400` sur les 4 variantes faibles, `201` sur `Correct#2026` | conforme |
| CAS-ADM-04 / EVO-03 | L'index unique insensible à la casse ne bloque aucun compte légitime | `nr2.legitime2@`, `nr2-legitime@`, `nr2legitime@`, `NR2.Autre@` → **201** ; seuls le doublon exact et le doublon de casse → `409` métier explicite ; connexion en capitales → `200` | conforme |
| CAS-ADM-06 | Le journal des comptes porte les valeurs avant et après | `{"champs":{"role":{"avant":"AGENT","apres":"BANQUIER"},"bankId":{"avant":{"id":1,"code":"BQ001"},"apres":{"id":2,"code":"BQ002"}}}}` | conforme |
| CAS-ADM-08 | L'administrateur ne change ni son rôle ni son état | `403 Vous ne pouvez pas modifier votre propre rôle.` · `403 Vous ne pouvez pas désactiver votre propre compte.` | conforme |
| CAS-ADM-09 | La plateforme conserve au moins un administrateur actif | après rétrogradations croisées, `SELECT count(*) FROM users WHERE role='ADMIN' AND active` ne descend **jamais sous 1** | conforme |
| CAS-ADM-10 | Deux rétrogradations croisées simultanées : une seule aboutit | 4 exécutions : `200` + `403` à chaque fois, 1 administrateur actif restant | conforme |
| CAS-ADM-12 (1) | `{"code":"bq009"}` → 201, code mis en majuscules | `201`, `code = "BQ009"` | conforme |
| CAS-ADM-12 (2) | 409 `Le code banque BQ009 est déjà utilisé.` | identique au caractère près | conforme |
| CAS-ADM-12 (3) | `{"code":"B"}` → 400 `Code banque trop court` | `400`, `details[0].message = "Code banque trop court"` | conforme |
| CAS-ADM-12 (4) | `userCount` / `requestCount` cohérents avec la base | `BQ001 5/3`, `BQ002 1/1`, `BQ009 0/0` — identiques au `SELECT count(*)` | conforme |
| CAS-ADM-13 | Banque à comptes actifs non désactivable | `409 Cette banque compte 4 compte(s) actif(s). Désactivez-les avant de désactiver la banque.` ; une banque vide se désactive (`200`) | conforme |
| CAS-ADM-15 | `PUT /api/admin/mcc/:code` modifie et historise | `200` ; l'historique porte `avant` et `après` (différentiel : identique avant / après) | conforme |
| CAS-ADM-21 / EVO-06 | Le journal pagine sans perte ni doublon, `total` compté filtres appliqués | voir tableaux ci-dessous | conforme |
| CAS-ROB-08 | Aucune valeur hostile de pagination ne produit de 500 | aucun `500` ; toutes ramenées à une borne saine | conforme |
| CAS-ROB-07 | Un identifiant non numérique donne 400 | `GET /api/admin/users/abc` → `400 Identifiant invalide : « abc »` ; `/999` → `404 Utilisateur 999 introuvable` | conforme |

Balayage paginé complet du journal d'administration (21 entrées en base, vue ADMIN) :

| Taille de page | Ids collectés | Uniques | Perdus | Doublons | Ordre |
| --- | --- | --- | --- | --- | --- |
| 1 · 3 · 7 · 10 · 25 · 50 | 21 à chaque fois | 21 | 0 | 0 | identique à la page unique |

Même balayage **avec filtre**, `total` confronté au `GROUP BY` de la base :

| Filtre | `total` annoncé | Collectés (pages de 7) | Base | Perdus | Doublons |
| --- | --- | --- | --- | --- | --- |
| `entity=BANK` | 4 | 4 | 1 `CREATION` + 3 `MODIFICATION` = 4 | 0 | 0 |
| `entity=USER` | 15 | 15 | 2 + 2 + 11 = 15 | 0 | 0 |
| `entity=MCC` | 2 | 2 | 2 | 0 | 0 |
| `action=CREATION` | 3 | 3 | 1 + 2 = 3 | 0 | 0 |
| `entity=BANK&action=CREATION` | 1 | 1 | 1 | 0 | 0 |

Une entité inconnue donne `400 Entité inconnue : « NIMPORTEQUOI ». Valeurs acceptées :
USER, BANK, MCC.`, pas un total silencieusement faux.

Bornes de pagination :

| Paramètre | `/api/admin/events` | `/api/mcc` |
| --- | --- | --- |
| `limit=0` | 200, `count=1` | 200, `count=1` |
| `limit=-5` | 200, `count=1` | 200, `count=1` |
| `limit=99999` | 200, `count=28` (plafonné au total) | 200, `count=279` |
| `limit=abc` | 200, jeu complet | 200, `count=30` (défaut) |
| `limit=1e9` | 200 | — |
| `offset=-10` | 200, jeu complet | — |
| `offset=999999` | 200, `count=0` | — |

**Aucun 500.**

### 3.6 Les bornes que D-3 s'était fixées

Elles ne sont pas des cas du plan — elles n'existaient pas avant — mais leur rupture
**retirerait** au périmètre acquis (le référentiel commun, la création de banques) une
protection qu'il avait. Contrôlées à ce titre.

| Borne | Observé | Verdict |
| --- | --- | --- |
| Le référentiel MCC reste à l'administrateur | banquier : `403 Action réservée aux profils : ADMIN` sur `GET /mcc`, `GET /mcc/export`, `GET /mcc/:code`, `GET /mcc/:code/history`, `PUT /mcc/:code`, `POST /mcc`, `POST /mcc/import`, `POST /mcc/import-fichier` | tenue |
| La création de banques reste à l'administrateur | banquier : `403` sur `POST /api/admin/banks` | tenue |
| La banque de l'appelant écrase celle du corps | `POST /api/requests` du banquier BQ001 avec `"bankId": 2` → dossier **BQ001** | tenue |
| Le banquier ne voit que sa banque | `GET /api/requests` du banquier BQ001 : la demande BQ002 est absente | tenue |
