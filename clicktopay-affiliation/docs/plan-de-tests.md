# Plan de tests — Plateforme d'affiliation ClickToPay

Version 1 — rédigé à partir du code source (`server/src`, `web/src`) et non du README.
Campagne de recette : agents 2, 3, 5 et 6 exécutent, l'agent 7 consolide.

---

## 1. Périmètre et hypothèses

### 1.1 Ce qui est testé

| Domaine | Portée |
| --- | --- |
| AUTH | `/api/auth/*`, cycle de vie du jeton, politique et changement de mot de passe, limitation de débit |
| HABILITATION | `requireRole`, cloisonnement par banque, accès par URL forcée côté React |
| DEMANDE | Création / modification / brouillon, validation zod de `affiliationRequestSchema`, formulaire en 5 étapes |
| WORKFLOW | Transitions `BROUILLON → SOUMISE → VALIDEE / REJETEE / COMPLEMENT_REQUIS`, transitions à refuser, concurrence |
| MCC | `mccSuggestion.js` (scores, explicabilité, bornes 1–99), codes INTERDIT / désactivés, recherche manuelle, parité Visa/Mastercard |
| ADMIN | Comptes, banques, référentiel, historique par code, journal d'administration |
| IMPORT | `mccImportFile.js` (xlsx, csv, json), en-têtes, anomalies, rapport d'écart, application, aller-retour export/import |
| INDEXATION | `motsCles.js`, secteurs en base, effet immédiat d'une écriture sur le moteur |
| ROBUSTESSE | Types hostiles, bornes, caractères de contrôle, codes HTTP, erreurs 500 interdites |
| ERGONOMIE | Restitution des erreurs, états de chargement, 375 px, navigation clavier, contrastes |

### 1.2 Ce qui n'est pas testé, et pourquoi

| Exclusion | Raison |
| --- | --- |
| Propagation `LISTEN/NOTIFY` entre plusieurs instances | Nécessite au moins deux processus API sur des ports dédiés ; les ports 4000, 5173, 4011, 4012, 4021 sont réservés à d'autres agents. Le README reconnaît lui-même la limite (notification perdue). Le rechargement **intra-processus** est testé (CAS-INDEX-*). |
| Robustesse du hachage bcrypt, cryptanalyse JWT | Bibliothèques tierces ; seul leur usage applicatif est testé. |
| Chaîne Python `tools/extract.py` / `parse_mcc.py` | Hors application, non rejouable sans le PDF Visa. |
| Performance / charge (le README annonce 4,1 ms par appel du moteur) | Mesure hors recette fonctionnelle ; CAS-MCC-13 se limite à un contrôle de non-régression grossier. |
| Expiration naturelle du jeton (`JWT_EXPIRES_IN=8h`) | Non observable dans la durée d'une campagne ; couvert indirectement par CAS-AUTH-14 (jeton forgé expiré). |
| Libellés Mastercard propres | Non implémentés (README : CDN Mastercard en 403). Les codes sont communs ISO 18245. |
| Internationalisation, impression, export PDF | Non implémentés. |

### 1.3 Hypothèses d'exécution

1. **Base** : `clicktopay_test` pour les cas BACK automatisables, base de recette dédiée pour le manuel, amorcée par `npm run db:seed` (comptes de démonstration présents).
2. **Comptes de référence** (créés par le seed) :
   | Rôle | Identifiant | Mot de passe | Banque |
   | --- | --- | --- | --- |
   | AGENT | `agent@banque.tn` | `Agent#2026` | BQ001 |
   | BANQUIER | `banquier@banque.tn` | `Banquier#2026` | BQ001 |
   | AGENT (2e banque) | `agent2@banque.tn` | `Agent#2026` | BQ002 |
   | ADMIN | `admin@clicktopay.tn` | `Admin#2026` | BQ001 |
3. **Limitation de débit** : `server/tests/helpers.js` force `LOGIN_RATE_LIMIT_MAX=10000`. Les cas CAS-AUTH-15 à 17 exigent une API démarrée **sans** cette variable (valeur par défaut : 10 tentatives / 15 min).
4. **Référentiel** : 279 codes, dont 12 `INTERDIT` (`5723, 5967, 6010, 6011, 6051, 7800, 7801, 7802, 7995, 9406, 9702, 9950`) et 42 `SENSIBLE`.
5. **Ports** : ne jamais démarrer d'instance sur 4000, 5173, 4011, 4012, 4021.
6. **Messages attendus** : reproduits **au caractère près**, apostrophe typographique `’` comprise là où le code l'emploie.
7. **Rejeu** : chaque cas doit pouvoir être rejoué après `resetDatabase()` (ou `npm run db:seed` + remise à zéro des demandes).
8. **Schéma à jour** *(ajouté le 2026-09-23)* : la base de recette doit avoir été migrée **après le commit `3a7ac2e`** (`npm run db:migrate`), qui ajoute la colonne `admin_events.bank_id` — la banque concernée par une action d'administration, figée à l'écriture. Sur une base plus ancienne, `GET /api/admin/events` rend **500** (`column e.bank_id does not exist`) dès qu'un banquier l'appelle, et les cas CAS-HAB-11 (point 7) et CAS-ADM-21 sont injouables. Contrôle en une ligne : `\d admin_events` doit montrer `bank_id`.

### 1.4 Conventions

- Niveau : **BACK** (API seule), **FRONT** (interface seule), **LES DEUX** (le comportement doit être vérifié aux deux niveaux ; l'écran ne doit jamais être la seule barrière).
- Criticité : **BLOQUANT** (livraison impossible), **MAJEUR** (contournement pénible ou risque métier), **MINEUR** (confort).
- Un résultat attendu est toujours un **code HTTP**, un **message exact**, un **état en base** ou un **élément à l'écran nommé**.
- Critère d'acceptation binaire : OK / KO, sans appréciation.

### 1.5 Divergences README / code relevées à la lecture (à confirmer en exécution)

| # | Promesse du README | Code réel | Cas dédié |
| --- | --- | --- | --- |
| D1 | « Le rang suit l'ordre fourni : le premier code d'un secteur est celui que le moteur remonte en priorité » (`mccAdmin.js`) | `ecrireSecteurs` insère avec `rank = MAX(rank)+1` du secteur : le code arrive **en dernier**, quel que soit l'ordre fourni | CAS-INDEX-06 |
| D2 | « Le rattachement d'un MCC à un secteur… peut être fait par la colonne `Secteur` du fichier » | Pour un code **déjà existant**, `sector` n'est pas dans `COMPARABLES` : un fichier ne modifiant que le secteur classe le code en « inchangé » et n'écrit rien | CAS-IMPORT-11 |
| D3 | « Un MCC peut relever de plusieurs secteurs » + aller-retour export/import « sans perte » | L'export n'écrit qu'un seul secteur (`sectors[0]`) ; à la réimportation d'un code par ailleurs modifié, `ecrireSecteurs` **remplace** tous ses secteurs par celui-là | CAS-IMPORT-12 |
| D4 | « Filet de sécurité : jamais de liste vide renvoyée à l'agent » (repli sur 5999) | Les six MCC de `REMOTE_SALE_MCCS` reçoivent `+2` inconditionnels : `rawScore > 0` est toujours vrai, la branche de repli est **inatteignable**. Le test `un descriptif sans correspondance retombe sur un code de repli` ne vérifie que `length >= 1` et passe sans l'exercer | CAS-MCC-11 |
| D5 | « Limitation de débit sur la connexion : 10 tentatives » | `validate(loginSchema)` est monté **avant** `loginLimiter` : un corps malformé n'est jamais compté. Une attaque à corps invalide n'est pas freinée (impact faible, mais le compteur n'est pas celui décrit) | CAS-AUTH-17 |
| D6 | « Le profil ADMIN cumule les droits d'agent et de banquier » (point ouvert assumé) | Confirmé dans `requireRole` : `ADMIN` court-circuite tout contrôle de rôle, et `getRequest` lui ouvre toutes les banques | CAS-HAB-05 |
| D7 | « 279 MCC » | `mcc-catalog.json` contient bien 279 entrées, mais `GET /api/mcc` renvoie `total = catalogueActif().length` : après une désactivation le total baisse sans que l'écran ne le signale | CAS-MCC-02 |

> **Amendement du 2026-09-23 — où en sont les sept divergences.** Elles ont été relevées à la
> lecture du code le 2026-09-21 ; quatre d'entre elles ont été tranchées depuis, par une
> correction ou par un arbitrage. Le tableau ci-dessus est conservé tel quel — il dit ce qui
> était promis et ce qui était écrit —, cette note dit ce qui est vrai aujourd'hui.
>
> | # | État au 2026-09-23 | Établi par |
> | --- | --- | --- |
> | D1 | **partiellement close.** La conséquence dommageable est corrigée (un code réenregistré n'est plus relégué en fin de secteur) ; la promesse « le rang suit l'ordre fourni » n'est toujours pas tenue — un nouveau rattachement prend la fin de file. Écart de documentation subsistant. | `rapport-recette.md` (C-14, réserve D1) ; `robustesse.test.js`, deux cas C-14 |
> | D2 | **close.** Un fichier qui ne change que le rattachement sectoriel est détecté et appliqué. Mesuré le 2026-09-23 : une simulation sur `{"code":"5977","sector":"SANTE"}` rend `modifies = 1`, `inchanges = 0`, le champ signalé étant `sectors`. | mesure directe ; `robustesse.test.js` (*le secteur est comparé à l'import*) |
> | D3 | **close.** L'export porte **tous** les secteurs d'un code et l'aller-retour ne les perd plus. Mesuré le 2026-09-23 sur l'export CSV : `5817 → CONTENUS_NUMERIQUES, INFORMATIQUE_LOGICIEL` et `5912 → BEAUTE_COSMETIQUE, SANTE`. | mesure directe ; `rapport-recette.md` (D3) |
> | D4 | **close.** Le filet de sécurité n'est plus du code mort : l'invariant « aucune proposition sans terme justificatif » écarte les six MCC de vente à distance qui le rendaient inatteignable, et le repli sur `5999` est servi. Voir les amendements de CAS-MCC-11 et du § 4.3. | mesure directe ; `vague3.test.js` |
> | D5 | **close, et dans l'autre sens.** Le compteur de limitation est désormais posé **avant** la validation du corps (EVO-11) : un corps malformé est compté comme une tentative. CAS-AUTH-17 est réécrit en conséquence. | `journal-lot1.md` (EVO-11) ; `limitation.test.js` |
> | D6 | **close par décision, non par correction.** Le cumul des droits de l'administrateur est assumé (décision D-1), et la décision D-3 l'étend au banquier sur sa propre banque. CAS-HAB-05 reste à exécuter pour consigner le comportement. | `decisions-commanditaire.md`, D-1 et D-3 |
> | D7 | **ouverte.** Comportement inchangé. | — |

---

## 2. Les cas

### 2.1 AUTH — authentification, jeton, mot de passe

---

**CAS-AUTH-01 — Connexion nominale d'un agent**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : base amorcée ; `agent@banque.tn` actif, banque BQ001 active, `must_change_password = false`.
Étapes :
1. `POST /api/auth/login` avec `{"email":"agent@banque.tn","password":"Agent#2026"}`.
2. (FRONT) Ouvrir `/connexion`, saisir les mêmes identifiants, cliquer « Se connecter ».
Résultat attendu :
- HTTP 200 ; corps contenant `token` (chaîne JWT à 3 segments) et `user` avec `role":"AGENT"`, `bankCode":"BQ001"`, `mustChangePassword":false`.
- En base : `users.last_login_at` de ce compte mis à jour (> valeur précédente).
- (FRONT) Redirection vers `/demandes`, en-tête affichant `Salma Ben Ali` et `Agent — BQ001`.
Acceptation : les trois points sont vrais.

---

**CAS-AUTH-02 — Mot de passe erroné : refus sans énumération**
Niveau : BACK · Criticité : BLOQUANT
Préconditions : compte `agent@banque.tn` existant.
Étapes :
1. `POST /api/auth/login` `{"email":"agent@banque.tn","password":"MauvaisMotDePasse1"}`.
2. `POST /api/auth/login` `{"email":"inconnu@nulle-part.tn","password":"MauvaisMotDePasse1"}`.
Résultat attendu : les deux appels renvoient **HTTP 401** et exactement `{"error":"Identifiants incorrects"}`. Aucune différence de corps, de statut ni d'en-tête entre les deux.
Acceptation : corps et statut strictement identiques.

---

**CAS-AUTH-03 — Corps de connexion invalide**
Niveau : BACK · Criticité : MAJEUR
Étapes :
1. `POST /api/auth/login` `{"email":"pas-une-adresse","password":"x"}`.
2. `POST /api/auth/login` `{"email":"agent@banque.tn"}`.
Résultat attendu :
- (1) HTTP 400, `error = "Données invalides"`, `details` contient `{"champ":"email","message":"Adresse e-mail invalide"}`.
- (2) HTTP 400, `details` contient `{"champ":"password","message":"Champ obligatoire"}`.
Acceptation : statut 400 et libellés de champ exacts dans les deux cas.

---

**CAS-AUTH-04 — Route protégée sans jeton / avec jeton illisible**
Niveau : BACK · Criticité : BLOQUANT
Étapes :
1. `GET /api/requests` sans en-tête `Authorization`.
2. `GET /api/requests` avec `Authorization: Bearer jeton-bidon`.
3. `GET /api/requests` avec `Authorization: Basic YWdlbnQ6eA==`.
Résultat attendu : (1) 401 `{"error":"Authentification requise"}` · (2) 401 `{"error":"Session expirée ou jeton invalide"}` · (3) 401 `{"error":"Authentification requise"}`.
Acceptation : les trois messages sont exacts.

---

**CAS-AUTH-05 — `/api/health` reste public**
Niveau : BACK · Criticité : MINEUR
Étapes : 1. `GET /api/health` sans jeton.
Résultat attendu : HTTP 200, corps `{"status":"ok","env":"<environnement>"}`.
Acceptation : 200 et `status = "ok"`.

---

**CAS-AUTH-06 — Révocation immédiate sur compte désactivé**
Niveau : BACK · Criticité : BLOQUANT
Préconditions : jeton valide de `agent@banque.tn` obtenu et conservé.
Étapes :
1. `PUT /api/admin/users/<id agent>` `{"active":false}` avec le jeton ADMIN.
2. Rejouer `GET /api/requests` avec le jeton de l'agent **obtenu avant** la désactivation.
3. `POST /api/auth/login` avec les identifiants de l'agent.
Résultat attendu : (2) HTTP 401 `{"error":"Compte désactivé"}` · (3) HTTP 401 `{"error":"Identifiants incorrects"}`.
Acceptation : aucune requête de l'agent n'aboutit après l'étape 1.

---

**CAS-AUTH-07 — Révocation immédiate sur banque désactivée**
Niveau : BACK · Criticité : BLOQUANT
Préconditions : une banque `BQ003` créée, un compte AGENT `agent3@banque.tn` rattaché, jeton de ce compte conservé. Le compte doit être désactivé avant la banque (garde-fou de `updateBank`).
Étapes :
1. `PUT /api/admin/users/<id agent3>` `{"active":false}` puis `PUT /api/admin/banks/<id BQ003>` `{"active":false}`.
2. Réactiver le compte : `PUT /api/admin/users/<id agent3>` `{"active":true}`.
3. Rejouer `GET /api/auth/me` avec le jeton d'agent3.
Résultat attendu : étape 3 → HTTP 401 `{"error":"Banque désactivée"}`. En base, `users.active = true` et `banks.active = false`.
Acceptation : le compte réactivé reste bloqué tant que sa banque est inactive.

---

**CAS-AUTH-08 — Mutation de banque prise en compte sans reconnexion**
Niveau : BACK · Criticité : BLOQUANT
Préconditions : une demande D1 créée par `agent@banque.tn` (banque BQ001) ; jeton de l'agent conservé.
Étapes :
1. `GET /api/requests/<D1>` avec le jeton de l'agent → doit répondre 200.
2. ADMIN : `PUT /api/admin/users/<id agent>` `{"bankId":<id BQ002>}`.
3. Rejouer `GET /api/requests/<D1>` avec **le même jeton**.
Résultat attendu : étape 3 → HTTP **404** `{"error":"Demande <D1> introuvable"}`, **identique au mot près** à la réponse servie pour une demande qui n'existe pas (`GET /api/requests/999999`).
Acceptation : le jeton, non réémis, ne donne plus accès au dossier de l'ancienne banque, et le refus ne dit pas que ce dossier existe.

> **Amendement du 2026-09-23.** Le code attendu passe de **403** à **404**, et le message
> `Cette demande appartient à une autre banque.` disparaît : il n'est plus émis nulle part.
> Commit `3a7ac2e` — un objet d'une autre banque se distinguait d'un objet inexistant par son
> code de retour, ce qui laissait dénombrer les dossiers d'en face en balayant les
> identifiants. `requests.js`, `getRequest()` lève désormais le même `notFound` dans les deux
> cas. Mesuré le 2026-09-23 sur l'instance du port 4000, jeton `agent2@banque.tn` (BQ002) sur
> la demande 1 (BQ001) : `404 {"error":"Demande 1 introuvable"}`, contre
> `404 {"error":"Demande 9999 introuvable"}` pour un identifiant libre. Le cas n'est pas
> affaibli : ce qu'il éprouve — le jeton non réémis perd l'accès — est inchangé, seule la forme
> du refus l'est, et l'égalité des deux réponses devient elle-même une assertion.

---

**CAS-AUTH-09 — Changement de rôle pris en compte sans reconnexion**
Niveau : BACK · Criticité : MAJEUR
Préconditions : jeton d'un compte AGENT conservé ; une demande au statut `SOUMISE` dans sa banque.
Étapes :
1. Avec le jeton d'agent : `POST /api/requests/<id>/decision` `{"decision":"VALIDEE"}` → attendu 403.
2. ADMIN : `PUT /api/admin/users/<id agent>` `{"role":"BANQUIER"}`.
3. Rejouer l'étape 1 avec le **même** jeton.
Résultat attendu : (1) 403 `Action réservée aux profils : BANQUIER` · (3) HTTP 200, `status = "VALIDEE"` en base.
Acceptation : le rôle lu en base l'emporte sur celui du jeton.

---

**CAS-AUTH-10 — Une réinitialisation ferme les sessions ouvertes**
Niveau : BACK · Criticité : BLOQUANT
Préconditions : jeton valide de `banquier@banque.tn` conservé.
Étapes :
1. ADMIN : `POST /api/admin/users/<id banquier>/password` `{"password":"Nouveau#2026x"}`.
2. Rejouer `GET /api/auth/me` avec le jeton **antérieur**.
Résultat attendu : HTTP 401 `{"error":"Mot de passe modifié : reconnectez-vous"}`. En base : `must_change_password = true`, `password_changed_at` postérieur à l'émission du jeton.
Acceptation : message exact et état en base conformes.

---

**CAS-AUTH-11 — Changement obligatoire imposé par le serveur**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : compte dont le mot de passe vient d'être réinitialisé (`must_change_password = true`), reconnecté avec le nouveau mot de passe provisoire.
Étapes :
1. `POST /api/auth/login` avec le mot de passe provisoire → relever `mustChangePassword`.
2. Avec ce jeton : `GET /api/mcc`, `GET /api/requests`, `GET /api/admin/users`.
3. Avec ce jeton : `GET /api/auth/me` puis `POST /api/auth/password`.
4. (FRONT) Se connecter avec ce compte et tenter d'atteindre `/demandes` par l'URL.
Résultat attendu :
- (1) 200, `user.mustChangePassword = true`.
- (2) **HTTP 403** sur les trois routes, message exact `Vous devez définir un nouveau mot de passe avant d’utiliser la plateforme.`
- (3) `/api/auth/me` répond 200 et `/api/auth/password` est accepté (le routeur `/api/auth` est monté avant le garde).
- (4) Redirection automatique vers `/mot-de-passe` ; la barre de navigation n'affiche que « Changement de mot de passe requis » (aucun lien Demandes / Référentiel / Administration).
Acceptation : les 4 points sont vrais ; aucune route métier n'est servie.

---

**CAS-AUTH-12 — Politique de mot de passe**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes (pour chaque valeur, `POST /api/auth/password` avec `currentPassword` correct) :
1. `newPassword = "Court#1a"` (8 caractères).
2. `newPassword = "motdepasse1234"` (pas de majuscule).
3. `newPassword = "MOTDEPASSE1234"` (pas de minuscule).
4. `newPassword = "MotDePasseSansChiffre"` (pas de chiffre).
5. `newPassword = "MotDePasse2026"` (conforme).
Résultat attendu :
- (1) 400, `details[0].message = "Le mot de passe doit comporter au moins 10 caractères"`.
- (2) (3) (4) 400, `details[0].message = "Le mot de passe doit contenir une minuscule, une majuscule et un chiffre"`.
- (5) 200, corps `{"token":"…","changed":true}` ; en base `must_change_password = false`.
Acceptation : les 5 verdicts sont conformes.

---

**CAS-AUTH-13 — Changement par l'utilisateur : ancien mot de passe exigé et réutilisation refusée**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `POST /api/auth/password` `{"currentPassword":"FauxMotDePasse1","newPassword":"MotDePasse2026"}`.
2. `POST /api/auth/password` `{"currentPassword":"<courant>","newPassword":"<courant>"}`.
3. `POST /api/auth/password` `{"currentPassword":"<courant>","newPassword":"MotDePasse2026"}`.
4. Rejouer `GET /api/auth/me` avec l'**ancien** jeton, puis avec le jeton renvoyé à l'étape 3.
Résultat attendu : (1) 400 `Le mot de passe actuel est incorrect.` · (2) 400 `Le nouveau mot de passe doit être différent de l’ancien.` · (3) 200 `changed:true` · (4) ancien jeton → 401 `Mot de passe modifié : reconnectez-vous`, nouveau jeton → 200.
Acceptation : les 4 verdicts sont conformes (l'apostrophe typographique du message 2 comprise).

---

**CAS-AUTH-14 — Jeton expiré ou signé avec une autre clé**
Niveau : BACK · Criticité : MAJEUR
Préconditions : accès à `JWT_SECRET` de l'instance sous test.
Étapes :
1. Forger un JWT avec le bon secret mais `exp` dans le passé ; appeler `GET /api/auth/me`.
2. Forger un JWT valide avec un secret différent ; appeler `GET /api/auth/me`.
3. Forger un JWT bien signé dont `sub` désigne un identifiant inexistant (ex. 999999).
Résultat attendu : (1) et (2) → 401 `{"error":"Session expirée ou jeton invalide"}` · (3) → 401 `{"error":"Compte introuvable"}`.
Acceptation : les trois messages sont exacts ; aucun 500.

---

**CAS-AUTH-15 — Limitation de débit par compte visé**
Niveau : BACK · Criticité : MAJEUR
Préconditions : API démarrée **sans** `LOGIN_RATE_LIMIT_MAX` (valeur 10) ; compteur vierge pour l'IP appelante.
Étapes :
1. Envoyer 10 `POST /api/auth/login` avec `{"email":"agent@banque.tn","password":"Faux#12345"}`.
2. Envoyer une 11e requête identique.
3. Envoyer une 12e requête avec le **bon** mot de passe.
Résultat attendu :
- (1) 10 réponses 401.
- (2) HTTP **429**, corps `{"error":"Trop de tentatives de connexion. Réessayez dans quelques minutes."}`, en-tête `Retry-After` présent et numérique (≤ 900).
- (3) HTTP 429 également (le compte est verrouillé, pas seulement le mot de passe erroné).
Acceptation : le 11e appel est en 429 avec le message et l'en-tête exacts.

---

**CAS-AUTH-16 — Une authentification réussie remet le compteur à zéro**
Niveau : BACK · Criticité : MINEUR
Préconditions : idem CAS-AUTH-15, compteur vierge.
Étapes :
1. 9 tentatives erronées sur `agent@banque.tn`.
2. 1 tentative correcte (200 attendu).
3. 9 nouvelles tentatives erronées.
Résultat attendu : toutes les tentatives de l'étape 3 répondent 401 (jamais 429) ; aucune n'est refusée pour cause de débit.
Acceptation : zéro réponse 429 sur l'ensemble du scénario.

---

**CAS-AUTH-17 — Un corps invalide alimente le compteur (divergence D5 close)**
Niveau : BACK · Criticité : MINEUR
Préconditions : idem CAS-AUTH-15, compteur vierge.
Étapes :
1. Envoyer 10 `POST /api/auth/login` avec `{"email":"agent@banque.tn"}` (sans `password`).
2. Envoyer un 11e appel au corps tout aussi incomplet.
3. Envoyer un `POST /api/auth/login` avec `{"email":"agent@banque.tn","password":"Agent#2026"}` — identifiants **corrects**.
Résultat attendu :
- (1) 10 réponses **400** `{"error":"Données invalides"}` : le corps reste refusé comme avant, mais chacune de ces tentatives est désormais **comptée**.
- (2) HTTP **429**, corps `{"error":"Trop de tentatives de connexion. Réessayez dans quelques minutes."}`, en-tête `Retry-After` présent et numérique.
- (3) HTTP **429** également : passé le quota, la limitation prime sur tout, connexion valide comprise.
Acceptation : le 11e appel répond 429 ; un corps malformé ne permet plus de balayer la route sans consommer de quota.

> **Amendement du 2026-09-23.** Le cas constatait la divergence D5 : `validate(loginSchema)`
> était monté **avant** `loginLimiter`, si bien qu'un corps malformé n'était jamais compté et
> qu'alterner corps valides et invalides diluait la consommation d'un attaquant. EVO-11 a
> inversé les deux intergiciels (`routes/auth.js` : `loginLimiter`, puis `validate`). Le cas
> est réécrit sur la règle nouvelle, dont il éprouve l'effet utile plutôt que l'absence.
> Attendu établi sur le code et sur `server/tests/limitation.test.js`, qui pose
> `LOGIN_RATE_LIMIT_MAX = 3` et observe la séquence `400, 400, 400, 429` puis un refus de la
> connexion valide ; **non rejoué sur l'instance partagée du port 4000**, où épuiser le quota
> aurait privé les autres intervenants de connexion pendant quinze minutes.

---

### 2.2 HABILITATION — droits par rôle, cloisonnement, URL forcée

---

**CAS-HAB-01 — Le banquier saisit et gère les dossiers de sa banque (décision D-3)**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : jeton `banquier@banque.tn` (banque BQ001) ; une demande D au statut `BROUILLON` saisie par `agent@banque.tn`, même banque.
Étapes :
1. `POST /api/requests` avec un corps valide (jeu JD-01).
2. `PUT /api/requests/<id créé>` avec `{"siteName":"X"}`.
3. `POST /api/requests/<id créé>/submit`.
4. `POST /api/requests/<id créé>/decision` `{"decision":"VALIDEE"}` — le banquier arbitre le dossier qu'il vient de saisir.
5. `PUT /api/requests/<D>` `{"siteName":"Repris par le banquier"}` — il reprend le dossier d'un de ses agents.
6. (FRONT) Connecté en banquier, saisir `/demandes/nouvelle` dans la barre d'adresse.
Résultat attendu :
- (1) HTTP **201**, la demande créée portant `bankId` = celle du banquier, jamais une autre.
- (2) HTTP **200** · (3) HTTP **200**, statut `SOUMISE` · (4) HTTP **200**, statut `VALIDEE`.
- (5) HTTP **200** : la règle « on ne modifie que les demandes qu'on a saisies » vise les agents entre eux, pas le banquier sur sa banque.
- (6) le formulaire de saisie s'ouvre, le champ « Nom du site » est rendu, et le lien « Nouvelle demande » figure dans l'en-tête.
Acceptation : les cinq appels aboutissent et l'écran de saisie s'ouvre. Le cloisonnement, lui, reste éprouvé par CAS-HAB-04 et CAS-HAB-11 : ce que le banquier gagne s'arrête aux frontières de sa banque.

> **Amendement du 2026-09-23.** La rédaction initiale — « le banquier ne saisit pas » —
> décrivait la plateforme d'avant la décision **D-3** (`docs/decisions-commanditaire.md`,
> commit `3c03b25`), qui fait du banquier l'administrateur de sa banque : il y crée les
> comptes agents, y saisit et y arbitre les dossiers. `routes/requests.js` porte désormais
> `requireRole('AGENT', 'BANQUIER')` sur la création, la modification et la soumission. Le cas
> est **réécrit sur la règle nouvelle et non supprimé** : un cas retiré serait une couverture
> perdue sans trace, et c'est le même chemin qu'il faut continuer d'éprouver — dans l'autre
> sens.
>
> Mesuré le 2026-09-23 sur l'instance du port 4000, par sondes ne produisant aucune écriture
> (corps vide : la vérification de rôle précède la validation, un **400 « Données invalides »**
> atteste donc que le rôle est admis là où un **403** l'aurait refusé) : `POST /api/requests`
> rend 400 pour l'agent, pour le banquier et pour l'administrateur — aucun des trois n'est
> plus écarté sur son rôle. La conséquence assumée par D-3 est que le banquier peut arbitrer
> un dossier qu'il a lui-même saisi : c'est l'entorse au contrôle à quatre yeux que D-1 avait
> déjà consentie à l'administrateur, étendue au profil opérationnel.

---

**CAS-HAB-02 — L'agent n'arbitre pas**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : une demande D au statut `SOUMISE` dans la banque de l'agent.
Étapes :
1. Jeton AGENT : `POST /api/requests/<D>/decision` `{"decision":"VALIDEE"}`.
2. (FRONT) Connecté en agent, ouvrir `/demandes/<D>`.
Résultat attendu : (1) HTTP 403 `{"error":"Action réservée aux profils : BANQUIER"}` · (2) la carte d'arbitrage (boutons « Valider l'affiliation », « Rejeter », champ « Commentaire ») est **absente** du DOM.
Acceptation : 403 côté API et aucun bouton de décision côté écran.

---

**CAS-HAB-03 — L'espace d'administration est fermé à l'agent, et partagé entre banquier et administrateur**
Niveau : LES DEUX · Criticité : BLOQUANT
Étapes :
1. Jeton AGENT : `GET /api/admin/users`, `GET /api/admin/banks`, `GET /api/admin/mcc`, `GET /api/admin/events`, `POST /api/admin/mcc/import`.
2. Jeton BANQUIER : `GET /api/admin/users`, `GET /api/admin/banks`, `GET /api/admin/events`.
3. (FRONT) Connecté en agent, saisir `/administration/comptes` dans la barre d'adresse.
4. (FRONT) Connecté en banquier, ouvrir `/administration/comptes`.
Résultat attendu :
- (1) les 5 appels répondent **403**, et tous **le même message** : `{"error":"Action réservée aux profils : ADMIN, BANQUIER"}`, y compris sur `/mcc` et `/mcc/import`. La garde du routeur est franchie avant celle des routes du référentiel : l'agent est écarté à la porte de l'espace d'administration, et n'apprend rien du cloisonnement qui règne derrière. Le message `{"error":"Action réservée aux profils : ADMIN"}`, lui, est servi au **banquier** (CAS-HAB-12), qui est entré.
- (2) les 3 appels répondent **200**, chacun borné à la banque de l'appelant (voir CAS-HAB-11).
- (3) redirection vers `/demandes`, aucun onglet d'administration rendu ; le lien « Administration » est absent de l'en-tête de l'agent.
- (4) l'espace s'ouvre sur **trois onglets** — « Comptes », « Banques », « Journal ». Les onglets « Référentiel MCC » et « Import du référentiel » ne sont pas rendus.
Acceptation : 5 refus pour l'agent, 3 accès pour le banquier, et l'écran suit exactement le même découpage que l'API.

> **Amendement du 2026-09-23.** La décision **D-3** ouvre l'administration au banquier, borné
> à sa banque et au seul rôle agent ; `routes/admin.js` monte `requireRole('ADMIN',
> 'BANQUIER')` sur le routeur et réserve à l'administrateur, par `reserveAAdministrateur`,
> toutes les routes `/mcc` ainsi que `POST /banks`. Le cas est réécrit plutôt que supprimé :
> il continue d'éprouver la fermeture de l'espace, désormais à deux niveaux. Messages relevés
> au caractère près le 2026-09-23 sur l'instance du port 4000 ; découpage de l'écran lu dans
> `web/src/pages/AdminLayout.jsx` (`administrateurSeul`) et `web/src/App.jsx`
> (`referentielSeul`, `peutAdministrer`).

> **Rectificatif du 2026-09-23 — point (1).** La rédaction précédente annonçait deux messages
> différents pour l'agent : `ADMIN, BANQUIER` sur `/users`, `/banks` et `/events`, et `ADMIN`
> sur `/mcc` et `/mcc/import`. **C'est faux**, et la mesure le montre : `routes/admin.js` monte
> `requireRole('ADMIN', 'BANQUIER')` sur le **routeur entier** (`adminRouter.use`), et
> `reserveAAdministrateur` n'intervient qu'ensuite, sur chaque route. L'agent est donc arrêté
> par la première garde et reçoit partout le même message. Relevé le 2026-09-23, jeton
> `agent@banque.tn`, sur les cinq routes — `/api/admin/users`, `/banks`, `/events`, `/mcc` et
> `POST /mcc/import` : **`403 {"error":"Action réservée aux profils : ADMIN, BANQUIER"}`** pour
> les cinq. L'écart n'était pas sans portée : attendre deux messages là où il n'y en a qu'un
> fait conclure au KO un comportement correct, et masque au passage que l'agent ne peut rien
> déduire de la structure interne de l'espace d'administration.

---

**CAS-HAB-04 — Cloisonnement inter-banques sur une demande**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : demande D créée par `agent@banque.tn` (BQ001).
Étapes (jeton `agent2@banque.tn`, BQ002) :
1. `GET /api/requests/<D>`
2. `GET /api/requests/<D>/events`
3. `GET /api/requests/<D>/suggestions`
4. `PUT /api/requests/<D>`
5. `GET /api/requests` (liste)
6. `POST /api/requests/<D>/submit`
7. `GET /api/requests/999999` — identifiant libre, pour comparaison.
8. (FRONT) Connecté en agent2, ouvrir `/demandes/<D>`.
Résultat attendu : (1) à (4) et (6) → HTTP **404** `{"error":"Demande <D> introuvable"}` · (5) la liste ne contient **aucune** demande dont `bankId` ≠ BQ002 · (7) même code et **même message à l'identifiant près** qu'aux points (1) à (4) : rien ne distingue le dossier d'une autre banque d'un dossier qui n'existe pas · (8) l'écran n'affiche que le bandeau d'erreur servi par l'API, aucune donnée du e-commerçant (ni raison sociale, ni RNE, ni e-mail de contact).
Acceptation : aucune donnée de BQ001 n'est lisible par BQ002 à aucun des huit points, et le refus ne renseigne pas sur l'existence du dossier.

> **Amendement du 2026-09-23.** Les points (1) à (4) attendaient **403** et le message
> `Cette demande appartient à une autre banque.` ; ils attendent désormais **404** et
> `Demande <D> introuvable`. Commit `3a7ac2e` : *« un objet appartenant à une autre banque se
> distinguait d'un objet inexistant par son code de retour, ce qui laissait dénombrer les
> dossiers et le personnel d'en face en balayant les identifiants. Les deux refus sont
> désormais identiques. »* Le cas est **réécrit, non retiré** — et il est renforcé : ce qu'il
> éprouvait (aucune donnée ne passe la cloison) reste éprouvé, et l'indiscernabilité des deux
> refus, qui est le point de l'évolution, devient un résultat attendu de plein droit, d'où les
> points (6) et (7) ajoutés.
>
> Mesuré le 2026-09-23 sur l'instance du port 4000, jeton `agent2@banque.tn` (BQ002), demande
> 1 (BQ001) — aucune de ces sondes n'écrit, le contrôle de périmètre précédant la transaction :
>
> | Appel | Réponse |
> | --- | --- |
> | `GET /api/requests/1` | `404 {"error":"Demande 1 introuvable"}` |
> | `GET /api/requests/1/events` | `404 {"error":"Demande 1 introuvable"}` |
> | `GET /api/requests/1/suggestions` | `404 {"error":"Demande 1 introuvable"}` |
> | `PUT /api/requests/1` | `404 {"error":"Demande 1 introuvable"}` |
> | `POST /api/requests/1/submit` | `404 {"error":"Demande 1 introuvable"}` |
> | `GET /api/requests` | liste vide |
> | `GET /api/requests/9999` (identifiant libre) | `404 {"error":"Demande 9999 introuvable"}` |
>
> Le message `Cette demande appartient à une autre banque.` n'est plus émis par aucune route :
> il ne doit plus être attendu nulle part dans le dossier de recette.

---

**CAS-HAB-05 — L'ADMIN cumule les droits et voit toutes les banques (divergence D6, décision métier ouverte)**
Niveau : BACK · Criticité : MAJEUR
Préconditions : une demande D1 (BQ001) et une demande D2 (BQ002).
Étapes (jeton ADMIN) :
1. `GET /api/requests` sans filtre.
2. `POST /api/requests` (corps JD-01), puis `POST /api/requests/<nouvelle>/submit`, puis `POST /api/requests/<nouvelle>/decision` `{"decision":"VALIDEE"}`.
3. `GET /api/requests/stats`.
Résultat attendu (comportement actuel) : (1) la liste contient D1 **et** D2 · (2) les trois appels aboutissent (201, 200, 200) : le même compte a saisi, soumis et validé · (3) les compteurs agrègent toutes les banques.
Acceptation : consigner le comportement ; il confirme la perte du contrôle à quatre yeux signalée dans le README. Échec seulement si la conformité a tranché l'inverse.

---

**CAS-HAB-06 — Un agent ne modifie pas la demande d'un collègue de sa banque**
Niveau : BACK · Criticité : MAJEUR
Préconditions : deux comptes AGENT `agentA` et `agentB` dans la **même** banque ; demande D au statut `BROUILLON` créée par `agentA`.
Étapes (jeton `agentB`) :
1. `GET /api/requests/<D>`.
2. `PUT /api/requests/<D>` `{"siteName":"Détournée"}`.
3. `POST /api/requests/<D>/submit`.
Résultat attendu : (1) HTTP 200 (lecture autorisée dans la banque) · (2) et (3) HTTP **403** `{"error":"Vous ne pouvez modifier que les demandes que vous avez saisies."}` ; en base `site_name` inchangé et `status = 'BROUILLON'`.
Acceptation : lecture OK, écriture refusée, base intacte.

---

**CAS-HAB-07 — Le référentiel MCC est ouvert à tous les profils authentifiés**
Niveau : LES DEUX · Criticité : MINEUR
Étapes : avec chacun des trois rôles, appeler `GET /api/mcc?search=librairie`, `GET /api/mcc/secteurs`, `GET /api/mcc/5942`, `POST /api/mcc/suggest`.
Résultat attendu : 12 réponses HTTP 200. (FRONT) le lien « Référentiel MCC » est présent dans l'en-tête pour les trois rôles.
Acceptation : aucune réponse ≠ 200.

---

**CAS-HAB-08 — Une route inexistante n'expose rien**
Niveau : BACK · Criticité : MINEUR
Étapes :
1. `GET /api/administration` avec jeton AGENT.
2. `DELETE /api/requests/1` avec jeton AGENT.
3. `GET /api/admin/users` **sans** jeton.
Résultat attendu : (1) 404 `{"error":"Route inconnue : GET /api/administration"}` · (2) 404 `{"error":"Route inconnue : DELETE /api/requests/1"}` (aucune suppression n'est implémentée) · (3) 401 `{"error":"Authentification requise"}` — jamais 403, l'absence de jeton est traitée avant le rôle.
Acceptation : les trois statuts et messages sont exacts.

---

**CAS-HAB-09 — URL forcée vers l'édition d'une demande non modifiable**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : demande D au statut `VALIDEE`, compte AGENT de la même banque, auteur de D.
Étapes :
1. Ouvrir `/demandes/<D>/modifier`.
2. Cliquer « Enregistrer le brouillon » si le bouton existe.
Résultat attendu : le bandeau « Demande AFF-…-….. au statut validee — Elle n'est plus modifiable par l'agent. » est affiché ; les boutons « Enregistrer le brouillon » et « Soumettre au banquier » sont **absents** ; seul « Voir la demande » est proposé.
Acceptation : aucun bouton d'écriture n'est rendu.

---

**CAS-HAB-10 — Un compte ADMIN n'est pas exposé comme agent dans l'écran de saisie**
Niveau : FRONT · Criticité : MINEUR
Étapes : connecté en ADMIN, ouvrir `/demandes/nouvelle`.
Résultat attendu : l'écran s'ouvre (l'écran ne s'appuie plus sur le rôle mais sur `peutSaisir`, vrai pour tout compte connecté), le lien « Nouvelle demande » est visible dans l'en-tête.
Acceptation : cohérence entre les droits serveur (CAS-HAB-05) et l'affichage ; toute divergence est un défaut d'ergonomie à consigner.

> **Amendement du 2026-09-23.** Le résultat attendu est inchangé ; seule sa justification l'est.
> `AuthContext` ne déduit plus la saisie du rôle (`isAgent`, qui englobait l'ADMIN) mais la
> nomme pour ce qu'elle permet — `peutSaisir: Boolean(user)` —, la décision D-3 l'ayant ouverte
> au banquier. Lu dans `web/src/auth/AuthContext.jsx`.

---

**CAS-HAB-11 — Le banquier n'administre que les comptes agents de sa banque (décision D-3)**
Niveau : LES DEUX · Criticité : MAJEUR
Préconditions : jeton `banquier@banque.tn` (BQ001) ; au moins un compte AGENT dans BQ001, un compte non-AGENT dans BQ001, et un compte dans BQ002.
Étapes (jeton BANQUIER) :
1. `GET /api/admin/users` → relever les banques représentées.
2. `POST /api/admin/users` avec un corps valide portant `"role":"AGENT"` et `"bankId"` d'une **autre** banque.
3. `POST /api/admin/users` avec `"role":"BANQUIER"`, puis avec `"role":"ADMIN"`.
4. `GET /api/admin/users/<id d'un compte de BQ002>`, puis `PUT` sur le même, puis `POST …/password` sur le même.
5. `GET /api/admin/users/<id d'un compte BANQUIER ou ADMIN de BQ001>`.
6. `PUT /api/admin/users/<id d'un de ses agents>` `{"role":"BANQUIER"}`, puis `{"bankId":<BQ002>}`.
7. `GET /api/admin/events` → comparer le `total` à celui que voit l'ADMIN.
8. (FRONT) Ouvrir `/administration/comptes` puis le formulaire de création de compte.
Résultat attendu :
- (1) une seule banque représentée : la sienne.
- (2) HTTP **201**, et le compte créé porte **la banque de l'appelant**, pas celle du corps : la requête ne décide pas.
- (3) HTTP **403** `{"error":"Vous ne pouvez créer que des comptes agents dans votre banque."}` dans les deux cas.
- (4) HTTP **404** `{"error":"Utilisateur <id> introuvable"}` sur les trois appels, **identique à l'identifiant près** à la réponse servie pour un compte qui n'existe pas (`GET /api/admin/users/999999`).
- (5) HTTP **403** `{"error":"Vous n’administrez que les comptes agents de votre banque."}` (apostrophe typographique comprise).
- (6) HTTP **403** `{"error":"Vous ne pouvez pas changer le rôle de ce compte."}` puis `{"error":"Vous ne pouvez pas rattacher ce compte à une autre banque."}` : ni promotion, ni sortie du périmètre.
- (7) un `total` strictement inférieur à celui de l'ADMIN : le journal est filtré sur la banque **concernée par l'action**, figée à l'écriture, et non sur la banque actuelle de son auteur.
- (8) le rôle proposé à la création est figé sur « Agent » et la banque est pré-remplie et figée.
Acceptation : le banquier obtient exactement le périmètre de sa banque et du rôle agent — ni un compte de plus, ni un rôle de plus.

> **Cas ajouté le 2026-09-23.** La décision D-3 crée une habilitation intermédiaire que le plan
> ne couvrait pas : une habilitation élargie ne se démontre pas par ce qu'elle autorise mais
> par ce qu'elle refuse encore. Points (1), (3), (4), (5), (6) et (7) mesurés le 2026-09-23 sur
> l'instance du port 4000, par des appels qui échouent **avant** toute écriture (le contrôle de
> périmètre précède la transaction) : listes bornées à BQ001, `total` du journal à 129 pour le
> banquier contre 130 pour l'administrateur, et les messages ci-dessus relevés au caractère
> près. Le point (2) est établi par `server/tests/habilitations.test.js` (*la banque du compte
> créé est celle du banquier, quoi que dise la requête*), non rejoué à la main pour ne rien
> écrire dans la base de démonstration.

> **Amendement du 2026-09-23 — points (4), (6) et (7).**
>
> **(4) 403 devient 404.** Commit `3a7ac2e` : un compte d'une autre banque répondait autrement
> qu'un compte inexistant, ce qui laissait dénombrer le personnel d'en face en balayant les
> identifiants. `services/admin.js`, `assertCibleAutorisee()` lève maintenant le même
> `notFound` dans les deux cas, et le message `Ce compte appartient à une autre banque.` n'est
> plus émis. Mesuré le 2026-09-23 sur le port 4000, jeton `banquier@banque.tn` (BQ001) sur le
> compte 3 (`agent2@banque.tn`, BQ002) :
>
> | Appel | Réponse |
> | --- | --- |
> | `GET /api/admin/users/3` | `404 {"error":"Utilisateur 3 introuvable"}` |
> | `PUT /api/admin/users/3` | `404 {"error":"Utilisateur 3 introuvable"}` |
> | `POST /api/admin/users/3/password` | `404 {"error":"Utilisateur 3 introuvable"}` |
> | `PUT /api/admin/users/9999` (identifiant libre) | `404 {"error":"Utilisateur 9999 introuvable"}` |
>
> **(6) les deux messages sont nommés**, relevés au caractère près le même jour : le refus de
> promotion et le refus de mutation sont distincts, et un cas qui n'attend qu'« un 403 » ne
> verrait pas l'un se substituer à l'autre.
>
> **(7) le critère est précisé** : `3a7ac2e` a corrigé un défaut de cloison. Le journal était
> partitionné sur la banque **actuelle de l'auteur** d'une action ; muter un compte d'une
> banque à l'autre emportait donc tout son historique dans la banque d'arrivée et le retirait à
> celle de départ, et une action d'un administrateur sur un compte échappait au journal de la
> banque concernée. La banque est désormais **figée à l'écriture** (`admin_events.bank_id`), la
> portée « plateforme » (`NULL`) étant réservée au référentiel MCC, commun à toutes les banques
> et visible du seul administrateur.
>
> **Précondition ajoutée par ce correctif** : la base de recette doit avoir été **migrée après
> `3a7ac2e`** (`npm run db:migrate`, qui ajoute `admin_events.bank_id`). Sur une base plus
> ancienne, `GET /api/admin/events` rend **500** pour le banquier — relevé tel quel le
> 2026-09-23 sur l'instance du port 4000, dont la base n'a pas été migrée depuis ce commit
> (`column e.bank_id does not exist`). Le point (7) n'a donc **pas pu être remesuré** ici ; il
> reste établi par `server/tests/habilitations.test.js`, où deux cas l'éprouvent sur une base à
> jour (voir § 3.2). Ce n'est pas un défaut du produit mais un état d'environnement, et il est
> consigné à ce titre dans `docs/journal-documentation.md`.

---

**CAS-HAB-12 — Le référentiel MCC et la création de banques restent à l'administrateur**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : jeton `banquier@banque.tn` (BQ001), jeton ADMIN.
Étapes (jeton BANQUIER) :
1. `GET /api/admin/mcc`, `GET /api/admin/mcc/5977`, `GET /api/admin/mcc/5977/history`, `GET /api/admin/mcc/export`.
2. `POST /api/admin/mcc`, `PUT /api/admin/mcc/5977`, `POST /api/admin/mcc/import`.
3. `POST /api/admin/banks` avec un corps valide.
4. `GET /api/admin/banks`.
5. `PUT /api/admin/banks/<id d'une autre banque>` `{"name":"Renommée"}`.
6. `PUT /api/admin/banks/<id de sa propre banque>` `{"active":false}`.
7. (FRONT) Saisir `/administration/referentiel` dans la barre d'adresse.
Résultat attendu :
- (1) et (2) : les 7 appels répondent **403** `{"error":"Action réservée aux profils : ADMIN"}`.
- (3) HTTP **403**, même message.
- (4) HTTP 200 avec **une seule** banque : la sienne.
- (5) HTTP **403** `{"error":"Vous ne gérez que votre propre banque."}`.
- (6) HTTP **403** `{"error":"Seul un administrateur peut activer ou désactiver une banque."}`.
- (7) redirection vers `/administration/comptes` ; l'écran du référentiel n'est jamais rendu.
Acceptation : aucun des 10 appels réservés n'aboutit, et le banquier ne peut ni se couper l'accès à sa propre banque ni toucher à celle d'un concurrent.

> **Cas ajouté le 2026-09-23.** C'est la borne la plus structurante de la décision D-3 : le
> référentiel MCC est **commun à toutes les banques**, et un banquier qui désactiverait un code
> le retirerait à ses concurrents. Les dix refus ont été mesurés le 2026-09-23 sur l'instance du
> port 4000 — aucun n'écrit quoi que ce soit, le contrôle de rôle et le contrôle de périmètre
> précédant toute transaction. Redirection de l'écran lue dans `web/src/App.jsx`
> (`referentielSeul`).

---

### 2.3 DEMANDE — saisie, validation, brouillon, reprise, formulaire en 5 étapes

---

**CAS-DEM-01 — Création nominale d'une demande**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : jeton AGENT (BQ001).
Étapes :
1. `POST /api/requests` avec le jeu **JD-01** (§4).
2. Relire `GET /api/requests/<id>`.
Résultat attendu : HTTP **201** ; `reference` de la forme `AFF-<année en cours>-00001` (5 chiffres, séquence) ; `status = "BROUILLON"` ; `bankId` = banque de l'agent ; `createdBy` = son identifiant ; `country = "Tunisie"`, `currency = "TND"`, `deliveryMode = "PHYSIQUE"` valorisés par défaut. En base, `request_events` contient une ligne `event_type = 'CREATION'` portant `payload.reference`.
Acceptation : 201, référence au bon format, statut BROUILLON, événement CREATION présent.

---

**CAS-DEM-02 — Corps vide : tous les champs obligatoires sont signalés**
Niveau : BACK · Criticité : MAJEUR
Étapes : `POST /api/requests` avec `{}`.
Résultat attendu : HTTP 400, `error = "Données invalides"`, `details` comportant **exactement 11 entrées** de message `"Champ obligatoire"` pour les champs : `siteName`, `siteUrl`, `companyName`, `rne`, `contactFirstName`, `contactLastName`, `contactEmail`, `contactPhone`, `addressLine1`, `city`, `activityDescription`.
Acceptation : les 11 champs sont présents, aucun autre.

---

**CAS-DEM-03 — Contrôle champ par champ des formats**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes : `POST /api/requests` en partant de JD-01 et en substituant, un envoi par ligne :

| Champ | Valeur envoyée | `details[].message` attendu |
| --- | --- | --- |
| `siteUrl` | `pas-une-url` | `L'adresse du site doit être une URL valide (https://...)` |
| `siteUrl` | `www.monsite.tn` | idem (le schéma est obligatoire) |
| `rne` | `AB#12` | `Le RNE doit comporter 6 à 32 caractères alphanumériques` |
| `contactEmail` | `invalide` | `Adresse e-mail invalide` |
| `contactPhone` | `12/34/56` | `Numéro de téléphone invalide` |
| `contactPhone` | `+216` | `Numéro de téléphone trop court` **et** `Numéro de téléphone invalide` |
| `activityDescription` | `cosmetiques` | `Décrivez l'activité en 20 caractères minimum : ce texte alimente la proposition de MCC` |
| `activitySector` | `SECTEUR_BIDON` | `Secteur inconnu` |
| `proposedVisaMcc` | `59` | `Un MCC est composé de 4 chiffres` |

Résultat attendu : HTTP 400 sur chaque envoi, `details[].champ` égal au champ substitué et message strictement égal à la colonne de droite. Aucune demande créée (`SELECT count(*) FROM affiliation_requests` inchangé).
Acceptation : 9 réponses conformes, table inchangée.

---

**CAS-DEM-04 — Les erreurs de champ s'affichent sous le bon libellé**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : connecté en AGENT sur `/demandes/nouvelle`.
Étapes :
1. Étape 1 : saisir `Nom du site = Beldi`, `Adresse du site = pas-une-url`, `Raison sociale = BELDI`, `RNE = AB#12`.
2. Étape 3 : saisir `Description de l'activité = court`.
3. Cliquer « Enregistrer le brouillon ».
Résultat attendu : un bandeau rouge (`role="alert"`) affiche `Données invalides` suivi d'une liste : `Adresse du site : L'adresse du site doit être une URL valide (https://...)`, `RNE : Le RNE doit comporter 6 à 32 caractères alphanumériques`, `Description de l'activité : Décrivez l'activité en 20 caractères minimum…`. Le bandeau est amené dans le champ de vision (`scrollIntoView`) et reçoit le focus. Le champ « Adresse du site » de l'étape 1 porte la classe `champ--erreur` et le message sous l'intitulé.
Acceptation : libellés métier (pas les noms techniques) et bandeau focalisé.

---

**CAS-DEM-05 — Brouillon : prise d'URL et absence de doublon**
Niveau : FRONT · Criticité : BLOQUANT
Préconditions : connecté en AGENT sur `/demandes/nouvelle`, formulaire rempli avec JD-01.
Étapes :
1. Cliquer « Enregistrer le brouillon ».
2. Relever l'URL du navigateur.
3. Cliquer une seconde fois « Enregistrer le brouillon ».
4. `GET /api/requests?search=<raison sociale JD-01>`.
Résultat attendu : (2) l'URL est devenue `/demandes/<id>/modifier` (remplacement d'historique) · un bandeau vert affiche `Demande AFF-…-….. enregistrée en brouillon.` · (4) la liste contient **une seule** demande pour ce RNE.
Acceptation : un seul enregistrement en base après deux clics.

---

**CAS-DEM-06 — Reprise d'un brouillon après rechargement**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : brouillon enregistré via CAS-DEM-05.
Étapes :
1. Recharger la page (F5) sur `/demandes/<id>/modifier`.
2. Parcourir les 5 étapes.
Résultat attendu : tous les champs saisis sont restitués (site, société, contact, adresse, activité, MCC retenus, justification) ; la date de création est affichée au format `AAAA-MM-JJ` dans le champ date ; les cases à cocher conservent leur état ; le bouton « Soumettre au banquier » est présent à l'étape 5.
Acceptation : aucune valeur perdue, aucune valeur `null` affichée comme `null`.

---

**CAS-DEM-07 — Mise à jour partielle : un champ absent n'écrase rien**
Niveau : BACK · Criticité : MAJEUR
Préconditions : demande D au statut BROUILLON contenant `taxId`, `postalCode`, `proposedJustification` renseignés.
Étapes :
1. `PUT /api/requests/<D>` avec `{"siteName":"Beldi Cosmetics v2"}`.
2. Relire `GET /api/requests/<D>`.
Résultat attendu : HTTP 200 ; `siteName` modifié ; `taxId`, `postalCode`, `proposedJustification` **inchangés** (non remis à `null`). Un événement `MODIFICATION` est ajouté avec `payload.champs = ["siteName"]` **et** `payload.modifications = {"siteName":{"avant":"<ancienne valeur>","apres":"Beldi Cosmetics v2"}}`.
Acceptation : un seul champ modifié, journal conforme, **valeur d'avant et valeur d'après toutes deux présentes**.

> **Amendement du 2026-09-23.** Le résultat attendu s'enrichit de `payload.modifications`.
> Commit `3a7ac2e` : *« les modifications de dossier n'étaient tracées que par noms de champs.
> Puisque la saisie et l'arbitrage peuvent être le fait d'une même personne, la trace est le
> seul contrôle qui subsiste : savoir qu'un RIB a changé sans savoir en quoi ne permet de
> rendre compte de rien. »* C'est la contrepartie directe des décisions **D-1** et **D-3** :
> la plateforme n'empêche plus le cumul, donc le journal doit permettre d'en rendre compte.
> `requests.js`, `tracerModification()`. Trois points à éprouver, ajoutés au cas :
>
> - `payload.champs` est **conservé** (l'écran et les rapports s'en servent) et ne liste que
>   les champs dont la valeur a **réellement** changé : réécrire un champ à l'identique ne le
>   fait pas entrer dans la trace ;
> - le champ `rib` y figure **masqué**, quatre derniers caractères apparents
>   (`••••••••1234`), avant comme après : établir qu'un relevé a changé n'oblige pas à en
>   conserver une seconde copie en clair dans le journal ;
> - un `PUT` qui ne change rien ne crée toujours aucun événement (CAS-DEM-09).

---

**CAS-DEM-08 — Chaîne vide contre `null` sur les champs optionnels**
Niveau : BACK · Criticité : MINEUR
Étapes : `PUT /api/requests/<D>` avec `{"taxId":"","postalCode":"","companyCreatedOn":"","activitySector":"","proposedVisaMcc":""}`.
Résultat attendu : HTTP 200 ; en base les cinq colonnes valent `NULL` (et non la chaîne vide) ; `GET` renvoie `null` pour chacune.
Acceptation : 5 colonnes à `NULL`, aucune erreur 500.

---

**CAS-DEM-09 — `PUT` sans aucun champ connu**
Niveau : BACK · Criticité : MINEUR
Étapes : `PUT /api/requests/<D>` avec `{}` puis avec `{"champInconnu":"x"}`.
Résultat attendu : HTTP 200 dans les deux cas, demande renvoyée **inchangée** ; aucun événement `MODIFICATION` créé pour le premier appel (`sets.length === 0` : sortie anticipée) — vérifier `SELECT count(*) FROM request_events WHERE request_id = <D> AND event_type='MODIFICATION'` stable.
Acceptation : 200, aucune écriture, aucun événement parasite.

---

**CAS-DEM-10 — Navigation entre les 5 étapes**
Niveau : FRONT · Criticité : MAJEUR
Étapes :
1. Sur `/demandes/nouvelle`, relever les 5 onglets d'étape.
2. Cliquer « Suivant » quatre fois, puis « Précédent » quatre fois.
3. Cliquer directement sur l'onglet « 4. Codes MCC ».
Résultat attendu : les libellés d'étape sont, dans l'ordre : `1. Site et société`, `2. Contact et adresse`, `3. Activité`, `4. Codes MCC`, `5. Récapitulatif`. L'onglet actif porte la classe `etape--active`, les étapes franchies `etape--faite`. Les valeurs saisies sont conservées d'une étape à l'autre. L'accès direct à l'étape 4 est possible sans avoir complété les précédentes (navigation libre, contrôle au serveur).
Acceptation : 5 libellés exacts, aucune perte de saisie, navigation libre.

---

**CAS-DEM-11 — Récapitulatif : éléments manquants signalés avant soumission**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : brouillon complet sauf les deux MCC.
Étapes : aller à l'étape 5.
Résultat attendu : bandeau « Éléments manquants » avec le texte `La soumission exige : MCC Visa et MCC Mastercard.` ; les lignes `MCC Visa proposé` et `MCC Mastercard proposé` du récapitulatif affichent `—`.
Acceptation : le bandeau et les deux tirets sont présents.

---

**CAS-DEM-12 — Récapitulatif : un code choisi par recherche manuelle est décrit**
Niveau : FRONT · Criticité : MINEUR
Préconditions : à l'étape 4, ne pas cliquer sur une proposition du moteur ; rechercher `5942` dans « Rechercher un autre code dans le référentiel » et le sélectionner pour les deux réseaux.
Étapes : passer à l'étape 5.
Résultat attendu : la carte du code 5942 est affichée dans « Codes retenus » avec son libellé français et sa description (relecture via `GET /api/mcc/5942`), pas seulement le nombre `5942`.
Acceptation : libellé et description visibles.

---

**CAS-DEM-13 — Compteurs de caractères et plafonds de saisie**
Niveau : FRONT · Criticité : MINEUR
Étapes :
1. Étape 3, saisir 25 caractères dans « Description de l'activité ».
2. Coller 2 500 caractères dans le même champ.
3. Coller 1 200 caractères dans « Types de produits ou services vendus ».
Résultat attendu : (1) l'aide affiche `25 / 2000 caractères (20 minimum)` · (2) le champ s'arrête à 2 000 caractères (`maxLength`) et l'aide affiche `2000 / 2000` · (3) le champ s'arrête à 1 000 caractères.
Acceptation : aucun envoi au serveur ne dépasse les plafonds.

---

**CAS-DEM-14 — Sélection d'un MCC par réseau**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : étape 4, propositions affichées (jeu JD-01).
Étapes :
1. Sélecteur « Visa » actif : cliquer la carte `5977`.
2. Basculer sur « Mastercard » : cliquer la carte `5912`.
3. Basculer sur « Les deux réseaux » : cliquer la carte `5999`.
4. Sélecteur « Visa » : recliquer la carte `5999`.
Résultat attendu : (1) champ « MCC Visa retenu » = `5977`, Mastercard vide · (2) Mastercard = `5912`, Visa toujours `5977` · (3) les deux champs = `5999` · (4) le champ Visa se vide (second clic = désélection), Mastercard reste `5999`. Les deux champs sont en lecture seule (`readOnly`) : aucune saisie clavier directe possible.
Acceptation : les quatre états sont exacts.

---

### 2.4 WORKFLOW — transitions, refus, concurrence

Matrice de référence (déduite de `services/requests.js`) :

| Statut de départ | `PUT` (agent **ou banquier**) | `submit` (agent **ou banquier**) | `decision` (banquier) |
| --- | --- | --- | --- |
| BROUILLON | 200 | 200 → SOUMISE | 409 |
| SOUMISE | 409 | 409 | 200 → VALIDEE / REJETEE / COMPLEMENT_REQUIS |
| COMPLEMENT_REQUIS | 200 | 200 → SOUMISE | 409 |
| VALIDEE | 409 | 409 | 409 |
| REJETEE | 409 | 409 | 409 |

> **Amendement du 2026-09-23 — en-têtes des deux premières colonnes.** La matrice était lue
> « `PUT` et `submit` sont l'affaire de l'agent ». Depuis la décision **D-3**,
> `routes/requests.js` porte `requireRole('AGENT', 'BANQUIER')` sur ces deux routes : le
> banquier saisit, modifie et soumet les dossiers de sa banque, et l'administrateur le peut
> partout (D-1). **Les codes de retour, eux, sont inchangés** — ils dépendent du statut, pas
> du profil : la matrice reste valable telle quelle, seule la lecture de ses colonnes change.
> Deux nuances à garder à l'esprit en la rejouant :
>
> - la colonne `PUT` sur BROUILLON et COMPLEMENT_REQUIS vaut 200 **pour l'auteur du dossier** ;
>   un agent sur le dossier d'un collègue reçoit 403 (CAS-HAB-06), un banquier sur le dossier
>   d'un de ses agents reçoit 200 (CAS-HAB-01, point 5) ;
> - hors de la banque, les trois colonnes ne rendent plus 403 mais **404** (CAS-HAB-04).

---

**CAS-WF-01 — Soumission nominale**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : demande D au statut BROUILLON, `proposedVisaMcc = 5977`, `proposedMastercardMcc = 5977`.
Étapes : `POST /api/requests/<D>/submit` (jeton AGENT auteur).
Résultat attendu : HTTP 200, `status = "SOUMISE"`, `submittedAt` non nul, `decidedAt`/`decidedBy`/`decisionComment` à `null`. Un événement `SOUMISSION` est créé avec `payload.visa = "5977"`, `payload.mastercard = "5977"` et `payload.suggestions` (liste de codes). La table `mcc_suggestions` contient des lignes pour `network='VISA'` **et** `network='MASTERCARD'`.
Acceptation : statut, horodatage, événement et photographie présents.

---

**CAS-WF-02 — Soumission refusée sans les deux MCC**
Niveau : LES DEUX · Criticité : BLOQUANT
Étapes :
1. Demande BROUILLON sans aucun MCC → `submit`.
2. Demande BROUILLON avec `proposedVisaMcc` seul → `submit`.
Résultat attendu : HTTP **400** dans les deux cas, `{"error":"Un MCC Visa et un MCC Mastercard doivent être proposés avant la soumission."}` ; statut inchangé (`BROUILLON`) en base. (FRONT) le clic sur « Soumettre au banquier » ramène à l'étape 5 et affiche le message dans le bandeau rouge.
Acceptation : 400, statut inchangé, message exact.

---

**CAS-WF-03 — Une demande soumise n'est plus modifiable**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : demande D au statut SOUMISE.
Étapes :
1. `PUT /api/requests/<D>` `{"siteName":"Tentative"}`.
2. `POST /api/requests/<D>/submit`.
Résultat attendu : HTTP **409** dans les deux cas, `{"error":"Une demande au statut SOUMISE n'est plus modifiable par l'agent."}` ; `site_name` inchangé en base.
Acceptation : deux 409 avec le message exact, base intacte.

---

**CAS-WF-04 — Validation sans modification des codes**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : demande D SOUMISE avec `proposedVisaMcc = proposedMastercardMcc = 5977`.
Étapes : `POST /api/requests/<D>/decision` `{"decision":"VALIDEE"}` (jeton BANQUIER, sans `visaMcc` ni `mastercardMcc`).
Résultat attendu : HTTP 200, `status = "VALIDEE"`, `finalVisaMcc = "5977"`, `finalMastercardMcc = "5977"` (repris des propositions), `decidedBy` = identifiant du banquier, `decidedAt` renseigné. Événement de type **`VALIDATION`** (et non `VALIDATION_AVEC_MODIFICATION`) avec `payload.proposes` et `payload.retenus` identiques.
Acceptation : statut, codes finaux et type d'événement conformes.

---

**CAS-WF-05 — Validation avec substitution réseau par réseau**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : demande D SOUMISE avec `5977` pour les deux réseaux.
Étapes : `POST /api/requests/<D>/decision` `{"decision":"VALIDEE","visaMcc":"5912","mastercardMcc":"5999"}`.
Résultat attendu : HTTP 200 ; `finalVisaMcc = "5912"`, `finalMastercardMcc = "5999"` ; `proposedVisaMcc`/`proposedMastercardMcc` **inchangés** à `5977` ; événement de type `VALIDATION_AVEC_MODIFICATION` avec `payload.proposes = {visa:"5977",mastercard:"5977"}` et `payload.retenus = {visa:"5912",mastercard:"5999"}`. (FRONT) le détail affiche côte à côte le code proposé par l'agent et le code retenu.
Acceptation : les deux codes diffèrent par réseau, le proposé reste visible, l'événement porte le bon type.

---

**CAS-WF-06 — Rejet et demande de complément : commentaire obligatoire**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : demande D SOUMISE.
Étapes :
1. `POST /api/requests/<D>/decision` `{"decision":"REJETEE"}`.
2. Idem avec `{"decision":"REJETEE","comment":""}`.
3. Idem avec `{"decision":"COMPLEMENT_REQUIS"}`.
4. `{"decision":"REJETEE","comment":"Activité non éligible : vente de produits réglementés."}`.
Résultat attendu : (1)(2)(3) HTTP **400** `{"error":"Un commentaire est obligatoire pour un rejet ou une demande de complément."}` — noter que la chaîne vide est normalisée en `null` et refusée · (4) HTTP 200, `status = "REJETEE"`, `decisionComment` = le texte, `finalVisaMcc` et `finalMastercardMcc` à **`null`** (aucun code retenu sur un rejet).
Acceptation : trois 400 puis un 200 avec codes finaux nuls.

---

**CAS-WF-07 — Validation impossible sans code retenu**
Niveau : BACK · Criticité : MAJEUR
Préconditions : demande D au statut SOUMISE dont les deux propositions ont été vidées directement en base (`UPDATE affiliation_requests SET proposed_visa_mcc = NULL, proposed_mastercard_mcc = NULL WHERE id = <D>`), pour simuler une donnée dégradée.
Étapes : `POST /api/requests/<D>/decision` `{"decision":"VALIDEE"}`.
Résultat attendu : HTTP 400 `{"error":"La validation exige un MCC Visa et un MCC Mastercard."}` ; statut inchangé.
Acceptation : 400, message exact, statut SOUMISE conservé.

---

**CAS-WF-08 — Cycle complément requis → correction → re-soumission**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : demande D SOUMISE.
Étapes :
1. Banquier : `decision` `{"decision":"COMPLEMENT_REQUIS","comment":"Merci de préciser les produits vendus."}`.
2. Agent : `GET /api/requests/<D>` puis `PUT /api/requests/<D>` `{"productTypes":"Crèmes, huiles d'argan, savons"}`.
3. Agent : `POST /api/requests/<D>/submit`.
4. Banquier : `decision` `{"decision":"VALIDEE"}`.
Résultat attendu :
- (1) 200, `status = "COMPLEMENT_REQUIS"`, `decisionComment` renseigné, `finalVisaMcc = null`.
- (2) 200 (la demande est redevenue modifiable).
- (3) 200, `status = "SOUMISE"` et **`decisionComment`, `decidedAt`, `decidedBy` remis à `null`** (une demande en attente ne doit pas afficher de décideur).
- (4) 200, `status = "VALIDEE"`.
- Le journal (`GET /api/requests/<D>/events`) contient dans l'ordre : `CREATION`, `SOUMISSION`, `COMPLEMENT_REQUIS`, `MODIFICATION`, `SOUMISSION`, `VALIDATION`.
Acceptation : les 4 statuts et la séquence d'événements sont exacts.

---

**CAS-WF-09 — Une demande rejetée est terminale**
Niveau : LES DEUX · Criticité : MAJEUR
Préconditions : demande D au statut REJETEE.
Étapes :
1. Agent : `PUT /api/requests/<D>` `{"siteName":"Reprise"}`.
2. Agent : `POST /api/requests/<D>/submit`.
3. Banquier : `POST /api/requests/<D>/decision` `{"decision":"VALIDEE"}`.
Résultat attendu : (1)(2) HTTP 409 `Une demande au statut REJETEE n'est plus modifiable par l'agent.` · (3) HTTP 409 `Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : REJETEE).` · (FRONT) aucune action d'écriture n'est proposée sur l'écran de détail.
Acceptation : trois 409 avec les messages exacts.

---

**CAS-WF-10 — Une demande validée est terminale**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes : mêmes trois appels que CAS-WF-09 sur une demande VALIDEE.
Résultat attendu : (1)(2) 409 `Une demande au statut VALIDEE n'est plus modifiable par l'agent.` · (3) 409 `Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : VALIDEE).` ; `final_visa_mcc` et `final_mastercard_mcc` inchangés en base.
Acceptation : trois 409, codes finaux intacts.

---

**CAS-WF-11 — Arbitrage d'un brouillon refusé**
Niveau : BACK · Criticité : MAJEUR
Étapes : banquier, `POST /api/requests/<D BROUILLON>/decision` `{"decision":"VALIDEE"}`.
Résultat attendu : HTTP 409 `{"error":"Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : BROUILLON)."}` ; aucune ligne modifiée.
Acceptation : 409, message exact.

---

**CAS-WF-12 — Concurrence : deux soumissions simultanées**
Niveau : BACK · Criticité : BLOQUANT
Préconditions : demande D au statut BROUILLON avec ses deux MCC.
Étapes : lancer **en parallèle** (`Promise.all`, sans attente entre les deux) deux `POST /api/requests/<D>/submit` avec le même jeton.
Résultat attendu : exactement une réponse **200** et une réponse **409** `{"error":"Cette demande vient d’être soumise par ailleurs."}` (apostrophe typographique). En base : un seul `submitted_at`, et `SELECT count(*) FROM request_events WHERE request_id=<D> AND event_type='SOUMISSION'` = **1**. `mcc_suggestions` ne contient pas de doublon de `(request_id, network, rank)`.
Acceptation : 1 succès, 1 conflit, un seul événement de soumission.

---

**CAS-WF-13 — Concurrence : deux décisions contradictoires simultanées**
Niveau : BACK · Criticité : BLOQUANT
Préconditions : demande D au statut SOUMISE ; deux jetons BANQUIER (ou le même).
Étapes : lancer en parallèle `decision {"decision":"VALIDEE"}` et `decision {"decision":"REJETEE","comment":"Non éligible"}`.
Résultat attendu : une réponse 200 et une réponse **409** `{"error":"Cette demande vient d’être arbitrée par ailleurs."}`. En base, `status` vaut soit `VALIDEE` soit `REJETEE` (jamais les deux traces) ; `SELECT count(*) FROM request_events WHERE request_id=<D> AND event_type IN ('VALIDATION','VALIDATION_AVEC_MODIFICATION','REJETEE','COMPLEMENT_REQUIS')` = **1**.
Acceptation : un seul arbitrage aboutit et un seul événement de décision est journalisé.

---

**CAS-WF-14 — Photographie des propositions figée à la soumission**
Niveau : LES DEUX · Criticité : MAJEUR
Préconditions : demande D SOUMISE (jeu JD-01).
Étapes :
1. `GET /api/requests/<D>/suggestions` — relever la liste VISA.
2. ADMIN : modifier le libellé et les mots-clés du premier code proposé (`PUT /api/admin/mcc/<code>`), de façon à changer son classement.
3. Rejouer `GET /api/requests/<D>/suggestions`.
4. Re-soumettre une **autre** demande créée après l'étape 2 et comparer.
Résultat attendu : (1) et (3) renvoient les **mêmes codes, mêmes rangs, mêmes scores et mêmes `matchedTerms`** : la photographie ne bouge pas après une modification du référentiel. Les libellés/descriptions affichés, eux, proviennent du catalogue courant (`getMcc`) et peuvent avoir changé. (4) la nouvelle demande reflète le nouveau classement.
Acceptation : rangs et scores identiques entre (1) et (3).

---

**CAS-WF-15 — Re-soumission : la photographie précédente est remplacée, pas cumulée**
Niveau : BACK · Criticité : MAJEUR
Préconditions : demande D ayant déjà fait un aller-retour `SOUMISE → COMPLEMENT_REQUIS`.
Étapes :
1. Modifier la description d'activité pour un autre secteur (passer de JD-01 à l'activité de JD-03).
2. Re-soumettre.
3. `SELECT network, count(*) FROM mcc_suggestions WHERE request_id=<D> GROUP BY network`.
Résultat attendu : au plus `SUGGESTION_LIMIT` (6 par défaut) lignes par réseau, soit 12 au total ; les codes correspondent à la **nouvelle** description, pas à l'ancienne.
Acceptation : 6 lignes VISA, 6 lignes MASTERCARD, contenu renouvelé.

---

### 2.5 MCC — moteur de proposition, codes interdits, recherche manuelle

> Tous les résultats chiffrés de cette section ont été relevés sur le référentiel d'amorçage (279 codes) avec `SUGGESTION_LIMIT = 6`. Ils sont reproductibles à l'identique tant que le référentiel n'a pas été modifié (voir §4).

---

**CAS-MCC-01 — Proposition nominale, classée et explicitée**
Niveau : LES DEUX · Criticité : BLOQUANT
Étapes : `POST /api/mcc/suggest` avec le profil **JD-01** (secteur `BEAUTE_COSMETIQUE`, livraison `PHYSIQUE`).
Résultat attendu : HTTP 200 ; `VISA` contient **5 éléments** ; les codes dans l'ordre exact `5977, 7230, 7298, 5912, 5999` avec les scores `74, 66, 63, 57, 50`. Chaque élément porte `label`, `description` (français, non vide), `descriptionEn`, `score`, `rawScore` et `matchedTerms` — **tableau non vide pour chacun des cinq**, celui de `5977` contenant notamment `secteur : Beauté, cosmétique et parfumerie`.
Acceptation : ordre, scores, nombre de propositions et présence des 6 attributs conformes ; aucune proposition sans terme justificatif.

> **Amendement du 2026-09-23.** La rédaction initiale attendait six propositions, la sixième
> étant `5960` au score `31` avec des `matchedTerms` vides. L'invariant « aucune proposition
> sans terme justificatif » l'a fait disparaître, et avec elle toute la queue de classement à
> `31` : le plafond `limit = 6` n'est pas une consigne de remplissage. Valeurs remesurées le
> 2026-09-23 ; voir le § 4.3 et `docs/non-regression-lot1.md` § 3.1.

---

**CAS-MCC-02 — Parité Visa / Mastercard**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes : même appel que CAS-MCC-01.
Résultat attendu : `VISA` et `MASTERCARD` contiennent les **mêmes codes dans le même ordre avec les mêmes scores**, mais sont deux tableaux distincts (modifier l'un ne modifie pas l'autre). (FRONT) l'étape 4 affiche le message `Les codes sont identiques pour Visa et Mastercard (norme ISO 18245) mais restent modifiables réseau par réseau.`
Acceptation : `JSON.stringify(VISA) === JSON.stringify(MASTERCARD)` et message présent à l'écran.

---

**CAS-MCC-03 — Effet du secteur déclaré**
Niveau : BACK · Criticité : MAJEUR
Étapes :
1. `POST /api/mcc/suggest` avec la description JD-01 **sans** `activitySector`.
2. Le même appel **avec** `activitySector = "BEAUTE_COSMETIQUE"`.
Résultat attendu : (1) ordre `5977, 5999` — **2 propositions** —, score de `5977` = **54** · (2) ordre `5977, 7230, 7298, 5912, 5999` — **5 propositions** —, score de `5977` = **74** et `matchedTerms` contient `secteur : Beauté, cosmétique et parfumerie`. Les codes `7230`, `7298`, `5912` n'apparaissent que dans le second appel.
Acceptation : les deux ordres, les deux longueurs et les deux scores sont exacts.

> **Amendement du 2026-09-23.** Les deux listes ont perdu leur queue de codes de vente à
> distance (`5960, 5962, 5964, 5965`), proposés au score `31` sans aucun terme justificatif.
> Le contraste que le cas met à l'épreuve — le secteur déclaré fait entrer `7230`, `7298` et
> `5912` et porte `5977` de 54 à 74 — est intact. Valeurs remesurées le 2026-09-23 ; voir le
> § 4.3.

---

**CAS-MCC-04 — Effet du mode de livraison numérique**
Niveau : BACK · Criticité : MAJEUR
Étapes : `POST /api/mcc/suggest` avec le profil **JD-04** (`deliveryMode = "NUMERIQUE"`, `hasSubscription = true`, secteur `INFORMATIQUE_LOGICIEL`).
Résultat attendu : HTTP 200 ; ordre exact `5734, 5817, 4816, 7372, 4899, 5815` avec les scores `78, 75, 73, 73, 67, 61` ; les `matchedTerms` des codes `5734, 5817, 4816, 7372` contiennent `livraison numérique`, et ceux de `5817`, `4816`, `4899` contiennent `vente par abonnement`.
Acceptation : ordre, scores et marqueurs conformes.

---

**CAS-MCC-05 — Place de marché**
Niveau : BACK · Criticité : MAJEUR
Étapes :
1. Profil **JD-06** avec `isMarketplace = true`.
2. Le même profil avec `isMarketplace = false`.
Résultat attendu : (1) le code `5262` est en **rang 1** avec le score **90** et `matchedTerms` contenant `place de marché` · (2) le score de `5262` baisse d'au moins 5 points ; sur un descriptif qui ne décrit pas une place de marché, `5262` disparaît des propositions.
Acceptation : 5262 premier avec 90 % en (1) ; en (2), score en baisse sur JD-06 et absence du classement sur un descriptif neutre.

> **Amendement du 2026-09-22.** La formulation initiale exigeait que `5262` soit
> « déclassé » en (2). Le critère était mal posé : le descriptif de JD-06 dit
> littéralement « Place de marche generaliste regroupant des vendeurs tiers » et le
> secteur déclaré est `MARKETPLACE`. Le jeu de données contredit son propre drapeau, et
> aucune pénalité raisonnable ne peut effacer un texte aussi explicite — une pénalité
> qui y parviendrait masquerait au banquier le code le plus pertinent sur la foi d'une
> case à cocher. Mesure faite : `5262` passe de 90 % (brut 188,5) à 84 % (brut 118,5),
> la case coûte donc bien ses 25 points ; sur le même profil avec un descriptif neutre,
> `5262` **disparaît des cinq premières propositions**. Le drapeau agit ; il n'est
> simplement pas souverain. Invariant couvert par deux cas dans
> `server/tests/vague3.test.js`.

---

**CAS-MCC-06 — Aucun MCC interdit n'est proposé**
Niveau : LES DEUX · Criticité : BLOQUANT
Étapes :
1. `POST /api/mcc/suggest` `{"activityDescription":"Site de paris sportifs et de jeux de casino en ligne avec mises et gains","limit":20}`.
2. Idem avec `"Plateforme d'échange de crypto-actifs et de devises numériques"`.
3. Idem avec `"Vente d'armes de chasse, munitions et accessoires de tir"`.
Résultat attendu : dans les trois réponses, aucun élément de `VISA` ni de `MASTERCARD` n'a `riskLevel = "INTERDIT"` ; en particulier les codes `7995`, `6051`, `5723`, `5967`, `7800`, `7801`, `7802`, `9406`, `9702`, `9950`, `6010`, `6011` sont absents.
Acceptation : zéro code interdit dans 120 propositions (3 × 20 × 2).

---

**CAS-MCC-07 — Un MCC interdit est refusé par l'API, pas seulement masqué**
Niveau : LES DEUX · Criticité : BLOQUANT
Étapes :
1. `POST /api/requests` (JD-01) avec `proposedVisaMcc = "7995"`.
2. `PUT /api/requests/<D brouillon>` avec `proposedMastercardMcc = "5967"`.
3. `POST /api/requests/<D SOUMISE>/decision` `{"decision":"VALIDEE","visaMcc":"7995"}`.
Résultat attendu : HTTP **400** aux trois appels, message de la forme `Le MCC 7995 (Paris, loteries et jeux de hasard) n'est pas éligible à l'affiliation ClickToPay.` ; si le code porte une note, elle est reprise dans `details[0].message`. Aucune demande créée ni modifiée.
Acceptation : trois 400 avec le libellé du code dans le message.

---

**CAS-MCC-08 — Un MCC désactivé n'est plus sélectionnable ni consultable**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : ADMIN désactive le code `5942` (`PUT /api/admin/mcc/5942` `{"active":false,"comment":"Recette"}`).
Étapes :
1. `GET /api/mcc/5942` (jeton AGENT).
2. `GET /api/mcc?search=5942&eligibleOnly=true`.
3. `POST /api/mcc/suggest` avec la description JD-03 (librairie).
4. `POST /api/requests` (JD-03) avec `proposedVisaMcc = "5942"`.
5. `GET /api/admin/mcc/5942` (jeton ADMIN).
Résultat attendu : (1) HTTP 404 `{"error":"MCC 5942 introuvable"}` · (2) `items` ne contient pas `5942` · (3) `5942` absent des deux listes · (4) HTTP 400 `Le MCC 5942 (Librairies) a été désactivé dans le référentiel.` · (5) HTTP 200 : l'administrateur continue de voir le code, avec `active = false`. Aucune ligne supprimée (`SELECT count(*) FROM mcc_codes WHERE code='5942'` = 1).
Acceptation : les 5 points sont vrais ; le code existe toujours en base.

---

**CAS-MCC-09 — Un code interdit reste consultable en recherche manuelle**
Niveau : BACK · Criticité : MINEUR
Étapes :
1. `GET /api/mcc?search=7995` (sans `eligibleOnly`).
2. `GET /api/mcc?search=7995&eligibleOnly=true`.
3. `GET /api/mcc/7995`.
Résultat attendu : (1) `items` contient `7995` avec `riskLevel = "INTERDIT"` · (2) `items` **ne contient pas** `7995` · (3) HTTP 200 (le code est actif, seulement non éligible). (FRONT) la recherche du formulaire appelle `eligibleOnly=true` : `7995` n'est jamais cliquable à l'étape 4.
Acceptation : les trois comportements sont distincts et conformes.

---

**CAS-MCC-10 — Recherche plein texte : classement et bornes**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `GET /api/mcc?search=5942`.
2. `GET /api/mcc?search=librairie`.
3. `GET /api/mcc?search=` (vide) `&limit=5`.
4. `GET /api/mcc?search=librairie&limit=0` puis `&limit=-3` puis `&limit=9999`.
5. `GET /api/mcc?search=zzzzzzzz`.
Résultat attendu : (1) `5942` en première position (code exact, poids 0) · (2) les codes dont le libellé **commence** par « librairie » précèdent les autres correspondances · (3) `items.length = 5`, `total` = nombre de codes actifs (279 sur un référentiel intact) · (4) aucune erreur : la limite est ramenée dans `[1, 300]`, `items.length` ≤ 300 et ≥ 1 · (5) HTTP 200, `count = 0`, `items = []`.
Acceptation : aucune réponse ≠ 200, classement et bornes conformes.

---

**CAS-MCC-11 — Le repli sur 5999 est servi, et il s'annonce (divergence D4 close)**
Niveau : BACK · Criticité : MINEUR
Étapes : `POST /api/mcc/suggest` `{"activityDescription":"zzzz qqqq wwww xxxx yyyy kkkk jjjj hhhh gggg ffff"}`.
Résultat attendu : HTTP 200, **une seule** proposition par réseau : `{code: "5999", score: 10, matchedTerms: ["aucune correspondance : code de repli"]}`. Aucun code de vente à distance (`5960, 5962, 5964, 5965, 5968, 5969`) n'est servi, faute de terme justificatif.
Acceptation : la liste contient l'entrée de repli `5999` **et elle seule**, avec son terme d'annonce. Toute proposition servie avec un `matchedTerms` vide est un échec : c'est l'explicabilité, promesse centrale du produit, qui tombe avec elle.

> **Amendement du 2026-09-23.** Le cas éprouvait la divergence D4 — la branche de repli était
> réputée inatteignable, les six MCC de `REMOTE_SALE_MCCS` recevant `+2` inconditionnels qui
> rendaient `rawScore > 0` toujours vrai. Le filtre `matchedTerms.length > 0` posé lors des
> corrections de la vague 3 les écarte désormais, et le filet de sécurité joue réellement :
> **D4 est close**. Le cas est réécrit sur la règle nouvelle plutôt que retiré — c'est le même
> invariant qu'il surveille, dans l'autre sens. Mesuré le 2026-09-23 sur un référentiel
> intact ; couvert par `server/tests/vague3.test.js` (*un descriptif sans correspondance ne
> renvoie que le code de repli*) et `robustesse.test.js` (DEF-A3-03).

---

**CAS-MCC-12 — Bornes du score de confiance**
Niveau : BACK · Criticité : MAJEUR
Étapes : rejouer les 6 profils JD-01 à JD-06 avec `limit = 20` et collecter tous les scores.
Résultat attendu : tout score est un entier de l'intervalle **[1, 99]** ; **aucun score n'est égal à 100 ni à 0** ; les scores sont décroissants dans chaque liste ; à score égal, l'ordre est celui de `rawScore` décroissant puis du code croissant.
Acceptation : aucune valeur hors bornes, tri strictement conforme sur les 240 éléments.

---

**CAS-MCC-13 — Paramètre `limit` du moteur**
Niveau : BACK · Criticité : MINEUR
Étapes : `POST /api/mcc/suggest` (profil JD-01) avec successivement `limit` = `1`, `20`, `21`, `0`, `"trois"`.
Résultat attendu : `1` → 1 proposition · `20` → 20 propositions · `21` → HTTP 400 `details[0].champ = "limit"` · `0` → HTTP 400 · `"trois"` → HTTP 400. Aucun 500.
Acceptation : 2 succès, 3 réponses 400, aucun 500.

---

**CAS-MCC-14 — Restitution d'une proposition à l'écran**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : agent à l'étape 4 avec le profil JD-01.
Résultat attendu : chaque carte affiche — dans cet ordre — le code sur 4 chiffres, le libellé français, la description française, la ligne `Définition Visa : <labelEn> — <descriptionEn>`, puis `Pertinence NN %` et les jetons de `matchedTerms`. Un code `SENSIBLE` porte en plus le jeton **« Vigilance renforcée »** ; un code `INTERDIT` le jeton **« Non éligible »** (jamais présent dans les propositions du moteur). Le score < 40 s'affiche avec la classe `mcc__score--faible`, entre 40 et 64 `mcc__score--moyen`.
Acceptation : les 6 blocs d'information sont présents sur chaque carte.

---

**CAS-MCC-15 — Cohérence catalogue / suggestion après désactivation en cours de session**
Niveau : BACK · Criticité : MAJEUR
Étapes :
1. `POST /api/mcc/suggest` (JD-03) — relever le code de rang 1 (`5942`).
2. ADMIN : `PUT /api/admin/mcc/5942` `{"active":false,"comment":"Recette"}`.
3. Rejouer immédiatement l'appel de l'étape 1, **sans redémarrer l'API**.
Résultat attendu : (3) `5942` a disparu des deux listes et le rang 1 est occupé par le code suivant (`5815`) ; `GET /api/mcc` renvoie `total` décrémenté de 1.
Acceptation : effet immédiat, sans redémarrage.

---

### 2.6 ADMIN — comptes, banques, référentiel, historique, journal

---

**CAS-ADM-01 — Création d'un compte**
Niveau : LES DEUX · Criticité : BLOQUANT
Étapes : `POST /api/admin/users` `{"email":"recette1@banque.tn","firstName":"Test","lastName":"Recette","role":"AGENT","bankId":<BQ001>,"password":"Recette#2026"}`.
Résultat attendu : HTTP **201** ; corps contenant `id`, `role":"AGENT"`, `bankCode":"BQ001"`, `active":true`, **`mustChangePassword":true`**. En base, `password_hash` commence par `$2` (bcrypt) et ne contient jamais le mot de passe en clair. Un `admin_events` est créé avec `entity='USER'`, `action='CREATION'`, `payload.email` et `payload.role`.
Acceptation : 201, `mustChangePassword` vrai, journal alimenté.

---

**CAS-ADM-02 — Le compte créé doit changer son mot de passe à la première connexion**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : compte de CAS-ADM-01.
Étapes :
1. `POST /api/auth/login` avec `recette1@banque.tn` / `Recette#2026`.
2. Avec le jeton obtenu : `GET /api/requests`.
3. `POST /api/auth/password` `{"currentPassword":"Recette#2026","newPassword":"Recette#2027"}`.
4. Avec le **nouveau** jeton : `GET /api/requests`.
Résultat attendu : (1) 200, `user.mustChangePassword = true` · (2) HTTP 403 `Vous devez définir un nouveau mot de passe avant d’utiliser la plateforme.` · (3) 200 · (4) **200**.
Acceptation : blocage puis déblocage effectifs.

---

**CAS-ADM-03 — Politique de mot de passe à la création et à la réinitialisation**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `POST /api/admin/users` avec `password = "court1A"`.
2. `POST /api/admin/users/<id>/password` `{"password":"sansmajuscule1"}`.
Résultat attendu : (1) 400, `details[0].champ = "password"`, message `Le mot de passe doit comporter au moins 10 caractères` ; aucun compte créé · (2) 400, `details[0].champ = "password"`, message `Le mot de passe doit contenir une minuscule, une majuscule et un chiffre` ; `password_changed_at` inchangé en base.
Acceptation : deux 400, aucune écriture.

---

**CAS-ADM-04 — Unicité de l'adresse e-mail**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `POST /api/admin/users` avec `email = "AGENT@BANQUE.TN"` (casse différente d'un compte existant).
2. `PUT /api/admin/users/<id banquier>` `{"email":"agent@banque.tn"}`.
Résultat attendu : (1) HTTP **409** `{"error":"Un compte existe déjà avec l'adresse AGENT@BANQUE.TN."}` (comparaison insensible à la casse) · (2) HTTP 409 `{"error":"Un autre compte utilise déjà l'adresse agent@banque.tn."}`.
Acceptation : deux 409, aucun doublon en base.

---

**CAS-ADM-05 — Rattachement à une banque inexistante ou désactivée**
Niveau : BACK · Criticité : MAJEUR
Préconditions : banque `BQ004` créée puis désactivée (sans compte actif).
Étapes :
1. `POST /api/admin/users` avec `bankId = 999999`.
2. `POST /api/admin/users` avec `bankId = <BQ004>`.
3. `PUT /api/admin/users/<id d'un agent>` `{"bankId":<BQ004>}`.
Résultat attendu : (1) HTTP 400 `{"error":"Banque 999999 introuvable"}` · (2) et (3) HTTP 400 `{"error":"Cette banque est désactivée : aucun compte ne peut y être rattaché."}`.
Acceptation : trois 400, aucun compte rattaché à une banque inactive.

---

**CAS-ADM-06 — Modification du rôle et de la banque d'un compte**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes : `PUT /api/admin/users/<id recette1>` `{"role":"BANQUIER","bankId":<BQ002>,"lastName":"Recette-2"}`.
Résultat attendu : HTTP 200 ; corps avec `role":"BANQUIER"`, `bankCode":"BQ002"`, `lastName":"Recette-2"`. Un `admin_events` `action='MODIFICATION'` avec `payload.champs = ["role","bankId","lastName"]` (ordre indifférent, contenu exact).
Acceptation : les trois champs modifiés et journalisés.

---

**CAS-ADM-07 — Mise à jour vide refusée**
Niveau : BACK · Criticité : MINEUR
Étapes : `PUT /api/admin/users/<id>` `{}` puis `PUT /api/admin/banks/<id>` `{}`.
Résultat attendu : HTTP 400 dans les deux cas, `details[0].message = "Aucune modification fournie"`.
Acceptation : deux 400.

---

**CAS-ADM-08 — Garde-fous : l'administrateur ne se verrouille pas lui-même**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : jeton de `admin@clicktopay.tn`, seul ADMIN actif.
Étapes :
1. `PUT /api/admin/users/<son propre id>` `{"role":"AGENT"}`.
2. `PUT /api/admin/users/<son propre id>` `{"active":false}`.
3. Créer un second ADMIN, puis rejouer l'étape 1 avec le **premier** compte.
Résultat attendu : (1) HTTP **403** `{"error":"Vous ne pouvez pas modifier votre propre rôle."}` · (2) HTTP **403** `{"error":"Vous ne pouvez pas désactiver votre propre compte."}` · (3) toujours 403 : la protection porte sur soi-même, indépendamment du nombre d'administrateurs. (FRONT) l'écran « Comptes » n'offre ni bascule de rôle ni bouton « Désactiver » sur sa propre ligne.
Acceptation : trois 403 et absence des commandes à l'écran.

---

**CAS-ADM-09 — La plateforme conserve au moins un administrateur actif (chemin séquentiel)**
Niveau : BACK · Criticité : BLOQUANT
Préconditions : exactement deux ADMIN actifs, A1 (celui dont on utilise le jeton) et A2.
Étapes :
1. Avec le jeton de A1 : `PUT /api/admin/users/<A2>` `{"role":"AGENT"}`.
2. Avec le jeton de A1 : `PUT /api/admin/users/<A1>` `{"role":"AGENT"}`.
3. Avec le jeton de A1 : `PUT /api/admin/users/<A1>` `{"active":false}`.
Résultat attendu : (1) HTTP 200 — il reste un administrateur actif (A1) · (2) HTTP **403** `{"error":"Vous ne pouvez pas modifier votre propre rôle."}` · (3) HTTP **403** `{"error":"Vous ne pouvez pas désactiver votre propre compte."}`. À l'issue, `SELECT count(*) FROM users WHERE role='ADMIN' AND active` = **1**.
Note de lecture du code : par voie séquentielle, l'invariant est tenu par la garde « compte courant », jamais par `assertResteUnAdmin` — l'acteur étant lui-même un ADMIN actif distinct de la cible, le comptage trouve toujours au moins lui. Le message `Impossible : la plateforme doit conserver au moins un administrateur actif.` n'est donc atteignable qu'en concurrence (CAS-ADM-10). À signaler à l'agent 7 si aucun cas ne l'exerce.
Acceptation : 200, 403, 403, et un administrateur actif restant.

---

**CAS-ADM-10 — Concurrence : deux administrateurs se rétrogradent mutuellement**
Niveau : BACK · Criticité : BLOQUANT
Préconditions : A1 et A2 sont les **seuls** ADMIN actifs (`UPDATE users SET active=FALSE WHERE role='ADMIN' AND id NOT IN (A1,A2)`), chacun disposant de son propre jeton.
Étapes : lancer **en parallèle**, sans attente entre les deux :
1. jeton de A1 → `PUT /api/admin/users/<A2>` `{"role":"AGENT"}`
2. jeton de A2 → `PUT /api/admin/users/<A1>` `{"role":"AGENT"}`
Résultat attendu : une réponse 200 et une réponse **409** `{"error":"Impossible : la plateforme doit conserver au moins un administrateur actif."}` ; **aucun 500, aucun interblocage PostgreSQL** (le verrou consultatif `pg_advisory_xact_lock` sérialise les deux transactions) ; à l'issue, `SELECT count(*) FROM users WHERE role='ADMIN' AND active` = **1**.
Acceptation : 1 succès, 1 conflit propre, exactement un administrateur survivant.

---

**CAS-ADM-11 — Un compte désactivé ne peut plus se connecter**
Niveau : LES DEUX · Criticité : BLOQUANT
Étapes : `PUT /api/admin/users/<id recette1>` `{"active":false}` puis `POST /api/auth/login` avec ce compte.
Résultat attendu : `PUT` → 200 avec `active":false` ; `login` → **401** `{"error":"Identifiants incorrects"}` (même message que pour un mot de passe erroné : pas d'information sur l'état du compte).
Acceptation : 401 avec le message générique.

---

**CAS-ADM-12 — Banques : création, unicité, volumétrie**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `POST /api/admin/banks` `{"code":"bq009","name":"Banque de Recette"}`.
2. `POST /api/admin/banks` `{"code":"BQ009","name":"Doublon"}`.
3. `POST /api/admin/banks` `{"code":"B","name":"Trop court"}`.
4. `GET /api/admin/banks`.
Résultat attendu : (1) HTTP 201, `code = "BQ009"` (**mis en majuscules**) · (2) HTTP **409** `{"error":"Le code banque BQ009 est déjà utilisé."}` · (3) HTTP 400, `details[0].message = "Code banque trop court"` · (4) chaque banque porte `userCount` et `requestCount` numériques, cohérents avec `SELECT count(*)` en base.
Acceptation : 201, 409, 400 et compteurs exacts.

---

**CAS-ADM-13 — Une banque avec des comptes actifs ne peut pas être désactivée**
Niveau : LES DEUX · Criticité : MAJEUR
Préconditions : BQ001 compte 3 comptes actifs.
Étapes :
1. `PUT /api/admin/banks/<BQ001>` `{"active":false}`.
2. Désactiver tous les comptes de la banque, puis rejouer l'étape 1.
Résultat attendu : (1) HTTP **409** `{"error":"Cette banque compte 3 compte(s) actif(s). Désactivez-les avant de désactiver la banque."}` — le nombre annoncé égale `SELECT count(*) FROM users WHERE bank_id=<BQ001> AND active` · (2) HTTP 200, `active = false`.
Acceptation : message avec le compte exact, puis désactivation possible.

---

**CAS-ADM-14 — Référentiel : la vue administrateur montre tout**
Niveau : LES DEUX · Criticité : MAJEUR
Préconditions : au moins un code désactivé (CAS-MCC-08).
Étapes : `GET /api/admin/mcc?limit=300`.
Résultat attendu : HTTP 200 ; corps avec `total` (tous les codes, actifs et inactifs), `actifs` (< `total`), `count`, `items`. Les items incluent des codes `riskLevel = "INTERDIT"` **et** des codes `active = false`, contrairement à `GET /api/mcc`.
Acceptation : `total > actifs` et présence des deux catégories.

---

**CAS-ADM-15 — Édition d'un code et historisation champ par champ**
Niveau : LES DEUX · Criticité : BLOQUANT
Étapes :
1. `PUT /api/admin/mcc/5977` `{"label":"Cosmétiques, parfumerie et soins","riskLevel":"SENSIBLE","note":"Contrôle renforcé","comment":"Demande conformité 2026-09"}`.
2. `GET /api/admin/mcc/5977/history`.
3. `GET /api/admin/events?limit=10`.
Résultat attendu : (1) HTTP 200, corps reflétant les trois champs · (2) la première entrée a `action = "MODIFICATION"`, `comment = "Demande conformité 2026-09"`, `userName` = nom de l'administrateur, `champsModifies` contenant exactement `label`, `riskLevel`, `note` (et pas les champs non touchés), `avant`/`apres` renseignés · (3) le journal contient une ligne `entity='MCC'`, `entityId='5977'`, `action='MODIFICATION'`.
Acceptation : les trois vérifications sont exactes.

---

**CAS-ADM-16 — Désactivation / réactivation d'un code : action historisée distincte**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `PUT /api/admin/mcc/5994` `{"active":false,"comment":"Retiré du manuel"}`.
2. `PUT /api/admin/mcc/5994` `{"active":true,"comment":"Réintégré"}`.
3. `GET /api/admin/mcc/5994/history`.
Résultat attendu : l'historique contient, du plus récent au plus ancien, `REACTIVATION` puis `DESACTIVATION` (et non deux `MODIFICATION`) ; `SELECT count(*) FROM mcc_codes WHERE code='5994'` = 1 à tout instant (aucune suppression).
Acceptation : les deux actions portent le bon libellé et la ligne survit.

---

**CAS-ADM-17 — Ajout d'un code absent du manuel**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `POST /api/admin/mcc` `{"code":"9101","label":"Bornes de recharge pour véhicules électriques","description":"Exploitation de bornes de recharge et abonnements associés.","keywords":["borne recharge","recharge electrique"],"sectors":["AUTOMOBILE"],"comment":"Code local acquéreur"}`.
2. `POST /api/admin/mcc` avec le même code.
3. `POST /api/admin/mcc` `{"code":"91","label":"X","description":"Description suffisante"}`.
4. `GET /api/mcc/9101` avec un jeton AGENT.
Résultat attendu : (1) HTTP **201** ; valeurs par défaut posées : `ecommerceRelevance = "MEDIUM"`, `riskLevel = "STANDARD"`, `networks = ["VISA","MASTERCARD"]`, `source = "Ajout manuel"` ; historique `CREATION` · (2) HTTP **409** `{"error":"Le MCC 9101 existe déjà dans le référentiel."}` · (3) HTTP 400 `Un MCC est composé de 4 chiffres` · (4) HTTP 200 : le code est immédiatement visible des agents.
Acceptation : 201 / 409 / 400 / 200 conformes.

---

**CAS-ADM-18 — Concurrence : deux créations du même code**
Niveau : BACK · Criticité : MAJEUR
Étapes : lancer en parallèle deux `POST /api/admin/mcc` portant `code = "9111"`.
Résultat attendu : une réponse **201** et une réponse **409** `Le MCC 9111 existe déjà dans le référentiel.` (filet posé sur la violation de clé primaire, code PostgreSQL `23505`) ; jamais deux 201 ; jamais un 500.
Acceptation : 1 × 201, 1 × 409, une seule ligne en base.

---

**CAS-ADM-19 — Code inexistant : 404 sur toutes les routes d'administration**
Niveau : BACK · Criticité : MINEUR
Étapes : `GET /api/admin/mcc/9999`, `GET /api/admin/mcc/9999/history`, `PUT /api/admin/mcc/9999` `{"label":"X test"}`.
Résultat attendu : HTTP 404 aux trois appels, `{"error":"MCC 9999 introuvable"}`.
Acceptation : trois 404 avec le message exact.

---

**CAS-ADM-20 — Modification vide d'un code**
Niveau : BACK · Criticité : MINEUR
Étapes : `PUT /api/admin/mcc/5977` `{"comment":"seulement un motif"}`.
Résultat attendu : HTTP 400, `details[0].message = "Aucune modification fournie"` (le seul commentaire ne constitue pas une modification) ; aucune entrée d'historique créée.
Acceptation : 400 et historique inchangé.

---

**CAS-ADM-21 — Journal d'administration : contenu, ordre et bornes**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. Enchaîner : création d'un compte, création d'une banque, modification d'un MCC.
2. `GET /api/admin/events?limit=5`.
3. `GET /api/admin/events?limit=9999` puis `?limit=0` puis `?limit=abc`.
4. (FRONT) ouvrir `/administration/journal`.
Résultat attendu : (2) les trois actions apparaissent en tête, **du plus récent au plus ancien**, chacune avec `entity` (`USER`/`BANK`/`MCC`), `entityId`, `action`, `userName` (nom de l'administrateur) et `createdAt` · (3) `limit=9999` → au plus 500 items, `limit=0` → au moins 1, `limit=abc` → 100 par défaut, aucun 500 · (4) le tableau affiche les mêmes lignes avec la date localisée `JJ/MM/AAAA HH:MM`.
Acceptation : ordre, nominativité et bornes conformes.

---

**CAS-ADM-22 — Un `db:seed` ne réécrit pas les ajustements de la conformité**
Niveau : BACK · Criticité : MAJEUR
Étapes :
1. `PUT /api/admin/mcc/5977` `{"riskLevel":"SENSIBLE","note":"Décision conformité"}`.
2. Exécuter `npm run db:seed` (sans `forceMcc`).
3. `GET /api/admin/mcc/5977`.
Résultat attendu : `riskLevel = "SENSIBLE"` et `note = "Décision conformité"` **conservés** ; les codes absents ont bien été insérés ; aucun code existant réécrit.
Acceptation : l'ajustement survit au réamorçage.

---

### 2.7 IMPORT — export, lecture Excel/CSV, rapport d'écart, application

---

**CAS-IMPORT-01 — Export du référentiel dans les deux formats**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `GET /api/admin/mcc/export?format=xlsx`.
2. `GET /api/admin/mcc/export?format=csv`.
3. `GET /api/admin/mcc/export` (sans paramètre).
4. `GET /api/admin/mcc/export?format=csv&actifsSeuls=true` sur un référentiel comportant un code désactivé.
5. (FRONT) `/administration/import`, boutons « Télécharger en Excel » et « Télécharger en CSV ».
Résultat attendu :
- (1) HTTP 200, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="referentiel-mcc-<AAAA-MM-JJ>.xlsx"`, corps commençant par la signature ZIP `PK`.
- (2) HTTP 200, `Content-Type: text/csv; charset=utf-8`, première ligne d'en-tête contenant `Code,Libellé,Description,Mots-clés,Pertinence,Vigilance,Note,Secteur,Libellé EN,Description EN`.
- (3) format `xlsx` par défaut.
- (4) le fichier contient `actifs` lignes de données (sans le code désactivé), contre `total` en (2).
- (5) un fichier est effectivement téléchargé par le navigateur, avec le même nom.
Acceptation : en-têtes HTTP, nom de fichier et volumétrie conformes.

---

**CAS-IMPORT-02 — Aller-retour export → réimport sans perte (xlsx)**
Niveau : BACK · Criticité : BLOQUANT
Étapes :
1. `GET /api/admin/mcc/export?format=xlsx` → enregistrer le fichier.
2. `POST /api/admin/mcc/import-fichier` avec ce fichier tel quel.
Résultat attendu : HTTP 200 ; `lignesLues = 279` ; `entrees.length = 279` ; `anomalies = []` ; `rapport.resume.ajoutes = 0`, `modifies = 0`, `retires = 0`, `inchanges = 279`, `applique = false`.
Acceptation : **zéro** ajout, zéro modification, zéro anomalie.

---

**CAS-IMPORT-03 — Aller-retour export → réimport sans perte (csv)**
Niveau : BACK · Criticité : BLOQUANT
Étapes : idem CAS-IMPORT-02 avec `format=csv`.
Résultat attendu : identique à CAS-IMPORT-02 — en particulier, les mots-clés multi-lignes et ceux contenant une virgule (ex. `local, suburban commuter`) ne doivent **pas** être scindés : `modifies = 0` sur le champ `keywords`.
Acceptation : `modifies = 0` et `inchanges = 279`.

---

**CAS-IMPORT-04 — Fichier métier désordonné : ordre libre, colonnes en trop, variantes d'en-tête**
Niveau : LES DEUX · Criticité : MAJEUR
Préconditions : construire un `.xlsx` dont la ligne 1 est, dans cet ordre : `Niveau de risque | Responsable | Intitulé | Code MCC | Synonymes | Pertinence e-commerce | Univers`.
Étapes : `POST /api/admin/mcc/import-fichier`.
Résultat attendu : HTTP 200 ; `colonnesDetectees` contient `riskLevel`, `label`, `code`, `keywords`, `ecommerceRelevance`, `sector` ; `colonnesIgnorees` contient `Responsable` ; chaque ligne est lue quelle que soit la position des colonnes.
Acceptation : 6 champs reconnus, 1 colonne ignorée nommément, aucune ligne perdue.

---

**CAS-IMPORT-05 — Traduction des valeurs métier**
Niveau : BACK · Criticité : MAJEUR
Préconditions : fichier contenant les valeurs `Forte`, `Moyenne`, `Faible`, `HIGH`, `3`, `1` en colonne `Pertinence` et `Standard`, `Sensible`, `Interdit`, `Vigilance renforcée`, `Non éligible`, `Normale` en colonne `Vigilance`.
Étapes : `POST /api/admin/mcc/import-fichier`.
Résultat attendu : les `entrees` portent respectivement `ecommerceRelevance` ∈ `{HIGH, MEDIUM, LOW, HIGH, HIGH, LOW}` et `riskLevel` ∈ `{STANDARD, SENSIBLE, INTERDIT, SENSIBLE, INTERDIT, STANDARD}`. Aucune anomalie pour ces lignes.
Acceptation : 12 traductions exactes.

---

**CAS-IMPORT-06 — Anomalies signalées avec leur numéro de ligne**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : fichier de 7 lignes de données contenant, dans l'ordre : ligne 2 code `5977` valide ; ligne 3 code `abc` ; ligne 4 code vide ; ligne 5 code `5977` (doublon) ; ligne 6 pertinence `Excellente` ; ligne 7 vigilance `Maximale` ; ligne 8 entièrement vide.
Étapes : `POST /api/admin/mcc/import-fichier`.
Résultat attendu : HTTP 200 ; `anomalies` contient exactement 4 entrées :
- `{ligne:3, motif:"Code MCC illisible ou absent", valeur:"abc"}`
- `{ligne:4, motif:"Code MCC illisible ou absent", valeur:null}`
- `{ligne:5, motif:"Code 5977 déjà présent ligne 2", valeur:"5977"}`
- `{ligne:6, motif:"Pertinence non reconnue : « Excellente »", …}` et `{ligne:7, motif:"Niveau de vigilance non reconnu : « Maximale »", …}` (soit 5 entrées au total avec les deux dernières).
La ligne 8 vide est ignorée sans anomalie (`lignesLues` ne la compte pas).
**Point d'attention** : les lignes 6 et 7 restent présentes dans `entrees`, privées du champ non reconnu — vérifier que le rapport d'écart ne présente donc pas ces codes comme modifiés sur ce champ.
(FRONT) le bandeau « N ligne(s) écartée(s) » affiche chaque anomalie avec son numéro de ligne.
Acceptation : chaque anomalie porte un numéro de ligne exact et aucune n'est silencieuse.

---

**CAS-IMPORT-07 — Codes normalisés par Excel**
Niveau : BACK · Criticité : MAJEUR
Préconditions : fichier dont la colonne `Code` contient `5977` (texte), `5977.0` (nombre rendu par Excel), `742` (zéro de tête perdu), `05977`, `59770`.
Étapes : `POST /api/admin/mcc/import-fichier`.
Résultat attendu : les codes lus valent `5977`, puis anomalie doublon sur `5977.0` (même code), `0742`, anomalie doublon sur `05977`, et anomalie `Code MCC illisible ou absent` pour `59770` (5 chiffres).
Acceptation : la normalisation et les rejets sont conformes.

---

**CAS-IMPORT-08 — Le rapport d'écart ne modifie rien**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : fichier contenant un code nouveau `9201`, un code existant `5977` au libellé modifié, et **pas** le code `5942`.
Étapes :
1. `POST /api/admin/mcc/import-fichier`.
2. `POST /api/admin/mcc/import` avec `{"entrees":[…],"apply":false}`.
3. `GET /api/admin/mcc/5977` et `GET /api/admin/mcc/9201`.
Résultat attendu : (1) et (2) HTTP 200 avec `rapport.ajoutes = [{code:"9201",…}]`, `rapport.modifies[0].champs` contenant `{champ:"label", avant:"Cosmétiques et parfumerie", apres:"<nouveau libellé>"}`, `rapport.retires` contenant `5942`, `resume.applique = false` · (3) `5977` **inchangé** en base, `9201` → HTTP 404. (FRONT) le bandeau « Simulation — aucune donnée modifiée » est affiché.
Acceptation : aucune écriture après deux analyses.

---

**CAS-IMPORT-09 — Application après confirmation explicite**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : le fichier de CAS-IMPORT-08.
Étapes :
1. `POST /api/admin/mcc/import` `{"entrees":[…],"apply":true,"deactivateMissing":false,"comment":"Édition avril 2026"}`.
2. `GET /api/admin/mcc/9201`, `GET /api/admin/mcc/5977`, `GET /api/admin/mcc/5942`.
3. `GET /api/admin/mcc/9201/history` et `GET /api/admin/mcc/5977/history`.
4. `GET /api/admin/events?limit=5`.
5. (FRONT) refaire le parcours : charger le fichier, cliquer « Appliquer l'import », vérifier l'écran de confirmation, puis confirmer.
Résultat attendu :
- (1) 200, `resume.applique = true`, `resume.desactivationDesRetires = false`.
- (2) `9201` créé (200) ; `5977` porte le nouveau libellé ; `5942` **toujours actif** (non désactivé).
- (3) historique de `9201` : `action = "IMPORT_AJOUT"`, `comment = "Édition avril 2026"` ; historique de `5977` : `action = "IMPORT_MODIFICATION"` avec `avant`/`apres`.
- (4) une ligne `entity='MCC'`, `entityId='IMPORT'`, `action='IMPORT_REFERENTIEL'` dont le `payload` reprend le résumé.
- (5) l'écran affiche `X ajout(s), Y modification(s) … vont être appliqués` **avant** toute écriture, et n'écrit qu'après le second clic.
Acceptation : les 5 points sont vrais.

---

**CAS-IMPORT-10 — Désactivation des codes absents : strictement optionnelle**
Niveau : LES DEUX · Criticité : BLOQUANT
Étapes :
1. `POST /api/admin/mcc/import` `{"entrees":[…],"apply":true,"deactivateMissing":"false"}` (chaîne).
2. `POST /api/admin/mcc/import` `{"entrees":[…],"apply":true,"deactivateMissing":"peut-être"}`.
3. `POST /api/admin/mcc/import` `{"entrees":[…],"apply":true,"deactivateMissing":true}`.
Résultat attendu :
- (1) HTTP 200 ; la chaîne `"false"` est interprétée **comme faux** : `resume.desactivationDesRetires = false`, aucun code absent désactivé (`SELECT count(*) FROM mcc_codes WHERE NOT active` inchangé).
- (2) HTTP **400**, `details[0].champ = "deactivateMissing"`, message `Valeur booléenne attendue (true ou false)` ; aucune écriture.
- (3) HTTP 200 ; chaque code absent passe à `active = false`, **jamais supprimé** (`SELECT count(*) FROM mcc_codes` constant) ; chacun reçoit une entrée d'historique `IMPORT_DESACTIVATION`.
Acceptation : aucune désactivation non demandée ; les lignes survivent.

---

**CAS-IMPORT-11 — Divergence D2 : changement de secteur seul sur un code existant**
Niveau : BACK · Criticité : MAJEUR
Préconditions : code `5977` rattaché au secteur `BEAUTE_COSMETIQUE`.
Étapes :
1. Construire un fichier d'une seule ligne : `Code = 5977`, colonne `Secteur = SANTE`, tous les autres champs **identiques** à la base.
2. `POST /api/admin/mcc/import-fichier` → relever le rapport.
3. `POST /api/admin/mcc/import` avec `apply = true`.
4. `GET /api/admin/mcc/5977` → relever `sectors`.
Résultat attendu : (2) `5977` est classé dans `modifies`, et l'écart signalé porte le champ `sectors` · (4) `sectors` vaut `["SANTE"]` : le changement a bien été appliqué.
Acceptation : l'écart est détecté à la simulation **et** appliqué à la confirmation. Un code classé « inchangé » alors que son rattachement diffère est un échec : la colonne `Secteur` est annoncée par le README comme un moyen de rattachement.

> **Amendement du 2026-09-23.** La divergence D2 est **close** : `sector` est désormais
> comparé. Mesuré le 2026-09-23 sur l'instance du port 4000, par une simulation qui n'écrit
> rien (`{"entrees":[{"code":"5977","sector":"SANTE"}]}`, sans `apply`) : `modifies = 1`,
> `inchanges = 0`, champ signalé `sectors`. L'application (4) est établie par
> `server/tests/robustesse.test.js` (*le secteur est comparé à l'import et n'est plus perdu*),
> non rejouée à la main pour ne rien écrire dans la base de démonstration.

---

**CAS-IMPORT-12 — Divergence D3 : perte des secteurs multiples à l'aller-retour**
Niveau : BACK · Criticité : MAJEUR
Préconditions : `PUT /api/admin/mcc/5912` `{"sectors":["SANTE","BEAUTE_COSMETIQUE"]}` (deux secteurs).
Étapes :
1. `GET /api/admin/mcc/export?format=csv` → repérer la ligne `5912`.
2. Dans le fichier, modifier **uniquement** son libellé (pour le faire entrer dans `modifies`).
3. `POST /api/admin/mcc/import` avec `apply = true`.
4. `GET /api/admin/mcc/5912` → relever `sectors`.
Résultat attendu : (1) la colonne `Secteur` porte les **deux** secteurs, séparés par une virgule · (4) `sectors` en compte toujours deux : l'aller-retour n'en perd aucun.
Acceptation : `sectors.length` vaut 2 avant comme après. Toute perte silencieuse est un échec.

> **Amendement du 2026-09-23.** La divergence D3 est **close** : l'export porte tous les
> secteurs d'un code. Mesuré le 2026-09-23 sur l'export CSV de l'instance du port 4000, lecture
> seule : `5912 → BEAUTE_COSMETIQUE, SANTE` et `5817 → CONTENUS_NUMERIQUES,
> INFORMATIQUE_LOGICIEL`. Le cycle complet est couvert par `server/tests/robustesse.test.js`
> (D2 et D3) et par `vague3.test.js` (DEF-A6-02, la régression que ce correctif avait
> produite : un secteur concaténé dépassant la borne de 40 caractères).

---

**CAS-IMPORT-13 — Codes arrivant sans lexique métier**
Niveau : LES DEUX · Criticité : MAJEUR
Préconditions : fichier de 3 nouvelles lignes : `9102` sans mots-clés ni secteur, `9103` avec `Mots-clés`, `9104` avec `Secteur`.
Étapes : `POST /api/admin/mcc/import-fichier`.
Résultat attendu : `resume.ajoutes = 3`, **`resume.muets = 1`**, `muets[0].code = "9102"` (seul le code sans mots-clés **ni** secteur est signalé). (FRONT) un bandeau « 1 code(s) arriveront sans mots-clés ni secteur » est affiché, et le tableau « Codes sans lexique métier » liste `9102`.
Acceptation : un seul code signalé, nommément, avant application.

---

**CAS-IMPORT-14 — Fichiers refusés**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `POST /api/admin/mcc/import-fichier` **sans** champ `fichier`.
2. Avec un fichier `referentiel.txt`.
3. Avec un `.xlsx` dont la ligne 1 ne contient aucune colonne reconnaissable comme code.
4. Avec un `.xlsx` ne contenant que la ligne d'en-tête.
5. Avec un `.csv` de plus de 5 Mo.
6. Avec un `.json` contenant `{"entrees":"pas un tableau"}`.
Résultat attendu :
- (1) 400 `{"error":"Aucun fichier reçu."}`
- (2) 400 `{"error":"Format non pris en charge : attendu .xlsx, .csv ou .json."}`
- (3) 400 commençant par `Fichier illisible : Colonne « code » introuvable. En-têtes lus : …`
- (4) 400 `Fichier illisible : Aucune ligne exploitable : vérifiez que la colonne « code » contient des MCC à 4 chiffres.`
- (5) refus du téléversement (limite multer 5 Mo), aucune erreur 500.
- (6) 400 commençant par `Fichier illisible :`.
Aucune écriture en base dans les six cas.
Acceptation : six refus explicites, aucun 500.

---

**CAS-IMPORT-15 — Bornes et validation du corps `POST /api/admin/mcc/import`**
Niveau : BACK · Criticité : MAJEUR
Étapes :
1. `{"entrees":[]}`.
2. `{"entrees":[…2001 entrées…]}`.
3. `{"entrees":[{"code":"5977","riskLevel":"BIZARRE"}],"apply":true}`.
4. `{"entrees":[{"code":"5977","label":"<300 caractères>"}],"apply":true}`.
5. `{"entrees":[{"code":"59"},{"code":"5977"}]}`.
6. `{"entrees":[{"code":"5977"},{"code":"5977"}]}`.
Résultat attendu : (1) 400 `Le fichier importé est vide` · (2) 400 `Fichier trop volumineux (2000 codes maximum)` · (3) 400 avec `details[0].champ = "entrees.0.riskLevel"` · (4) 400 sur `entrees.0.label` · (5) 400 `Code MCC invalide dans le fichier importé : « 59 »` · (6) 400 `Le code 5977 apparaît plusieurs fois dans le fichier.` **Aucune écriture** en base pour les six appels, y compris ceux portant `apply: true` (la validation précède la transaction).
Acceptation : six 400, référentiel intact.

---

**CAS-IMPORT-16 — L'import reste réservé à l'administrateur**
Niveau : BACK · Criticité : BLOQUANT
Étapes : avec un jeton AGENT puis BANQUIER, appeler `GET /api/admin/mcc/export`, `POST /api/admin/mcc/import-fichier` (avec un fichier valide) et `POST /api/admin/mcc/import` (`apply: true`).
Résultat attendu : six réponses **403** `{"error":"Action réservée aux profils : ADMIN"}` ; aucune écriture, aucun fichier servi.
Acceptation : six 403.

---

### 2.8 INDEXATION — mots-clés dérivés, secteurs, effet immédiat

---

**CAS-INDEX-01 — Un code importé est proposable immédiatement, sans redémarrage**
Niveau : BACK · Criticité : BLOQUANT
Étapes :
1. `POST /api/admin/mcc/import` `{"entrees":[{"code":"9101","label":"Bornes de recharge pour véhicules électriques","description":"Exploitation de bornes de recharge et abonnements associés."}],"apply":true}`.
2. **Sans redémarrer l'API** : `POST /api/mcc/suggest` `{"activityDescription":"Installation et exploitation de bornes de recharge pour véhicules électriques en Tunisie","limit":10}`.
Résultat attendu : `9101` figure dans `VISA` **et** `MASTERCARD`, avec un `score` ≥ 1 et des `matchedTerms` non vides contenant au moins `bornes recharge`.
Acceptation : le code apparaît au premier appel qui suit l'écriture.

---

**CAS-INDEX-02 — Dérivation des mots-clés à partir du libellé et de la description**
Niveau : LES DEUX · Criticité : MAJEUR
Préconditions : code `9101` de CAS-INDEX-01 (aucun mot-clé métier fourni).
Étapes : `GET /api/admin/mcc/9101` ; relever `keywords` et `keywordsAuto`.
Résultat attendu : `keywords = []` (rien n'a été saisi) et `keywordsAuto` contient, au minimum, les bigrammes du libellé `bornes recharge`, `recharge vehicules`, `vehicules electriques`, les jetons `bornes`, `recharge`, `vehicules`, `electriques` et leurs variantes singulier/pluriel `borne`, `recharges`, `vehicule`, `electrique`, plus les jetons de la description (`exploitation`, `abonnements`). La liste ne dépasse **jamais 30 entrées**. Les mots vides (`vente`, `ligne`, `produits`, `service`, `societe`…) en sont absents.
(FRONT) la fiche du code affiche ces mots-clés dans un bloc **en lecture seule**, distinct du champ « Mots-clés » saisissable.
Acceptation : les bigrammes, variantes et exclusions sont conformes ; ≤ 30 entrées ; bloc non éditable à l'écran.

---

**CAS-INDEX-03 — Le singulier retrouve un libellé écrit au pluriel**
Niveau : BACK · Criticité : MAJEUR
Préconditions : un code importé dont le libellé contient `Trottinettes électriques`.
Étapes :
1. `POST /api/mcc/suggest` `{"activityDescription":"Vente de trottinettes electriques neuves et reconditionnees pour la ville","limit":10}`.
2. Idem avec `"Vente de trottinette electrique neuve et reconditionnee pour la ville"` (singulier).
Résultat attendu : le code apparaît dans les deux réponses ; le rang du singulier est au plus celui du pluriel + 2.
Acceptation : le code est proposé dans les deux formulations.

---

**CAS-INDEX-04 — Aucun synonyme n'est deviné**
Niveau : BACK · Criticité : MAJEUR
Préconditions : code `9105` de libellé `Trottinettes électriques`, sans mots-clés saisis.
Étapes :
1. `POST /api/mcc/suggest` `{"activityDescription":"Boutique de patinettes electriques et de pieces detachees pour la mobilite urbaine","limit":20}`.
2. `PUT /api/admin/mcc/9105` `{"keywords":["patinette","patinettes electriques","trottinette"]}`.
3. Rejouer l'étape 1.
Résultat attendu : (1) `9105` est **absent** de la liste (aucune dérivation ne devine « patinette ») · (3) `9105` est présent, avec `matchedTerms` contenant `patinette`.
Acceptation : absent avant saisie du lexique, présent après — sans redémarrage.

---

**CAS-INDEX-05 — Un lexique saisi pèse plus lourd qu'un dérivé**
Niveau : BACK · Criticité : MINEUR
Préconditions : deux codes importés portant le même mot dans leur libellé, dont un seul le porte aussi en `keywords` saisis.
Étapes : `POST /api/mcc/suggest` avec une description contenant ce mot.
Résultat attendu : le code dont le mot figure dans `keywords` (poids 5) devance celui où il n'est que dérivé (poids 3), toutes choses égales par ailleurs.
Acceptation : ordre conforme.

---

**CAS-INDEX-06 — Divergence D1 : rang du rattachement à un secteur**
Niveau : BACK · Criticité : MAJEUR
Préconditions : secteur `ANIMALERIE` rattaché au seul code `5995`.
Étapes :
1. `PUT /api/admin/mcc/9101` `{"sectors":["ANIMALERIE"]}`.
2. `GET /api/mcc/secteurs` → relever l'ordre des `mccs` du secteur `ANIMALERIE`.
3. `PUT /api/admin/mcc/5995` `{"sectors":["ANIMALERIE"]}` (ré-enregistrement à l'identique).
4. Rejouer l'étape 2.
Résultat attendu : (2) `mccs = ["5995","9101"]` — le nouveau code est placé **en dernier**, malgré le commentaire du code qui annonce « le rang suit l'ordre fourni » · (4) `mccs = ["5995","9101"]`, **inchangé** : un ré-enregistrement ne rétrograde plus le code, et le bonus de secteur (`38 − rang × 4`) reste stable.
Acceptation : (4) est identique à (2). Un ordre qui change sans que l'administrateur l'ait demandé est un échec. Le rang reste en revanche non pilotable : c'est la part de la divergence D1 qui demeure, et c'est un écart de documentation, pas un défaut de comportement.

> **Amendement du 2026-09-23.** La divergence D1 s'est scindée en deux. Sa conséquence
> dommageable — la rétrogradation silencieuse d'un code réenregistré — a été corrigée (constat
> de revue `C-14`) et l'attendu (4) est réécrit en conséquence. Sa part documentaire subsiste :
> un nouveau rattachement prend la fin de file, quel que soit l'ordre fourni. Établi par
> `rapport-recette.md` (C-14, réserve D1) et par les deux cas C-14 de
> `server/tests/robustesse.test.js` ; non rejoué à la main, la manœuvre écrivant dans le
> référentiel.

---

**CAS-INDEX-07 — Un secteur inconnu est refusé**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `PUT /api/admin/mcc/9101` `{"sectors":["SECTEUR_IMAGINAIRE"]}`.
2. `POST /api/admin/mcc/import` `{"entrees":[{"code":"9106","label":"Test","description":"Description suffisante pour le banquier.","sector":"SECTEUR_IMAGINAIRE"}],"apply":true}`.
3. `POST /api/mcc/suggest` `{"activitySector":"SECTEUR_IMAGINAIRE","activityDescription":"…"}`.
Résultat attendu : (1) HTTP 400 `{"error":"Secteur inconnu : SECTEUR_IMAGINAIRE"}` ; aucun rattachement écrit · (2) HTTP 400 avec le même message, et **la transaction entière est annulée** : `GET /api/admin/mcc/9106` répond 404 · (3) HTTP 400, `details[0].champ = "activitySector"`, message `Secteur inconnu`.
Acceptation : trois refus, aucun effet de bord.

---

**CAS-INDEX-08 — L'index est reconstruit au changement de libellé**
Niveau : BACK · Criticité : BLOQUANT
Étapes :
1. `PUT /api/admin/mcc/9101` `{"label":"Conciergerie et services à domicile"}`.
2. Immédiatement : `POST /api/mcc/suggest` `{"activityDescription":"Service de conciergerie et d aide a domicile pour particuliers","limit":10}`.
3. `POST /api/mcc/suggest` avec l'ancienne formulation (« bornes de recharge »).
4. `GET /api/admin/mcc/9101` → relever `keywordsAuto`.
Résultat attendu : (2) `9101` est proposé avec `matchedTerms` contenant `conciergerie` · (3) il n'est plus proposé sur l'ancien vocabulaire de libellé · (4) `keywordsAuto` a été **recalculé** : il contient `conciergerie` et plus `bornes recharge` (les jetons de la description subsistent).
Acceptation : les trois effets sont immédiats, sans redémarrage.

---

**CAS-INDEX-09 — Les secteurs sont servis depuis la base**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `GET /api/mcc/secteurs` (jeton AGENT).
2. Désactiver un secteur directement en base : `UPDATE sectors SET active = FALSE WHERE key = 'ANIMALERIE'` puis provoquer un rechargement (toute écriture sur un MCC).
3. Rejouer l'étape 1 et `POST /api/requests` avec `activitySector = "ANIMALERIE"`.
Résultat attendu : (1) la liste contient 27 secteurs, chacun avec `key`, `label` et `mccs` (tableau de codes) ; (FRONT) la liste déroulante « Secteur d'activité » du formulaire reprend ces libellés · (3) `ANIMALERIE` a disparu de la liste et la création de demande répond **400** `Secteur inconnu` (la validation lit `clesSecteurs()` à l'exécution).
Acceptation : liste servie depuis la base et validation alignée dessus.

---

**CAS-INDEX-10 — Effet immédiat d'un changement de niveau de vigilance**
Niveau : BACK · Criticité : BLOQUANT
Étapes :
1. `POST /api/mcc/suggest` (JD-01) → vérifier que `5977` est proposé.
2. `PUT /api/admin/mcc/5977` `{"riskLevel":"INTERDIT","comment":"Recette"}`.
3. Rejouer l'étape 1 **sans redémarrage**.
4. `POST /api/requests` (JD-01) avec `proposedVisaMcc = "5977"`.
5. Rétablir `{"riskLevel":"STANDARD"}` et rejouer l'étape 1.
Résultat attendu : (3) `5977` a disparu des deux listes · (4) HTTP 400 `Le MCC 5977 (Cosmétiques et parfumerie) n'est pas éligible à l'affiliation ClickToPay.` · (5) `5977` réapparaît en rang 1.
Acceptation : les trois effets sont immédiats.

---

### 2.9 ROBUSTESSE — types hostiles, bornes, erreurs HTTP

> Règle transverse de ce domaine : **aucune requête ne doit produire une réponse 500**. Un 500 est un échec, quel que soit le contenu envoyé.

---

**CAS-ROB-01 — La chaîne « false » ne vaut pas `true`**
Niveau : BACK · Criticité : BLOQUANT
Étapes :
1. `POST /api/admin/mcc/import` `{"entrees":[…],"apply":"false","deactivateMissing":"false"}`.
2. `PUT /api/admin/mcc/5977` `{"active":"false"}`.
3. `PUT /api/admin/mcc/5977` `{"active":"0"}` puis `{"active":"non"}` puis `{"active":""}`.
4. `POST /api/requests` (JD-01) avec `hasSubscription = "false"`, `isMarketplace = "0"`.
Résultat attendu : (1) `resume.applique = false`, aucune écriture · (2)(3) le code est **désactivé** (`active = false`), jamais réactivé · (4) HTTP 201 avec `hasSubscription = false` et `isMarketplace = false` en base (colonnes booléennes, pas de chaîne).
Acceptation : les valeurs textuelles fausses sont toutes interprétées comme fausses.

---

**CAS-ROB-02 — Une valeur booléenne incompréhensible est refusée, pas devinée**
Niveau : BACK · Criticité : MAJEUR
Étapes : envoyer `{"active":"peut-être"}`, `{"active":2}`, `{"active":null}`, `{"active":[]}` sur `PUT /api/admin/mcc/5977`, et `{"apply":"oui-peut-etre"}` sur `POST /api/admin/mcc/import`.
Résultat attendu : HTTP 400 à chaque fois, `details[0].message = "Valeur booléenne attendue (true ou false)"` ; aucune écriture. (Remarque : `"oui"`, `"on"`, `"yes"`, `1` sont acceptés comme vrais ; `"no"`, `"off"`, `"non"`, `0` comme faux.)
Acceptation : cinq 400, aucun effet.

---

**CAS-ROB-03 — Les drapeaux métier faux ne faussent pas le moteur**
Niveau : BACK · Criticité : MAJEUR
Étapes : `POST /api/mcc/suggest` avec `{"activityDescription":"<JD-01>","isMarketplace":"false","hasSubscription":"false","deliveryMode":"PHYSIQUE"}`.
Résultat attendu : le code `5262` (place de marché) **n'est pas** en rang 1 et subit la pénalité de −25 ; le classement est identique à celui obtenu avec les booléens `false` natifs (comparaison stricte des 6 codes et des 6 scores).
Acceptation : classements strictement identiques entre la version texte et la version booléenne.

---

**CAS-ROB-04 — Dates impossibles refusées avant PostgreSQL**
Niveau : BACK · Criticité : MAJEUR
Étapes : `POST /api/requests` (JD-01) avec `companyCreatedOn` successivement égal à `2026-02-30`, `9999-99-99`, `2026-13-01`, `1800-01-01`, `2300-01-01`, `26-01-01`, `2026/01/01`.
Résultat attendu : HTTP **400** aux 7 appels ; messages `Date inexistante au calendrier` (les 5 premiers) ou `Date attendue au format AAAA-MM-JJ` (les 2 derniers) ; **aucun 500**. Avec `2026-02-28`, HTTP 201.
Acceptation : 7 refus en 400 et un succès.

---

**CAS-ROB-05 — Montants hors capacité de colonne**
Niveau : BACK · Criticité : MAJEUR
Étapes : `POST /api/requests` (JD-01) avec `shareCapital` = `1e15`, `99999999999.9999`, `-1`, `"abc"`, `Infinity` (en JSON : `1e999`).
Résultat attendu : HTTP 400 à chaque fois, messages respectifs `Montant trop élevé`, `Montant trop élevé` (au-delà de `NUMERIC(14,3)`), `La valeur doit être positive`, `Montant invalide` ou `Format attendu : number`, `Montant invalide`. Avec `99999999999.999`, HTTP 201. Aucun 500 PostgreSQL de type « numeric field overflow ».
Acceptation : 5 refus en 400, borne supérieure exacte acceptée.

---

**CAS-ROB-06 — Octet NUL et caractères de contrôle**
Niveau : BACK · Criticité : MAJEUR
Étapes : `POST /api/requests` (JD-01) avec `siteName = "Beldi\u0000Cosmetics"`, puis `companyName = "BELDI\u0007"`, puis `activityDescription` contenant `\u001f`.
Résultat attendu : HTTP 400, `details[].message = "Caractères de contrôle non autorisés"`, champ correctement désigné ; aucune erreur PostgreSQL « invalid byte sequence for encoding UTF8 ». Les caractères `\n` et `\t` (autorisés) ne déclenchent pas le refus.
Acceptation : trois 400 ciblés, tabulation et saut de ligne acceptés.

---

**CAS-ROB-07 — Identifiants de route non numériques ou hors bornes**
Niveau : BACK · Criticité : MAJEUR
Étapes : `GET /api/requests/abc`, `/api/requests/1.5`, `/api/requests/-1`, `/api/requests/0`, `/api/requests/2147483648`, `/api/requests/1%20OR%201=1`, `/api/admin/users/abc`, `/api/requests/abc/events`, `/api/requests/abc/suggestions`.
Résultat attendu : HTTP **400** aux 9 appels (jamais 404, jamais 500) ; message `Demande invalide : « abc »` (et variantes) pour les routes de demandes, `Identifiant invalide : « abc »` pour les routes d'administration.
Acceptation : neuf 400 avec le message nommant la valeur reçue.

---

**CAS-ROB-08 — Pagination et limites hostiles**
Niveau : BACK · Criticité : MAJEUR
Étapes : `GET /api/requests?limit=-10&offset=-5`, `?limit=0`, `?limit=abc`, `?limit=99999999`, `?offset=99999999999`, `GET /api/mcc?limit=-1`, `GET /api/admin/events?limit=-1`.
Résultat attendu : HTTP 200 à chaque appel ; `limit` ramené dans `[1,200]` pour `/api/requests`, `[1,300]` pour `/api/mcc`, `[1,500]` pour `/api/admin/events` ; `offset` ramené dans `[0,1000000]` ; `items` toujours un tableau ; aucun 500.
Acceptation : sept réponses 200 avec des tailles bornées.

---

**CAS-ROB-09 — Filtres de liste invalides**
Niveau : BACK · Criticité : MINEUR
Étapes : `GET /api/requests?status=INEXISTANT`, `GET /api/admin/users?role=SUPERADMIN`, `GET /api/admin/users?bankId=abc`, `GET /api/admin/users?bankId=1.5`.
Résultat attendu : (1) HTTP 200 avec `items = []` (la colonne porte une contrainte `CHECK`, la valeur ne correspond à rien) · (2) HTTP 400 `{"error":"Rôle invalide : « SUPERADMIN »"}` · (3) et (4) HTTP 400 `{"error":"Banque invalide : « abc »"}` / `« 1.5 »`. Aucun 500.
Acceptation : un 200 vide et trois 400.

---

**CAS-ROB-10 — Recherche : caractères spéciaux, jokers SQL et injection**
Niveau : LES DEUX · Criticité : MAJEUR
Étapes :
1. `GET /api/requests?search=%25` (`%`), `?search=_`, `?search='`, `?search=" OR 1=1 --`, `?search=<script>alert(1)</script>`.
2. `GET /api/mcc?search=' OR '1'='1`.
3. (FRONT) saisir `<script>alert(1)</script>` dans la recherche du référentiel et dans le champ « Nom du site ».
Résultat attendu : (1) et (2) HTTP 200, aucune erreur SQL, aucune divulgation de demande d'une autre banque (le filtre `bank_id` reste appliqué). Noter que `%` et `_` agissent comme jokers `ILIKE` : `search=%` remonte toutes les demandes **de la banque de l'appelant** — comportement acceptable, à consigner. (3) aucune exécution de script : le texte est affiché littéralement (React échappe), et l'enregistrement le restitue tel quel.
Acceptation : zéro erreur SQL, zéro fuite inter-banques, zéro exécution de script.

---

**CAS-ROB-11 — Corps JSON malformé ou hors gabarit**
Niveau : BACK · Criticité : MAJEUR
Étapes :
1. `POST /api/requests` avec le corps brut `{"siteName":` et `Content-Type: application/json`.
2. `POST /api/requests` avec un corps de 2 Mo (limite : 1 Mo).
3. `POST /api/requests` avec `Content-Type: text/plain` et un corps quelconque.
4. `POST /api/mcc/suggest` avec un corps `[]` (tableau au lieu d'objet).
Résultat attendu : (1) HTTP 400 (erreur d'analyse), **jamais 500** · (2) HTTP **413** ou 400, jamais 500 · (3) HTTP 400 : le corps n'est pas analysé, la validation zod signale les champs obligatoires · (4) HTTP 400 `Données invalides`.
Acceptation : aucune réponse 5xx.

---

**CAS-ROB-12 — Les erreurs internes ne fuient pas**
Niveau : BACK · Criticité : MAJEUR
Étapes : provoquer une indisponibilité de la base (couper PostgreSQL ou fermer le pool) puis appeler `GET /api/requests`.
Résultat attendu : HTTP 500 avec **exactement** `{"error":"Erreur interne du serveur"}` — ni trace d'exécution, ni requête SQL, ni nom de table dans le corps. La trace complète est écrite dans les journaux serveur.
Acceptation : corps strictement égal au message générique.

---

**CAS-ROB-13 — Longueurs maximales de chaque champ**
Niveau : BACK · Criticité : MAJEUR
Étapes : `POST /api/requests` (JD-01) en dépassant d'un caractère chacune des bornes : `siteName` 161, `siteUrl` 256, `companyName` 161, `rne` 33, `contactEmail` 161, `addressLine1` 181, `city` 81, `activityDescription` 2001, `productTypes` 1001, `currency` 4, `country` 81.
Résultat attendu : HTTP 400 aux 11 appels, `details[].champ` désignant le champ fautif ; **aucune** erreur PostgreSQL « value too long for type character varying ». Avec les valeurs exactement à la borne, HTTP 201.
Acceptation : 11 refus en 400 et un succès à la borne.

---

**CAS-ROB-14 — Caractères Unicode légitimes acceptés**
Niveau : LES DEUX · Criticité : MINEUR
Étapes : `POST /api/requests` avec `companyName = "SOCIÉTÉ ÉLÈVE & Cie – « Beldi »"`, `siteName = "Beldi 🌿"`, `city = "Sfax"`, `contactLastName = "بن علي"`.
Résultat attendu : HTTP 201 ; relecture `GET` restituant les valeurs **à l'identique** (accents, tirets longs, guillemets français, emoji, caractères arabes) ; l'écran de détail les affiche sans `?` ni caractère de remplacement.
Acceptation : aller-retour sans altération.

---

**CAS-ROB-15 — Types inattendus sur les champs structurés**
Niveau : BACK · Criticité : MAJEUR
Étapes : `PUT /api/admin/mcc/5977` avec `{"keywords":"un seul mot"}`, `{"keywords":[1,2]}`, `{"similar":["59"]}`, `{"networks":[]}`, `{"networks":["VISA","PAYPAL"]}`, `{"sectors":["A".repeat(50)]}`.
Résultat attendu : HTTP 400 aux 6 appels, `details[0].champ` désignant le champ (`keywords`, `similar`, `networks`, `sectors`) ; aucune écriture ; aucun 500.
Acceptation : six 400 ciblés.

---

**CAS-ROB-16 — En-têtes de sécurité et CORS**
Niveau : BACK · Criticité : MINEUR
Étapes :
1. `GET /api/health` et relever les en-têtes de réponse.
2. `OPTIONS /api/requests` avec `Origin: https://site-malveillant.example`.
Résultat attendu : (1) présence des en-têtes posés par `helmet` : `X-Content-Type-Options: nosniff`, `X-Frame-Options` ou `Content-Security-Policy`, `Strict-Transport-Security` · (2) la réponse ne contient **pas** `Access-Control-Allow-Origin: https://site-malveillant.example` (seule l'origine configurée dans `CORS_ORIGIN` est autorisée).
Acceptation : en-têtes de durcissement présents, origine étrangère non autorisée.

---

### 2.10 ERGONOMIE — restitution des erreurs, chargement, mobile, clavier, contrastes

---

**CAS-ERGO-01 — Le bandeau d'erreur est amené dans le champ de vision**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : formulaire de demande, étape 5 (page longue), champs invalides à l'étape 1.
Étapes : cliquer « Soumettre au banquier » après avoir fait défiler la page vers le bas.
Résultat attendu : le bandeau rouge est rendu avec `role="alert"`, la page défile jusqu'à lui (`block: "center"`) et il reçoit le focus clavier (`document.activeElement` = le conteneur `tabIndex=-1`). Un lecteur d'écran annonce le message. Aucune action n'est silencieuse.
Acceptation : bandeau visible sans défilement manuel **et** focalisé.

---

**CAS-ERGO-02 — Les erreurs parlent métier, pas technique**
Niveau : FRONT · Criticité : MAJEUR
Étapes : provoquer les erreurs de CAS-DEM-03 puis une erreur d'import (`entrees.12.riskLevel`).
Résultat attendu : la liste du bandeau affiche `Adresse du site`, `RNE`, `Description de l'activité`, `Niveau de vigilance (ligne 13)` — jamais `siteUrl`, `rne`, `entrees.12.riskLevel`. Le numéro de ligne affiché est celui du fichier (indice + 1).
Acceptation : aucun nom technique visible.

---

**CAS-ERGO-03 — États de chargement**
Niveau : FRONT · Criticité : MAJEUR
Étapes (réseau bridé à « Slow 3G ») :
1. Recharger l'application avec un jeton valide en `localStorage`.
2. Ouvrir `/demandes/<id>`.
3. Cliquer « Enregistrer le brouillon », puis « Valider l'affiliation » côté banquier.
Résultat attendu : (1) le texte `Chargement de la session…` est affiché tant que `/api/auth/me` n'a pas répondu, sans écran vide · (2) `Chargement…` est affiché avant l'arrivée du détail · (3) les boutons d'action passent à l'état `disabled` (opacité 0.55, curseur `not-allowed`) pendant l'appel : un double-clic ne déclenche pas deux écritures.
Acceptation : aucun écran vide, aucun double envoi possible.

---

**CAS-ERGO-04 — Serveur injoignable : la session n'est pas perdue**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : session ouverte, jeton en `localStorage`.
Étapes : arrêter l'API, recharger la page.
Résultat attendu : le jeton **n'est pas** effacé ; le message `Session non vérifiée : le serveur est injoignable. Vos identifiants sont conservés.` est disponible ; après redémarrage de l'API et rechargement, la session reprend sans ressaisie. À l'inverse, un 401 explicite efface bien le jeton et renvoie vers `/connexion`.
Acceptation : distinction effective entre panne réseau (jeton conservé) et refus serveur (jeton effacé).

---

**CAS-ERGO-05 — Affichage à 375 px (mobile)**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : fenêtre 375 × 812.
Étapes : parcourir `/connexion`, `/demandes`, `/demandes/nouvelle` (5 étapes), `/demandes/<id>`, `/referentiel`, `/administration/comptes`, `/administration/import`.
Résultat attendu sur chaque écran :
- aucun **défilement horizontal de la page** (`document.documentElement.scrollWidth <= 375`) ;
- les tableaux défilent dans leur propre cadre (`.tableau`, `overflow-x: auto`), jamais la page ;
- les grilles passent en une colonne (`minmax(260px, 1fr)` / `minmax(320px, 1fr)`) ;
- la barre supérieure se replie (`flex-wrap`) et tous ses liens restent atteignables ;
- les 5 onglets d'étape restent cliquables (`min-width: 150px`, retour à la ligne autorisé) ;
- aucun texte tronqué ni superposé ; aucune zone cliquable inférieure à 32 × 32 px.
Acceptation : les 6 points sont vrais sur les 7 écrans.

---

**CAS-ERGO-06 — Parcours complet au clavier**
Niveau : FRONT · Criticité : MAJEUR
Étapes : sans souris, depuis `/connexion` : se connecter, ouvrir « Nouvelle demande », remplir les 5 étapes, sélectionner un MCC, soumettre.
Résultat attendu :
- l'ordre de tabulation suit l'ordre visuel ;
- chaque champ est atteignable et associé à son intitulé (`label[for]` ↔ `input[id]`, vérifiable pour `champ-siteName`, `champ-activityDescription`, `case-hasSubscription`…) ;
- les cartes MCC sont des `<button>` activables par `Entrée` et `Espace`, porteuses de `aria-pressed` reflétant la sélection ;
- l'élément focalisé est **visible** (anneau `box-shadow` sur les champs, anneau du navigateur sur les boutons) ;
- aucun piège au clavier ; `Échap` ne perd pas la saisie.
Acceptation : le parcours aboutit à une soumission sans souris et chaque étape du focus est visible.

---

**CAS-ERGO-07 — Contrastes**
Niveau : FRONT · Criticité : MAJEUR
Étapes : mesurer le rapport de contraste (WCAG 2.1) des couples suivants :
| Élément | Premier plan | Arrière-plan | Seuil |
| --- | --- | --- | --- |
| Texte courant | `--gris-900` `#1f2933` | `--gris-050` `#f7f9fb` | ≥ 4,5:1 |
| Aide sous un champ (`.champ__aide`) | `--gris-700` `#3e4c59` | `#ffffff` | ≥ 4,5:1 |
| Message d'erreur (`.champ__erreur`) | `--rouge` `#b3261e` | `#ffffff` | ≥ 4,5:1 |
| Onglet d'étape inactif (`.etape`) | `--gris-700` | `--gris-050` | ≥ 4,5:1 |
| Libellés de la barre supérieure | `#d7e3ef` / `#a8c0d6` | `--bleu-900` `#0b2545` | ≥ 4,5:1 |
| Bouton principal | `#ffffff` | `--bleu-500` `#1b6ca8` | ≥ 4,5:1 |
| Bouton « Valider » | `#ffffff` | `--vert` `#1b7f5a` | ≥ 4,5:1 |
| Étiquettes de statut et jetons | texte | fond de l'étiquette | ≥ 4,5:1 |
Résultat attendu : tous les couples atteignent 4,5:1 (3:1 admis pour les textes ≥ 18,66 px gras). `--gris-500` `#7b8794` (3,66:1 sur blanc) ne doit être utilisé que comme **bordure** ou **filet**, jamais comme couleur de texte.
Acceptation : zéro couple sous son seuil ; consigner chaque mesure.

---

**CAS-ERGO-08 — Tableau de bord : compteurs et filtres**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : au moins une demande dans chacun des 5 statuts, dans la banque de l'utilisateur.
Étapes :
1. Ouvrir `/demandes`.
2. Filtrer par statut, puis par recherche (référence, raison sociale, RNE).
Résultat attendu : les compteurs affichent exactement les valeurs de `GET /api/requests/stats` (`BROUILLON`, `SOUMISE`, `COMPLEMENT_REQUIS`, `VALIDEE`, `REJETEE`, `TOTAL`) ; chaque filtre restreint la liste en conséquence ; une liste vide affiche un message explicite et non un tableau vide sans en-tête.
Acceptation : compteurs égaux à l'API et filtres opérants.

---

**CAS-ERGO-09 — Journal d'une demande : nominatif et horodaté**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : demande ayant parcouru `CREATION → SOUMISSION → COMPLEMENT_REQUIS → MODIFICATION → SOUMISSION → VALIDATION`.
Étapes : ouvrir `/demandes/<id>` et lire le journal.
Résultat attendu : six entrées, dans l'ordre chronologique, chacune avec son libellé français (`Demande créée`, `Soumise au banquier`, `Complément demandé à l’agent`, `Demande modifiée`, `Validée sans modification des MCC`…), le **nom et le rôle** de l'auteur et la date au format `JJ/MM/AAAA HH:MM`. Le commentaire du banquier est affiché tel quel.
Acceptation : six entrées nominatives et horodatées, libellés conformes.

---

**CAS-ERGO-10 — Le code proposé reste visible à côté du code retenu**
Niveau : FRONT · Criticité : MAJEUR
Préconditions : demande VALIDEE avec substitution (CAS-WF-05).
Étapes : ouvrir `/demandes/<id>`.
Résultat attendu : l'écran affiche simultanément le MCC **proposé par l'agent** (`5977`) et le MCC **retenu par le banquier** (`5912` / `5999`) pour chaque réseau, avec une mention explicite de la modification ; les propositions figées du moteur restent consultables sur la même page.
Acceptation : les deux valeurs sont lisibles sans navigation supplémentaire.

---

**CAS-ERGO-11 — Import : l'écran ne laisse pas croire qu'une simulation a écrit**
Niveau : FRONT · Criticité : MAJEUR
Étapes : charger un fichier sur `/administration/import` sans confirmer.
Résultat attendu : le bandeau `Simulation — aucune donnée modifiée` est affiché ; les compteurs (ajoutés / modifiés / inchangés / absents / sans lexique) sont présents ; le bouton d'application demande une **seconde** confirmation récapitulant `X ajout(s), Y modification(s)[, Z désactivation(s)]` avant toute écriture ; la case « Désactiver les N code(s) absent(s) du fichier » est **décochée par défaut**.
Acceptation : simulation clairement identifiée, case décochée, double confirmation.

---

**CAS-ERGO-12 — Message explicite quand aucune proposition n'est disponible**
Niveau : FRONT · Criticité : MINEUR
Étapes :
1. Aller à l'étape 4 sans avoir décrit l'activité.
2. Décrire l'activité avec un secteur inconnu injecté (provoquer une erreur 400 sur `/api/mcc/suggest`).
Résultat attendu : (1) le message `Complétez la description de l'activité à l'étape précédente pour obtenir des propositions de MCC.` est affiché · (2) le bandeau `Propositions indisponibles` reprend le message serveur et le détail par champ — l'agent n'est **jamais** laissé devant une liste vide sans explication.
Acceptation : un message adapté dans chacun des deux cas.

---

## 3. Matrice de couverture

Légende :
- **Auto** : comportement déjà vérifié par un test automatisé existant (`cd server && npm test`, **166 tests** répartis en 10 fichiers, état du 2026-09-23 au commit `3a7ac2e`). Le cas reste utile comme référence, il n'a pas à être rejoué à la main.
- **Partiel** : un test existe mais ne couvre qu'une partie du cas ; le **reste** doit être exécuté manuellement. La colonne « Reste à faire » dit quoi.
- **Manuel** : aucun test automatisé ; le cas est à exécuter intégralement.
- Filière : **API** (recette API) ou **Nav.** (recette navigateur). Les cas « LES DEUX » apparaissent dans les deux filières.

> **Amendement du 2026-09-23 — table reprise sur la suite réelle.** La table avait été établie
> sur une suite de 94 tests. Elle en compte **166**, et quatre fichiers se sont ajoutés :
> `vague3.test.js` (correctifs de la vague 3), `import.test.js` (EVO-01), `limitation.test.js`
> (EVO-11) et `habilitations.test.js` (décision D-3). Les lignes ci-dessous ont été reprises en
> **ouvrant les tests**, et non en se fiant à leur intitulé : un test peut porter le nom d'un
> cas sans en couvrir la moitié — c'est ce qui était arrivé à CAS-MCC-11, dont le test se
> contentait d'un `length >= 1`. Seules les lignes dont la couverture a réellement changé sont
> modifiées ; les autres sont laissées telles quelles.
>
> **Reprise du 2026-09-23 après le commit `3a7ac2e`.** La suite passe de 165 à **166** —
> décompte relevé fichier par fichier : `robustesse` 51, `admin` 30, `requests` 22,
> `habilitations` 19, `mcc` 11, `indexation` 10, `vague3` 9, `auth` 6, `import` 6,
> `limitation` 2. Le mouvement tient à un seul fichier, `habilitations.test.js` : le cas *le
> banquier consulte le journal de sa banque* n'assertait que `Array.isArray(items)` — il
> passait aussi bien sur le journal de toute la plateforme, et **survivait au retrait du
> filtre**. Il est remplacé par deux cas qui tombent quand la garde disparaît (§ 3.2,
> CAS-HAB-11). Les lignes CAS-HAB-04 et CAS-HAB-11 sont reprises en conséquence ; les autres
> restent inchangées, les tests correspondants n'ayant pas bougé.

### 3.1 AUTH

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-AUTH-01 | Partiel | `server/tests/auth.test.js` — *un agent se connecte avec ses identifiants* | `last_login_at`, écran de connexion | API + Nav. |
| CAS-AUTH-02 | Auto | `server/tests/auth.test.js` — *un mot de passe erroné est rejeté sans révéler…* | — | API |
| CAS-AUTH-03 | Manuel | — | tout | API |
| CAS-AUTH-04 | Partiel | `server/tests/auth.test.js` — *une route protégée refuse un appel sans jeton* | jeton illisible, schéma `Basic` | API |
| CAS-AUTH-05 | Auto | `server/tests/auth.test.js` — *le serveur répond au contrôle de santé* | — | API |
| CAS-AUTH-06 | Auto | `server/tests/robustesse.test.js` — *un compte désactivé perd immédiatement ses accès* ; `admin.test.js` — *un compte désactivé ne peut plus se connecter* | — | API |
| CAS-AUTH-07 | **Manuel** | — | tout (**aucun test sur la banque désactivée**) | API |
| CAS-AUTH-08 | Partiel | `server/tests/robustesse.test.js` — *un agent muté de banque perd l'accès…* (`GET` et `PUT` en **404**) | la comparaison au 404 d'un identifiant libre, ajoutée au cas le 2026-09-23 | API |
| CAS-AUTH-09 | Auto | `server/tests/robustesse.test.js` — *un changement de rôle s'applique sans reconnexion* | — | API |
| CAS-AUTH-10 | Auto | `server/tests/robustesse.test.js` — *une réinitialisation de mot de passe ferme les sessions…* | — | API |
| CAS-AUTH-11 | Partiel | `server/tests/admin.test.js` — *la réinitialisation par l'administrateur force un changement* | les 3 routes bloquées, l'accès maintenu à `/api/auth`, l'écran | API + Nav. |
| CAS-AUTH-12 | Partiel | `server/tests/admin.test.js` — *la création de compte impose une politique…* | les 4 variantes sur `/api/auth/password` | API + Nav. |
| CAS-AUTH-13 | Partiel | `server/tests/admin.test.js` — *un mot de passe identique à l'ancien est refusé* | mot de passe actuel erroné, péremption de l'ancien jeton | API + Nav. |
| CAS-AUTH-14 | Manuel | — | tout | API |
| CAS-AUTH-15 | Partiel | `server/tests/limitation.test.js` — *au-delà du quota, un corps invalide reçoit 429 et non 400* (route réelle, `Retry-After`, message) ; `robustesse.test.js` — *les tentatives répétées…* (composant isolé) | **la clé par compte** : les deux fichiers n'éprouvent que la clé d'adresse IP, chaque tentative visant une adresse différente | API |
| CAS-AUTH-16 | Partiel | `server/tests/limitation.test.js` — *un corps invalide est compté, et une connexion réussie remet le compteur à zéro* | le scénario par **tentatives erronées** (401) sur un même compte, et non par corps invalides (400) | API |
| CAS-AUTH-17 | Auto | `server/tests/limitation.test.js` — les 2 cas (séquence `400, 400, 400, 429`, puis refus de la connexion valide) | — | API |

### 3.2 HABILITATION

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-HAB-01 | Partiel | `server/tests/requests.test.js` — *un banquier saisit des demandes dans sa banque (D-3)* ; `habilitations.test.js` — *le banquier saisit, soumet puis arbitre un dossier de sa banque*, *le banquier reprend le dossier d'un agent de sa banque* | URL `/demandes/nouvelle` à l'écran en banquier | API + Nav. |
| CAS-HAB-02 | Partiel | `server/tests/requests.test.js` — *un agent ne peut pas arbitrer une demande* | absence des boutons à l'écran | API + Nav. |
| CAS-HAB-03 | Partiel | `server/tests/habilitations.test.js` — *l'agent n'administre rien* (4 routes), *le référentiel MCC reste hors de portée du banquier* ; `admin.test.js` — *l'administration est fermée aux autres profils* | `POST /api/admin/mcc/import` pour l'agent ; URL forcée et découpage des onglets à l'écran | API + Nav. |
| CAS-HAB-04 | Partiel | `server/tests/requests.test.js` — *une demande reste invisible pour une autre banque* (404, **comparé au 404 d'un identifiant libre** : le test tombe si les deux refus se remettent à différer) ; `habilitations.test.js` — *le banquier ne voit ni ne touche un dossier d'une autre banque* (`GET`, `PUT`, `submit`, les trois en 404) | `events`, `suggestions`, écran | API + Nav. |
| CAS-HAB-05 | Manuel | — | tout (D6, close par la décision D-1 : le cas ne sert plus qu'à consigner) | API |
| CAS-HAB-06 | Partiel | `server/tests/habilitations.test.js` — *un agent ne modifie pas le dossier d'un autre agent de sa banque* (`PUT`, message exact) | la lecture autorisée (200 sur `GET`) et le refus sur `submit` | API |
| CAS-HAB-07 | Partiel | `server/tests/mcc.test.js` (rôle agent seulement) | rôles banquier et admin | API |
| CAS-HAB-08 | Manuel | — | tout | API |
| CAS-HAB-09 | Manuel | — | tout | Nav. |
| CAS-HAB-10 | Manuel | — | tout | Nav. |
| CAS-HAB-11 | Partiel | `server/tests/habilitations.test.js` — 7 cas : *le banquier administre les comptes de sa banque*, *la banque du compte créé est celle du banquier…*, *il ne crée ni banquier ni administrateur*, *ne promeut pas un de ses agents*, *ne déplace pas un compte vers une autre banque*, *ne touche à aucun compte d'une autre banque* (404, comparé au 404 d'un identifiant libre), *ne modifie pas un compte banquier ou administrateur de sa banque* ; + 2 cas sur le journal : *le journal du banquier ne porte que les actions de sa banque* (une action de l'administrateur sur une autre banque et une action sur le référentiel MCC n'y entrent pas ; une action de l'administrateur sur un compte de **sa** banque y entre) et *une mutation de banque ne fait pas franchir la cloison à l'historique* | le formulaire de création à l'écran (rôle figé, banque pré-remplie) | API + Nav. |
| CAS-HAB-12 | Partiel | `server/tests/habilitations.test.js` — *le référentiel MCC reste hors de portée du banquier* (5 routes), *il ne crée pas de banque et ne voit que la sienne*, *il ne désactive pas sa propre banque* | redirection de `/administration/referentiel` à l'écran | API + Nav. |

### 3.3 DEMANDE

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-DEM-01 | Auto | `server/tests/requests.test.js` — *un agent saisit une demande et obtient une référence* | valeurs par défaut, événement CREATION | API |
| CAS-DEM-02 | Manuel | — | tout | API |
| CAS-DEM-03 | Partiel | `server/tests/requests.test.js` — *les champs obligatoires sont contrôlés champ par champ* (3 champs) ; *un descriptif trop court est refusé* | les 6 autres lignes du tableau | API |
| CAS-DEM-04 | Manuel | — | tout | Nav. |
| CAS-DEM-05 | Manuel | — | tout | Nav. |
| CAS-DEM-06 | Manuel | — | tout | Nav. |
| CAS-DEM-07 | Partiel | `server/tests/requests.test.js` — *une demande est modifiable tant qu'elle est au brouillon* | non-écrasement des champs absents, journal | API |
| CAS-DEM-08 | Manuel | — | tout | API |
| CAS-DEM-09 | Manuel | — | tout | API |
| CAS-DEM-10 à 14 | Manuel | — | tout | Nav. |

### 3.4 WORKFLOW

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-WF-01 | Auto | `server/tests/requests.test.js` — *la soumission fige les propositions du moteur* | — | API |
| CAS-WF-02 | Auto | `server/tests/requests.test.js` — *la soumission exige un MCC Visa et un MCC Mastercard* | message à l'écran | API + Nav. |
| CAS-WF-03 | Auto | `server/tests/requests.test.js` — *une demande soumise n'est plus modifiable par l'agent* | — | API |
| CAS-WF-04 | Auto | `server/tests/requests.test.js` — *le banquier valide en conservant les MCC proposés* | type d'événement | API |
| CAS-WF-05 | Auto | `server/tests/requests.test.js` — *le banquier peut substituer un autre MCC, réseau par réseau* | affichage proposé/retenu | API + Nav. |
| CAS-WF-06 | Auto | `server/tests/requests.test.js` — *un rejet ou une demande de complément exige un commentaire* | commentaire vide `""`, codes finaux à `null` | API |
| CAS-WF-07 | Manuel | — | tout | API |
| CAS-WF-08 | Auto | `server/tests/requests.test.js` — *une demande renvoyée pour complément redevient modifiable…* ; *le journal retrace chaque étape* | remise à `null` du décideur | API + Nav. |
| CAS-WF-09 | Manuel | — | tout (statut REJETEE terminal) | API |
| CAS-WF-10 | Partiel | `server/tests/requests.test.js` — *seule une demande soumise peut être arbitrée* | `PUT` et `submit` sur VALIDEE | API |
| CAS-WF-11 | Auto | `server/tests/requests.test.js` — *seule une demande soumise peut être arbitrée* | — | API |
| CAS-WF-12 | Auto | `server/tests/robustesse.test.js` — *deux soumissions simultanées : une seule aboutit* | — | API |
| CAS-WF-13 | Auto | `server/tests/robustesse.test.js` — *deux décisions contradictoires simultanées* | — | API |
| CAS-WF-14 | Auto | `server/tests/requests.test.js` — *la photographie des suggestions est autoportante (EVO-08)* (libellé d'époque conservé après renommage, `libelleActuel`, `plusAuReferentiel` après désactivation) ; *une demande antérieure à la migration se relit en repli (EVO-08)* | — | API |
| CAS-WF-15 | Manuel | — | tout | API |

### 3.5 MCC

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-MCC-01 | Partiel | `server/tests/mcc.test.js` — *chaque proposition porte une description et les termes qui l'ont déclenchée* | ordre et scores exacts | API |
| CAS-MCC-02 | Auto | `server/tests/mcc.test.js` — *la suggestion propose les mêmes codes pour Visa et Mastercard* | message à l'écran | API + Nav. |
| CAS-MCC-03 | Manuel | — | tout | API |
| CAS-MCC-04 | Partiel | `server/tests/mcc.test.js` — *une activité numérique fait remonter les MCC de biens numériques* | scores exacts, marqueur abonnement | API |
| CAS-MCC-05 | Partiel | `server/tests/mcc.test.js` — *une place de marché est orientée vers le MCC 5262* ; `vague3.test.js` — *la case « place de marché » pèse réellement sur le classement*, *un descriptif qui décrit une place de marché prime sur la case décochée* (les deux branches du texte amendé) | la **valeur exacte** du score (90) : les tests éprouvent le rang et le sens de la variation, pas le chiffre | API |
| CAS-MCC-06 | Partiel | `server/tests/mcc.test.js` — *aucun MCC interdit n'est jamais proposé automatiquement* (1 formulation) | 2 autres formulations | API |
| CAS-MCC-07 | Partiel | `server/tests/requests.test.js` — *un MCC non éligible ne peut pas être proposé* ; *le banquier ne peut pas retenir un MCC interdit* | cas `PUT` | API |
| CAS-MCC-08 | Auto | `server/tests/admin.test.js` — *un code désactivé disparaît du catalogue et n'est plus sélectionnable* | — | API |
| CAS-MCC-09 | Manuel | — | tout | API + Nav. |
| CAS-MCC-10 | Partiel | `server/tests/mcc.test.js` — *la recherche par mot-clé remonte le MCC attendu* ; `robustesse.test.js` — *une pagination négative…* | classement, bornes de `limit`, recherche vide | API |
| CAS-MCC-11 | Auto | `server/tests/vague3.test.js` — *un descriptif sans correspondance ne renvoie que le code de repli* (assertion sur la liste **entière**, `['5999']`) et *aucune proposition n'est servie sans terme justificatif* (11 profils × 2 réseaux) ; `robustesse.test.js` (DEF-A3-03) ; `mcc.test.js` (EVO-02, repli désactivé) | — | API |
| CAS-MCC-12 | Manuel | — | tout | API |
| CAS-MCC-13 | Manuel | — | tout | API |
| CAS-MCC-14 | Manuel | — | tout | Nav. |
| CAS-MCC-15 | Partiel | `server/tests/admin.test.js` — *le changement de niveau de vigilance s'applique immédiatement* | cas de la désactivation | API |

### 3.6 ADMIN

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-ADM-01 | Auto | `server/tests/admin.test.js` — *un administrateur liste les comptes avec leur banque* (+ créations dans les autres tests) | contrôle du hachage bcrypt en base | API |
| CAS-ADM-02 | Auto | `server/tests/admin.test.js` — *un compte créé doit changer son mot de passe à la première connexion* | — | API + Nav. |
| CAS-ADM-03 | Partiel | `server/tests/admin.test.js` — *la création de compte impose une politique de mot de passe* | cas de la réinitialisation | API |
| CAS-ADM-04 | Auto | `server/tests/admin.test.js` — *une adresse e-mail déjà utilisée est refusée* ; *l'unicité de l'adresse ne dépend pas de la casse (EVO-03)* (doublon de casse, écriture directe en base refusée en `23505`, création concurrente, cas du `PUT`) | — | API |
| CAS-ADM-05 | Manuel | — | tout | API |
| CAS-ADM-06 | Auto | `server/tests/admin.test.js` — *le rôle et la banque d'un compte sont modifiables* ; *le journal porte les valeurs avant et après (EVO-05)* ; *la modification de banque est journalisée de la même façon* | écran Journal | API + Nav. |
| CAS-ADM-07 | Manuel | — | tout | API |
| CAS-ADM-08 | Auto | `server/tests/admin.test.js` — *un administrateur ne peut ni changer son propre rôle ni se désactiver* | absence des commandes à l'écran | API + Nav. |
| CAS-ADM-09 | Auto | `server/tests/admin.test.js` — *la plateforme refuse de perdre son dernier administrateur* | — | API |
| CAS-ADM-10 | Auto | `server/tests/robustesse.test.js` — *deux administrateurs qui se rétrogradent simultanément* | — | API |
| CAS-ADM-11 | Auto | `server/tests/admin.test.js` — *un compte désactivé ne peut plus se connecter* | — | API |
| CAS-ADM-12 | Partiel | `server/tests/admin.test.js` — *les banques sont créées, listées et modifiées* | doublon de code, code trop court, compteurs | API + Nav. |
| CAS-ADM-13 | Auto | `server/tests/admin.test.js` — *une banque comptant des utilisateurs actifs ne peut pas être désactivée* | texte exact du message | API |
| CAS-ADM-14 | Auto | `server/tests/admin.test.js` — *la vue administrateur expose aussi les codes interdits et désactivés* | — | API |
| CAS-ADM-15 | Auto | `server/tests/admin.test.js` — *un MCC est modifiable et la modification est historisée* | ligne du journal d'administration | API + Nav. |
| CAS-ADM-16 | Manuel | — | tout (actions DESACTIVATION / REACTIVATION) | API |
| CAS-ADM-17 | Auto | `server/tests/admin.test.js` — *un code absent du manuel peut être ajouté* | valeurs par défaut, code à 2 chiffres | API + Nav. |
| CAS-ADM-18 | Auto | `server/tests/robustesse.test.js` — *deux créations simultanées du même MCC : 201 puis 409* | — | API |
| CAS-ADM-19 | Manuel | — | tout | API |
| CAS-ADM-20 | Manuel | — | tout | API |
| CAS-ADM-21 | Partiel | `server/tests/admin.test.js` — *les actions d'administration sont journalisées* ; *les 250 entrées se remontent page par page, sans doublon ni oubli* ; *les filtres se cumulent* ; *les filtres illisibles sont refusés en français* | bornes hostiles de `limit` (`0`, `-5`, `abc`, `1e9`), écran Journal | API + Nav. |
| CAS-ADM-22 | Auto | `server/tests/admin.test.js` — *le seed ne réécrit pas les ajustements de la conformité* | — | API |

### 3.7 IMPORT

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-IMPORT-01 | Partiel | `server/tests/robustesse.test.js` — *la route d'export sert bien un classeur Excel* | CSV, `actifsSeuls`, nom de fichier, téléchargement navigateur | API + Nav. |
| CAS-IMPORT-02 | Auto | `server/tests/robustesse.test.js` — *un aller-retour export puis relecture ne modifie aucun code* | — | API |
| CAS-IMPORT-03 | Auto | `server/tests/robustesse.test.js` — *le CSV est accepté au même titre que l'Excel* | volumétrie 279 en CSV | API |
| CAS-IMPORT-04 | Auto | `server/tests/robustesse.test.js` — *un fichier métier désordonné est lu, et ses anomalies signalées* | — | API |
| CAS-IMPORT-05 | Partiel | `server/tests/robustesse.test.js` (quelques valeurs) | les 12 traductions | API |
| CAS-IMPORT-06 | Partiel | `server/tests/import.test.js` — *CAS-IMPORT-06 — les anomalies portent leur numéro de ligne* (ligne sans code, doublon, pertinence et vigilance illisibles, avec le numéro de ligne exact) ; `robustesse.test.js` — *un fichier métier désordonné…* | écran (tableau d'anomalies) | API + Nav. |
| CAS-IMPORT-07 | Manuel | — | tout | API |
| CAS-IMPORT-08 | Partiel | `server/tests/import.test.js` — *CAS-IMPORT-08 — la simulation n'écrit rien, ni par fichier ni par JSON* (photographie de la base comparée avant/après) ; `admin.test.js` — *l'import produit un rapport d'écart sans rien modifier* | bandeau « Simulation » à l'écran | API + Nav. |
| CAS-IMPORT-09 | Partiel | `server/tests/import.test.js` — *CAS-IMPORT-09 — rien n'est appliqué sans confirmation explicite* (`apply` absent, `false`, `"false"`, `0` : aucune écriture ; seul `true` écrit) ; `admin.test.js` — *l'import applique les écarts et historise chaque code touché* | journal `IMPORT_REFERENTIEL`, double confirmation à l'écran | API + Nav. |
| CAS-IMPORT-10 | Auto | `server/tests/import.test.js` — *CAS-IMPORT-10 — la désactivation des absents est strictement optionnelle* (`deactivateMissing: true`, une ligne `IMPORT_DESACTIVATION` par code avec son motif, aucun code supprimé, code désactivé non servi à l'agent) ; `robustesse.test.js` — *la chaîne « false » ne déclenche pas un import destructeur* | — | API |
| CAS-IMPORT-11 | Partiel | `server/tests/robustesse.test.js` — *le secteur est comparé à l'import et n'est plus perdu (D2 et D3)* (l'écart de secteur seul est détecté et porte le champ `sectors`) | l'**application** confirmée du seul changement de secteur, et le passage par un fichier Excel | API |
| CAS-IMPORT-12 | Partiel | `server/tests/robustesse.test.js` — *le secteur est comparé à l'import et n'est plus perdu (D2 et D3)* (aller-retour export → relecture, les deux secteurs conservés) ; `vague3.test.js` — *le cycle exporter → relire → appliquer ne modifie aucun code*, *un secteur long survit à la validation de l'import* | l'aller-retour en **CSV**, et le cas d'un code par ailleurs modifié | API |
| CAS-IMPORT-13 | Auto | `server/tests/indexation.test.js` — *le rapport d'import signale les codes sans lexique métier* | bandeau et tableau à l'écran | API + Nav. |
| CAS-IMPORT-14 | Partiel | `server/tests/robustesse.test.js` — *un fichier sans colonne « code »…* ; *un format non pris en charge est refusé* | fichier absent, en-tête seul, > 5 Mo, JSON invalide | API |
| CAS-IMPORT-15 | Partiel | `server/tests/admin.test.js` — *un fichier d'import invalide est rejeté avant toute écriture* ; `robustesse.test.js` — *chaque ligne d'un import est validée* | bornes 0 / 2001, doublon, code à 2 chiffres | API |
| CAS-IMPORT-16 | Auto | `server/tests/robustesse.test.js` — *l'import reste réservé à l'administrateur* | rôle banquier, export et lecture de fichier | API |

### 3.8 INDEXATION

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-INDEX-01 | Auto | `server/tests/indexation.test.js` — *un code importé est indexé immédiatement, sans redémarrage* | — | API |
| CAS-INDEX-02 | Auto | `server/tests/indexation.test.js` — *ses mots-clés sont dérivés de son libellé et de sa description* | plafond de 30, bloc en lecture seule à l'écran | API + Nav. |
| CAS-INDEX-03 | Auto | `server/tests/indexation.test.js` — *le singulier retrouve un libellé écrit au pluriel* | — | API |
| CAS-INDEX-04 | Partiel | `server/tests/indexation.test.js` — *un lexique métier saisi à la main reste plus fort que les dérivés* | absence avant saisie (« patinette ») | API |
| CAS-INDEX-05 | Auto | `server/tests/indexation.test.js` — *un lexique métier saisi à la main reste plus fort que les dérivés* | — | API |
| CAS-INDEX-06 | Partiel | `server/tests/robustesse.test.js` — *modifier un MCC ne le relègue pas en fin de secteur (C-14)*, *un nouveau rattachement prend la fin de file, sans bousculer les autres (C-14)* | l'effet du rang sur le bonus de secteur (`38 − rang × 4`), non éprouvé | API |
| CAS-INDEX-07 | Partiel | `server/tests/indexation.test.js` — *un secteur inconnu est refusé* ; *la colonne « Secteur » du fichier rattache le code à l'import* ; *un code importé peut être rattaché à un secteur et en bénéficie* | via `/api/requests` | API |
| CAS-INDEX-08 | Auto | `server/tests/indexation.test.js` — *l'index est reconstruit quand le libellé change* | recalcul de `keywordsAuto` | API |
| CAS-INDEX-09 | Partiel | `server/tests/indexation.test.js` — *les secteurs sont servis depuis la base* ; `mcc.test.js` — *les secteurs d'activité sont exposés au formulaire* | désactivation d'un secteur | API |
| CAS-INDEX-10 | Auto | `server/tests/admin.test.js` — *le changement de niveau de vigilance s'applique immédiatement au moteur* | — | API |

### 3.9 ROBUSTESSE

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-ROB-01 | Auto | `server/tests/robustesse.test.js` — *la chaîne « false » ne déclenche pas un import destructeur* ; *active : « false » désactive…* | variantes `"0"`, `"non"`, `""` sur une demande | API |
| CAS-ROB-02 | Auto | `server/tests/robustesse.test.js` — *une valeur booléenne incompréhensible est refusée, pas devinée* | — | API |
| CAS-ROB-03 | Auto | `server/tests/robustesse.test.js` — *les drapeaux métier « false » ne faussent pas le moteur* | — | API |
| CAS-ROB-04 | Partiel | `server/tests/robustesse.test.js` — *une date inexistante est refusée avant PostgreSQL* | les 6 autres valeurs | API |
| CAS-ROB-05 | Partiel | `server/tests/robustesse.test.js` — *un montant hors capacité de colonne est refusé* | négatif, texte, infini, borne exacte | API |
| CAS-ROB-06 | Auto | `server/tests/robustesse.test.js` — *un octet NUL est refusé au lieu de casser l'encodage* | autres caractères de contrôle, `\n`/`\t` acceptés | API |
| CAS-ROB-07 | Partiel | `server/tests/robustesse.test.js` — *un identifiant non numérique donne 400 et non 500* | 8 autres formes | API |
| CAS-ROB-08 | Partiel | `server/tests/robustesse.test.js` — *une pagination négative est ramenée à une borne saine* | `/api/mcc`, `/api/admin/events`, offset géant | API |
| CAS-ROB-09 | Manuel | — | tout | API |
| CAS-ROB-10 | Manuel | — | tout | API + Nav. |
| CAS-ROB-11 | Manuel | — | tout | API |
| CAS-ROB-12 | Manuel | — | tout | API |
| CAS-ROB-13 | Manuel | — | tout | API |
| CAS-ROB-14 | Manuel | — | tout | API + Nav. |
| CAS-ROB-15 | Partiel | `server/tests/robustesse.test.js` — *chaque ligne d'un import est validée, pas seulement son code* | `keywords`, `similar`, `networks`, `sectors` sur `PUT /api/admin/mcc` | API |
| CAS-ROB-16 | Manuel | — | tout | API |

### 3.10 ERGONOMIE

| Cas | Couverture | Filière |
| --- | --- | --- |
| CAS-ERGO-01 à CAS-ERGO-12 | **Manuel** — aucun test automatisé côté interface (pas de suite front dans le dépôt) | Nav. |

### 3.11 Récapitulatif de couverture

| Domaine | Cas | Auto | Partiel | Manuel |
| --- | --- | --- | --- | --- |
| AUTH | 17 | 6 | 8 | 3 |
| HABILITATION | 12 | 0 | 8 | 4 |
| DEMANDE | 14 | 1 | 2 | 11 |
| WORKFLOW | 15 | 11 | 1 | 3 |
| MCC | 15 | 4 | 6 | 5 |
| ADMIN | 22 | 12 | 4 | 6 |
| IMPORT | 16 | 5 | 9 | 2 |
| INDEXATION | 10 | 5 | 4 | 1 |
| ROBUSTESSE | 16 | 3 | 5 | 8 |
| ERGONOMIE | 12 | 0 | 0 | 12 |
| **Total** | **149** | **47** | **47** | **55** |

> **Amendement du 2026-09-23.** Deux cas ajoutés (CAS-HAB-11 et CAS-HAB-12, bornes de la
> décision D-3), d'où 147 → **149**. Le reste du mouvement tient aux quatre fichiers de tests
> apparus depuis : 8 cas quittent « Manuel » (dont CAS-AUTH-17, CAS-WF-14, CAS-IMPORT-11 et
> -12, CAS-INDEX-06) et deux lignes d'import **régressent** de « Auto » vers « Partiel »
> (CAS-IMPORT-08 et -09), non parce que la couverture a diminué mais parce que leur volet écran
> n'a jamais été couvert et que l'ancienne table l'omettait. Le solde reste très favorable :
> 63 cas manuels deviennent 55, alors que le plan compte deux cas de plus. La colonne « Auto »
> ne vaut que pour les cas de niveau BACK : dès qu'un cas est « LES DEUX », son volet écran le
> maintient en « Partiel », aucune suite front n'existant dans le dépôt.

> **Rectificatif du 2026-09-23 (suite au commit `3a7ac2e`).** Un seul mouvement : **CAS-AUTH-08
> passe de « Auto » à « Partiel »** — 48/46 deviennent **47/47**. Ce n'est pas la couverture qui
> a baissé mais l'exigence qui a monté : depuis que le refus inter-banques est un 404, le cas
> demande en plus que ce refus soit **indiscernable** de celui d'un identifiant libre, et le
> test automatisé ne fait pas cette comparaison. Le nombre de cas manuels, lui, est inchangé.

### 3.12 Répartition par criticité et par niveau

| Domaine | Cas | BLOQUANT | MAJEUR | MINEUR | BACK | FRONT | LES DEUX |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH | 17 | 8 | 6 | 3 | 13 | 0 | 4 |
| HABILITATION | 12 | 5 | 4 | 3 | 3 | 2 | 7 |
| DEMANDE | 14 | 2 | 8 | 4 | 4 | 8 | 2 |
| WORKFLOW | 15 | 9 | 6 | 0 | 5 | 0 | 10 |
| MCC | 15 | 4 | 8 | 3 | 8 | 1 | 6 |
| ADMIN | 22 | 7 | 12 | 3 | 8 | 0 | 14 |
| IMPORT | 16 | 7 | 9 | 0 | 8 | 0 | 8 |
| INDEXATION | 10 | 3 | 6 | 1 | 7 | 0 | 3 |
| ROBUSTESSE | 16 | 1 | 12 | 3 | 14 | 0 | 2 |
| ERGONOMIE | 12 | 0 | 11 | 1 | 0 | 12 | 0 |
| **Total** | **149** | **46** | **82** | **21** | **70** | **23** | **56** |

### 3.13 Les cinq cas à exécuter en priorité

| Rang | Cas | Pourquoi |
| --- | --- | --- |
| 1 | **CAS-AUTH-11** — changement obligatoire imposé par le serveur | Seule barrière entre un mot de passe provisoire connu de l'administrateur et l'ensemble des données clients ; couverte partiellement et jamais côté écran. |
| 2 | **CAS-HAB-04** — cloisonnement inter-banques | Une fuite ici expose les données commerciales et le RNE des clients d'une banque concurrente ; les routes `events`, `suggestions` et `PUT` ne sont pas couvertes. |
| 3 | **CAS-MCC-07** — refus API d'un MCC interdit sur les trois points d'entrée | Un code interdit accepté engage la banque sur une activité non éligible ; le chemin `PUT /api/requests/:id` n'est couvert par aucun test. |
| 4 | **CAS-WF-13** — deux décisions simultanées | Une demande portant deux décisions contradictoires est irrattrapable en audit ; garde-fou porté par une seule clause `WHERE`. |
| 5 | **CAS-AUTH-15** — limitation de débit **par compte visé** | La route réelle est désormais éprouvée de bout en bout par `limitation.test.js`, mais sur la seule clé d'adresse IP : la clé par compte — celle qui freine une attaque distribuée sur un compte précis — n'est vérifiée par aucun test. |

---

## 4. Jeux de données

> **Condition de reproductibilité** : ces résultats ont été relevés sur le référentiel d'amorçage intact (279 codes, `npm run db:seed`, aucun code modifié ni désactivé) avec `SUGGESTION_LIMIT = 6`. Tout cas ayant modifié le référentiel (CAS-MCC-08, CAS-ADM-15, CAS-INDEX-*, CAS-IMPORT-09…) doit être suivi d'une remise à zéro avant de rejouer un cas de la section MCC.

### 4.1 Corps de demande commun

Toutes les demandes partent de ce socle ; chaque jeu ne redéfinit que les champs de la §4.2.

```json
{
  "siteName": "<voir 4.2>",
  "siteUrl": "<voir 4.2>",
  "siteLanguages": "Français, arabe",
  "companyName": "<voir 4.2>",
  "legalForm": "SARL",
  "rne": "<voir 4.2>",
  "taxId": "1234567/A/M/000",
  "companyCreatedOn": "2021-03-15",
  "shareCapital": 50000,
  "contactFirstName": "Amine",
  "contactLastName": "Zouari",
  "contactEmail": "contact@exemple.tn",
  "contactPhone": "+216 71 123 456",
  "addressLine1": "12 rue de Marseille",
  "city": "Tunis",
  "postalCode": "1001",
  "governorate": "Tunis",
  "country": "Tunisie",
  "activitySector": "<voir 4.2>",
  "activityDescription": "<voir 4.2>",
  "deliveryMode": "<voir 4.2>",
  "hasSubscription": false,
  "isMarketplace": false,
  "sellsAbroad": false,
  "currency": "TND",
  "proposedVisaMcc": "<MCC attendu>",
  "proposedMastercardMcc": "<MCC attendu>",
  "proposedJustification": "Code retenu au vu de l'activité déclarée."
}
```

### 4.2 Les dix jeux

| Jeu | Société / RNE / site | Secteur, livraison, drapeaux | Description d'activité (à copier telle quelle, **sans accents**) |
| --- | --- | --- | --- |
| **JD-01** | `BELDI SARL` · RNE `1234567ABC` · `https://beldi-cosmetics.tn` | `BEAUTE_COSMETIQUE` · `PHYSIQUE` | `Vente en ligne de cosmetiques naturels, huiles essentielles et savons artisanaux fabriques en Tunisie` |
| **JD-02** | `TAAM EXPRESS SUARL` · RNE `2234567BCD` · `https://taam-express.tn` | `RESTAURATION` · `PHYSIQUE` | `Plateforme de commande et de livraison de repas prepares par des restaurants partenaires a Tunis` |
| **JD-03** | `LIBRAIRIE EL KITAB SA` · RNE `3234567CDE` · `https://elkitab.tn` | `LIVRES_CULTURE` · `PHYSIQUE` | `Librairie en ligne proposant des livres neufs et d occasion, romans, bandes dessinees et manuels scolaires` |
| **JD-04** | `SOFTGEST SARL` · RNE `4234567DEF` · `https://softgest.tn` | `INFORMATIQUE_LOGICIEL` · `NUMERIQUE` · `hasSubscription: true` | `Editeur de logiciels de gestion vendus en telechargement avec abonnement mensuel pour les PME` |
| **JD-05** | `DAR MODA SARL` · RNE `5234567EFG` · `https://darmoda.tn` | `MODE_HABILLEMENT` · `PHYSIQUE` | `Boutique en ligne de vetements pour femmes : robes, chemisiers, pantalons et accessoires de mode` |
| **JD-06** | `SOUK ONLINE SA` · RNE `6234567FGH` · `https://souk-online.tn` | `MARKETPLACE` · `PHYSIQUE` · `isMarketplace: true` | `Place de marche generaliste regroupant des vendeurs tiers tunisiens vendant vetements, high tech et maison` |
| **JD-07** | `PARAPHARM PLUS SARL` · RNE `7234567GHI` · `https://parapharm-plus.tn` | `SANTE` · `PHYSIQUE` | `Parapharmacie en ligne : complements alimentaires, produits d hygiene et materiel medical leger` |
| **JD-08** | `MOBILIS VERT SUARL` · RNE `8234567HIJ` · `https://mobilis-vert.tn` | `AUTOMOBILE` · `PHYSIQUE` | `Vente de trottinettes electriques, velos a assistance electrique et pieces detachees pour la mobilite urbaine` |
| **JD-09** | `ATELIER DU TEMPS SUARL` · RNE `9234567IJK` · `https://atelier-du-temps.tn` | *(aucun secteur)* · `SERVICE` | `Atelier de reparation de montres mecaniques anciennes et remplacement de bracelets sur mesure` |
| **JD-10** | `TEST NEUTRE SARL` · RNE `1034567JKL` · `https://test-neutre.tn` | *(aucun secteur)* · `PHYSIQUE` | `zzzz qqqq wwww xxxx yyyy kkkk jjjj hhhh gggg ffff` |

### 4.3 Résultats attendus du moteur (`POST /api/mcc/suggest`, `limit = 6`)

| Jeu | Rang 1 | Les codes proposés, dans l'ordre | Scores correspondants |
| --- | --- | --- | --- |
| JD-01 | **5977** Cosmétiques et parfumerie | `5977, 7230, 7298, 5912, 5999` — **5 propositions** | `74, 66, 63, 57, 50` |
| JD-01 *sans secteur* | **5977** | `5977, 5999` — **2 propositions** | `54, 50` |
| JD-02 | **5812** Restaurants | `5812, 5814, 5811, 4214, 5992, 5818` | `82, 80, 73, 60, 51, 48` |
| JD-03 | **5942** Librairies | `5942, 5815, 5994, 5521, 5931, 5733` | `75, 74, 66, 65, 63, 61` |
| JD-04 | **5734** Magasins de logiciels | `5734, 5817, 4816, 7372, 4899, 5815` | `78, 75, 73, 73, 67, 61` |
| JD-05 | **5691** Magasins de vêtements homme et femme | `5691, 5651, 5621, 5611, 5641, 5631` | `78, 73, 73, 72, 72, 70` |
| JD-06 | **5262** Places de marché | `5262, 5732, 5200, 5719, 5691, 5712` | `90, 67, 65, 65, 58, 58` |
| JD-07 | **5047** Matériel médical, dentaire, ophtalmique et hospitalier (gros) | `5047, 8011, 8099, 5912, 5499, 7394` | `85, 75, 71, 69, 63, 61` |
| JD-08 | **5013** Fournitures et pièces détachées automobiles (gros) | `5013, 5533, 5532, 5511, 5065, 5571` | `81, 76, 63, 62, 60, 60` |
| JD-09 | **5697** Retouches et couture sur mesure | `5697, 7699, 7622, 7631, 7629, 7538` | `68, 63, 62, 62, 56, 55` |
| JD-10 | **5999** Commerces de détail spécialisés divers *(repli)* | `5999` seul — **1 proposition** | `10` — `matchedTerms = ["aucune correspondance : code de repli"]` |

Le nombre de propositions fait partie du résultat attendu : `limit = 6` est un plafond, pas
une consigne de remplissage. Trois jeux en rendent moins de six, et c'est conforme.

Un écart sur l'un de ces tableaux, sur un référentiel intact, est un **défaut de non-régression du moteur**, pas un aléa.

> **Amendement du 2026-09-23 — trois attendus rectifiés (JD-01, JD-01 sans secteur, JD-10).**
> La rédaction initiale décrivait un moteur antérieur aux corrections de la vague 3. Depuis,
> le moteur applique l'invariant **« aucune proposition sans terme justificatif »**
> (`mccSuggestion.js`, filtre `rawScore > 0 && matchedTerms.length > 0`) : une carte que le
> banquier ne peut rattacher à aucun mot de la demande n'a pas sa place dans la liste. La
> queue de classement à `31` a donc disparu — c'étaient les six MCC de vente à distance, qui
> ne tenaient leur score que du bonus de pertinence e-commerce, sans la moindre
> correspondance. Les listes de JD-01 se raccourcissent d'autant, et JD-10, qui n'était
> constitué que de cette queue, atteint désormais la branche de repli sur `5999` : elle n'est
> plus inatteignable, ce qui **clôt la divergence D4** et rend au filet de sécurité annoncé
> par le README son effet réel.
>
> **Ce n'est pas une régression.** Le rapport `docs/non-regression-lot1.md` § 3.1 établit, en
> interrogeant le moteur au commit antérieur `154edba` puis à `c9abaf3`, que le comportement
> est rigoureusement le même avant et après le lot 1 : c'est le document qui était périmé,
> pas le moteur.
>
> **Valeurs remesurées le 2026-09-23** sur un référentiel intact (279 codes actifs,
> conformes au catalogue d'amorçage au champ près, `SUGGESTION_LIMIT = 6`), les onze
> exécutions étant relevées une à une. Les huit autres lignes du tableau sont inchangées :
> elles ont été remesurées et concordent au point près avec la rédaction initiale. Parité
> Visa / Mastercard : **identique sur les onze exécutions**.
>
> Mesure faite hors de l'instance de démonstration du port 4000 : quatre de ses codes
> (`5698`, `5942`, `5977`, `5999`) ont été modifiés en recette et son référentiel n'est plus
> intact — il y rend `5977` à 76 et non à 74. La condition de reproductibilité posée en tête
> du § 4 n'est donc pas une précaution de style : elle décide du résultat.

> **Complément du 2026-09-23 — le corps envoyé au moteur fait partie de la condition.**
> Contrôle du tableau refait le même jour sur le catalogue d'amorçage intact (279 codes,
> secteurs initiaux, chargés par `rechargerCatalogue()` puis interrogés par
> `suggestForNetworks()`, `limit = 6`). **Les onze lignes sont confirmées au point près**,
> celles rectifiées ci-dessus comprises, et la parité Visa / Mastercard tient sur les onze
> exécutions.
>
> Mais elles ne sont vraies que si le moteur reçoit **les trois seuls champs d'activité** —
> `activitySector`, `deliveryMode`, `activityDescription` (plus `hasSubscription` pour JD-04 et
> `isMarketplace` pour JD-06). C'est la forme employée par `docs/non-regression-lot1.md` § 3.1,
> et c'est elle que ce tableau décrit. Si l'on envoie en plus le socle du § 4.1 — `siteName`,
> `siteUrl`, `companyName` —, les noms propres pèsent à leur tour et le classement bouge :
>
> | Jeu | Trois champs d'activité | Socle complet du § 4.1 |
> | --- | --- | --- |
> | JD-01 | `5977:74, 7230:66, 7298:63, 5912:57, 5999:50` — 5 propositions | `5977:75, 7230:66, 7298:63, 5912:57, 5999:50, 5968:32` — 6 propositions |
> | JD-01 *sans secteur* | `5977:54, 5999:50` — 2 propositions | `5977:56, 5999:50, 5968:32, 7399:32, 5311:14` — 5 propositions |
> | JD-02 | `…, 5992:51, 5818:48` | `…, 5992:51, 4215:48` |
> | JD-10 | `5999:10` *(repli)* | `8734:24`, `matchedTerms = ["test"]` — le mot **TEST** de la raison sociale `TEST NEUTRE SARL` suffit à accrocher un code |
>
> Les sept autres jeux rendent le même classement dans les deux formes. **À rejouer avec les
> trois champs d'activité seuls**, faute de quoi quatre lignes sur onze tombent en KO sans
> qu'aucune régression ne soit en cause. Le cas de JD-10 est le plus parlant : le jeu est
> construit pour n'accrocher aucun code, et c'est le nom de la société de test — et non le
> descriptif — qui le fait sortir du repli.

### 4.4 Codes MCC de référence pour les cas d'interdiction et de vigilance

| Usage | Code | Libellé | Niveau |
| --- | --- | --- | --- |
| Interdit « métier » | `7995` | Paris, loteries et jeux de hasard | INTERDIT |
| Interdit « contenus » | `5967` | Contenus et services pour adultes | INTERDIT |
| Interdit « crypto » | `6051` | Institutions non financières – devises, actifs liquides et crypto-actifs | INTERDIT |
| Interdit « technique » | `9950` | Achats intra-groupe | INTERDIT |
| Sensible | `5912` | Pharmacies et parapharmacies | SENSIBLE |
| Sensible | `5960` | Vente à distance – services d'assurance | SENSIBLE |
| Standard, à désactiver en recette | `5942` | Librairies | STANDARD |
| Code de repli | `5999` | Commerces de détail spécialisés divers | STANDARD |

Liste complète des 12 codes INTERDIT du référentiel d'amorçage : `5723, 5967, 6010, 6011, 6051, 7800, 7801, 7802, 7995, 9406, 9702, 9950`.

### 4.5 Codes à créer pour les cas d'indexation et d'import

| Code | Libellé | Description | Mots-clés | Secteur | Utilisé par |
| --- | --- | --- | --- | --- | --- |
| `9101` | `Bornes de recharge pour véhicules électriques` | `Exploitation de bornes de recharge et abonnements associés.` | *(aucun)* | *(aucun)* | CAS-INDEX-01/02/06/08 |
| `9102` | `Conciergerie numérique` | `Plateformes de conciergerie du quotidien.` | *(aucun)* | *(aucun)* | CAS-IMPORT-13 (code « muet ») |
| `9103` | `Ateliers de réparation de drones` | `Réparation de drones civils.` | `drone`, `reparation drone` | *(aucun)* | CAS-IMPORT-13 |
| `9104` | `Cours de cuisine en ligne` | `Ateliers culinaires à distance.` | *(aucun)* | `EDUCATION_FORMATION` | CAS-IMPORT-13 |
| `9105` | `Trottinettes électriques` | `Vente et entretien de trottinettes électriques.` | *(aucun, puis `patinette`)* | `AUTOMOBILE` | CAS-INDEX-03/04 |
| `9201` | `Code de recette import` | `Code ajouté par le fichier d'import de recette.` | *(aucun)* | *(aucun)* | CAS-IMPORT-08/09 |

Les mots-clés dérivés attendus pour `9101` (`GET /api/admin/mcc/9101` → `keywordsAuto`) sont :
`bornes recharge`, `recharge vehicules`, `vehicules electriques`, `bornes`, `borne`, `recharge`, `recharges`, `vehicules`, `vehicule`, `electriques`, `electrique`, `exploitation`, `exploitations`, `abonnements`, `abonnement`, `associes`, `associe` (plus les dérivés du libellé anglais s'il est renseigné), soit **au plus 30 entrées**.

### 4.6 Comptes à créer pour les cas d'habilitation et d'administration

| Identifiant | Rôle | Banque | Mot de passe initial | Utilisé par |
| --- | --- | --- | --- | --- |
| `recette1@banque.tn` | AGENT | BQ001 | `Recette#2026` | CAS-ADM-01/02/03, CAS-AUTH-11/12 |
| `recette2@banque.tn` | AGENT | BQ001 | `Recette#2026` | CAS-HAB-06 (second agent de la même banque) |
| `recette-bq@banque.tn` | AGENT | BQ003 | `Recette#2026` | CAS-AUTH-07 (banque désactivée) |
| `admin2@clicktopay.tn` | ADMIN | BQ001 | `Recette#2026` | CAS-ADM-08/09/10 |
| `admin3@clicktopay.tn` | ADMIN | BQ001 | `Recette#2026` | CAS-ADM-10 (rétrogradation croisée) |

Banques à créer : `BQ003 — Banque de Recette Habilitation`, `BQ009 — Banque de Recette` (CAS-ADM-12).

---

## 5. Conduite de la campagne

1. **Ordre conseillé** : AUTH → HABILITATION → DEMANDE → WORKFLOW → MCC → INDEXATION → IMPORT → ADMIN → ROBUSTESSE → ERGONOMIE. Les domaines MCC et INDEXATION passent **avant** ADMIN et IMPORT, qui modifient le référentiel.
2. **Remise à zéro** : après tout cas marqué comme modifiant le référentiel ou la population de comptes, rejouer `npm run db:seed` (ou `resetDatabase()`), puis revérifier `GET /api/mcc` → `total = 279` avant d'enchaîner sur un cas de la section 4.3.
3. **Cas destructifs à isoler** : CAS-ADM-08/09/10 (population d'administrateurs), CAS-AUTH-07 (banque désactivée), CAS-IMPORT-10 (désactivation en masse), CAS-ROB-12 (arrêt de la base).
4. **Remontée** : pour chaque cas, consigner `identifiant | OK/KO | preuve` (code HTTP et corps, ou capture d'écran nommée `CAS-XXX-NN.png`). Un cas « partiellement OK » est un **KO**.
5. **Divergences** : les cas D1 à D7 ne sont pas des échecs de la plateforme mais des écarts entre le README et le code. Les consigner dans une rubrique distincte à destination de l'agent 7.
