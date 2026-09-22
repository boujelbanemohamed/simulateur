# Tests de non-régression — après le lot 1 (commit `c9abaf3`)

Campagne : agent 6. Date d'exécution : 2026-09-22.
Question posée : **le périmètre acquis avant le lot 1 est-il intact ?**

Référence de comparaison : commit `154edba` (état immédiatement antérieur au lot),
`docs/plan-de-tests.md` (147 cas numérotés, § 3 matrice de couverture, § 4 jeux de
données), `docs/rapport-recette.md` (recette de la vague 4), `docs/resultats-vague3-back.md`.

**Définition retenue** : une régression est un cas qui passait avant le lot 1 et qui ne
passe plus. Un défaut déjà présent avant le lot est consigné à part (§ 6) et n'est pas
porté au débit du lot.

---

## 1. Banc d'essai

| Élément | Valeur |
| --- | --- |
| Base | `clicktopay_nr`, créée pour cette campagne, migrée et amorcée (`db:migrate` puis `db:seed`) |
| Amorçage | 2 banques, 279 MCC, 4 comptes de démonstration |
| API | `PORT=4100`, `DATABASE_URL=…/clicktopay_nr`, `LOGIN_RATE_LIMIT_MAX=5000` |
| Bases non touchées | `clicktopay` (démonstration), `clicktopay_test` (suite automatisée), ports 4000 et 5173 |

Note d'environnement : le rôle `clicktopay` n'a pas l'attribut `CREATEDB`, la commande
`createdb -h 127.0.0.1 -U clicktopay clicktopay_nr` prescrite échoue en
`ERROR: permission denied to create database`. La base a été créée par
`sudo -u postgres psql -c "CREATE DATABASE clicktopay_nr OWNER clicktopay"`. PostgreSQL
était en service au démarrage de la campagne ; aucun arrêt n'a été observé pendant
l'exécution.

---

## 2. Suite automatisée

```
cd /home/user/simulateur/clicktopay-affiliation/server && npm test
```

Résultat du 2026-09-22 :

```
# tests 147
# suites 20
# pass 147
# fail 0
# cancelled 0
# skipped 0
# duration_ms 32888.5
```

**147 tests, 147 succès, 0 échec, 0 annulé.** La suite est entièrement verte ; le compte
annoncé par le journal du lot 1 (147) est confirmé. L'exécution qui avait rendu 147 cas
annulés plus tôt dans la journée s'explique par l'arrêt de PostgreSQL et non par une
régression : le service répondait ici (`pg_isready` : *accepting connections*) et la même
commande passe.

Aucune régression au niveau de la suite automatisée.

---

## 3. Cas rejoués à la main

*(section renseignée au fil de l'eau)*

### 3.1 Moteur de suggestion — les dix jeux du § 4.3

Commande de rejeu (jeton d'agent obtenu sur `/api/auth/login`) :

```
curl -s -X POST http://127.0.0.1:4100/api/mcc/suggest \
  -H "Authorization: Bearer $AG" -H 'Content-Type: application/json' \
  -d '{"activitySector":"…","deliveryMode":"…","activityDescription":"…","limit":6}'
```

| Jeu | Codes attendus (§ 4.3) | Codes observés | Verdict |
| --- | --- | --- | --- |
| JD-01 | `5977, 7230, 7298, 5912, 5999, 5960` — `74, 66, 63, 57, 50, 31` | `5977, 7230, 7298, 5912, 5999` — `74, 66, 63, 57, 50` | écart (5 propositions au lieu de 6) |
| JD-01 *sans secteur* | `5977, 5999, 5960, 5962, 5964, 5965` — `54, 50, 31, 31, 31, 31` | `5977, 5999` — `54, 50` | écart (2 propositions au lieu de 6) |
| JD-02 | `5812, 5814, 5811, 4214, 5992, 5818` — `82, 80, 73, 60, 51, 48` | identique | conforme |
| JD-03 | `5942, 5815, 5994, 5521, 5931, 5733` — `75, 74, 66, 65, 63, 61` | identique | conforme |
| JD-04 | `5734, 5817, 4816, 7372, 4899, 5815` — `78, 75, 73, 73, 67, 61` | identique | conforme |
| JD-05 | `5691, 5651, 5621, 5611, 5641, 5631` — `78, 73, 73, 72, 72, 70` | identique | conforme |
| JD-06 | `5262, 5732, 5200, 5719, 5691, 5712` — `90, 67, 65, 65, 58, 58` | identique | conforme |
| JD-07 | `5047, 8011, 8099, 5912, 5499, 7394` — `85, 75, 71, 69, 63, 61` | identique | conforme |
| JD-08 | `5013, 5533, 5532, 5511, 5065, 5571` — `81, 76, 63, 62, 60, 60` | identique | conforme |
| JD-09 | `5697, 7699, 7622, 7631, 7629, 7538` — `68, 63, 62, 62, 56, 55` | identique | conforme |
| JD-10 | `5960, 5962, 5964, 5965, 5968, 5969` — six fois `31`, **pas** de repli | `5999` seul, score `10`, `matchedTerms: ["aucune correspondance : code de repli"]` | écart |

Parité Visa / Mastercard : **identique sur les onze exécutions** (CAS-MCC-02 conforme).

**Les trois écarts ne sont pas des régressions du lot 1.** Le moteur a été interrogé
directement au commit antérieur `154edba`, sur la même base et le même référentiel :

```
git worktree add <tmp>/pre154 154edba
cd <tmp>/pre154/clicktopay-affiliation/server && node engine-probe.mjs
```

| Jeu | `154edba` (avant le lot) | `c9abaf3` (après le lot) |
| --- | --- | --- |
| JD-01 | `5977:74, 7230:66, 7298:63, 5912:57, 5999:50` | identique |
| JD-01 sans secteur | `5977:54, 5999:50` | identique |
| JD-10 | `5999:10` | identique |

Le comportement est **rigoureusement le même avant et après**. La cause est l'invariant
« une proposition que le banquier ne peut pas justifier n'a pas sa place dans la liste »
(`mccSuggestion.js`, filtre `rawScore > 0 && matchedTerms.length > 0` et garde
`if (raw <= 0)`), introduit lors des corrections de la vague 3, donc **avant** le lot 1 :

```
git show 154edba:clicktopay-affiliation/server/src/services/mccSuggestion.js | grep -c "rawScore > 0 && mcc.matchedTerms.length > 0"   → 1
git show 26f0145:clicktopay-affiliation/server/src/services/mccSuggestion.js | grep -c "rawScore > 0 && mcc.matchedTerms.length > 0"   → 0
```

C'est la queue de classement à `31` — des codes sans le moindre terme justificatif, qui
ne tenaient leur score que du bonus de pertinence e-commerce — qui a disparu. Le § 4.3 du
plan de tests décrit un moteur antérieur à cette correction : **le document est périmé,
pas le moteur**. Voir § 6, DEF-PRE-01.

Le seul changement du lot 1 sur ce fichier (EVO-02) est la garde contre l'absence du code
de repli `5999` ; elle ne modifie pas le résultat quand `5999` est présent, ce que la
comparaison ci-dessus confirme.

### 3.2 CAS-MCC-05 — place de marché (texte amendé le 2026-09-22)

L'amendement remplace l'exigence de déclassement de `5262` par une exigence de **baisse
du score**. Rejeu des trois branches :

| Branche | Attendu (texte amendé) | Observé | Verdict |
| --- | --- | --- | --- |
| JD-06, `isMarketplace: true` | `5262` rang 1, score `90`, `matchedTerms` contient `place de marché` | `5262` rang 1, score `90`, `matchedTerms` = `[place de marche, vendeurs tiers, place, marche, vendeurs, tiers, secteur : Place de marché (vendeurs tiers), place de marché]` | conforme |
| JD-06, `isMarketplace: false` | baisse d'au moins 5 points | `90 → 84`, soit **6 points** | conforme |
| Descriptif neutre (JD-05), `isMarketplace: false` | `5262` absent du classement | classement `5691, 5651, 5621, 5611, 5641, 5631` — `5262` absent | conforme |

**CAS-MCC-05 : conforme.** La mesure `90 → 84` est identique à celle relevée avant le lot
(`git show`/exécution à `154edba` : `90` puis `84`). Aucune régression.

### 3.3 CAS-MCC-06 — aucun code interdit n'est jamais proposé

Trois formulations distinctes, `limit: 20`, contrôle sur les deux réseaux contre la liste
des douze codes `INTERDIT` (§ 1.3.4 du plan) :

| Descriptif | Codes interdits proposés | Rang 1 |
| --- | --- | --- |
| `Vente de cigarettes electroniques et de tabac a chicha en ligne` | aucun | `5993` |
| `Site de paris sportifs et de jeux d argent en ligne avec bonus` | aucun | `7994` |
| `Agence matrimoniale et service de rencontres par abonnement mensuel` | aucun | `4899` |

**Conforme.** L'invariant tient sur les trois formulations, Visa et Mastercard.

### 3.4 Authentification, jeton, habilitation

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-AUTH-01 | Les quatre comptes de démonstration ouvrent une session | `agent@banque.tn`, `agent2@banque.tn`, `banquier@banque.tn`, `admin@clicktopay.tn` : jeton servi pour les quatre | conforme |
| CAS-AUTH-03 | Compte inexistant : 401, message indistinct du mot de passe erroné | `401 {"error":"Identifiants incorrects"}` | conforme |
| CAS-AUTH-04 | Jeton illisible, schéma `Basic`, en-tête vide, en-tête absent : 401 | `401` sur les quatre variantes | conforme |
| CAS-AUTH-14 | Jeton forgé expiré et jeton mal signé : 401 | `401 {"error":"Session expirée ou jeton invalide"}` pour les deux | conforme |
| CAS-HAB-01 | Le banquier ne saisit pas : `POST`, `PUT`, `submit` refusés | `403` sur les trois | conforme |
| CAS-HAB-04 | Cloisonnement banque sur `GET`, `/events`, `/suggestions`, `PUT`, `submit`, et liste | `403` sur les cinq routes ; la liste de l'agent BQ002 est vide | conforme |

Reproduction (CAS-AUTH-04) :

```
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4100/api/requests -H "Authorization: Bearer nimportequoi"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4100/api/requests -H "Authorization: Basic YWRtaW46YWRtaW4="
```

### 3.5 Cycle de vie d'une demande, décisions, concurrence

Dossier `AFF-2026-00001` mené de bout en bout.

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-DEM-01 | Création : 201, référence, statut `BROUILLON` | `id=1`, `AFF-2026-00001`, `BROUILLON` | conforme |
| CAS-WF-01 | La soumission fige les propositions | `SOUMISE` ; `/suggestions` sert 6 entrées Visa et 6 Mastercard | conforme |
| CAS-WF-03 | Demande soumise non modifiable par l'agent | `409 {"error":"Une demande au statut SOUMISE n'est plus modifiable par l'agent."}` | conforme |
| CAS-WF-11 | Re-soumission d'une demande déjà soumise refusée | `409`, même message | conforme |
| CAS-WF-06 | Rejet ou complément sans commentaire, et commentaire vide `""` : refusés | `400 {"error":"Un commentaire est obligatoire pour un rejet ou une demande de complément."}` dans les deux cas | conforme |
| CAS-WF-08 (1) | `COMPLEMENT_REQUIS`, `decisionComment` renseigné, `finalVisaMcc = null` | conforme ; `finalMastercardMcc = null` également | conforme |
| CAS-WF-08 (2) | La demande redevient modifiable | `PUT` 200, `productTypes` enregistré | conforme |
| CAS-WF-08 (3) | Re-soumission, **remise à `null` du décideur** | `SOUMISE`, `decidedBy = null`, `decisionComment = null` | conforme |
| CAS-WF-08 (4) | Validation : `finalVisaMcc` et `finalMastercardMcc` renseignés | `VALIDEE`, `5977` / `5977`, `decidedBy = 2` | conforme |
| CAS-WF-09 | `REJETEE` terminal : `PUT` et `submit` refusés, codes finaux à `null` | `409` sur les deux, `finalVisaMcc = null` | conforme |
| CAS-WF-10 | `VALIDEE` terminal : `PUT`, `submit`, et nouvel arbitrage refusés | `409` / `409` / `409 {"error":"Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : VALIDEE)."}` | conforme |
| CAS-WF-12 | Deux soumissions simultanées : une seule aboutit | `200` et `409` | conforme |
| Concurrence `submit` × `PUT` | Pas d'état incohérent ni de perte | les deux appels aboutissent, sérialisés ; état final unique et cohérent : `SOUMISE`, `siteName = "Concurrent"` | conforme |

### 3.6 Journal d'événements de la demande — complétude et ordre

`GET /api/requests/1/events` après le cycle complet :

```
CREATION          2026-09-22T15:07:44.283Z  Salma Ben Ali    AGENT
SOUMISSION        2026-09-22T15:07:59.130Z
COMPLEMENT_REQUIS 2026-09-22T15:07:59.190Z  commentaire présent
MODIFICATION      2026-09-22T15:07:59.217Z
MODIFICATION      2026-09-22T15:08:45.939Z
SOUMISSION        2026-09-22T15:08:45.972Z
VALIDATION        2026-09-22T15:08:45.991Z
```

Sept événements, **aucune étape manquante**, ordre chronologique strict, chaque ligne
portant `userName`, `userRole` et le `payload` de l'action. **Conforme.**

### 3.7 EVO-08 — la photographie autoportante et les dossiers antérieurs au lot

C'est le point de régression le plus sensible du lot : les dossiers soumis **avant**
le lot 1 n'ont ni `label_at_submit` ni `description_at_submit` en base.

| Situation | Observé | Verdict |
| --- | --- | --- |
| Dossier soumis après le lot | `VISA 1 5977 "Cosmétiques et parfumerie"`, `libelleReconstitue` absent | conforme |
| Dossier antérieur simulé (`UPDATE mcc_suggestions SET label_at_submit=NULL, description_at_submit=NULL`) | `VISA 1 5977 "Cosmétiques et parfumerie"`, `libelleReconstitue: true` — **aucune entrée sans code ni sans libellé** | conforme |

Reproduction :

```
PGPASSWORD=clicktopay psql -h 127.0.0.1 -U clicktopay -d clicktopay_nr \
  -c "UPDATE mcc_suggestions SET label_at_submit=NULL, description_at_submit=NULL WHERE request_id=1;"
curl -s http://127.0.0.1:4100/api/requests/1/suggestions -H "Authorization: Bearer $AG"
```

**Aucune perte d'information sur les dossiers déjà existants.** Le code vient de la
photographie, le libellé retombe sur le catalogue courant et le dit (`libelleReconstitue`).
Le défaut que l'évolution corrigeait (`{...undefined}` donnant une carte sans code) ne se
reproduit pas, y compris sur des lignes dépourvues des nouvelles colonnes.

### 3.8 Politique de mot de passe, révocation de jeton

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-AUTH-11 | Un compte à mot de passe à changer perd les 3 routes métier mais garde `/api/auth` | `403` sur `/api/requests`, `/api/admin/users`, `/api/mcc` ; `200` sur `/api/auth/me` ; message `Vous devez définir un nouveau mot de passe avant d’utiliser la plateforme.` | conforme |
| CAS-AUTH-12 | Les 4 variantes refusées sur `/api/auth/password` | `400` pour `court`, `minuscules2026`, `MAJUSCULES2026`, `SansChiffre#`, avec `Le mot de passe doit comporter au moins 10 caractères` et `Le mot de passe doit contenir une minuscule, une majuscule et un chiffre` | conforme |
| CAS-AUTH-13 | Mot de passe actuel erroné refusé ; nouveau identique à l'ancien refusé ; ancien jeton périmé | `400 Le mot de passe actuel est incorrect.` · `400 Le nouveau mot de passe doit être différent de l’ancien.` · ancien jeton `401`, nouveau jeton `200` | conforme |
| CAS-ADM-03 | Politique appliquée à la création de compte | `400` sur les 4 variantes, `201` sur `Correct#2026` | conforme |
| CAS-AUTH-07 | Un agent d'une banque désactivée ne se connecte pas | `401 {"error":"Identifiants incorrects"}` | conforme |

### 3.9 EVO-03 — l'index unique insensible à la casse

Point de régression annoncé : *l'index ne doit pas empêcher la création d'un compte
légitime.*

| Adresse | Attendu | Observé |
| --- | --- | --- |
| `nr.legitime@banque.tn` (nouvelle) | 201 | **201** |
| `nr.legitime@banque.tn` (doublon exact) | 409 | `409 Un compte existe déjà avec l'adresse nr.legitime@banque.tn.` |
| `NR.Legitime@Banque.TN` (doublon de casse) | 409 | `409 Un compte existe déjà avec l'adresse NR.Legitime@Banque.TN.` |
| `nr.legitime2@banque.tn` | 201 | **201** |
| `nr-legitime@banque.tn` | 201 | **201** |
| `nrlegitime@banque.tn` | 201 | **201** |
| `NR.Autre@banque.tn` | 201 | **201** |
| Connexion `NR.LEGITIME@BANQUE.TN` | jeton servi | jeton servi |

**Aucun blocage de compte légitime.** Quatre adresses voisines mais distinctes sont créées
sans obstacle ; seul le doublon de casse est refusé, et par un **409 métier explicite**,
pas par une erreur brute d'index. CAS-ADM-04 conforme, y compris le cas de la casse porté
en « reste à faire ».

### 3.10 Administration des comptes et des banques, invariant du dernier administrateur

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-ADM-08 | L'administrateur ne change ni son rôle ni son état | `403 Vous ne pouvez pas modifier votre propre rôle.` · `403 Vous ne pouvez pas désactiver votre propre compte.` | conforme |
| CAS-ADM-09 | La plateforme conserve au moins un administrateur actif | Après rétrogradations croisées successives, `SELECT count(*) FROM users WHERE role='ADMIN' AND active` ne descend **jamais sous 1** | conforme |
| CAS-ADM-10 | Deux rétrogradations croisées simultanées : une seule aboutit | `200` et `403` ; 1 administrateur actif restant | conforme |
| CAS-ADM-12 (1) | `{"code":"bq009"}` → 201, code **mis en majuscules** | `201`, `code = "BQ009"` | conforme |
| CAS-ADM-12 (2) | 409 `Le code banque BQ009 est déjà utilisé.` | identique au caractère près | conforme |
| CAS-ADM-12 (3) | `{"code":"B"}` → 400, `Code banque trop court` | `400`, `details[0].message = "Code banque trop court"` | conforme |
| CAS-ADM-12 (4) | `userCount` / `requestCount` cohérents avec la base | `BQ001 11/4`, `BQ002 1/0`, `BQ009 0/0`, `BQ900 0/0` — identiques au `SELECT count(*)` | conforme |
| CAS-ADM-13 | Banque à comptes actifs non désactivable, message exact | `409 Cette banque compte 11 compte(s) actif(s). Désactivez-les avant de désactiver la banque.` ; une banque vide se désactive (`200`) | conforme |

Note : `{"code":"BQ"}` (2 caractères) est accepté — c'est conforme, le schéma pose
`min(2)` (`adminSchema.js`, `createBankSchema`), le plan éprouve `"B"` à 1 caractère.

### 3.11 Référentiel MCC — édition, historique, désactivation

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-ADM-15 | `PUT /api/admin/mcc/5977` modifie et historise | `200` ; historique : une ligne `MODIFICATION` portant `avant` et `après` complets (`label`, `riskLevel`, `keywords`, `sectors`…) | conforme |
| CAS-MCC-08 / CAS-MCC-15 | Un code désactivé sort du catalogue et du moteur | `GET /api/mcc/5977` → `404` ; le moteur sur JD-01 rend `7230, 7298, 5912, 5999` — **`5977` absent** | conforme |
| CAS-ADM-16 | Actions `DESACTIVATION` / `REACTIVATION` historisées | historique du code : `[REACTIVATION, DESACTIVATION, MODIFICATION]` | conforme |
| Retour à l'état initial | Le moteur retrouve son classement d'origine | après restauration du libellé et de `riskLevel` : `5977:74, 7230:66, 7298:63, 5912:57, 5999:50` — **identique à la ligne JD-01 du § 3.1** | conforme |

Le dernier point vaut contrôle de non-régression du référentiel : un aller-retour complet
désactivation / réactivation / modification / restauration laisse le moteur au bit près
dans son état d'origine.

### 3.12 EVO-06 — pagination du journal d'administration

Point de régression annoncé : *la pagination ne doit perdre aucune entrée ni en doubler
entre deux pages.* 84 événements en base (dont 60 créés pour ce contrôle).

Balayage complet par pages, puis comparaison à la page unique de référence :

| Taille de page | Ids collectés | Ids uniques | Entrées perdues | Doublons | Ordre identique |
| --- | --- | --- | --- | --- | --- |
| 1 | 84 | 84 | 0 | 0 | oui |
| 3 | 84 | 84 | 0 | 0 | oui |
| 7 | 84 | 84 | 0 | 0 | oui |
| 10 | 84 | 84 | 0 | 0 | oui |
| 25 | 84 | 84 | 0 | 0 | oui |
| 50 | 84 | 84 | 0 | 0 | oui |

Même balayage **avec filtre** :

| Filtre | Total annoncé | Collectés (pages de 7) | Perdus | Doublons | Ordre |
| --- | --- | --- | --- | --- | --- |
| `entity=BANK` | 64 | 64 | 0 | 0 | identique |
| `entity=USER` | 16 | 16 | 0 | 0 | identique |
| `action=CREATION` | 71 | 71 | 0 | 0 | identique |

`total` compté **filtres appliqués**, conformément à EVO-06, et exact au regard de la base :

```
SELECT entity, action, count(*) FROM admin_events GROUP BY entity, action;
 BANK/CREATION 63 · BANK/MODIFICATION 1 · MCC/DESACTIVATION 1 · MCC/MODIFICATION 2
 MCC/REACTIVATION 1 · USER/CHANGEMENT_MOT_DE_PASSE 1 · USER/CREATION 8 · USER/MODIFICATION 7
```

`entity=BANK` → 64 (63+1), `entity=MCC` → 4, `entity=USER` → 16, `action=CREATION` → 71,
`entity=BANK&action=CREATION` → 63. **Tous exacts.** Une valeur d'entité inconnue donne
`400`, pas un total silencieusement faux.

**Aucune perte, aucun doublon. Conforme.**

### 3.13 EVO-04 et EVO-05 — traçabilité des comptes

| Attendu | Observé | Verdict |
| --- | --- | --- |
| Le changement de mot de passe par l'utilisateur est tracé | `USER / CHANGEMENT_MOT_DE_PASSE`, `payload: {"impose": true}` | conforme |
| Le journal des comptes porte les valeurs avant et après | `{"champs": {"role": {"avant":"AGENT","apres":"BANQUIER"}, "bankId": {"avant":{"id":1,"code":"BQ001"}, "apres":{"id":2,"code":"BQ002"}}}}` | conforme |

CAS-ADM-06, dont le « reste à faire » était précisément `payload.champs` : **conforme**.

### 3.14 Bornes de pagination (CAS-ROB-08, CAS-ADM-21)

Aucune valeur hostile ne produit de 500 ; toutes sont ramenées à une borne saine.

| Paramètre | `/api/admin/events` | `/api/mcc` |
| --- | --- | --- |
| `limit=0` | 200, `count=1` | 200, `count=1` |
| `limit=-5` | 200, `count=1` | 200, `count=1` |
| `limit=99999` | 200, `count=84` (plafonné au total) | 200, `count=279` |
| `limit=abc` | 200 | 200, `count=30` (défaut) |
| `limit=1e9` | 200 | — |
| `offset=-10` | 200, jeu complet | — |
| `offset=999999` | 200, `count=0` | — |

**Conforme**, aucun 500.
