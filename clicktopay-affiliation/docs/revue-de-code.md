# Revue de code — ClickToPay Affiliation

> Agent 4 — revue statique (lecture de code), campagne de recette.
> Rapport rédigé **au fil de la lecture** : l'ordre des constats suit l'ordre des modules lus,
> le classement par gravité est donné en synthèse à la fin.

## 1. Méthode et périmètre

Revue **statique**, sans exécution fonctionnelle (deux autres agents couvrent la recette). Objectif :
ce qu'une exécution nominale ne révèle pas — concurrence, transactions mal bornées, erreurs avalées,
contournements de contrôle d'accès, pertes de trace.

Ordre de lecture (du plus sensible au moins sensible) :

1. `server/src/db/pool.js`, `server/src/config.js`
2. `server/src/middleware/auth.js`, `errors.js`, `rateLimit.js`, `server/src/app.js`, `index.js`
3. `server/src/services/requests.js`
4. `server/src/services/admin.js`
5. `server/src/services/mccAdmin.js`, `mccImportFile.js`
6. `server/src/services/mccCatalog.js`, `mccSuggestion.js`, `motsCles.js`
7. `server/src/routes/*.js`, `server/src/services/*Schema.js`
8. `web/src/` (survol : contrôles d'accès côté client, gestion d'erreurs)

---

## 2. Constats

### C-01 — CRITIQUE — Secret JWT et identifiants base en dur, jamais exigés en production

**Fichier** : `server/src/config.js:3-16`

```js
const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
};

export const config = {
  databaseUrl: required('DATABASE_URL', 'postgres://clicktopay:clicktopay@127.0.0.1:5432/clicktopay'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-a-remplacer-en-production'),
```

**Problème** : `required()` ne peut jamais lever : un `fallback` est systématiquement fourni, donc
`value` n'est jamais `undefined`. Le nom de la fonction et le `throw` mentent — ils donnent
l'illusion d'un garde-fou qui n'existe pas. Conséquence : si `JWT_SECRET` n'est pas positionné sur
l'environnement de production (oubli de déploiement, variable perdue lors d'une migration de
conteneur), l'API démarre **silencieusement** avec un secret publié dans le dépôt Git.

**Scénario** : quiconque a lu le dépôt (prestataire, stagiaire, fuite du code) forge
`jwt.sign({ sub: 1, role: 'ADMIN', ... }, 'dev-secret-a-remplacer-en-production')` et obtient un
jeton accepté par `authenticate` (`middleware/auth.js:35`). Le seul rempart restant est que l'`id`
doit exister en base — ce qui est trivial (`sub: 1`). Dans une application bancaire, c'est une
compromission totale du cloisonnement inter-banques.

**Correction** : en `NODE_ENV === 'production'`, refuser le démarrage si `JWT_SECRET` ou
`DATABASE_URL` sont absents, et refuser la valeur de développement même si elle est fournie
explicitement. Par exemple :

```js
const required = (name, fallbackDev) => {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') throw new Error(`Variable requise : ${name}`);
  return fallbackDev;
};
```

Ajouter également un contrôle de longueur minimale du secret (>= 32 caractères).

### C-02 — MAJEUR — `updateRequest` ne reprend pas la garde de statut dans sa transaction (TOCTOU)

**Fichier** : `server/src/services/requests.js:135-165`

```js
export async function updateRequest({ id, payload, user }) {
  const existing = await getRequest(id, user);
  assertEditable(existing, user);          // <- lecture hors transaction
  ...
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE affiliation_requests SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
      values                                // <- aucune clause AND status IN (...)
    );
```

**Problème** : le contrôle « la demande est encore modifiable » est fait sur une lecture antérieure
à la transaction, et l'`UPDATE` ne le rejoue pas. Les deux autres transitions du module font
exactement l'inverse et le commentent explicitement (`requests.js:241-249` pour la soumission,
`requests.js:312-324` pour la décision : `WHERE id = $1 AND status = 'SOUMISE'`). L'incohérence
n'est donc pas un oubli de conception mais un oubli d'application.

**Scénario concret** : l'agent ouvre le formulaire d'une demande en `COMPLEMENT_REQUIS` et
enregistre ; au même instant le banquier soumet/arbitre (ou l'agent soumet depuis un second onglet).
La lecture ligne 136 voit `COMPLEMENT_REQUIS`, la transition concurrente passe la demande en
`SOUMISE` puis `VALIDEE`, et l'`UPDATE` s'applique **après** : les données de la demande validée
(RIB, raison sociale, MCC proposés) sont modifiées après l'arbitrage, sans que le statut ne change.
L'événement journalisé est un simple `MODIFICATION` : la piste d'audit montre une demande validée
dont le contenu a bougé post-décision, sans aucun moyen de savoir ce qui a été arbitré.

**Correction** : porter la garde dans l'`UPDATE`, comme ailleurs :

```sql
UPDATE affiliation_requests SET ... WHERE id = $n AND status IN ('BROUILLON','COMPLEMENT_REQUIS')
```
et lever un `conflict()` si `rowCount === 0`. Idéalement, relire la ligne en `SELECT ... FOR UPDATE`
en début de transaction et faire porter `assertEditable` sur cette lecture-là.

### C-03 — MAJEUR — La photographie des suggestions perd son sens si un MCC quitte le référentiel

**Fichier** : `server/src/services/requests.js:351-369`

```js
const mcc = getMcc(row.mcc_code);
grouped[row.network].push({
  ...mcc,                       // `undefined` si le code n'est plus au catalogue
  rank: row.rank, score: row.score, matchedTerms: row.matched_terms,
});
```

**Problème** : `getMcc` lit le cache du référentiel courant. Si un ADMIN supprime un MCC (ou si un
import Excel le retire, cf. `mccAdmin.js`), `getMcc` renvoie `undefined`, `{...undefined}` vaut `{}`
et l'entrée restituée n'a **ni code, ni libellé** — seulement un rang et un score. L'erreur est
silencieuse : aucun log, aucune exception.

**Scénario** : contestation d'un dossier six mois après la décision. On consulte la photographie des
suggestions qui a guidé l'arbitrage ; le référentiel a été réimporté entre-temps ; l'écran affiche
des lignes vides. La table `mcc_suggestions` contient pourtant bien `mcc_code` — l'information est
là, c'est la couche de lecture qui la jette.

**Correction** : toujours restituer le code stocké, et signaler l'absence au catalogue plutôt que de
l'effacer :

```js
grouped[row.network].push({
  code: row.mcc_code, label: mcc?.label ?? null, horsReferentiel: !mcc,
  ...(mcc ?? {}), rank: row.rank, score: row.score, matchedTerms: row.matched_terms,
});
```
Le même raisonnement vaut pour toute lecture historique qui rejoint le référentiel vivant.

### C-04 — MAJEUR — `withTransaction` : un `ROLLBACK` en échec masque l'erreur d'origine

**Fichier** : `server/src/db/pool.js:8-22`

```js
} catch (err) {
  await client.query('ROLLBACK');   // peut rejeter à son tour
  throw err;
} finally {
  client.release();
}
```

**Problème** : si la connexion est tombée (redémarrage PostgreSQL, timeout, `ECONNRESET`), le
`ROLLBACK` rejette et **son** erreur remplace `err`. L'erreur métier réelle (violation de contrainte,
conflit de statut) est perdue, remplacée par un message de transport. Par ailleurs `client.release()`
sans argument remet au pool un client dont l'état transactionnel est indéterminé ; `pg` recommande
`client.release(err)` pour le détruire lorsqu'une erreur de connexion est survenue.

**Scénario** : incident de production, les journaux ne contiennent que « Connection terminated » là
où la vraie cause était un conflit d'intégrité. Le diagnostic part dans la mauvaise direction.

**Correction** :

```js
} catch (err) {
  try { await client.query('ROLLBACK'); }
  catch (rollbackErr) { console.error('ROLLBACK en échec', rollbackErr); erreurConnexion = rollbackErr; }
  throw err;
} finally {
  client.release(erreurConnexion);
}
```

### C-05 — MAJEUR — Un changement de mot de passe par l'utilisateur ne laisse aucune trace

**Fichier** : `server/src/services/admin.js:208-225`

```js
export async function changeOwnPassword({ user, currentPassword, newPassword }) {
  ...
  await query(
    `UPDATE users SET password_hash = $1, must_change_password = FALSE,
            password_changed_at = now(), updated_at = now() WHERE id = $2`,
    [hash, user.id]
  );
  return { changed: true };
}
```

**Problème** : aucun appel à `journaliser()`. Toutes les autres mutations du périmètre administration
écrivent dans `admin_events` (`CREATION`, `MODIFICATION`, `REINITIALISATION_MOT_DE_PASSE`) ;
le changement de mot de passe par l'intéressé, lui, est muet. La table `request_events` n'est pas
concernée non plus. C'est le seul point du code où un secret d'authentification change sans écrire
une ligne de journal.

**Scénario** : un compte est compromis, l'attaquant change le mot de passe pour conserver l'accès.
L'audit post-incident ne peut ni dater ni constater l'opération : seul `password_changed_at` bouge,
et il est écrasé au changement suivant. Aucun historique.

**Correction** : envelopper l'`UPDATE` et un `journaliser(client, { entity: 'USER', entityId: user.id,
action: 'CHANGEMENT_MOT_DE_PASSE' })` dans un `withTransaction`. Ne jamais journaliser le mot de
passe ni son empreinte — l'action et l'horodatage suffisent.

### C-06 — MAJEUR — Le journal d'administration n'enregistre pas les valeurs modifiées

**Fichier** : `server/src/services/admin.js:154-157`

```js
await journaliser(client, {
  userId: user.id, entity: 'USER', entityId: id, action: 'MODIFICATION',
  payload: { champs: Object.keys(payload) },        // <- uniquement les NOMS de champs
});
```

**Problème** : seule la liste des champs touchés est conservée. L'élévation d'un compte
`AGENT` → `ADMIN`, ou son rattachement à une autre banque, produisent la même ligne de journal
qu'un changement de prénom : `{ champs: ['role'] }`. Ni l'ancienne ni la nouvelle valeur. La valeur
avant modification est pourtant déjà chargée à la ligne 114 (`const avant = await getUser(id)`) et
la nouvelle est dans `payload` — l'information est disponible, elle est simplement jetée.
`createBank`/`updateBank` (lignes 256, 295) journalisent, eux, le payload complet : la convention
diverge d'un objet métier à l'autre.

**Scénario** : contrôle interne, question « qui a donné le rôle ADMIN à ce compte et quand ? ».
Le journal ne permet pas d'y répondre ; il faut recouper avec des sauvegardes de la table `users`.
Le même trou empêche de reconstituer un transfert d'agent d'une banque vers une autre — qui change
le périmètre de visibilité des demandes.

**Correction** : journaliser `{ avant: <valeurs des champs touchés>, apres: payload }`, en
excluant explicitement tout champ sensible. Même remarque, en moins grave, pour
`requests.js:157-162` (`MODIFICATION` d'une demande : seuls les noms de champs sont conservés,
alors qu'une demande contient RIB et coordonnées bancaires — là, ne pas journaliser les valeurs se
défend, mais il faudrait au moins tracer l'empreinte des champs financiers).

### C-07 — MAJEUR — `authenticate` s'exécute deux fois par requête : deux allers-retours base inutiles

**Fichiers** : `server/src/app.js:31` ; `server/src/routes/requests.js:23`, `server/src/routes/mcc.js:11`,
`server/src/routes/admin.js:34`

```js
// app.js
app.use(authenticate, requirePasswordChanged);
app.use('/api/mcc', mccRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/admin', adminRouter);

// routes/requests.js
requestsRouter.use(authenticate);          // déjà appliqué globalement
```

**Problème** : `authenticate` est monté globalement **et** dans chacun des trois routeurs. Le
middleware n'est pas idempotent au sens du coût : il revérifie la signature JWT et surtout refait
la requête `SELECT u.id, ... FROM users u JOIN banks b` à chaque passage. Chaque appel API
consomme donc deux connexions du pool et deux requêtes SQL pour le seul contrôle d'identité.
Sous charge, c'est un doublement pur du trafic d'authentification vers PostgreSQL.

Au-delà du coût, c'est une **duplication qui finira par diverger** : si demain le contrôle global
est retiré (par exemple pour ouvrir une route publique), le fait que les routeurs se protègent
eux-mêmes est invisible à la lecture de `app.js` ; inversement, quelqu'un qui ajoute un routeur en
oubliant le `use(authenticate)` local croira être protégé — il le sera, mais pour une raison qu'il
ignore.

**Correction** : choisir une seule stratégie. La plus lisible ici : garder la protection au niveau
de chaque routeur (`authenticate` + `requirePasswordChanged`), et retirer le `app.use(...)` global —
ou l'inverse, mais pas les deux. À défaut, mettre en cache le résultat sur `req` :
`if (req.user) return next();`.

### C-08 — MAJEUR (latent) — La péremption des jetons compare l'horloge applicative à celle de la base

**Fichiers** : `server/src/middleware/auth.js:55-58` ; `server/src/services/admin.js:218-223`

```js
// auth.js — `password_changed_at` vient de PostgreSQL (now())
const changeLe = Math.floor(new Date(utilisateur.password_changed_at).getTime() / 1000);
// `charge.iat` vient de jsonwebtoken, donc de l'horloge du processus Node
if (typeof charge.iat === 'number' && charge.iat < changeLe) throw unauthorized(...);
```

**Problème** : le mécanisme (excellent dans son principe) compare deux horloges différentes —
celle du serveur applicatif (`iat`, posé par `jwt.sign`) et celle du serveur PostgreSQL (`now()`).
Dans `routes/auth.js:100-115`, l'utilisateur change son mot de passe puis reçoit immédiatement un
nouveau jeton : si l'horloge de la base a ne serait-ce qu'une seconde d'avance sur celle de Node,
`changeLe = iat + 1` et le jeton fraîchement émis est refusé par la requête suivante.

**Scénario** : base et API sur deux machines, dérive NTP de quelques centaines de millisecondes à
quelques secondes (banal). Un utilisateur dont le mot de passe vient d'être réinitialisé par
l'administrateur change son mot de passe, reçoit un jeton, et se voit répondre
« Mot de passe modifié : reconnectez-vous » — indéfiniment, puisque chaque nouveau jeton subit le
même sort tant que la dérive persiste. Le compte est bloqué sans message intelligible, et le
symptôme est indétectable en développement (base et API sur la même machine).

**Correction** : introduire une tolérance explicite, par exemple
`if (charge.iat + TOLERANCE_HORLOGE_S < changeLe)` avec 30 s, **ou** poser `password_changed_at`
depuis l'application (`$1::timestamptz` avec `new Date()`) pour que les deux valeurs proviennent de
la même horloge. La tolérance est le choix sûr : elle ne rouvre qu'une fenêtre de 30 s sur
l'invalidation des sessions.

### C-09 — MINEUR — Les erreurs de multer remontent en 500

**Fichier** : `server/src/routes/admin.js:22-29` et `server/src/middleware/errors.js:23-30`

```js
const televersement = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, fichier, callback) => { ... callback(badRequest('Format non pris en charge ...')); },
});
```

**Problème** : le `fileFilter` produit bien un `HttpError` 400, mais les erreurs générées par multer
lui-même — `LIMIT_FILE_SIZE` au-delà de 5 Mo, `LIMIT_UNEXPECTED_FILE` si le champ ne s'appelle pas
`fichier` — sont des `MulterError` sans propriété `status`. `errorHandler` applique alors
`err.status ?? 500` et répond « Erreur interne du serveur », en journalisant une pile d'appels.

**Scénario** : l'administrateur téléverse un référentiel de 8 Mo. L'écran annonce une panne serveur
au lieu de « fichier trop volumineux (max 5 Mo) », et l'exploitant reçoit une alerte 500 pour une
erreur de saisie.

**Correction** : dans `errorHandler`, traduire `err instanceof multer.MulterError` en 400/413 avec
un message métier, ou envelopper `televersement.single('fichier')` dans un middleware qui
retransforme l'erreur.

### C-10 — MINEUR — `requireRole` laisse ADMIN franchir toutes les séparations de fonction

**Fichier** : `server/src/middleware/auth.js:71-75`

```js
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role === 'ADMIN' || roles.includes(req.user.role)) return next();
```

**Problème** : le choix est explicite et documenté, mais sa conséquence l'est moins : un ADMIN
passe `requireRole('AGENT')` **et** `requireRole('BANQUIER')`. Il peut donc créer une demande, la
soumettre, puis l'arbitrer lui-même — les trois actions étant tracées à son nom, mais sans qu'aucun
contrôle ne s'y oppose. Dans une application bancaire, le principe des quatre yeux est
habituellement un invariant, pas une convention.

À noter aussi : l'ADMIN qui crée une demande la rattache à **sa propre** banque
(`requests.js:115-116`, `user.bankId`) — il n'existe pas de moyen de créer une demande pour une
autre banque, ce qui rend cette capacité surtout accidentelle.

**Correction** (choix à trancher côté métier) : soit restreindre les routes d'action métier aux
rôles nommés uniquement (`roles.includes(req.user.role)`) et laisser à l'ADMIN une visibilité en
lecture, soit conserver le comportement mais interdire explicitement qu'un même utilisateur soumette
et arbitre la même demande (`decided_by <> created_by`).

### C-11 — MINEUR — Le compteur de connexions permet de bloquer un compte tiers

**Fichier** : `server/src/routes/auth.js:17-25`

```js
keyGenerator: (req) => [`ip:${req.ip}`, req.body?.email ? `compte:${...}` : null],
```

**Problème** : la clé « compte » est incrémentée par toute tentative, y compris échouée et
provenant d'une source arbitraire. Dix requêtes suffisent à rendre un compte connu inutilisable
pendant 15 minutes, sans authentification préalable. C'est le revers assumé de la protection contre
l'attaque distribuée, mais rien dans le code ne le signale ni ne l'atténue.

**Correction** : conserver la clé compte avec un seuil nettement plus élevé que la clé IP (par
exemple 10 par IP, 50 par compte), et ne compter sur la clé compte que les échecs, pas les
tentatives — `loginLimiter.reset(req)` le fait déjà en cas de succès, mais après coup.

### C-12 — CRITIQUE — Une erreur passagère de base fige l'API entière en erreur 500 jusqu'au redémarrage

**Fichier** : `server/src/services/mccCatalog.js:125-147` (et `server/src/app.js:23-26`)

```js
export function assurerCatalogueCharge() {
  chargement ??= chargerCatalogue().catch((err) => {
    chargement = null;                 // un échec ne doit pas figer un cache vide
    throw err;
  });
  return chargement;
}

export async function rechargerCatalogue({ diffuser = true } = {}) {
  chargement = chargerCatalogue();     // <- AUCUN filet équivalent
  const resultat = await chargement;
  ...
}
```

**Problème** : `assurerCatalogueCharge` prend soin de remettre `chargement` à `null` en cas d'échec,
et le commentaire dit pourquoi. `rechargerCatalogue` écrase cette variable par une promesse **nue**.
Si `chargerCatalogue()` échoue (coupure réseau, `ECONNRESET`, redémarrage PostgreSQL, saturation du
pool), `chargement` conserve définitivement une promesse rejetée. Or `app.js:23-26` appelle
`assurerCatalogueCharge()` **à chaque requête** ; `chargement ??= ...` ne remplace pas une promesse
rejetée (elle n'est ni `null` ni `undefined`). Toutes les routes — y compris `/api/auth/login` —
répondent alors 500, indéfiniment, jusqu'au redémarrage du processus. Le cache ne se répare jamais
tout seul.

**Scénario** : l'instance B reçoit le `NOTIFY` émis par l'instance A après un import
(`mccCatalog.js:156-162`), la base est momentanément indisponible pendant la seconde qui suit,
`rechargerCatalogue({ diffuser: false })` rejette, la trace est bien écrite dans les journaux
(« Rechargement du référentiel MCC impossible ») — et l'instance B est morte fonctionnellement,
tout en répondant aux sondes `/api/health` (déclarée **avant** le middleware, ligne 20) : le
répartiteur de charge continue donc de lui envoyer du trafic.

**Correction** : appliquer le même filet que dans `assurerCatalogueCharge` :

```js
export async function rechargerCatalogue({ diffuser = true } = {}) {
  const promesse = chargerCatalogue();
  promesse.catch(() => { if (chargement === promesse) chargement = null; });
  chargement = promesse;
  const resultat = await promesse;
  ...
}
```
Faire par ailleurs porter à `/api/health` un contrôle de disponibilité du cache, pour que la sonde
reflète l'état réel de l'instance.

### C-13 — MAJEUR — L'écoute des modifications du référentiel ne se rétablit jamais après une coupure

**Fichier** : `server/src/services/mccCatalog.js:153-171`

```js
client.on('error', (err) => {
  console.error('Écoute du référentiel MCC interrompue :', err.message);
  ecoute = null;
  client.release(err);
});
```

**Problème** : `ecoute` est remis à `null` mais personne ne rappelle `ecouterModifications()` —
la fonction n'est invoquée qu'une fois, au démarrage (`index.js:10`). Après la première coupure de
la connexion dédiée (redémarrage de la base, coupure d'un pare-feu applicatif, `idle timeout` d'un
proxy type PgBouncer), l'instance cesse définitivement d'écouter, sans qu'aucun symptôme visible
n'apparaisse.

**Scénario** : exactement celui que le mécanisme est censé empêcher, décrit en commentaire lignes
22-28 — « une modification faite par une instance laisserait les autres servir un référentiel
périmé, et **accepter un code devenu interdit** ». Après une coupure, l'instance B continue
d'accepter à la soumission un MCC passé en `INTERDIT` sur l'instance A. `assertSelectableMcc`
(`requests.js:94-107`) s'appuie entièrement sur ce cache : le contrôle réglementaire est contourné
sans que personne ne le sache.

**Correction** : relancer l'écoute avec une temporisation exponentielle
(`setTimeout(() => ecouterModifications().catch(...), delai).unref()`), et **recharger le catalogue
à la reconnexion** puisque les notifications émises pendant la coupure sont perdues. À défaut,
prévoir un rechargement périodique de sécurité (toutes les N minutes), qui borne la durée de
péremption.

### C-14 — MAJEUR — Un MCC réenregistré est silencieusement relégué en fin de priorité dans son secteur

**Fichier** : `server/src/services/mccAdmin.js:13-35`

```js
/**
 * Remplace les secteurs d'un MCC. Le rang suit l'ordre fourni : le premier code
 * d'un secteur est celui que le moteur remonte en priorité.
 */
async function ecrireSecteurs(client, code, secteurs) {
  ...
  await client.query('DELETE FROM mcc_sectors WHERE mcc_code = $1', [code]);
  for (const [rang, secteur] of secteurs.entries()) {   // `rang` n'est jamais utilisé
    await client.query(
      `INSERT INTO mcc_sectors (sector_key, mcc_code, rank)
       VALUES ($1::varchar, $2,
               (SELECT COALESCE(MAX(rank), -1) + 1 FROM mcc_sectors WHERE sector_key = $1::varchar))
       ...`);
```

**Problème** : deux défauts liés.

1. **Le commentaire ment.** Le rang inséré n'est pas « l'ordre fourni » mais `MAX(rank) + 1` du
   secteur, c'est-à-dire *la dernière place*. La variable `rang` extraite de `secteurs.entries()`
   n'est jamais lue — vestige de l'intention d'origine, que le code ne met pas en œuvre.
2. **L'opération n'est pas idempotente.** Le `DELETE` puis le réinsertion en fin de liste font que
   **toute** modification d'un MCC (changer une note, corriger une faute dans le libellé) le renvoie
   en queue du classement de son secteur, dès lors que `sectors` figure dans le corps de la requête.

Or ce rang gouverne directement le moteur : `mccSuggestion.js:94-96` fait
`raw += 38 - sectorMccs.get(mcc.code) * 4`, soit 38 points pour le premier du secteur et 4 points de
moins par rang. Déplacer un code de la 1re à la 10e place lui retire 36 points — l'équivalent du
bonus de secteur tout entier.

**Scénario** : un administrateur corrige une coquille dans le libellé du MCC 5691 (premier code du
secteur « mode »). L'écran renvoie le formulaire complet, `sectors` inclus. Le code repart en
dernière position ; les propositions faites aux agents pour tout le secteur « mode » changent, sans
qu'aucun écran ne l'annonce et sans que l'historique `mcc_code_history` ne montre la moindre
différence (`sectors` est identique avant/après — seul le rang, non historisé, a bougé).

**Correction** : insérer le rang fourni, et le mettre à jour en cas de conflit :

```sql
INSERT INTO mcc_sectors (sector_key, mcc_code, rank) VALUES ($1::varchar, $2, $3)
ON CONFLICT (sector_key, mcc_code) DO UPDATE SET rank = EXCLUDED.rank
```
avec `rang` issu de `secteurs.entries()`. Et corriger le commentaire, ou le supprimer.

### C-15 — MAJEUR — Un import qui réintroduit un code désactivé ne le réactive pas, et l'annonce « inchangé »

**Fichiers** : `server/src/services/mccAdmin.js:197-246` et `services/mccCatalog.js:179`

```js
const COMPARABLES = ['label', 'description', 'labelEn', 'descriptionEn', 'keywords',
                     'similar', 'ecommerceRelevance', 'riskLevel', 'note'];   // `active` absent
...
const existant = getMcc(code);        // getMcc lit `byCode`, qui contient AUSSI les codes inactifs
```

**Problème** : `getMcc` renvoie les codes désactivés (`cache.byCode` est construit sur
`cache.items`, c'est-à-dire le catalogue complet). Un code présent dans le fichier mais désactivé en
base est donc considéré comme « existant », `active` n'est pas dans `COMPARABLES`, et l'`UPDATE` de
la branche `modifies` ne touche jamais la colonne `active`. Résultat : le code reste désactivé, et
le rapport d'écart le classe parmi les `inchanges` si aucun autre champ ne diffère.

**Scénario** : l'édition N du manuel retire le MCC 5993 ; l'administrateur importe avec
`deactivateMissing`, le code est désactivé. L'édition N+1 le réintroduit. L'administrateur importe
le nouveau fichier, lit « 0 ajouté, 0 modifié, 1 inchangé » et conclut que tout va bien. Le code
reste indisponible : ni proposé par le moteur (`catalogueActif()`), ni sélectionnable
(`assertSelectableMcc` rejette un code inactif). Le référentiel applicatif diverge du manuel de
référence, sans alerte.

**Correction** : traiter la réactivation comme un écart de premier rang — ajouter une catégorie
`reactives` au rapport (codes présents dans le fichier et inactifs en base), remettre `active = TRUE`
lors de l'application, et historiser l'action `IMPORT_REACTIVATION`.

### C-16 — MAJEUR — L'unicité des adresses e-mail n'est garantie que par le code applicatif

**Fichiers** : `server/src/db/schema.sql:18` et `server/src/services/admin.js:84-85`

```sql
email VARCHAR(160) NOT NULL UNIQUE          -- unicité SENSIBLE À LA CASSE
```
```js
const existe = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [payload.email]);
if (existe.rowCount > 0) throw conflict(...);
```

**Problème** : le contrôle applicatif est insensible à la casse, la contrainte de base ne l'est pas.
Deux comptes `Agent@banque.tn` et `agent@banque.tn` sont **acceptés** par PostgreSQL. Le contrôle
applicatif ne les empêche que s'il voit l'autre ligne : deux créations concurrentes lisent toutes
deux « aucune ligne », insèrent, et la contrainte unique ne déclenche pas puisque les chaînes
diffèrent.

**Conséquence en aval** : `routes/auth.js:35-41` fait
`WHERE lower(u.email) = lower($1)` puis `const user = rows[0]` — sans `ORDER BY`, PostgreSQL ne
garantit aucun ordre. La connexion peut authentifier l'un ou l'autre compte d'une requête à l'autre,
donc avec un **rôle et une banque potentiellement différents**. Dans une application cloisonnée par
banque, c'est une faille d'intégrité, pas un simple doublon.

**Correction** : `CREATE UNIQUE INDEX CONCURRENTLY idx_users_email_lower ON users (lower(email));`
(après déduplication des lignes existantes), et normaliser l'adresse en minuscules à l'écriture.
La contrainte applicative devient alors un simple confort de message d'erreur, doublée par la base —
c'est la base qui doit porter l'invariant.

### C-17 — MAJEUR — La suggestion de repli produit un objet vide si le MCC 5999 est absent ou désactivé

**Fichiers** : `server/src/services/mccSuggestion.js:129-133`, `server/src/db/schema.sql:126-136`

```js
if (scored.length === 0) {
  const fallback = catalogueActif().find((m) => m.code === '5999');
  return [{ ...fallback, score: 10, rawScore: 0, matchedTerms: ['aucune correspondance : code de repli'] }];
}
```

**Problème** : `find` renvoie `undefined` si le code 5999 n'existe plus ou a été désactivé — ce que
l'écran d'administration et l'import permettent tous les deux. `{ ...undefined }` vaut `{}` : la
suggestion retournée n'a **ni code, ni libellé**. Aucune exception, aucun journal.

**Scénario 1 (écran)** : l'agent reçoit une carte de suggestion vide et non sélectionnable.
**Scénario 2 (soumission, plus grave)** : `submitRequest` insère ces suggestions en base
(`requests.js:256-266`) ; `mcc_suggestions.mcc_code` est `CHAR(4) NOT NULL REFERENCES mcc_codes(code)`.
L'insertion échoue par violation de contrainte `NOT NULL`, la transaction est annulée et l'agent
reçoit une **erreur 500 sans explication** — la demande ne peut plus être soumise du tout, alors que
la cause réelle est un code du référentiel désactivé six mois plus tôt.

**Correction** : sécuriser le repli (`if (!fallback) return [];` ou, mieux, garantir par une règle
métier que le code de repli existe et reste actif — le vérifier au chargement du catalogue et
journaliser un avertissement sinon), et ne jamais insérer une suggestion sans code à la soumission.

### C-18 — MINEUR — Les objets MCC exposés par l'API embarquent l'index de recherche interne

**Fichiers** : `server/src/services/mccCatalog.js:118`, `192-215` ; `services/mccSuggestion.js:119-124`

```js
for (const mcc of items) mcc.index = construireIndex(mcc);   // mute l'objet mis en cache
...
return { ...mcc, score: toConfidence(raw), ... };             // `index` est spread avec le reste
```

**Problème** : `construireIndex` est accroché **sur l'objet du cache**, qui est ensuite renvoyé tel
quel par `searchCatalog` et étalé par `suggestMcc`. Chaque MCC sérialisé dans une réponse
(`GET /api/mcc`, `GET /api/mcc/:code`, `POST /api/mcc/suggest`, écran d'administration) embarque donc
un champ `index` : `tokens` et `tokensForts` sont des `Map`/`Set`, que `JSON.stringify` réduit à
`{}` — mais `phrases` est un tableau d'objets `{ libelle, normalise }` bien réel, dupliqué pour
chacun des deux réseaux. Une structure interne du moteur se retrouve dans le contrat d'API, et la
charge utile grossit sans raison sur une route appelée à chaque frappe.

**Correction** : stocker l'index hors de l'objet métier (`const index = new Map()` clé = code, ou un
champ non énumérable via `Object.defineProperty`), ou le retirer explicitement à la projection.

### C-19 — MINEUR — `?search=a&search=b` provoque une erreur 500 sur la recherche de catalogue

**Fichier** : `server/src/services/mccCatalog.js:192-208`

```js
const needle = normalize(term ?? '');            // tolère un tableau : String(['a','b']) -> "a,b"
...
const weight = mcc.code === term.trim() ? 0 : ...;   // `term.trim` n'existe pas sur un tableau
```

**Problème** : Express interprète un paramètre répété comme un tableau. `normalize` le tolère
(il passe par `String()`), la condition `if (!needle) return ...` ne protège donc pas, et
`term.trim()` lève un `TypeError` → 500. Même remarque pour `req.query.status`, `req.query.search`
et `req.query.mine` dans `listRequests` : un tableau passé à un paramètre `$n` de `pg` devient un
tableau PostgreSQL et fait échouer la comparaison.

**Correction** : normaliser les paramètres de requête en tête de route (`String(valeur)` ou
`Array.isArray(v) ? v[0] : v`), ou valider `req.query` avec un schéma zod comme le reste des entrées.

### C-20 — MINEUR — Le seed réactive les comptes et réinitialise leurs mots de passe, sans trace ni péremption des jetons

**Fichier** : `server/src/db/seed.js:91-102`

```sql
INSERT INTO users (...) VALUES (...)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  active = TRUE
```

**Problème** : trois effets non désirés sur une base déjà peuplée.
1. `active = TRUE` **réactive** un compte qu'un administrateur avait désactivé — y compris le compte
   `admin@clicktopay.tn`, dont le mot de passe est celui du dépôt (`Admin#2026`).
2. `role = EXCLUDED.role` réécrit un rôle modifié depuis l'écran d'administration.
3. `password_changed_at` n'est **pas** mis à jour : le mot de passe change mais les jetons émis
   avant restent valides, alors que tout le mécanisme de `middleware/auth.js:55-58` repose sur ce
   champ. Un seed n'est donc pas une façon sûre de reprendre la main sur un compte compromis.

Aucune de ces actions n'écrit dans `admin_events` : une restauration de privilèges peut avoir lieu
sans laisser la moindre trace applicative.

**Scénario** : `npm run db:seed` glissé dans un script de déploiement — une erreur d'exploitation
classique, d'autant que le script est idempotent par ailleurs et donc réputé sans danger.

**Correction** : conditionner les comptes de démonstration à `NODE_ENV !== 'production'`, ne jamais
forcer `active = TRUE` sur un conflit, et propager `password_changed_at = now()` si le mot de passe
est réécrit. Le commentaire « à supprimer avant toute mise en production » (ligne 18) ne suffit pas :
c'est au code de l'empêcher.

### C-21 — MINEUR (performance) — L'import du référentiel est quadratique et insère ligne à ligne

**Fichier** : `server/src/services/mccAdmin.js:248-350`

```js
for (const { code } of rapport.ajoutes) {
  const entree = entrees.find((e) => String(e.code).trim() === code);   // O(n) dans une boucle O(n)
  await client.query(`INSERT INTO mcc_codes ...`);                      // un aller-retour par code
```

**Problème** : `entrees.find` est refait pour chaque code ajouté (ligne 279), pour chaque code
modifié (ligne 301) et une troisième fois pour le rapport `muets` (ligne 261) — soit un balayage
complet du fichier à chaque ligne traitée. Sur le plafond autorisé par le schéma (2000 codes,
`adminSchema.js:135-137`), c'est jusqu'à 4 millions de comparaisons de chaînes, plus 2000 allers-retours
SQL séquentiels et 4000 insertions de journal (`historiser` en écrit deux), le tout dans une seule
transaction qui garde un verrou sur `mcc_codes` pendant toute sa durée.

**Correction** : indexer une fois (`const parCode = new Map(entrees.map(e => [String(e.code).trim(), e]))`)
et grouper les écritures (`INSERT ... SELECT * FROM unnest($1::text[], ...)`, ou au minimum
`pg-format`/multi-`VALUES` par lots de 500). Le gain est d'un ordre de grandeur, et la fenêtre de
verrouillage se réduit d'autant.

### C-22 — MINEUR (performance) — Créer ou modifier une banque recharge et recompte toutes les banques

**Fichier** : `server/src/services/admin.js:248-263` et `265-301`

```js
const banques = await listBanks();
return banques.find((b) => b.id === id);
```

`listBanks` exécute deux sous-requêtes `COUNT(*)` **par banque** (`admin.js:240-244`), sur `users`
et sur `affiliation_requests`, pour ne restituer qu'une seule ligne. À dix banques, c'est vingt
comptages inutiles ; le `COUNT` sur `affiliation_requests` ne dispose que de `idx_requests_bank_status`
et coûtera de plus en plus cher à mesure que les demandes s'accumulent.

**Correction** : renvoyer la ligne insérée/modifiée (`RETURNING *`) et ne recalculer les compteurs
que pour la liste. Accessoirement, `createBank` compare `b.id === id` et `updateBank`
`b.id === Number(id)` : deux conventions pour le même besoin, dont l'une repose sur le type renvoyé
par `RETURNING id`.

### C-23 — MINEUR (performance) — La liste des demandes trie sans index et cherche en `ILIKE '%…%'`

**Fichier** : `server/src/services/requests.js:205-218` ; `server/src/db/schema.sql:121-122`

```sql
... ORDER BY r.updated_at DESC LIMIT $n OFFSET $n+1
... (r.reference ILIKE $p OR r.site_name ILIKE $p OR r.company_name ILIKE $p OR r.rne ILIKE $p)
```

Le tri principal de l'écran le plus consulté porte sur `updated_at`, qui n'est indexé nulle part :
chaque page impose un tri complet du sous-ensemble de la banque. Le `%terme%` initial interdit
l'usage d'un index B-tree, même sur `reference`. Sans conséquence aujourd'hui, mais c'est la requête
qui grossira le plus vite.

**Correction** : `CREATE INDEX ON affiliation_requests (bank_id, updated_at DESC)`, et, si la
recherche devient centrale, une extension `pg_trgm` avec un index GIN sur les colonnes concernées.

### C-24 — MINEUR (traçabilité) — Le journal d'administration ne se consulte que par les 500 dernières lignes

**Fichier** : `server/src/services/admin.js:305-311` ; `server/src/routes/admin.js:206-214`

```js
export async function listAdminEvents({ limit = 100 } = {}) {
  const { rows } = await query(`... ORDER BY e.created_at DESC, e.id DESC LIMIT $1`, [Math.min(limit, 500)]);
```

Pas de pagination (`OFFSET`), pas de filtre par date, par entité ni par utilisateur, pas d'export.
Passé 500 événements — ce qu'un seul import de référentiel suffit à produire, puisque `historiser`
écrit une ligne `admin_events` par code touché (`mccAdmin.js:76-80`) — les actions antérieures
deviennent inaccessibles depuis l'application. Une piste d'audit qu'on ne peut plus remonter ne
remplit plus sa fonction.

**Correction** : ajouter `offset`, un filtre `entity`/`action`/période et, à terme, un export. Et
envisager de ne poser qu'un seul événement `admin_events` de synthèse par import (l'historique code
par code vivant déjà dans `mcc_code_history`), pour que le journal reste lisible.

### C-25 — MINEUR (sécurité) — Jeton porteur conservé dans `localStorage`

**Fichier** : `web/src/api/client.js:1-5`

```js
const TOKEN_KEY = 'clicktopay.token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
```

Un jeton de 8 heures portant le rôle et la banque est lisible par tout script s'exécutant dans la
page. La revue n'a trouvé **aucun** vecteur XSS dans le code actuel (pas de
`dangerouslySetInnerHTML`, pas d'`innerHTML`, React échappe tout ce qui est rendu) : le risque est
donc conditionné à une régression future ou à une dépendance compromise. Pour une application
bancaire, la bonne cible reste un cookie `HttpOnly` + `SameSite=Strict` avec protection CSRF.
À défaut, poser une CSP stricte côté serveur (`helmet` est déjà en place, mais sa CSP par défaut
ne couvre pas la page servie par Vite).

### C-26 — MINEUR (cohérence) — Trois conventions de journalisation, trois constructeurs d'`UPDATE`

**Fichiers** : `server/src/services/requests.js:85-91` (`logEvent`), `services/admin.js:11-17`
(`journaliser`), `services/mccAdmin.js:68-81` (`historiser`, qui insère lui-même dans `admin_events`)

Trois fonctions écrivent dans deux tables de journal, avec des conventions de `payload`
différentes (`{ champs: [...] }`, le payload brut, `{ comment, champs }`). `admin.js` réexporte au
passage des fonctions du catalogue qui ne lui appartiennent pas :

```js
export { journaliser, getMcc, rechargerCatalogue };   // admin.js:323
```

De même, la construction « champs camelCase → colonnes → `sets`/`values` » est recopiée à
l'identique trois fois (`requests.js:118-124` et `143-148`, `admin.js:141-146`,
`mccAdmin.js:137-142`). Ce n'est pas un défaut aujourd'hui ; c'est la duplication qui finira par
diverger — et la première divergence portera sur la journalisation, c'est-à-dire sur ce qui doit
justement rester homogène. Enfin, `services/mccImportFile.js:2` importe `normalize` depuis
`mccCatalog.js` alors que `services/texte.js` existe précisément pour éviter cette dépendance
(son propre commentaire le dit) : le module d'import tire ainsi tout le catalogue derrière lui.

**Correction** : un seul module `journal.js` exposant `tracerDemande()` et `tracerAdministration()`
avec une forme de `payload` contractuelle (`{ avant, apres }`), un utilitaire partagé
`construireSet(champs, payload)`, et l'import de `normalize` depuis `texte.js`.

---

## 3. Axes examinés sans rien trouver

Ces points ont été cherchés spécifiquement et sont **propres**. Ils ne sont pas listés pour meubler :
plusieurs d'entre eux sont mieux traités ici que dans la moyenne des applications comparables.

**Injection SQL — rien.** Toutes les requêtes passent par des paramètres `$n`. Les seuls fragments
de SQL construits par concaténation sont des **noms de colonnes** issus de tables de correspondance
figées dans le code (`FIELDS` dans `requests.js:7-43`, `CHAMPS_UTILISATEUR` dans `admin.js:104-111`,
`CHAMPS` dans `mccAdmin.js:37-49`) : aucune valeur venue de l'utilisateur n'atteint la chaîne SQL.
Le canal `NOTIFY`/`LISTEN` est une constante (`mccCatalog.js:29`). Les `ILIKE '%…%'` acceptent les
jokers `%` et `_` de l'utilisateur, ce qui n'est pas une injection mais une recherche plus large
qu'annoncée — sans conséquence de sécurité.

**Cloisonnement entre banques — rien à redire, hors C-16.** Le filtre `bank_id` est systématique et
posé au plus près de la donnée : `getRequest` (`requests.js:183-185`), `listRequests`
(`requests.js:193-196`), `getStats` (`requests.js:396-399`). Les lectures dérivées
(`getEvents`, `getSuggestionsSnapshot`) commencent par `await getRequest(...)` : le contrôle d'accès
n'est jamais contourné par une route secondaire, ce qui est la faute habituelle.

**Droits figés dans le jeton — traité, et bien.** `authenticate` (`middleware/auth.js:29-61`) relit
rôle, banque, activité du compte et de la banque à chaque requête plutôt que de les déduire de la
charge signée ; l'invalidation par `password_changed_at` coupe réellement les sessions ouvertes.
C'est la bonne conception (sous réserve de C-08 sur la comparaison d'horloges), et elle est couverte
par des tests dédiés (`robustesse.test.js`, « Cycle de vie des jetons »).

**Données sensibles journalisées — rien.** Aucun mot de passe, empreinte, jeton ni RIB n'est écrit
dans un journal ou renvoyé par une réponse. `errorHandler` (`middleware/errors.js:23-30`) ne
journalise que les 5xx et ne renvoie jamais le détail interne au client. La réponse de connexion
projette explicitement les champs et laisse `password_hash` de côté (`routes/auth.js:50-63`).

**Promesses non gérées, `await` manquants — rien trouvé côté serveur.** Tous les gestionnaires
asynchrones passent par `asyncRoute`. Les gestionnaires synchrones qui lèvent
(`routes/mcc.js:27-31`, `routes/admin.js:133-137`) sont rattrapés par Express 4. Le seul `catch`
sans variable (`middleware/auth.js:36`) relance immédiatement un 401. Les deux `catch` silencieux
du client web (`RequestFormPage.jsx:71`, `:146`) sont délibérés et commentés, et le cas qui comptait
vraiment — l'échec de suggestion — a justement été sorti du silence (`:127-131`).

**Coercition de types et valeurs hostiles — remarquable.** `zodHelpers.js` traite les pièges réels :
`"false"` qui vaut `true` avec `z.coerce.boolean()`, le `2026-02-30` que seul PostgreSQL rejetterait,
l'octet NUL qui casse l'encodage, le dépassement de `NUMERIC(14,3)`. Chacun est couvert par un test
nommé dans `robustesse.test.js`. C'est le point le plus solide du code.

**Concurrence — couverte à trois endroits sur quatre.** `submitRequest`, `decideRequest`,
`createMcc` et l'invariant « au moins un administrateur » ont chacun leur garde *et* leur test
(`robustesse.test.js`, « Concurrence »). Le quatrième chemin d'écriture, `updateRequest`, n'a ni
l'un ni l'autre — c'est précisément C-02.

**XSS côté web — rien.** Aucun `dangerouslySetInnerHTML`, aucun `innerHTML`, aucune injection de
HTML : tout passe par le rendu React. La double soumission du formulaire est traitée
(boutons désactivés pendant l'enregistrement, `RequestFormPage.jsx:437` et `:448`, et navigation
vers l'URL du brouillon dès la première sauvegarde).

---

## 4. Synthèse et appréciation

### Récapitulatif par gravité

| Gravité | Constats |
|---|---|
| **CRITIQUE** | C-01 (secret JWT en dur, jamais exigé), C-12 (cache du référentiel définitivement empoisonné par une erreur passagère) |
| **MAJEUR** | C-02 (TOCTOU sur la modification de demande), C-03 (photographie des suggestions vidée), C-04 (`ROLLBACK` masquant l'erreur), C-05 (changement de mot de passe non tracé), C-06 (journal sans les valeurs), C-07 (double authentification), C-08 (comparaison de deux horloges), C-13 (écoute non rétablie), C-14 (rang de secteur écrasé), C-15 (réactivation impossible à l'import), C-16 (unicité e-mail non portée par la base), C-17 (repli 5999 non défensif) |
| **MINEUR** | C-09 (erreurs multer en 500), C-10 (ADMIN au-dessus des séparations de fonction), C-11 (blocage de compte tiers), C-18 (index de recherche exposé par l'API), C-19 (paramètre répété → 500), C-20 (seed qui réactive les comptes), C-21 (import quadratique), C-22 (rechargement complet des banques), C-23 (tri non indexé), C-24 (journal non paginable), C-25 (jeton en `localStorage`), C-26 (conventions divergentes) |

### Appréciation

Le code est **au-dessus de la moyenne**, et visiblement écrit par quelqu'un qui a déjà vu casser ce
genre d'application. Les indices sont nombreux : la relecture des droits en base à chaque requête
plutôt que dans le jeton, les gardes de statut portées par l'`UPDATE` lui-même avec le commentaire
qui explique le scénario concurrent, le verrou consultatif pour l'invariant « un administrateur
restant » (et le raisonnement, juste, sur l'interblocage qu'un `FOR UPDATE` aurait produit), les
helpers zod qui traitent les coercitions vicieuses, la distinction simulation/application sur
l'import du référentiel. Les commentaires expliquent presque toujours *pourquoi*, rarement *quoi* —
c'est la bonne proportion.

Les vrais problèmes sont ailleurs que dans la logique métier : ils sont dans **ce qui entoure** le
chemin nominal. La configuration qui prétend valider sans valider (C-01). Le cache du référentiel,
qui est à la fois le socle du contrôle réglementaire et le composant le moins défendu du système :
il ne se répare pas après une erreur (C-12), il cesse de se synchroniser après une coupure (C-13),
et les codes qu'il a perdus font disparaître des données d'audit (C-03) ou cassent la soumission
(C-17). Et une constante : **les invariants sont portés par le code applicatif, pas par la base** —
unicité d'e-mail insensible à la casse (C-16), cohérence des statuts sur la modification (C-02).
Dans une application bancaire, ce qui n'est pas contraint en base finit par être violé.

La traçabilité, enfin, est bonne en couverture mais faible en contenu : chaque action métier laisse
bien une ligne — sauf le changement de mot de passe (C-05) — mais cette ligne ne dit souvent pas
*ce qui a changé* (C-06), et le journal n'est pas consultable au-delà de 500 entrées (C-24). Une
piste d'audit qui énumère des noms de champs sans leurs valeurs ne permet pas de répondre à la
question que pose toujours un contrôle interne : « qui a donné ce droit, et quand ? ».

### Les trois chantiers que je traiterais en premier

1. **Verrouiller la configuration et les invariants en base** (C-01, C-16). Une demi-journée.
   Refuser le démarrage en production sans `JWT_SECRET` explicite, et poser
   `UNIQUE INDEX ON users (lower(email))`. Ce sont les deux corrections au meilleur rapport
   risque écarté / effort de tout le rapport.
2. **Rendre le référentiel MCC réellement résilient** (C-12, C-13, C-17, C-15, C-03). Deux à trois
   jours. Filet sur `rechargerCatalogue`, reconnexion de l'écoute avec rechargement au retour,
   repli défensif, réactivation à l'import, et lectures d'historique qui ne dépendent plus du
   catalogue vivant. C'est le composant dont une défaillance est à la fois la plus probable et la
   moins visible.
3. **Fermer la dernière fenêtre de concurrence et compléter la piste d'audit** (C-02, C-05, C-06).
   Deux jours. Porter la garde de statut dans l'`UPDATE` de `updateRequest` avec le test de
   concurrence qui manque à côté des trois autres, tracer le changement de mot de passe, et
   journaliser `{ avant, apres }` sur les modifications de compte.

Les autres constats sont de la dette ordinaire : à traiter au fil de l'eau, sans urgence — à
l'exception de C-04 et C-09, qui coûtent surtout du temps de diagnostic le jour d'un incident.
