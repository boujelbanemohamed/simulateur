# Revue de code du lot 1 — évolutions EVO-01 à EVO-12

> Commit relu : `c9abaf3` « Livrer le lot 1 des évolutions : consolidation »,
> comparé à `154edba`. Références croisées : `docs/evolutions-proposees.md`
> (cahier des charges, une fiche par évolution) et `docs/journal-lot1.md`
> (compte rendu de l'auteur et écarts qu'il assume).
>
> **Méthode.** Rien n'est retenu sur la seule lecture : tout constat bloquant ou
> majeur est accompagné d'une exécution reproductible, dont la sortie est citée.
> Une base de revue `revue_lot1` a été créée pour l'occasion, peuplée à la main,
> puis détruite ; `clicktopay` et `clicktopay_test` n'ont pas été touchées, non
> plus que les ports 4000 et 5173. Les tests importants ont été éprouvés par
> mutation : la garde est retirée, le test doit rougir, la garde est remise.
>
> **Aucun fichier du projet n'a été modifié**, hors le présent document. Les
> mutations sont appliquées puis annulées par un harnais qui restaure le fichier
> d'origine ; `git status` sur `server/` a été vérifié vierge après chaque passe
> et en fin de revue.
>
> Le code est relu tel qu'il se présente dans l'arborescence de travail, qui
> porte deux commits postérieurs (`78d44b0`, `3c03b25` — habilitation du
> banquier) : c'est cette version-là qui partirait en service. Ce qui relève de
> ces commits et non du lot 1 est signalé comme tel.

---

## Sommaire

1. Ce que le lot fait bien
2. Constats bloquants
3. Constats majeurs
4. Constats mineurs
5. Les quatre points signalés par l'auteur
6. Migration
7. Ce que j'ai éprouvé par mutation
8. Ce que je soupçonne sans l'avoir prouvé
9. Synthèse

---

## 1. Ce que le lot fait bien

Il faut le dire avant le reste : **la majorité des douze fiches est tenue, et
tenue proprement**. Ce qui suit est vérifié par exécution, pas par lecture.

- **EVO-02** — Repli `5999` désactivé, descriptif sans correspondance :
  `POST /api/mcc/suggest` renvoie `200 {"VISA":[],"MASTERCARD":[]}` et le
  serveur écrit `Code de repli 5999 absent du référentiel actif`. Exactement les
  trois critères de la fiche. L'écran de saisie porte le message français
  demandé, distinct du message « complétez la description ».
- **EVO-03** — Deux créations concurrentes de `Concurrent@banque.tn` et
  `concurrent@banque.tn` donnent `409` et `201`, un seul compte en base, et le
  message français attendu. Un `INSERT` SQL direct de `ADMIN@CLICKTOPAY.TN` est
  refusé par la base (`23505` sur `idx_users_email_lower`). C'est le meilleur
  correctif du lot : l'invariant est descendu au bon étage, et la traduction
  applicative n'est qu'un habillage du refus, non le refus lui-même.
- **EVO-07** — Éprouvé sur une **coupure réelle**, pas sur un événement simulé :
  `pg_terminate_backend` sur la connexion d'écoute. Journal serveur
  « Écoute du référentiel MCC interrompue », `/api/health` répond `200` avec
  `ecoute: "perdue"` et `referentiel: "charge"`, puis « Écoute du référentiel MCC
  rétablie », `ecoute: "active"`, et **le libellé modifié pendant la coupure est
  présent en cache après la reprise**. Un `NOTIFY` émis ensuite est reçu sur la
  nouvelle connexion. `arreterEcoute()` puis `pool.end()` : 0 ms.
- **EVO-09** — Simulation : `reactives: 1`, `active` reste `false` en base.
  Application : `active` passe à `true`, une ligne `IMPORT_REACTIVATION` avec
  `avant {active:false}` / `apres {active:true}` et le motif saisi. Rejeu à
  l'identique : `inchanges: 1`, `reactives: 0`, rien d'écrit. Avec
  `deactivateMissing`, le code désactivé présent au fichier n'est pas dans
  `retires`. Les quatre critères et les trois cas limites sont tenus.
- **EVO-06** — Sur 250 entrées portant **le même horodatage**, les trois pages
  `offset=0/100/200` rendent 250 lignes distinctes, sans doublon ni oubli, et
  `total` est juste. Les trois messages d'erreur français sont au rendez-vous,
  y compris le refus d'une date inexistante (`2026-02-30`) avant PostgreSQL.
- **EVO-08** — Après renommage du code retenu, la relecture sert le libellé
  d'époque et porte `libelleActuel` ; après désactivation, elle reste complète et
  porte `plusAuReferentiel: true` ; une photographie vidée de ses colonnes se
  relit en `libelleReconstitue: true`. Jamais d'entrée sans `code`.
- **EVO-11** — Le seuil desserré des tests ne fuit pas en production : il est
  posé par `tests/helpers.js:9` avec `?? '10000'`, donc uniquement dans le
  processus de test ; `.env.example` ne le mentionne pas et `config.js:66`
  retient 10 par défaut. Le README a été corrigé (ligne 348).
- **EVO-12 / lot de connexions** — Le critère de destruction est **juste**, voir
  § 5.2.
- **Tenue du code** — Le style de la maison est respecté sans faiblir :
  commentaires en français qui expliquent le *pourquoi* et non le *quoi*, et qui
  citent le symptôme d'origine (`pool.js:8-14`, `mccCatalog.js:234-239`,
  `admin.js:138-146`). C'est rare et c'est précieux.

---

## 2. Constats bloquants

### RL1-01 — Le journal d'administration ment sur les modifications concurrentes de compte

**Gravité** bloquant. **Fichier** `server/src/services/admin.js:219` (lecture de
`avant`) et `:278` (écriture du journal).

**Constat.** `updateUser` lit l'état antérieur du compte **hors de la
transaction** :

```js
export async function updateUser({ id, payload, user }) {
  const avant = await getUser(id);      // ligne 219 — hors transaction
  ...
  await withTransaction(async (client) => { ... });
```

Aucun verrou de ligne, aucun contrôle de version (`updated_at`) : deux
modifications simultanées du même compte lisent le même `avant`, écrivent l'une
après l'autre, et journalisent toutes deux par rapport à un état périmé. Comme
`tracerChamps` (`:148`) élimine les champs dont la valeur soumise est égale à
`avant`, la seconde modification est consignée **`sansEffet: true`** alors
qu'elle a bel et bien changé la base.

**Scénario qui casse (exécuté).** Un compte agent ; deux appels concurrents,
l'un `{"role":"BANQUIER"}`, l'autre `{"role":"AGENT"}`. Les deux répondent 200.

```
role final en base : AGENT
journal : [{"action":"MODIFICATION","payload":{"champs":{"role":{"apres":"BANQUIER","avant":"AGENT"}}}},
           {"action":"MODIFICATION","payload":{"champs":{},"sansEffet":true}}]
```

Un contrôleur qui remonte le journal lit : « le compte est passé agent →
banquier », puis « appel sans effet ». Il conclut que le compte est banquier. Il
est agent. **La rétrogradation n'a laissé aucune trace.** Le scénario inverse est
tout aussi vrai : une promotion en `ADMIN` faite en second serait journalisée
`sansEffet` et resterait invisible.

Le commanditaire a décidé que l'administrateur cumulerait saisie et arbitrage, et
que la maîtrise du risque reposerait **entièrement** sur le journal. Un journal
qui peut affirmer le contraire de l'état réel ne remplit pas cet office. C'est
d'ailleurs le défaut d'invariant caractéristique : EVO-05 a enrichi le *contenu*
de la ligne sans s'assurer que ce contenu est **vrai**.

**Correction proposée.** Descendre la lecture de l'état antérieur dans la
transaction et la verrouiller :

```js
await withTransaction(async (client) => {
  const { rows } = await client.query(`${SELECT_UTILISATEURS} WHERE u.id = $1 FOR UPDATE OF u`, [id]);
  const avant = versUtilisateur(rows[0]);   // relu sous verrou, dans la transaction
  ...
});
```

La lecture hors transaction reste utile pour les contrôles d'habilitation qui
précèdent (elle évite de tenir un verrou pendant un refus), mais **les valeurs
journalisées doivent provenir de la lecture verrouillée**. Un test de
non-régression : deux `PUT` concurrents, et l'assertion que la concaténation des
`avant`/`apres` du journal reconstitue exactement l'état final en base.

Le même raisonnement vaut pour `updateBank` (`:455`), où la lecture est certes
dans la transaction mais sans `FOR UPDATE` : la fenêtre est plus étroite, pas
nulle.

---

### RL1-02 — Le journal d'administration n'est pas cloisonné par banque

**Gravité** bloquant. **Fichier** `server/src/routes/admin.js:29`
(`requireRole('ADMIN', 'BANQUIER')`) et `server/src/services/admin.js:519`
(`listAdminEvents`, aucun filtre de banque).

**Ce qui revient au lot 1 et ce qui n'en revient pas.** L'ouverture de
`/api/admin` au profil `BANQUIER` est le fait du commit postérieur `3c03b25` ;
au commit `c9abaf3` la route était réservée à `ADMIN`. **Mais EVO-06 est ce qui
rend la fuite exhaustive** : avant la pagination, le journal s'arrêtait à 500
entrées ; il se remonte désormais entièrement, page par page. Les deux réunis —
et c'est la version qui partirait en service — donnent une fuite inter-banques
complète. Je le consigne ici parce que la revue porte sur le code tel qu'il
serait mis en service, et parce que c'est un trou de journalisation au sens
large : un journal lisible par qui ne devrait pas le lire.

**Constat.** `listUsers` applique correctement le périmètre du banquier
(`admin.js:96-101`, filtre `u.bank_id`). `listAdminEvents` n'applique **aucun**
filtre équivalent : elle lit `admin_events` en entier.

**Scénario qui casse (exécuté).** L'administrateur crée un compte dans la banque
`BQ002`. Le banquier de la banque `BQ001` interroge `/api/admin/events` :

```
comptes visibles par le banquier via /api/admin/users : agent@banque.tn, admin@clicktopay.tn, banquier@banque.tn
entrees visibles par le banquier de la banque 1 : 1
dont entrees concernant la banque 2 :
  {"entity":"USER","action":"CREATION",
   "payload":{"role":"AGENT","email":"secret-banque2@autre.tn","bankId":2,"bankCode":"BQ002"},
   "userName":"Admin ClickToPay"}
```

Le banquier ne voit pas le compte par la liste des comptes, mais il en lit
l'adresse électronique, le rôle et la banque dans le journal. EVO-05 a **aggravé**
la portée de cette fuite en y versant les valeurs avant/après : le journal porte
désormais les adresses et les rôles en clair, là où il ne portait auparavant que
des noms de champs.

**Correction proposée.** Deux couches, et il faut les deux :

1. Dans `listAdminEvents`, ajouter une condition de périmètre quand l'appelant
   n'est pas administrateur — par jointure sur la cible :
   `entity = 'USER' AND entity_id::int IN (SELECT id FROM users WHERE bank_id = $n)`,
   `entity = 'BANK' AND entity_id::int = $n`, et **exclure `entity = 'MCC'`**
   (référentiel commun, qui révèle l'activité des autres banques).
2. Ou, plus simplement et plus sûrement : réserver `/api/admin/events` à
   `reserveAAdministrateur` tant que le cloisonnement n'est pas écrit, en
   assumant que le banquier n'a pas de journal. Un journal absent vaut mieux
   qu'un journal qui traverse les banques.

---

## 3. Constats majeurs

### RL1-03 — Le refus des types de contenu inattendus exempte le multipart partout, pas seulement au téléversement

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

Or une seule route attend du multipart : `POST /api/admin/mcc/import-fichier`.
Partout ailleurs, l'exemption rouvre exactement le symptôme que la fiche
demandait de fermer — le commentaire de l'auteur le décrit lui-même
(`app.js:41-44`) : « la route répondait alors “Données invalides” sur des champs
pourtant renseignés, ce qui n'aide personne ».

**Scénario qui casse (exécuté).** Trois appels en multipart sur des routes JSON :

```
POST /api/auth/login        en multipart -> 400 {"error":"Données invalides","details":[{"champ":"email",...}]}
POST /api/requests          en multipart -> 400 {"error":"Données invalides","details":[{"champ":"siteName",...}]}
PUT  /api/admin/mcc/5977    en multipart -> 400 {"error":"Données invalides","details":[{"champ":"","message":"Aucune modification fournie"}]}
```

La fiche EVO-10, cas limite 3, dit : « type de contenu inattendu **sur une route
qui attend du JSON** — réponse **415** ». Le multipart sur `/api/auth/login` est
un type de contenu inattendu sur une route qui attend du JSON. Il reçoit 400.
Le cas limite n'est pas tenu, et l'utilisateur d'un client mal réglé reçoit un
diagnostic faux : on lui dit que son adresse manque alors qu'il l'a envoyée.

C'est le défaut d'invariant type : l'auteur a traité le cas constaté
(urlencoded, texte brut) en ouvrant une porte plus large que nécessaire, au lieu
de fermer la classe.

**Correction proposée.** Ne pas exempter le multipart globalement ; le laisser à
la route qui le consomme. L'intergiciel devient :

```js
if (req.is('json')) return next();
return next(new HttpError(415, 'Type de contenu non pris en charge : JSON attendu.'));
```

et on le monte **après** `adminRouter` pour la route de téléversement, ou, plus
lisible, on le monte tel quel en sautant explicitement le seul chemin concerné :

```js
const ROUTES_MULTIPART = new Set(['/api/admin/mcc/import-fichier']);
if (ROUTES_MULTIPART.has(req.path) && req.is('multipart/form-data')) return next();
```

Le second test d'EVO-10 (`robustesse.test.js:797`) doit alors être doublé d'un
cas « multipart sur `/api/auth/login` → 415 », et d'un cas « multipart sur
`/api/admin/mcc/import-fichier` → 200 » pour verrouiller l'exemption.

**Ce qui va bien, et qu'il faut noter** : le multipart du téléversement **reste
admis**, vérifié en exécution — `POST /api/admin/mcc/import-fichier` avec un
`.csv` attaché répond `200` et rend le rapport d'écart. La crainte de l'auteur
était fondée, sa parade fonctionne ; elle est seulement trop large.

---

### RL1-04 — Le balayage d'invariant d'EVO-10 ne peut pas voir la fuite qui subsiste

**Gravité** majeur. **Fichiers** `server/src/routes/admin.js:226` (la fuite) et
`server/tests/robustesse.test.js:824-849` (le balayage).

**Constat.** La fiche EVO-10 pose un invariant : « sur un balayage des routes de
l'API, aucune réponse de statut ≥ 400 ne contient, dans son corps, ni le mot
`at ` suivi d'un chemin de fichier, ni la chaîne `node_modules`, ni une pile
d'appel, ni un extrait de requête SQL ». Le test écrit exerce **treize appels
choisis à la main**, tous sur des routes JSON, et vérifie quatre motifs
littéraux. Il laisse passer la vraie fuite du produit.

**Scénario qui casse (exécuté).**

```
POST /api/admin/mcc/import-fichier, fichier « r.xlsx » contenant « pas un zip »
-> 400 {"error":"Fichier illisible : Can't find end of central directory :
        is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html"}
```

Le message d'une bibliothèque tierce est renvoyé verbatim, URL de documentation
comprise. Il désigne la pile technique employée (JSZip, donc `exceljs`) — un
renseignement que l'on ne donne pas gratuitement à qui sonde une API bancaire.
Le balayage ne le voit pas, pour deux raisons cumulées :

1. Il **n'appelle jamais** `/api/admin/mcc/import-fichier`.
2. Ses quatre motifs sont littéraux (`node_modules`, `\n at `, `SELECT `…) et ne
   décrivent pas la propriété voulue — « rien de technique ne sort » — mais trois
   formes particulières de fuite.

**Preuve que le balayage est inopérant (mutation M18).** J'ai remplacé, dans
`middleware/errors.js:27`, `'Erreur interne du serveur'` par `err.stack` : une
pile d'appel complète est alors renvoyée sur toute réponse 500. **Le balayage
reste vert** ; seul le test dédié n° 4 (« une panne applicative ne sort que
“Erreur interne du serveur” ») rougit. La raison est mécanique : aucun des treize
appels du balayage ne produit de réponse ≥ 500 — ils sont tous en 400, 401, 403
ou 404. Les motifs de pile ne sont donc jamais confrontés à une pile.

Un test qui ne peut pas rougir pour le défaut qu'il nomme ne protège de rien.

**Correction proposée.** Deux gestes distincts :

1. **Fermer la fuite** : `routes/admin.js:226` ne doit pas relayer `err.message`.
   `throw badRequest('Fichier illisible : le classeur n’a pas pu être ouvert. Vérifiez qu’il s’agit bien d’un .xlsx, .csv ou .json valide.')`,
   et `console.error(err)` côté serveur pour le diagnostic. Le cas du `.json`
   malformé (« Unexpected end of JSON input ») relève du même traitement.
2. **Rendre le balayage capable de rougir** : l'alimenter depuis la table de
   routage d'Express plutôt qu'à la main (`app._router.stack`), y inclure
   au moins un appel qui produit un 500, et remplacer les motifs littéraux par
   une liste blanche — le corps d'une réponse d'erreur ne doit contenir que
   `error` et, éventuellement, `details` dont chaque entrée n'a que `champ` et
   `message`. Une liste blanche ferme la classe ; une liste noire ne ferme que
   ce qu'on a su nommer.

---

### RL1-05 — Un multipart tronqué sort en 500

**Gravité** majeur. **Fichier** `server/src/routes/admin.js:40-51`
(`erreursDeTeleversement`).

**Constat.** L'intergiciel de traduction ajouté par EVO-12 ne connaît que deux
codes : `LIMIT_FILE_SIZE` et `LIMIT_UNEXPECTED_FILE`. Les erreurs que `busboy`
lève sur un corps multipart mal formé ne portent **aucun** `code` : elles
traversent, arrivent dans `errorHandler` avec `status` indéfini, et sortent en
500.

**Scénario qui casse (exécuté).** `POST /api/admin/mcc/import-fichier` avec un
corps multipart dont la frontière de clôture manque :

```
-> 500 {"error":"Erreur interne du serveur"}
journal serveur : Error: Unexpected end of form
    at Multipart._final (.../busboy/lib/types/multipart.js:588:17)
```

Une requête cliente mal formée — un téléversement interrompu par une coupure
réseau du navigateur suffit — produit une erreur serveur. Le corps de la réponse
ne fuit rien, c'est acquis ; mais le statut est faux, la supervision compte un
incident serveur là où il n'y en a pas, et l'administrateur ne comprend pas
pourquoi son import échoue.

C'est le même défaut d'invariant que RL1-04 : deux codes constatés ont été
traités, la classe « erreur de lecture du corps multipart » ne l'est pas.

**Correction proposée.** Renverser la logique : ne plus énumérer les codes
connus, mais rattacher à 400 tout ce qui provient de l'étage de téléversement.

```js
function erreursDeTeleversement(err, req, res, next) {
  if (!err || err instanceof HttpError) return next(err);       // filtre d'extension : déjà typé
  if (err.code === 'LIMIT_FILE_SIZE') {
    return next(new HttpError(413, 'Le fichier dépasse la taille autorisée (5 Mo).'));
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return next(badRequest('Champ de fichier inattendu : le fichier doit être transmis sous le nom « fichier ».'));
  }
  // Tout le reste vient de multer ou de busboy : le corps envoyé est en cause,
  // pas le serveur. On journalise le détail et on refuse en 400.
  console.error('Téléversement illisible :', err);
  return next(badRequest("Le fichier n'a pas pu être lu : la requête de téléversement est incomplète ou mal formée."));
}
```

Test à ajouter : corps multipart tronqué → 400, et **aucun** 500 sur la route de
téléversement quel que soit le corps envoyé.

---

### RL1-06 — La migration est tout ou rien : un doublon de casse bloque aussi les deux autres évolutions de schéma

**Gravité** majeur. **Fichiers** `server/src/db/schema.sql:233-249` (le
garde-fou) et `server/src/db/migrate.js:9` (`pool.query(sql)`).

**Constat.** `migrate()` envoie le fichier entier en une seule requête simple.
PostgreSQL l'exécute alors dans **une transaction implicite unique** : le
`RAISE EXCEPTION` du bloc `DO $$` annule tout le fichier, y compris les deux
évolutions de schéma qui n'ont rien à voir avec les adresses électroniques.

**Scénario qui casse (exécuté sur `revue_lot1`).** Base au schéma d'avant le lot,
deux banques, cinq comptes dont deux paires ne différant que par la casse :

```
$ node src/db/migrate.js
Échec de la migration : Migration interrompue : ces adresses existent en plusieurs
casses et doivent être corrigées avant la pose de l'index unique :
agent2@banque.tn, agent@banque.tn
code de sortie: 1

-- état de la base après l'échec :
indexes admin_events : idx_admin_events_date          (ancien, une seule colonne)
colonnes mcc_suggestions : created_at, id, matched_terms, mcc_code, network, rank, request_id, score
                           (ni label_at_submit ni description_at_submit)
```

Le message est bon : il nomme les adresses en cause, ce que la fiche demandait,
et vaut mieux qu'une erreur PostgreSQL brute. **Mais** si l'exploitant déploie le
code livré sans regarder le code de sortie — un pipeline qui enchaîne migration
et redémarrage, par exemple —, le serveur démarre sur un schéma d'avant le lot,
et **toute soumission de demande échoue en 500** : `submitRequest`
(`requests.js:268`) insère dans `label_at_submit`, qui n'existe pas. Le défaut ne
se voit pas au démarrage, ni au contrôle de santé, qui ne regarde que
`SELECT 1` et le catalogue.

**Correction proposée.**

1. Découper `schema.sql` en deux fichiers, ou déplacer le bloc `DO $$` et le
   `CREATE UNIQUE INDEX` en fin de course, de sorte qu'un refus sur les adresses
   n'empêche pas les colonnes et l'index de pagination d'être posés. Le
   comportement voulu — refuser l'index unique — reste obtenu, sans entraîner le
   reste.
2. Compléter le message du `RAISE` par la marche à suivre :
   « Corrigez-les depuis l'écran d'administration des comptes, ou par
   `UPDATE users SET email = … WHERE id = …`, puis relancez `npm run db:migrate`. »
   Le contrôleur qui reçoit le message ne connaît pas nécessairement le schéma.
3. Poser un **contrôle de schéma au démarrage** : si `mcc_suggestions` n'a pas
   ses deux colonnes, refuser de démarrer plutôt que de servir une API qui
   échouera à la première soumission. Un `to_regclass`/`information_schema` en
   deux lignes dans `index.js` suffit.
4. Aucun test n'exerce le garde-fou : voir RL1-14.

**Ce qui va bien.** Sur une base peuplée **sans** doublon, la migration est
rejouable et idempotente — deux passes de suite, code 0, index
`idx_users_email_lower` et `idx_admin_events_date (created_at DESC, id DESC)`
présents, deux colonnes ajoutées `NULL`ables, cinq comptes intacts. Le
`DROP INDEX IF EXISTS` suivi du `CREATE INDEX IF NOT EXISTS` est le bon geste et
son commentaire explique justement pourquoi `IF NOT EXISTS` seul ne suffisait pas.

---

### RL1-07 — La liste des champs journalisés est recopiée à côté de la liste des champs modifiables

**Gravité** majeur. **Fichier** `server/src/services/admin.js:209-216`
(`CHAMPS_UTILISATEUR`) et `:278-288` (l'appel à `tracerChamps`).

**Constat.** L'écriture en base itère sur `CHAMPS_UTILISATEUR` (`:263`) ; le
journal, lui, énumère **à la main** les six mêmes champs dans l'appel à
`tracerChamps`. Les deux listes sont aujourd'hui identiques — je l'ai vérifié —
mais rien ne les tient ensemble : ni un test, ni une dérivation.

**Scénario qui casse.** Le jour où une évolution ajoute `phone` ou
`mustChangePassword` à `CHAMPS_UTILISATEUR` et au schéma de validation, la
modification s'applique en base et **n'apparaît nulle part au journal**. Aucun
test ne rougit : les tests d'EVO-05 vérifient le rôle et l'adresse, pas la
couverture. Le défaut est silencieux, et c'est le pire genre pour une piste
d'audit dont on a décidé qu'elle porterait seule la maîtrise du risque.

Ce n'est pas une inélégance de style : c'est le même défaut d'invariant que
RL1-04, appliqué au journal. On a corrigé le contenu constaté sans fermer la
classe « tout champ modifiable est journalisé ».

**Correction proposée.** Dériver la trace de la liste unique :

```js
// Un seul endroit décrit les champs modifiables ; le journal s'en déduit, pour
// qu'un champ ajouté demain ne puisse pas entrer en base sans entrer au journal.
const LECTURE_AVANT = {
  firstName: (a) => a.firstName, lastName: (a) => a.lastName, email: (a) => a.email,
  role: (a) => a.role, bankId: (a) => ({ id: a.bankId, code: a.bankCode }), active: (a) => a.active,
};
const traces = Object.fromEntries(
  Object.keys(CHAMPS_UTILISATEUR).map((cle) => [cle, { avant: LECTURE_AVANT[cle](avant), apres: valeurApres(cle) }])
);
```

et un test d'invariant : `assert.deepEqual(Object.keys(CHAMPS_UTILISATEUR).sort(), Object.keys(LECTURE_AVANT).sort())`.
Deux lignes, et la classe est fermée.

---

## 4. Constats mineurs

### RL1-08 — `total` est compté filtres appliqués, contre la lettre de la fiche

**Gravité** mineur. **Fichier** `server/src/services/admin.js:560`.

La fiche EVO-06 dit : « `total` est un `COUNT(*)` sur `admin_events` », et son
critère d'acceptation : « avec 250 entrées, `?limit=100&offset=200` renvoie les
50 dernières, `total` vaut 250 ». Le code compte avec le `WHERE` :

```
250 entrées, dont 125 d'entité USER
?entity=USER&limit=5  ->  total = 125
```

L'auteur assume l'écart et le motive (le compteur « entrées 101 à 200 sur N » de
l'écran). Le motif est bon : sans lui, la barre de pagination se désactiverait au
mauvais endroit dès qu'un filtre est posé. **Je retiens le choix de l'auteur**,
mais le cahier des charges devrait être corrigé pour qu'un tiers ne relise pas ce
point comme un défaut.

Deuxième point, réel celui-là : le `COUNT(*)` et la page sont deux requêtes
distinctes, prises sur **deux connexions différentes** du lot, sans transaction
englobante. Une écriture concurrente entre les deux peut rendre `total` et
`items` incohérents — une ligne vue deux fois ou sautée au changement de page.
Sur un journal d'audit, cela mérite le `withTransaction` (ou, plus économe, un
`count(*) OVER ()` dans la même requête que la page).

---

### RL1-09 — Un filtre `action` répété est ignoré en silence, là où `entity` refuse

**Gravité** mineur. **Fichier** `server/src/services/admin.js:534-538`.

`entity` est contrôlé contre une liste et refuse en 400 ; `action` est poussé tel
quel comme paramètre de requête. Quand Express rend un tableau, le résultat
diverge :

```
?entity=USER&entity=BANK     -> 400 « Entité inconnue : « USER,BANK ». »
?action=CREATION&action=MODIFICATION -> 200 {"count":0,"total":0,"items":[]}
```

Sur une piste d'audit, une liste vide **rendue avec un code 200** est un
mensonge : le contrôleur conclut qu'il n'y a rien à voir. Il vaut mieux refuser.

**Correction.** Normaliser les paramètres de requête en début de
`listAdminEvents` (`String(valeur)` refusé si `Array.isArray`), et contrôler
`action` contre la liste des actions effectivement émises
(`CREATION`, `MODIFICATION`, `REINITIALISATION_MOT_DE_PASSE`,
`CHANGEMENT_MOT_DE_PASSE`, `IMPORT_REFERENTIEL`), sur le modèle de `entity`.

---

### RL1-10 — Le tri stable d'EVO-06 n'est éprouvé par aucun test

**Gravité** mineur. **Fichier** `server/tests/admin.test.js`, suite « Journal
d'administration : pagination et filtres ».

**Mutation survivante (M12).** En remplaçant `ORDER BY e.created_at DESC, e.id DESC`
par l'ancien `ORDER BY e.id DESC` (`admin.js:568`), **toute la suite reste
verte**. Le test de pagination insère ses 250 entrées avec un horodatage unique,
où les deux ordres coïncident. La raison d'être du changement — et la
reconstruction de l'index `idx_admin_events_date` qui l'accompagne — n'est donc
tenue par rien.

En pratique `id DESC` est stable aussi, ce qui limite la portée. Mais les deux
tris **divergent** dès qu'un `created_at` est posé explicitement — reprise de
données, import d'un journal antérieur — et c'est précisément le cas où la
pagination doit tenir.

**Correction.** Ajouter au jeu d'essai quelques entrées dont `created_at` est
antidaté à contre-courant des identifiants, et asserter l'ordre rendu. Le test
rougira alors sous la mutation.

---

### RL1-11 — `arreterEcoute()` déclare `jamais_etablie` une écoute qui a bel et bien existé

**Gravité** mineur. **Fichier** `server/src/services/mccCatalog.js:306`.

À l'arrêt, `etatEcoute` est ramené à `'jamais_etablie'`. Pendant la fenêtre qui
sépare le `SIGTERM` de la fermeture du serveur, `/api/health` annonce donc à
l'exploitation une instance qui n'a jamais écouté — vérifié en exécution. C'est
un diagnostic faux au moment où l'on regarde le plus les tableaux de bord : un
arrêt roulant. Une quatrième valeur, `'arretee'`, coûte une ligne et dit la
vérité.

---

### RL1-12 — Une écoute rétablie après un échec **au démarrage** ne recharge pas le catalogue

**Gravité** mineur. **Fichier** `server/src/services/mccCatalog.js:281`.

`const estUneReprise = etatEcoute === 'perdue';` — or le `catch`
(`mccCatalog.js:273`) conserve `'jamais_etablie'` quand la toute première
tentative échoue, au lieu de la passer à `'perdue'`. Si la base est injoignable au
démarrage, la reprise finit par aboutir mais **sans** rechargement, alors que
c'est exactement le moment où le cache est vide ou périmé.

La portée est limitée : `assurerCatalogueCharge` (`:178-185`) remet `chargement`
à `null` en cas d'échec et retente à la requête suivante, si bien que le trou se
referme dès qu'un appel arrive. Mais une instance sans trafic reste sur un
catalogue vide plus longtemps que nécessaire.

**Correction.** `estUneReprise` doit valoir vrai dès lors qu'il y a eu une
tentative antérieure — c'est-à-dire `tentatives > 0` —, pas seulement après une
perte.

---

### RL1-13 — L'arrêt propre ajouté par EVO-07 ne ferme pas le lot de connexions et n'a pas de délai de garde

**Gravité** mineur. **Fichier** `server/src/index.js:18-24`.

```js
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    arreterEcoute();
    serveur.close(() => process.exit(0));
  });
}
```

Deux manques. `pool.end()` n'est pas appelé : les transactions en cours sont
coupées côté client sans être annulées proprement, et PostgreSQL les nettoie par
expiration. Et `serveur.close()` attend la fin de **toutes** les connexions
ouvertes : une connexion maintenue en vie par un client suffit à faire dépasser
le délai de grâce de l'orchestrateur, qui finit par envoyer `SIGKILL`.

**Correction.** `arreterEcoute(); serveur.close(async () => { await pool.end(); process.exit(0); });`
et un `setTimeout(() => process.exit(1), 10000).unref()` en garde-fou.

---

### RL1-14 — Le garde-fou de migration n'est éprouvé par aucun test

**Gravité** mineur. **Fichier** `server/tests/admin.test.js:279-287`.

Le test « la migration du schéma est rejouable (EVO-03) » rejoue `migrate()` deux
fois sur une base qui n'a pas de doublon : le bloc `DO $$` n'est jamais exercé.
Son message — la partie qui sert le jour où l'on en a besoin — n'est vérifié que
par l'exécution manuelle que je rapporte au § 6, et rien ne protège sa
formulation d'une régression.

**Correction.** Insérer deux adresses ne différant que par la casse **avant**
l'index (donc dans une base dédiée, ou après `DROP INDEX idx_users_email_lower`),
appeler `migrate()`, et asserter que le rejet cite les deux adresses.

---

### RL1-15 — La photographie n'est autoportante que sur deux champs

**Gravité** mineur. **Fichier** `server/src/services/requests.js:382-393`
(`photographier`).

L'entrée rendue commence par `{ ...actuel }` : `code`, `label` et `description`
sont ensuite écrasés par la photographie, mais **`riskLevel`,
`ecommerceRelevance`, `keywords`, `similar`, `sectors` et `note` restent ceux du
référentiel d'aujourd'hui**. Vérifié en exécution : après renommage, la relecture
sert `label` d'époque et `riskLevel: "STANDARD"` lu dans le catalogue vivant.

La fiche ne demandait que le libellé et la description, et le journal de l'auteur
ne prétend pas davantage : l'écart est conforme. Mais l'argument de la fiche —
« la justification qu'on relit n'est plus celle qui a été servie » — vaut tout
autant pour le niveau de vigilance, qui est précisément ce qui informe la
décision du banquier. Un code passé de `STANDARD` à `ELEVE` depuis la soumission
fera relire une justification à la vigilance d'aujourd'hui, sous un libellé
d'hier.

**Correction proposée** (à arbitrer, ce n'est pas un défaut au regard de la
fiche) : stocker la ligne complète du code en JSONB dans la photographie, ou à
tout le moins ajouter `risk_level_at_submit`, et signaler l'écart comme on
signale déjà `libelleActuel`.

---

### RL1-16 — Le libellé du code retenu n'est cherché que dans la liste VISA

**Gravité** mineur. **Fichier** `web/src/pages/RequestDetailPage.jsx:96-107`.

```js
const photographie = propositions?.VISA?.find((m) => m.code === code);
```

Les quatre lignes de la fiche — proposé Visa, proposé Mastercard, retenu Visa,
retenu Mastercard — passent toutes par cette recherche. Un code Mastercard absent
de la liste VISA s'affiche sans libellé, et sans la mention « désactivé du
référentiel depuis la soumission ». Sur le jeu de démonstration les deux listes
se recouvrent largement, ce qui masque le défaut.

**Correction.** Chercher dans `[...(propositions?.VISA ?? []), ...(propositions?.MASTERCARD ?? [])]`,
ou prendre le réseau en paramètre.

---

### RL1-17 — La clé du compteur de débit est construite sur une valeur non validée

**Gravité** mineur. **Fichiers** `server/src/routes/auth.js:21-24` et `:35-36`.

EVO-11 fait passer `loginLimiter` **avant** `validate(loginSchema)` — c'est bien
l'objet de la fiche, et c'est juste. Conséquence non discutée : le
`keyGenerator` lit désormais `req.body.email` **avant** toute validation.

Deux effets. D'abord, `String(req.body.email).toLowerCase()` accepte n'importe
quelle valeur du corps JSON, jusqu'à 1 Mo : la clé de la `Map` du limiteur n'est
plus bornée par `z.string().email()`. Le nombre de clés reste plafonné (la clé
d'adresse IP est traitée la première et déclenche le 429 au-delà du quota), mais
leur **taille** ne l'est plus : dix clés d'un méga-octet par adresse et par
fenêtre de quinze minutes, purgées seulement à l'expiration de la fenêtre.

Ensuite, le verrouillage d'un compte connu ne demande plus de mot de passe :
`max + 1` corps `{"email":"victime@banque.tn"}` suffisent à lui interdire la
connexion pendant toute la fenêtre, et la remise à zéro (`rateLimit.js:50`) n'a
lieu que sur une connexion réussie — que la victime ne peut plus faire. Le
verrouillage était déjà possible avant le lot (il suffisait d'un corps bien
formé) : EVO-11 le rend simplement gratuit.

**Correction proposée.** Borner la clé de compte sans valider le corps :

```js
req.body?.email && typeof req.body.email === 'string' && req.body.email.length <= 160
  ? `compte:${req.body.email.toLowerCase()}`
  : null,
```

Le verrouillage de compte, lui, relève d'un arbitrage : c'est le prix d'une
limitation par compte, et le déporter (Redis, répartiteur) ne le supprime pas.
À signaler au commanditaire plutôt qu'à corriger ici.

---

### RL1-18 — Duplications et redondances mineures

**Gravité** mineur.

- Le plafond de `limit` est posé **deux fois** : `routes/admin.js:233`
  (`entierDeRequete(..., { max: 500 })`) et `services/admin.js:562`
  (`Math.min(limit, 500)`). Deux endroits à changer le jour où le plafond bouge.
  Garder celui du service, qui protège aussi les appels internes.
- `web/src/pages/AdminEventsPage.jsx:19-28` : `detailLisible` choisit son rendu
  sur la **forme** du `payload` (`donnees.impose !== undefined`) et non sur
  l'`action` de la ligne. Un futur `payload` portant `impose` serait rendu
  « changement imposé ». `switch (evenement.action)` serait plus sûr, et rendrait
  la fonction lisible.
- `services/admin.js:154` : `JSON.stringify(avant ?? null) === JSON.stringify(apres)`
  compare deux objets par sérialisation, donc **par ordre de clés**. Cela
  fonctionne aujourd'hui parce que `{id, code}` est construit dans le même ordre
  aux deux extrémités (`:236` et `:284`). C'est fragile pour un point qui décide
  si une ligne de journal porte ou non `sansEffet` ; une comparaison explicite
  des deux champs coûterait moins cher en risque.

---

## 5. Les quatre points signalés par l'auteur

### 5.1 EVO-10 — « Le multipart du téléversement doit rester admis »

**Vérifié en exécution : oui, il reste admis.**
`POST /api/admin/mcc/import-fichier` avec un `.csv` attaché répond `200` et rend
le rapport d'écart complet ; le même appel avec un `.xlsx` de 6 Mo répond `413`,
avec un champ mal nommé `400`, avec une extension refusée `400`. La crainte était
fondée et la parade fonctionne.

**Mais l'exemption est trop large** (RL1-03) : elle vaut pour toutes les routes,
si bien que le cas limite 3 de la fiche — 415 sur une route qui attend du JSON —
n'est pas tenu lorsque le type envoyé est du multipart. Et le balayage
d'invariant qui devait garder l'ensemble ne peut pas rougir (RL1-04).

### 5.2 EVO-12 — « La connexion n'est détruite que si son état est jugé suspect »

**Le critère est juste, et je le valide.** Contrairement à ce que la formulation
peut laisser craindre, **une connexion réellement corrompue ne peut pas être
rendue au lot**, pour deux raisons qui se cumulent :

1. Le code couvre exactement les deux situations où le client reste dans un état
   incertain : `ROLLBACK` en échec (`pool.js:31-36`) et `BEGIN` en échec
   (`:37-40`). Dans tout autre cas, le `ROLLBACK` a réussi, donc la transaction
   est close et la connexion propre.
2. Surtout, `pg-pool` **ne dépend pas de l'argument passé à `release`** pour
   écarter un client mort. `pg-pool/index.js:392` :
   `if (err || this.ending || !client._queryable || client._ending || …) return this._remove(client)`.
   Un client dont la socket est tombée n'est plus `_queryable` et il est détruit,
   que `release` reçoive une erreur ou non.

Je me suis assuré qu'aucun état de session ne survit à un retour arrière : le
seul verrou du produit est `pg_advisory_xact_lock` (`admin.js:312`), à portée de
transaction, libéré par le `ROLLBACK` comme par une rupture de connexion. Il n'y
a ni `SET` de session, ni `LISTEN`, ni curseur ouvert dans une transaction.

Le raisonnement de l'auteur — « la relâcher avec l'erreur à chaque refus métier
ferait tourner le lot pour rien » — est exact. Une seule réserve, mineure : cette
correction s'appuie implicitement sur `client._queryable`, que `pg-pool` documente
lui-même comme une interface interne (`// TODO(bmc): expose a proper, public
interface`). Un commentaire le disant, et un test qui vérifie qu'après une panne
de connexion le lot sert encore, protégeraient d'une régression de `pg`.

### 5.3 EVO-11 — « La limitation s'applique avant la validation, et les tests desserrent le seuil »

**Elle protège encore en production.** Le desserrage est proprement cloisonné :

- `tests/helpers.js:9` pose `LOGIN_RATE_LIMIT_MAX` avec `?? '10000'` — donc
  uniquement dans le processus de test, et seulement s'il n'est pas déjà posé.
- `tests/limitation.test.js:5` pose `'3'` **avant** l'import de `helpers.js`, et
  `node --test` exécute chaque fichier dans son propre processus : le seuil
  réaliste n'est pas contaminé par le desserrage des autres suites.
- `config.js:66` retient `10` par défaut ; `.env.example` ne mentionne pas la
  variable ; le README annonce 10 (ligne 346) et a été corrigé pour décrire
  l'ordre réel (ligne 348).

Le test d'EVO-11 est **bon** : il assert la séquence `[400, 400, 400, 429]`,
l'en-tête `Retry-After`, et le fait qu'une connexion valide reçoive 429 une fois
le quota dépassé. Il rougit sous mutation (M1).

Deux réserves, toutes deux mineures et consignées en RL1-17 : la clé de compteur
est désormais bâtie sur une valeur de corps non validée, ce qui délie la taille
des clés du schéma `zod` et rend gratuit le verrouillage d'un compte connu. La
limitation en mémoire reste par ailleurs mono-instance, ce que le README dit
déjà.

### 5.4 EVO-07 — « `arreterEcoute()` : le rétablissement est-il couvert ? »

**Le rétablissement est couvert, et bien couvert** — ce n'est pas seulement
l'arrêt propre qui a été traité.

Le test `robustesse.test.js:724` ne se contente pas de constater que l'écoute
repart : il modifie le référentiel **pendant** la coupure, vérifie que le cache
ne l'a pas vu, attend le rétablissement, puis vérifie que le cache l'a vu — donc
que le rechargement a bien eu lieu **après** la reprise. C'est le point que la
fiche qualifiait d'essentiel, et il est tenu. Il rougit sous deux mutations
distinctes (M7 : rechargement supprimé ; M8 : replanification supprimée).

Je l'ai confirmé sur une **coupure réelle**, que le test ne simule pas :
`pg_terminate_backend` sur la connexion d'écoute produit la même séquence
complète, jusqu'au `NOTIFY` reçu sur la nouvelle connexion (§ 1).

Deux imperfections, mineures : l'état rapporté après `arreterEcoute()`
(RL1-11) et l'absence de rechargement quand la toute première tentative a échoué
(RL1-12). Ni l'une ni l'autre n'entame l'acquis.

---

## 6. Migration

Épreuve réelle, sur une base `revue_lot1` créée pour l'occasion, peuplée au
schéma d'avant le lot (deux banques, cinq comptes), puis détruite.

| Situation | Résultat |
| --- | --- |
| Base peuplée **sans** doublon de casse, première passe | `Migration terminée.`, code 0 |
| La même, deuxième passe immédiate | `Migration terminée.`, code 0 — **idempotente** |
| Index posés | `idx_users_email_lower` sur `lower(email)`, `idx_admin_events_date` sur `(created_at DESC, id DESC)` |
| Colonnes ajoutées | `label_at_submit`, `description_at_submit`, toutes deux `NULL`ables |
| Données | cinq comptes intacts |
| Base peuplée **avec** deux doublons de casse | `Échec de la migration : … ces adresses existent en plusieurs casses … : agent2@banque.tn, agent@banque.tn`, code 1 |
| État après cet échec | **rien n'est appliqué** : ni les colonnes, ni l'index de pagination, ni l'index unique |

Le garde-fou fait ce que la fiche demandait : il nomme les adresses en cause
plutôt que de laisser PostgreSQL refuser l'index sur une erreur brute. C'est un
bon geste, et il faut le dire.

Ce qui manque est consigné en **RL1-06** (tout-ou-rien, absence de contrôle de
schéma au démarrage, message sans marche à suivre) et **RL1-14** (aucun test
n'exerce le garde-fou).

*Note d'environnement.* Le rôle `clicktopay` n'a pas l'attribut `CREATEDB` sur
cette machine : `createdb -h 127.0.0.1 -U clicktopay revue_lot1` est refusé
(« permission denied to create database »). J'ai créé les deux bases de revue par
le superutilisateur local (`createdb -O clicktopay`), et les ai détruites en
partant.

---

## 7. Ce que j'ai éprouvé par mutation

Protocole : la garde est retirée du fichier source, le fichier de tests concerné
est rejoué seul sur la base `revue_lot1_test`, puis le fichier source est
restauré et `git status` vérifié. Vingt mutations.

| # | Garde retirée | Fichier de tests | Résultat |
| --- | --- | --- | --- |
| M1 | `loginLimiter` remis **après** `validate` (`routes/auth.js:35`) | `limitation.test.js` | **rouge** — « au-delà du quota, un corps invalide reçoit 429 et non 400 » |
| M2 | Garde `if (!repli)` neutralisée (`mccSuggestion.js:152`) | `mcc.test.js` | **rouge** — « le repli 5999 désactivé ne produit pas une proposition mutilée » |
| M3 | `app.use(typeDeContenuAttendu)` retiré (`app.js:60`) | `robustesse.test.js` | **rouge** — « un type de contenu inattendu est refusé en 415 » |
| M4 | `app.use(corpsInexploitable)` retiré (`app.js:59`) | `robustesse.test.js` | **rouge** — 400 JSON tronqué **et** 413 corps trop grand |
| M5 | `connexionSuspecte = retourArriere` retiré (`pool.js:35`) | `robustesse.test.js` | **rouge** — « un retour arrière impossible n'efface pas l'erreur métier » |
| M6 | `erreursDeTeleversement` retiré de la chaîne (`routes/admin.js:216`) | `robustesse.test.js` | **rouge** — 413 fichier trop gros **et** 400 champ inattendu |
| M7 | Rechargement après reprise neutralisé (`mccCatalog.js:286`) | `robustesse.test.js` | **rouge** — « une écoute perdue est rétablie, et le catalogue rechargé » |
| M8 | `planifierReprise()` retiré du gestionnaire d'erreur (`mccCatalog.js:277`) | `robustesse.test.js` | **rouge** — même test |
| M9 | Traduction du `23505` neutralisée (`admin.js:169`) | `admin.test.js` | **rouge** — « l'unicité de l'adresse ne dépend pas de la casse » |
| M10 | `tracerChamps(...)` remplacé par `{ champs: Object.keys(payload) }` (`admin.js:278`) | `admin.test.js` | **rouge** — « le journal porte les valeurs avant et après » |
| M11 | `journaliser` retiré de `changeOwnPassword` (`admin.js:276`) | `auth.test.js` | **rouge** — « le changement de mot de passe par l'utilisateur est journalisé » |
| M12 | `ORDER BY created_at DESC, id DESC` → `ORDER BY e.id DESC` (`admin.js:568`) | `admin.test.js` | **VERT — mutation survivante** (RL1-10) |
| M13 | `offset` forcé à 0 dans la requête de page (`admin.js:562`) | `admin.test.js` | **rouge** — « les 250 entrées se remontent page par page » |
| M14 | `reactives.push(...)` retiré (`mccAdmin.js:277`) | `import.test.js` | **rouge** — deux tests EVO-09 |
| M15 | Boucle d'application des réactivations retirée (`mccAdmin.js:378`) | `import.test.js` | **rouge** — deux tests EVO-09 |
| M16 | `if (!apply) return rapport` neutralisé (`mccAdmin.js`) | `import.test.js` | **rouge** — CAS-IMPORT-08 **et** CAS-IMPORT-09 |
| M17 | Libellé relu depuis le catalogue vivant (`requests.js:388`) | `requests.test.js` | **rouge** — deux tests EVO-08 |
| M18 | `errorHandler` renvoie `err.stack` sur les 500 (`errors.js:27`) | `robustesse.test.js` | **rouge par le test dédié n° 4 seulement — le balayage d'invariant reste vert** (RL1-04) |
| M19 | Une trace ajoutée à **toutes** les erreurs (`errors.js:28`) | `robustesse.test.js` | **rouge** — mais par quinze tests d'égalité de message, pas par le balayage |
| M20 | Désactivation des absents remplacée par une réactivation (`mccAdmin.js`) | `import.test.js` | **rouge** — CAS-IMPORT-10 |

**Dix-huit rouges sur vingt.** Les tests du lot ne sont pas décoratifs : ils
tiennent réellement les gardes qu'ils nomment. Les deux exceptions sont
instructives :

- **M12 — survivante.** Le tri stable d'EVO-06 n'est pas éprouvé : le jeu
  d'essai emploie un horodatage unique, où l'ancien tri et le nouveau coïncident
  (RL1-10).
- **M18 — faussement rouge.** Le balayage d'invariant d'EVO-10, celui que la
  fiche présentait comme la pièce maîtresse, **ne rougit pas** : ses treize
  appels ne produisent aucune réponse ≥ 500, si bien que ses motifs de pile ne
  sont jamais confrontés à une pile. C'est un test qui ne peut pas échouer pour
  le défaut qu'il nomme (RL1-04).

État du dépôt après les vingt mutations :
`git status --porcelain clicktopay-affiliation/server` → vide.

---

## 8. Ce que je soupçonne sans l'avoir prouvé

À distinguer nettement de ce qui précède : ces points reposent sur la lecture, et
mériteraient une épreuve avant d'être tenus pour acquis.

1. **`compareImport` travaille sur le cache, pas sur la base.** `getMcc(code)`
   (`mccAdmin.js:248`) lit le catalogue en mémoire. Entre le rapport d'écart
   affiché à l'administrateur et l'application (`apply: true`), une autre
   instance peut avoir modifié le référentiel : le rapport confirmé n'est alors
   plus celui qui s'applique. EVO-09 ajoute `reactives` à cette liste, donc
   étend la surface. Antérieur au lot, mais aggravé par lui.
2. **`traduireConflitEmail` dans `updateUser`** (`admin.js:290`) interpole
   `payload.email` dans le message. Je n'ai pas trouvé de chemin où un `23505`
   sur les contraintes d'adresse survienne sans que `payload.email` soit défini,
   mais la garantie n'est portée par rien d'explicite : un message
   « Un autre compte utilise déjà l'adresse undefined. » reste théoriquement
   atteignable.
3. **`notFoundHandler`** (`errors.js:20`) renvoie `req.originalUrl` tel quel. En
   JSON le risque est faible, mais c'est une réflexion d'entrée utilisateur dans
   une réponse d'erreur, dans un produit qui vient précisément de se donner pour
   règle de ne rien laisser sortir.
4. **Le `DROP INDEX` / `CREATE INDEX` d'EVO-06 n'est pas `CONCURRENTLY`.** Sur un
   `admin_events` devenu volumineux en production, la reconstruction prend un
   verrou exclusif et bloque les écritures du journal le temps de l'opération.
   Je n'ai pas mesuré sur un volume réaliste.

---

## 9. Synthèse

**Constats par gravité : 2 bloquants, 5 majeurs, 11 mineurs.**

**Les trois à corriger avant mise en service.**

1. **RL1-01** — la course sur `updateUser` fait écrire au journal `sansEffet`
   sur une modification qui a bel et bien eu lieu. Le journal peut affirmer le
   contraire de l'état de la base. Sur un produit où le commanditaire a décidé
   que l'administrateur cumulerait saisie et arbitrage, et que la maîtrise du
   risque reposerait entièrement sur le journal, c'est disqualifiant. Correctif
   court : relire l'état antérieur sous `FOR UPDATE`, dans la transaction.
2. **RL1-02** — le journal n'est pas cloisonné par banque : un banquier lit les
   adresses et les rôles des comptes des autres banques, et EVO-06 lui donne le
   moyen de tout remonter. L'ouverture vient du commit postérieur, la portée
   vient d'EVO-06 : les deux partiraient ensemble. Correctif court : réserver
   `/api/admin/events` à l'administrateur le temps d'écrire le filtre.
3. **RL1-06** — la migration est tout ou rien. Une base de production portant un
   seul doublon de casse n'obtient **aucune** des trois évolutions de schéma, et
   le code livré échoue alors en 500 à la première soumission de demande, sans
   que le contrôle de santé le voie. Correctif court : un contrôle de schéma au
   démarrage, qui refuse de servir plutôt que de servir faux.

RL1-03, RL1-04, RL1-05 et RL1-07 viennent juste derrière : ce sont quatre
variantes du même défaut d'invariant, et RL1-07 en particulier est une bombe à
retardement pour le journal.

**Éprouvé par mutation** : vingt gardes retirées, dix-huit tests rouges, une
mutation survivante (M12, tri stable d'EVO-06) et un test structurellement
incapable de rougir (M18, balayage d'invariant d'EVO-10). Le détail est au § 7.

**Avis sur la solidité du lot.**

Le lot est **solide dans son exécution et fragile dans ses invariants**. Neuf
évolutions sur douze font exactement ce que leur fiche demande, je l'ai vérifié
en exécutant et non en lisant : EVO-02, EVO-03, EVO-07 et EVO-09 sont
irréprochables, EVO-01, EVO-04, EVO-06, EVO-08 et EVO-11 sont tenues à des
réserves mineures près. La qualité des tests est nettement au-dessus de ce que
l'on voit d'ordinaire : dix-huit gardes sur vingt sont réellement protégées, ce
qui est un très bon score. La tenue du code — commentaires français qui
expliquent le symptôme d'origine plutôt que la mécanique — reste exemplaire et ne
s'est pas dégradée sur mille cinq cents lignes.

Ce qui manque est d'un autre ordre, et c'est le reproche récurrent du projet. À
cinq reprises, l'auteur a corrigé le cas qu'on lui avait montré sans fermer la
classe : le multipart exempté partout plutôt qu'à la route qui le consomme
(RL1-03) ; deux codes `multer` traduits, le reste en 500 (RL1-05) ; les champs du
journal recopiés à côté de la liste qui fait foi (RL1-07) ; un balayage
d'invariant écrit contre trois chaînes de caractères plutôt que contre la
propriété (RL1-04) ; et surtout un journal dont on a enrichi le contenu sans
s'assurer qu'il dit vrai (RL1-01). Ce dernier point est le plus grave, parce
qu'il touche la seule pièce sur laquelle le commanditaire a décidé de faire
reposer la maîtrise du risque.

**Mon avis : ne pas mettre en service en l'état.** Les trois correctifs
ci-dessus sont courts — je les estime à une demi-journée ensemble, tests
compris — et une fois posés, le lot 1 est à mon sens livrable. Il n'y a rien à
refaire ; il y a trois trous à boucher et quatre invariants à élargir.

---

*Revue conduite le 2026-09-23. Bases `revue_lot1` et `revue_lot1_test` créées
pour l'occasion et détruites en fin de revue. Aucun fichier du projet modifié
hors le présent document.*
