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
Résultat attendu : (1) le code `5262` est en **rang 1** avec le score **90** et `matchedTerms` contenant `place de marché` · (2) `5262` n'est plus en rang 1 (pénalité de −25).
Acceptation : 5262 premier avec 90 % en (1), déclassé en (2).

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
