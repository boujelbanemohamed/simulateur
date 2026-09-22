# Recette vague 2 — exécution des cas BACK (agent 3)

Instance dédiée : port **4011**, base **`clicktopay_recette_back`**, `JWT_SECRET=recette-a3`,
`LOGIN_RATE_LIMIT_MAX=5000` (sauf cas de limitation de débit, joués sur une instance
relancée avec la valeur par défaut). Base remise à l'état de référence avant la campagne
(`DROP SCHEMA public CASCADE` + `node src/db/seed.js`) : 4 utilisateurs, 279 MCC,
0 demande, 2 banques.

Périmètre : cas de niveau **BACK** et **LES DEUX** du plan `docs/plan-de-tests.md`
(la part FRONT des cas « LES DEUX » revient à l'agent 2 et n'est pas jugée ici).

Fichier écrit au fil de l'eau, cas par cas.

## Réserve préalable sur le plan de tests

Le plan renvoie à un **§4 (jeux de données JD-01 à JD-06)** qui **n'existe pas** dans
`docs/plan-de-tests.md` : le document s'arrête à la §3 « Matrice de couverture ».
Seul JD-01 est reconstituable sans ambiguïté (il correspond à `DEMANDE_VALIDE` de
`server/tests/helpers.js`, et les résultats chiffrés attendus le confirment).
JD-02 à JD-06 ne sont décrits que par quelques attributs épars. Les cas qui en
dépendent sont joués avec une reconstitution documentée, ou déclarés `BLOQUÉ`.
Consigné comme **DEF-A3-01** (défaut de plan, MAJEUR).

## Tableau de synthèse

| Cas | Statut | Gravité | Défaut | Note |
|---|---|---|---|---|
| CAS-AUTH-01 | CONFORME | | | 200, jeton à 3 segments, `AGENT`/`BQ001`/`mustChangePassword:false`, `last_login_at` avancé de 16:08:06 à 16:08:37. Part FRONT non jugée. |
| CAS-AUTH-02 | CONFORME | | | Les deux appels renvoient 401 et le corps strictement identique `{"error":"Identifiants incorrects"}`. |
| CAS-AUTH-03 | CONFORME | | | 400 + `{"champ":"email","message":"Adresse e-mail invalide"}` puis `{"champ":"password","message":"Champ obligatoire"}`. |
| CAS-AUTH-04 | CONFORME | | | 401 `Authentification requise` / `Session expirée ou jeton invalide` / `Authentification requise`. |
| CAS-AUTH-05 | CONFORME | | | 200 `{"status":"ok","env":"development","referentiel":"charge"}`. Le champ `referentiel` est un ajout du correctif de santé ; l'acceptation (200 + `status="ok"`) est tenue. |
| CAS-HAB-08 | CONFORME | | | 404 `Route inconnue : GET /api/administration`, 404 `Route inconnue : DELETE /api/requests/1`, 401 `Authentification requise` sans jeton. |
| CAS-AUTH-06 | CONFORME | | | Après désactivation : `GET /api/requests` → 401 `Compte désactivé`, `login` → 401 `Identifiants incorrects`. |
| CAS-AUTH-07 | CONFORME | | | BQ003 + agent3 créés ; compte réactivé (`users.active=true`) mais banque inactive (`banks.active=false`) → `GET /api/auth/me` = 401 `Banque désactivée`. |
| CAS-AUTH-08 | CONFORME | | | Mutation BQ001→BQ002 par l'ADMIN : le même jeton passe de 200 à 403 `Cette demande appartient à une autre banque.` |
| CAS-AUTH-09 | CONFORME | | | 403 `Action réservée aux profils : BANQUIER` puis, après passage BANQUIER, 200 et `status=VALIDEE` avec le **même** jeton. |
| CAS-AUTH-10 | DÉFAUT | MINEUR | DEF-A3-02 | `server/src/middleware/auth.js:55-56` — jeton émis dans la **même seconde** que la réinitialisation : `GET /api/auth/me` répond 200 au lieu de 401. Au-delà d'une seconde d'écart, le 401 attendu est bien rendu. |
| CAS-AUTH-11 | CONFORME | | | 200 `mustChangePassword:true` ; 403 `Vous devez définir un nouveau mot de passe avant d’utiliser la plateforme.` sur `/api/mcc`, `/api/requests`, `/api/admin/users` ; `/api/auth/me` 200 et `/api/auth/password` 200. |
| CAS-AUTH-12 | CONFORME | | | 400 `…au moins 10 caractères` puis 3 × 400 `…une minuscule, une majuscule et un chiffre` ; 200 `{"token":…,"changed":true}` et `must_change_password=false`. |
| CAS-AUTH-13 | CONFORME | | | 400 `Le mot de passe actuel est incorrect.` · 400 `Le nouveau mot de passe doit être différent de l’ancien.` (apostrophe typographique) · 200 · ancien jeton 401 `Mot de passe modifié : reconnectez-vous`, nouveau jeton 200. |
| CAS-AUTH-14 | CONFORME | | | 401 `Session expirée ou jeton invalide` (jeton expiré et jeton signé avec une autre clé), 401 `Compte introuvable` (`sub=999999`). Aucun 500. |
| CAS-ADM-01 | CONFORME | | | 201, `mustChangePassword:true`, `password_hash` en `$2b…` sans le mot de passe en clair, `admin_events` `USER`/`CREATION` avec `payload.email` et `payload.role`. |
| CAS-ADM-02 | CONFORME | | | 200 (`mustChangePassword:true`) → 403 → 200 sur `/api/auth/password` → 200 sur `/api/requests` avec le nouveau jeton. |
| CAS-HAB-01 | CONFORME | | | `POST`, `PUT`, `submit` en banquier → 3 × 403 `Action réservée aux profils : AGENT`. |
| CAS-HAB-02 | CONFORME | | | `decision` en agent → 403 `Action réservée aux profils : BANQUIER`. |
| CAS-HAB-03 | CONFORME | | | 10 appels (5 routes × AGENT/BANQUIER) → 10 × 403 `Action réservée aux profils : ADMIN`. |
| CAS-HAB-04 | CONFORME | | | 4 × 403 `Cette demande appartient à une autre banque.` ; `GET /api/requests` en agent2 ne renvoie que sa propre banque (BQ002). |
| CAS-HAB-05 | CONFORME | | | Divergence **D6 confirmée** : la liste ADMIN contient les demandes BQ001 **et** BQ002 ; le même compte enchaîne `POST` 201, `submit` 200, `decision` 200 ; `/stats` agrège toutes les banques. Comportement consigné, pas un échec. |
| CAS-HAB-06 | CONFORME | | | Lecture 200 ; `PUT` et `submit` par un collègue → 403 `Vous ne pouvez modifier que les demandes que vous avez saisies.` ; base intacte (`site_name` inchangé, `BROUILLON`). |
| CAS-HAB-07 | CONFORME | | | 12 réponses 200 (4 routes × 3 rôles). |
| CAS-DEM-01 | CONFORME | | | 201, `AFF-2026-00001`, `BROUILLON`, `bankId=1`, `createdBy=1`, `country="Tunisie"`, `currency="TND"`, `deliveryMode="PHYSIQUE"` ; `request_events` = 1 ligne `CREATION` portant `payload.reference`. |
| CAS-DEM-02 | CONFORME | | | 400 `Données invalides`, exactement 11 `details`, tous `"Champ obligatoire"`, sur les 11 champs attendus et aucun autre. |
| CAS-DEM-03 | CONFORME | | | 9 envois → 9 × 400, message strictement égal à la colonne attendue pour chacun (dont le double message `Numéro de téléphone trop court` + `…invalide` sur `+216`). Table inchangée (1 → 1). |
| CAS-DEM-07 | CONFORME | | | 200 ; `siteName` modifié ; `taxId`, `postalCode`, `proposedJustification` intacts ; événement `MODIFICATION` avec `payload.champs=["siteName"]`. |
| CAS-DEM-08 | CONFORME | | | 200 ; les 5 colonnes valent `NULL` en base et `null` en lecture. Aucun 500. |
| CAS-DEM-09 | CONFORME | | | `{}` → 200 sans nouvel événement ; `{"champInconnu":"x"}` → 200, demande inchangée, compteur d'événements `MODIFICATION` stable à 2. |
| CAS-WF-01 | CONFORME | | | 200, `SOUMISE`, `submittedAt` non nul, `decidedAt`/`decidedBy`/`decisionComment` à `null` ; événement `SOUMISSION` avec `payload.visa/mastercard = "5977"` et `payload.suggestions` ; `mcc_suggestions` : 6 lignes VISA et 6 MASTERCARD. |
| CAS-WF-02 | CONFORME | | | 2 × 400 `Un MCC Visa et un MCC Mastercard doivent être proposés avant la soumission.` ; statut `BROUILLON` conservé. |
| CAS-WF-03 | CONFORME | | | 2 × 409 `Une demande au statut SOUMISE n'est plus modifiable par l'agent.` ; `site_name` intact. |
| CAS-WF-04 | CONFORME | | | 200, `VALIDEE`, `finalVisaMcc`/`finalMastercardMcc` = `"5977"`, `decidedBy`/`decidedAt` renseignés, événement **`VALIDATION`** avec `proposes` = `retenus`. |
| CAS-WF-05 | CONFORME | | | `finalVisaMcc="5912"`, `finalMastercardMcc="5999"`, propositions inchangées à `5977` ; événement `VALIDATION_AVEC_MODIFICATION` avec `proposes`/`retenus` conformes. |
| CAS-WF-06 | CONFORME | | | 3 × 400 `Un commentaire est obligatoire pour un rejet ou une demande de complément.` (chaîne vide comprise) puis 200 `REJETEE`, commentaire conservé, `finalVisaMcc`/`finalMastercardMcc` à `null`. |
| CAS-WF-07 | CONFORME | | | 400 `La validation exige un MCC Visa et un MCC Mastercard.` ; statut `SOUMISE` conservé. |
| CAS-WF-09 | CONFORME | | | 409 × 2 `Une demande au statut REJETEE n'est plus modifiable par l'agent.` puis 409 `Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : REJETEE).` |
| CAS-WF-10 | CONFORME | | | Idem sur `VALIDEE` ; `final_visa_mcc`/`final_mastercard_mcc` intacts (`5912`/`5999`). |
| CAS-WF-11 | CONFORME | | | 409 `Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : BROUILLON).` |
| CAS-WF-08 | CONFORME | | | Les 4 statuts sont conformes ; à la re-soumission `decisionComment`, `decidedAt` et `decidedBy` repassent à `null` ; journal dans l'ordre `CREATION, SOUMISSION, COMPLEMENT_REQUIS, MODIFICATION, SOUMISSION, VALIDATION`, nominatif et horodaté. |
| CAS-WF-12 | CONFORME | | | Soumissions parallèles : 1 × 200 `SOUMISE`, les autres 409 `Cette demande vient d’être soumise par ailleurs.` ; 1 seul événement `SOUMISSION`, 12 lignes `mcc_suggestions` toutes distinctes sur `(network, rank)`, un seul `submitted_at`. |
| CAS-WF-13 | CONFORME | | | 1 × 200 `VALIDEE`, 1 × 409 `Cette demande vient d’être arbitrée par ailleurs.` ; statut `VALIDEE`, exactement 1 événement de décision. |
| CAS-WF-14 | CONFORME | | | Photographie figée : codes, rangs, scores **et** `matchedTerms` strictement identiques avant/après `PUT /api/admin/mcc/5977` (libellé et mots-clés changés). Une demande créée après la modification reflète bien le nouveau classement (score de `5977` : 75 → 72). Confirme au passage le correctif « un MCC modifié n'est plus relégué en fin de secteur » : la perte n'est que de 3 points (le libellé), pas des 36 du rang de secteur. |
| CAS-MCC-01 | CONFORME | | | Référentiel d'amorçage intact : `VISA` = `5977:74, 7230:66, 7298:63, 5912:57, 5999:50, 5960:31`, ordre et scores **exacts**. Les 6 attributs (`label`, `description`, `descriptionEn`, `score`, `rawScore`, `matchedTerms`) sont présents ; `matchedTerms` non vide pour les 5 premiers, contenant `secteur : Beauté, cosmétique et parfumerie`. |
| CAS-MCC-02 | CONFORME | | | `JSON.stringify(VISA) === JSON.stringify(MASTERCARD)` et les deux tableaux sont des objets distincts. |
| CAS-MCC-03 | CONFORME | | | Sans secteur : `5977:54, 5999:50, 5960:31, 5962:31, 5964:31, 5965:31`. Avec secteur : `5977:74, 7230:66, 7298:63, 5912:57, 5999:50, 5960:31`. `7230`, `7298`, `5912` n'apparaissent que dans le second appel. |
| CAS-MCC-04 | BLOQUÉ | | | Jeu **JD-04 non défini** : le plan renvoie à un §4 absent. La reconstitution la plus proche (`INFORMATIQUE_LOGICIEL` + `NUMERIQUE` + abonnement) donne `5734:78, 4816:73, 7372:73, 5817:70, 5968:63, 4899:61`, ce qui ne reproduit pas l'ordre et les scores attendus (`5734, 5817, 4816, 7372, 4899, 5815` / `78, 75, 73, 73, 67, 61`). Non exécutable sans la définition exacte du profil. Voir DEF-A3-01. |
| CAS-MCC-05 | BLOQUÉ | | | Jeu **JD-06 non défini**. Sur une reconstitution place de marché, `5262` est rang 1 à 89 avec `isMarketplace:true` **et reste rang 1 à 82** avec `isMarketplace:false` : le résultat attendu du plan (« `5262` n'est plus en rang 1 ») n'est pas une propriété générale du moteur — la pénalité `-25` s'applique au `rawScore` et ne suffit pas à déclasser le code quand la description le désigne. Voir DEF-A3-01. |
| CAS-MCC-06 | CONFORME | | | 3 formulations × `limit=20` × 2 réseaux = 120 propositions : **zéro** `riskLevel = "INTERDIT"`, aucun des 12 codes interdits. |
| CAS-MCC-07 | CONFORME | | | 3 × 400 avec le libellé du code : `Le MCC 7995 (Paris, loteries et jeux de hasard) n'est pas éligible…` (POST), `Le MCC 5967 (Contenus et services pour adultes)…` (PUT), idem sur `decision`. La note du code est bien reprise dans `details[0].message`. |
| CAS-MCC-08 | CONFORME | | | (1) 404 `MCC 5942 introuvable` · (2) absent de `eligibleOnly=true` · (3) absent des deux listes du moteur · (4) 400 `Le MCC 5942 (Librairies) a été désactivé dans le référentiel.` · (5) 200 côté ADMIN avec `active:false` ; 1 seule ligne en base. |
| CAS-MCC-09 | CONFORME | | | `search=7995` contient `7995` en `INTERDIT` ; avec `eligibleOnly=true` il disparaît ; `GET /api/mcc/7995` = 200. |
| CAS-MCC-10 | CONFORME | | | `5942` en tête sur recherche par code ; `librairie` ne remonte que `5942 Librairies` ; recherche vide + `limit=5` → 5 items, `total=279` ; `limit` 0 / -3 / 9999 → 200 sans erreur, taille bornée ; `zzzzzzzz` → 200, `count=0`, `items=[]`. |
| CAS-MCC-11 | DÉFAUT | MAJEUR | DEF-A3-03 | Divergence **D4 confirmée**. `server/src/services/mccSuggestion.js:117` (`raw += 2` inconditionnel sur `REMOTE_SALE_MCCS`) rend le repli des lignes 128-131 inatteignable : la réponse est `5960, 5962, 5964, 5965, 5968, 5969`, toutes à 31, `matchedTerms` **vide**, sans la carte `5999` de repli. |
| CAS-MCC-13 | CONFORME | | | `1` → 1, `20` → 20, `21`/`0`/`"trois"` → 400 avec `details[0].champ="limit"`. Aucun 500. Réserve : les messages de bornes ne sont pas traduits (`Number must be less than or equal to 20`) — voir DEF-A3-04. |
| CAS-MCC-15 | CONFORME | | | Rang 1 `5942` avant, `5815` après la désactivation, sans redémarrage ; `5942` absent des deux listes ; `GET /api/mcc` : `total` 279 → 278. |
| CAS-MCC-12 | CONFORME | | | Joué sur 7 profils × 2 réseaux × `limit=20` = 280 éléments (les 6 jeux JD n'étant pas définis, JD-01 et une reconstitution de JD-03 sont complétés par 5 profils couvrant mode, numérique, restauration, place de marché et absence de correspondance) : **0 score hors [1, 99]**, aucun 0 ni 100, aucune rupture de tri (score décroissant, puis `rawScore` décroissant, puis code croissant). |
| CAS-ADM-03 | CONFORME | | | 400 `Le mot de passe doit comporter au moins 10 caractères` (`champ:"password"`, aucun compte créé) ; 400 `Le mot de passe doit contenir une minuscule, une majuscule et un chiffre`, `password_changed_at` inchangé. |
| CAS-ADM-04 | CONFORME | | | 409 `Un compte existe déjà avec l'adresse AGENT@BANQUE.TN.` (casse indifférente) et 409 `Un autre compte utilise déjà l'adresse agent@banque.tn.` |
| CAS-ADM-05 | CONFORME | | | 400 `Banque 999999 introuvable` puis 2 × 400 `Cette banque est désactivée : aucun compte ne peut y être rattaché.` |
| CAS-ADM-06 | CONFORME | | | 200, `BANQUIER`/`BQ002`/`Recette-2` ; `admin_events` `MODIFICATION` avec `payload.champs = ["lastName","role","bankId"]`. |
| CAS-ADM-07 | CONFORME | | | 2 × 400 avec `details[0].message = "Aucune modification fournie"`. |
| CAS-ADM-08 | CONFORME | | | 403 `Vous ne pouvez pas modifier votre propre rôle.`, 403 `Vous ne pouvez pas désactiver votre propre compte.`, et toujours 403 après création d'un second ADMIN. |
| CAS-ADM-09 | CONFORME | | | 200 puis 403 `…propre rôle.` puis 403 `…propre compte.` ; `count(*) users WHERE role='ADMIN' AND active` = 1 à l'issue. La remarque du plan est vérifiée : le message `Impossible : la plateforme doit conserver au moins un administrateur actif.` n'est pas atteint par voie séquentielle. |
| CAS-ADM-10 | CONFORME | | | Atteint au 2ᵉ essai (au 1ᵉʳ les deux requêtes se sont sérialisées et la seconde a reçu 403) : 1 × 200 et 1 × 409 `Impossible : la plateforme doit conserver au moins un administrateur actif.` ; aucun 500, aucun interblocage, exactement 1 administrateur survivant. |
| CAS-ADM-11 | CONFORME | | | `PUT` 200 `active:false` ; `login` 401 `Identifiants incorrects` (message générique). |
| CAS-ADM-12 | CONFORME | | | 201 avec `code:"BQ009"` mis en majuscules ; 409 `Le code banque BQ009 est déjà utilisé.` ; 400 `details[0].message = "Code banque trop court"` ; `userCount`/`requestCount` de la liste strictement égaux aux `count(*)` en base (BQ001 4/1, BQ002 2/0, BQ004 0/0, BQ009 0/0). |
| CAS-ADM-13 | CONFORME | | | 409 `Cette banque compte N compte(s) actif(s). Désactivez-les avant de désactiver la banque.` avec N égal au `count(*)` réel ; après désactivation du compte, `PUT` 200 `active:false`. |
| CAS-ADM-14 | CONFORME | | | `total=279`, `actifs=278` (`total > actifs`), `count=279`, `items` contenant 12 codes `INTERDIT` et 1 code `active:false`. |
| CAS-ADM-15 | CONFORME | | | 200 reflétant les 3 champs ; première entrée d'historique `MODIFICATION`, `comment = "Demande conformité 2026-09"`, `userName = "Admin ClickToPay"`, `champsModifies = ["note","label","riskLevel"]` (exactement), `avant`/`apres` renseignés ; journal `MCC`/`5977`/`MODIFICATION` en tête. |
| CAS-ADM-16 | CONFORME | | | Historique = `REACTIVATION` puis `DESACTIVATION` (pas deux `MODIFICATION`) ; `count(*) mcc_codes WHERE code='5994'` = 1. |
| CAS-ADM-17 | CONFORME | | | 201 avec `MEDIUM` / `STANDARD` / `["VISA","MASTERCARD"]` / `"Ajout manuel"` et historique `CREATION` ; 409 `Le MCC 9101 existe déjà dans le référentiel.` ; 400 `Un MCC est composé de 4 chiffres` ; `GET /api/mcc/9101` en AGENT = 200. |
| CAS-ADM-18 | CONFORME | | | 1 × 201 et 1 × 409 `Le MCC 9111 existe déjà dans le référentiel.` ; une seule ligne en base ; aucun 500. |
| CAS-ADM-19 | CONFORME | | | 3 × 404 `MCC 9999 introuvable`. |
| CAS-ADM-20 | CONFORME | | | 400 `details[0].message = "Aucune modification fournie"` ; historique de `5977` stable (1 → 1). |
| CAS-ADM-21 | CONFORME | | | Les actions apparaissent en tête, du plus récent au plus ancien, avec `entity`, `entityId`, `action`, `userName` et `createdAt` ; `limit=9999` → 24 (≤ 500), `limit=0` → 1, `limit=abc` → défaut appliqué, aucun 500. |
| CAS-ADM-22 | CONFORME | | | Après `npm run db:seed` : `5977` conserve `riskLevel="SENSIBLE"`, `note="Contrôle renforcé"` et le libellé ajusté ; les codes ajoutés (`9101`, `9111`) subsistent, aucun code existant réécrit. |
| CAS-INDEX-01 | CONFORME | | | Le code `9101` importé est proposé **au premier appel suivant**, dans `VISA` et `MASTERCARD`, score 83, `matchedTerms` non vide. Réserve : le terme `bornes recharge` attendu par le plan n'apparaît pas dans `matchedTerms` — la description de test écrit « bornes **de** recharge », le bigramme n'y est donc pas contigu. Attente du plan inexacte, comportement correct. |
| CAS-INDEX-02 | CONFORME | | | `keywords = []` ; `keywordsAuto` = 17 entrées (≤ 30) contenant les 3 bigrammes, les 4 jetons du libellé, leurs 4 variantes singulier/pluriel et les jetons de description (`exploitation`, `abonnements`) ; aucun mot vide (`vente`, `ligne`, `produits`, `service`, `societe`). |
| CAS-INDEX-03 | DÉFAUT | MAJEUR | DEF-A3-05 | `server/src/services/mccCatalog.js:53`. Le code est bien proposé dans les deux formulations (critère d'acceptation tenu) mais le rang passe de **1 à 5** et `matchedTerms` devient **vide** : les variantes dérivées (poids 3) ne franchissent jamais le seuil `poids >= POIDS.label` (4) de `tokensForts`. Le code remonté par une variante n'est donc jamais justifié à l'agent. |
| CAS-INDEX-04 | CONFORME | | | Aucun synonyme n'est deviné : avant saisie, `matchedTerms` ne contient que `electriques` — jamais `patinette`. Après `PUT keywords`, `matchedTerms` = `["patinettes electriques","patinettes","electriques"]`, sans redémarrage. **Le résultat attendu (1) du plan est faux** : il exige que `9105` soit absent, alors que le libellé « Trottinettes **électriques** » et la description de test partagent le mot `electriques` — le code remonte donc légitimement. |
| CAS-INDEX-05 | CONFORME | | | Deux codes au même mot de libellé : celui qui le porte aussi en `keywords` saisis (poids 5) devance l'autre — `9108` `rawScore` 61,5 contre `9107` 54. |
| CAS-INDEX-06 | CONFORME | | | **Correctif vérifié.** (2) `mccs = ["5995","9101"]` — le nouveau rattachement prend la fin de file. (4) après ré-enregistrement à l'identique des secteurs de `5995` : `mccs` **inchangé** (`["5995","9101"]`, rangs 0 et 1 en base). La partie dommageable de la divergence D1 (rétrogradation silencieuse à chaque modification) **n'est plus reproductible**. |
| CAS-INDEX-07 | CONFORME | | | (1) 400 `Secteur inconnu : SECTEUR_IMAGINAIRE`, `sectors` de `9101` inchangé · (2) 400 même message et `GET /api/admin/mcc/9106` = 404 (transaction annulée) · (3) 400 `details[0] = {champ:"activitySector", message:"Secteur inconnu"}`. |
| CAS-INDEX-08 | CONFORME | | | (2) `9101` proposé immédiatement avec `matchedTerms` contenant `conciergerie` · (4) `keywordsAuto` recalculé : `conciergerie` présent, bigramme `bornes recharge` disparu, jetons de description conservés. **Le résultat attendu (3) du plan est faux et se contredit avec son (4)** : la description du code mentionne toujours « bornes de recharge », le code reste donc légitimement proposé sur l'ancien vocabulaire. |
| CAS-INDEX-09 | CONFORME | | | 27 secteurs servis depuis la base, chacun avec `key`, `label`, `mccs` ; après `UPDATE sectors SET active=FALSE` + rechargement, 26 secteurs et `POST /api/requests` avec `activitySector="ANIMALERIE"` → 400 `Secteur inconnu`. |
| CAS-INDEX-10 | CONFORME | | | `5977` proposé, puis absent des deux listes après passage en `INTERDIT` sans redémarrage ; `POST /api/requests` → 400 `Le MCC 5977 (…) n'est pas éligible à l'affiliation ClickToPay.` ; retour en `STANDARD` → `5977` de nouveau rang 1. |
| CAS-ROB-01 | CONFORME | | | `apply:"false"` → `resume.applique=false`, aucune écriture (0 code inactif avant et après) ; `active` à `"false"`, `"0"`, `"non"`, `""` → 200 et `active=false` en base, jamais réactivé ; `hasSubscription:"false"` / `isMarketplace:"0"` → 201 avec deux booléens `false` en base. |
| CAS-ROB-02 | CONFORME | | | 5 × 400 `details[0].message = "Valeur booléenne attendue (true ou false)"` (`"peut-être"`, `2`, `null`, `[]`, `apply:"oui-peut-etre"`), aucune écriture. |
| CAS-ROB-03 | CONFORME | | | Classement strictement identique entre la version texte (`"false"`) et la version booléenne : `5977:54 5999:50 5960:31 5962:31 5964:31 5965:31`. |
| CAS-ROB-04 | CONFORME | | | 7 × 400 (`Date inexistante au calendrier` × 5, `Date attendue au format AAAA-MM-JJ` pour `26-01-01` et `2026/01/01`) ; `2026-02-28` → 201. Aucun 500. |
| CAS-ROB-05 | CONFORME | | | `1e15` et `99999999999.9999` → `Montant trop élevé` ; `-1` → `La valeur doit être positive` ; `"abc"` → `Format attendu : number` ; `1e999` → `Montant invalide` ; `99999999999.999` → 201. Aucun « numeric field overflow ». |
| CAS-ROB-06 | CONFORME | | | 3 × 400 `Caractères de contrôle non autorisés` sur le bon champ (`siteName`, `companyName`, `activityDescription`) ; `\n` et `\t` acceptés (201). |
| CAS-ROB-07 | CONFORME | | | 9 × 400, jamais 404 ni 500 : `Demande invalide : « abc / 1.5 / -1 / 0 / 2147483648 / 1 OR 1=1 »` et `Identifiant invalide : « abc »`. |
| CAS-ROB-08 | CONFORME | | | 7 × 200, `items` toujours un tableau, tailles bornées, aucun 500. |
| CAS-ROB-09 | CONFORME | | | `status=INEXISTANT` → 200 `items=[]` ; `role=SUPERADMIN` → 400 `Rôle invalide : « SUPERADMIN »` ; `bankId=abc` / `1.5` → 400 `Banque invalide : « abc »` / `« 1.5 »`. |
| CAS-ROB-10 | CONFORME | | | Aucune erreur SQL ; `%` et `_` remontent uniquement les demandes de la banque de l'appelant (`bankId=1`), jamais celles de BQ002 ; `'`, `" OR 1=1 --`, `<script>…` → 200 avec 0 résultat ; `GET /api/mcc?search=' OR '1'='1` → 200, `count=0`. |
| CAS-ROB-11 | CONFORME | | | (1) 400 (analyse JSON) · (2) **413** `request entity too large` · (3) 400 `Données invalides` · (4) 400 `Données invalides`. Aucune réponse 5xx. Réserve : le corps de (1) reprend le message brut de l'analyseur (`Unexpected end of JSON input`). |
| CAS-ROB-13 | CONFORME | | | 11 × 400 désignant le bon champ ; aucune erreur « value too long » ; valeurs exactement à la borne → 201. Réserve : les 11 messages sont les libellés zod anglais non traduits — voir DEF-A3-04. |
| CAS-ROB-14 | CONFORME | | | 201 et relecture strictement identique : `SOCIÉTÉ ÉLÈVE & Cie – « Beldi »`, `Beldi 🌿`, `بن علي`. |
| CAS-ROB-15 | CONFORME | | | 6 × 400 désignant `keywords`, `keywords.0/1`, `similar.0`, `networks`, `networks.1`, `sectors.0` ; aucune écriture, aucun 500. Réserve : 5 des 6 messages ne sont pas traduits (dont `Invalid` seul) — voir DEF-A3-04. |
| CAS-ROB-16 | CONFORME | | | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy` présent, `Strict-Transport-Security: max-age=15552000; includeSubDomains` ; `OPTIONS` avec `Origin: https://site-malveillant.example` → 204 **sans** `Access-Control-Allow-Origin`. |
