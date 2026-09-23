# Revue de code — nouveau modèle d'habilitation (D-3)

**Objet.** Commit `3c03b25` « Faire du banquier l'administrateur de sa banque ».
**Référence.** `docs/decisions-commanditaire.md`, section D-3.
**Portée.** `server/src/services/admin.js`, `server/src/routes/admin.js`,
`server/src/routes/requests.js`, `web/src/auth/AuthContext.jsx`, `web/src/App.jsx`,
`web/src/pages/AdminLayout.jsx`, `web/src/pages/AdminUsersPage.jsx`,
`server/tests/habilitations.test.js` (18 cas), et deux tests réécrits
(`requests.test.js`, `robustesse.test.js`).

**Méthode.** Lecture route par route, puis exécution. Base dédiée `revue_hab`
(migrée et amorcée à partir du dépôt), suite complète rejouée, puis campagne de
mutation : chaque garde est retirée une à une dans une copie de travail isolée,
la suite est rejouée, la garde est remise. Aucun fichier du projet n'a été
modifié ; les mutations ont été appliquées à une copie hors du dépôt.

**État de départ vérifié.** Suite complète : **165 tests, 165 verts**, dont les
18 cas de `habilitations.test.js`. Le chiffre annoncé au commit est exact.

---

## 1. Synthèse

Le dispositif serveur **tient**. Aucune route d'administration des comptes,
des banques, du journal ou des dossiers n'échappe à un contrôle : le tableau du
§2 le montre ligne à ligne, et la campagne de mutation du §5 confirme que chaque
garde est bien la garde qui refuse (17 mutants sur 19 tués). Les quatre bornes de
D-3 sont posées, et les deux barrières — banque et rôle — sont bien toutes deux
appliquées sur les chemins d'écriture.

Trois réserves.

1. **La borne « le journal est filtré sur sa banque » n'est pas tenue** : le
   filtre porte sur l'auteur de l'action et non sur ce qu'elle touche. Fuite
   inter-banques prouvée par exécution, dans la configuration livrée
   (`RH-01`). Aucun test ne couvre ce filtre.
2. **L'interface ne livre pas le droit principal de la décision.** Le banquier
   peut créer un dossier mais ne peut ni le modifier ni le soumettre depuis
   l'écran : le bouton reste conditionné à `isAgent` (`RH-02`). Le serveur, lui,
   l'autorise, et un test le prouve. Le dossier créé par un banquier reste au
   brouillon sans issue.
3. **Le référentiel MCC n'est gardé qu'en un seul point**, la route. Les comptes
   et les banques, eux, sont gardés deux fois (routeur + service) : la mutation
   `M15` le démontre. Une route MCC ajoutée sans le marqueur serait ouverte au
   banquier sans que rien ne la rattrape (`RH-04`).

Rien de ce qui précède n'ouvre un chemin d'écriture hors périmètre. La fuite
`RH-01` est en lecture ; `RH-02` et `RH-03` sont des défauts d'interface.

**Constats : 1 bloquant, 4 majeurs, 6 mineurs.**

---

## 2. Où chaque route est contrôlée

Garde de routeur commune à `/api/admin` : `authenticate` +
`requireRole('ADMIN','BANQUIER')` (`routes/admin.js:58`). `reserveAAdministrateur`
(`:67`) vaut `requireRole('ADMIN')`. La colonne « périmètre » dit si la route se
ramène à `perimetreAdministration()` (`services/admin.js:31`), le point unique
annoncé par le commit.

### `routes/admin.js`

| Route | Garde de routeur | Garde de service | Périmètre | Verdict |
| --- | --- | --- | --- | --- |
| `GET /users` | ADMIN + BANQUIER | `listUsers` : `perimetreAdministration`, filtre `u.bank_id` (`admin.js:96-100`) | oui | contrôlée — mais barrière rôle absente, voir `RH-05` |
| `GET /users/:id` | idem | `getUserAdministrable` → `assertCibleAutorisee` (`:59-63`) | oui (banque **et** rôle) | contrôlée |
| `POST /users` | idem | `createUser` : banque écrasée, rôle contrôlé (`:177-183`) | oui | contrôlée |
| `PUT /users/:id` | idem | `updateUser` : `assertCibleAutorisee` + non-sortie de périmètre (`:224-233`) | oui | contrôlée |
| `POST /users/:id/password` | idem | `resetPassword` : `assertCibleAutorisee` (`:325`) | oui | contrôlée |
| `GET /banks` | idem | `listBanks(req.user)` : filtre `b.id` (`:394-400`) | oui | contrôlée |
| `POST /banks` | + `reserveAAdministrateur` (`routes/admin.js:119`) | **aucune** — `createBank` ne contrôle rien | non | contrôlée à la route seule |
| `PUT /banks/:id` | ADMIN + BANQUIER | `updateBank` : `id == ma banque`, `active` interdit (`:431-437`) | oui | contrôlée |
| `GET /mcc` | + `reserveAAdministrateur` (`:137`) | aucune | non | route seule |
| `GET /mcc/export` | + `reserveAAdministrateur` (`:156`) | aucune | non | route seule — garde **avant** la génération du fichier, bien vu |
| `GET /mcc/:code` | + `reserveAAdministrateur` (`:177`) | aucune | non | route seule |
| `GET /mcc/:code/history` | + `reserveAAdministrateur` (`:185`) | aucune | non | route seule |
| `POST /mcc` | + `reserveAAdministrateur` (`:191`) | aucune | non | route seule |
| `PUT /mcc/:code` | + `reserveAAdministrateur` (`:200`) | aucune | non | route seule |
| `POST /mcc/import-fichier` | + `reserveAAdministrateur` (`:214`) | aucune | non | route seule — garde **avant** `multer`, bien vu |
| `POST /mcc/import` | + `reserveAAdministrateur` (`:249`) | aucune | non | route seule |
| `GET /events` | ADMIN + BANQUIER | `listAdminEvents` : `perimetreAdministration` + filtre (`:525-529`) | oui | **filtre mal posé — `RH-01`** |

Les huit routes `/mcc` et `POST /banks` sont les seules à ne pas se ramener au
périmètre ; c'est cohérent avec le tableau de mise en œuvre de D-3, qui les
annonce gardées par `reserveAAdministrateur`. Aucune route n'a été oubliée : les
dix-sept déclarations du fichier sont couvertes, et les huit `reserveAAdministrateur`
correspondent exactement aux huit routes communes à toutes les banques.

### `routes/requests.js`

Garde de routeur : `authenticate` seul (`:23`), doublé par `app.use(authenticate,
requirePasswordChanged)` en amont (`app.js:112`).

| Route | `requireRole` | Contrôle de périmètre | Verdict |
| --- | --- | --- | --- |
| `GET /` | — | `listRequests` : `r.bank_id = $user.bankId` sauf ADMIN (`requests.js:200-203`) | contrôlée |
| `GET /stats` | — | `getStats` : même filtre (`:434-437`) | contrôlée |
| `POST /` | `AGENT, BANQUIER` | `createRequest` impose `bank_id = user.bankId` (`:116`) — le corps ne porte pas de banque | contrôlée |
| `GET /:id` | — | `getRequest` : refus si banque différente (`:190-192`) | contrôlée |
| `PUT /:id` | `AGENT, BANQUIER` | `getRequest` (banque) puis `assertEditable` (statut, et agent ≠ auteur `:180`) | contrôlée |
| `POST /:id/submit` | `AGENT, BANQUIER` | idem | contrôlée |
| `POST /:id/decision` | `BANQUIER` | `getRequest` puis statut `SOUMISE` | contrôlée |
| `GET /:id/suggestions` | — | `getRequest` en tête (`:368`) | contrôlée |
| `GET /:id/events` | — | `getRequest` en tête (`:410`) | contrôlée |

Les trois routes sans `requireRole` (`GET /:id`, `/suggestions`, `/events`)
passent toutes par `getRequest`, qui porte le cloisonnement inter-banques. La
mutation `M17` (retrait de ce contrôle) est tuée : il est bien la seule et
véritable barrière de ces trois routes.

**Conclusion sur la question 1 : aucune route oubliée, ni en lecture ni en
écriture.** Le dispositif est exhaustif. Ce qui pèche est ailleurs : la
*définition* d'un filtre (`RH-01`) et le nombre de couches sur le MCC (`RH-04`).

---

## 3. Constats

### Bloquant

#### RH-02 — l'interface ne donne pas au banquier le droit de gérer les dossiers

**Gravité : bloquant.**
**Fichiers :** `web/src/pages/RequestDetailPage.jsx:91-94`,
`web/src/auth/AuthContext.jsx:79`, `web/src/pages/DashboardPage.jsx:24,56,61,122`.

**Constaté.** `AuthContext.jsx:79` définit
`isAgent: user?.role === 'AGENT' || user?.role === 'ADMIN'` — **faux pour un
banquier**, et le commit n'y a pas touché. Or `RequestDetailPage.jsx:91` écrit :

```js
const modifiable =
  isAgent && ['BROUILLON', 'COMPLEMENT_REQUIS'].includes(demande.status) &&
  (demande.createdBy === user.id || user.role === 'ADMIN');
```

et `modifiable` commande **les deux** boutons « Modifier » et « Soumettre au
banquier » (`:131-140`). Pour un banquier, `modifiable` vaut toujours `false`.
Dans `DashboardPage.jsx`, le bouton « + Nouvelle demande » (`:61`) et le lien
« Saisir une première demande » (`:122`) sont eux aussi derrière `isAgent`, le
filtre par défaut reste `SOUMISE` (`:24`) et le sous-titre annonce encore
« Arbitrage des MCC proposés par les agents » (`:56`).

**Scénario qui casse.** Karim, banquier de BQ001, clique « Nouvelle demande »
dans l'en-tête — ce lien-là, lui, a été ouvert (`App.jsx:57`, `peutSaisir`). Il
saisit un dossier, l'enregistre : le serveur accepte, le dossier existe au statut
`BROUILLON`. Il rouvre la fiche : ni « Modifier », ni « Soumettre au banquier ».
Le dossier qu'il vient de créer est **définitivement figé au brouillon depuis
l'interface**, et il ne peut pas davantage reprendre le dossier d'un de ses
agents — le droit n°2 de D-3, le plus important des quatre. Il n'a pas non plus
le bouton de saisie sur son tableau de bord, alors que le lien d'en-tête l'invite
à saisir : deux points d'entrée, un seul mis à jour.

**Preuve.** Côté serveur, les trois opérations passent : le cas
`habilitations.test.js:84` (« le banquier saisit, soumet puis arbitre un dossier
de sa banque ») est vert, et `:95` (« le banquier reprend le dossier d'un agent »)
aussi. L'écart est donc bien entre l'API et l'écran. La vérification annoncée en
D-3 (« il accède au formulaire de saisie ») s'est arrêtée au formulaire de
création et n'a pas suivi le dossier jusqu'à la soumission.

**Correction proposée.** Remplacer `isAgent` par un droit nommé pour ce qu'il
permet, sur le modèle de `peutAdministrer` :

```js
// Le banquier gère les dossiers de sa banque (D-3 §2) ; l'agent, les siens.
peutGererLeDossier: (demande) =>
  user?.role !== 'AGENT' || demande.createdBy === user.id,
```

et l'utiliser dans `modifiable`, sur le bouton du tableau de bord et sur le lien
de saisie. Aligner au passage le filtre par défaut et le sous-titre du tableau de
bord, qui décrivent encore le modèle d'avant.

### Majeur

#### RH-01 — le journal est filtré sur l'auteur, pas sur ce que l'action touche

**Gravité : majeur.** **Fichier :** `server/src/services/admin.js:522-529`.

**Constaté.**

```js
if (perimetre.banqueImposee !== null) {
  values.push(perimetre.banqueImposee);
  conditions.push(`e.user_id IN (SELECT id FROM users WHERE bank_id = $${values.length})`);
}
```

Le filtre retient les lignes **écrites par** un compte de la banque, au lieu de
celles **qui portent sur** la banque. Le commentaire au-dessus annonce pourtant
l'inverse : « Pas celles des autres banques, ni celles de l'administrateur sur le
référentiel commun ». Le code fait exactement ce que le commentaire exclut, parce
que `users.bank_id` est `NOT NULL` : **un administrateur est toujours rattaché à
une banque**, et le jeu livré rattache `admin@clicktopay.tn` à `BQ001`
(`server/src/db/seed.js:23`), c'est-à-dire à la banque du banquier de
démonstration.

**Scénario qui casse — prouvé par exécution.** Sur la base `revue_hab`, amorcée
telle que livrée :

1. l'administrateur crée un compte agent dans **BQ002** ;
2. l'administrateur modifie un code du référentiel commun ;
3. Karim, banquier de **BQ001**, ouvre `GET /api/admin/events`.

Il reçoit les deux lignes :

```
MCC  MODIFICATION par Admin ClickToPay :: {"champs":["note"],"comment":null}
USER CREATION     par Admin ClickToPay :: {"role":"AGENT","email":"cible.bq2@x.tn",
                                           "bankId":2,"bankCode":"BQ002"}
```

L'adresse professionnelle d'un agent d'une banque concurrente, son rôle et le
code de sa banque sortent du cloisonnement. La borne D-3 « Un banquier ne voit
pas les actions faites sur les autres banques » n'est pas tenue.

**Le défaut symétrique est prouvé aussi.** En rattachant l'administrateur à
BQ002 puis en lui faisant créer un compte **dans BQ001**, cette création
n'apparaît **pas** dans le journal de Karim. La piste d'audit de sa propre banque
est donc incomplète : les actions de la plateforme sur son personnel lui sont
invisibles. Les deux sens sont faux.

**Aucun test ne le couvre** — voir `RH-09` et la mutation `M10`.

**Correction proposée.** Filtrer sur la cible et non sur l'auteur. Le journal
porte déjà `entity` et `entity_id` ; il suffit de rattacher la ligne à une banque
à l'écriture (une colonne `bank_id` dans `admin_events`, renseignée par
`journaliser`), ou, sans migration, de conserver le filtre sur l'auteur **et** d'y
ajouter la condition de cible :

```sql
(   e.entity = 'USER' AND e.entity_id::int IN (SELECT id FROM users WHERE bank_id = $1)
 OR e.entity = 'BANK' AND e.entity_id::int = $1 )
```

en excluant explicitement `e.entity = 'MCC'`, qui ne relève d'aucune banque. La
colonne dédiée est préférable : `entity_id` est stocké en `text` et un compte
supprimé rend la jointure muette.

#### RH-03 — l'écran « Banques » n'a pas suivi le découpage

**Gravité : majeur.** **Fichier :** `web/src/pages/AdminBanksPage.jsx` (entier ;
le fichier n'importe pas `useAuth` et ne connaît aucun rôle).

**Constaté.** L'onglet « Banques » est laissé au banquier — c'est voulu, il
consulte et corrige la fiche de la sienne (D-3). Mais la page lui propose aussi
le bouton « + Nouvelle banque » (`:70-73`) et, sur sa propre ligne, le bouton
« Désactiver » (`:136-139`). Le serveur refuse les deux : `POST /banks` porte
`reserveAAdministrateur`, et `updateBank` refuse tout `payload.active` venant d'un
banquier. L'écran promet donc deux actions qui finissent en 403.

**Scénario qui casse.** Karim ouvre « Banques », clique « + Nouvelle banque »,
saisit un code et une raison sociale, valide : bandeau rouge « Action réservée aux
profils : ADMIN ». Rien n'indiquait que l'action lui était fermée. Même chose sur
« Désactiver ».

**Pourquoi c'est un majeur.** Le commit pose lui-même la règle pour le MCC
(« l'interface suit le même découpage », « le référentiel atteint par l'URL
renvoie aux comptes plutôt que de compter sur un onglet masqué ») et l'applique
avec soin sur trois niveaux. Le même soin n'a pas été porté à la page Banques,
qui est pourtant, elle, **laissée visible** au banquier : c'est le seul écran
d'administration qu'il voit et qui n'a pas été relu.

**Correction proposée.** `const { isAdmin } = useAuth();` puis masquer
« + Nouvelle banque » et le bouton d'activation hors administrateur. Le serveur
ne bouge pas : il refuse déjà.

#### RH-04 — le référentiel MCC ne tient que sur une seule couche

**Gravité : majeur.** **Fichiers :** `server/src/routes/admin.js:67,137-252`,
`server/src/services/mccAdmin.js` (aucun contrôle de rôle sur `createMcc:110`,
`updateMcc:149`, `getMccHistory:193`, `importCatalog:292`).

**Constaté et prouvé par mutation.** Deux mutations symétriques :

- `M13` — neutraliser `reserveAAdministrateur`
  (`const reserveAAdministrateur = (req, res, next) => next();`) : **deux tests
  rougissent**, le banquier modifie le référentiel commun. Rien en aval ne le
  rattrape, parce que `services/mccAdmin.js` ne consulte jamais le rôle de
  l'appelant.
- `M15` — retirer `requireRole('ADMIN','BANQUIER')` du routeur entier :
  **la suite complète reste verte, 165/165**. Les services des comptes, des
  banques et du journal appellent tous `perimetreAdministration()`, qui lève un
  403 pour un agent. La garde de routeur y est une seconde couche.

Le MCC est donc la seule ressource protégée par une couche unique, alors même que
c'est la ressource **partagée** — celle dont D-3 dit qu'un banquier qui y
toucherait « le retirerait à ses concurrents ».

**Scénario qui casse.** Une neuvième route MCC est ajoutée au fil d'une évolution
(`GET /mcc/statistiques`, `POST /mcc/:code/desactiver`…). Le marqueur
`reserveAAdministrateur` est un ajout manuel, facile à oublier — il est déjà
répété huit fois. La route atterrit sous `adminRouter`, dont la garde admet le
banquier, et aucun service ne refuse. Le commit dit avoir voulu écarter
précisément ce risque (« la règle recopiée dans chaque route finirait oubliée dans
l'une d'elles ») ; il l'a écarté pour les comptes et le laisse entier pour le MCC.

**Correction proposée.** Au choix, et de préférence les deux :

1. porter le contrôle dans le service, comme pour les comptes —
   `assertReferentielAdministrable(user)` en tête de `createMcc`, `updateMcc`,
   `importCatalog`, `getMccHistory` ;
2. monter les routes MCC sur un sous-routeur dédié, que la garde couvre par
   construction plutôt que par répétition :
   ```js
   const referentielRouter = Router();
   referentielRouter.use(reserveAAdministrateur);
   adminRouter.use('/mcc', referentielRouter);
   ```
   Les huit `reserveAAdministrateur` disparaissent et l'oubli devient impossible.

#### RH-05 — la barrière banque sans la barrière rôle, en lecture de liste

**Gravité : majeur.** **Fichiers :** `server/src/services/admin.js:92-100`
(`listUsers`) contre `:48-63` (`assertCibleAutorisee` / `getUserAdministrable`) ;
`web/src/pages/AdminUsersPage.jsx:245-259`.

**Constaté.** C'est la réponse à la question posée sur la cohérence des deux
barrières : **`listUsers` est le seul chemin où l'une est appliquée sans
l'autre.** Le filtre `u.bank_id` est posé, le filtre de rôle ne l'est pas. Le
commentaire l'assume (« savoir qu'un collègue banquier existe est utile »), mais
les conséquences n'ont pas été tirées.

**Scénario qui casse — prouvé par exécution.** `GET /api/admin/users?role=ADMIN`
avec le jeton du banquier renvoie :

```
admin@clicktopay.tn (dernière connexion 2026-09-23T07:41:00.910Z)
```

La fiche complète est servie par `versUtilisateur` : adresse, nom, état
d'activation, indicateur « mot de passe à changer », horodatage de dernière
connexion. Et `AdminUsersPage` affiche sur cette ligne trois boutons —
« Modifier », « Mot de passe », « Désactiver » — dont **aucun** n'aboutit : la
barrière rôle de `assertCibleAutorisee` les refuse tous les trois en 403. Le
banquier voit un compte qu'il ne peut pas ouvrir : `GET /admin/users/:id` sur
cette même ligne répond 403 alors que la liste, elle, l'a montré.

Pour mémoire, le filtre `?bankId=2` est bien neutralisé pour un banquier
(vérifié : seules les lignes de la banque 1 remontent). Le contournement évident
est fermé.

**Correction proposée.** Trancher dans un sens ou dans l'autre :
- soit filtrer la liste sur `perimetre.rolesAutorises` et rester cohérent avec
  `getUserAdministrable` ;
- soit conserver la visibilité — elle a du sens — mais renvoyer une fiche réduite
  (nom, rôle) pour les comptes hors périmètre et masquer les trois boutons à
  l'écran, par exemple `const administrable = isAdmin || u.role === 'AGENT';`.

### Mineur

#### RH-06 — un banquier peut énumérer les identifiants de comptes de la plateforme

**Gravité : mineur.** **Fichiers :** `server/src/services/admin.js:59-63`
(`getUserAdministrable`), `:219` (`updateUser`), `:325` (`resetPassword`).

**Constaté.** Les trois fonctions chargent le compte par `getUser(id)` — qui lève
un 404 — **avant** d'appeler `assertCibleAutorisee`, qui lève un 403. Les deux
réponses se distinguent.

**Scénario, prouvé par exécution.** Depuis le jeton du banquier :
`GET /api/admin/users/<identifiant d'une autre banque>` → **403** ;
`GET /api/admin/users/99999` → **404**. En balayant les identifiants, un banquier
relève exactement combien de comptes existent sur la plateforme et à quels
identifiants, alors que la liste ne lui en montre qu'une banque. Portée limitée —
il n'obtient aucune donnée — mais le cloisonnement doit aussi valoir pour
l'existence.

**Correction proposée.** Faire porter le périmètre par la requête elle-même,
comme pour les listes : `SELECT … WHERE u.id = $1 AND ($2::int IS NULL OR
u.bank_id = $2)`, et traiter l'absence de ligne en 404 dans les deux cas. À
défaut, intervertir simplement l'ordre n'est pas possible (il faut lire le compte
pour connaître sa banque) : c'est bien la requête qu'il faut resserrer.

#### RH-07 — `bankId` reste obligatoire au schéma alors que le serveur l'écrase

**Gravité : mineur.** **Fichiers :** `server/src/services/adminSchema.js:31`,
`server/src/services/admin.js:177-183`, `web/src/pages/AdminUsersPage.jsx:24,157-158`.

**Constaté.** `validate(createUserSchema)` s'exécute **avant** `createUser`. Le
schéma exige `bankId: entier({ min: 1 })`. Le service, lui, écrase la valeur pour
un banquier. Un client qui, raisonnablement, omet un champ que le serveur décide
lui-même reçoit un 400.

**Prouvé par exécution**, avec le jeton du banquier :

```
POST /admin/users sans bankId      -> 400 {"champ":"bankId","message":"Nombre entier attendu"}
POST /admin/users avec bankId ""   -> 400 {"champ":"bankId","message":"Valeur minimale : 1"}
```

**Et le cas du champ vide, demandé à la revue.** `AdminUsersPage:24` écrit
`bankId: isAdmin ? '' : String(user.bankId ?? '')`. Le repli `?? ''` ne protège de
rien et nuit : si `user.bankId` manquait, le `<select>` serait à la fois **vide et
désactivé** (`:158`, `disabled={!isAdmin && banques.length === 1}`) ; or un champ
désactivé est exclu de la validation HTML `required`, donc le formulaire partirait
quand même, avec `Number('')` c'est-à-dire `0` (`:66`), et reviendrait en 400 sur
un champ que l'utilisateur ne peut pas corriger — impasse à l'écran. Le cas ne se
produit pas aujourd'hui (`users.bank_id INTEGER NOT NULL`, `db/schema.sql:17`, et
`authenticate` joint `banks`), mais le repli donne l'illusion d'un garde-fou là où
il crée une impasse.

**Correction proposée.** Rendre `bankId` optionnel au schéma de création et le
déduire du périmètre côté service (l'administrateur, lui, doit toujours le
fournir : `.refine()` suffit à l'exiger pour ce seul cas). Et supprimer le
`?? ''` : si la banque de l'appelant manque, mieux vaut refuser d'ouvrir le
formulaire que de l'ouvrir dans un état non soumissible.

#### RH-08 — `listBanks()` sans `user` : non exploitable aujourd'hui, mais rien ne le garantit demain

**Gravité : mineur.** **Fichier :** `server/src/services/admin.js:391` (signature),
`:423` et `:480` (les deux appels internes).

**Réponse à la question posée : non, ce n'est pas exploitable.** Les deux seuls
appelants ont été vérifiés :

- `createBank:423` — la route `POST /banks` porte `reserveAAdministrateur`, seul
  un administrateur y parvient, à qui toutes les banques sont dues de toute façon ;
- `updateBank:480` — le résultat n'est pas rendu tel quel : `banques.find((b) =>
  b.id === Number(id))` n'en garde **qu'un seul objet**, et `updateBank` a déjà
  refusé, dix lignes plus haut (`:433`), tout `id` différent de la banque de
  l'appelant. Le banquier ne peut donc recevoir que sa propre fiche. Vérifié à
  l'exécution : `PUT /api/admin/banks/1` par le banquier répond 200 avec sa seule
  banque.

**Ce qui reste.** La valeur par défaut `user = null` fait du « tout voir » le
comportement **implicite**. Un futur appelant qui oublie l'argument — une route de
recherche, un export, une relecture après écriture — rendra toutes les banques
sans qu'aucun test ne bronche, et la relecture ne verra rien puisque l'appel est
syntaxiquement correct. Par ailleurs, les deux relectures chargent la table
entière, avec deux sous-requêtes de comptage par ligne, pour n'en garder qu'une.

**Correction proposée.** Rendre l'intention explicite plutôt que par défaut :
`listBanks({ user })` d'un côté, `toutesLesBanques()` de l'autre, ou plus
simplement remplacer les deux relectures par une lecture ciblée de la banque qui
vient d'être écrite — c'est la seule dont on a besoin.

#### RH-09 — qualité des tests : un filtre non couvert, trois routes non éprouvées, deux oracles faibles

**Gravité : mineur.** **Fichier :** `server/tests/habilitations.test.js`.

Le détail de la campagne de mutation est au §5. Ce qui en ressort :

1. **Le filtre du journal n'est couvert par aucun test de la suite.** La mutation
   `M10` (retrait du filtre de `listAdminEvents`) laisse **165 tests sur 165
   verts**. Le cas prévu pour cela, `:103` « le banquier consulte le journal de sa
   banque », n'assert que `assert.ok(Array.isArray(res.body.items))` : il passerait
   sur n'importe quel journal, y compris celui de toute la plateforme. C'est le
   seul des dix-huit cas qui ne prouve rien.
2. **Trois routes MCC sur huit ne sont pas éprouvées** pour le refus :
   `POST /mcc`, `GET /mcc/:code/history` et `POST /mcc/import-fichier`. Vérifié à
   la main : elles refusent bien le banquier (403 pour les trois). Le risque n'est
   pas aujourd'hui, il est à la prochaine évolution — et `import-fichier` est
   justement la route que l'écran d'import utilise.
3. **Oracle ambigu**, `:150` « le banquier ne modifie pas un compte banquier ou
   administrateur de sa banque » : la cible est choisie par
   `items.find((u) => u.bankId === 1 && u.role !== 'AGENT')`, qui peut tomber sur
   **le compte du banquier lui-même**. Le test passerait alors pour une tout autre
   raison (on ne s'auto-administre pas). Il faut exclure `u.id` de l'appelant, ou
   mieux, viser explicitement le compte administrateur.

**Corrections proposées.** Ajouter trois cas : (a) le journal d'un banquier ne
contient aucune ligne dont l'entité est `MCC` ni aucune ligne portant sur une
autre banque — après avoir fait agir l'administrateur sur BQ002 ; (b) les trois
routes MCC manquantes, à la suite du cas `:158` ; (c) resserrer la cible du cas
`:150`.

#### RH-10 — tenue du code

**Gravité : mineur.**

- `services/admin.js:481` — `banques.find((b) => b.id === Number(id))` alors que
  `id` est déjà un entier (`idDeRoute`, `middleware/errors.js:36-42`, renvoie
  `Number(valeur)` validé). Ce `Number()` résiduel laisse croire que la
  comparaison stricte de la ligne 433 — `id !== perimetre.banqueImposee`, dont
  dépend toute la barrière banque de `updateBank` — pourrait porter sur une
  chaîne. Elle ne le peut pas ; mais le lecteur, lui, doit aller le vérifier.
- **Trois copies de la même énumération de rôles** : `services/admin.js:20`
  (`ROLES`), `services/adminSchema.js:24` (`ROLES`, exporté), et une liste en dur
  `['AGENT', 'BANQUIER', 'ADMIN']` dans `listUsers` (`admin.js:113`), soit deux
  copies dans le même fichier. Une seule source, importée.
- `routes/admin.js:58` rappelle `authenticate` alors que `app.js:112` l'a déjà
  posé pour tout ce qui suit : chaque appel d'administration relit deux fois le
  compte en base. Antérieur au commit, mais la ligne a été touchée.
- `AuthContext.jsx:85` — `peutSaisir: Boolean(user)` nomme un droit et n'exprime
  qu'« un utilisateur est connecté ». Un quatrième profil, même en lecture seule,
  hériterait silencieusement du lien de saisie. `peutAdministrer`, juste en
  dessous, est écrit correctement, par énumération des rôles : suivre le même
  modèle.
- `AuthContext.jsx:79-80` — `isAgent` et `isBanquier` conservent leur sémantique
  d'avant (« ou ADMIN ») alors que le découpage a changé sous eux. C'est
  `isAgent` qui produit `RH-02`. Les laisser en place en ajoutant de nouveaux
  drapeaux à côté est ce qui a permis à l'écart de passer inaperçu.

#### RH-11 — ce que `requireRole` fait vraiment : pas de trou, mais une règle qui ne sait pas s'exprimer

**Gravité : mineur.** **Fichier :** `server/src/middleware/auth.js:76-81`.

**Constaté.** `requireRole` autorise `ADMIN` systématiquement, en plus des rôles
listés. Les neuf usages ont été repris un par un :

| Usage | Conséquence de la clause implicite | Verdict |
| --- | --- | --- |
| `admin.js:58` `('ADMIN','BANQUIER')` | ADMIN déjà listé | sans effet |
| `admin.js:67` `('ADMIN')` | ADMIN déjà listé | sans effet |
| `requests.js:49,64,74` `('AGENT','BANQUIER')` | l'administrateur saisit, modifie et soumet | voulu (D-1) |
| `requests.js:83` `('BANQUIER')` | l'administrateur arbitre | voulu (D-1) |

**Aucun trou aujourd'hui**, y compris depuis que les routes ne sont plus toutes
réservées au même profil : `reserveAAdministrateur` n'est pas affaibli par la
clause, puisqu'elle ne fait qu'autoriser un rôle déjà nommé.

**Ce qui reste.** Le middleware ne sait pas exprimer « tous sauf
l'administrateur ». C'est exactement la variante que D-3 laisse ouverte à la fin
de sa section (« le banquier ne peut pas arbitrer un dossier qu'il a lui-même
saisi ») : si le commanditaire la demande, la règle ne pourra pas s'écrire avec
`requireRole`, et le risque est qu'on l'écrive alors à la main dans la route, ce
que le commit a justement cherché à éviter. Par ailleurs `requireRole('BANQUIER')`
se lit « réservé au banquier » et signifie « banquier ou administrateur » : la
signature ment au lecteur pressé. Proposition : rendre la clause explicite,
`requireRole({ roles: ['BANQUIER'], admin: true })`, ou au minimum le dire dans le
nom.

---

## 4. L'appel interne de `listBanks()` — réponse détaillée

La question posée est : `listBanks()` accepte d'être appelée sans `user` et rend
alors toutes les banques ; est-ce exploitable ?

**Non.** Les appelants ont été recensés par recherche exhaustive sur l'ensemble du
dépôt (serveur, tests, front) :

| Appelant | Argument `user` | Ce qui sort | Exposé à un banquier ? |
| --- | --- | --- | --- |
| `routes/admin.js:115` (`GET /banks`) | `req.user` | liste filtrée | non |
| `services/admin.js:423` (`createBank`) | absent | une seule banque (`find`) | non — route `ADMIN` seule |
| `services/admin.js:480` (`updateBank`) | absent | une seule banque (`find`) | non — `:433` a déjà refusé toute autre banque |
| `web/src/api/client.js:82` | — | appelle la route, pas la fonction | sans objet |

Le seul chemin par lequel un banquier atteint `listBanks()` sans `user` est
`updateBank`, et il n'en reçoit que sa propre fiche. Le test `:170` le confirme du
côté route (`items.length === 1`). Le risque est de conception, non
d'exploitation : voir `RH-08`.

---

## 5. Campagne de mutation

Protocole : copie du serveur hors du dépôt, une garde retirée à la fois, suite
rejouée sur la base `revue_hab`, garde remise. « Tué » = au moins un test
rougit ; « survivant » = suite verte sans la garde.

| # | Garde retirée | Fichier | Résultat | Cas qui l'attrapent |
| --- | --- | --- | --- | --- |
| M1 | `assertCibleAutorisee` neutralisée | `services/admin.js:48` | **tué** (2) | `:138`, `:150` |
| M2 | barrière **banque** seule | `services/admin.js:50-52` | **tué** (1) | `:138` |
| M3 | barrière **rôle** seule | `services/admin.js:53-55` | **tué** (1) | `:150` |
| M4 | `createUser` : la banque de l'appelant n'écrase plus | `services/admin.js:179` | **tué** (1) | `:55` |
| M5 | `createUser` : contrôle du rôle | `services/admin.js:180-182` | **tué** (1) | `:110` |
| M6 | `updateUser` : interdiction de promotion | `services/admin.js:227-229` | **tué** (2) | `:124`, `:131` |
| M7 | `updateUser` : interdiction de changement de banque | `services/admin.js:230-232` | **tué** (1) | `:131` |
| M8 | `listUsers` : filtre de banque | `services/admin.js:97-100` | **tué** (1) | `:35` |
| M9 | `listBanks` : filtre de banque | `services/admin.js:396-399` | **tué** (1) | `:170` |
| **M10** | **`listAdminEvents` : filtre de banque** | `services/admin.js:526-529` | **SURVIVANT** — 18/18 puis **165/165 verts** | aucun |
| M11 | `updateBank` : « seulement ma banque » | `services/admin.js:433` | **tué** (1) | `:170` |
| M12 | `updateBank` : interdiction d'(dés)activer | `services/admin.js:434-436` | **tué** (1) | `:180` |
| M13 | `reserveAAdministrateur` neutralisé | `routes/admin.js:67` | **tué** (2) | `:158`, `:170` |
| M14 | `reserveAAdministrateur` retiré de `POST /banks` | `routes/admin.js:119` | **tué** (1) | `:170` |
| **M15** | **`requireRole` du routeur `/api/admin`** | `routes/admin.js:58` | **SURVIVANT** — **165/165 verts** | aucun — *mutant équivalent*, voir ci-dessous |
| M16 | cloisonnement entre agents (`assertEditable`) | `services/requests.js:180-182` | **tué** (1) | `:206` |
| M17 | cloisonnement inter-banques (`getRequest`) | `services/requests.js:190-192` | **tué** (1) | `:187` |
| M18 | rôle lu dans le jeton au lieu de la base | `middleware/auth.js:69` | **tué** (1) | `robustesse.test.js` « un changement de rôle s'applique sans reconnexion » |
| M19 | `BANQUIER` retiré de `POST /requests` | `routes/requests.js:49` | **tué** (2) | `habilitations:84`, `requests.test.js` « un banquier saisit… » |

**17 mutants tués sur 19.** Les dix-huit cas ajoutés sont, à une exception près,
de vrais tests : chacun tombe quand et seulement quand la garde qu'il vise
disparaît, et les deux barrières de `assertCibleAutorisee` sont éprouvées
**séparément** (M2 et M3), ce qui est exactement ce qu'il fallait vérifier.

**Les deux survivants, et ce qu'ils disent.**

- **M10 est un vrai trou de couverture.** Le filtre du journal peut être
  supprimé sans qu'aucun des 165 tests ne s'en aperçoive. C'est précisément la
  garde qui, par ailleurs, est mal écrite (`RH-01`) : personne ne l'a regardée
  parce que rien ne la regardait.
- **M15 est un mutant équivalent, et c'est une bonne nouvelle.** Si la suite reste
  verte sans la garde de routeur, c'est que les services refusent d'eux-mêmes :
  `perimetreAdministration()` lève un 403 pour un agent dans `listUsers`,
  `createUser`, `updateUser`, `resetPassword`, `listBanks`, `updateBank` et
  `listAdminEvents`, et les routes MCC gardent `reserveAAdministrateur`. Les
  comptes sont donc protégés **deux fois**, et le cas `:200` (« l'agent
  n'administre rien ») reste vert parce qu'il reçoit toujours son 403, d'un cran
  plus bas. C'est la démonstration directe de ce que `RH-04` reproche au MCC :
  là où les comptes ont deux couches, le référentiel n'en a qu'une.

---

## 6. Les deux tests réécrits — la réécriture est-elle honnête ?

**« un banquier ne saisit pas de demande » → « un banquier saisit des demandes
dans sa banque (D-3) »** (`requests.test.js`).

**Honnête.** L'ancienne assertion est devenue fausse *par décision*, pas par
commodité : D-3 §2 lève explicitement la règle. Le nouveau cas n'est pas
complaisant — il vérifie le 201 **et** que le dossier reste rattaché à la banque
de l'appelant (`bankId === 1`). La mutation M19 le tue. Et les refus que portait
l'ancien cas n'ont pas disparu du dossier : ils sont repris, en plus large, par
`habilitations.test.js:187` (« le banquier ne voit ni ne touche un dossier d'une
autre banque », qui couvre `GET`, `PUT` et `submit`). **Pas de perte de
couverture.**

**« un changement de rôle s'applique sans reconnexion »** (`robustesse.test.js`).

**Honnête, et l'oracle est même plus solide.** L'observable a changé —
`POST /api/requests` ne départage plus les profils, c'est vrai — pour
`GET /api/admin/users`. Ce que le test prétend prouver est que `authenticate`
relit le rôle en base au lieu de le lire dans le jeton. Vérifié par mutation
`M18` : en remplaçant `role: utilisateur.role` par `role: charge.role`
(`middleware/auth.js:69`), le test **rougit**. Il prouve donc exactement ce qu'il
annonce. La version réécrite ajoute même une assertion de départ (403 *avant* la
promotion) que l'ancienne n'avait pas : l'aller-retour est désormais complet.

**Une nuance, pas une réserve.** L'observable est passé d'un chemin d'écriture
(`POST`) à un chemin de lecture gardé par un middleware. Plus aucun test ne
vérifie qu'un compte rétrogradé perd immédiatement un droit d'**écriture**. Le
mécanisme est commun — c'est `authenticate` qui alimente `req.user` dans les deux
cas, et M18 le confirme — donc la couverture réelle est la même. Mentionné pour
que ce soit un choix et non un oubli.

---

## 7. L'interface, sur trois niveaux

Le principe posé par le commit est le bon : « le masquage d'un onglet n'est pas un
contrôle ». Voici ce qu'il donne, écran par écran.

| Écran | Onglet masqué | Routeur | Serveur | Verdict |
| --- | --- | --- | --- | --- |
| **Référentiel MCC** | oui — `AdminLayout.jsx:15-16`, `administrateurSeul` | oui — `App.jsx:113`, `<Protege referentielSeul>` → redirige vers `/administration/comptes` | oui — `reserveAAdministrateur` sur les 8 routes `/mcc`. Vérifié à l'exécution : `GET /mcc`, `/mcc/:code`, `/mcc/:code/history`, `/mcc/export`, `POST /mcc`, `PUT /mcc/:code`, `POST /mcc/import`, `POST /mcc/import-fichier` → **403** pour un banquier | **les trois niveaux tiennent** |
| **Import du référentiel** | oui — même mécanisme | oui — `App.jsx:114` | oui — `POST /mcc/import-fichier` et `POST /mcc/import`, garde posée **avant** `multer` : le téléversement est refusé sans être mis en mémoire | **les trois niveaux tiennent** |
| **Banques** | non (voulu) | non (voulu) | oui — `POST /banks` réservé, `active` refusé | **`RH-03`** : les deux boutons interdits restent affichés |
| **Comptes** | non (voulu) | non (voulu) | oui — périmètre en service | `RH-05` : les actions sur les comptes non-agents restent affichées |
| **Journal** | non (voulu) | non (voulu) | oui, mais filtre mal posé | **`RH-01`** |
| **Saisie de dossier** | — | ouvert à tous (`App.jsx:104,106`) | `requireRole('AGENT','BANQUIER')` + périmètre | **`RH-02`** : l'écran ne donne pas au banquier ce que le serveur autorise |

Sur le MCC et l'import, le travail est complet et bien fait : la redirection
depuis l'URL est le bon réflexe, et le placement de la garde avant `multer` sur
l'import de fichier montre qu'on a regardé l'ordre des intergiciels. Le défaut
n'est pas dans ce qui a été traité, il est dans ce qui n'a pas été relu : les
écrans laissés visibles au banquier (`RH-03`, `RH-05`) et l'écran de dossier
(`RH-02`).

**Le champ « banque » du formulaire de création** (question posée) :
pré-rempli et figé pour le banquier, le serveur écrase de toute façon la valeur.
S'il est vide, ou si le compte n'avait pas de banque, le comportement est une
impasse — détail et preuve en `RH-07`. Le cas ne se produit pas avec le schéma
actuel (`bank_id NOT NULL`), mais le repli `?? ''` est trompeur.

---

## 8. Récapitulatif

| Réf. | Gravité | Objet | Établi par |
| --- | --- | --- | --- |
| `RH-02` | bloquant | Le banquier ne peut ni modifier ni soumettre un dossier depuis l'écran | lecture de code, chaîne complète ; l'API l'autorise (test vert) |
| `RH-01` | majeur | Journal filtré sur l'auteur, pas sur la cible — fuite inter-banques | **exécution** (deux sens) |
| `RH-03` | majeur | Écran « Banques » : deux actions proposées et refusées | lecture de code + refus serveur vérifié |
| `RH-04` | majeur | Le référentiel MCC ne tient que sur la garde de route | **mutation** M13 vs M15 |
| `RH-05` | majeur | `listUsers` : barrière banque sans barrière rôle | **exécution** |
| `RH-06` | mineur | Énumération des identifiants (403 vs 404) | **exécution** |
| `RH-07` | mineur | `bankId` exigé au schéma alors que le serveur l'écrase | **exécution** |
| `RH-08` | mineur | `listBanks()` sans `user` : sûr aujourd'hui, fragile demain | lecture exhaustive des appelants + exécution |
| `RH-09` | mineur | Un filtre non couvert, trois routes non éprouvées, deux oracles faibles | **mutation** M10 |
| `RH-10` | mineur | Tenue : `Number()` résiduel, trois copies de `ROLES`, `authenticate` en double, `peutSaisir` mal nommé | lecture de code |
| `RH-11` | mineur | `requireRole` admet toujours ADMIN : pas de trou, mais règle inexprimable | revue des 9 usages |

**Ce qui est prouvé** : `RH-01`, `RH-04`, `RH-05`, `RH-06`, `RH-07`, `RH-09`, et
la moitié serveur de `RH-02` — par exécution ou par mutation, sur base dédiée.
**Ce qui relève de la lecture de code** : `RH-02` côté interface (la chaîne
`isAgent` → `modifiable` → boutons est citée intégralement et ne comporte aucune
branche), `RH-03`, `RH-08` (raisonnement sur les appelants, appuyé sur une
vérification à l'exécution), `RH-10`, `RH-11`.
**Ce qui n'est qu'un soupçon** : rien. Aucun constat n'est laissé à l'état
d'hypothèse.

**Avis d'ensemble.** Le modèle d'habilitation est **solide côté serveur**. Le
choix de définir le périmètre en un seul endroit est le bon, il a été tenu sur
toutes les routes de comptes, et la double couche routeur/service — mise en
évidence par la mutation M15 — donne au dispositif une marge qu'il n'annonçait
même pas. Deux choses seulement manquent à l'appel : le filtre du journal, écrit
à côté de son propre commentaire et que rien ne testait, et l'interface, qui n'a
été relue que sur la moitié des écrans que le banquier voit désormais — au point
que le droit principal de la décision n'est pas atteignable à l'écran.

---

*Revue conduite sur une base dédiée (`revue_hab`), supprimée en fin d'intervention.
Aucun fichier du projet n'a été modifié : les mutations ont été appliquées à une
copie de travail hors du dépôt.*
