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
Résultat attendu : étape 3 → HTTP 403 `{"error":"Cette demande appartient à une autre banque."}`.
Acceptation : le jeton, non réémis, ne donne plus accès au dossier de l'ancienne banque.

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

**CAS-AUTH-17 — Divergence D5 : un corps invalide n'alimente pas le compteur**
Niveau : BACK · Criticité : MINEUR
Préconditions : idem CAS-AUTH-15, compteur vierge.
Étapes :
1. Envoyer 15 `POST /api/auth/login` avec `{"email":"agent@banque.tn"}` (sans `password`).
2. Envoyer un `POST /api/auth/login` avec `{"email":"agent@banque.tn","password":"Faux#12345"}`.
Résultat attendu (comportement **actuel** du code) : (1) 15 réponses 400 · (2) HTTP 401, pas 429 — le compteur n'a pas été incrémenté par les corps invalides.
Acceptation : consigner le résultat observé. Si (2) répond 401, la divergence D5 est confirmée et doit être remontée comme constat, non comme échec bloquant.

---

### 2.2 HABILITATION — droits par rôle, cloisonnement, URL forcée

---

**CAS-HAB-01 — Le banquier ne saisit pas de demande**
Niveau : LES DEUX · Criticité : BLOQUANT
Préconditions : jeton `banquier@banque.tn`.
Étapes :
1. `POST /api/requests` avec un corps valide (jeu JD-01).
2. `PUT /api/requests/<id d'une demande BROUILLON>` avec `{"siteName":"X"}`.
3. `POST /api/requests/<id>/submit`.
4. (FRONT) Connecté en banquier, saisir `/demandes/nouvelle` dans la barre d'adresse.
Résultat attendu : (1)(2)(3) → HTTP **403** `{"error":"Action réservée aux profils : AGENT"}` · (4) redirection immédiate vers `/demandes`, le formulaire n'est jamais rendu (aucun champ « Nom du site » dans le DOM).
Acceptation : trois 403 côté API **et** redirection côté écran.

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

**CAS-HAB-03 — L'espace d'administration est fermé aux autres profils**
Niveau : LES DEUX · Criticité : BLOQUANT
Étapes :
1. Jeton AGENT puis jeton BANQUIER : `GET /api/admin/users`, `GET /api/admin/banks`, `GET /api/admin/mcc`, `GET /api/admin/events`, `POST /api/admin/mcc/import`.
2. (FRONT) Connecté en agent, saisir `/administration/comptes` dans la barre d'adresse.
Résultat attendu : (1) les 10 appels répondent **403** `{"error":"Action réservée aux profils : ADMIN"}` · (2) redirection vers `/demandes`, aucun onglet d'administration rendu ; le lien « Administration » est absent de l'en-tête.
Acceptation : 10 réponses 403 et redirection effective.

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
6. (FRONT) Connecté en agent2, ouvrir `/demandes/<D>`.
Résultat attendu : (1) à (4) → HTTP **403** `{"error":"Cette demande appartient à une autre banque."}` · (5) la liste ne contient **aucune** demande dont `bankId` ≠ BQ002 · (6) l'écran n'affiche que le bandeau d'erreur « Cette demande appartient à une autre banque. », aucune donnée du e-commerçant (ni raison sociale, ni RNE, ni e-mail de contact).
Acceptation : aucune donnée de BQ001 n'est lisible par BQ002, à aucun des six points.

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
Résultat attendu : l'écran s'ouvre (l'ADMIN est `isAgent` dans `AuthContext`), le lien « Nouvelle demande » est visible dans l'en-tête.
Acceptation : cohérence entre les droits serveur (CAS-HAB-05) et l'affichage ; toute divergence est un défaut d'ergonomie à consigner.

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
Résultat attendu : HTTP 200 ; `siteName` modifié ; `taxId`, `postalCode`, `proposedJustification` **inchangés** (non remis à `null`). Un événement `MODIFICATION` est ajouté avec `payload.champs = ["siteName"]`.
Acceptation : un seul champ modifié, journal conforme.

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

| Statut de départ | `PUT` (agent) | `submit` (agent) | `decision` (banquier) |
| --- | --- | --- | --- |
| BROUILLON | 200 | 200 → SOUMISE | 409 |
| SOUMISE | 409 | 409 | 200 → VALIDEE / REJETEE / COMPLEMENT_REQUIS |
| COMPLEMENT_REQUIS | 200 | 200 → SOUMISE | 409 |
| VALIDEE | 409 | 409 | 409 |
| REJETEE | 409 | 409 | 409 |

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
Résultat attendu : HTTP 200 ; `VISA` contient 6 éléments ; les codes dans l'ordre exact `5977, 7230, 7298, 5912, 5999, 5960` avec les scores `74, 66, 63, 57, 50, 31`. Chaque élément porte `label`, `description` (français, non vide), `descriptionEn`, `score`, `rawScore` et `matchedTerms` (tableau non vide pour les 5 premiers, contenant notamment `secteur : Beauté, cosmétique et parfumerie`).
Acceptation : ordre, scores et présence des 6 attributs conformes.

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
Résultat attendu : (1) ordre `5977, 5999, 5960, 5962, 5964, 5965`, score de `5977` = **54** · (2) ordre `5977, 7230, 7298, 5912, 5999, 5960`, score de `5977` = **74** et `matchedTerms` contient `secteur : Beauté, cosmétique et parfumerie`. Les codes `7230`, `7298`, `5912` n'apparaissent que dans le second appel.
Acceptation : les deux ordres et les deux scores sont exacts.

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

**CAS-MCC-11 — Divergence D4 : le repli sur 5999 est-il atteignable ?**
Niveau : BACK · Criticité : MINEUR
Étapes : `POST /api/mcc/suggest` `{"activityDescription":"zzzz qqqq wwww xxxx yyyy kkkk jjjj hhhh gggg ffff"}`.
Résultat attendu (comportement **actuel**) : HTTP 200, 6 propositions — `5960, 5962, 5964, 5965, 5968, 5969` — toutes au score **31**, `matchedTerms` **vide**, et **pas** la carte de repli `5999` annoncée par le commentaire du code.
Acceptation : consigner la liste obtenue. Si elle ne contient pas l'entrée `{code:"5999", matchedTerms:["aucune correspondance : code de repli"]}`, la divergence D4 est confirmée : le filet de sécurité est du code mort et l'agent reçoit six codes de vente à distance sans aucune justification affichée. À remonter comme défaut d'explicabilité (MAJEUR côté métier, MINEUR côté technique).

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
Résultat attendu (comportement **actuel**) : (2) `5977` est classé dans `inchanges` (le champ `sector` n'est pas dans `COMPARABLES`) · (4) `sectors` vaut toujours `["BEAUTE_COSMETIQUE"]` : le changement de secteur **n'a pas été appliqué**, sans le moindre message.
Acceptation : si `sectors` n'a pas changé, la divergence D2 est confirmée — la colonne `Secteur` du fichier n'est opérante que sur un code **ajouté** ou par ailleurs modifié. À remonter comme défaut MAJEUR (le README l'annonce comme un moyen de rattachement).

---

**CAS-IMPORT-12 — Divergence D3 : perte des secteurs multiples à l'aller-retour**
Niveau : BACK · Criticité : MAJEUR
Préconditions : `PUT /api/admin/mcc/5912` `{"sectors":["SANTE","BEAUTE_COSMETIQUE"]}` (deux secteurs).
Étapes :
1. `GET /api/admin/mcc/export?format=csv` → repérer la ligne `5912`.
2. Dans le fichier, modifier **uniquement** son libellé (pour le faire entrer dans `modifies`).
3. `POST /api/admin/mcc/import` avec `apply = true`.
4. `GET /api/admin/mcc/5912` → relever `sectors`.
Résultat attendu (comportement **actuel**) : (1) la colonne `Secteur` ne contient qu'**un seul** secteur (`sectors[0]`) · (4) `sectors` ne vaut plus qu'un seul élément : le second rattachement a été **effacé** par `ecrireSecteurs`.
Acceptation : si `sectors.length` passe de 2 à 1, la divergence D3 est confirmée (perte de donnée silencieuse à l'aller-retour) — défaut MAJEUR.

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
Résultat attendu (comportement **actuel**) : (2) `mccs = ["5995","9101"]` — le nouveau code est placé **en dernier**, malgré le commentaire du code qui annonce « le rang suit l'ordre fourni » · (4) `mccs = ["9101","5995"]` : le simple ré-enregistrement des secteurs de `5995` l'a **rétrogradé en fin de liste**, et le bonus de secteur (`38 − rang × 4`) en est affecté.
Acceptation : si l'ordre change en (4) sans que l'administrateur ne l'ait demandé, la divergence D1 est confirmée — défaut MAJEUR (l'ordre de priorité d'un secteur n'est ni pilotable ni stable).

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
- **Auto** : comportement déjà vérifié par un test automatisé existant (`cd server && npm test`, 94 tests, 94 succès au 2026-09-21). Le cas reste utile comme référence, il n'a pas à être rejoué à la main.
- **Partiel** : un test existe mais ne couvre qu'une partie du cas ; le **reste** doit être exécuté manuellement. La colonne « Reste à faire » dit quoi.
- **Manuel** : aucun test automatisé ; le cas est à exécuter intégralement.
- Filière : **API** (recette API) ou **Nav.** (recette navigateur). Les cas « LES DEUX » apparaissent dans les deux filières.

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
| CAS-AUTH-08 | Auto | `server/tests/robustesse.test.js` — *un agent muté de banque perd l'accès…* | — | API |
| CAS-AUTH-09 | Auto | `server/tests/robustesse.test.js` — *un changement de rôle s'applique sans reconnexion* | — | API |
| CAS-AUTH-10 | Auto | `server/tests/robustesse.test.js` — *une réinitialisation de mot de passe ferme les sessions…* | — | API |
| CAS-AUTH-11 | Partiel | `server/tests/admin.test.js` — *la réinitialisation par l'administrateur force un changement* | les 3 routes bloquées, l'accès maintenu à `/api/auth`, l'écran | API + Nav. |
| CAS-AUTH-12 | Partiel | `server/tests/admin.test.js` — *la création de compte impose une politique…* | les 4 variantes sur `/api/auth/password` | API + Nav. |
| CAS-AUTH-13 | Partiel | `server/tests/admin.test.js` — *un mot de passe identique à l'ancien est refusé* | mot de passe actuel erroné, péremption de l'ancien jeton | API + Nav. |
| CAS-AUTH-14 | Manuel | — | tout | API |
| CAS-AUTH-15 | **Partiel** | `server/tests/robustesse.test.js` — *les tentatives répétées finissent par être refusées* (**teste le composant isolé, pas la route `/api/auth/login`**) | bout en bout sur la route réelle, `Retry-After`, clé par compte | API |
| CAS-AUTH-16 | Manuel | — | tout | API |
| CAS-AUTH-17 | Manuel | — | tout (divergence D5) | API |

### 3.2 HABILITATION

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-HAB-01 | Partiel | `server/tests/requests.test.js` — *un banquier ne saisit pas de demande* | `PUT`, `submit`, URL forcée à l'écran | API + Nav. |
| CAS-HAB-02 | Partiel | `server/tests/requests.test.js` — *un agent ne peut pas arbitrer une demande* | absence des boutons à l'écran | API + Nav. |
| CAS-HAB-03 | Auto | `server/tests/admin.test.js` — *l'administration est fermée aux autres profils* ; `robustesse.test.js` — *l'import reste réservé à l'administrateur* | URL forcée à l'écran | API + Nav. |
| CAS-HAB-04 | Partiel | `server/tests/requests.test.js` — *une demande reste invisible pour une autre banque* | `events`, `suggestions`, `PUT`, écran | API + Nav. |
| CAS-HAB-05 | Manuel | — | tout (divergence D6) | API |
| CAS-HAB-06 | Manuel | — | tout | API |
| CAS-HAB-07 | Partiel | `server/tests/mcc.test.js` (rôle agent seulement) | rôles banquier et admin | API |
| CAS-HAB-08 | Manuel | — | tout | API |
| CAS-HAB-09 | Manuel | — | tout | Nav. |
| CAS-HAB-10 | Manuel | — | tout | Nav. |

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
| CAS-WF-14 | Manuel | — | tout (immuabilité de la photographie) | API |
| CAS-WF-15 | Manuel | — | tout | API |

### 3.5 MCC

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-MCC-01 | Partiel | `server/tests/mcc.test.js` — *chaque proposition porte une description et les termes qui l'ont déclenchée* | ordre et scores exacts | API |
| CAS-MCC-02 | Auto | `server/tests/mcc.test.js` — *la suggestion propose les mêmes codes pour Visa et Mastercard* | message à l'écran | API + Nav. |
| CAS-MCC-03 | Manuel | — | tout | API |
| CAS-MCC-04 | Partiel | `server/tests/mcc.test.js` — *une activité numérique fait remonter les MCC de biens numériques* | scores exacts, marqueur abonnement | API |
| CAS-MCC-05 | Partiel | `server/tests/mcc.test.js` — *une place de marché est orientée vers le MCC 5262* | contre-épreuve `isMarketplace: false` | API |
| CAS-MCC-06 | Partiel | `server/tests/mcc.test.js` — *aucun MCC interdit n'est jamais proposé automatiquement* (1 formulation) | 2 autres formulations | API |
| CAS-MCC-07 | Partiel | `server/tests/requests.test.js` — *un MCC non éligible ne peut pas être proposé* ; *le banquier ne peut pas retenir un MCC interdit* | cas `PUT` | API |
| CAS-MCC-08 | Auto | `server/tests/admin.test.js` — *un code désactivé disparaît du catalogue et n'est plus sélectionnable* | — | API |
| CAS-MCC-09 | Manuel | — | tout | API + Nav. |
| CAS-MCC-10 | Partiel | `server/tests/mcc.test.js` — *la recherche par mot-clé remonte le MCC attendu* ; `robustesse.test.js` — *une pagination négative…* | classement, bornes de `limit`, recherche vide | API |
| CAS-MCC-11 | **Partiel** | `server/tests/mcc.test.js` — *un descriptif sans correspondance retombe sur un code de repli* (**assertion trop faible : `length >= 1`**) | vérifier réellement le repli (divergence D4) | API |
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
| CAS-ADM-04 | Auto | `server/tests/admin.test.js` — *une adresse e-mail déjà utilisée est refusée* | cas du `PUT` et de la casse | API |
| CAS-ADM-05 | Manuel | — | tout | API |
| CAS-ADM-06 | Auto | `server/tests/admin.test.js` — *le rôle et la banque d'un compte sont modifiables* | journal `payload.champs` | API + Nav. |
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
| CAS-ADM-21 | Partiel | `server/tests/admin.test.js` — *les actions d'administration sont journalisées* | bornes de `limit`, écran Journal | API + Nav. |
| CAS-ADM-22 | Auto | `server/tests/admin.test.js` — *le seed ne réécrit pas les ajustements de la conformité* | — | API |

### 3.7 IMPORT

| Cas | Couverture | Fichier / test existant | Reste à faire | Filière |
| --- | --- | --- | --- | --- |
| CAS-IMPORT-01 | Partiel | `server/tests/robustesse.test.js` — *la route d'export sert bien un classeur Excel* | CSV, `actifsSeuls`, nom de fichier, téléchargement navigateur | API + Nav. |
| CAS-IMPORT-02 | Auto | `server/tests/robustesse.test.js` — *un aller-retour export puis relecture ne modifie aucun code* | — | API |
| CAS-IMPORT-03 | Auto | `server/tests/robustesse.test.js` — *le CSV est accepté au même titre que l'Excel* | volumétrie 279 en CSV | API |
| CAS-IMPORT-04 | Auto | `server/tests/robustesse.test.js` — *un fichier métier désordonné est lu, et ses anomalies signalées* | — | API |
| CAS-IMPORT-05 | Partiel | `server/tests/robustesse.test.js` (quelques valeurs) | les 12 traductions | API |
| CAS-IMPORT-06 | Partiel | `server/tests/robustesse.test.js` — *un fichier métier désordonné…* | anomalies de pertinence/vigilance, ligne vide, écran | API + Nav. |
| CAS-IMPORT-07 | Manuel | — | tout | API |
| CAS-IMPORT-08 | Auto | `server/tests/admin.test.js` — *l'import produit un rapport d'écart sans rien modifier* | bandeau « Simulation » | API + Nav. |
| CAS-IMPORT-09 | Auto | `server/tests/admin.test.js` — *l'import applique les écarts et historise chaque code touché* | journal `IMPORT_REFERENTIEL`, double confirmation à l'écran | API + Nav. |
| CAS-IMPORT-10 | Partiel | `server/tests/robustesse.test.js` — *la chaîne « false » ne déclenche pas un import destructeur* | `deactivateMissing: true`, historique `IMPORT_DESACTIVATION` | API |
| CAS-IMPORT-11 | Manuel | — | tout (divergence D2) | API |
| CAS-IMPORT-12 | Manuel | — | tout (divergence D3) | API |
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
| CAS-INDEX-06 | Manuel | — | tout (divergence D1) | API |
| CAS-INDEX-07 | Partiel | `server/tests/indexation.test.js` — *un secteur inconnu est refusé* | via import, via `/api/requests` | API |
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
| AUTH | 17 | 5 | 6 | 6 |
| HABILITATION | 10 | 1 | 4 | 5 |
| DEMANDE | 14 | 1 | 2 | 11 |
| WORKFLOW | 15 | 10 | 1 | 4 |
| MCC | 15 | 3 | 7 | 5 |
| ADMIN | 22 | 12 | 4 | 6 |
| IMPORT | 16 | 6 | 6 | 4 |
| INDEXATION | 10 | 5 | 3 | 2 |
| ROBUSTESSE | 16 | 3 | 5 | 8 |
| ERGONOMIE | 12 | 0 | 0 | 12 |
| **Total** | **147** | **46** | **38** | **63** |

### 3.12 Répartition par criticité et par niveau

| Domaine | Cas | BLOQUANT | MAJEUR | MINEUR | BACK | FRONT | LES DEUX |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH | 17 | 8 | 6 | 3 | 13 | 0 | 4 |
| HABILITATION | 10 | 4 | 3 | 3 | 3 | 2 | 5 |
| DEMANDE | 14 | 2 | 8 | 4 | 4 | 8 | 2 |
| WORKFLOW | 15 | 9 | 6 | 0 | 5 | 0 | 10 |
| MCC | 15 | 4 | 8 | 3 | 8 | 1 | 6 |
| ADMIN | 22 | 7 | 12 | 3 | 8 | 0 | 14 |
| IMPORT | 16 | 7 | 9 | 0 | 8 | 0 | 8 |
| INDEXATION | 10 | 3 | 6 | 1 | 7 | 0 | 3 |
| ROBUSTESSE | 16 | 1 | 12 | 3 | 14 | 0 | 2 |
| ERGONOMIE | 12 | 0 | 11 | 1 | 0 | 12 | 0 |
| **Total** | **147** | **45** | **81** | **21** | **70** | **23** | **54** |

### 3.13 Les cinq cas à exécuter en priorité

| Rang | Cas | Pourquoi |
| --- | --- | --- |
| 1 | **CAS-AUTH-11** — changement obligatoire imposé par le serveur | Seule barrière entre un mot de passe provisoire connu de l'administrateur et l'ensemble des données clients ; couverte partiellement et jamais côté écran. |
| 2 | **CAS-HAB-04** — cloisonnement inter-banques | Une fuite ici expose les données commerciales et le RNE des clients d'une banque concurrente ; les routes `events`, `suggestions` et `PUT` ne sont pas couvertes. |
| 3 | **CAS-MCC-07** — refus API d'un MCC interdit sur les trois points d'entrée | Un code interdit accepté engage la banque sur une activité non éligible ; le chemin `PUT /api/requests/:id` n'est couvert par aucun test. |
| 4 | **CAS-WF-13** — deux décisions simultanées | Une demande portant deux décisions contradictoires est irrattrapable en audit ; garde-fou porté par une seule clause `WHERE`. |
| 5 | **CAS-AUTH-15** — limitation de débit sur la route réelle | Le seul test existant exerce le composant isolé, jamais `/api/auth/login` : la protection anti-force brute n'est en réalité pas vérifiée de bout en bout. |

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

| Jeu | Rang 1 | Les 6 codes, dans l'ordre | Scores correspondants |
| --- | --- | --- | --- |
| JD-01 | **5977** Cosmétiques et parfumerie | `5977, 7230, 7298, 5912, 5999, 5960` | `74, 66, 63, 57, 50, 31` |
| JD-01 *sans secteur* | **5977** | `5977, 5999, 5960, 5962, 5964, 5965` | `54, 50, 31, 31, 31, 31` |
| JD-02 | **5812** Restaurants | `5812, 5814, 5811, 4214, 5992, 5818` | `82, 80, 73, 60, 51, 48` |
| JD-03 | **5942** Librairies | `5942, 5815, 5994, 5521, 5931, 5733` | `75, 74, 66, 65, 63, 61` |
| JD-04 | **5734** Magasins de logiciels | `5734, 5817, 4816, 7372, 4899, 5815` | `78, 75, 73, 73, 67, 61` |
| JD-05 | **5691** Magasins de vêtements homme et femme | `5691, 5651, 5621, 5611, 5641, 5631` | `78, 73, 73, 72, 72, 70` |
| JD-06 | **5262** Places de marché | `5262, 5732, 5200, 5719, 5691, 5712` | `90, 67, 65, 65, 58, 58` |
| JD-07 | **5047** Matériel médical, dentaire, ophtalmique et hospitalier (gros) | `5047, 8011, 8099, 5912, 5499, 7394` | `85, 75, 71, 69, 63, 61` |
| JD-08 | **5013** Fournitures et pièces détachées automobiles (gros) | `5013, 5533, 5532, 5511, 5065, 5571` | `81, 76, 63, 62, 60, 60` |
| JD-09 | **5697** Retouches et couture sur mesure | `5697, 7699, 7622, 7631, 7629, 7538` | `68, 63, 62, 62, 56, 55` |
| JD-10 | *(aucune correspondance)* | `5960, 5962, 5964, 5965, 5968, 5969` | `31, 31, 31, 31, 31, 31` — `matchedTerms` vides, **pas** de repli sur `5999` (divergence D4) |

Un écart sur l'un de ces tableaux, sur un référentiel intact, est un **défaut de non-régression du moteur**, pas un aléa.

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
