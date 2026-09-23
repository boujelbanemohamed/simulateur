# Revue de code du lot 1 — évolutions EVO-01 à EVO-12

> Commit relu : `c9abaf3` « Livrer le lot 1 des évolutions : consolidation »,
> comparé à `154edba`. Références croisées : `docs/evolutions-proposees.md`
> (cahier des charges, une fiche par évolution) et `docs/journal-lot1.md`
> (compte rendu de l'auteur et écarts qu'il assume).
>
> **Le lot est relu tel qu'il se présente aujourd'hui dans l'arbre de travail**,
> et non figé au commit : l'arbre porte depuis trois commits postérieurs
> (`78d44b0`, `3c03b25` — habilitation du banquier ; `3a7ac2e` — correctifs des
> revues de sécurité et d'habilitation) qui touchent directement des pièces du
> lot 1, en particulier le journal d'administration. C'est cette version-là qui
> partirait en service. Ce qui relève des commits postérieurs et non du lot 1 est
> signalé comme tel.
>
> **Méthode.** Rien n'est retenu sur la seule lecture : tout constat bloquant ou
> majeur est accompagné d'une exécution reproductible dont la sortie est citée.
> Deux bases dédiées, `revue_lot1` et `revue_lot1_test`, ont été créées pour
> l'occasion et détruites en fin de revue ; `clicktopay` et `clicktopay_test`
> n'ont pas été touchées, non plus que les ports 4000 et 5173. Les tests
> importants sont éprouvés par mutation : la garde est retirée du source, le test
> doit rougir, la garde est remise, `git status` est vérifié vierge.
>
> **Aucun fichier du projet n'a été modifié**, hors le présent document.

---

## Sommaire

1. État du chantier et environnement
2. Ce que le lot fait bien
3. Constats bloquants
4. Constats majeurs
5. Constats mineurs
6. Les quatre points signalés par l'auteur
7. Migration
8. Ce que j'ai éprouvé par mutation
9. Ce que je soupçonne sans l'avoir prouvé
10. Synthèse

---

## 1. État du chantier et environnement

*(rédaction en cours)*

La suite compte **166 tests**. Sur une base de revue dédiée, elle est **entièrement
verte** : `# tests 166 / # pass 166 / # fail 0 / # cancelled 0`.

*Note d'environnement, à lire avant de conclure à une régression.* Lancée sur
`clicktopay_test`, la même suite a d'abord rendu `6 fail / 12 cancelled`, puis
`8 fail / 7 cancelled`, puis rien du tout. Ce n'est pas le lot : **un autre agent
exécutait la même suite sur la même base au même moment**
(`ps` montre un second `node --test` en cours, et `pg_stat_activity` une
connexion « idle in transaction » sur `clicktopay_test`). Les suites du projet
partagent une base unique et commencent par `TRUNCATE` / `DELETE` : deux
exécutions simultanées se détruisent mutuellement leur jeu d'essai. J'ai donc
travaillé sur `revue_lot1_test`, via `TEST_DATABASE_URL`, que `tests/helpers.js`
prévoit justement (`helpers.js:5`). PostgreSQL ne s'est pas arrêté pendant la
revue.

Le rôle `clicktopay` n'a pas l'attribut `CREATEDB` sur cette machine :
`createdb -h 127.0.0.1 -U clicktopay revue_lot1` est refusé
(« permission denied to create database »). Les deux bases ont été créées par le
rôle `postgres` (`createdb -O clicktopay`) et détruites en fin de revue. Elles
existaient déjà à mon arrivée, laissées par une passe antérieure : je les ai
d'abord supprimées.

Une instance d'API m'appartenant a tourné sur le **port 4400**. Les ports 4000 et
5173 n'ont pas été touchés.

---

## 7. Migration

Épreuve réelle, et non lecture. Base `revue_lot1` remise au schéma d'avant le lot
(`git show 154edba:…/schema.sql`), peuplée par `seed.js` (2 banques, 279 MCC,
4 comptes, journal antérieur), puis migrée avec le `schema.sql` d'aujourd'hui.

| Situation | Résultat |
| --- | --- |
| Base peuplée **sans** doublon de casse, première passe | `Migration terminée.`, code 0 |
| La même, deuxième passe immédiate | `Migration terminée.`, code 0 — **idempotente** |
| Colonnes ajoutées | `admin_events.bank_id`, `mcc_suggestions.label_at_submit`, `mcc_suggestions.description_at_submit`, toutes nullables |
| Index posés | `idx_users_email_lower` sur `lower(email)` ; `idx_admin_events_date` sur `(created_at DESC, id DESC)` ; `idx_admin_events_bank` sur `(bank_id, created_at DESC)` |
| Reprise des lignes antérieures | les trois lignes `USER` reçoivent une banque, la ligne `MCC` reste `NULL` — conforme à l'intention écrite |
| Données | comptes et journal intacts |
| Base peuplée **avec** un doublon de casse | `Échec de la migration : … ces adresses existent en plusieurs casses … : agent@banque.tn`, code 1 |
| État après cet échec | **rien n'est appliqué** — ni `bank_id`, ni les deux colonnes de photographie, ni `idx_admin_events_bank`, et `idx_admin_events_date` reste l'ancien index à une colonne |

Deux conclusions, l'une bonne, l'autre non.

**Ce qui va bien.** Sur une base peuplée sans doublon, la migration est
**rejouable et idempotente**, y compris la reprise des lignes antérieures du
journal : le `WHERE e.bank_id IS NULL AND e.entity <> 'MCC'` ne peut plus trouver
de ligne à reprendre une fois la première passe faite, puisque tout écrivain
non-MCC renseigne désormais la banque (`admin.js:206, 286, 346, 379, 431, 482`)
et que le seul écrivain qui la laisse nulle est l'import de référentiel
(`mccAdmin.js:96, 406`), exclu par le `<> 'MCC'`. Le `DROP INDEX IF EXISTS`
suivi du `CREATE INDEX IF NOT EXISTS` est le bon geste, et son commentaire
explique justement pourquoi `IF NOT EXISTS` seul ne suffisait pas. Le garde-fou
sur les doublons nomme les adresses en cause plutôt que de laisser PostgreSQL
refuser l'index sur une erreur brute : c'est ce que la fiche demandait.

**Ce qui ne va pas** est consigné en **RL1-01** (le tout-ou-rien, aggravé par les
deux évolutions de schéma postérieures), **RL1-04** (la reprise recopie la banque
de l'auteur, c'est-à-dire précisément le défaut que le commit `3a7ac2e` venait de
corriger) et **RL1-13** (aucun test n'exerce le garde-fou).

---
## Constats

> Rédigés au fil de l'eau, puis classés par gravité décroissante.

### RL1-01 — La migration est tout ou rien : un seul doublon de casse laisse l'API servir un schéma d'avant le lot

**Gravité** bloquant. **Fichiers** `server/src/db/schema.sql:233-249` (le
garde-fou) et `server/src/db/migrate.js:9` (`pool.query(sql)`).

**Constat.** `migrate()` envoie le fichier entier en une seule requête simple :
PostgreSQL l'exécute dans **une transaction implicite unique**. Le
`RAISE EXCEPTION` du bloc `DO $$` annule donc *tout le fichier*, y compris les
quatre évolutions de schéma qui n'ont rien à voir avec les adresses
électroniques. Le constat existait déjà au commit `c9abaf3` ; les deux
évolutions de schéma postérieures (`admin_events.bank_id` et son index) l'ont
**aggravé**, car elles portent désormais le cloisonnement du journal.

**Scénario qui casse (exécuté).** Base `revue_lot1` au schéma d'avant le lot,
peuplée, portant un doublon `agent@banque.tn` / `Agent@banque.tn` :

```
$ node src/db/migrate.js
Échec de la migration : Migration interrompue : ces adresses existent en plusieurs
casses et doivent être corrigées avant la pose de l'index unique : agent@banque.tn
code=1
```

L'exploitant qui enchaîne migration et redémarrage sans regarder le code de
sortie obtient une API qui **démarre** et se déclare **en bonne santé** :

```
GET /api/health -> 200 {"status":"ok","base":"joignable","referentiel":"charge","ecoute":"active","codes":279}
```

et qui casse en trois endroits, tous en 500 :

```
POST /api/admin/users        -> 500 {"error":"Erreur interne du serveur"}
   serveur : column "bank_id" of relation "admin_events" does not exist
POST /api/requests/1/submit  -> 500 {"error":"Erreur interne du serveur"}
   serveur : column "label_at_submit" of relation "mcc_suggestions" does not exist
GET  /api/admin/events  (banquier) -> 500 {"error":"Erreur interne du serveur"}
   serveur : column e.bank_id does not exist
```

La connexion, la lecture des dossiers, la création d'un brouillon fonctionnent :
le défaut ne se voit ni au démarrage, ni au contrôle de santé, ni à la première
minute d'exploitation. Il se voit quand un agent soumet son premier dossier et
quand l'administrateur crée son premier compte — c'est-à-dire trop tard. Et
comme **toute** écriture d'administration passe par `journaliser`, ce n'est pas
une fonction qui tombe, c'est l'administration entière.

**Correction proposée.**

1. **Un contrôle de schéma au démarrage**, dans `index.js`, avant `listen()` :
   vérifier la présence de `admin_events.bank_id`, `mcc_suggestions.label_at_submit`
   et `description_at_submit` par `information_schema.columns`, et refuser de
   démarrer si l'une manque. Servir faux est pire que ne pas servir. C'est le
   geste le plus court et le plus sûr des trois.
2. Déplacer le bloc `DO $$` et le `CREATE UNIQUE INDEX` **en fin de fichier**, de
   sorte qu'un refus sur les adresses n'entraîne pas les colonnes et les index
   qui n'en dépendent pas. Le comportement voulu — refuser l'index unique — reste
   obtenu.
3. Compléter le message du `RAISE` par la marche à suivre : « corrigez-les depuis
   l'écran d'administration des comptes, ou par `UPDATE users SET email = … WHERE
   id = …`, puis relancez `npm run db:migrate` ». Le contrôleur qui lit le
   message ne connaît pas nécessairement le schéma.
4. Aucun test n'exerce le garde-fou : voir RL1-13.

---

### RL1-02 — La reprise des lignes antérieures du journal recopie la banque de l'auteur : elle réintroduit, sur tout l'historique, le défaut que `3a7ac2e` venait de corriger

**Gravité** bloquant. **Fichier** `server/src/db/schema.sql:216-221`.

**Constat.** Le commit `3a7ac2e` a corrigé, à juste titre, le fait que le journal
était partitionné « en interrogeant la banque actuelle de l'auteur d'une action,
et non la banque concernée par cette action ». La colonne `bank_id` est
désormais figée à l'écriture. Mais la reprise des lignes déjà écrites fait
**exactement ce que le correctif condamne** :

```sql
UPDATE admin_events e
   SET bank_id = u.bank_id
  FROM users u
 WHERE e.bank_id IS NULL AND e.user_id = u.id AND e.entity <> 'MCC';
```

`u.bank_id` est la banque **actuelle de l'auteur**. Le commentaire l'assume
(« faute de mieux »), mais il y a mieux, et c'est immédiat : pour `entity = 'BANK'`,
`entity_id` **est** l'identifiant de la banque concernée ; pour `entity = 'USER'`,
`entity_id` est l'identifiant du compte, dont la banque se lit par une jointure.
La valeur juste est à portée de `JOIN`, elle n'a pas été prise.

**Scénario qui casse (exécuté).** Base `revue_lot1` au schéma d'aujourd'hui,
deux banques, un journal antérieur à la colonne où l'administrateur (banque 1) a
créé un compte de la **banque 2** et renommé la **banque 2** :

```
après migration :
 id | user_id | entity | entity_id | bank_id
  1 |       4 | USER   | 3         |       1     <- le compte 3 est de la banque 2
  2 |       4 | BANK   | 2         |       1     <- la banque concernée EST la 2
  3 |       4 | MCC    | 5977      |             <- correct : portée plateforme
```

Vu de l'API, banquier de la banque 1 (`GET /api/admin/events`) :

```json
{"count":2,"total":2,"items":[
  {"entity":"BANK","entityId":"2","action":"MODIFICATION",
   "payload":{"champs":{"name":{"avant":"BIAT","apres":"Banque Internationale Arabe de Tunisie"}}}},
  {"entity":"USER","entityId":"3","action":"CREATION",
   "payload":{"role":"AGENT","email":"agent2@banque.tn","bankId":2,"bankCode":"BQ002"}}]}
```

et banquier de la banque 2, pour le même journal :

```json
{"count":0,"total":0,"items":[]}
```

Le banquier de la banque 1 lit l'adresse électronique et le rôle d'un compte de
la banque 2, ainsi que l'ancien et le nouveau nom de la banque 2. Le banquier de
la banque 2 ne voit **rien** de sa propre histoire. C'est la fuite inter-banques
décrite par la revue de sécurité, refermée pour les lignes futures et rouverte
pour toutes les lignes passées — c'est-à-dire, sur une base de production, pour
la totalité de l'historique existant au jour du déploiement.

C'est le défaut d'invariant caractéristique de ce projet : la règle a été posée
au bon endroit pour l'avenir, et la reprise des données n'a pas été écrite avec
la même règle.

**Correction proposée.** Dériver la banque de la **cible**, pas de l'auteur, et
laisser `NULL` — donc visible du seul administrateur — ce qu'on ne sait pas
rattacher. C'est fermé, et c'est honnête :

```sql
-- La banque d'une ligne ancienne se déduit de sa CIBLE, qui est justement ce que
-- `entity_id` désigne : la banque elle-même pour une action de banque, le compte
-- visé pour une action de compte. Ce qu'on ne sait pas rattacher reste NULL,
-- donc réservé à l'administrateur : mieux vaut une ligne invisible qu'une ligne
-- rendue à la mauvaise banque.
UPDATE admin_events e SET bank_id = e.entity_id::int
 WHERE e.bank_id IS NULL AND e.entity = 'BANK' AND e.entity_id ~ '^\d+$';

UPDATE admin_events e SET bank_id = u.bank_id
  FROM users u
 WHERE e.bank_id IS NULL AND e.entity = 'USER'
   AND e.entity_id ~ '^\d+$' AND u.id = e.entity_id::int;
```

Un test de non-régression est possible sans base dédiée : insérer trois lignes
`bank_id` nul, rejouer `migrate()`, asserter les trois banques obtenues.

---
### RL1-03 — Le refus des types de contenu inattendus exempte le multipart partout, pas seulement à la route qui le consomme

**Gravité** majeur. **Fichier** `server/src/app.js:46-51`, monté ligne 60.

**Constat.** L'intergiciel dédié qu'a exigé EVO-10 est monté **globalement** et
admet `multipart/form-data` sur **toutes** les routes :

```js
function typeDeContenuAttendu(req, res, next) {
  const aUnCorps = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'];
  if (!aUnCorps) return next();
  if (req.is('json') || req.is('multipart/form-data')) return next();   // ligne 49
  return next(new HttpError(415, 'Type de contenu non pris en charge : JSON attendu.'));
}
```

Une seule route attend du multipart : `POST /api/admin/mcc/import-fichier`.
Partout ailleurs, l'exemption rouvre le symptôme même que la fiche demandait de
fermer — celui que le commentaire de l'auteur décrit ligne 41-44 : « la route
répondait alors “Données invalides” sur des champs pourtant renseignés, ce qui
n'aide personne ».

**Scénario qui casse (exécuté, port 4400).**

```
POST /api/auth/login  en multipart -> 400 {"error":"Données invalides",
    "details":[{"champ":"email","message":"Champ obligatoire"},
               {"champ":"password","message":"Champ obligatoire"}]}
POST /api/requests    en multipart -> 400 {"error":"Données invalides",
    "details":[{"champ":"siteName","message":"Champ obligatoire"}, …]}

pour comparaison, les mêmes routes en urlencoded, texte brut et XML :
-> 415 {"error":"Type de contenu non pris en charge : JSON attendu."}   (les trois)
```

La fiche EVO-10, cas limite 3, dit : « type de contenu inattendu **sur une route
qui attend du JSON** — réponse **415** ». Le multipart sur `/api/auth/login` est
un type de contenu inattendu sur une route qui attend du JSON : il reçoit 400,
assorti d'un diagnostic faux — on annonce à l'utilisateur que son adresse manque
alors qu'il l'a envoyée. C'est le défaut d'invariant caractéristique : la classe
a été fermée par une porte plus large que nécessaire.

**Correction proposée.** Ne pas exempter le multipart globalement, mais nommer la
seule route qui le consomme :

```js
// Une seule route reçoit du multipart : le téléversement du référentiel. Exempter
// le type partout rouvrirait, sur les routes JSON, le diagnostic faux qu'on
// cherche précisément à supprimer.
const ROUTES_MULTIPART = new Set(['/api/admin/mcc/import-fichier']);
if (req.is('json')) return next();
if (ROUTES_MULTIPART.has(req.path) && req.is('multipart/form-data')) return next();
return next(new HttpError(415, 'Type de contenu non pris en charge : JSON attendu.'));
```

et **deux tests pour verrouiller les deux côtés** : « multipart sur
`/api/auth/login` → 415 » et « multipart sur `/api/admin/mcc/import-fichier`
→ 200 ». Le second existe déjà à foison (voir mutation M-E, § 8) ; le premier
manque, et c'est pourquoi le défaut a survécu.

**Ce qui va bien, et qu'il faut dire** : le multipart du téléversement **reste
admis**, vérifié en exécution — `POST /api/admin/mcc/import-fichier` avec un
`.csv` attaché répond `200` et rend le rapport d'écart complet. La crainte de
l'auteur était fondée et sa parade fonctionne ; elle est seulement trop large.

---

### RL1-04 — Le balayage d'invariant d'EVO-10 ne peut pas rougir pour le défaut qu'il nomme

**Gravité** majeur. **Fichier** `server/tests/robustesse.test.js:825-849`.

**Constat.** La fiche EVO-10 pose un invariant : « sur un balayage des routes de
l'API, aucune réponse de statut ≥ 400 ne contient, dans son corps, ni le mot
`at ` suivi d'un chemin de fichier, ni la chaîne `node_modules`, ni une pile
d'appel, ni un extrait de requête SQL ». Le test écrit exerce **treize appels
choisis à la main**, tous sur des routes JSON, et confronte le corps à quatre
motifs littéraux.

**Preuve que le balayage est inopérant (mutation M-A).** J'ai remplacé, dans
`middleware/errors.js:27`, `'Erreur interne du serveur'` par `String(err.stack)` :
une pile d'appel complète sort alors sur toute réponse 500.

```
# tests 51  # pass 50  # fail 1
not ok 4 - une panne applicative ne sort que « Erreur interne du serveur »
```

**Le balayage reste vert.** Seul le test dédié n° 4 rougit. La raison est
mécanique : aucun des treize appels ne produit de réponse ≥ 500 — ils sont tous
en 400, 401, 403 ou 404 —, si bien que les motifs de pile ne sont jamais
confrontés à une pile. Un test qui ne peut pas échouer pour le défaut qu'il nomme
ne protège de rien ; il donne seulement l'impression d'un filet.

**Et la fuite qu'il devrait voir existe (exécuté).** Le balayage n'appelle jamais
la route de téléversement, où le message d'une bibliothèque tierce est renvoyé
verbatim :

```
POST /api/admin/mcc/import-fichier, fichier « r.xlsx » contenant « pas un zip »
-> 400 {"error":"Fichier illisible : Can't find end of central directory :
        is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html"}
POST /api/admin/mcc/import-fichier, fichier « r.json » contenant « {"a": »
-> 400 {"error":"Fichier illisible : Unexpected end of JSON input"}
```

Le message désigne la pile technique employée (JSZip, donc `exceljs`), URL de
documentation comprise. Ce n'est pas un renseignement que l'on donne gratuitement
à qui sonde une API bancaire.

**Correction proposée.** Deux gestes distincts, et il faut les deux.

1. **Fermer la fuite** : `routes/admin.js` ne doit pas relayer `err.message` d'une
   bibliothèque tierce. Un message stable
   (« Fichier illisible : le classeur n'a pas pu être ouvert. Vérifiez qu'il
   s'agit bien d'un .xlsx, .csv ou .json valide. ») et `console.error(err)` côté
   serveur pour le diagnostic.
2. **Rendre le balayage capable de rougir** : l'alimenter depuis la table de
   routage d'Express plutôt qu'à la main, y inclure au moins un appel qui produit
   un 500 et un appel sur la route de téléversement, et remplacer la liste noire
   de motifs par une **liste blanche** — le corps d'une réponse d'erreur ne
   contient que `error`, et éventuellement `details` dont chaque entrée n'a que
   `champ` et `message`. Une liste blanche ferme la classe ; une liste noire ne
   ferme que ce qu'on a su nommer.

---

### RL1-05 — Un multipart tronqué sort en 500

**Gravité** majeur. **Fichier** `server/src/routes/admin.js` (`erreursDeTeleversement`).

**Constat.** L'intergiciel de traduction ne connaît que deux codes :
`LIMIT_FILE_SIZE` et `LIMIT_UNEXPECTED_FILE`. Les erreurs que `busboy` lève sur
un corps multipart mal formé ne portent **aucun** `code` : elles traversent,
arrivent dans `errorHandler` avec `status` indéfini, et sortent en 500.

**Scénario qui casse (exécuté).** `POST /api/admin/mcc/import-fichier` avec un
corps multipart dont la frontière de clôture manque — ce que produit un
téléversement interrompu par une coupure réseau du navigateur :

```
-> 500 {"error":"Erreur interne du serveur"}
journal serveur : Error: Unexpected end of form
    at Multipart._final (.../busboy/lib/types/multipart.js:588:17)
```

Le corps de la réponse ne fuit rien, c'est acquis. Mais le statut est faux : la
supervision compte un incident serveur là où la requête du client était en
cause, et l'administrateur ne comprend pas pourquoi son import échoue. C'est le
même défaut d'invariant que RL1-04 : deux codes constatés ont été traduits, la
classe « erreur de lecture du corps multipart » ne l'a pas été.

**Correction proposée.** Renverser la logique : ne plus énumérer les codes connus,
mais rattacher à 400 tout ce qui provient de l'étage de téléversement.

```js
function erreursDeTeleversement(err, req, res, next) {
  if (!err || err instanceof HttpError) return next(err);
  if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'Le fichier dépasse la taille autorisée (5 Mo).'));
  if (err.code === 'LIMIT_UNEXPECTED_FILE') return next(badRequest('Champ de fichier inattendu : le fichier doit être transmis sous le nom « fichier ».'));
  // Tout le reste vient de multer ou de busboy : c'est le corps envoyé qui est en
  // cause, pas le serveur. On journalise le détail et on refuse en 400.
  console.error('Téléversement illisible :', err);
  return next(badRequest("Le fichier n'a pas pu être lu : la requête de téléversement est incomplète ou mal formée."));
}
```

Test à ajouter : corps multipart tronqué → 400, et **aucun 500** sur cette route
quel que soit le corps envoyé.

---

### RL1-06 — La clé du limiteur est construite sur une valeur non validée et non bornée : 500 ko de mémoire retenus par requête

**Gravité** majeur. **Fichiers** `server/src/routes/auth.js:21-24`,
`server/src/services/requestSchema.js:120` et `server/src/middleware/rateLimit.js:30`.

**Constat.** EVO-11 fait passer `loginLimiter` **avant** `validate(loginSchema)` —
c'est l'objet de la fiche, et c'est juste. Conséquence non discutée : le
`keyGenerator` lit `req.body.email` **avant** toute validation, et en fait une
clé de `Map` conservée pendant toute la fenêtre (quinze minutes par défaut) :

```js
req.body?.email ? `compte:${String(req.body.email).toLowerCase()}` : null,
```

Rien ne borne la longueur. Et la validation ne l'aurait pas bornée davantage :
`loginSchema.email` est `z.string().trim().email(...)` **sans `.max()`**, alors
que tous les autres champs de texte du produit passent par `trimmed(max)` et que
la colonne en base est un `VARCHAR(160)`.

**Scénario qui casse (mesuré).** Deux cents requêtes de connexion portant chacune
une adresse de 500 ko, contre le même processus :

| Épreuve | RSS avant | RSS après | Écart |
| --- | --- | --- | --- |
| 200 adresses **distinctes** de 500 ko | 91 Mo | 228 Mo | **+137 Mo** |
| Témoin : 200 fois la **même** adresse de 500 ko | 89 Mo | 125 Mo | +36 Mo |

L'écart entre les deux lignes — une centaine de mégaoctets, soit exactement
200 × 500 ko — est la mémoire **retenue par les clés du limiteur**, jusqu'à
expiration de la fenêtre. Avec le plafond de corps à 1 Mo, chaque requête peut en
retenir un ; le quota par adresse IP plafonne à `max` (10 par défaut) le nombre
de clés qu'une source peut créer, soit une dizaine de mégaoctets par source et
par quart d'heure. Cent sources suffisent alors pour un gigaoctet, sans
authentification et sans mot de passe valide.

**Correction proposée**, en deux lignes et deux endroits :

```js
// routes/auth.js — la clé est lue AVANT validation : on la borne ici, faute de quoi
// le limiteur retient en mémoire tout ce qu'on lui envoie, jusqu'à 1 Mo par requête.
typeof req.body?.email === 'string' && req.body.email.length <= 160
  ? `compte:${req.body.email.toLowerCase()}`
  : null,
```

```js
// requestSchema.js — même borne qu'en base (VARCHAR(160)).
email: z.string().trim().max(160).email('Adresse e-mail invalide'),
```

---

### RL1-07 — Quatre corps sans mot de passe suffisent à verrouiller un compte connu pour un quart d'heure

**Gravité** majeur. **Fichier** `server/src/routes/auth.js:21-24` et
`server/src/middleware/rateLimit.js:50`.

**Constat.** La clé « compte » du limiteur est incrémentée avant toute
vérification, et la remise à zéro (`rateLimit.js:50`) n'a lieu que sur une
**connexion réussie** — que la victime, une fois verrouillée, ne peut plus faire.
Le verrouillage existait avant le lot ; EVO-11 le rend **gratuit**, puisqu'il ne
demande plus même un corps complet.

**Scénario qui casse (exécuté, seuil posé à 3, quatre sources distinctes pour
isoler la clé de compte de la clé d'adresse IP).**

```
127.0.0.2  {"email":"banquier@banque.tn"}                  -> 400 Données invalides
127.0.0.3  {"email":"banquier@banque.tn"}                  -> 400 Données invalides
127.0.0.4  {"email":"banquier@banque.tn"}                  -> 400 Données invalides
127.0.0.5  {"email":"banquier@banque.tn"}                  -> 429 Trop de tentatives

127.0.0.6  la VICTIME, avec son vrai mot de passe          -> 429 Retry-After: 900
127.0.0.6  un AUTRE compte, même source, vrai mot de passe -> 200
```

Le 200 de la dernière ligne établit que c'est bien la clé de **compte**, et non
celle de l'adresse IP, qui verrouille : l'attaquant choisit sa victime, et n'a
besoin ni de mot de passe, ni de compte, ni même d'une adresse IP stable.

C'est l'arbitrage inhérent à toute limitation par compte, et le déporter (Redis,
répartiteur) ne le supprime pas. Mais il doit être **décidé**, pas subi : rien
dans la fiche EVO-11 ni dans le journal de l'auteur ne le mentionne.

**Correction proposée** — l'une des trois, au choix du commanditaire :
ne compter la clé de compte que sur un **échec d'authentification avéré** (et non
sur un corps invalide) ; ou lui donner un plafond distinct et beaucoup plus haut
que celui de l'adresse IP ; ou la retirer et ne garder que la clé d'adresse IP,
en acceptant l'attaque distribuée. À porter au commanditaire, avec le fait que
`README.md` annonce aujourd'hui une protection sans en nommer le prix.

---
### RL1-08 — Le journal d'administration peut affirmer le contraire de l'état de la base

**Gravité** bloquant. **Fichier** `server/src/services/admin.js:219`
(lecture de `avant`) et `:286` (écriture du journal).

**Constat.** `updateUser` lit l'état antérieur du compte **hors de la
transaction**, sans verrou de ligne ni contrôle de version :

```js
export async function updateUser({ id, payload, user }) {
  const avant = await getUser(id);      // ligne 219 — hors transaction
  …
  await withTransaction(async (client) => { … });
```

Deux modifications simultanées du même compte lisent donc le même `avant`,
écrivent l'une après l'autre, et journalisent toutes deux par rapport à un état
périmé. Comme `tracerChamps` (`:158`) élimine les champs dont la valeur soumise
est égale à `avant`, la seconde est consignée **`sansEffet: true`** alors qu'elle
a bel et bien changé la base.

**Scénario qui casse (exécuté, 40 itérations, 3 menteuses dans les 4 premières).**
Un compte agent ; deux `PUT` concurrents, l'un `{"role":"BANQUIER"}`, l'autre
`{"role":"AGENT"}`. Les deux répondent 200.

```
itération 1: base=AGENT  journal dit=BANQUIER
  lignes=[{"champs":{"role":{"apres":"BANQUIER","avant":"AGENT"}}},
          {"champs":{},"sansEffet":true}]
itération 2: idem
itération 3: idem
```

Un contrôleur qui remonte le journal lit « le compte est passé agent →
banquier », puis « appel sans effet ». Il conclut que le compte est banquier. Il
est agent. **La rétrogradation n'a laissé aucune trace.** Le scénario inverse est
tout aussi vrai : une promotion en `ADMIN` faite en second serait journalisée
`sansEffet` et resterait invisible.

Le commanditaire a décidé (D-1) que l'administrateur cumulerait saisie et
arbitrage, et que la maîtrise du risque reposerait **entièrement** sur le
journal. Un journal qui peut affirmer le contraire de l'état réel ne remplit pas
cet office. C'est le défaut d'invariant caractéristique : EVO-05 a enrichi le
*contenu* de la ligne sans s'assurer que ce contenu est **vrai**.

**Correction proposée.** Descendre la lecture de l'état antérieur dans la
transaction et la verrouiller :

```js
await withTransaction(async (client) => {
  // Relu SOUS VERROU : la lecture hors transaction, utilisée pour les contrôles
  // d'habilitation qui précèdent, peut être périmée au moment où l'on écrit, et
  // le journal consignerait alors une modification « sans effet » qui en a un.
  const { rows } = await client.query(`${SELECT_UTILISATEURS} WHERE u.id = $1 FOR UPDATE OF u`, [id]);
  const avant = versUtilisateur(rows[0]);
  …
});
```

La lecture hors transaction reste utile pour refuser tôt sans tenir un verrou,
mais **les valeurs journalisées doivent provenir de la lecture verrouillée**.
Test de non-régression : deux `PUT` concurrents, et l'assertion que la
concaténation des `avant`/`apres` du journal reconstitue exactement l'état final
en base. Le même raisonnement vaut pour `updateBank` (`:455`), où la lecture est
dans la transaction mais sans `FOR UPDATE` : la fenêtre est plus étroite, pas
nulle.

---
### RL1-09 — La trace détaillée des modifications de dossier et le masquage du RIB ne sont couverts par aucun test : deux mutations survivantes

**Gravité** majeur. **Fichiers** `server/src/services/requests.js:85-115`
(`masquer`, `tracerModification`) et `:200` (l'écriture de l'événement).

**Constat.** Le correctif `3a7ac2e` annonce deux choses sur la trace des
modifications de dossier : « les valeurs avant et après sont conservées, le
relevé bancaire masqué ». Ni l'une ni l'autre n'est tenue par un test. Un
`grep` des mots `modifications`, `masquer`, `•` et `request_events` sur
`server/tests/` ne rend **aucune** occurrence dans un cas de test.

**Preuve (deux mutations, suite entière, 166 tests).**

| Mutation | Effet sur le produit | Résultat |
| --- | --- | --- |
| M-K : `payload: { champs: Object.keys(modifications), modifications }` → `payload: { champs: Object.keys(payload) }` | la trace revient aux **noms de champs seuls**, c'est-à-dire exactement l'état que le correctif condamne | `# tests 166  # pass 166  # fail 0` — **survivante** |
| M-L : garde de `masquer` neutralisée | le **RIB en clair** entre au journal, lisible de tout administrateur | `# tests 166  # pass 166  # fail 0` — **survivante** |

Ce sont les deux mutations les plus graves de la revue, parce qu'elles portent
sur la pièce que la décision D-1 désigne comme le seul contrôle restant : la
saisie et l'arbitrage pouvant être le fait d'une même personne, la trace est ce
qui tient lieu de contrôle à quatre yeux. Rien n'empêche aujourd'hui une
régression de la vider de son contenu, ni d'y verser un relevé d'identité
bancaire en clair.

**Correction proposée.** Deux cas de test, dans `requests.test.js` :

1. Modifier un dossier sur trois champs dont `rib` ; relire
   `request_events.payload` ; asserter que `modifications.siteName` porte bien
   `{avant, apres}` avec les deux valeurs attendues, et que
   `modifications.rib.apres` **ne contient pas** le RIB envoyé tout en se
   terminant par ses quatre derniers caractères.
2. Réécrire un champ à l'identique et asserter qu'il **n'apparaît pas** dans
   `modifications` — la garde `String(ancienne) === String(nouvelle)` n'est pas
   éprouvée non plus.

**Réserve d'invariant, de la même famille.** `masquer` reconnaît le champ
sensible à son nom littéral (`champ !== 'rib'`). Le jour où un
`accountHolder`, un `iban` ou un numéro de pièce d'identité entre dans `FIELDS`,
il partira en clair au journal sans qu'aucun test ne rougisse. Mieux vaut une
liste explicite `CHAMPS_MASQUES = new Set(['rib'])` posée **à côté de `FIELDS`**,
et un test d'invariant qui vérifie que tout champ déclaré sensible est
effectivement masqué.

---
### RL1-10 — `arreterEcoute()` rend au lot une connexion qui écoute encore, avec son gestionnaire

**Gravité** majeur. **Fichier** `server/src/services/mccCatalog.js:298-312`.

**Constat.** C'est la réponse, par l'expérience, à la question posée sur EVO-12 :
*une connexion dont l'état n'est plus neutre peut-elle être rendue au lot ?*
Oui — mais pas par `withTransaction`, qui est juste (voir § 6.2). Par
`arreterEcoute()` :

```js
if (ecoute) {
  const client = ecoute;
  ecoute = null;
  client.removeAllListeners('error');   // les 'error' seulement
  client.release();                     // sans erreur : la connexion RETOURNE au lot
}
```

Aucun `UNLISTEN` n'est émis, et le gestionnaire `'notification'` posé ligne 257
n'est pas retiré. `pg` ne remet pas l'état de session à zéro au retour au lot :
la connexion revient donc dans le lot **abonnée au canal** et **toujours
outillée pour agir**.

**Scénario qui casse (exécuté).** Établir l'écoute, appeler `arreterEcoute()`,
puis reprendre une connexion au lot :

```
canaux encore actifs sur la connexion REPRISE au lot : [{"canal":"mcc_catalogue_modifie"}]
auditeurs « notification » encore posés : 1
```

Le consommateur suivant de cette connexion — une requête métier quelconque —
hérite de l'abonnement et du gestionnaire. Un `NOTIFY` émis par une autre
instance déclenche alors `rechargerCatalogue()` sur un service qu'on vient de
déclarer arrêté, depuis la connexion d'une requête qui n'a rien demandé. En
production la fenêtre est courte (`arreterEcoute()` précède `process.exit`), mais
en test elle ne l'est pas : `robustesse.test.js:760` appelle `arreterEcoute()` au
milieu de la suite, et la connexion contaminée reste dans le lot pour tout ce qui
suit.

C'est aussi, en soi, un défaut d'invariant : le retour d'une connexion au lot
n'est correct que si son état de session est neutre, et rien ici ne le garantit.

**Correction proposée.**

```js
if (ecoute) {
  const client = ecoute;
  ecoute = null;
  client.removeAllListeners('error');
  client.removeAllListeners('notification');
  // L'abonnement vit dans la SESSION, pas dans le processus : une connexion rendue
  // au lot sans UNLISTEN continue de recevoir les NOTIFY pour le compte du
  // consommateur suivant.
  client.query('UNLISTEN *').catch(() => {}).finally(() => client.release());
}
```

Test à ajouter : après `arreterEcoute()`, reprendre un client du lot et asserter
que `pg_listening_channels()` est vide.

---

### RL1-11 — Le tri stable d'EVO-06 n'est éprouvé par aucun test (mutation survivante)

**Gravité** mineur. **Fichier** `server/src/services/admin.js:584`, suite
« Journal d'administration : pagination et filtres » de `tests/admin.test.js`.

**Mutation survivante (M-B).** `ORDER BY e.created_at DESC, e.id DESC` remplacé
par l'ancien `ORDER BY e.id DESC` :

```
# tests 30  # pass 30  # fail 0
```

Le jeu d'essai insère ses 250 entrées avec un horodatage croissant, où les deux
tris coïncident. La raison d'être du changement — et la reconstruction de l'index
`idx_admin_events_date` qui l'accompagne — n'est donc tenue par rien. En pratique
`id DESC` est stable aussi, ce qui borne la portée ; mais les deux tris
**divergent** dès qu'un `created_at` est posé explicitement — reprise de données,
import d'un journal antérieur —, c'est-à-dire précisément là où la pagination
doit tenir.

Ce constat avait déjà été relevé lors d'une passe antérieure de revue ; il n'a
pas été corrigé.

**Correction.** Ajouter au jeu d'essai quelques entrées dont `created_at` est
antidaté à contre-courant des identifiants, et asserter l'ordre rendu.

---
