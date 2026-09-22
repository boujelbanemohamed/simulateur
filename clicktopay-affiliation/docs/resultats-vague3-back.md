# Recette vague 3 — retest des cas BACK (agent 6)

Instance dédiée : port **4012**, base **`clicktopay_recette_back2`**, `JWT_SECRET=recette-a6`,
`LOGIN_RATE_LIMIT_MAX=5000` (sauf cas de limitation de débit, joués sur une instance relancée
sans cette variable). Base à l'état de référence au démarrage de la campagne :
4 utilisateurs, 279 MCC, 0 demande, 27 secteurs.

Commande de démarrage :

```
cd server && DATABASE_URL=postgres://clicktopay:clicktopay@127.0.0.1:5432/clicktopay_recette_back2 \
  PORT=4012 JWT_SECRET=recette-a6 LOGIN_RATE_LIMIT_MAX=5000 node src/index.js &
```

Correctif sous test : commit `26f0145` « Correction des dix defauts releves par la recette fonctionnelle ».

Toutes les commandes ci-dessous supposent `B=http://127.0.0.1:4012` et les jetons
`TA` (agent@banque.tn), `TB` (banquier@banque.tn), `T2` (agent2@banque.tn), `TAD` (admin@clicktopay.tn)
obtenus par `POST /api/auth/login`.

Fichier écrit au fil de l'eau, cas par cas.

## Tableau de synthèse

| Défaut / cas | Statut | Commande de vérification | Résultat observé |
|---|---|---|---|
| DEF-A3-03 (D4, repli `5999`) | CORRIGÉ | `curl -s -X POST $B/api/mcc/suggest -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"activityDescription":"zzzz qqqq wwww xxxx yyyy kkkk jjjj hhhh gggg ffff"}'` | Le repli est désormais atteint : **1 seule** proposition `5999`, `score:10`, `rawScore:0`, `matchedTerms:["aucune correspondance : code de repli"]`, en VISA **et** MASTERCARD. Les six codes de vente à distance à 31 % de la vague 2 ont disparu. |
| DEF-A3-03 (critère « jamais de `matchedTerms` vide ») | NON CORRIGÉ → **DEF-A6-01** | `POST /api/mcc/suggest {"activityDescription":"Vente de meubles et de decoration d interieur","limit":20}` | `4214` sort `score:21`, `rawScore:6`, `matchedTerms:[]`. Sur 20 descriptifs variés (272 propositions), **10 propositions** ont encore `matchedTerms` vide (`5969`, `7311`, `4214`, `7221`, `5735`). Voir DEF-A6-01. |
| DEF-A3-05 (CAS-INDEX-03) | CORRIGÉ | `POST /api/admin/mcc/import {"entrees":[{"code":"9105","label":"Trottinettes électriques",…}],"apply":true}` puis `POST /api/mcc/suggest {"activityDescription":"Vente de trottinette electrique neuve et reconditionnee pour la ville","limit":10}` | `9105` remonte avec `matchedTerms:["trottinette","electrique"]` (vague 2 : liste **vide**). Le code remonté par une variante dérivée est désormais justifié. Réserve inchangée depuis la vague 2 : le rang passe de 1 (pluriel) à 5 (singulier), au-delà du « pluriel + 2 » du plan ; le critère d'acceptation (« proposé dans les deux formulations ») reste tenu. |
| DEF-A3-02 (CAS-AUTH-10) | CORRIGÉ | Script `auth10.py` : `login` banquier puis `POST /api/admin/users/2/password {"password":"Nouveau#2026x"}` **76 ms plus tard** (même seconde que `iat`), puis `GET /api/auth/me` avec le jeton antérieur | `iat=1790064038`, réinitialisation à `t=1790064038.277` → **même seconde**. Ancien jeton : **401** `{"error":"Mot de passe modifié : reconnectez-vous"}`. En base `must_change_password=t`. Le jeton porte `pwd` = `password_changed_at` au format ISO à la milliseconde (`"2026-09-21T15:50:31.996Z"`), comparé à l'identique : ni arrondi à la seconde, ni mélange d'horloges. `users.password_changed_at` est `NOT NULL DEFAULT now()`, l'empreinte nulle n'est donc pas atteignable. |
| DEF-A3-04 (bornes — CAS-MCC-13) | CORRIGÉ | `POST /api/mcc/suggest` avec `limit` = 21 / 0 / `"trois"` | `"Valeur maximale : 20"`, `"Valeur minimale : 1"`, `"Format attendu : nombre"` — plus aucun `Number must be less than or equal to 20`. |
| DEF-A3-04 (longueurs — CAS-ROB-13) | CORRIGÉ | Script `rob13.py` : 11 `POST /api/requests` dépassant d'un caractère chaque borne | 11 × 400, `details[].champ` correct, messages français (`"160 caractères au maximum"`, `"2000 caractères au maximum"`, `"3 caractères au maximum"`…). Bornes exactes → 201. |
| DEF-A3-04 (types / énumérations — CAS-ROB-15) | CORRIGÉ | 6 × `PUT /api/admin/mcc/5977` (`keywords` texte, `keywords:[1,2]`, `similar:["59"]`, `networks:[]`, `networks:["VISA","PAYPAL"]`, `sectors:["A"×50]`) | 6 × 400 ciblés et français : `"Format attendu : liste"`, `"Format attendu : texte"`, `"Format invalide"`, `"1 élément(s) au minimum"`, `"Valeur non autorisée (attendu : VISA, MASTERCARD)"`, `"40 caractères au maximum"`. Balayage complémentaire de 19 appels invalides sur 6 routes : **25 messages distincts, 0 message anglais**. Réserve mineure : `similar.0` renvoie `"Format invalide"` là où `POST /api/admin/mcc` sait dire `"Un MCC est composé de 4 chiffres"`. |
| D2 (CAS-IMPORT-11) | CORRIGÉ | `POST /api/admin/mcc/import {"entrees":[{"code":"5977","sector":"SANTE"}],"apply":false}` puis `apply:true`, puis `GET /api/admin/mcc/5977` | Le code est classé dans **`modifies`** avec `{"champ":"sectors","avant":["BEAUTE_COSMETIQUE"],"apres":["SANTE"]}` (vague 2 : `inchanges`, aucune écriture). Après application : `sectors = ["SANTE"]` et la ligne `mcc_sectors` suit. |
| D3 (CAS-IMPORT-12) | CORRIGÉ | `PUT /api/admin/mcc/5912 {"sectors":["SANTE","BEAUTE_COSMETIQUE"]}` → `GET /api/admin/mcc/export?format=csv` → modification du seul libellé → `POST /api/admin/mcc/import apply=true` → `GET /api/admin/mcc/5912` | La colonne `Secteur` de l'export vaut `"BEAUTE_COSMETIQUE, SANTE"` (les **deux** rattachements, vague 2 : `sectors[0]` seul). Après aller-retour, `sectors` vaut toujours `["BEAUTE_COSMETIQUE","SANTE"]` : plus de perte silencieuse. |
| Aller-retour export → import du référentiel **complet** | **RÉGRESSION → DEF-A6-02** | `curl -s "$B/api/admin/mcc/export?format=csv" -o export.csv` → `POST /api/admin/mcc/import-fichier -F fichier=@export.csv` → `POST /api/admin/mcc/import {"entrees":<entrees du rapport>,"apply":true}` | **400** `{"champ":"entrees.111.sector","message":"40 caractères au maximum"}` sur le code `5817` du référentiel d'amorçage, dont la colonne vaut `"CONTENUS_NUMERIQUES, INFORMATIQUE_LOGICIEL"` (42 caractères). Le cycle « télécharger → corriger → réimporter » est rompu **sur le référentiel livré**, sans aucune modification. Effet de bord direct du correctif D3. Voir DEF-A6-02. |
| C-01 (démarrage en production) | CORRIGÉ | `NODE_ENV=production DATABASE_URL=… PORT=4013 node src/index.js` (sans `JWT_SECRET`) | Refus de démarrage : `Error: Variable d'environnement obligatoire en production : JWT_SECRET. Le repli de développement ne doit jamais servir hors développement.` Idem sans `DATABASE_URL`. En développement, le repli s'applique toujours et l'API démarre. |
| C-01 (valeur de développement / longueur du secret) | NON CORRIGÉ → **DEF-A6-03** | `NODE_ENV=production JWT_SECRET=dev-secret-a-remplacer-en-production … node src/index.js` puis jeton ADMIN forgé avec ce secret sur `GET /api/auth/me` | L'API **démarre** et le jeton forgé est accepté : **200** avec `"role":"ADMIN"`. `JWT_SECRET=court` (5 caractères) démarre aussi. Les deux compléments explicitement demandés par la revue (refuser la valeur de développement fournie explicitement, imposer ≥ 32 caractères) ne sont pas implémentés. Voir DEF-A6-03. |
| C-12 (l'API ne se fige plus) | CORRIGÉ | `ALTER TABLE mcc_codes RENAME TO mcc_codes_bak;` + `NOTIFY mcc_catalogue_modifie;` → routes en 500 → `ALTER TABLE mcc_codes_bak RENAME TO mcc_codes;` | Pendant la panne : `GET /api/mcc` et `POST /api/auth/login` → 500, journal `Rechargement du référentiel MCC impossible : relation "mcc_codes" does not exist`. **Dès la table rétablie**, `GET /api/mcc?limit=1` repasse en **200 sans redémarrage** : la promesse rejetée n'est plus mémorisée, le chargement est retenté à chaque requête. |
| C-12 (`/api/health` en 503) | PARTIEL → **DEF-A6-04** | Pendant la panne ci-dessus : `curl -s -w " HTTP=%{http_code}" $B/api/health` | **200** `{"status":"ok","env":"development","referentiel":"charge"}` alors que **toutes** les routes métier répondent 500. Le 503 n'est rendu que par une instance qui n'a **jamais** chargé le référentiel (instance neuve, table absente : `{"status":"degraded",…,"referentiel":"indisponible"}` HTTP 503). Le répartiteur de charge continue donc d'envoyer du trafic à une instance morte — exactement le scénario décrit par C-12. Voir DEF-A6-04. |
| C-02 (garde de statut sur `PUT /api/requests/:id`) | CORRIGÉ | Script `c02.py` : 45 itérations « créer un BROUILLON, puis lancer **en parallèle** `PUT /api/requests/:id {"siteName":…}` et `POST /api/requests/:id/submit` », puis relecture du journal `request_events` | 4 conflits sur 45 : **409** `{"error":"Cette demande vient de changer de statut et n’est plus modifiable."}`. **Zéro** cas où le `PUT` répond 200 alors que la `MODIFICATION` est journalisée **après** la `SOUMISSION` : la garde est bien rejouée dans la transaction. Les 41 autres itérations donnent l'ordre légitime `CREATION, MODIFICATION, SOUMISSION`. |
| C-14 (rang de secteur écrasé) | CORRIGÉ | `PUT /api/admin/mcc/5977 {"note":"…","sectors":["BEAUTE_COSMETIQUE"]}` puis `select mcc_code,rank from mcc_sectors where sector_key='BEAUTE_COSMETIQUE' order by rank` | Rangs avant et après : `5977:0, 7230:1, 7298:2, 5912:3` — **inchangés**. Idem avec un `PUT` ne portant que `note` (sans `sectors`). Un rattachement réellement nouveau (`5995`) prend la fin de file (`rang 4`) et **y reste** au réenregistrement. La relégation systématique de la vague 2 n'est plus reproductible. Réserve : le rang ne suit toujours pas « l'ordre fourni » annoncé par le commentaire du code — un nouveau rattachement est toujours ajouté en queue, jamais à la position demandée. |
| CAS-MCC-01 / CAS-MCC-02 (non-régression) | CONFORME (avec écart **attendu**) | `POST /api/mcc/suggest {"activityDescription":"Vente en ligne de cosmetiques naturels, huiles essentielles et savons artisanaux fabriques en Tunisie","activitySector":"BEAUTE_COSMETIQUE","deliveryMode":"PHYSIQUE"}` | `5977:74, 7230:66, 7298:63, 5912:57, 5999:50` — **5 codes sur 6**, ordre et scores strictement identiques à la vague 2. Le 6ᵉ (`5960:31`, `matchedTerms` vide) a disparu : c'est l'effet voulu du correctif DEF-A3-03. `matchedTerms` non vide sur les 5, dont `secteur : Beauté, cosmétique et parfumerie`. Parité VISA/MASTERCARD : `JSON.stringify` égaux, objets distincts. **Le résultat attendu du plan (6 codes, `5960:31`) est désormais caduc et doit être mis à jour.** |
| CAS-MCC-03 (non-régression) | CONFORME (avec écart **attendu**) | Même appel sans puis avec `activitySector` | Sans secteur : `5977:54, 5999:50` (vague 2 : `5977:54, 5999:50, 5960:31, 5962:31, 5964:31, 5965:31` — les 4 codes à 31 avaient `matchedTerms` vide et sont écartés par le correctif). Avec secteur : `5977:74, 7230:66, 7298:63, 5912:57, 5999:50` ; `7230`, `7298`, `5912` n'apparaissent que dans le second appel. Effet d'amorçage du secteur conservé. |
| Nominal CAS-MCC-01 avec le profil JD-01 **complet** | CONFORME (réserve) | Même appel enrichi de `siteName:"Beldi Cosmetics"`, `siteUrl`, `companyName:"BELDI SARL"` | `5977:75, 7230:66, 7298:63, 5912:57, 5999:50, 5968:32` — le 6ᵉ code `5968` sort encore avec `matchedTerms:[]` (cf. DEF-A6-01) : le défaut est atteignable **sur le cas nominal du plan**, pas seulement sur des profils construits. |
| CAS-AUTH-01/02/03/04/05 (non-régression) | CONFORME | `reg_auth.py` | 200 + jeton 3 segments `AGENT`/`BQ001` ; 401 `Identifiants incorrects` strictement identique sur compte inconnu et mot de passe faux ; 400 `Adresse e-mail invalide` puis `Champ obligatoire` ; 401 `Authentification requise` / `Session expirée ou jeton invalide` ; `/api/health` 200 `status=ok`. |
| CAS-AUTH-12/13/14 (non-régression) | CONFORME | `reg_auth2.py` | Politique de mot de passe : 4 × 400 français. `Le mot de passe actuel est incorrect.` · `Le nouveau mot de passe doit être différent de l’ancien.` · 200, ancien jeton 401 `Mot de passe modifié : reconnectez-vous`, nouveau jeton 200. Jeton expiré / autre clé → `Session expirée ou jeton invalide` ; `sub=999999` → `Compte introuvable`. Aucun 500. |
| CAS-DEM-01/02 (non-régression) | CONFORME | `reg_wf.py` | 201, `AFF-2026-00001`, `BROUILLON`, `request_events = CREATION`. Corps vide → 400, exactement **11** `details`, tous `Champ obligatoire`. |
| CAS-WF-01 à CAS-WF-11 (non-régression) | CONFORME | `reg_wf.py` / `reg_wf2.py` | `SOUMISE` + `submittedAt` + 6 lignes `mcc_suggestions` par réseau ; `PUT` sur SOUMISE → 409 ; `VALIDATION` avec `proposes = retenus` ; substitution `5912`/`5999` → `VALIDATION_AVEC_MODIFICATION` avec le bon `payload` et les propositions intactes à `5977` ; rejet sans commentaire → 3 × 400 ; validation sans proposition (colonnes vidées en base) → 400 `La validation exige un MCC Visa et un MCC Mastercard.`, statut `SOUMISE` conservé ; arbitrage sur `BROUILLON`/`REJETEE`/`VALIDEE` → 409 avec le statut courant ; cycle complet `CREATION, SOUMISSION, COMPLEMENT_REQUIS, MODIFICATION, SOUMISSION, VALIDATION` et remise à `null` du décideur à la re-soumission. |
| CAS-WF-12 / CAS-WF-13 (non-régression) | CONFORME | 5 `submit` puis 4 `decision` lancés en parallèle sur la même demande | Soumission : 1 × 200 + 4 × 409 `Cette demande vient d’être soumise par ailleurs.`, **1** événement `SOUMISSION`, 12 lignes `mcc_suggestions` toutes distinctes sur `(network, rank)`. Arbitrage : 1 × 200 + 3 × 409 `Cette demande vient d’être arbitrée par ailleurs.`, statut `VALIDEE`, **1** événement de décision. |
| CAS-MCC-06/07/08/09/10 (non-régression) | CONFORME | `reg_mcc.py` | Aucun des 12 codes `INTERDIT` n'est proposé sur 3 descriptifs à risque. `POST` avec `7995` → 400 `Le MCC 7995 (Paris, loteries et jeux de hasard) n'est pas éligible…` + `details[0].message` reprenant la note du code ; idem sur `PUT` et `decision` avec `5967`. Code désactivé : `GET /api/mcc/5942` 404, absent de `eligibleOnly=true`, `POST` → 400 `Le MCC 5942 (Librairies) a été désactivé dans le référentiel.`, fiche ADMIN 200 `active:false`, 1 seule ligne en base. Recherche : `7995` visible hors `eligibleOnly`, `total=279`, `limit=5` → 5 items, `zzzzzzzz` → 0, `limit` 0/-3/9999 → 200. |
| CAS-MCC-15 (non-régression) | CONFORME | `PUT /api/admin/mcc/5942 {"active":false}` puis `POST /api/mcc/suggest` immédiat | `5942` disparaît des deux listes **sans redémarrage**, `GET /api/mcc` passe de `total=279` à `278` ; la réactivation le ramène aussitôt (rang 2 sur le descriptif « librairie »). Réserve : le rang 1 attendu par le plan (`5942`) dépend de **JD-03**, toujours non défini (DEF-A3-01 non traité). |
| CAS-IMPORT-01/02/03 (non-régression) | CONFORME | `GET /api/admin/mcc/export?format=xlsx|csv` puis `POST /api/admin/mcc/import-fichier -F fichier=@…` | En-têtes conformes (`…spreadsheetml.sheet` / `text/csv; charset=utf-8`, `filename="referentiel-mcc-2026-09-22.xlsx|csv"`). Aller-retour : `lignesLues=279`, `entrees=279`, `anomalies=[]`, `resume = {ajoutes:0, modifies:0, inchanges:279, retires:0, applique:false}` dans les **deux** formats. Les mots-clés contenant une virgule ne sont pas scindés. |
| CAS-IMPORT-13/15/16 (non-régression) | CONFORME | `reg` import | `muets = 1` et `muets[0].code = "9102"` (seul le code sans mots-clés **ni** secteur). 5 × 400 sur les fichiers invalides (`Le fichier importé est vide`, `entrees.0.riskLevel`, `entrees.0.label`, `Code MCC invalide dans le fichier importé : « 59 »`, `Le code 5977 apparaît plusieurs fois dans le fichier.`), référentiel intact à 279 codes. Export et import en AGENT/BANQUIER → 4 × 403 `Action réservée aux profils : ADMIN`. |
| CAS-ROB-01/02 (import) (non-régression) | CONFORME | `POST /api/admin/mcc/import {"deactivateMissing":"false"}` puis `"peut-etre"` | `"false"` → `desactivationDesRetires:false`, 0 code désactivé ; `"peut-etre"` → 400 `Valeur booléenne attendue (true ou false)`. |
| CAS-HAB-01/02/03/04 (non-régression) | CONFORME | `reg` habilitations | 3 × 403 `Action réservée aux profils : AGENT` (banquier qui saisit), 403 `… : BANQUIER` (agent qui arbitre), 10 × 403 `… : ADMIN` (5 routes × 2 rôles), 3 × 403 `Cette demande appartient à une autre banque.` et la liste de l'agent d'une autre banque ne contient aucune demande BQ001. |
| CAS-ROB-07/09/10/16 (non-régression) | CONFORME | `reg` robustesse | 6 × 400 `Demande invalide : « … »` (jamais 404 ni 500) ; `status=INEXISTANT` → 200 `items=[]`, `role=SUPERADMIN` → 400 `Rôle invalide`, `bankId=abc` → 400 `Banque invalide` ; `%`, `_`, `'`, `" OR 1=1 --`, `<script>` → 200 sans erreur SQL, `GET /api/mcc?search=' OR '1'='1` → `count=0` ; en-têtes `nosniff` / `SAMEORIGIN` / CSP / HSTS `max-age=15552000; includeSubDomains`, `OPTIONS` avec `Origin` étranger → 204 **sans** `Access-Control-Allow-Origin`. |
| CAS-AUTH-15 (non joué en vague 2) | CONFORME | Instance relancée **sans** `LOGIN_RATE_LIMIT_MAX` ; 10 `POST /api/auth/login` erronés, puis un 11ᵉ, puis un 12ᵉ avec le bon mot de passe | 10 × 401 ; 11ᵉ → **429** `{"error":"Trop de tentatives de connexion. Réessayez dans quelques minutes."}` avec `Retry-After: 900` ; 12ᵉ → 429 malgré le bon mot de passe. |
| CAS-AUTH-16 (non joué en vague 2) | CONFORME | 9 tentatives erronées, 1 réussie, 9 erronées | 9 × 401, 1 × 200, 9 × 401 — **aucune** 429 : la réussite remet bien le compteur à zéro. |
| CAS-AUTH-17 (divergence D5) | CONFIRMÉE (constat) | 15 `POST /api/auth/login {"email":"agent@banque.tn"}` puis 1 tentative avec mot de passe erroné | 15 × 400 puis **401** (pas 429) : un corps invalide n'alimente pas le compteur. Divergence D5 confirmée, inchangée depuis la revue de code. |
| CAS-MCC-04 | BLOQUÉ (inchangé) | `POST /api/mcc/suggest` avec une reconstitution de JD-04 | **JD-04 toujours non défini** : le §4 du plan reste absent (DEF-A3-01 non traité). La reconstitution donne `5817:78, 5734:77, 4816:73, 7372:73, 5968:63, 4899:61` au lieu de `5734:78, 5817:75, 4816:73, 7372:73, 4899:67, 5815:61`. |
| CAS-MCC-05 | BLOQUÉ (inchangé) | `POST /api/mcc/suggest` place de marché, `isMarketplace` à `true` puis `false` | **JD-06 toujours non défini**. `5262` reste rang 1 dans les deux cas (89 puis 82) : le résultat attendu du plan n'est toujours pas une propriété générale du moteur. |
| `npm test` (base `clicktopay_test`) | CONFORME | `DATABASE_URL=postgres://…/clicktopay_test npm test` | `# tests 106 · # pass 106 · # fail 0`, dont la nouvelle suite « Défauts relevés par la recette fonctionnelle (vague 2) » (6 tests). |

---

## Détail des défauts non corrigés, partiellement corrigés ou introduits

### DEF-A6-01 — MAJEUR — Des propositions sortent toujours sans le moindre terme justificatif

**Origine** : correction incomplète de **DEF-A3-03** (divergence D4).
**Fichiers** : `server/src/services/mccSuggestion.js` (étape 2 du scoring), `server/src/services/mccCatalog.js:44-72` (`construireIndex`).

Le correctif a bien fermé la voie par laquelle le bonus de pertinence e-commerce créait un
score sans correspondance : le repli `5999` est désormais atteignable et les six codes de vente
à distance à 31 % ont disparu. Mais il ne traite **qu'une** des deux voies.

L'étape 2 du moteur crédite `raw += poidsChamp × poidsJeton × 0,5` pour **tout** jeton reconnu,
alors que `matched` n'est alimenté que si le jeton appartient à `tokensForts` — c'est-à-dire au
libellé, aux mots-clés saisis ou aux mots-clés dérivés. Un code qui ne correspond que par sa
**description française** ou par ses **champs anglais** obtient donc `rawScore > 0`, franchit la
garde `if (raw <= 0)` et ressort avec `matchedTerms: []`.

Reproduction minimale :

```
curl -s -X POST $B/api/mcc/suggest -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
  -d '{"activityDescription":"Vente de meubles et de decoration d interieur","limit":20}'
```

```
5712 60 33.5 ['meubles', 'decoration']
7641 45 18   ['meubles']
5719 41 15.5 ['decoration']
4214 21 6    []          <-- « garde-meubles » n'apparaît que dans la description de 4214
```

Le défaut est atteignable sur le **cas nominal du plan** : avec le profil JD-01 complet
(`siteName`, `siteUrl`, `companyName` renseignés), la 6ᵉ proposition est `5968` avec
`matchedTerms: []`. Sur un balayage de 20 descriptifs variés (272 propositions, 2 réseaux),
**10 propositions** sortent sans justification : `5969`, `7311` (place de marché), `4214`
(mobilier), `7221`, `5735` (jeux vidéo), `5511` (librairie).

**Impact** : identique à celui de DEF-A3-03 — le banquier reçoit des codes qu'aucun terme
n'explique, dans un produit dont l'explicabilité est la raison d'être.

**Correction suggérée** : soit marquer `justifiant` les jetons de description (et exposer le champ
d'origine), soit écarter après coup toute proposition dont `matchedTerms` est vide, soit n'ouvrir
la liste qu'aux codes ayant au moins un jeton fort. La garde actuelle (`raw <= 0`) ne suffit pas :
l'invariant à tenir est `matchedTerms.length > 0`, pas `rawScore > 0`.

---

### DEF-A6-02 — MAJEUR — RÉGRESSION — L'aller-retour export → import du référentiel livré échoue en 400

**Origine** : effet de bord du correctif **D3**.
**Fichiers** : `server/src/services/mccImportFile.js` (écriture de la colonne `Secteur`),
`server/src/services/adminSchema.js` (`importMccSchema`, champ `sector` borné à 40 caractères).

L'export écrit désormais **tous** les secteurs d'un code, séparés par une virgule — c'est bien le
correctif attendu de D3. Mais le schéma d'import borne toujours la colonne `sector` à 40 caractères.
Le référentiel d'amorçage contient un code à deux secteurs dont la concaténation dépasse cette borne :
`5817` → `"CONTENUS_NUMERIQUES, INFORMATIQUE_LOGICIEL"` (42 caractères).

Reproduction, sur un référentiel **strictement d'amorçage** (279 codes, aucune modification) :

```
curl -s "$B/api/admin/mcc/export?format=csv" -H "Authorization: Bearer $TAD" -o export.csv
curl -s -X POST $B/api/admin/mcc/import-fichier -H "Authorization: Bearer $TAD" -F "fichier=@export.csv"   # 200, inchanges=279
# puis, avec les `entrees` du rapport :
curl -s -X POST $B/api/admin/mcc/import -H "Authorization: Bearer $TAD" \
  -H 'Content-Type: application/json' --data @apply_all.json
```

```
HTTP 400
{"error":"Données invalides","details":[{"champ":"entrees.111.sector","message":"40 caractères au maximum"}]}
```

**Impact** : le cycle « télécharger → corriger → réimporter » annoncé par le produit est rompu
**dès la première utilisation**, sans que l'administrateur ait rien modifié. Le message ne nomme
pas le code fautif (`entrees.111`, pas `5817`) : le diagnostic est à la charge de l'utilisateur.
La phase de simulation (`import-fichier`) passe en 200 et annonce `inchanges: 279` — l'échec ne se
révèle qu'à l'application, après que l'administrateur a validé le rapport.

**Correction suggérée** : porter la borne de `sector` au-delà de la plus longue concaténation
possible (par exemple 40 × nombre de secteurs, ou une borne par élément après découpage), et
nommer le code MCC dans le message d'erreur.

---

### DEF-A6-03 — MAJEUR — C-01 partiellement corrigé : le secret publié dans le dépôt reste accepté en production

**Fichier** : `server/src/config.js`.

Le garde-fou demandé par C-01 existe désormais pour l'**absence** de variable :

```
NODE_ENV=production DATABASE_URL=… PORT=4013 node src/index.js
Error: Variable d'environnement obligatoire en production : JWT_SECRET.
       Le repli de développement ne doit jamais servir hors développement.
```

Les deux compléments explicitement demandés par la revue ne sont pas implémentés :

1. **La valeur de développement fournie explicitement est acceptée.**

```
NODE_ENV=production JWT_SECRET=dev-secret-a-remplacer-en-production DATABASE_URL=… PORT=4013 node src/index.js
# -> l'API démarre
curl -s http://127.0.0.1:4013/api/auth/me -H "Authorization: Bearer <jeton forgé avec ce secret>"
# -> 200 {"id":4,…,"role":"ADMIN",…}
```

Le jeton a été forgé hors application avec le secret publié dans le dépôt Git et le `pwd` lu en base ;
il est accepté comme administrateur. Le scénario de compromission décrit par C-01 reste donc
reproductible dès lors que la variable est positionnée à la valeur du dépôt — ce qui est
précisément l'erreur de déploiement la plus probable (copie du `.env.example`).

2. **Aucun contrôle de longueur minimale** : `JWT_SECRET=court` (5 caractères) démarre sans
réserve, alors que la revue préconisait un minimum de 32 caractères.

---

### DEF-A6-04 — MAJEUR — C-12 partiellement corrigé : `/api/health` répond 200 alors que toutes les routes métier échouent

**Fichier** : `server/src/app.js:22-35` (route `/api/health`), `server/src/services/mccCatalog.js` (`catalogueEstCharge`).

La partie « l'API ne se fige plus » est corrigée (voir le tableau). La sonde de santé, elle, ne
reflète pas l'état réel : elle s'appuie sur `catalogueEstCharge()`, qui répond « oui » dès lors
qu'un catalogue a été chargé **une fois**, y compris quand le dernier rechargement a échoué et
que le catalogue en mémoire est périmé ou inutilisable.

```
psql … -c "ALTER TABLE mcc_codes RENAME TO mcc_codes_bak;"
psql … -c "NOTIFY mcc_catalogue_modifie,'a6';"
curl -s -w " HTTP=%{http_code}" $B/api/health
  {"status":"ok","env":"development","referentiel":"charge"} HTTP=200
curl -s -w " HTTP=%{http_code}" "$B/api/mcc?limit=1" -H "Authorization: Bearer $TA"
  {"error":"Erreur interne du serveur"} HTTP=500
curl -s -w " HTTP=%{http_code}" -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{…}'
  {"error":"Erreur interne du serveur"} HTTP=500
```

Le 503 n'est rendu que par une instance qui n'a **jamais** réussi à charger le référentiel
(instance neuve démarrée table absente : `{"status":"degraded","referentiel":"indisponible"}`, HTTP 503).

**Impact** : c'est exactement le scénario décrit par C-12 — le répartiteur de charge continue
d'envoyer du trafic à une instance fonctionnellement morte. Le commentaire du code
(« répondre « ok » à un répartiteur de charge pendant que toutes les routes métier échouent est
pire que pas de contrôle du tout ») décrit une intention que l'implémentation ne tient pas.

**Correction suggérée** : mémoriser l'issue du **dernier** chargement (et sa date) plutôt que la
seule présence d'un catalogue en mémoire, et répondre 503 tant que le dernier rechargement est en échec.

---

## Réserves reconduites de la vague 2 (non traitées)

- **DEF-A3-01** (MAJEUR, défaut de plan) : le **§4 « jeux de données JD-01 à JD-06 » reste absent**
  de `docs/plan-de-tests.md`, qui s'arrête à la §3. CAS-MCC-04 et CAS-MCC-05 demeurent donc
  `BLOQUÉ`, et CAS-MCC-12 / CAS-MCC-15 restent joués sur des reconstitutions.
- **Divergence D5** (CAS-AUTH-17) : confirmée, un corps invalide n'alimente pas le compteur de
  limitation de débit.
- **Attentes de plan inexactes** déjà signalées en vague 2 et toujours d'actualité :
  CAS-INDEX-01 (`bornes recharge` n'est pas un bigramme contigu dans « bornes **de** recharge »),
  CAS-INDEX-04 (1) et CAS-INDEX-08 (3).
- **Résultats attendus devenus caducs** par l'effet du correctif DEF-A3-03 : CAS-MCC-01
  (6 codes dont `5960:31`) et CAS-MCC-03 (les quatre codes à 31). À mettre à jour dans le plan.

---

## Synthèse

| | Défauts |
|---|---|
| **CORRIGÉS et vérifiés par reproduction** | DEF-A3-02, DEF-A3-04, DEF-A3-05, D2, D3, C-02, C-14 ; DEF-A3-03 sur sa partie « repli `5999` atteignable » |
| **PARTIELLEMENT corrigés** | DEF-A3-03 (→ DEF-A6-01), C-01 (→ DEF-A6-03), C-12 (→ DEF-A6-04) |
| **RÉGRESSION introduite** | DEF-A6-02 (aller-retour export → import du référentiel livré) |
| **Régressions sur le périmètre vague 2** | **aucune** sur AUTH, WORKFLOW, HABILITATION, MCC, IMPORT et ROBUSTESSE (hors l'écart *attendu* du classement dû au correctif DEF-A3-03) |
| **Toujours BLOQUÉ** | CAS-MCC-04, CAS-MCC-05 (DEF-A3-01 : §4 du plan absent) |

**Cas rejoués** : 45 cas ou sous-cas BACK, plus 45 itérations de concurrence sur la modification
de demande, 9 itérations de concurrence sur la soumission et l'arbitrage, et la suite automatisée
(106/106).

**Avis sur la solidité de l'API.** Le chemin nominal et le cloisonnement sont solides : aucune
régression sur les 45 cas rejoués, aucun 500 hors panne de référentiel provoquée, les messages
métier sont exacts au caractère près, et les trois fenêtres de concurrence (soumission, arbitrage,
modification) sont désormais toutes fermées par une garde transactionnelle — c'est le progrès le
plus net de cette vague. La traduction des messages de validation est complète : 25 messages
distincts examinés sur 6 routes, aucun anglais résiduel.

La faiblesse est ailleurs, et elle est récurrente : **les correctifs traitent le symptôme
constaté, pas l'invariant**. Le moteur de suggestion a perdu la voie qui créait un score sans
correspondance, mais garde celle qui en crée un sans justification (DEF-A6-01) ; la configuration
refuse la variable absente, mais accepte le secret publié dans le dépôt (DEF-A6-03) ; la sonde de
santé sait dire 503, mais seulement dans le cas où personne ne la regarde (DEF-A6-04). Trois fois
sur quatre, le cas vérifié par la recette de la vague 2 est corrigé et sa généralisation ne l'est pas.

À cela s'ajoute un enseignement de méthode : le correctif D3 a réparé une perte de données à
l'aller-retour et, ce faisant, a cassé l'aller-retour lui-même sur le référentiel livré
(DEF-A6-02) — parce que la chaîne export/import n'a pas été rejouée de bout en bout après la
modification. C'est le seul défaut de cette vague qu'un test automatisé d'aller-retour complet
(`export → import-fichier → import apply`) aurait arrêté ; il n'existe pas.

**Recommandation** : DEF-A6-02 et DEF-A6-03 avant livraison (l'un casse une fonction annoncée,
l'autre est une compromission d'authentification) ; DEF-A6-01 et DEF-A6-04 dans la foulée.
Et, pour les trois corrections partielles, formuler l'invariant plutôt que le cas de test :
`matchedTerms.length > 0`, « le secret ne doit pas être une valeur connue publiquement »,
« la sonde reflète le dernier chargement, pas le premier ».

---

*Environnement laissé en l'état : instance port 4012 démarrée **sans** `LOGIN_RATE_LIMIT_MAX`
(cas de limitation de débit) ; base `clicktopay_recette_back2` remise à l'état de référence
avant la campagne de non-régression, puis chargée des demandes créées par les cas WORKFLOW.
Référentiel : 279 codes, 279 actifs, 12 `INTERDIT` — identique à l'amorçage.*
