# Journal de remise en cohérence du dossier

Campagne : agent documentation. Date d'exécution : **2026-09-23**.
Question posée : **le dossier décrit-il encore la plateforme telle qu'elle est ?**

Portée des écritures : `docs/plan-de-tests.md`, `README.md`, et ce journal.
Aucun fichier de code, aucun test, aucun autre document n'a été touché.

Référence d'état : commit `3a7ac2e` (« Corriger les constats des revues de sécurité
et d'habilitation »), dernier commit au moment de la rédaction. Les documents
portaient encore, pour partie, l'état de `c9abaf3` et de `85a5b7d`.

**Règle suivie** : ne réécrire que ce qui a divergé, et pouvoir rattacher chaque
correction à un changement du produit — commit, décision, ou mesure. Un cas devenu
faux est **réécrit sur la règle nouvelle**, jamais supprimé : un cas retiré est une
couverture perdue sans trace.

---

## 1. Banc de mesure

| Élément | Valeur |
| --- | --- |
| API interrogée | `http://127.0.0.1:4000` (instance de démonstration, **non redémarrée**) |
| Base de l'instance | `clicktopay` |
| Comptes | `agent@banque.tn`, `agent2@banque.tn` (BQ002), `banquier@banque.tn`, `admin@clicktopay.tn` |
| Écritures | **aucune** : toutes les sondes portent sur des lectures ou sur des appels refusés avant transaction |
| Moteur de proposition | mesuré hors base, sur le **référentiel d'amorçage intact** (voir § 2) |

PostgreSQL est resté en service pendant toute la campagne (`pg_isready` :
*accepting connections*) ; aucun redémarrage n'a été nécessaire.

### 1.1 Pourquoi le moteur n'a pas été mesuré sur le port 4000

Le référentiel de l'instance de démonstration **n'est plus intact**. Comparaison
ligne à ligne de `mcc_codes` (base `clicktopay`) avec `server/data/mcc-catalog.json`,
sur les douze colonnes d'amorçage :

| Code | Champ | Catalogue d'amorçage | Base de démonstration |
| --- | --- | --- | --- |
| `5698` | `keywords` | `perruque, postiche, extension cheveux, hair pieces, extensions, hair replacement – non, surgical, toupee stores` | `perruque, postiche` |
| `5942` | `keywords` | `librairie, livre, roman, manuel scolaire, bd, paperbacks – book stores, textbooks` | `livre, librairie, bouquin` |
| `5977` | `keywords` | `cosmetique, parfum, beaute, maquillage, soin, creme, parapharmacie beaute, make-up stores 5999 – miscellaneous and specialty, retail stores` | `cosmetiques, parfum, beaute` |

Aucun autre écart : 279 codes, tous actifs, tous conformes au catalogue au champ
près. Conséquence mesurée sur le jeu JD-01 (`POST /api/mcc/suggest`, port 4000) :

```
6 propositions : 5977:76, 7230:66, 7298:63, 5912:57, 5698:53, 5999:50
```

soit `5977` à **76** au lieu de 74, et l'apparition de `5698` — deux valeurs
fausses au regard de la condition de reproductibilité posée en tête du § 4 du plan.
La création d'une base de recette dédiée n'étant pas possible dans cet
environnement, le moteur a été mesuré **en mémoire**, en chargeant le catalogue
d'amorçage et les secteurs initiaux par le chemin de chargement réel
(`rechargerCatalogue()` de `mccCatalog.js`, puis `suggestForNetworks()` de
`mccSuggestion.js`), la seule dépendance substituée étant l'accès à la base.

**Contrôle de fidélité du banc** : les onze exécutions rendent, au point près, les
valeurs relevées indépendamment par `docs/non-regression-lot1.md` § 3.1 sur la base
`clicktopay_nr` fraîchement amorcée. Le banc reproduit donc l'instance de référence.

---

## 2. Corrections portées au plan de tests

Onze corrections. Chaque ligne dit **ce qui a été corrigé**, **pourquoi** (le
changement du produit qui l'impose) et **comment c'est vérifié**.

### 2.1 § 1.3 — hypothèse d'exécution ajoutée (schéma à jour)

**Corrigé** : point 8 ajouté aux hypothèses — la base de recette doit être migrée
après `3a7ac2e`.
**Pourquoi** : ce commit ajoute `admin_events.bank_id`. Sur une base plus ancienne,
le journal d'administration tombe en 500 dès qu'un banquier l'appelle, et deux cas
deviennent injouables sans que rien ne le dise.
**Vérifié** : `GET /api/admin/events` avec le jeton banquier sur le port 4000 →
`500 {"error":"Erreur interne du serveur"}` ; journal du serveur :
`error: column e.bank_id does not exist … at listAdminEvents`. `\d admin_events`
montre la colonne présente sur `clicktopay_test` et **absente** sur `clicktopay`.

### 2.2 CAS-AUTH-08 — le refus inter-banques passe de 403 à 404

**Corrigé** : résultat attendu `403 {"error":"Cette demande appartient à une autre
banque."}` → `404 {"error":"Demande <D1> introuvable"}`, avec l'exigence nouvelle
que ce refus soit identique à celui d'un identifiant libre.
**Pourquoi** : commit `3a7ac2e`. Le message remplacé **n'est plus émis par aucune
route** du produit.
**Vérifié** : jeton `agent2@banque.tn` (BQ002) sur la demande 1 (BQ001) →
`404 {"error":"Demande 1 introuvable"}` ; `GET /api/requests/9999` (identifiant
libre, jeton BQ001) → `404 {"error":"Demande 9999 introuvable"}`. Lu aussi dans
`requests.js`, `getRequest()`.

### 2.3 CAS-HAB-04 — cloisonnement inter-banques : réécrit et renforcé

**Corrigé** : points (1) à (4) passés de 403 à 404 ; deux points ajoutés — `submit`,
et la comparaison à un identifiant libre.
**Pourquoi** : même commit. L'indiscernabilité des deux refus **est** l'objet de
l'évolution ; un cas qui ne vérifierait que « ça refuse » laisserait le défaut
revenir sans rien voir.
**Vérifié** : sept sondes, toutes en lecture ou refusées avant transaction —
`GET`, `/events`, `/suggestions`, `PUT`, `submit` sur la demande 1 avec le jeton
BQ002, la liste, et `GET /api/requests/9999`. Les cinq premiers rendent le même
`404 {"error":"Demande 1 introuvable"}`, la liste est vide, et le dernier ne diffère
que par l'identifiant. Tableau reporté dans l'amendement du cas.
**Cas réécrit, non supprimé.**

### 2.4 CAS-HAB-11 — points (4), (6) et (7)

**Corrigé** : (4) `403 {"error":"Ce compte appartient à une autre banque."}` →
`404 {"error":"Utilisateur <id> introuvable"}` ; (6) les deux messages de refus sont
désormais **nommés** au lieu d'« un 403 » ; (7) le critère précise que le journal est
filtré sur la banque **concernée par l'action**, figée à l'écriture.
**Pourquoi** : `3a7ac2e` — même raisonnement que pour les dossiers, appliqué aux
comptes (`services/admin.js`, `assertCibleAutorisee()`), et correction du
partitionnement du journal, qui interrogeait la banque *actuelle de l'auteur*.
**Vérifié** : jeton `banquier@banque.tn` (BQ001) sur le compte 3
(`agent2@banque.tn`, BQ002) — `GET`, `PUT` et `POST …/password` rendent les trois
`404 {"error":"Utilisateur 3 introuvable"}`, contre
`404 {"error":"Utilisateur 9999 introuvable"}` pour un identifiant libre. Point (6) :
`403 {"error":"Vous ne pouvez pas changer le rôle de ce compte."}` puis
`403 {"error":"Vous ne pouvez pas rattacher ce compte à une autre banque."}`.
Point (7) **non remesurable** ici (§ 2.1) : il reste établi par les deux cas
automatisés de `habilitations.test.js`, et le cas porte désormais la précondition.

### 2.5 CAS-HAB-03 — rectificatif : un seul message pour l'agent, pas deux

**Corrigé** : le point (1) annonçait `{"error":"Action réservée aux profils :
ADMIN, BANQUIER"}` sur `/users`, `/banks` et `/events`, et `{"error":"Action
réservée aux profils : ADMIN"}` sur `/mcc` et `/mcc/import`. **C'était faux** : les
cinq routes rendent le même message à l'agent.
**Pourquoi** : `routes/admin.js` monte `requireRole('ADMIN', 'BANQUIER')` sur le
**routeur entier** (`adminRouter.use`, ligne 58) ; `reserveAAdministrateur`
n'intervient qu'après, route par route. L'agent est arrêté par la première garde.
Le second message existe bien, mais il est servi au **banquier** (CAS-HAB-12).
**Vérifié** : les cinq appels avec le jeton `agent@banque.tn` rendent
`403 {"error":"Action réservée aux profils : ADMIN, BANQUIER"}` ; les sept appels
de CAS-HAB-12 avec le jeton banquier rendent
`403 {"error":"Action réservée aux profils : ADMIN"}`.
**Portée de l'erreur** : elle aurait fait conclure au KO un comportement correct.

### 2.6 § 2.4 — matrice des transitions : en-têtes de colonnes

**Corrigé** : `PUT (agent)` et `submit (agent)` deviennent
`PUT (agent **ou banquier**)` et `submit (agent **ou banquier**)`, avec deux nuances
explicitées (l'auteur du dossier, et le 404 hors banque).
**Pourquoi** : décision **D-3** — `routes/requests.js` porte
`requireRole('AGENT', 'BANQUIER')` sur les deux routes.
**Vérifié** : lu dans `routes/requests.js` (lignes 49, 64, 74) ; les codes de retour
eux-mêmes ne dépendent que du statut et **n'ont pas changé** : le corps de la
matrice est laissé intact.

### 2.7 CAS-DEM-07 — la trace d'une modification porte les valeurs

**Corrigé** : le résultat attendu s'enrichit de `payload.modifications`
(`{champ: {avant, apres}}`), avec trois points à éprouver dont le masquage du RIB.
**Pourquoi** : `3a7ac2e`. C'est la contrepartie des décisions D-1 et D-3 : la
plateforme n'empêche plus le cumul saisie / arbitrage, donc le journal doit
permettre d'en rendre compte.
**Vérifié** : lu dans `requests.js`, `tracerModification()` et l'appel à `logEvent`
(`payload: { champs: Object.keys(modifications), modifications }`). `payload.champs`
est **conservé** — l'attendu d'origine reste donc vrai et n'a pas été touché.

### 2.8 § 3 — la suite compte 166 tests, pas 165

**Corrigé** : légende et amendement du § 3 ; note de reprise ajoutée.
**Pourquoi** : `3a7ac2e` remplace un cas par deux dans `habilitations.test.js`.
**Vérifié** : décompte fichier par fichier des appels `test(` — `robustesse` 51,
`admin` 30, `requests` 22, `habilitations` 19, `mcc` 11, `indexation` 10, `vague3` 9,
`auth` 6, `import` 6, `limitation` 2 → **166**, en 10 fichiers, concordant avec le
message du commit. Le décompte est **statique** : la suite n'a pas été relancée,
une autre campagne occupant `clicktopay_test` au même moment.

### 2.9 § 3.2 — deux lignes de couverture reprises sur le contenu des tests

**Corrigé** : CAS-HAB-04 (les tests assertent un 404 *comparé* au 404 d'un
identifiant libre) et CAS-HAB-11 (le filtrage du journal quitte le « reste à faire »
— il est couvert par deux cas neufs ; ne reste que le volet écran).
**Pourquoi** : le cas *le banquier consulte le journal de sa banque* n'assertait que
`Array.isArray(items)` : il passait aussi bien sur le journal de toute la
plateforme et **survivait au retrait du filtre**. Il est remplacé par *le journal du
banquier ne porte que les actions de sa banque* et *une mutation de banque ne fait
pas franchir la cloison à l'historique*.
**Vérifié** : les deux tests ouverts et lus ligne à ligne, pas seulement leurs
intitulés — le premier compte les entrées avant et après trois actions ciblées, le
second vérifie qu'une mutation n'importe rien rétroactivement.

### 2.10 § 3.1 et § 3.11 — CAS-AUTH-08 passe de « Auto » à « Partiel »

**Corrigé** : la ligne, et le récapitulatif (48/46 → **47/47** ; les 55 cas manuels
sont inchangés), avec une note disant pourquoi.
**Pourquoi** : ce n'est pas la couverture qui baisse, c'est l'exigence qui monte :
le cas demande désormais que le 404 inter-banques soit indiscernable de celui d'un
identifiant libre, et `robustesse.test.js` ne fait pas cette comparaison.
**Vérifié** : test *un agent muté de banque perd l'accès aux dossiers de son
ancienne banque* ouvert — il attend bien `404` sur `GET` et `PUT`, sans comparaison.

### 2.11 § 4.3 — complément sur la forme d'appel

**Corrigé** : complément daté ajouté sous l'amendement existant. Les onze lignes du
tableau sont **confirmées**, y compris les trois rectifiées ; ce qui manquait, c'est
la condition qui les rend vraies.
**Pourquoi** : le tableau n'est exact que si le moteur reçoit les **trois seuls
champs d'activité**. Avec le socle complet du § 4.1 — `siteName`, `siteUrl`,
`companyName` —, quatre lignes sur onze changent, sans qu'aucune régression ne soit
en cause. Le § 4.3 dit « `POST /api/mcc/suggest` » et le § 4.1 fournit un corps
complet : les deux lectures étaient ouvertes.
**Vérifié** : les onze jeux passés deux fois au moteur, sur le catalogue d'amorçage
intact (§ 1.1). Écarts relevés :

| Jeu | Trois champs d'activité | Socle complet du § 4.1 |
| --- | --- | --- |
| JD-01 | `5977:74, 7230:66, 7298:63, 5912:57, 5999:50` (5) | `5977:75, 7230:66, 7298:63, 5912:57, 5999:50, 5968:32` (6) |
| JD-01 sans secteur | `5977:54, 5999:50` (2) | `5977:56, 5999:50, 5968:32, 7399:32, 5311:14` (5) |
| JD-02 | `…, 5992:51, 5818:48` | `…, 5992:51, 4215:48` |
| JD-10 | `5999:10`, repli | `8734:24`, `matchedTerms = ["test"]` |

Les sept autres jeux sont identiques dans les deux formes.

**Non touché, conformément à la consigne** : `CAS-MCC-05`, amendé le 2026-09-22. Sa
mesure a néanmoins été refaite au passage et elle tient : `5262` rang 1 à `90` avec
`isMarketplace: true`, `84` sans — soit les 6 points de baisse qu'exige le texte
amendé, contre les 5 requis au minimum.

---

## 3. Corrections portées au README

Sept corrections.

| # | Corrigé | Pourquoi | Vérifié |
| --- | --- | --- | --- |
| 1 | `165 tests` → **`166 tests`** | commit `3a7ac2e` | décompte fichier par fichier (§ 2.8) |
| 2 | Comptes de démonstration : **quatre** lignes et non trois, avec la banque de chacun | le seed crée `agent2@banque.tn` (BQ002) depuis l'origine ; sans lui, le cloisonnement n'est ni démontrable ni testable | `src/db/seed.js`, constante `USERS` ; les quatre comptes ouvrent une session sur le port 4000 |
| 3 | Règles de sécurité : le refus inter-banques est un **404 identique à celui d'un objet inexistant**, dossiers comme comptes | `3a7ac2e` | les sondes des § 2.2 à 2.4 |
| 4 | Règles de sécurité : le **journal d'administration est partitionné sur la banque concernée par l'action**, figée à l'écriture ; le référentiel est de portée plateforme | `3a7ac2e` | `services/admin.js`, `listAdminEvents()` ; `schema.sql`, `admin_events.bank_id` ; les deux cas neufs de `habilitations.test.js` |
| 5 | Règles de sécurité et parcours fonctionnel : les **modifications d'un dossier sont tracées avec leurs valeurs avant et après**, RIB masqué | `3a7ac2e`, contrepartie de D-1 et D-3 | `requests.js`, `tracerModification()` |
| 6 | Administration : la ligne « Journal » du tableau des deux profils dit ce que le banquier voit **et ce qu'il ne voit pas** | `3a7ac2e` | idem 4 |
| 7 | Moteur de proposition : l'invariant **« aucune proposition sans terme justificatif »**, `limit` comme plafond et non consigne de remplissage, et le repli `5999` servi seul | corrections de la vague 3, restées absentes de la section qui décrit le moteur — alors que c'est ce qui explique les listes courtes du § 4.3 | `mccSuggestion.js` (filtre `rawScore > 0 && matchedTerms.length > 0`) ; mesuré sur les onze jeux (§ 2.11) |

Le modèle d'habilitation lui-même (banquier administrateur de sa banque, référentiel
MCC réservé, tableau des routes et des rôles) était **déjà à jour** dans le README :
il n'a pas été réécrit.

---

## 4. Ce qui a été contrôlé et laissé tel quel

Ne pas réécrire ce qui est juste demande de le vérifier. Relevés conformes, donc
non modifiés :

| Objet | Contrôle |
| --- | --- |
| CAS-HAB-12, les dix refus | les sept routes `/mcc` et `POST /banks` rendent `403 {"error":"Action réservée aux profils : ADMIN"}` ; `GET /api/admin/banks` rend **une seule** banque (`BQ001`) ; `PUT /api/admin/banks/2` → `403 {"error":"Vous ne gérez que votre propre banque."}` ; `PUT /api/admin/banks/1 {"active":false}` → `403 {"error":"Seul un administrateur peut activer ou désactiver une banque."}` |
| CAS-HAB-11, point (5) | `GET /api/admin/users/2` (banquier de sa banque) et `/4` (administrateur de sa banque) → `403 {"error":"Vous n’administrez que les comptes agents de votre banque."}`, apostrophe typographique comprise |
| CAS-HAB-11, point (3) | `POST /api/admin/users` avec `"role":"BANQUIER"` → `403 {"error":"Vous ne pouvez créer que des comptes agents dans votre banque."}` |
| CAS-HAB-02 | `POST /api/requests/1/decision` avec un jeton d'agent → `403 {"error":"Action réservée aux profils : BANQUIER"}` — **toujours 403 et non 404** : le rôle est contrôlé avant le périmètre |
| Huit lignes sur onze du § 4.3 | remesurées, identiques au point près |
| CAS-MCC-05 | amendé le 2026-09-22, non touché ; mesure refaite par acquit de conscience, conforme |
| Modèle d'habilitation dans le plan (CAS-HAB-01, -03, -10, -11, -12) et dans le README | déjà repris sur les décisions D-1 et D-3 ; seuls les points énumérés au § 2 ont bougé |

---

## 5. À arbitrer

Trois points que je ne sais pas trancher seul. Aucun n'a été deviné.

### A-1 — La base de démonstration du port 4000 n'est pas migrée

`admin_events.bank_id` manque : `GET /api/admin/events` rend **500** pour tout
banquier sur cette instance. Le correctif est connu (`npm run db:migrate`), mais je
ne l'ai pas appliqué — une autre campagne travaille sur cette instance et la
consigne est de ne pas la redémarrer ni d'en modifier les données. **À trancher** :
qui migre, et quand. Tant que ce n'est pas fait, CAS-HAB-11 (point 7) et le volet
« écran Journal » de CAS-ADM-21 sont injouables sur cette instance, et un rejeu
naïf les consignerait en défaut bloquant alors que le produit est correct.

### A-2 — Le référentiel de l'instance de démonstration n'est plus intact

Trois codes (`5698`, `5942`, `5977`) portent des mots-clés modifiés en recette
(§ 1.1). Le § 4.3 est donc **injouable sur le port 4000** : JD-01 y rend `5977` à 76
et fait apparaître `5698`. **À trancher** : restaurer ces trois codes depuis le
catalogue d'amorçage, ou réserver définitivement les cas de la section MCC à une
base dédiée et le dire en tête du § 4. Je n'ai touché ni à l'un ni à l'autre.

### A-3 — Quel corps le § 4.3 prescrit-il exactement ?

Le § 4.3 annonce `POST /api/mcc/suggest` et le § 4.1 fournit un corps de demande
complet ; les valeurs attendues, elles, ne sont vraies qu'avec les trois champs
d'activité (§ 2.11). J'ai **documenté les deux mesures** et indiqué laquelle
correspond au tableau, sans trancher la question de fond : faut-il éprouver le
moteur sur le corps réellement envoyé par le formulaire — auquel cas les onze lignes
sont à remplacer par la seconde colonne — ou sur les trois champs d'activité, qui
isolent ce que le moteur est censé exploiter ? Le second est plus stable et déjà en
place ; le premier est plus proche de l'usage. Le cas de JD-10 illustre l'enjeu : le
jeu est construit pour n'accrocher aucun code, et c'est le mot **TEST** de la raison
sociale `TEST NEUTRE SARL` qui le fait sortir du repli — le jeu de données lui-même
serait alors à renommer.

### Signalé, sans demande d'arbitrage

- **Aucun cas n'a été supprimé.** Les quatre cas devenus faux (CAS-AUTH-08,
  CAS-HAB-03, CAS-HAB-04, CAS-HAB-11) ont été **réécrits sur la règle nouvelle**, et
  chacun porte un amendement daté qui dit ce qu'il attendait avant.
- **Le message `Cette demande appartient à une autre banque.` et le message
  `Ce compte appartient à une autre banque.` ne sont plus émis nulle part.** S'ils
  subsistent dans un rapport d'exécution antérieur, ils y décrivent un état révolu :
  je n'ai pas touché à ces rapports, dont d'autres agents ont la charge.

