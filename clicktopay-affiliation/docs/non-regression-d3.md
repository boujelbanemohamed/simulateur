# Tests de non-régression — modèle d'habilitation D-3 et correctifs de sécurité

Campagne de non-régression portant sur **deux** changements successifs :

| Commit | Objet |
| --- | --- |
| `3c03b25` | D-3 — « le banquier est l'administrateur de sa banque » |
| `3a7ac2e` | Correctifs des revues de sécurité et d'habilitation |

Date d'exécution : 2026-09-23. État vérifié : `HEAD` = `3a7ac2e`.
Question posée : **le périmètre acquis avant ces deux changements est-il intact ?**

Référence de comparaison : `c9abaf3` (lot 1, dernier état stable avant D-3 ; `78d44b0`,
qui le suit, ne porte que la spécification et le même code).
Documents de référence : `docs/plan-de-tests.md` (147 cas, § 3 matrice de couverture,
§ 4 jeux de données), `docs/decisions-commanditaire.md`, `docs/non-regression-lot1.md`
(campagne précédente, close sur le lot 1).

**Définition retenue** : une régression est un cas qui **passait avant** ces changements
et **ne passe plus**. Trois catégories sont tenues séparées :

- **régression** (§ 8) — perte effective de comportement acquis ;
- **changement délibéré** (§ 4) — le comportement change parce que la décision ou le
  correctif le veut ; le cas du plan devient caduc, le plan doit être amendé ;
- **défaut antérieur** (§ 9) — déjà présent avant, non porté au débit de ces changements.

## 0. Provenance de ce document — à lire avant le reste

Ce fichier existait déjà, versionné (créé en `0d26319`, complété en `3a7ac2e`). Son
contenu antérieur était le rapport d'une campagne **arrêtée au stade D-3 seul**. Il
annonçait 165 tests et relevait, en plusieurs endroits, un refus `403
{"error":"Cette demande appartient à une autre banque."}` sur le cloisonnement.

**Ces constats sont périmés** : `3a7ac2e` porte la suite à 166 tests et remplace ce 403
par un 404. Aucune de ses conclusions n'est reprise ici sur parole ; **tout a été
rejoué**. La version antérieure reste consultable dans l'historique
(`git show 0d26319:clicktopay-affiliation/docs/non-regression-d3.md`).

---

## 1. Banc d'essai

| Élément | Valeur |
| --- | --- |
| Base | `clicktopay_nr2`, **recréée à vide** pour cette campagne, migrée (`db:migrate`) puis amorcée (`db:seed`) |
| Amorçage | 2 banques (BQ001, BQ002), 279 MCC, 4 comptes de démonstration |
| API | `PORT=4100`, `DATABASE_URL=…/clicktopay_nr2`, `LOGIN_RATE_LIMIT_MAX=5000` |
| Comptes | `agent@banque.tn` (AGENT, BQ001, id 1) · `banquier@banque.tn` (BANQUIER, BQ001, id 2) · `agent2@banque.tn` (AGENT, BQ002, id 3) · `admin@clicktopay.tn` (ADMIN, BQ001, id 4) |
| Dossiers | D1 = `AFF-2026-00001` (BQ001, saisi par l'agent) · D2 = `AFF-2026-00002` (BQ002, agent2) · D3 = `AFF-2026-00003` (BQ001, saisi par le banquier) |
| Non touchés | bases `clicktopay`, `revue_lot1*`, `clicktopay_recette_*` ; ports 4000, 4400 et 5173 (autres agents) |

**Note d'environnement.** Le rôle `clicktopay` n'a pas l'attribut `CREATEDB`
(`SELECT rolcreatedb FROM pg_roles WHERE rolname='clicktopay'` → `f`). La commande
prescrite `createdb -h 127.0.0.1 -U clicktopay clicktopay_nr2` échoue en
`ERROR: permission denied to create database`. La base a donc été créée par

```
sudo -u postgres psql -c "DROP DATABASE IF EXISTS clicktopay_nr2;" \
                     -c "CREATE DATABASE clicktopay_nr2 OWNER clicktopay;"
```

PostgreSQL a répondu (`pg_isready` : *accepting connections*) pendant toute la campagne ;
**aucun arrêt du service n'a été observé**, aucun cas annulé de ce fait.

---

## 2. Suite automatisée

```
cd /home/user/simulateur/clicktopay-affiliation/server && npm test
```

### 2.1 Première exécution — 9 échecs, 57 annulés, **cause externe**

```
# tests 166   # pass 100   # fail 9   # cancelled 57   # skipped 0   # duration_ms 42805.1
```

Ce résultat **n'est pas une régression**, et la cause est établie, non supposée. Les
échecs portent tous la même signature PostgreSQL :

```
# error: deadlock detected      code: '40P01'
#   detail: 'Process 2651 waits for RowExclusiveLock on relation 16561 of database 16386;
#            blocked by process 2639.
#            Process 2639 waits for AccessExclusiveLock on relation 16561 of database 16386;
#            blocked by process 2651.'
#   at async createUser (.../src/services/admin.js:195:14)
```

Identification des objets verrouillés :

```
psql -U clicktopay -d postgres -tAc "SELECT oid, datname FROM pg_database WHERE oid=16386;"
→ 16386|clicktopay_test
psql -U clicktopay -d clicktopay_test -tAc "SELECT 16561::regclass;"
→ users
```

Un `AccessExclusiveLock` sur `clicktopay_test.users` est le `TRUNCATE`/`DELETE` de
`resetDatabase` (`tests/helpers.js`) ; le `RowExclusiveLock` concurrent est l'`INSERT` de
`createUser`. Or `npm test` s'exécute en `--test-concurrency=1`, donc **en série** : les
deux processus ne peuvent pas appartenir à la même exécution. Une **seconde suite tournait
en parallèle sur la base partagée `clicktopay_test`** — un autre agent du banc. Ce n'est ni
l'arrêt de PostgreSQL évoqué en consigne (le service répondait), ni un défaut du produit :
c'est une contention d'environnement sur une base de test non cloisonnée.

**Constat d'environnement, consigné en § 9 (`DEF-ENV-01`)** : la suite n'est pas
ré-entrante — elle ne peut pas tourner à deux sur la même base.

### 2.2 Deuxième exécution — même cause

```
# tests 166   # pass 145   # fail 2   # cancelled 19
```

Deux échecs : un nouveau `40P01` sur `createUser`, et une assertion de
`tests/auth.test.js:69` (*le changement de mot de passe par l'utilisateur est journalisé,
EVO-04*) qui attend **0** ligne `CHANGEMENT_MOT_DE_PASSE` avant le changement réussi et en
trouve **1**. Cette ligne surnuméraire n'est pas écrite par le cas lui-même : c'est une
ligne déposée dans `admin_events` de `clicktopay_test` **par l'autre suite**, entre les
deux relevés. Même cause, autre symptôme.

### 2.3 Exécution isolée — la mesure qui fait foi

Pour obtenir un résultat exploitable, la suite a été relancée sur une base privée, ce que
`tests/helpers.js` permet nativement par `TEST_DATABASE_URL` :

```
sudo -u postgres psql -c "CREATE DATABASE clicktopay_nr2_test OWNER clicktopay;"
cd server && DATABASE_URL=…/clicktopay_nr2_test npm run db:migrate && npm run db:seed
cd server && TEST_DATABASE_URL=postgres://clicktopay:clicktopay@127.0.0.1:5432/clicktopay_nr2_test npm test
```

```
# tests 166
# suites 21
# pass 166
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 37918.7
```

**166 tests, 166 succès, 0 échec, 0 annulé, 0 ignoré.** Le compte annoncé par `3a7ac2e`
(166) est confirmé au test près. La suite est **entièrement verte** ; les échecs des deux
premières exécutions sont donc bien imputables à la base partagée, et à rien d'autre.

**Aucune régression au niveau de la suite automatisée.**

---

## 3. Le passage de 403 à 404 — le point le plus exposé

`getRequest` (`services/requests.js`) et `assertCibleAutorisee` (`services/admin.js`)
répondent désormais `404 … introuvable` là où ils répondaient
`403 Cette demande appartient à une autre banque.` / `403 Ce compte appartient à une
autre banque.`

### 3.1 L'indiscernabilité est réellement obtenue

Refus croisés, **toutes routes de dossier**, comparés au refus sur un identifiant
inexistant :

| Appelant → objet | `GET /:id` | `/events` | `/suggestions` | `PUT` | `submit` | `decision` |
| --- | --- | --- | --- | --- | --- | --- |
| agent BQ001 → D2 (BQ002) | 404 | 404 | 404 | 404 | 404 | 403 rôle |
| banquier BQ001 → D2 (BQ002) | 404 | 404 | 404 | 404 | 404 | **404** |
| agent2 BQ002 → D1 (BQ001) | 404 | 404 | 404 | 404 | 404 | 403 rôle |
| agent BQ001 → D999 (inexistante) | 404 | 404 | 404 | 404 | 404 | 403 rôle |

Le corps est identique à l'identifiant près : `{"error":"Demande <n> introuvable"}`.
Sur `decision`, le 403 des profils non-banquiers tombe **avant** la lecture du dossier :
il ne distingue pas une banque d'une autre (il est rendu à l'identique pour D2, D1 et
D999), il ne fuit donc rien. Pour le banquier, seul profil à franchir cette barrière de
rôle, le refus est bien 404.

Reproduction :

```
BQ=$(curl -s -X POST http://127.0.0.1:4100/api/auth/login -H 'Content-Type: application/json' \
      -d '{"email":"banquier@banque.tn","password":"Banquier#2026"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
for u in /api/requests/2 /api/requests/2/events /api/requests/2/suggestions; do
  curl -s -w " [%{http_code}]\n" http://127.0.0.1:4100$u -H "Authorization: Bearer $BQ"; done
curl -s -w " [%{http_code}]\n" -X POST http://127.0.0.1:4100/api/requests/2/decision \
  -H "Authorization: Bearer $BQ" -H 'Content-Type: application/json' -d '{"decision":"VALIDEE"}'
```

Sur les comptes, même contrôle :

```
curl -s -w " [%{http_code}]\n" http://127.0.0.1:4100/api/admin/users/3 -H "Authorization: Bearer $BQ"
→ {"error":"Utilisateur 3 introuvable"} [404]
curl -s -w " [%{http_code}]\n" http://127.0.0.1:4100/api/admin/users/999 -H "Authorization: Bearer $BQ"
→ {"error":"Utilisateur 999 introuvable"} [404]
```

### 3.2 Aucun chemin légitime ne bascule en 404

C'est le risque propre à ce correctif : un 404 rendu à qui a le droit de voir.
**Aucun n'a été observé.**

| Chemin légitime | Attendu | Observé |
| --- | --- | --- |
| agent BQ001 → D1 (son dossier) `GET`, `/events`, `/suggestions` | 200 | 200, 200, 200 |
| agent BQ001 → D3 (sa banque, saisi par le banquier) `GET` | 200 | 200 |
| agent BQ001 → D3 `PUT` et `submit` | **403** auteur, pas 404 | `403 Vous ne pouvez modifier que les demandes que vous avez saisies.` |
| banquier BQ001 → D1, D3 `GET`, `/events` | 200 | 200 |
| administrateur → D1, D2, D3 | 200 sur les trois banques | 200, 200, 200 |
| `GET /api/requests` — agent BQ001 | D1 et D3 | `count=2`, ids `[3, 1]` |
| `GET /api/requests` — agent2 BQ002 | D2 seule | `count=1`, ids `[2]` |
| `GET /api/requests` — banquier BQ001 | D1 et D3 | `count=2`, ids `[3, 1]` |
| `GET /api/requests` — administrateur | les trois | `count=3`, ids `[3, 2, 1]` |

Le point le plus délicat est la troisième ligne : **le refus de modifier le dossier d'un
collègue de sa propre banque reste un 403 explicite**, et n'a pas été emporté par la
bascule. Un agent légitime qui se trompe de dossier garde donc un message qui lui dit
quoi faire, au lieu d'un « introuvable » trompeur. C'est ce qu'il fallait vérifier :
**CAS-HAB-06 est conforme** (couverture « partiel » au § 3 du plan — la lecture 200 et le
refus sur `submit` y étaient annoncés comme restant à faire ; ils sont joués ici).

### 3.3 Exploitabilité des messages pour l'utilisateur légitime

Un défaut demeure, mais il est **inhérent à la décision de sécurité**, pas accidentel :
un agent qui saisit une URL de dossier erronée et un agent qui vise un dossier d'une autre
banque reçoivent désormais le même « introuvable ». C'est exactement l'effet recherché.
Le message reste exploitable (il nomme l'objet et l'identifiant), et les deux seules
situations où un utilisateur légitime peut le rencontrer — faute de frappe dans l'URL,
lien périmé — appellent la même conduite : vérifier la référence.

**En revanche le plan de tests devient faux sur ce point** (§ 4).

---

## 4. Changements délibérés — ce que le plan de tests doit acter

Ces comportements changent parce que la décision ou le correctif le veut. Ils ne sont
**pas** portés au débit du changement, mais ils rendent **faux** le résultat attendu écrit
au plan : celui-ci doit être amendé, sans quoi la prochaine campagne comptera des
régressions imaginaires.

| Cas du plan | Attendu au plan | Observé aujourd'hui | Nature |
| --- | --- | --- | --- |
| **CAS-HAB-04** (l. 405) | `403 {"error":"Cette demande appartient à une autre banque."}` sur les 4 appels ; bandeau d'écran reprenant ce message | `404 {"error":"Demande <n> introuvable"}` | correctif de sécurité `3a7ac2e` — **le plan est à amender, y compris le libellé attendu à l'écran (6)** |
| **CAS-HAB-11** (l. 493) | `403 {"error":"Ce compte appartient à une autre banque."}` sur les 3 appels | `404 {"error":"Utilisateur <n> introuvable"}` | idem |
| **CAS-HAB-01** (l. 182) | le banquier ne saisit pas : `POST`, `PUT`, `submit` refusés | `201` ; dossier rattaché à BQ001 | décision D-3 — le plan a déjà été amendé (l. 338, matrice § 3) |
| **CAS-HAB-03** (l. 390) | `403 {"error":"Action réservée aux profils : ADMIN, BANQUIER"}` pour l'agent | **identique** | le plan **a déjà été amendé** — conforme, aucun écart |

Sur ce dernier point, un correctif d'exactitude est dû à la version antérieure de ce
document, qui comptait le changement de libellé (`ADMIN` → `ADMIN, BANQUIER`) comme un
écart. Ce n'en est pas un : le plan attend déjà le libellé à deux profils, et la garde
`requireRole('ADMIN')` → `requireRole('ADMIN', 'BANQUIER')` (`routes/admin.js:55` → `:58`)
n'a pas changé le **refus** opposé à l'agent, seulement l'énumération des profils admis.
Le refus reste un 403, sur les quatre routes éprouvées.

### 4.1 Les quatre bornes que D-3 s'était fixées tiennent

Leur rupture retirerait au périmètre acquis une protection qu'il avait ; elles sont donc
contrôlées à ce titre.

| Borne | Observé | Verdict |
| --- | --- | --- |
| Le référentiel MCC reste à l'administrateur | banquier : `403 Action réservée aux profils : ADMIN` sur `GET /admin/mcc`, `/export`, `/:code`, `/:code/history`, `PUT /:code` | tenue |
| La création de banques reste à l'administrateur | banquier : `403` sur `POST /api/admin/banks` | tenue |
| La banque de l'appelant écrase celle du corps | `POST /api/requests` du banquier BQ001 avec `"bankId": 2, "createdBy": 3, "status": "VALIDEE"` → `bankId 1`, `createdBy 2`, `status BROUILLON` | tenue (**mais non gardée par un test** — § 5.1) |
| Le banquier ne voit que sa banque | `GET /api/requests` du banquier BQ001 : `count=2`, ids `[3, 1]` ; la demande BQ002 absente | tenue |

### 4.2 Le référentiel de lecture reste ouvert aux trois profils

CAS-HAB-07 : `GET /api/mcc` et `GET /api/mcc/:code` répondent `200` pour l'agent, le
banquier et l'administrateur (6 appels). Le cloisonnement introduit par D-3 porte sur
l'**administration** du référentiel, pas sur sa consultation. **Conforme.**

---

## 5. Les quatre tests réécrits — épreuve par mutation

Un test réécrit ne se juge pas à sa lecture : on casse volontairement l'invariant qu'il
prétend garder, et on regarde s'il tombe. Un test qui survit à la mutation ne protège
rien. Les mutations sont appliquées dans un **arbre de travail séparé**
(`git worktree add … 3a7ac2e`), jamais dans l'arbre du projet, sur la base privée
`clicktopay_nr2_test`. Référence : `tests/habilitations.test.js` 19/19, suite complète
166/166.

### 5.1 « un banquier ne saisit pas de demande » → « un banquier saisit des demandes dans sa banque (D-3) »

`tests/requests.test.js`. L'ancien cas affirmait la règle que D-3 lève : il **devait**
disparaître. Le nouveau vérifie le 201, le `siteName` rendu, et relit la fiche pour
contrôler `bankId === 1`.

**Verdict : couverture nettement affaiblie sur un point précis.** Le nouveau cas ne soumet
**jamais** de `bankId` dans le corps. Or D-3 s'engage explicitement sur la borne « la
banque de l'appelant écrase celle du corps de la requête ». Cette borne est testée pour la
**création de compte** (*la banque du compte créé est celle du banquier, quoi que dise la
requête*) mais **pas pour la création de dossier**.

Mutation **M4** — le schéma accepte `bankId`, et `createRequest` lui fait confiance :

```
# src/services/requestSchema.js : + bankId: z.coerce.number().int().optional()
# src/services/requests.js      : values = [reference, payload.bankId ?? user.bankId, user.id]
TEST_DATABASE_URL=…/clicktopay_nr2_test npm test
→ # tests 166   # pass 166   # fail 0
```

**La suite entière reste verte** alors qu'un banquier de BQ001 peut déposer un dossier
dans BQ002. Aucun des 166 cas ne voit la brèche.

Ce **n'est pas une régression** : le code d'avant (`c9abaf3`,
`services/requests.js:116`) posait déjà `user.bankId` en dur et le schéma écartait déjà
les clés inconnues — la protection est identique avant et après, et elle **tient
aujourd'hui** (vérifié en § 4). C'est un **trou de couverture** créé par la réécriture,
consigné en `OBS-01`.

Contrôle manuel du comportement réel, qui lui est conforme :

```
curl -s -X POST http://127.0.0.1:4100/api/requests -H "Authorization: Bearer $BQ" \
  -H 'Content-Type: application/json' \
  -d '{…, "bankId": 2, "createdBy": 3, "status": "VALIDEE"}'
→ id 4  bankId 1  createdBy 2  status BROUILLON
```

### 5.2 « un changement de rôle s'applique sans reconnexion »

`tests/robustesse.test.js`. L'ancien observable — `POST /api/requests` refusé au
banquier — a cessé d'être discriminant, puisque la saisie est devenue commune aux deux
rôles. Le nouvel observable est `GET /api/admin/users` : 403 en agent → promotion → 200 →
rétrogradation → 403.

Mutation **M3** — le rôle est figé dans le jeton au lieu d'être relu en base :

```
# src/middleware/auth.js : role: charge.role ?? utilisateur.role
node --test tests/robustesse.test.js
→ not ok 4 - un changement de rôle s’applique sans reconnexion     # tests 51  pass 50  fail 1
```

**Verdict : couverture intacte, et même légèrement renforcée.** Le nouveau cas tombe sur
la mutation, et c'est le **seul** des 51 cas du fichier à la voir. Il contrôle en outre
l'état initial (403 avant promotion), ce que l'ancien ne faisait pas : l'ancien pouvait
passer sur un observable déjà vrai au départ.

### 5.3 et 5.4 Les deux cas du journal

`tests/habilitations.test.js`. L'ancien cas unique, *le banquier consulte le journal de sa
banque*, n'assertait que `Array.isArray(res.body.items)`. Il est remplacé par *le journal
du banquier ne porte que les actions de sa banque* et *une mutation de banque ne fait pas
franchir la cloison à l'historique*.

**Verdict : c'est le gain le plus net de toute la campagne, et il est mesuré.**

| Mutation | Ancien cas seul | Nouveaux cas |
| --- | --- | --- |
| **M1** — filtre de banque du journal **supprimé** (`conditions.push(e.bank_id = $n)` retiré) | **18/18 verts — ne voit rien** | `not ok 7`, `not ok 8` — **4 échecs** |
| **M2** — **ancien** filtre rétabli (`e.user_id IN (SELECT id FROM users WHERE bank_id = $n)`) | non applicable | `not ok 7`, `not ok 8` — **4 échecs** |

La ligne décisive est la première : avec le filtre **entièrement retiré** — le banquier
lisant le journal de toute la plateforme — l'ancien cas réinséré dans le code muté donne

```
# tests 18   # pass 18   # fail 0
```

L'ancien test ne protégeait donc **rien du tout**, ce que le message de `3a7ac2e`
affirmait et que cette campagne confirme par la mesure. Les deux nouveaux cas tombent sur
les deux mutations, dont M2, qui est précisément le défaut corrigé.

### 5.5 Synthèse sur les réécritures

| Test | Couverture après réécriture |
| --- | --- |
| banquier / saisie de demande | **affaiblie** — borne « banque du corps ignorée » non gardée (`OBS-01`, M4 non détectée) |
| changement de rôle | **intacte, légèrement renforcée** (M3 détectée) |
| journal du banquier (×2) | **très fortement renforcée** (M1 et M2 détectées ; l'ancien cas ne voyait pas M1) |

Trois réécritures sur quatre prouvent autant ou davantage. La quatrième laisse un angle
mort qui n'ouvre aucune brèche aujourd'hui, mais qui ne verrait pas celle de demain.

---

## 6. La migration du journal d'administration

`3a7ac2e` ajoute `admin_events.bank_id`, figée à l'écriture, et **reprend les lignes déjà
écrites** (`schema.sql`) :

```sql
UPDATE admin_events e SET bank_id = u.bank_id
  FROM users u WHERE e.bank_id IS NULL AND e.user_id = u.id AND e.entity <> 'MCC';
```

### 6.1 Protocole — une base peuplée *avant* le changement

Une base a été montée au schéma **antérieur**, avec le code antérieur, puis peuplée, puis
migrée avec le code de `HEAD` :

```
sudo -u postgres psql -c "CREATE DATABASE clicktopay_nr2_old OWNER clicktopay;"
git worktree add …/wt-avant c9abaf3
cd …/wt-avant/…/server && DATABASE_URL=…/clicktopay_nr2_old node src/db/migrate.js && node src/db/seed.js
cd …/wt-avant/…/server && PORT=4101 DATABASE_URL=…/clicktopay_nr2_old node src/index.js &
#  → 6 actions d'administration jouées (2 créations de compte, 1 modification d'un compte
#    BQ002, 1 réinitialisation BQ001, 1 modification MCC, 1 création de banque)
#  → colonne bank_id absente, vérifiée par \d admin_events
kill $(lsof -nP -iTCP:4101 -sTCP:LISTEN -t)
cd …/server && DATABASE_URL=…/clicktopay_nr2_old node src/db/migrate.js     # code de HEAD
cd …/server && PORT=4101 DATABASE_URL=…/clicktopay_nr2_old node src/index.js &
```

### 6.2 L'historique de l'administrateur est intégralement préservé

| | Journal ADMIN |
| --- | --- |
| Avant migration (code antérieur) | `total 6` — ids 6, 5, 4, 3, 2, 1 |
| Après migration (code de `HEAD`) | `total 6` — ids 6, 5, 4, 3, 2, 1 |
| `diff` ligne à ligne | **identique — aucune ligne perdue** |

`ORDER BY` et libellés inchangés. **L'exigence « aucune ligne ne doit disparaître du
journal de l'administrateur » est satisfaite.** La ligne `MCC` (bank_id laissé `NULL`) est
servie à l'administrateur comme les autres : `NULL` n'élimine pas la ligne, il la met hors
périmètre des banquiers, ce qui est l'intention.

### 6.3 Mais la reprise attribue mal les lignes anciennes

État de la colonne après reprise :

```
 id | entity | entity_id |            action             | user_id | bank_id
  1 | USER   | 3         | MODIFICATION                  |       4 |       1   ← compte de BQ002
  2 | USER   | 1         | REINITIALISATION_MOT_DE_PASSE |       4 |       1
  3 | MCC    | 5977      | MODIFICATION                  |       4 |  (null)
  4 | BANK   | 3         | CREATION                      |       4 |       1   ← banque créée = id 3
  5 | USER   | 5         | CREATION                      |       4 |       1
  6 | USER   | 6         | CREATION                      |       4 |       1   ← compte de BQ002
```

La reprise pose la banque **de l'auteur** ; or l'auteur est ici l'administrateur, rattaché
à BQ001. Conséquences mesurées à travers l'API :

| Vue | Observé | Attendu si la banque concernée avait été reconstituée |
| --- | --- | --- |
| Journal du banquier **BQ001** | 5 lignes, dont l'id 1 (modification d'un compte **BQ002**), l'id 6 (création d'un compte **BQ002**) et l'id 4 (création de la banque **BQ777**) | 3 lignes |
| Journal du banquier **BQ002** | **2 lignes** — uniquement celles écrites *après* la migration | 4 lignes (les ids 1 et 6 lui reviennent) |

Autrement dit, dans l'historique repris, un banquier voit des lignes qui concernent une
autre banque, et perd des lignes qui concernent la sienne.

**Ce n'est pas une régression**, et c'est important de le dire précisément : **avant D-3
le banquier n'avait aucun accès au journal** (`routes/admin.js:55` — `requireRole('ADMIN')`
sur tout le routeur). Aucun comportement acquis n'est donc perdu, et le cloisonnement
n'est pas moins strict qu'avant, puisqu'il n'existait pas. Le commentaire du schéma assume
explicitement l'approximation. Elle est néanmoins consignée en `OBS-02` : elle est
**visible par l'utilisateur**, non signalée à l'écran, et un banquier qui lit son journal
n'a aucun moyen de savoir où l'historique repris s'arrête.

Les lignes écrites **après** la migration sont, elles, correctement attribuées : la
création d'un banquier BQ002 et son changement de mot de passe portent `bank_id = 2` et
n'apparaissent que dans le journal de BQ002. **Le gel à l'écriture fonctionne.**

### 6.4 Le changement de sens du filtre

`e.user_id IN (SELECT id FROM users WHERE bank_id = $n)` → `e.bank_id = $n`. Éprouvé par
mutation (§ 5.3) : les deux formes sont distinguées par les nouveaux cas. Sur le banc
`4100`, le filtrage et les totaux ont été confrontés à la base :

| Filtre | `total` annoncé | `GROUP BY` en base |
| --- | --- | --- |
| aucun | 16 | 16 |
| `entity=USER` | 14 | 1 CREATION + 10 MODIFICATION + 2 CHANGEMENT_MDP + 1 REINITIALISATION = 14 |
| `entity=BANK` | 2 | 1 CREATION + 1 MODIFICATION = 2 |
| `entity=MCC` | 0 | 0 |
| `action=CREATION` | 2 | 2 |
| `entity=BANK&action=CREATION` | 1 | 1 |
| `entity=NIMPORTEQUOI` | `400 Entité inconnue : « NIMPORTEQUOI ». Valeurs acceptées : USER, BANK, MCC.` | — (pas de total silencieusement faux) |

Balayage paginé complet (CAS-ADM-21), tailles de page 1, 3, 7, 10, 25 et 50 :

| Taille de page | Collectés | Uniques | Perdus | Doublons | Ordre |
| --- | --- | --- | --- | --- | --- |
| 1 · 3 · 7 · 10 · 25 · 50 | 16 à chaque fois | 16 | **0** | **0** | identique à la page unique |

**Conforme.**

---

## 7. Cas du plan rejoués à la main

Niveau BACK, cas **manuels ou partiels** au § 3 du plan, en priorité ceux dont les deux
changements ont touché le code. Banc `4100`, base `clicktopay_nr2`.

### 7.1 Authentification, jeton, mot de passe

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-AUTH-03 | Compte inexistant et mot de passe erroné indiscernables | `401 {"error":"Identifiants incorrects"}` dans les deux cas | conforme |
| CAS-AUTH-04 | Jeton illisible, schéma `Basic`, en-tête vide, en-tête absent : 401 | `401` sur les quatre (`Session expirée ou jeton invalide` / `Authentification requise`) | conforme |
| CAS-AUTH-06 | Un compte désactivé perd immédiatement ses accès | jeton déjà émis → `401 Compte désactivé` ; reconnexion → `401 Identifiants incorrects` | conforme |
| CAS-AUTH-07 | Un agent d'une banque désactivée n'accède plus | connexion `401` ; jeton déjà émis `401` | conforme (voir réserve ci-dessous) |
| CAS-AUTH-08 | Un agent muté de banque perd son ancien portefeuille, sans reconnexion | liste `count 3` → `count 1` ; ancien dossier D1 → `404` ; retour en BQ001 → `count 3` | conforme |
| CAS-AUTH-09 | Un changement de rôle s'applique sans reconnexion | `/api/admin/users` : `403` → promotion → `200` → rétrogradation → `403`, **même jeton** | conforme |
| CAS-AUTH-10 | Une réinitialisation ferme les sessions ouvertes | ancien jeton → `401 Mot de passe modifié : reconnectez-vous` | conforme |
| CAS-AUTH-11 | Mot de passe imposé : routes métier fermées, `/api/auth` ouvert | `403 Vous devez définir un nouveau mot de passe avant d’utiliser la plateforme.` sur `/api/requests`, `/api/mcc`, `/api/admin/users` ; `200` sur `/api/auth/me` | conforme |
| CAS-AUTH-12 | Les 4 variantes faibles refusées | `400 Données invalides` sur `court`, `minuscules2026`, `MAJUSCULES2026`, `SansChiffre#` | conforme |
| CAS-AUTH-13 | Mot de passe actuel erroné ; nouveau identique | `400 Le mot de passe actuel est incorrect.` · `400 Le nouveau mot de passe doit être différent de l’ancien.` | conforme |
| CAS-AUTH-14 | Jeton expiré et jeton mal signé : 401 | `401 Session expirée ou jeton invalide` pour les deux ; le jeton mal signé forçant `role:'ADMIN'` **n'ouvre rien** | conforme |

**Réserve sur CAS-AUTH-07.** La branche « Banque désactivée » du contrôle d'authentification
n'a **pas pu être isolée** par l'API seule : une banque comptant un compte actif refuse
d'être désactivée (`409`, CAS-ADM-13), et une fois le compte désactivé c'est
`401 Compte désactivé` qui est servi le premier. Le refus est bien obtenu, mais par l'autre
garde. **Sous-cas non atteint**, sans écriture directe en base — qui n'a pas été pratiquée
pour ne pas fausser le reste du banc.

### 7.2 Habilitation et cloisonnement

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-HAB-02 | L'agent n'arbitre pas | `403 Action réservée aux profils : BANQUIER` | conforme |
| CAS-HAB-03 | L'administration fermée à l'agent | `403 Action réservée aux profils : ADMIN, BANQUIER` sur `/admin/users`, `/admin/banks`, `/admin/events`, `/admin/mcc/:code/history` | conforme (§ 4) |
| CAS-HAB-04 | Cloisonnement sur `GET`, `/events`, `/suggestions`, `PUT`, `submit`, liste | refus sur les 5 routes, liste de BQ002 réduite à D2 | conforme **au code de retour près** (403 → 404, § 3 et § 4) |
| CAS-HAB-04 *étendu au banquier* | Le banquier ne voit pas au-delà de sa banque | `404` sur les 6 routes, `decision` comprise ; sa liste ne porte que BQ001 | conforme |
| CAS-HAB-05 | L'ADMIN cumule et voit toutes les banques | `GET /api/requests` sert les 3 dossiers des 2 banques ; `200` sur D1, D2, D3 | conforme (assumé par D-1) |
| CAS-HAB-06 | Un agent ne modifie pas la demande d'un collègue de sa banque | lecture `200` ; `PUT` **et** `submit` → `403 Vous ne pouvez modifier que les demandes que vous avez saisies.` | conforme — **et non basculé en 404** |
| CAS-HAB-07 | Le référentiel de lecture ouvert aux trois profils | 6 appels `200` | conforme |
| CAS-HAB-08 | Une route inexistante n'expose rien | `404 Route inconnue : GET /api/administration` · `404 Route inconnue : DELETE /api/requests/1` · `401 Authentification requise` sans jeton | conforme |
| CAS-HAB-12 | Le référentiel MCC hors de portée du banquier | `403 Action réservée aux profils : ADMIN` sur 5 routes + `POST /admin/banks` | conforme |

### 7.3 Cycle de vie d'une demande et décisions

Dossier D1 mené de bout en bout : `CREATION → MODIFICATION* → SOUMISSION →
COMPLEMENT_REQUIS → MODIFICATION → SOUMISSION → VALIDATION`.

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-DEM-01 | 201, référence, `BROUILLON`, banque et auteur | `AFF-2026-00001`, `BROUILLON`, `bankId 1`, `createdBy 1` | conforme |
| CAS-DEM-08 | Chaîne vide → `NULL` sur 5 colonnes | `t|t|t|t|t` en base, aucun 500 | conforme |
| CAS-DEM-09 | `PUT {}` et `PUT {champInconnu}` : 200, aucun événement | `count(MODIFICATION)` stable à 3 avant et après les deux appels | conforme |
| CAS-WF-01 | La soumission fige la photographie des suggestions | `/suggestions` sert 6 entrées VISA et 6 MASTERCARD, codes identiques | conforme |
| CAS-WF-03 | Demande soumise non modifiable par l'agent | `409 Une demande au statut SOUMISE n'est plus modifiable par l'agent.` | conforme |
| CAS-WF-06 | Rejet sans commentaire, et commentaire `""` | `400 Un commentaire est obligatoire pour un rejet ou une demande de complément.` dans les deux cas | conforme |
| CAS-WF-08 | Complément requis, reprise, re-soumission, validation | `COMPLEMENT_REQUIS` → `PUT 200` → `SOUMISE` → `VALIDEE`, `finalVisa/finalMC = 5977`, `decidedBy = 2`, `decidedAt` renseigné | conforme |
| CAS-WF-10 | `VALIDEE` terminal | `PUT` `409`, nouvel arbitrage `409 Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : VALIDEE).` | conforme |
| CAS-WF-10 *étendu* | Le nouveau droit d'écriture du banquier ne rouvre pas un dossier clos | `PUT` du banquier sur D1 `VALIDEE` → `409` | conforme |
| CAS-WF-11 | Re-soumission d'une demande déjà soumise refusée | `409`, même message | conforme |
| CAS-WF-13 | Journal complet, ordre chronologique, `userName` et `userRole` | 11 événements, ordre strict, aucune étape manquante | conforme |
| CAS-MCC-02 | Parité Visa / Mastercard | identique sur les 3 jeux rejoués | conforme |

### 7.4 Administration des comptes, des banques et du journal

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-ADM-06 | Le journal des comptes porte les valeurs avant et après | `{"champs":{"role":{"avant":"AGENT","apres":"BANQUIER"},"bankId":{"avant":{"id":2,"code":"BQ002"},"apres":{"id":1,"code":"BQ001"}},"lastName":{"avant":"Gharbi","apres":"Recette-2"}}}` | conforme |
| CAS-ADM-08 | L'administrateur ne change ni son rôle ni son état | `403 Vous ne pouvez pas modifier votre propre rôle.` · `403 Vous ne pouvez pas désactiver votre propre compte.` | conforme |
| CAS-ADM-09 | La plateforme conserve au moins un administrateur actif | rétrogradation croisée puis tentatives sur le dernier : `SELECT count(*) FROM users WHERE role='ADMIN' AND active` = 2 → 1 → **jamais 0** → 2 | conforme |
| CAS-ADM-12 | Création de banque : casse, doublon, code court, compteurs | `{"code":"bq009"}` → `201 code BQ009` · doublon `409 Le code banque BQ009 est déjà utilisé.` · `{"code":"B"}` → `400 Code banque trop court` | conforme |
| CAS-ADM-13 | Banque à comptes actifs non désactivable | `409 Cette banque compte 4 compte(s) actif(s). Désactivez-les avant de désactiver la banque.` ; banque vide → `200` | conforme |
| CAS-ADM-21 | Le journal pagine sans perte ni doublon, `total` juste | § 6.4 — 0 perdu, 0 doublon sur 6 tailles de page ; totaux confrontés au `GROUP BY` | conforme |
| CAS-ROB-07 | Identifiant de route non numérique ou hors bornes | `abc`, `1.5`, `-1`, `0`, `1 OR 1`, `99999999999999999999`, `null` → `400 Identifiant invalide : « … »` ; `999` → `404 … introuvable` ; idem sur `/api/requests` (`400 Demande invalide : « … »`) | conforme — **8 formes jouées, les 8 annoncées « reste à faire » au plan** |
| CAS-ROB-08 | Aucune valeur hostile de pagination ne produit de 500 | `limit` = 0, −5, 99999, `abc`, `1e9`, `9007199254740993` ; `offset` = −10, 999999, sur `/api/admin/events` **et** `/api/mcc` : **aucun 500**, toutes ramenées à une borne saine | conforme |

**Sur CAS-ADM-09**, une précision d'honnêteté : les deux tentatives sur le *dernier*
administrateur sont arrêtées par la garde « pas sur soi-même » (`403`), qui s'exécute avant
`assertResteUnAdmin`. L'**invariant** est bien vérifié (le compte d'administrateurs actifs
ne descend jamais sous 1), mais la garde `assertResteUnAdmin` elle-même n'est pas atteinte
par ce chemin ; elle l'est par CAS-ADM-10 (rétrogradations concurrentes), **automatisé** et
vert dans l'exécution isolée.

### 7.5 Moteur de suggestion — § 4.3 du plan

Ni `services/mccSuggestion.js`, ni `services/mccCatalog.js`, ni `data/` ne figurent dans
`git diff --name-only c9abaf3 3a7ac2e` : **le moteur est hors périmètre des deux
changements.** Contrôle de cohérence sur les trois jeux qui écartaient du plan :

| Jeu | Codes observés | Scores | `non-regression-lot1.md` | Verdict |
| --- | --- | --- | --- | --- |
| JD-01 | `5977, 7230, 7298, 5912, 5999` | `74, 66, 63, 57, 50` | identique | inchangé |
| JD-01 *sans secteur* | `5977, 5999` | `54, 50` | identique | inchangé |
| JD-10 | `5999` seul | `10` | identique | inchangé |

Ces trois écarts au § 4.3 sont **exactement ceux que `non-regression-lot1.md` § 3.1 a déjà
instruits** : ils tiennent à l'invariant « aucune proposition sans terme justificatif »
introduit à la vague 3, et **le § 4.3 est périmé, pas le moteur**. Ils ne sont **pas**
recomptés ici comme régressions. Les jeux JD-02 à JD-09 n'ont **pas** été rejoués (voir le
décompte, § 10) : le moteur n'étant touché par aucun des deux commits et le lot 1 les ayant
mesurés conformes, la dépense n'était pas justifiée. C'est un choix, pas une conformité
supposée : ils sont comptés **non exécutés**.

### 7.6 Robustesse et administration — cas BACK restés manuels

| Cas | Attendu | Observé | Verdict |
| --- | --- | --- | --- |
| CAS-ADM-05 | Banque inexistante ou désactivée refusée à la création et à la mutation | `400 Banque 999999 introuvable` · `400 Cette banque est désactivée : aucun compte ne peut y être rattaché.` (création **et** `PUT`) | conforme |
| CAS-ADM-07 | Mise à jour vide refusée sur compte et sur banque | `400`, `details[0].message = "Aucune modification fournie"` dans les deux cas | conforme |
| CAS-ROB-09 | Filtres de liste invalides | `?status=INEXISTANT` → `200 {"count":0,"items":[]}` · `?role=SUPERADMIN` → `400 Rôle invalide : « SUPERADMIN »` · `?bankId=abc` et `1.5` → `400 Banque invalide : « … »` | conforme |
| CAS-ROB-10 | Jokers et injection : aucune erreur SQL, **aucune fuite inter-banques** | agent2 (BQ002), 5 formes (`%`, `_`, `'`, `" OR 1=1 --`, `<script>`) → `200`, et `%`/`_` remontent **1** dossier, `bankId = [2]` uniquement ; `/api/mcc?search=' OR '1'='1` → `200`, `count 0` | conforme — **le cloisonnement tient sous joker** |
| CAS-ROB-11 | Corps malformés : aucune réponse 5xx | JSON tronqué → `400 Le corps de la requête n'est pas un JSON valide.` · 2 Mo → `413 … dépasse la taille autorisée (1 Mo).` · `[]` sur `suggest` → `400 Format attendu : objet` · `Content-Type: text/plain` → **`415`** au lieu du `400` annoncé | conforme sur l'acceptation (**aucun 5xx**) ; **écart au plan sur le sous-cas (3)**, antérieur aux deux changements |

L'écart de CAS-ROB-11 (3) n'est **pas** imputable à cette campagne : ni `src/app.js` ni
`src/middleware/` ne figurent dans `git diff --name-only c9abaf3 3a7ac2e`. Le `415` est
donc identique avant et après. Consigné en `DEF-ANT-01`.

---

## 8. Régressions

**Aucune régression n'a été constatée.**

Aucun cas identifié comme passant avant `3c03b25` n'a cessé de passer à `3a7ac2e`, ni dans
la suite automatisée (166/166 en exécution isolée), ni sur les 45 cas du plan repris à la
main, ni sur les chemins légitimes du correctif 403 → 404, ni sur l'historique d'une base
peuplée avant la migration.

La table `NRG-xx` est donc **vide**. Les cinq constats qui méritaient d'être ouverts le
sont ci-dessous (§ 9), sous leur nature exacte — trou de couverture, effet de bord assumé
de la reprise, perte de lisibilité d'une trace, défaut antérieur, défaut d'environnement.
Aucun n'est une perte de comportement acquis, et les compter comme régressions rendrait ce
rapport faux dans l'autre sens.

---

## 9. Observations et défauts antérieurs

### OBS-01 — La borne « la banque du corps est ignorée » n'est gardée par aucun test
**Gravité : majeure (couverture), nulle (comportement actuel).**
Cas concerné : CAS-HAB-01 / borne 3 de D-3 · **Attendu** : un test tombe si le corps de la
requête peut imposer la banque d'un dossier · **Observé** : la suite entière reste verte
sous la mutation M4. · Reproduction : § 5.1. Le comportement, lui, est **correct**
aujourd'hui (`bankId 2` du corps ignoré, dossier créé en BQ001). C'est l'angle mort qui est
en cause, pas le produit. Un cas d'une ligne dans `requests.test.js` — envoyer
`{...DEMANDE_VALIDE, bankId: 2}` en banquier BQ001 et asserter `bankId === 1` — le ferme.

### OBS-02 — La reprise du journal attribue les lignes anciennes à la banque de l'auteur
**Gravité : moyenne.**
Cas concerné : aucun cas du plan (fonction née avec D-3) · **Attendu** (intention du
correctif) : la banque **concernée** par l'action · **Observé** : la banque **de l'auteur**,
pour les seules lignes antérieures à la colonne. Un banquier voit donc, dans l'historique
repris, des lignes concernant une autre banque, et ne voit pas des lignes concernant la
sienne. Mesure et reproduction : § 6.3. **Pas une régression** : avant D-3 le banquier
n'avait aucun accès au journal. Le schéma assume l'approximation ; ce qui manque est qu'elle
soit **signalée à l'utilisateur** — rien à l'écran ne dit où s'arrête l'historique repris.

### OBS-03 — Un événement `MODIFICATION` de dossier peut désormais être vide
**Gravité : mineure.**
Cas concerné : CAS-DEM-07 / CAS-DEM-09 (aucun ne l'assertait) · **Attendu** : une ligne de
journal dit quelque chose · **Observé** : `{"champs": [], "modifications": {}}`.
`payload.champs` valait `Object.keys(payload)` (les champs **soumis**) et vaut désormais
`Object.keys(modifications)` (les champs **réellement changés**). Un `PUT` qui réécrit un
champ connu à l'identique franchit la sortie anticipée (`sets.length > 0`) mais ne produit
plus aucune entrée dans la trace : une ligne vide s'inscrit au journal du dossier.

```
curl -s -X PUT http://127.0.0.1:4100/api/requests/1 -H "Authorization: Bearer $AG" \
  -H 'Content-Type: application/json' -d '{"siteName":"<la valeur actuelle>"}'
curl -s http://127.0.0.1:4100/api/requests/1/events -H "Authorization: Bearer $AG"
→ … {"type":"MODIFICATION","payload":{"champs":[],"modifications":{}}} …
```

Aucun cas du plan ne tombe (CAS-DEM-09 porte sur `{}` et `{champInconnu}`, qui sortent bien
en amont — vérifié conforme). Le correctif gagne par ailleurs beaucoup : valeurs avant et
après présentes, RIB masqué (`••••••••••••••••7890`). Constat de complétude, pas de reproche.

### DEF-ANT-01 — `Content-Type: text/plain` répond 415 et non 400
**Gravité : mineure. Défaut antérieur, hors du débit de cette campagne.**
Cas concerné : CAS-ROB-11 (3) · **Attendu au plan** : `400`, corps non analysé, champs
obligatoires signalés par zod · **Observé** : `415 {"error":"Type de contenu non pris en
charge : JSON attendu."}`. L'acceptation du cas (« aucune réponse 5xx ») est tenue. Ni
`src/app.js` ni `src/middleware/` ne sont touchés par `3c03b25` ni `3a7ac2e` : le
comportement est identique avant et après. Le plan est à amender, ou le cas à requalifier.

### DEF-ENV-01 — La suite automatisée n'est pas ré-entrante
**Gravité : majeure pour l'exploitation du banc, nulle pour le produit.**
`tests/helpers.js` vise `clicktopay_test` par défaut et ouvre chaque fichier par un
`TRUNCATE`/`DELETE` global. Deux exécutions simultanées se verrouillent mutuellement
(`40P01`) et se polluent le journal. Deux exécutions sur trois ont été perdues de ce fait
(§ 2.1, § 2.2). Le remède existe déjà et ne coûte rien : `TEST_DATABASE_URL` est honoré
par `helpers.js`. Il gagnerait à être la voie documentée dès que plusieurs postes
partagent une instance PostgreSQL.

### Point de cohérence contrôlé, sans défaut
La politique 404 ne s'applique pas aux banques : `PUT /api/admin/banks/:id` répond `403
Vous ne gérez que votre propre banque.` au banquier. **Aucune fuite** pour autant : la
banque inexistante `999` donne **le même** `403`, donc le balayage n'apprend rien. La
différence de code entre types d'objets est un choix, pas un trou.

---

## 10. Décompte

### 10.1 Suite automatisée

| Exécution | Résultat | Lecture |
| --- | --- | --- |
| 1 — `npm test` (base partagée) | 166 / 100 pass / 9 fail / 57 cancelled | contention externe, `40P01` sur `clicktopay_test.users` |
| 2 — `npm test` (base partagée) | 166 / 145 pass / 2 fail / 19 cancelled | même cause, autre symptôme |
| **3 — isolée (`TEST_DATABASE_URL`)** | **166 / 166 pass / 0 fail / 0 cancelled** | **mesure retenue** |

Aucun cas annulé pour cause d'arrêt de PostgreSQL : le service est resté disponible du
début à la fin de la campagne.

### 10.2 Cas du plan

| Issue | Nombre | Détail |
| --- | --- | --- |
| **Rejoués** | **45** | 11 AUTH · 10 HAB · 11 DEM/WF/MCC · 8 ADM · 5 ROB |
| **Conformes** | **41** | — |
| **En écart, délibéré** (plan à amender) | **3** | CAS-HAB-01, CAS-HAB-04, CAS-HAB-11 — voir § 4 |
| **En écart, antérieur** | **1** | CAS-ROB-11 (3) — `DEF-ANT-01` |
| **Régressions** | **0** | — |
| **Sous-cas non atteint** | **1** | CAS-AUTH-07, branche « Banque désactivée » : inatteignable par l'API seule (§ 7.1) |

### 10.3 Non exécutés, et pourquoi

| Cas | Raison |
| --- | --- |
| JD-02 à JD-09 (8 jeux du § 4.3) | moteur hors périmètre des deux commits (`git diff --name-only` ne cite ni `mccSuggestion.js`, ni `mccCatalog.js`, ni `data/`) ; mesurés conformes par `non-regression-lot1.md`. Choix assumé. |
| CAS-MCC-05, CAS-MCC-06 | même raison |
| CAS-ROB-12, CAS-ROB-13 | non atteints faute de temps ; aucun lien avec le code modifié |
| CAS-HAB-09, CAS-HAB-10 | niveau Nav. — hors du périmètre BACK de cette campagne |
| Tous les cas de filière FRONT / Nav. | idem. **L'interface a été modifiée par les deux commits** (`App.jsx`, `AuthContext.jsx`, `AdminLayout.jsx`, `AdminUsersPage.jsx`, `AdminBanksPage.jsx`, `DashboardPage.jsx`, `RequestDetailPage.jsx`) : **une campagne de non-régression en navigateur reste à faire**, notamment sur le bandeau d'erreur de CAS-HAB-04 (6), dont le libellé attendu au plan a changé. |

Aucune conformité n'est supposée : tout ce qui est marqué conforme ci-dessus a été
exécuté et observé sur le banc `4100`.

---

## 11. Verdict

**Le périmètre acquis est intact.**

1. **Suite automatisée** : 166 / 166 en exécution isolée. Les deux exécutions rouges
   s'expliquent entièrement par une base de test partagée avec un autre poste, cause
   établie par le `regclass` du verrou et non supposée.
2. **Cloisonnement** : il est **plus strict** qu'avant, jamais moins. Le refus est passé de
   403 à 404 sur les dossiers et les comptes, et l'indiscernabilité avec un objet
   inexistant est complète sur toutes les routes éprouvées, y compris `/events`,
   `/suggestions` et `decision`. Il tient aussi sous jokers `ILIKE` (CAS-ROB-10).
3. **Chemins légitimes** : aucun 404 rendu à tort. L'agent sur ses dossiers, le banquier
   sur ceux de sa banque et l'administrateur sur les trois banques répondent tous `200`.
   Le refus opposé à un agent sur le dossier d'un collègue **reste un 403 explicite** :
   le correctif n'a pas emporté le message dont l'utilisateur légitime a besoin.
4. **L'agent se comporte exactement comme avant.** Aucun des 11 cas d'authentification,
   des cas de cycle de vie ni des cas d'administration ne le voit changer de
   comportement ; le seul changement qui le concerne est le code de retour sur un dossier
   hors de son périmètre — un chemin d'erreur, jamais un chemin nominal.
5. **Migration du journal** : l'historique de l'administrateur est intégralement préservé,
   ligne pour ligne, sur une base peuplée avant le changement. Aucune ligne ne disparaît.
6. **Tests réécrits** : trois sur quatre prouvent autant ou davantage, dont les deux cas du
   journal qui passent de « ne protège rien » (mesuré : 18/18 verts avec le filtre retiré)
   à « tombent sur les deux mutations ». La quatrième laisse un angle mort réel (`OBS-01`).

Deux réserves, à traiter mais sans effet sur ce verdict : le trou de couverture `OBS-01`,
et la reprise du journal `OBS-02`, dont l'approximation est assumée par le schéma mais
n'est signalée nulle part à l'utilisateur. Enfin, l'interface a été modifiée par les deux
commits et **n'a pas été éprouvée ici** : cette campagne couvre le BACK.
