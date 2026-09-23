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

- **régression** (§ 6, `NRG-xx`) — perte effective de comportement acquis ;
- **changement délibéré** (§ 4) — le comportement change parce que la décision ou le
  correctif le veut ; le cas du plan devient caduc, le plan doit être amendé ;
- **défaut antérieur** (§ 7) — déjà présent avant, non porté au débit de ces changements.

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

**Constat d'environnement, consigné en § 7 (DEF-ENV-01)** : la suite n'est pas
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
