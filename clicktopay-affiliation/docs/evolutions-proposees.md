# Évolutions proposées — Plateforme ClickToPay Affiliation

> Agent 2 de la campagne d'évolution. Rédigé le 2026-09-22.
> Objet : confronter la veille concurrentielle (`veille-concurrentielle.md`) et les
> réserves de recette (`rapport-recette.md`, `revue-de-code.md`) à l'état réel du
> code, puis produire le cahier des charges exécutable de l'agent 3.
>
> **Méthode.** Aucun écart annoncé par la veille n'est repris sur parole : chacun a
> été revérifié en ouvrant le fichier et en citant la ligne. Les références de
> lignes ci-dessous ont été relevées le 2026-09-22 sur l'arborescence de travail.
> Aucun fichier du projet n'a été modifié, hors le présent document.

---

## Sommaire

1. Synthèse
2. Vérification des huit écarts de la veille
3. Tableau de priorisation
4. Fiches détaillées — catégorie A
5. Questions au commanditaire — catégorie B
6. Ce que j'écarte — catégorie C
7. Ce qu'il faut retenir

---

## 1. Synthèse

La confrontation donne un résultat net : **le cœur du produit n'est pas en retard
sur le marché, c'est son pourtour qui l'est**, et la première dette à payer n'est
pas fonctionnelle mais de recette. Les huit écarts de la veille sont tous
confirmés dans le code ; six sur huit ne sont cependant pas des oublis mais des
choix de périmètre, et les trancher n'appartient pas à l'agent 3.

Ce que je recommande de faire en premier n'est donc pas une fonction nouvelle :
ce sont les **sept corrections de recette courtes** (EVO-01 à EVO-07, 3,25 jours
au total) qui conditionnent une mise en service, puis les **deux fonctions à
meilleur rapport valeur/effort** issues de la veille — le contrôle automatique du
site marchand (EVO-17) et le profil de risque du marchand construit sur des
données **déjà collectées et aujourd'hui inertes** (EVO-18). Le reste attend une
décision.

Un point mérite d'être dit sans détour : **l'interface n'a aucun test
automatisé** (`web/package.json` ne déclare ni script `test` ni dépendance de
test). C'est le plus gros risque d'exploitation du produit, devant n'importe
quelle fonction manquante, et c'est aussi le poste le plus coûteux de ce
programme (EVO-13, 4 jours).

---

## 2. Vérification des huit écarts de la veille

### Écart 1 — « Le marchand n'existe pas dans le produit » → **confirmé, mais ce n'est pas un défaut**

**Preuve.** `server/src/db/schema.sql:22` :
`role VARCHAR(16) NOT NULL CHECK (role IN ('AGENT', 'BANQUIER', 'ADMIN'))`.
Aucun quatrième rôle, aucune table de compte marchand, aucune route publique :
`server/src/app.js:68` place `authenticate` devant tout ce qui n'est pas
`/api/auth` et `/api/health`.

**Lecture.** Le constat est exact mais la veille lui donne un poids qu'il n'a pas
au regard de notre périmètre. Le README annonce explicitement une plateforme où
« un **agent de banque** saisit la demande d'affiliation d'un client
e-commerçant », et la source primaire tunisienne (contrat STB, § 2.8 de la
veille) décrit un processus **agence-centré** : « vous devez prendre contact avec
votre agence pour remplir le contrat d'affiliation ». Ouvrir la plateforme au
marchand n'est pas combler un manque, c'est changer de produit.

**Suite donnée** : question B-1, non tranchée ici.

---

### Écart 2 — « Aucune pièce justificative n'est portée par le dossier » → **confirmé**

**Preuve.** Le schéma ne comporte aucune table de documents : `schema.sql` (230
lignes) déclare `banks`, `users`, `mcc_codes`, `affiliation_requests`,
`mcc_suggestions`, `request_events`, `mcc_code_history`, `admin_events`,
`sectors`, `mcc_sectors` — et rien d'autre. `multer` est bien présent
(`server/package.json`) mais n'est monté qu'une fois, pour l'import du
référentiel MCC : `server/src/routes/admin.js:22-29`, puis
`routes/admin.js:165-167` (`televersement.single('fichier')`). Le RNE est une
chaîne (`schema.sql:67`, `VARCHAR(32) NOT NULL`), le RIB aussi et il est
facultatif (`schema.sql:100`).

**Lecture.** Confirmé sans réserve. Mais la gestion documentaire engage le
stockage, la rétention, la purge, le chiffrement au repos et la loi organique
n° 2004-63 citée à l'article 8 du contrat STB. Ce n'est pas une évolution que
l'on lance sans arbitrage.

**Suite donnée** : question B-4.

---

### Écart 3 — « Le site marchand n'est jamais regardé » → **confirmé**

**Preuve.** `server/src/services/requestSchema.js:48-53` : l'adresse du site est
validée par `/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i` puis stockée
(`services/requests.js:9`, colonne `site_url`). Aucun appel sortant n'existe dans
le serveur : une recherche de `nodemailer|axios|node-fetch|fetch(|webhook|smtp|http.request`
sur `server/src` ne renvoie **aucune occurrence**. Le moteur n'utilise l'URL que
comme texte, après en avoir retiré le protocole et l'extension
(`services/mccSuggestion.js:55`).

**Lecture.** Confirmé, et la veille a raison de le classer au meilleur rapport
valeur/effort : la liste que Braintree vérifie recoupe les obligations de
l'article 25 de la loi n° 2000-83 que le contrat STB impose **déjà** au
commerçant tunisien. Nous contrôlerions une exigence contractuelle existante.

**Suite donnée** : EVO-17, catégorie A.

---

### Écart 4 — « Aucun contrôle externe : ni registre, ni sanctions, ni bénéficiaires effectifs » → **confirmé, mais hors d'atteinte en l'état**

**Preuve.** Même recherche que ci-dessus : aucun appel sortant. `rne` et `tax_id`
ne sont soumis qu'à un contrôle de forme (`requestSchema.js:59-62` :
`/^[A-Za-z0-9-]{6,32}$/`) ; aucun code ne les confronte à quoi que ce soit.

**Lecture.** Le fait est exact. La conséquence que la veille en tire — « un RNE
inventé passe » — l'est aussi. Mais aucune des trois briques citées (registre,
sanctions, bénéficiaires effectifs) n'est réalisable sans un tiers payant et une
spécification d'interface que nous n'avons pas. La veille elle-même ne cite
aucune API publique du Registre National des Entreprises tunisien.

**Suite donnée** : question B-5 pour le principe, catégorie C-4 pour la
réalisation. Un sous-ensemble **est** à notre portée sans tiers : la détection de
doublon sur le RNE et sur l'adresse du site (EVO-20), qui attrape le cas le plus
fréquent en agence — la ressaisie d'un dossier existant.

---

### Écart 5 — « Le risque du marchand n'est pas évalué, alors que les données sont collectées » → **confirmé, et c'est le constat le mieux fondé de la veille**

**Preuve.** Les trois champs sont saisis (`web/src/pages/RequestFormPage.jsx:395-403`),
validés (`server/src/services/requestSchema.js:93-95`), écrits en base
(`server/src/services/requests.js:33-35` → `schema.sql:94-96`) et réaffichés
(`web/src/pages/RequestDetailPage.jsx:197-199`). Une recherche exhaustive de
`sellsAbroad|sells_abroad|monthlyVolume|monthly_volume|averageBasket|average_basket`
sur `server/src` et `web/src` ne renvoie **que** ces occurrences : aucune règle,
aucun calcul, aucun affichage synthétique. Le moteur de suggestion ne les
déstructure même pas (`services/mccSuggestion.js:37-47`).

Le seul niveau de risque du produit est bien porté par le **code MCC** et non par
le marchand : `schema.sql:42-43` (`risk_level` sur `mcc_codes`), exploité en
`mccSuggestion.js:70` pour exclure les codes `INTERDIT`.

**Lecture.** Confirmé. C'est le gisement le plus immédiat : la donnée est là, le
besoin est attesté par une source tunisienne de première main (la Banque de
Tunisie demande exactement ces trois éléments à l'affiliation, § 2.8 de la
veille), et la règle peut rester entièrement explicable.

**Suite donnée** : EVO-18, catégorie A.

---

### Écart 6 — « Le dossier s'arrête à la validation, alors que le contrat commence » → **confirmé, à séparer en deux**

**Preuve.** `schema.sql:56-57` :
`status ... CHECK (status IN ('BROUILLON', 'SOUMISE', 'COMPLEMENT_REQUIS', 'VALIDEE', 'REJETEE'))`.
Aucun état de suspension ni de radiation. Aucune colonne de numéro d'affiliation
monétique, de numéro de terminal, de taux de commission, d'URL de notification,
d'URL de retour ni de 3-D Secure dans `affiliation_requests` (`schema.sql:51-119`).
La référence `AFF-<année>-<séquence>` (`services/requests.js:80-83`) est bien une
référence interne de dossier, pas un numéro d'affiliation réseau.

**Lecture.** Confirmé, mais l'écart recouvre deux choses de nature différente :

- **des rubriques du dossier lui-même** — URL de notification, URL de retour OK
  et problème, deux cases 3-D Secure — qui figurent au contrat STB que nous
  dématérialisons et que l'agent remplit **au même moment** que le reste. Les
  ajouter ne change ni le périmètre, ni les utilisateurs, ni les règles. C'est
  une évolution simple ;
- **une vie du contrat après validation** — tests SMT, mise en production,
  suspension sur taux de contestation, radiation, résiliation — qui est un autre
  produit, avec d'autres utilisateurs et d'autres données.

**Suite donnée** : EVO-21 (catégorie A) pour le premier volet, question B-3 pour
le second.

---

### Écart 7 — « Rien ne sort du système » → **confirmé, à nuancer**

**Preuve.** Aucune dépendance de messagerie ni de client HTTP dans
`server/package.json` (`bcrypt`, `cors`, `dotenv`, `exceljs`, `express`,
`helmet`, `jsonwebtoken`, `multer`, `pg`, `zod`). Aucun appel sortant dans
`server/src`. Aucun ordonnanceur.

**Nuance importante.** La veille écrit « aucun export PDF du dossier », ce qui est
vrai, mais elle oublie que **l'export du référentiel MCC existe bel et bien**, en
`.xlsx` et en `.csv` (`server/src/routes/admin.js:111-130`, service
`mccImportFile.js`). « Rien ne sort » est donc exact pour le **dossier**, faux
pour le **référentiel**. La formule est trop large.

**Lecture.** Le webhook et le courriel supposent de savoir à qui l'on parle : ni
le système monétique cible, ni le core banking, ni le serveur de messagerie de la
banque ne sont spécifiés. En revanche, **un export imprimable du dossier** ne
dépend de personne : c'est la pièce que l'agent joint au contrat papier signé.

**Suite donnée** : EVO-22 (catégorie A) pour l'export du dossier, question B-6
pour les notifications sortantes.

---

### Écart 8 — « Le contrôle à quatre yeux souffre une exception connue » → **confirmé, avec la ligne exacte**

**Preuve.** `server/src/middleware/auth.js:77-81` :

```js
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role === 'ADMIN' || roles.includes(req.user.role)) return next();
  next(forbidden(`Action réservée aux profils : ${roles.join(', ')}`));
};
```

Le profil `ADMIN` franchit donc `requireRole('AGENT')` (`routes/requests.js:47`,
création ; `:62`, modification ; `:72`, soumission) **et** `requireRole('BANQUIER')`
(`routes/requests.js:81`, décision). Le cloisonnement par banque lui est également
levé : `services/requests.js:190` (`if (user.role !== 'ADMIN' && row.bank_id !== user.bankId)`),
`:200-203` (liste) et `:403-406` (statistiques).

**Lecture.** Confirmé exactement comme annoncé, et c'est bien une rupture de la
séparation des tâches, pas un confort. C'est aussi, mot pour mot, la réserve R-04
du rapport de recette, qui la qualifie de « décision métier, pas défaut
technique ». Je m'aligne : ce n'est pas à l'agent 3 de la trancher.

**Suite donnée** : question B-2.

---

### Les deux écarts mineurs

**« Le parcours de saisie est figé dans le code »** → **confirmé**, et écarté.
`web/src/pages/RequestFormPage.jsx:11-17` déclare les cinq étapes en constante.
Mais nos cinq étapes couvrent un contrat papier stable depuis 2020 ; un
constructeur de parcours coûterait plusieurs semaines pour une souplesse dont
aucun utilisateur n'a exprimé le besoin. Catégorie C-6.

**« Aucune détection de doublon »** → **confirmé**. `schema.sql` ne pose de
contrainte `UNIQUE` que sur `banks.code` (ligne 6), `users.email` (ligne 18),
`affiliation_requests.reference` (ligne 53) et le triplet de `mcc_suggestions`
(ligne 135). Ni `rne` ni `site_url` n'en portent. Retenu : EVO-20.

---

### Ce que la veille annonce et que je corrige

| Affirmation de la veille | Vérification |
| --- | --- |
| « Rien ne sort du système […] aucun export » (§ 1.3, écart 7) | **Trop large.** L'export du référentiel MCC existe en `.xlsx` et `.csv` (`routes/admin.js:111-130`). L'écart porte sur le **dossier**, pas sur le référentiel. |
| « le `riskLevel` existe sur le code MCC, pas sur le marchand » (§ 3.2) | **Exact**, vérifié en `schema.sql:42-43` et `mccSuggestion.js:70`. |
| « `matchedTerms` renvoyé pour chaque proposition » (§ 3.3) | **Exact**, et l'invariant est tenu en dur : `mccSuggestion.js:143` filtre sur `rawScore > 0 && matchedTerms.length > 0`. |
| « les codes `INTERDIT` sont exclus des propositions (`mccSuggestion.js`, ligne 70) » | **Exact**, ligne 70 vérifiée. |
| « filet de sécurité explicite (`mccSuggestion.js`, ligne 149) » | **Exact**, mais la veille ne relève pas qu'il est **non défendu** : `mccSuggestion.js:148` fait `catalogueActif().find((m) => m.code === '5999')` sans vérifier le résultat. Si `5999` est désactivé ou absent, le produit renvoie un objet sans code ni libellé. C'est le constat `C-17` de la revue, toujours ouvert. Retenu : EVO-02. |
| « le MCC est figé à la validation » (§ 3.3) | **Exact** : `services/requests.js:322-340` écrit `final_visa_mcc` / `final_mastercard_mcc` et aucune route ne les remet en cause ensuite. |

---

## 3. Tableau de priorisation

**Catégories** — **A** : à coder, manque réel dans le périmètre actuel, sans
décision métier nouvelle. **B** : décision à soumettre au commanditaire. **C** :
écarté (autre projet, tiers payant, ou spécification absente).

**Valeur** : appréciée pour l'utilisateur réel — l'agent qui saisit, le banquier
qui arbitre, l'administrateur qui tient le référentiel.

### 3.1 Catégorie A — à coder (§ 4)

| Id | Intitulé | Valeur | Effort | Dépend de | Recette |
| --- | --- | --- | --- | --- | --- |
| EVO-01 | Tests automatisés des invariants d'import du référentiel | Haute | 1 j | — | **R-01** |
| EVO-02 | Défendre le repli `5999` contre son absence du référentiel | Haute | 0,25 j | — | **R-08** (`C-17`) |
| EVO-03 | Unicité de l'adresse électronique insensible à la casse, en base | Haute | 0,25 j | — | **R-07** (`C-16`) |
| EVO-04 | Tracer le changement de mot de passe par l'utilisateur | Moyenne | 0,25 j | — | **R-06** (`C-05`) |
| EVO-05 | Journaliser les valeurs avant / après des modifications de compte | Moyenne | 0,5 j | — | **R-06** (`C-06`) |
| EVO-06 | Paginer le journal d'administration | Moyenne | 0,5 j | — | **R-06** (`C-24`) |
| EVO-07 | Rétablir l'écoute du référentiel après une coupure | Haute | 0,5 j | — | **R-08** (`C-13`) |
| EVO-08 | Rendre autoportante la photographie des suggestions | Moyenne | 1 j | — | **R-08** (`C-03`) |
| EVO-09 | Réactiver un code réintroduit par un import | Moyenne | 0,5 j | EVO-01 | `C-15` |
| EVO-10 | Ne rien laisser fuir des erreurs internes | Moyenne | 0,5 j | — | **R-03** |
| EVO-11 | Limiter le débit avant la validation du corps | Faible | 0,5 j | — | **R-12** (`D5`) |
| EVO-12 | Diagnostic d'incident : conserver l'erreur d'origine | Faible | 1 j | — | **R-14** (`C-04`, `C-09`) |
| EVO-13 | Suite de tests automatisés de l'interface | Haute | 4 j | — | **R-05** |
| EVO-14 | Retouches d'homogénéité de l'interface | Faible | 1 j | — | **R-16** (`D7`) |
| EVO-15 | Mettre le plan de tests à jour | Moyenne | 0,5 j | — | **R-15** |
| EVO-16 | Performance : tri indexé, pagination, double authentification, import | Moyenne | 2 j | — | **R-09** (`C-07`, `C-21`, `C-23`) |
| EVO-17 | Contrôle automatique du site marchand | Haute | 3 j | — | non |
| EVO-18 | Profil de risque du marchand sur données déjà collectées | Haute | 2 j | — | non |
| EVO-19 | Signaler les contradictions entre déclaration et descriptif | Haute | 1 j | — | oui (question de produit versée au dossier) |
| EVO-20 | Détection des doublons (RNE, adresse du site) | Haute | 1 j | — | non |
| EVO-21 | Rubriques techniques du contrat STB | Moyenne | 1 j | — | non |
| EVO-22 | Export imprimable du dossier | Moyenne | 1 j | EVO-21 | § 2.2 A (« export PDF non implémenté ») |

**Total catégorie A : 23,25 jours-personne**, dont **3,25 jours** pour les sept
premières lignes, qui conditionnent la mise en service.

### 3.2 Catégorie B — décisions à soumettre (huit questions, § 5)

| Id | Question | Enjeu | Effort si « oui » |
| --- | --- | --- | --- |
| B-1 | Ouvrir la plateforme au marchand lui-même ? | Périmètre, utilisateurs, sécurité | 15 j et plus |
| B-2 | Restreindre le rôle administrateur ? | Séparation des tâches, conformité (**R-04**, `D6`, `C-10`) | 1 j |
| B-3 | Aller au-delà de la validation, vers le contrat et sa vie ? | Périmètre, règles métier | 10 j et plus |
| B-4 | Attacher des pièces justificatives au dossier ? | Stockage, rétention, données personnelles | 4 à 6 j |
| B-5 | Souscrire un contrôle externe (registre, sanctions) ? | Budget récurrent, dépendance tierce | à chiffrer avec le prestataire |
| B-6 | Faire sortir des notifications du système ? | Intégration, destinataires à spécifier | 2 à 8 j selon le canal |
| B-7 | Conserver le jeton dans le stockage local du navigateur ? | Sécurité (**R-13**, `C-25`) | 1 à 2 j si changement |
| B-8 | Quelles valeurs de seuils pour le profil de risque (EVO-18) ? | Règle métier, pas de code | 0,5 j côté commanditaire |

### 3.3 Catégorie C — écarté (§ 6)

| Id | Sujet | Motif |
| --- | --- | --- |
| C-1 | Référentiel et particularités Mastercard | Document jamais obtenu (protection anti-robot) |
| C-2 | Signature électronique qualifiée du contrat | Tiers de confiance non désigné, pas de spécification |
| C-3 | Filtrage sanctions, PPE, biométrie, entretien vidéo | Prestation tierce payante |
| C-4 | Interrogation du Registre National des Entreprises | Aucune API publique documentée |
| C-5 | Enregistrement VIRP du marchand auprès de Visa | Relation acquéreur / réseau, hors produit |
| C-6 | Constructeur de parcours par glisser-déposer | Coût sans rapport avec le besoin observé |
| C-7 | Reclassement en masse d'un portefeuille existant | Aucun portefeuille en production |
| C-8 | Phase de tests avec la SMT | Interface SMT non spécifiée |
| C-9 | Déduction du MCC par apprentissage automatique | Contredit l'explicabilité, notre seul avantage |
| C-10 | Réutilisation d'informations entre dossiers (*networked onboarding*) | Cas d'usage absent |
| C-11 | Campagne de mesure de charge, recette mobile et multi-navigateurs | Activités de recette, pas de code (**R-09**, **R-10**) |
| C-12 | Audit de sécurité externe, reprise après incident | Prestation externe |

---

## 4. Fiches détaillées — catégorie A

Chaque fiche est écrite pour être exécutable sans retour vers moi. Sauf mention
contraire, tous les chemins sont relatifs à
`/home/user/simulateur/clicktopay-affiliation/`.

Convention commune à toutes les fiches : **aucun message d'erreur destiné à
l'utilisateur n'est en anglais**, conformément à la carte de messages déjà en
place (`server/src/services/zodMessages.js`).

---

### EVO-01 — Tests automatisés des invariants d'import du référentiel

**Catégorie** A. **Effort** 1 j. **Valeur** haute. **Couvre** R-01.

**Besoin.** L'import du référentiel modifie la donnée réglementaire de toutes les
banques d'un coup ; quatre cas bloquants du plan n'ont jamais été exécutés et
trois d'entre eux portent sur des **invariants**, pas sur des cas — ils doivent
donc être tenus par des tests, pas par une exécution unique.

**État vérifié.** La suite couvre déjà partiellement le sujet :
`server/tests/admin.test.js:347` (« l'import produit un rapport d'écart sans rien
modifier ») et `:369` (« l'import applique les écarts et historise chaque code
touché »), et la lecture de fichier est éprouvée dans
`server/tests/robustesse.test.js:359-440`. **Ce qui manque** est précisément ce
que R-01 nomme : la voie fichier pour les invariants, la désactivation optionnelle
réellement exercée dans ses deux branches, et les anomalies numérotées.

**Comportement attendu — quatre invariants à poser.**

1. *CAS-IMPORT-08 — la simulation n'écrit rien.* Pour `POST /api/admin/mcc/import-fichier`
   (qui force `apply: false`, `routes/admin.js:181`) et pour
   `POST /api/admin/mcc/import` sans `apply` : après l'appel, **aucune ligne**
   n'est ajoutée à `mcc_codes`, `mcc_code_history` ni `admin_events`, et aucune
   valeur n'a changé. Le test compare les trois compteurs et une empreinte des
   codes touchés, avant et après.
2. *CAS-IMPORT-09 — rien n'est appliqué sans confirmation explicite.* `apply`
   absent, `apply: false`, `apply: "false"` et `apply: 0` produisent tous un
   rapport et **aucune écriture**. Seul `apply: true` écrit.
3. *CAS-IMPORT-10 — la désactivation des absents est strictement optionnelle.*
   Avec `apply: true` et `deactivateMissing` absent ou faux, les codes absents du
   fichier restent `active = TRUE` et `rapport.resume.desactivationDesRetires`
   vaut `false`. Avec `deactivateMissing: true`, ils passent `active = FALSE`,
   **ne sont pas supprimés** (`SELECT count(*) FROM mcc_codes` inchangé), et
   chacun reçoit une ligne `IMPORT_DESACTIVATION` dans `mcc_code_history`.
4. *CAS-IMPORT-06 — les anomalies portent leur numéro de ligne.* Un fichier
   `.xlsx` contenant une ligne sans code, un code en doublon, une pertinence
   inconnue et un niveau de vigilance inconnu renvoie quatre entrées dans
   `anomalies`, chacune avec un champ `ligne` égal au numéro réel de la ligne du
   classeur, et le reste du fichier est lu normalement
   (`server/src/services/mccImportFile.js:138`, `:142`, `:159`, `:166`).

**Fichiers.** `server/tests/admin.test.js` (compléter) ou nouveau fichier
`server/tests/import.test.js` ; `server/tests/helpers.js` si un utilitaire de
construction de classeur est nécessaire (`exceljs` est déjà une dépendance).

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- `cd server && npm test` passe, avec au moins quatre tests nouveaux nommés
  d'après les quatre invariants ci-dessus.
- Chacun des quatre tests **échoue** si l'on supprime la garde correspondante
  dans `mccAdmin.js` ou `routes/admin.js` (vérification à faire une fois, à la
  main, avant de rendre).
- Le décompte total de la suite passe de 115 à au moins 119.

---

### EVO-02 — Défendre le repli `5999` contre son absence du référentiel

**Catégorie** A. **Effort** 0,25 j. **Valeur** haute. **Couvre** R-08 (`C-17`).

**Besoin.** Le filet de sécurité du moteur suppose que le code `5999` est présent
et actif. Rien ne le garantit : un administrateur peut le désactiver depuis
l'écran de référentiel, ou un import avec `deactivateMissing` peut le faire
tomber.

**État vérifié.** `server/src/services/mccSuggestion.js:147-150` :

```js
if (scored.length === 0) {
  const fallback = catalogueActif().find((m) => m.code === '5999');
  return [{ ...fallback, score: 10, rawScore: 0, matchedTerms: ['aucune correspondance : code de repli'] }];
}
```

Si `find` ne trouve rien, `fallback` vaut `undefined`, `{ ...undefined }` vaut
`{}`, et le moteur renvoie une proposition **sans code, sans libellé et sans
description**. L'interface affiche alors une carte vide
(`web/src/components/ui.jsx`, composant `CarteMcc`), et l'agent ne peut rien en
faire.

**Comportement attendu.**

- *Cas nominal* : `5999` présent et actif — comportement inchangé.
- *Cas limite 1* : `5999` absent ou désactivé, mais un autre code actif de
  vigilance `STANDARD` existe — le moteur renvoie une **liste vide** plutôt qu'un
  objet mutilé, et l'appelant le traite comme tel.
- *Cas limite 2* : le catalogue actif est vide — même réponse, liste vide.
- Côté API, `POST /api/mcc/suggest` renvoie alors `{ "VISA": [], "MASTERCARD": [] }`
  avec un code 200 : ce n'est pas une erreur serveur, c'est un référentiel qui ne
  permet aucune proposition.
- Côté interface, l'absence de proposition affiche le message :
  « Aucune proposition ne peut être faite : le code de repli 5999 est absent du
  référentiel actif. Recherchez un code manuellement ou prévenez
  l'administrateur. » La recherche manuelle reste disponible.
- Une ligne est écrite dans le journal du serveur :
  `console.error('Code de repli 5999 absent du référentiel actif')`.

**Fichiers.**

- `server/src/services/mccSuggestion.js` — remplacer le bloc `147-150`.
- `web/src/pages/RequestFormPage.jsx` — composant `SelectionMcc`, brancher le
  message sur une liste vide.
- `server/tests/mcc.test.js` — test nouveau.

**Schéma de base.** Aucun changement.

**Règles de validation.** Aucune nouvelle.

**Critères d'acceptation.**

- Avec `5999` désactivé par `PUT /api/admin/mcc/5999 {"active": false}`, un appel
  à `POST /api/mcc/suggest` avec un descriptif sans aucune correspondance renvoie
  200 et deux listes vides — et **jamais** un objet dont `code` est `undefined`.
- La même opération sur l'écran de saisie affiche le message ci-dessus, en
  français, sans erreur JavaScript dans la console.
- `5999` réactivé, le comportement d'origine revient sans redémarrage (le
  rechargement du catalogue est déjà en place, `mccCatalog.js:155-177`).

---

### EVO-03 — Unicité de l'adresse électronique insensible à la casse, portée par la base

**Catégorie** A. **Effort** 0,25 j. **Valeur** haute. **Couvre** R-07 (`C-16`).

**Besoin.** L'unicité de l'adresse est aujourd'hui garantie par deux requêtes
applicatives — `server/src/services/admin.js:84` à la création,
`:132-137` à la modification — toutes deux écrites en `lower(email) = lower($1)`.
La contrainte de base, elle, est **sensible à la casse** :
`server/src/db/schema.sql:18`, `email VARCHAR(160) NOT NULL UNIQUE`. Deux créations
simultanées de `Agent@banque.tn` et `agent@banque.tn` passent donc toutes les
deux, et la connexion (`routes/auth.js:38`, `WHERE lower(u.email) = lower($1)`)
renverrait alors deux lignes dont une seule serait retenue arbitrairement.

**Comportement attendu.**

- *Cas nominal* : création d'un compte avec une adresse neuve — inchangé.
- *Cas limite 1* : création d'un compte dont l'adresse ne diffère d'une existante
  que par la casse — refus en **409** avec le message déjà en place :
  « Un compte existe déjà avec l'adresse `<adresse saisie>`. »
- *Cas limite 2* : deux créations concurrentes de la même adresse à la casse près
  — l'une aboutit, l'autre reçoit un **409** avec le même message. La violation
  d'index remontée par PostgreSQL (`23505`) doit être **traduite** et non laissée
  remonter en 500.
- *Cas limite 3* : modification d'un compte vers une adresse déjà prise à la
  casse près — refus en 409 :
  « Un autre compte utilise déjà l'adresse `<adresse saisie>`. »

**Fichiers.**

- `server/src/db/schema.sql` — ajouter en fin de fichier, après avoir vérifié
  l'absence de doublon existant :
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));`
  La contrainte `UNIQUE` d'origine ligne 18 est conservée : elle est redondante
  mais la retirer exigerait un `ALTER TABLE` non idempotent.
- `server/src/services/admin.js` — envelopper les écritures de `createUser` et
  `updateUser` pour traduire l'erreur `23505` portant sur `idx_users_email_lower`
  en `conflict(...)`.
- `server/tests/admin.test.js` — test nouveau.

**Schéma de base.** Un index unique fonctionnel. Migration idempotente, exécutée
par `npm run db:migrate`. **Attention** : si la base de destination contient déjà
deux adresses ne différant que par la casse, la création de l'index échoue. La
migration doit donc être précédée d'un contrôle qui les liste et refuse de
continuer avec un message explicite plutôt que d'échouer sur une erreur
PostgreSQL brute.

**Critères d'acceptation.**

- `npm run db:migrate` deux fois de suite réussit (idempotence).
- `POST /api/admin/users` avec `Agent@banque.tn` alors que `agent@banque.tn`
  existe renvoie 409 et le message français, jamais 500.
- Un `INSERT` direct en SQL de `AGENT@BANQUE.TN` est refusé par la base.
- Les 115 tests existants restent verts.

---

### EVO-04 — Tracer le changement de mot de passe par l'utilisateur

**Catégorie** A. **Effort** 0,25 j. **Valeur** moyenne. **Couvre** R-06 (`C-05`).

**Besoin.** La réinitialisation par un administrateur est journalisée
(`server/src/services/admin.js:200-203`, action
`REINITIALISATION_MOT_DE_PASSE`), mais le changement par l'utilisateur lui-même
ne l'est pas : `changeOwnPassword` (`admin.js:209-225`) écrit la nouvelle
empreinte et rend la main sans appeler `journaliser`. Un contrôle interne ne peut
donc pas établir qu'un compte a changé de mot de passe, ni quand.

**Comportement attendu.**

- *Cas nominal* : `POST /api/auth/password` réussi — une ligne est insérée dans
  `admin_events` : `user_id` = l'utilisateur lui-même, `entity` = `'USER'`,
  `entity_id` = son identifiant, `action` = `'CHANGEMENT_MOT_DE_PASSE'`,
  `payload` = `{ "impose": true|false }` selon que le changement était imposé
  (`must_change_password` valait vrai avant l'opération).
- **Le mot de passe, ancien comme nouveau, n'apparaît nulle part dans le
  `payload`.** C'est un invariant à tester.
- *Cas limite 1* : mot de passe actuel incorrect — refus en 400, message existant
  (« Le mot de passe actuel est incorrect. »), **aucune ligne** de journal.
- *Cas limite 2* : nouveau mot de passe identique à l'ancien — refus en 400,
  message existant, aucune ligne de journal.
- L'écriture du journal et la mise à jour du mot de passe sont dans la **même
  transaction** : `changeOwnPassword` utilise aujourd'hui `query` directement
  (`admin.js:219`), il faut passer par `withTransaction`.

**Fichiers.**

- `server/src/services/admin.js` — `changeOwnPassword`, lignes 209 à 225.
- `server/tests/auth.test.js` — test nouveau.

**Schéma de base.** Aucun changement : `admin_events` accueille déjà cette forme.

**Critères d'acceptation.**

- Après un changement réussi, `GET /api/admin/events` (profil administrateur)
  contient une entrée `CHANGEMENT_MOT_DE_PASSE` portant le nom de l'utilisateur
  concerné et un horodatage.
- Le `payload` de cette entrée ne contient aucune chaîne correspondant au
  mot de passe employé.
- Un échec de changement n'ajoute aucune entrée.

---

### EVO-05 — Journaliser les valeurs avant et après des modifications de compte

**Catégorie** A. **Effort** 0,5 j. **Valeur** moyenne. **Couvre** R-06 (`C-06`).

**Besoin.** Le référentiel MCC journalise correctement
(`mccAdmin.js`, `avant` / `apres` en JSONB, `schema.sql:170-179`), mais
l'administration des comptes ne journalise que **les noms des champs touchés** :
`server/src/services/admin.js:154-157`,
`payload: { champs: Object.keys(payload) }`. On sait qu'un rôle a changé, jamais
de quoi vers quoi. Pour un contrôle interne bancaire, c'est la différence entre
une piste d'audit et un accusé de réception.

**Comportement attendu.**

- *Cas nominal* : `PUT /api/admin/users/:id` avec `{"role": "BANQUIER"}` sur un
  compte `AGENT` écrit dans `admin_events` un `payload` de la forme :

```json
{ "champs": { "role": { "avant": "AGENT", "apres": "BANQUIER" } } }
```

- Les champs journalisés sont ceux de `CHAMPS_UTILISATEUR`
  (`admin.js:104-111`) : `firstName`, `lastName`, `email`, `role`, `bankId`,
  `active`. Pour `bankId`, journaliser **l'identifiant et le code de la banque**,
  le code seul étant lisible par un contrôleur : `{"avant": {"id": 1, "code": "STB"}, "apres": {"id": 2, "code": "BT"}}`.
- *Cas limite 1* : un champ transmis avec une valeur **identique** à l'existante
  n'apparaît pas dans le `payload`. Si aucun champ ne change réellement, la ligne
  de journal reste écrite, avec `champs` vide et une clé
  `"sansEffet": true` — un appel doit rester traçable même s'il ne modifie rien.
- *Cas limite 2* : la création (`createUser`, `admin.js:93-96`) conserve son
  `payload` actuel, qui porte déjà les valeurs ; y ajouter `bankCode`.
- *Cas limite 3* : les modifications de banque (`updateBank`) reçoivent le même
  traitement, avec les champs `code`, `name`, `active`.
- Aucune empreinte ni aucun mot de passe ne figure dans le `payload`.

**Fichiers.**

- `server/src/services/admin.js` — `updateUser` (113-159), `createUser` (81-102),
  `updateBank`.
- `web/src/pages/AdminEventsPage.jsx` — le journal affiche aujourd'hui le
  `payload` brut ; il doit rendre les couples avant / après de façon lisible :
  « rôle : AGENT → BANQUIER ».
- `server/tests/admin.test.js` — compléter le test existant
  « les actions d'administration sont journalisées » (ligne 229).

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- Une modification de rôle produit une entrée de journal où le rôle avant et le
  rôle après sont tous deux lisibles.
- Une modification qui ne change rien produit une entrée portant `sansEffet`.
- L'écran Journal affiche « rôle : AGENT → BANQUIER » et non un objet JSON brut.
- Le `payload` d'une création ou d'une modification ne contient jamais de
  mot de passe ni d'empreinte.

---

### EVO-06 — Paginer le journal d'administration

**Catégorie** A. **Effort** 0,5 j. **Valeur** moyenne. **Couvre** R-06 (`C-24`).

**Besoin.** `GET /api/admin/events` n'accepte qu'une limite, plafonnée à 500
(`server/src/routes/admin.js:206-215`). Au-delà, les entrées les plus anciennes
deviennent **inatteignables par l'application** : il faut une requête SQL directe
pour les lire. Une piste d'audit qu'on ne peut pas remonter n'en est pas une.

**Comportement attendu.**

- `GET /api/admin/events` accepte `limit` (défaut 100, borné 1..500, inchangé) et
  **`offset`** (défaut 0, borné 0..1 000 000), traités par `entierDeRequete`
  (`middleware/errors.js:45`) comme ailleurs dans le produit.
- La réponse devient `{ "count": <nombre renvoyé>, "total": <nombre total>, "items": [...] }`.
  `total` est un `COUNT(*)` sur `admin_events`.
- Trois filtres facultatifs, tous cumulables : `entity` (`USER`, `BANK`, `MCC`),
  `action`, et `depuis` / `jusqua` (dates ISO `AAAA-MM-JJ`, bornes incluses sur
  `created_at`).
- *Cas limite 1* : `offset` supérieur au total — réponse 200, `items` vide,
  `total` correct.
- *Cas limite 2* : `entity` inconnue — refus en 400, message
  « Entité inconnue : « `<valeur>` ». Valeurs acceptées : USER, BANK, MCC. »
- *Cas limite 3* : `depuis` postérieure à `jusqua` — refus en 400, message
  « La date de début doit précéder la date de fin. »
- *Cas limite 4* : date non interprétable — refus en 400, message
  « Date invalide : « `<valeur>` ». Format attendu : AAAA-MM-JJ. »
- L'ordre reste `created_at DESC`, complété par `id DESC` pour rendre la
  pagination **stable** lorsque deux entrées partagent le même horodatage.
- Côté interface, l'écran Journal reçoit une barre de pagination
  « Précédent / Suivant » et l'indication « entrées 101 à 200 sur 1 342 ».

**Fichiers.**

- `server/src/routes/admin.js:206-215`.
- `server/src/services/admin.js` — `listAdminEvents`.
- `web/src/pages/AdminEventsPage.jsx`.
- `web/src/api/client.js` — la méthode correspondante.
- `server/tests/admin.test.js`.

**Schéma de base.** Aucun changement de structure. L'index
`idx_admin_events_date` (`schema.sql:194`) couvre déjà le tri ; le compléter en
`(created_at DESC, id DESC)` pour que le tri stable reste indexé.

**Critères d'acceptation.**

- Avec 250 entrées, `?limit=100&offset=200` renvoie les 50 dernières, `total`
  vaut 250, et aucune entrée n'apparaît deux fois sur les trois pages.
- `?entity=USER&action=CREATION` ne renvoie que des créations de compte.
- `?depuis=2026-09-22&jusqua=2026-09-21` renvoie 400 avec le message français.
- L'écran affiche le compteur de position et les deux boutons, qui se désactivent
  aux bornes.

---

### EVO-07 — Rétablir l'écoute du référentiel après une coupure

**Catégorie** A. **Effort** 0,5 j. **Valeur** haute. **Couvre** R-08 (`C-13`).

**Besoin.** Chaque instance de l'API écoute les modifications du référentiel par
`LISTEN` sur une connexion dédiée. À la première erreur, cette connexion est
relâchée et **rien ne la rouvre** : `server/src/services/mccCatalog.js:212-216` :

```js
client.on('error', (err) => {
  console.error('Écoute du référentiel MCC interrompue :', err.message);
  ecoute = null;
  client.release(err);
});
```

`ecouterModifications` (ligne 202) n'est appelée qu'au démarrage. Après un
redémarrage de PostgreSQL, un basculement ou une coupure réseau, l'instance
continue de servir un référentiel **figé**, sans le savoir et sans le dire. Le
contrôle de santé ne le voit pas non plus : `app.js:42-46` regarde le dernier
chargement, pas l'état de l'écoute.

**Comportement attendu.**

- *Cas nominal* : écoute établie au démarrage — inchangé.
- *À la perte de la connexion d'écoute* : l'instance tente de la rétablir, avec un
  délai croissant (1 s, 2 s, 4 s, 8 s, 16 s, puis 30 s en palier), sans limite de
  tentatives. Chaque tentative est tracée une fois, pas à chaque essai : une
  ligne à la perte, une ligne au rétablissement.
- *Au rétablissement* : **le catalogue est rechargé immédiatement**
  (`rechargerCatalogue({ diffuser: false })`), car des modifications ont pu
  survenir pendant la coupure. C'est le point essentiel : rouvrir l'écoute sans
  recharger laisserait l'instance sur une photographie périmée.
- L'état de l'écoute est exposé : `etatCatalogue()` (`mccCatalog.js:186-191`)
  gagne un champ `ecoute` valant `'active'`, `'perdue'` ou `'jamais_etablie'`, et
  `GET /api/health` le restitue.
- *Effet sur la santé* : une écoute perdue **ne fait pas** passer l'instance en
  `503` — elle sert encore correctement les demandes — mais le champ apparaît
  dans la réponse pour que l'exploitation le voie.
- À l'arrêt du processus, les tentatives en cours sont annulées (`unref` sur le
  minuteur, comme `rateLimit.js:27`), faute de quoi les tests ne se terminent pas.

**Fichiers.**

- `server/src/services/mccCatalog.js:198-220` — `ecouterModifications`, plus
  `etatCatalogue`.
- `server/src/app.js:42-56` — restitution dans `/api/health`.
- `server/src/index.js` — s'assurer que l'arrêt propre annule les tentatives.
- `server/tests/robustesse.test.js` — test nouveau.

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- Un test qui émet manuellement l'événement `error` sur le client d'écoute
  observe une nouvelle tentative de connexion, puis `ecoute: 'active'` dans
  `GET /api/health`, et un rechargement du catalogue effectué **après** le
  rétablissement.
- Une modification du référentiel faite pendant la coupure est visible par
  l'instance une fois l'écoute rétablie, sans redémarrage.
- `npm test` se termine sans processus suspendu.

---

### EVO-08 — Rendre autoportante la photographie des suggestions

**Catégorie** A. **Effort** 1 j. **Valeur** moyenne. **Couvre** R-08 (`C-03`).

**Besoin.** À la soumission, la plateforme fige les propositions du moteur dans
`mcc_suggestions` (`schema.sql:126-136`) : code, rang, score, termes. Mais la
relecture reconstitue le libellé **depuis le catalogue vivant** :
`server/src/services/requests.js:367-373` :

```js
const mcc = getMcc(row.mcc_code);
grouped[row.network].push({ ...mcc, rank: row.rank, score: row.score, matchedTerms: row.matched_terms });
```

Si le code a été désactivé, renommé ou si sa description a été corrigée depuis,
le banquier consulte une photographie **retouchée**. Si le code a disparu du
cache, `getMcc` renvoie `null` et l'entrée n'a plus ni code ni libellé — le même
défaut que celui d'EVO-02, à un autre endroit. C'est une atteinte directe à la
piste d'audit : la justification qu'on relit n'est plus celle qui a été servie.

**Comportement attendu.**

- *À l'écriture* (`submitRequest`, `requests.js:262-273`) : la photographie
  conserve désormais, en plus du code, le **libellé** et la **description
  française** tels qu'ils étaient au moment de la soumission.
- *À la relecture* (`getSuggestionsSnapshot`) : les valeurs servies sont **celles
  de la photographie**, jamais celles du catalogue courant.
- *Cas limite 1* : le code a été désactivé depuis — l'entrée est restituée
  normalement, avec son libellé d'époque, assortie d'un drapeau
  `"plusAuReferentiel": true`. L'interface affiche à côté de la carte :
  « Ce code a été désactivé du référentiel depuis la soumission. »
- *Cas limite 2* : le libellé a changé depuis — l'entrée restitue le libellé
  d'époque et porte `"libelleActuel": "<nouveau libellé>"`. L'interface affiche :
  « Libellé au référentiel aujourd'hui : `<nouveau libellé>`. »
- *Cas limite 3* : demandes antérieures à l'évolution, dont la photographie ne
  porte pas les libellés — repli sur le catalogue courant, comme aujourd'hui,
  avec le drapeau `"libelleReconstitue": true`. **Aucune migration de données
  rétroactive** : on n'invente pas un libellé d'époque qu'on n'a pas conservé.
- Le même traitement s'applique au code retenu (`final_visa_mcc`,
  `final_mastercard_mcc`) affiché sur la fiche de la demande.

**Fichiers.**

- `server/src/db/schema.sql` — deux colonnes sur `mcc_suggestions` (voir
  ci-dessous).
- `server/src/services/requests.js` — `submitRequest` (233-286) et
  `getSuggestionsSnapshot` (358-376).
- `web/src/pages/RequestDetailPage.jsx` — affichage des drapeaux.
- `web/src/components/ui.jsx` — composant `CarteMcc`, mention complémentaire.
- `server/tests/requests.test.js` — tests nouveaux.

**Schéma de base.**

```sql
ALTER TABLE mcc_suggestions ADD COLUMN IF NOT EXISTS label_at_submit       VARCHAR(255);
ALTER TABLE mcc_suggestions ADD COLUMN IF NOT EXISTS description_at_submit TEXT;
```

Les deux colonnes sont **nullables** : c'est ce qui permet de distinguer une
photographie ancienne (repli assumé) d'une photographie complète.

**Règles de validation.** Aucune saisie utilisateur nouvelle.

**Critères d'acceptation.**

- Soumettre une demande, renommer ensuite le code retenu par
  `PUT /api/admin/mcc/:code`, puis relire
  `GET /api/requests/:id/suggestions` : le libellé servi est **celui d'avant** le
  renommage, et `libelleActuel` porte le nouveau.
- Désactiver ensuite ce code : la relecture reste complète, avec
  `plusAuReferentiel: true`, et **jamais** une entrée sans `code`.
- Une demande créée avant la migration se relit sans erreur, avec
  `libelleReconstitue: true`.
- L'écran du banquier affiche les deux mentions en français, sans rien masquer.

---

### EVO-09 — Réactiver un code réintroduit par un import

**Catégorie** A. **Effort** 0,5 j. **Valeur** moyenne. **Dépend de** EVO-01.
**Couvre** `C-15`.

**Besoin.** Un code désactivé qui réapparaît dans un fichier d'import reste
désactivé et le rapport d'écart l'annonce « inchangé ». L'administrateur croit
avoir remis le code en service ; il n'en est rien, et rien ne le lui dit.

**État vérifié.** `server/src/services/mccAdmin.js:216-217` : `COMPARABLES` liste
`label`, `description`, `labelEn`, `descriptionEn`, `keywords`, `similar`,
`ecommerceRelevance`, `riskLevel`, `note` — **pas `active`**. Et la mise à jour
(`mccAdmin.js:339-355`) ne touche jamais la colonne `active`.

**Comportement attendu.**

- *Cas nominal* : un code actif présent au fichier avec les mêmes valeurs reste
  classé « inchangé » — comportement actuel conservé.
- *Cas nouveau* : un code **désactivé** présent au fichier est classé dans une
  rubrique nouvelle du rapport, **`reactives`**, avec son code et son libellé. La
  rubrique apparaît dans `rapport.resume` sous la clé `reactives`.
- À l'application (`apply: true`), ces codes repassent `active = TRUE` et
  reçoivent une ligne `mcc_code_history` d'action `IMPORT_REACTIVATION`, avec
  `avant: { active: false }` et `apres: { active: true }`, portant le motif saisi.
- *Cas limite 1* : le fichier réintroduit un code désactivé **et** en modifie des
  champs — le code figure dans `modifies` **et** dans `reactives` ; les deux
  effets s'appliquent, et deux lignes d'historique sont écrites.
- *Cas limite 2* : un import avec `deactivateMissing: true` qui contient un code
  désactivé — le code est réactivé (il est présent au fichier), il n'est pas dans
  `retires`. La présence au fichier prime.
- *Cas limite 3* : simulation (`apply` absent) — le rapport annonce les
  réactivations, **rien n'est écrit**.
- Côté interface, l'écran d'import affiche une section « Codes réactivés » au même
  titre que « Ajoutés », « Modifiés » et « Absents du fichier », avec le décompte.
  Le texte d'accompagnement est : « Ces codes étaient désactivés et figurent dans
  le fichier : ils seront remis en service. »

**Fichiers.**

- `server/src/services/mccAdmin.js` — `compareImport` (238-282) et
  `importCatalog` (285-393).
- `web/src/pages/AdminMccImportPage.jsx` — section nouvelle.
- `server/tests/admin.test.js` ou `server/tests/import.test.js`.

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- Désactiver `5977`, puis importer un fichier qui le contient sans modification :
  la simulation annonce `reactives: 1` et `5977` reste désactivé.
- Le même import avec `apply: true` remet `5977` en service ; il réapparaît dans
  `GET /api/mcc/5977` (profil agent) et redevient proposable par le moteur.
- L'historique de `5977` porte une ligne `IMPORT_REACTIVATION` avec le motif.
- Un import identique rejoué ensuite classe `5977` « inchangé » et n'écrit rien.

---

### EVO-10 — Ne rien laisser fuir des erreurs internes

**Catégorie** A. **Effort** 0,5 j. **Valeur** moyenne. **Couvre** R-03
(CAS-ROB-12).

**Besoin.** Le cas CAS-ROB-12 — « les erreurs internes ne fuient pas » — n'a
jamais été exécuté, et la recette a relevé qu'un corps JSON tronqué renvoie le
message brut de l'analyseur. Le gestionnaire d'erreurs est correct sur le
principe (`server/src/middleware/errors.js:23-30` : au-delà de 500, il
substitue « Erreur interne du serveur »), mais il ne voit pas les erreurs levées
**avant** lui par `express.json()` (`app.js:19`), qui répond en 400 avec le texte
de l'analyseur — lequel peut contenir un extrait du corps reçu.

**Comportement attendu.**

- *Cas nominal* : corps JSON valide — inchangé.
- *Cas limite 1* : corps JSON malformé — réponse **400** avec le message
  « Le corps de la requête n'est pas un JSON valide. » et rien d'autre. Aucun
  extrait du corps reçu, aucune position de caractère, aucune trace.
- *Cas limite 2* : corps au-delà de la limite de 1 Mo — réponse **413** avec
  « Le corps de la requête dépasse la taille autorisée (1 Mo). »
- *Cas limite 3* : type de contenu inattendu sur une route qui attend du JSON —
  réponse **415** avec « Type de contenu non pris en charge : JSON attendu. »
- *Cas limite 4* : erreur applicative non prévue (par exemple une panne de base
  au milieu d'une transaction) — réponse **500** avec le seul texte
  « Erreur interne du serveur », comme aujourd'hui. Le détail part dans le
  journal serveur, jamais dans la réponse.
- **Invariant à poser en test** : sur un balayage des routes de l'API, aucune
  réponse de statut ≥ 400 ne contient, dans son corps, ni le mot `at ` suivi d'un
  chemin de fichier, ni la chaîne `node_modules`, ni une pile d'appel, ni un
  extrait de requête SQL.

**Fichiers.**

- `server/src/app.js:19` — intercaler un gestionnaire d'erreurs de corps juste
  après `express.json()`.
- `server/src/middleware/errors.js` — au besoin, un constructeur
  `payloadTooLarge` et `unsupportedMediaType`.
- `server/tests/robustesse.test.js` — tests nouveaux, dont l'invariant de
  balayage.

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- `POST /api/requests` avec le corps `{"siteName":` renvoie 400 et exactement le
  message ci-dessus, sans aucun fragment du corps envoyé.
- Un corps de 2 Mo renvoie 413 et le message français.
- Le balayage d'invariant passe sur l'ensemble des routes exercées par la suite.

---

### EVO-11 — Limiter le débit avant la validation du corps

**Catégorie** A. **Effort** 0,5 j. **Valeur** faible. **Couvre** R-12 (`D5`).

**Besoin.** La divergence `D5` est confirmée : un corps invalide n'alimente pas le
compteur de limitation. `server/src/routes/auth.js:29-33` monte les intergiciels
dans l'ordre `validate(loginSchema)` **puis** `loginLimiter`. Une tentative avec
un corps invalide est donc repoussée en 400 sans être comptée : un attaquant qui
alterne corps valides et invalides dilue sa consommation du quota, et surtout un
balayage d'adresses mal formées ne laisse aucune trace de débit.

**Comportement attendu.**

- *Cas nominal* : identifiants valides, mot de passe juste — succès, le compteur
  est remis à zéro (`rateLimit.js:50-52`, déjà en place).
- *Cas limite 1* : corps invalide (adresse non conforme, mot de passe absent) —
  **le compteur est incrémenté**, puis la validation refuse en 400. Le message de
  validation est inchangé.
- *Cas limite 2* : au-delà du quota, un corps invalide reçoit **429** avec
  l'en-tête `Retry-After`, et non 400 : la limitation prime.
- *Cas limite 3* : corps sans champ `email` — la clé de compte ne peut pas être
  calculée ; seule la clé d'adresse IP est employée. C'est déjà ce que fait
  `routes/auth.js:21-24` (`req.body?.email ? ... : null`) ; il faut simplement
  s'assurer que `req.body` est bien analysé à ce stade — `express.json()`
  s'exécute avant le routeur (`app.js:19`), donc c'est le cas.
- La documentation (`README.md`, section authentification) est corrigée si elle
  décrit l'ordre inverse.

**Fichiers.**

- `server/src/routes/auth.js:29-33` — échanger l'ordre des deux intergiciels.
- `server/tests/auth.test.js` — test de CAS-AUTH-17.
- `README.md` si nécessaire.

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- Envoyer `config.loginRateLimitMax + 1` requêtes de connexion avec un corps
  invalide depuis la même adresse : la dernière renvoie **429**, pas 400.
- Une connexion réussie remet le compteur à zéro comme aujourd'hui.
- Les tests d'authentification existants restent verts.

---

### EVO-12 — Diagnostic d'incident : conserver l'erreur d'origine

**Catégorie** A. **Effort** 1 j. **Valeur** faible. **Couvre** R-14 (`C-04`,
`C-09`).

**Besoin.** Deux corrections courtes, sans effet fonctionnel, qui feront gagner
du temps le jour d'un incident.

**État vérifié — `C-04`.** `server/src/db/pool.js:9-22` :

```js
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
}
```

Le `ROLLBACK` n'est pas protégé. Si la connexion est déjà morte — exactement la
situation d'un incident de base —, il lève à son tour et **remplace** l'erreur
d'origine. Le journal ne contient plus que « connection terminated », et la cause
réelle est perdue.

**État vérifié — `C-09`.** Les erreurs levées par le filtre de `multer`
(`routes/admin.js:25-28`) le sont dans une fonction de rappel ; celles que
`multer` produit lui-même (taille dépassée, champ inattendu) portent un code
propre (`LIMIT_FILE_SIZE`, `LIMIT_UNEXPECTED_FILE`) et aucun statut HTTP. Elles
tombent donc dans `errorHandler` avec `err.status` indéfini, et sortent en **500**
là où un 400 ou un 413 explicite est attendu.

**Comportement attendu.**

- `withTransaction` : le `ROLLBACK` est entouré d'un `try/catch`. Un échec du
  retour arrière est journalisé (`console.error('Retour arrière impossible :', …)`)
  et **l'erreur d'origine est relancée telle quelle**. Le client est relâché avec
  l'erreur (`client.release(err)`) pour que le lot de connexions ne le réutilise
  pas.
- *Cas limite* : `BEGIN` lui-même échoue — pas de `ROLLBACK` tenté, l'erreur est
  relancée, le client relâché avec l'erreur.
- Téléversement : un fichier de plus de 5 Mo renvoie **413** avec
  « Le fichier dépasse la taille autorisée (5 Mo). » ; un champ de formulaire
  inattendu renvoie **400** avec « Champ de fichier inattendu : le fichier doit
  être transmis sous le nom « fichier ». » ; une extension non acceptée conserve
  son message actuel (« Format non pris en charge : attendu .xlsx, .csv ou .json. »)
  et son statut 400.

**Fichiers.**

- `server/src/db/pool.js:9-22`.
- `server/src/routes/admin.js:22-29` et `:165-184` — un intergiciel de traduction
  des erreurs `multer` placé juste après `televersement.single('fichier')`.
- `server/tests/robustesse.test.js`.

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- Un test qui force l'échec du `ROLLBACK` observe la relance de l'erreur
  **métier** d'origine, et non celle du retour arrière.
- `POST /api/admin/mcc/import-fichier` avec un fichier de 6 Mo renvoie 413 et le
  message français.
- Le même appel avec le fichier envoyé sous un autre nom de champ renvoie 400 et
  le message français.
- Aucun de ces trois cas ne produit de 500.

---

### EVO-13 — Suite de tests automatisés de l'interface

**Catégorie** A. **Effort** 4 j. **Valeur** haute. **Couvre** R-05.

**Besoin.** `web/package.json` ne déclare **ni script `test`, ni dépendance de
test** : les 115 tests de la suite portent tous sur l'API. Toute régression
d'écran passe inaperçue jusqu'à la prochaine recette manuelle — et la campagne a
justement produit deux régressions d'interface (`DEF-A5-01`, `DEF-A5-02`) qu'un
tel filet aurait arrêtées. C'est le plus gros risque d'exploitation du produit.

**Comportement attendu.** Poser une suite de bout en bout avec **Playwright**
(`@playwright/test`), lancée par `npm test` depuis `web/`, contre une instance
d'API dédiée et une base amorcée. Cinq parcours, exactement ceux que R-05
désigne comme les plus coûteux à reprendre à la main :

1. **Connexion et changement imposé de mot de passe.** Connexion d'un compte dont
   le mot de passe vient d'être réinitialisé ; vérifier que l'écran de changement
   s'impose, que la navigation vers le tableau de bord est refusée tant que le
   changement n'est pas fait, et qu'après changement l'accès s'ouvre.
2. **Saisie en cinq étapes jusqu'à la soumission.** Parcourir les cinq étapes,
   vérifier qu'une proposition de MCC apparaît avec son score **et au moins un
   terme justificatif**, retenir un code par réseau, enregistrer le brouillon,
   recharger la page, retrouver la saisie, puis soumettre.
3. **Arbitrage sous ses trois issues.** Depuis un compte banquier : valider en
   substituant un code, rejeter sans commentaire (message d'erreur attendu, **une
   seule fois** — c'est `DEF-A2-03`), puis rejeter avec commentaire, puis demander
   un complément.
4. **Cloisonnement par URL forcée.** Connecté en tant qu'agent de la banque A,
   ouvrir `/demandes/<id d'une demande de la banque B>` : l'écran affiche le
   message de refus et **aucune donnée** de la demande. Vérifier de même qu'un
   agent ne peut pas atteindre `/administration`.
5. **Écran d'import en simulation.** Téléverser un fichier, vérifier le bandeau
   « aucune donnée modifiée », la case de désactivation **décochée par défaut**,
   la seconde confirmation, et qu'aucune écriture n'a eu lieu (contrôle par appel
   d'API en fin de scénario).

**Deux régressions connues à couvrir explicitement**, puisque R-02 signale
qu'elles n'ont été rejouées que par l'auteur du correctif :

- `DEF-A5-01` : sur une demande soumise, le formulaire est inerte (saisie forcée
  sans effet) **mais** « Précédent », « Suivant » et « Voir la demande » restent
  opérants, au clic comme au clavier.
- `DEF-A5-02` : coupure simulée sur `/api/auth/me` — le bandeau de panne apparaît ;
  la coupure levée, une simple navigation interne l'efface, **sans rechargement
  de page**.

**Contraintes.**

- Aucune assertion sur des textes décoratifs : viser les rôles ARIA, les
  étiquettes et les données.
- La suite doit tourner **sans réseau externe** : le navigateur est installé une
  fois, l'API et la base sont locales.
- Un test ne doit jamais dépendre de l'ordre d'exécution d'un autre : chaque
  parcours crée ses propres données depuis l'API avant de lancer le navigateur.
- Le mode strict de React double les appels d'API en développement ; les tests
  s'exécutent contre le **paquet construit** (`npm run build` puis
  `vite preview`), ce qui lève au passage la réserve du § 2.2 B du rapport de
  recette.

**Fichiers.**

- `web/package.json` — script `test`, dépendance `@playwright/test`.
- `web/playwright.config.js` — nouveau.
- `web/tests/` — cinq fichiers, un par parcours, plus `web/tests/fixtures.js`.
- `README.md` — section « Recette », mention de la commande.

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- `cd web && npm test` exécute les cinq parcours contre le paquet construit et
  rend un rapport.
- Chacun des cinq parcours échoue si l'on annule le correctif correspondant :
  vérification à faire une fois, à la main, pour les scénarios 1, 3 et 4.
- Les deux régressions `DEF-A5-01` et `DEF-A5-02` sont chacune couvertes par une
  assertion nommée.
- La suite s'exécute en moins de cinq minutes sur une machine de développement.

---

### EVO-14 — Retouches d'homogénéité de l'interface

**Catégorie** A. **Effort** 1 j. **Valeur** faible. **Couvre** R-16 (`D7`).

**Besoin.** Trois écarts mineurs que la recette a relevés et qui donnent, mis
bout à bout, une impression d'inachèvement.

**1. Le total du référentiel baisse en silence** (divergence `D7`).
`server/src/routes/mcc.js:20` renvoie `total: catalogueActif().length` — le
nombre de codes **actifs** — et `web/src/pages/CatalogPage.jsx:36` l'affiche
comme « `{total}` codes marchands issus du Visa Merchant Data Standards
Manual ». Après une désactivation, le nombre passe de 279 à 278 sans que rien ne
l'explique. L'écran d'administration, lui, fait déjà bien les choses
(`web/src/pages/AdminMccPage.jsx:145` : « `{actifs}` codes actifs sur
`{total}` »).

*Attendu* : `GET /api/mcc` renvoie `{ "total": <codes du référentiel>, "actifs": <codes actifs>, "count": …, "items": […] }`,
et la page Référentiel affiche « 278 codes actifs sur 279 ». Le libellé « codes
marchands issus du Visa Merchant Data Standards Manual » est conservé.

**2. Un message de validation qui ne nomme pas sa règle.** Réserve subsistante de
`DEF-A3-04` : un champ rend « Format invalide » là où une autre route sait dire
« Un MCC est composé de 4 chiffres » (`server/src/services/requestSchema.js:39`).

*Attendu* : parcourir `server/src/services/zodMessages.js` et les schémas, et
remplacer chaque message générique par un énoncé de la règle, en français. Aucun
message ne doit rester sous la forme « Format invalide » ou « Valeur invalide »
seule. Le test correspondant balaie les routes et échoue si un tel message
subsiste.

**3. La validation du champ « Banque » passe par la bulle native du navigateur.**
`web/src/pages/AdminUsersPage.jsx:141` pose l'attribut `required` directement sur
le `<select>`, alors que le composant `Champ` qui l'enveloppe (ligne 140) porte
déjà le marqueur `requis` du produit. Le message est donc rendu par le
navigateur : non traduit, non stylé, et invisible pour un lecteur d'écran qui
suit les bandeaux `role="alert"` du reste du produit.

*Attendu* : le champ « Banque » des écrans d'administration
(`web/src/pages/AdminUsersPage.jsx:140-147`) est validé comme les autres, avec le message
« La banque de rattachement est obligatoire. » rendu dans le composant `Champ`
(`web/src/components/ui.jsx`). L'attribut `required` natif est retiré ou le
formulaire passe en `noValidate`.

**Fichiers.** `server/src/routes/mcc.js`, `web/src/pages/CatalogPage.jsx`,
`web/src/pages/AdminUsersPage.jsx`, `server/src/services/zodMessages.js`,
`server/src/services/requestSchema.js`, `server/src/services/adminSchema.js`,
`server/tests/mcc.test.js`, `server/tests/robustesse.test.js`.

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- Désactiver un code puis ouvrir la page Référentiel : le compteur affiche
  « N codes actifs sur M » et M ne bouge pas.
- Un balayage des messages de validation des six routes principales ne trouve
  aucun « Format invalide » nu.
- Soumettre le formulaire de création de compte sans banque affiche le message
  dans le bandeau du champ, pas dans une bulle du navigateur.

---

### EVO-15 — Mettre le plan de tests à jour

**Catégorie** A. **Effort** 0,5 j. **Valeur** moyenne. **Couvre** R-15.

**Besoin.** Six attentes du plan de tests sont devenues inexactes ou caduques
(`rapport-recette.md` § 5.6). Sans correction, la campagne suivante rejouera les
mêmes faux écarts et perdra du temps à les instruire.

**Comportement attendu.** Corriger dans `docs/plan-de-tests.md` les six points
recensés, en conservant la trace de la correction (une note datée sous chaque cas
touché) :

| Cas | Correction à porter |
| --- | --- |
| `CAS-MCC-01` | Cinq propositions attendues, non six : la sixième (`5960` à 31 %) ne portait aucune justification et est désormais écartée par l'invariant de `mccSuggestion.js:143`. |
| `CAS-MCC-03` | Idem : les quatre codes à 31 % de l'appel sans secteur n'existent plus. |
| `JD-10` (§ 4.3) | Une seule proposition attendue : le repli `5999`, qui se déclare comme tel. |
| `CAS-INDEX-01` | Le terme attendu est « bornes de recharge » et non « bornes recharge » : la description n'a pas les deux mots contigus. |
| `CAS-INDEX-04` (1) et `CAS-INDEX-08` (3) | Attentes inexactes, et `CAS-INDEX-08` (3) contredit son propre point (4). Les réécrire d'après le comportement réel, vérifié par appel à `POST /api/mcc/suggest`. |
| `CAS-ERGO-08` | Cinq compteurs sur la liste des demandes, non six — le produit en expose cinq volontairement (`web/src/pages/DashboardPage.jsx:7-13`). |

Ajouter également au plan les cas correspondant aux évolutions livrées par ce
programme, au moins pour EVO-17, EVO-18, EVO-19 et EVO-20, faute de quoi la
prochaine campagne n'aura rien à jouer sur les fonctions nouvelles.

**Fichiers.** `docs/plan-de-tests.md` uniquement.

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- Chacune des six lignes ci-dessus est corrigée et porte une note datée.
- Les résultats attendus réécrits sont **vérifiés par exécution** contre
  l'instance, et la commande employée est consignée dans le plan.
- Le plan comporte au moins un cas par évolution nouvelle livrée.

---

### EVO-16 — Performance : double authentification, tri, pagination, import

**Catégorie** A. **Effort** 2 j. **Valeur** moyenne. **Couvre** R-09 (`C-07`,
`C-21`, `C-23`).

**Besoin.** Trois coûts identifiés par la revue de code, jamais mesurés, plus une
limite fonctionnelle que la revue n'avait pas relevée.

**1. L'authentification s'exécute deux fois par requête** (`C-07`, confirmé).
`server/src/app.js:68` monte `app.use(authenticate, requirePasswordChanged)`, et
chaque routeur la remonte : `server/src/routes/requests.js:23`,
`server/src/routes/mcc.js:11`, `server/src/routes/admin.js:34`. Chaque appel de
l'API fait donc **deux** allers-retours en base pour la même vérification,
laquelle joint `users` et `banks`.

*Attendu* : `authenticate` devient idempotente — si `req.user` est déjà
renseigné, elle passe la main sans requête. La solution est préférable au retrait
des appels dans les routeurs, car elle laisse chaque routeur autonome et
testable isolément. Comportement fonctionnel strictement inchangé.

**2. Le tri de la liste des demandes n'est pas indexé** (`C-23`, confirmé).
`server/src/services/requests.js:223` trie par `r.updated_at DESC` ; `schema.sql`
ne pose d'index que sur `(bank_id, status)` (ligne 121) et `created_by`
(ligne 122).

*Attendu* : `CREATE INDEX IF NOT EXISTS idx_requests_bank_updated ON affiliation_requests (bank_id, updated_at DESC);`
Le tri est complété par `r.id DESC` pour être stable, et l'index couvre les deux
colonnes de tête.

**3. La liste des demandes n'est pas paginable à l'écran.**
`server/src/routes/requests.js:33-34` accepte bien `limit` et `offset`, mais
`web/src/pages/DashboardPage.jsx:31-32` appelle `api.listRequests({ status, search })`
sans aucun des deux : l'écran affiche donc les **50 premières** demandes et les
suivantes sont inatteignables. Pour une banque qui tourne, c'est un manque
fonctionnel, pas seulement un coût.

*Attendu* : la réponse de `GET /api/requests` porte désormais
`{ "count": <renvoyées>, "total": <total filtré>, "items": […] }`, et le tableau
de bord reçoit une pagination « Précédent / Suivant » avec l'indication
« demandes 51 à 100 sur 213 ». La taille de page est de 50, l'`offset` est repris
dans l'URL (`?page=2`) pour qu'un rechargement ne perde pas la position.
*Cas limite* : un `offset` au-delà du total renvoie une liste vide et un `total`
correct, sans erreur.

**4. L'import est quadratique** (`C-21`, confirmé).
`server/src/services/mccAdmin.js:316` et `:340` font `entrees.find(...)` à
l'intérieur des boucles sur `ajoutes` et `modifies` : sur un fichier de plusieurs
centaines de lignes, le coût croît au carré.

*Attendu* : construire une `Map` du fichier par code, une fois, avant les
boucles. Comportement inchangé, y compris le rapport d'écart.

**Ce qui n'est pas dans cette fiche.** La **campagne de mesure** demandée par
R-09 — établir un palier représentatif et mesurer — n'est pas un travail de code
et relève de la recette (catégorie C-11). Ces quatre corrections se justifient
par la lecture du code, pas par une mesure, et il faut le dire ainsi.

**Fichiers.** `server/src/middleware/auth.js`, `server/src/db/schema.sql`,
`server/src/services/requests.js`, `server/src/routes/requests.js`,
`server/src/services/mccAdmin.js`, `web/src/pages/DashboardPage.jsx`,
`web/src/api/client.js`, `server/tests/requests.test.js`.

**Schéma de base.** Un index supplémentaire, idempotent.

**Critères d'acceptation.**

- Un compteur de requêtes SQL posé autour d'un appel à `GET /api/requests`
  observe **une seule** exécution de la requête d'authentification.
- `EXPLAIN` sur la requête de liste montre l'emploi de
  `idx_requests_bank_updated` et non un tri complet.
- Avec 120 demandes, le tableau de bord permet d'atteindre la 120ᵉ ; `?page=3`
  rechargé directement affiche la bonne page.
- Les 115 tests existants restent verts, et le rapport d'écart d'un import est
  identique avant et après l'optimisation, sur le référentiel des 279 codes.

---

### EVO-17 — Contrôle automatique du site marchand

**Catégorie** A. **Effort** 3 j. **Valeur** haute. **Couvre** : aucune
recommandation de recette — fonction nouvelle issue de la veille (§ 1.3, écart 3).

**Besoin.** Vérifier automatiquement que le site déclaré est joignable et qu'il
affiche les mentions que **le contrat STB impose déjà** au commerçant tunisien
(article 2 des conditions générales, renvoyant à l'article 25 de la loi
n° 2000-83), afin que l'agent n'ait plus à ouvrir le site dans un onglet et à
juger à l'œil.

**Ce que ce contrôle n'est pas.** Ce n'est ni un jugement, ni un blocage. Il
**n'empêche jamais** de soumettre ni de valider une demande : il produit un
constat daté, motivé, que l'agent et le banquier lisent. Un site peut afficher
ses mentions autrement que par les mots que nous cherchons ; c'est pourquoi le
résultat est toujours restitué comme un indice, jamais comme une conclusion.

**Comportement attendu — cas nominal.**

- À l'étape « Site et société », un bouton **« Contrôler le site »** déclenche
  `POST /api/requests/:id/controle-site` (ou, pour une demande non encore créée,
  `POST /api/site/controle` avec l'URL en corps).
- Le serveur récupère la page d'accueil du site en HTTPS, suit au plus **trois**
  redirections, avec un délai maximal de **8 secondes** et une taille maximale de
  **2 Mo**.
- Il en extrait le texte brut (balises retirées) et recherche, sans tenir compte
  des accents ni de la casse, les **six familles de mentions** suivantes. Chaque
  famille porte une liste de termes déclencheurs, stockée en base pour être
  modifiable sans livraison :

| Famille | Termes déclencheurs (valeurs initiales, en français et en anglais) |
| --- | --- |
| Coordonnées de contact | `contact`, `nous contacter`, `adresse`, `telephone`, plus la détection d'au moins une adresse électronique ou d'un numéro de téléphone dans le texte |
| Prix affichés | `prix`, `tarif`, `dt`, `tnd`, `dinar`, plus la détection d'un motif de montant |
| Politique de remboursement et d'annulation | `remboursement`, `retour`, `annulation`, `retractation`, `refund` |
| Politique de confidentialité | `confidentialite`, `donnees personnelles`, `vie privee`, `privacy` |
| Conditions générales de vente | `conditions generales`, `cgv`, `cgu`, `terms` |
| Délai de livraison | `livraison`, `delai de livraison`, `expedition`, `shipping` |

- Le résultat est enregistré et affiché comme une liste de six lignes, chacune
  portant **« trouvé » ou « non trouvé »** et, si trouvé, **le terme exact qui a
  déclenché la détection et son contexte** (60 caractères avant et après). C'est
  le même principe d'explicabilité que le moteur de MCC : jamais un verdict sans
  sa justification.
- Un bandeau de synthèse indique : « Contrôle du 22/09/2026 à 14 h 05 — 4 des
  6 mentions attendues ont été trouvées. Ce contrôle est indicatif : vérifiez le
  site avant de conclure. »

**Cas limites et messages d'erreur, en français.**

| Situation | Statut enregistré | Message affiché |
| --- | --- | --- |
| Site joignable, page lue | `CONTROLE` | la synthèse ci-dessus |
| Délai dépassé | `INJOIGNABLE` | « Le site n'a pas répondu en moins de 8 secondes. Le contrôle n'a pas pu être effectué. » |
| Nom de domaine introuvable | `INJOIGNABLE` | « Le nom de domaine `<domaine>` est introuvable. Vérifiez l'adresse saisie. » |
| Certificat invalide ou expiré | `INJOIGNABLE` | « Le certificat du site n'est pas valide. Le contrôle n'a pas pu être effectué. » |
| Réponse 4xx ou 5xx | `INJOIGNABLE` | « Le site a répondu par une erreur `<code>`. Le contrôle n'a pas pu être effectué. » |
| Page de plus de 2 Mo | `CONTROLE` sur les 2 premiers Mo | « La page dépasse 2 Mo : seul son début a été analysé. » |
| Contenu non textuel (PDF, image) | `ININTERPRETABLE` | « La page d'accueil n'est pas une page HTML : le contrôle ne s'applique pas. » |
| Plus de trois redirections | `INJOIGNABLE` | « Le site enchaîne trop de redirections. Le contrôle n'a pas pu être effectué. » |
| Fonction désactivée par configuration | — | « Le contrôle automatique des sites n'est pas activé sur cette installation. » |

**Sécurité — non négociable.** Le serveur va, pour la première fois, émettre une
requête sortante vers une adresse fournie par un utilisateur. Trois gardes sont
obligatoires :

1. **Refus des adresses internes.** Après résolution du nom, si l'adresse IP
   appartient à une plage privée, de bouclage, de lien-local ou réservée
   (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`,
   `fc00::/7`), la requête est refusée avant émission. Le contrôle est **refait
   après chaque redirection**, faute de quoi une redirection vers une adresse
   interne contourne la garde.
2. **Protocoles restreints** à `http` et `https`. Tout autre schéma est refusé.
3. **Aucun rendu du contenu récupéré.** Le HTML n'est jamais réinjecté dans
   l'interface : seuls les extraits de contexte sont renvoyés, échappés.

La fonction est **désactivée par défaut** et s'active par la variable
`SITE_CHECK_ENABLED=true` dans `server/.env`. Une installation dont le réseau
n'autorise pas les appels sortants n'est donc pas gênée, et l'écran le dit
clairement plutôt que d'échouer.

**Fichiers.**

- `server/src/services/controleSite.js` — nouveau : récupération, gardes,
  extraction, recherche des familles.
- `server/src/routes/requests.js` — route nouvelle.
- `server/src/services/requests.js` — écriture et relecture du résultat.
- `server/src/config.js` — `SITE_CHECK_ENABLED`, `SITE_CHECK_TIMEOUT_MS` (défaut
  8000), `SITE_CHECK_MAX_BYTES` (défaut 2 097 152).
- `server/src/db/schema.sql` — table nouvelle (ci-dessous).
- `web/src/pages/RequestFormPage.jsx` — bouton et restitution à l'étape 0.
- `web/src/pages/RequestDetailPage.jsx` — restitution pour le banquier.
- `server/tests/controleSite.test.js` — nouveau.
- `README.md` — documenter la variable de configuration.

**Schéma de base.**

```sql
CREATE TABLE IF NOT EXISTS site_checks (
  id          SERIAL      PRIMARY KEY,
  request_id  INTEGER     NOT NULL REFERENCES affiliation_requests(id) ON DELETE CASCADE,
  user_id     INTEGER     REFERENCES users(id),
  url         VARCHAR(255) NOT NULL,
  statut      VARCHAR(20) NOT NULL
               CHECK (statut IN ('CONTROLE', 'INJOIGNABLE', 'ININTERPRETABLE')),
  http_status SMALLINT,
  resultats   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_site_checks_request ON site_checks(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_check_rules (
  famille   VARCHAR(40) PRIMARY KEY,
  libelle   VARCHAR(120) NOT NULL,
  termes    TEXT[]      NOT NULL DEFAULT '{}',
  position  SMALLINT    NOT NULL DEFAULT 0,
  active    BOOLEAN     NOT NULL DEFAULT TRUE
);
```

Les contrôles sont **cumulatifs** : un nouveau contrôle n'écrase pas le
précédent. La fiche de la demande affiche le dernier et donne accès aux
antérieurs. Chaque contrôle écrit aussi un `request_events` de type
`CONTROLE_SITE`, pour que la piste d'audit du dossier en porte la trace.

**Règles de validation.** L'URL contrôlée est celle enregistrée sur la demande,
déjà validée par `requestSchema.js:48-53`. Pour l'appel hors demande, la même
règle s'applique. Une adresse en `http://` est acceptée mais le résultat porte la
mention « Le site n'est pas servi en HTTPS. », qui figure comme septième ligne de
constat.

**Critères d'acceptation.**

- Contre un serveur de test local servant une page contenant les six familles :
  six lignes « trouvé », chacune avec son terme et son contexte.
- Contre une page n'en contenant aucune : six lignes « non trouvé », statut
  `CONTROLE`, et la demande reste soumissible.
- Une URL pointant vers `127.0.0.1`, vers `169.254.169.254` ou vers une plage
  privée est **refusée avant toute émission de requête**, avec un message
  explicite, et aucun socket n'est ouvert.
- Une redirection depuis un domaine public vers `127.0.0.1` est également
  refusée.
- Un serveur qui ne répond pas produit `INJOIGNABLE` en un peu plus de
  8 secondes, jamais davantage.
- `SITE_CHECK_ENABLED` absent ou faux : la route renvoie 200 avec le message
  d'indisponibilité, et le bouton est désactivé à l'écran avec une infobulle.
- Aucun contenu HTML récupéré n'est rendu tel quel : un site contenant
  `<script>alert(1)</script>` dans une de ses mentions n'exécute rien dans notre
  interface.

---

### EVO-18 — Profil de risque du marchand sur données déjà collectées

**Catégorie** A pour le mécanisme. **Effort** 2 j. **Valeur** haute.
**Décision requise** sur les valeurs de seuils — voir B-8.

**Besoin.** Six informations sont saisies à chaque dossier et **aucune règle ne
les lit** : `sellsAbroad`, `averageBasket`, `monthlyVolume`, `deliveryMode`,
`isMarketplace`, `hasSubscription`. Ce sont exactement les éléments que la Banque
de Tunisie demande à l'affiliation. Le banquier arbitre aujourd'hui un code MCC
sans qu'aucune synthèse ne lui soit présentée sur le marchand lui-même.

**Ce que ce profil n'est pas.** Ce n'est **pas un score**, et surtout pas un score
opaque. C'est une **liste de constats**, chacun nommé, chacun motivé par la
valeur qui l'a déclenché, agrégée en un niveau de vigilance à trois paliers.
Aucun constat ne bloque quoi que ce soit ; le banquier décide.

**Comportement attendu — cas nominal.**

À la soumission, puis à chaque consultation de la demande, la plateforme calcule
un profil et le restitue à l'agent comme au banquier :

```
Vigilance : ATTENTION (2 constats sur 7)
  • Vente à l'international déclarée
    → obligation de rapatriement des devises (Code des changes) ; le dossier
      relève du régime des exportations de services.
  • Volume mensuel estimé de 45 000 TND, au-delà du seuil de 30 000 TND
  • Panier moyen de 120 TND — dans la plage habituelle
  • Livraison de biens physiques — dans la plage habituelle
  • Pas de place de marché déclarée
  • Pas de vente par abonnement
  • Code MCC retenu 5977 — vigilance STANDARD
```

Chaque ligne porte : le constat, la **valeur qui l'a produite**, et le **seuil**
auquel elle a été comparée s'il y en a un. Une ligne sans valeur saisie dit
« non renseigné » et ne contribue pas au niveau.

**Les sept constats.**

| Constat | Déclencheur | Contribution |
| --- | --- | --- |
| Vente à l'international | `sellsAbroad` vrai | +1 |
| Volume mensuel élevé | `monthlyVolume` > seuil haut | +2 |
| Volume mensuel notable | `monthlyVolume` > seuil moyen | +1 |
| Panier moyen élevé | `averageBasket` > seuil | +1 |
| Place de marché | `isMarketplace` vrai | +1 |
| Vente par abonnement | `hasSubscription` vrai | +1 |
| MCC de vigilance sensible | `riskLevel` du code retenu = `SENSIBLE` | +2 |

Niveaux : **0 → STANDARD**, **1 à 2 → ATTENTION**, **3 et plus → VIGILANCE
RENFORCÉE**. Le niveau est affiché à côté du statut, sur la fiche de la demande
et dans la liste du tableau de bord (une pastille, comme les statuts existants).

**Les seuils ne sont pas inventés ici.** Les trois seuils — volume moyen, volume
haut, panier moyen — et les sept contributions sont stockés en base et
administrables par le profil `ADMIN`, avec historique. Les valeurs initiales sont
des **propositions à faire confirmer par le commanditaire avant mise en
service** ; tant qu'elles ne le sont pas, l'écran affiche la mention « Seuils
provisoires, non validés par la banque. » C'est la seule façon honnête de livrer
la mécanique sans préempter une règle métier.

**Cas limites.**

- *Aucune donnée de volume renseignée* : le profil se calcule sur les seules
  données booléennes, et le bandeau indique « 3 des 7 constats n'ont pas pu être
  évalués, faute de données. »
- *Devise autre que TND* : les seuils sont exprimés en TND. Si `currency` diffère,
  les constats de montant sont marqués « non évaluable : montant exprimé en
  `<devise>` » et ne contribuent pas. **Aucune conversion n'est faite** : nous
  n'avons pas de taux de change, et en inventer un serait pire que de s'abstenir.
- *Demande non encore soumise* : le profil est calculé et affiché à l'agent dès
  l'étape « Activité », ce qui lui permet de compléter les champs manquants
  avant de soumettre.
- *Changement de seuil par l'administrateur* : les profils sont **recalculés à la
  lecture**, jamais figés en base. Une demande validée hier affichera donc le
  profil selon les seuils d'aujourd'hui ; pour que la piste d'audit reste juste,
  le profil **tel qu'il était à la soumission** est figé dans
  `request_events` (type `PROFIL_RISQUE`) avec les seuils employés.

**Fichiers.**

- `server/src/services/profilRisque.js` — nouveau.
- `server/src/services/requests.js` — appel à la soumission et à la lecture.
- `server/src/routes/admin.js` et `server/src/services/admin.js` — lecture et
  modification des seuils.
- `server/src/db/schema.sql` — table de paramètres (ci-dessous).
- `web/src/pages/RequestDetailPage.jsx`, `web/src/pages/RequestFormPage.jsx`,
  `web/src/pages/DashboardPage.jsx` — restitution.
- `web/src/pages/AdminLayout.jsx` et un écran nouveau
  `web/src/pages/AdminSeuilsPage.jsx` — administration des seuils.
- `server/tests/profilRisque.test.js` — nouveau.

**Schéma de base.**

```sql
CREATE TABLE IF NOT EXISTS risk_settings (
  cle        VARCHAR(40)  PRIMARY KEY,
  valeur     NUMERIC(14,3) NOT NULL,
  libelle    VARCHAR(160) NOT NULL,
  valide     BOOLEAN      NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by INTEGER      REFERENCES users(id)
);
```

`valide` porte la confirmation du commanditaire : tant qu'elle est fausse pour au
moins un seuil, l'écran affiche la mention provisoire. Les modifications sont
journalisées dans `admin_events`, entité `RISK_SETTING`, avec avant et après —
même exigence qu'EVO-05.

**Critères d'acceptation.**

- Un dossier avec `sellsAbroad` vrai, `monthlyVolume` au-dessus du seuil haut et
  un MCC `SENSIBLE` ressort en **VIGILANCE RENFORCÉE** avec trois lignes
  motivées, chacune citant sa valeur et son seuil.
- Un dossier sans aucun des déclencheurs ressort en **STANDARD** avec sept lignes
  « dans la plage habituelle » ou « non déclaré ».
- Un dossier en devise étrangère ne fait contribuer aucun constat de montant et
  le dit.
- Modifier un seuil depuis l'écran d'administration change le profil affiché sur
  les demandes **non encore soumises**, et laisse intact le profil figé dans
  `request_events` des demandes déjà soumises.
- Le profil n'empêche **aucune** transition de statut : une VIGILANCE RENFORCÉE
  se soumet et se valide comme les autres.

---

### EVO-19 — Signaler les contradictions entre déclaration et descriptif

**Catégorie** A. **Effort** 1 j. **Valeur** haute. **Couvre** la question de
produit versée au dossier par le rapport de recette (amendement du 2026-09-22 (2)).

**Besoin.** Lorsque l'agent décoche « place de marché » alors que son descriptif
en décrit une, la plateforme arbitre en silence : la pénalité de −25 s'applique
au score brut du code `5262` (`server/src/services/mccSuggestion.js:131`) sans que
rien ne soit dit à l'écran. Le rapport de recette a établi que ce comportement est
**le bon** — une case ne doit pas effacer un descriptif explicite — mais qu'il
est **muet**, ce qui contredit la promesse d'explicabilité qui fait notre
différence sur le marché.

**Comportement attendu — cas nominal.**

À l'étape « Activité », et à nouveau sur la fiche de la demande vue par le
banquier, la plateforme affiche un **avertissement non bloquant** lorsqu'une
déclaration contredit le texte saisi :

> **Votre déclaration et votre descriptif divergent.**
> Vous avez décoché « Place de marché (vendeurs tiers) », mais votre descriptif
> emploie les termes « place de marché », « vendeurs tiers ». Nous en avons tenu
> compte : la case a retiré 25 points au code 5262, sans effacer le descriptif.
> Vérifiez la case, ou précisez le descriptif.

Le message nomme **les termes exacts** qui ont déclenché la détection : sans eux,
l'avertissement serait aussi opaque que le silence qu'il remplace.

**Les quatre contradictions détectées.**

| Déclaration | Contredite par | Termes déclencheurs (valeurs initiales) |
| --- | --- | --- |
| « Place de marché » décochée | descriptif ou types de produits | `place de marche`, `marketplace`, `vendeurs tiers`, `vendeurs partenaires`, `multi-vendeurs`, `commissions sur ventes` |
| « Vente par abonnement » décochée | descriptif ou types de produits | `abonnement`, `abonnements`, `souscription mensuelle`, `prelevement recurrent`, `renouvellement automatique` |
| « Vente à l'international » décochée | descriptif, types de produits ou langues du site | `international`, `export`, `a l'etranger`, `worldwide`, `livraison europe`, plus la présence d'une langue autre que le français ou l'arabe dans `siteLanguages` |
| Mode de livraison `PHYSIQUE` | descriptif décrivant un bien numérique | `telechargement`, `telechargeable`, `licence logicielle`, `acces en ligne`, `contenu numerique`, `streaming` |

La recherche se fait sans accent ni casse, sur la concaténation des champs
indiqués, en réutilisant la normalisation déjà en place
(`server/src/services/mccCatalog.js`, `normalize`) et la segmentation de
`server/src/services/motsCles.js` : **aucun mécanisme de recherche nouveau n'est
introduit**.

**Cas limites.**

- *La case est cochée et le descriptif la confirme* : aucun avertissement. On ne
  signale que la **contradiction**, pas la concordance.
- *La case est cochée et le descriptif ne dit rien* : aucun avertissement. Le
  silence du descriptif ne contredit rien.
- *Plusieurs contradictions simultanées* : elles sont listées, une par ligne,
  dans un seul bandeau.
- *Le terme apparaît dans une négation* (« nous ne sommes pas une place de
  marché ») : le cas n'est **pas** traité et ne doit pas l'être. Détecter la
  négation demanderait une analyse que nous ne savons pas rendre explicable ; le
  message est d'ailleurs formulé comme une invitation à vérifier, pas comme un
  reproche. Ce choix est à consigner dans le plan de tests.
- *L'agent soumet malgré l'avertissement* : la soumission aboutit. Le bandeau est
  informatif, jamais bloquant.

**Trace.** Les contradictions détectées à la soumission sont consignées dans
`request_events`, type `CONTRADICTION_DECLARATIVE`, avec la liste des
déclarations concernées et des termes déclencheurs. Le banquier voit donc, dans
la chronologie du dossier, que l'agent a été averti et a soumis quand même.

**Fichiers.**

- `server/src/services/coherence.js` — nouveau, exporte `detecterContradictions(profil)`.
- `server/src/routes/mcc.js` — la réponse de `POST /api/mcc/suggest` porte un
  champ `contradictions` en plus des deux listes de propositions.
- `server/src/services/requests.js` — consignation à la soumission.
- `web/src/pages/RequestFormPage.jsx` — bandeau à l'étape 2 et à l'étape 3.
- `web/src/pages/RequestDetailPage.jsx` — restitution pour le banquier.
- `server/src/db/schema.sql` — table des termes déclencheurs, sur le modèle de
  `site_check_rules` (EVO-17), pour que la liste soit modifiable sans livraison.
- `server/tests/mcc.test.js` — tests nouveaux.

**Schéma de base.**

```sql
CREATE TABLE IF NOT EXISTS coherence_rules (
  cle          VARCHAR(40)  PRIMARY KEY,
  libelle      VARCHAR(160) NOT NULL,
  champs       TEXT[]       NOT NULL DEFAULT '{}',
  termes       TEXT[]       NOT NULL DEFAULT '{}',
  active       BOOLEAN      NOT NULL DEFAULT TRUE,
  position     SMALLINT     NOT NULL DEFAULT 0
);
```

**Critères d'acceptation.**

- Le jeu de données `JD-06` du plan (« Place de marché generaliste regroupant des
  vendeurs tiers tunisiens… ») avec `isMarketplace: false` produit **une**
  contradiction, citant au moins les termes « place de marche » et « vendeurs
  tiers », et le classement des MCC est **inchangé** par rapport à aujourd'hui.
- Le même jeu avec `isMarketplace: true` ne produit aucune contradiction.
- Un descriptif neutre avec `isMarketplace: false` ne produit aucune
  contradiction.
- La soumission d'une demande portant une contradiction aboutit, et la
  chronologie du dossier porte l'événement `CONTRADICTION_DECLARATIVE`.
- Le bandeau affiche les termes déclencheurs, jamais un message générique.

---

### EVO-20 — Détection des doublons

**Catégorie** A. **Effort** 1 j. **Valeur** haute. **Couvre** : aucune
recommandation de recette — écart mineur relevé par la veille.

**Besoin.** Aucune contrainte d'unicité n'existe sur le RNE ni sur l'adresse du
site (`server/src/db/schema.sql:51-119` : seule `reference` est unique, ligne 53).
Un même commerçant peut donc être saisi deux fois, par deux agents de la même
banque, sans que rien ne le signale. C'est le cas le plus fréquent en agence, et
le moins coûteux à traiter.

**Décision de conception importante.** La détection est **strictement limitée à
la banque de l'utilisateur**. Signaler à un agent de la banque A qu'un RNE existe
déjà chez la banque B révélerait une relation commerciale d'un concurrent : ce
serait une brèche dans le cloisonnement, qui est l'un de nos différenciateurs.
Une détection inter-banques est envisageable mais relève d'une décision
(voir B-2, même famille de sujet) ; elle n'est pas faite ici.

**Comportement attendu — cas nominal.**

- À l'enregistrement d'un brouillon et à la soumission, la plateforme recherche,
  **dans la même banque**, les demandes portant le même RNE (comparaison sur la
  valeur en majuscules, tirets retirés) ou la même adresse de site (comparaison
  sur le domaine, protocole, `www.` et barre oblique finale retirés).
- Si une ou plusieurs demandes correspondent, un bandeau **non bloquant**
  s'affiche :

> **Un dossier existe peut-être déjà pour ce commerçant.**
> RNE identique : `AFF-2026-00031` — « Bio Cosmétiques SARL », statut VALIDÉE,
> saisie le 12/03/2026 par Salma Ben Ali.
> Adresse de site identique : `AFF-2026-00087` — « Bio Cosmétiques », statut
> BROUILLON, saisie le 02/09/2026 par Karim Trabelsi.

- Chaque ligne est **cliquable** si l'utilisateur a le droit de voir la demande.
  Un agent ne voit que les demandes de sa banque : la règle d'accès existante
  (`server/src/services/requests.js:190`) s'applique sans modification.
- La demande en cours de saisie est exclue de sa propre recherche.

**Cas limites.**

- *Aucun doublon* : aucun bandeau. On n'affiche rien pour dire qu'il n'y a rien.
- *Le doublon est une demande REJETÉE* : il est signalé, avec son statut. Une
  nouvelle demande après rejet est légitime ; l'agent doit simplement le savoir.
- *Plus de cinq doublons* : les cinq plus récents sont affichés, suivis de
  « et `<n>` autre(s) ».
- *RNE saisi avec des tirets ou des espaces différents* : la normalisation les
  rapproche. `1234567-A` et `1234567A` sont considérés identiques.
- *Adresses de site qui ne diffèrent que par le protocole ou le `www.`* :
  considérées identiques. `https://www.boutique.tn/` et `http://boutique.tn`
  sont un doublon.
- *Chemin différent sur le même domaine* : `boutique.tn/fr` et `boutique.tn/ar`
  sont considérés **identiques** — c'est le même site.
- *Domaine différent, même société* : non détecté. C'est assumé.

**Pourquoi pas une contrainte d'unicité en base.** Parce qu'une seconde
affiliation légitime existe : changement de site, reprise après rejet, second
point de vente en ligne. Bloquer serait faux ; avertir est juste. En revanche, un
**index** est posé pour que la recherche soit immédiate.

**Fichiers.**

- `server/src/db/schema.sql` — deux colonnes normalisées et leurs index.
- `server/src/services/requests.js` — calcul des valeurs normalisées à l'écriture,
  fonction `chercherDoublons`.
- `server/src/routes/requests.js` — route `GET /api/requests/:id/doublons`, et
  le champ `doublons` dans la réponse de création et de mise à jour.
- `web/src/pages/RequestFormPage.jsx` — bandeau.
- `web/src/pages/RequestDetailPage.jsx` — bandeau pour le banquier.
- `server/tests/requests.test.js` — tests nouveaux.

**Schéma de base.**

```sql
ALTER TABLE affiliation_requests ADD COLUMN IF NOT EXISTS rne_normalise    VARCHAR(32);
ALTER TABLE affiliation_requests ADD COLUMN IF NOT EXISTS site_domaine     VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_requests_rne_norm ON affiliation_requests (bank_id, rne_normalise);
CREATE INDEX IF NOT EXISTS idx_requests_domaine  ON affiliation_requests (bank_id, site_domaine);
```

Les deux colonnes sont calculées par le service à chaque écriture, jamais saisies.
Les demandes existantes sont renseignées par une passe unique dans
`server/src/db/migrate.js`, idempotente (`WHERE rne_normalise IS NULL`).

**Règles de validation.** Aucune saisie nouvelle. La normalisation du RNE :
majuscules, suppression des espaces, tirets et points. La normalisation du site :
minuscules, protocole retiré, `www.` retiré, chemin et paramètres retirés, port
retiré, barre oblique finale retirée.

**Critères d'acceptation.**

- Deux demandes de la même banque portant `1234567-A` et `1234567a` se signalent
  mutuellement.
- Deux demandes de **banques différentes** portant le même RNE **ne se signalent
  pas**, et aucun appel d'API ne permet à l'une d'apprendre l'existence de
  l'autre.
- `https://www.boutique.tn/fr` et `http://boutique.tn` se signalent.
- `boutique.tn` et `boutique-en-ligne.tn` ne se signalent pas.
- Le bandeau n'empêche ni l'enregistrement, ni la soumission, ni la validation.
- Après la migration, les demandes créées avant l'évolution participent à la
  détection.

---

### EVO-21 — Rubriques techniques du contrat STB

**Catégorie** A. **Effort** 1 j. **Valeur** moyenne. **Couvre** : aucune
recommandation de recette — issue de la source primaire tunisienne (veille § 2.8).

**Besoin.** Le contrat STB que nous dématérialisons comporte un bloc
« Information Site WEB » que notre formulaire ne couvre pas : URL de notification,
URL de retour « OK », URL de retour « problème », et deux cases **3-D Secure
obligatoire** — l'une pour la carte nationale, l'autre pour la carte
internationale. L'agent qui remplit notre écran doit aujourd'hui reporter ces
rubriques à la main sur le papier, ce qui est précisément ce que la plateforme
est censée éviter.

**Ce que cette fiche ne fait pas.** Elle ajoute des **rubriques du dossier**, pas
une phase de vie du contrat. Aucun numéro d'affiliation monétique, aucun numéro
de terminal, aucun taux de commission, aucune phase de tests SMT : ce sont des
sujets de la question B-3.

**Comportement attendu.**

- Un bloc « Paramétrage technique » est ajouté à l'**étape 1 (« Site et
  société »)** du formulaire. Les cinq étapes restent au nombre de cinq : on
  n'introduit pas de sixième étape, qui invaliderait les cas de recette du
  parcours.
- Cinq champs : `notificationUrl`, `returnUrlOk`, `returnUrlKo` (trois adresses,
  **facultatives**), `threeDsNational` et `threeDsInternational` (deux cases,
  décochées par défaut).
- Les trois adresses suivent la même règle de validation que `siteUrl`
  (`server/src/services/requestSchema.js:48-53`), avec le message
  « L'adresse de notification doit être une URL valide (https://...) »,
  « L'adresse de retour en cas de succès doit être une URL valide (https://...) »,
  « L'adresse de retour en cas d'échec doit être une URL valide (https://...) ».
- Un texte d'aide sous le bloc : « Ces rubriques figurent au contrat
  d'affiliation. Elles peuvent être complétées après la saisie initiale, avant la
  soumission. »

**Cas limites.**

- *Champs laissés vides* : la soumission aboutit. Ces rubriques sont souvent
  renseignées après échange avec le webmaster du commerçant ; les rendre
  obligatoires bloquerait des dossiers légitimes.
- *Adresse en `http://`* : acceptée, avec la mention d'aide « Le contrat
  recommande une adresse en HTTPS. » Nous ne refusons pas ce que le contrat ne
  refuse pas.
- *Adresse identique pour le retour OK et le retour problème* : acceptée, sans
  avertissement. C'est un montage courant.
- *Demandes existantes* : les cinq colonnes sont nullables et les deux cases
  valent `FALSE` par défaut ; aucune reprise de données n'est nécessaire.
- Les cinq rubriques apparaissent dans le récapitulatif (étape 5), sur la fiche
  de la demande et dans l'export (EVO-22).

**Fichiers.**

- `server/src/db/schema.sql` — cinq colonnes.
- `server/src/services/requests.js` — table `FIELDS` (lignes 7-43).
- `server/src/services/requestSchema.js` — cinq règles.
- `web/src/pages/RequestFormPage.jsx` — bloc à l'étape 0, et `FORMULAIRE_VIDE`
  (lignes 19-29).
- `web/src/pages/RequestDetailPage.jsx` et `web/src/components/ui.jsx` (table des
  libellés, lignes 57-58) — restitution.
- `server/tests/requests.test.js`.

**Schéma de base.**

```sql
ALTER TABLE affiliation_requests ADD COLUMN IF NOT EXISTS notification_url       VARCHAR(255);
ALTER TABLE affiliation_requests ADD COLUMN IF NOT EXISTS return_url_ok          VARCHAR(255);
ALTER TABLE affiliation_requests ADD COLUMN IF NOT EXISTS return_url_ko          VARCHAR(255);
ALTER TABLE affiliation_requests ADD COLUMN IF NOT EXISTS three_ds_national      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE affiliation_requests ADD COLUMN IF NOT EXISTS three_ds_international BOOLEAN NOT NULL DEFAULT FALSE;
```

**Critères d'acceptation.**

- Les cinq rubriques se saisissent, s'enregistrent en brouillon, se retrouvent
  après rechargement, et figurent au récapitulatif.
- Une adresse de notification malformée produit le message français attendu,
  associé au bon champ.
- Une demande sans aucune de ces rubriques se soumet et se valide comme
  aujourd'hui.
- Les cinq rubriques apparaissent sur la fiche vue par le banquier.
- Les 115 tests existants restent verts, et le parcours en cinq étapes est
  inchangé.

---

### EVO-22 — Export imprimable du dossier

**Catégorie** A. **Effort** 1 j. **Valeur** moyenne. **Dépend de** EVO-21.
**Couvre** : `rapport-recette.md` § 2.2 A, « export PDF non implémenté ».

**Besoin.** Le contrat STB se signe sur papier, avec cachet. L'agent doit
aujourd'hui recopier le dossier de l'écran vers le formulaire papier. Une pièce
imprimable, fidèle au dossier saisi, supprime cette recopie et constitue la pièce
que le contrôle interne demandera.

**Choix technique.** **Pas de bibliothèque PDF côté serveur.** Une vue HTML
dédiée, avec une feuille de style d'impression, que l'utilisateur imprime ou
enregistre en PDF depuis son navigateur. Ce choix évite une dépendance lourde,
une charge serveur et un risque de divergence entre l'écran et le document ; il
est aussi celui qui rend le document le plus facile à corriger. Si le
commanditaire exige un PDF produit par le serveur, c'est une évolution
ultérieure, pas celle-ci.

**Comportement attendu.**

- Un bouton « Imprimer le dossier » sur la fiche de la demande
  (`web/src/pages/RequestDetailPage.jsx`) ouvre `/demandes/:id/impression`.
- La vue restitue, dans l'ordre du contrat STB : l'en-tête (référence du dossier,
  banque, date d'édition, nom de l'éditeur), le bloc société, le bloc contact et
  adresse, le bloc bancaire, le bloc activité, le bloc « Information Site WEB »
  (EVO-21), les **codes MCC retenus** avec le code proposé par l'agent à côté, la
  décision et son commentaire, puis la chronologie complète du dossier.
- Les trois mentions obligatoires figurent en pied de page : « Document édité
  depuis la plateforme ClickToPay Affiliation le `<date>` à `<heure>` par
  `<nom>`. » ; « Ce document ne vaut pas contrat. » ; la référence du dossier
  répétée sur chaque page.
- La feuille de style d'impression masque la navigation, les boutons et les
  bandeaux, force le fond en blanc et le texte en noir, et empêche les coupures
  de page à l'intérieur d'un bloc.

**Cas limites.**

- *Demande en brouillon* : imprimable, avec le bandeau « BROUILLON — dossier non
  soumis » en filigrane visible à l'impression.
- *Demande rejetée* : imprimable, la décision et son motif figurent.
- *Champs non renseignés* : rendus « — », jamais laissés vides, pour qu'une
  rubrique omise se distingue d'une rubrique oubliée à l'impression.
- *Cloisonnement* : la vue passe par `GET /api/requests/:id`, donc par le contrôle
  d'accès existant (`server/src/services/requests.js:190`). Un agent d'une autre
  banque obtient le message de refus, pas le document.
- *Impression* : l'action d'impression n'est **pas** tracée. Elle a lieu dans le
  navigateur ; prétendre la journaliser serait mensonger. En revanche, l'ouverture
  de la vue d'impression écrit un `request_events` de type `EDITION_DOSSIER`,
  ce qui est exact et vérifiable.

**Fichiers.**

- `web/src/pages/RequestPrintPage.jsx` — nouveau.
- `web/src/App.jsx:98-115` — route nouvelle `/demandes/:id/impression`, sous
  `Protege`, sans restriction de rôle : le banquier comme l'agent l'ouvrent.
- `web/src/pages/RequestDetailPage.jsx` — bouton.
- `web/src/styles/app.css` — bloc `@media print`.
- `server/src/routes/requests.js` et `server/src/services/requests.js` — écriture
  de l'événement `EDITION_DOSSIER`.
- `web/tests/` — parcours ajouté à la suite d'EVO-13.

**Schéma de base.** Aucun changement.

**Critères d'acceptation.**

- La vue d'impression affiche toutes les rubriques du dossier, dans l'ordre du
  contrat STB, y compris les cinq rubriques d'EVO-21.
- À l'impression (aperçu du navigateur), la navigation et les boutons
  n'apparaissent pas, le fond est blanc, et la référence figure sur chaque page.
- Un brouillon porte la mention « BROUILLON — dossier non soumis ».
- Un agent d'une autre banque qui force l'URL obtient le refus, sans aucune donnée
  du dossier.
- L'ouverture de la vue écrit un événement `EDITION_DOSSIER` nominatif et
  horodaté dans la chronologie.

---

## 5. Questions au commanditaire — catégorie B

Ces huit questions ne sont **pas** tranchées ici. Chacune change le produit, son
périmètre, ses utilisateurs ou ses règles métier. Je donne la question, les
options, ce que chacune coûte et implique, puis ma recommandation — qui n'engage
que moi.

---

### B-1 — Ouvrir la plateforme au marchand lui-même ?

**La question.** Aujourd'hui, trois rôles, tous internes à la banque, ressaisissent
un dossier que le commerçant a fourni par ailleurs
(`server/src/db/schema.sql:22`). Chez Stripe, Adyen, Checkout.com et Braintree, le
marchand a un compte, remplit son dossier, téléverse ses pièces et suit son
statut. Faut-il lui ouvrir un accès ?

**Ce qui pèse pour.** C'est l'écart que la veille juge le plus structurant : il
commande la charge de l'agent, le délai de traitement et la qualité des données.
Un marchand qui saisit lui-même son descriptif d'activité produit un texte plus
riche que celui qu'un agent résume — or ce texte est l'entrée principale de notre
moteur de MCC.

**Ce qui pèse contre.** Le processus tunisien réel est **agence-centré** : la STB
écrit « vous devez prendre contact avec votre agence pour remplir le contrat
d'affiliation », et le contrat se signe à la main, avec cachet, en présence.
Ouvrir la plateforme à l'extérieur change aussi sa surface d'exposition : elle
passe d'un outil interne à une application publique, avec ce que cela suppose
d'enrôlement de compte, de récupération de mot de passe, de résistance à l'abus
et d'hébergement en zone accessible depuis l'Internet.

**Options.**

| Option | Coût | Conséquences |
| --- | --- | --- |
| **1. Ne rien changer** | 0 | L'agent reste le seul point d'entrée. Le produit reste simple et cohérent avec le processus réel. |
| **2. Lien de pré-saisie à usage unique** — l'agent ouvre un dossier et envoie au commerçant un lien limité dans le temps pour compléter l'activité et les coordonnées, puis reprend la main | 5 à 8 j | Pas de compte marchand, pas d'enrôlement, pas de mot de passe. La donnée vient de la source. Suppose un canal d'envoi (voir B-6). L'exposition reste limitée à une page sans authentification, protégée par un jeton à usage unique. |
| **3. Espace marchand complet** — compte, dossier, pièces, suivi de statut | 15 j et plus | Change la nature du produit. Appelle B-4 (pièces) et B-6 (notifications). Exige un hébergement exposé et un audit de sécurité. |

**Ma recommandation : l'option 2.** Elle capte l'essentiel du bénéfice — une
description d'activité écrite par celui qui connaît l'activité — sans changer la
nature du produit ni son exposition, et elle reste réversible. L'option 3 ne se
justifie que si le commanditaire vise un déploiement multi-banques à volume, ce
qui n'est pas l'hypothèse actuelle.

---

### B-2 — Restreindre le rôle administrateur ?

**La question.** Le profil `ADMIN` franchit tous les contrôles de rôle
(`server/src/middleware/auth.js:79`) et voit les dossiers de toutes les banques
(`server/src/services/requests.js:190`, `:200-203`, `:403-406`). Il peut donc
saisir, soumettre **et** arbitrer le même dossier, seul. Au regard du principe du
contrôle à quatre yeux, c'est une rupture de la séparation des tâches. C'est la
réserve R-04 du rapport de recette, la divergence `D6` et le constat `C-10`, que
le README assume explicitement.

**Ce qui pèse pour le statu quo.** Un administrateur unique peut débloquer une
situation sans dépendre de personne : dossier bloqué, agent absent, banque en
panne de banquier. C'est un confort d'exploitation réel dans un déploiement
pilote à une ou deux banques.

**Ce qui pèse contre.** Un contrôle interne bancaire posera la question, et la
réponse « c'est documenté » ne suffira pas longtemps : le principe exige
« au moins deux personnes » par opération. Le cloisonnement multi-banques, qui
est l'un de nos différenciateurs, souffre par ailleurs de cette exception.

**Options.**

| Option | Coût | Conséquences |
| --- | --- | --- |
| **1. Acter le cumul par écrit** | 0,5 j | Il faut une note au contrôle interne. Le risque n'est pas réduit, il est assumé et tracé. |
| **2. Restreindre `ADMIN` aux fonctions d'administration** — retrait du passe-droit de `requireRole`, l'administrateur conserve la lecture des dossiers de toutes les banques mais ne peut ni saisir, ni soumettre, ni arbitrer | 1 j | Sépare réellement les tâches. Un administrateur qui doit aussi instruire se voit attribuer un second compte `AGENT` ou `BANQUIER`. Impact sur les tests : `CAS-HAB-05` change de résultat attendu. |
| **3. Restreindre `ADMIN` et lui retirer aussi la lecture inter-banques** | 1,5 j | Cloisonnement total. Mais l'administrateur ne peut plus diagnostiquer un dossier signalé par une banque, ce qui reporte la charge sur un accès SQL direct — moins tracé que l'application. |

**Ma recommandation : l'option 2.** Elle ferme la brèche réelle — le cumul
saisie/arbitrage — sans supprimer la capacité de diagnostic, qui est légitime et
tracée. L'option 3 déplacerait le problème hors de l'application, ce qui est
pire. **Cette décision est un préalable à toute mise à disposition** : R-04 la
classe au § 7.1.

---

### B-3 — Aller au-delà de la validation, vers le contrat et sa vie ?

**La question.** Après `VALIDEE`, le produit s'arrête
(`server/src/db/schema.sql:56-57`). Le contrat STB, lui, commence : numéro
d'affiliation monétique, numéro de terminal, taux de commission, tests avec la
SMT avant mise en production, suspension d'au moins six mois en cas de taux
anormalement élevé de contestation, radiation en cas de fraude, résiliation de
plein droit en cas de cession du fonds de commerce.

**Ce qui pèse pour.** Le dossier validé n'est pas la fin de quelque chose, c'est
le début d'une relation, et toute la partie « vie du contrat » est aujourd'hui
tenue hors de la plateforme — sur papier, en tableur, ou dans la tête de
l'agence. Les plateformes bancaires d'acquisition (PowerCARD, Worldline)
traitent le marchand comme un objet de cycle de vie complet.

**Ce qui pèse contre.** Le taux de contestation, les impayés et les litiges
viennent du système monétique, pas de nous. Sans flux entrant depuis la SMT ou
depuis le core banking, une plateforme qui prétend gérer la suspension sur taux
de contestation gérerait une donnée qu'elle ne possède pas. Et la phase de tests
avec la SMT suppose une interface dont nous n'avons aucune spécification.

**Options.**

| Option | Coût | Conséquences |
| --- | --- | --- |
| **1. S'en tenir à la validation** | 0 | Le produit reste ce qu'il annonce : l'outillage de la décision MCC. |
| **2. Ajouter les identifiants attribués** — numéro d'affiliation monétique, numéro de terminal, taux de commission, saisis par le banquier à la validation, plus un statut `EN_PRODUCTION` | 4 à 5 j | Le dossier porte enfin les trois cases de l'en-tête du contrat STB. Aucune donnée externe n'est nécessaire : ces valeurs sont attribuées par la banque. Le produit devient la référence du dossier d'affiliation. |
| **3. Cycle de vie complet** — tests SMT, mise en production, suspension, radiation, résiliation, revues périodiques | 10 j et plus, **plus une intégration à spécifier** | Change le produit et ses utilisateurs. Les états de suspension exigent une source de données que nous n'avons pas. |

**Ma recommandation : l'option 2.** Les trois identifiants de l'en-tête du
contrat sont des données que la banque produit elle-même ; les porter ne dépend
de personne et rend le dossier complet. L'option 3 doit attendre qu'une
intégration avec le système monétique soit spécifiée — sans quoi nous
construirions des états que rien n'alimente.

---

### B-4 — Attacher des pièces justificatives au dossier ?

**La question.** Aucune pièce n'est portée par le dossier : ni extrait du
registre, ni pièce d'identité du représentant, ni relevé d'identité bancaire. Le
schéma ne comporte aucune table de documents. Or le contrat STB se signe sur
pièces, et un dossier bancaire doit être reconstituable en contrôle.

**Ce qui pèse pour.** C'est une attente de conformité, pas de confort : un
contrôle interne demandera les pièces, et elles sont aujourd'hui dans un dossier
papier à l'agence, sans lien avec l'enregistrement de la plateforme.

**Ce qui pèse contre.** Attacher des pièces engage bien plus que du code : où
sont-elles stockées, combien de temps, qui peut les lire, comment sont-elles
purgées, sont-elles chiffrées au repos, et comment répond-on à un droit d'accès
ou de rectification au titre de la loi organique n° 2004-63 visée à l'article 8
du contrat STB ? Aucune de ces réponses n'est un choix technique.

**Options.**

| Option | Coût | Conséquences |
| --- | --- | --- |
| **1. Ne rien attacher** | 0 | Les pièces restent au dossier papier. La plateforme n'en porte pas la charge. |
| **2. Liste de contrôle des pièces, sans les pièces** — l'agent coche les pièces reçues, avec leur date et leur nature ; rien n'est stocké | 1 j | Le dossier électronique dit ce que contient le dossier papier. Aucune donnée personnelle nouvelle, aucune question de rétention. Couvre l'essentiel du besoin de contrôle. |
| **3. Téléversement réel** — table de documents, stockage, contrôle de type et de taille, purge, droits d'accès | 4 à 6 j **plus les décisions de rétention et de chiffrement** | Répond pleinement au besoin. Appelle une politique de conservation écrite, un stockage chiffré, et une procédure de purge. |

**Ma recommandation : l'option 2 d'abord.** Elle donne au contrôle interne ce
qu'il cherche en premier — savoir quelles pièces ont été vues et quand — pour un
coût sans rapport avec l'option 3, et elle ne crée aucune obligation nouvelle en
matière de données personnelles. L'option 3 reste souhaitable, mais elle ne doit
pas être lancée avant que la politique de conservation soit écrite.

---

### B-5 — Souscrire un contrôle externe : registre, sanctions, bénéficiaires effectifs ?

**La question.** Sumsub, Signicat, Corefy et Braintree font tous au minimum une
confrontation au registre du commerce et un filtrage sanctions. Nous ne
confrontons rien : `rne` et `tax_id` ne subissent qu'un contrôle de forme
(`server/src/services/requestSchema.js:59-62`). Un RNE inventé passe.

**Ce qui pèse pour.** C'est la brique qui distingue un dossier instruit d'un
dossier saisi. Et le filtrage sanctions relève, dans beaucoup de juridictions,
d'une obligation et non d'un choix.

**Ce qui pèse contre.** Aucune de ces briques n'est réalisable en interne. Elles
supposent un prestataire, un contrat, un budget récurrent proportionnel au
volume, une dépendance de disponibilité, et le transfert de données de nos
clients vers un tiers — ce qui appelle à son tour la loi organique n° 2004-63. La
veille n'a par ailleurs identifié **aucune API publique** du Registre National des
Entreprises tunisien.

**Options.**

| Option | Coût | Conséquences |
| --- | --- | --- |
| **1. Ne rien souscrire** | 0 | Le contrôle reste humain, à l'agence, sur pièces. |
| **2. Contrôles internes seulement** — détection de doublon (EVO-20), contrôle du site (EVO-17), cohérence déclarative (EVO-19) | déjà au programme | Attrape les erreurs de saisie et les incohérences, pas la fraude documentaire. |
| **3. Souscrire un prestataire KYB** | à chiffrer avec le prestataire, plus 5 à 8 j d'intégration **une fois la spécification obtenue** | Répond au besoin. Crée une dépendance, un coût par dossier, et un transfert de données à encadrer. |

**Ma recommandation : l'option 2 pour ce programme, et instruire l'option 3
séparément.** Tant qu'aucun prestataire n'est retenu, il n'y a rien à coder :
inscrire au programme une intégration dont nous n'avons pas la spécification
serait une promesse en l'air. La décision utile aujourd'hui est de **lancer ou
non la consultation d'un prestataire**, pas de choisir une implémentation.

---

### B-6 — Faire sortir des notifications du système ?

**La question.** Rien ne sort : aucun courriel, aucun webhook, aucune relance,
aucun appel vers un système tiers (aucune dépendance de messagerie ni de client
HTTP dans `server/package.json`, aucun appel sortant dans `server/src`). Tous les
acteurs consultés notifient les changements de statut. Chez nous, il faut ouvrir
l'application pour savoir qu'un dossier a bougé.

**Ce qui pèse pour.** Un banquier qui ne sait pas qu'un dossier l'attend le
traite en retard. Une relance automatique sur les dossiers en
`COMPLEMENT_REQUIS` depuis plus de N jours coûte peu et évite des dossiers
oubliés.

**Ce qui pèse contre.** Chaque canal suppose un destinataire spécifié. Le
webhook vers le système monétique suppose de savoir quel système, quel format,
quelle authentification — nous ne le savons pas. Le courriel suppose un serveur
de messagerie de la banque, une adresse d'expédition, une politique
anti-hameçonnage.

**Options.**

| Option | Coût | Conséquences |
| --- | --- | --- |
| **1. Ne rien émettre** | 0 | Statu quo. |
| **2. Notification interne dans l'application** — un compteur et une liste « nouveautés depuis votre dernière visite » | 2 j | Aucune dépendance externe, aucun destinataire à spécifier. Couvre le cas du banquier qui ne sait pas qu'un dossier l'attend, dès lors qu'il se connecte. |
| **3. Courriel** — vers l'agent et le banquier aux changements de statut, plus relance programmée | 3 à 4 j **plus l'accès au serveur de messagerie de la banque** | Atteint l'utilisateur hors de l'application. Exige un ordonnanceur, un modèle de message, et une politique de fréquence. |
| **4. Webhook sortant vers le système monétique** | 4 à 8 j, **et une spécification que nous n'avons pas** | Non réalisable en l'état. |

**Ma recommandation : l'option 2, puis l'option 3 si le commanditaire fournit
l'accès au serveur de messagerie.** L'option 4 doit être écartée tant que le
système destinataire n'est pas spécifié ; c'est d'ailleurs pourquoi je la classe
en C-8 pour la partie SMT.

---

### B-7 — Conserver le jeton d'authentification dans le stockage local du navigateur ?

**La question.** Le jeton est conservé dans le stockage local (`C-25`, réserve
R-13). Un script injecté dans la page pourrait le lire. Aucun test d'intrusion
n'ayant été mené, le risque n'est pas quantifié.

**Ce qui pèse pour le statu quo.** Le jeton est court (8 heures), il porte
l'empreinte du mot de passe sous lequel il a été émis
(`server/src/middleware/auth.js:18`), et le rôle, la banque et l'état du compte
sont **relus en base à chaque appel** (`auth.js:46-64`) : un jeton volé ne survit
ni à une désactivation, ni à une réinitialisation de mot de passe. Les en-têtes
de sécurité sont posés par `helmet` (`server/src/app.js:17`) et l'origine
étrangère est refusée (`app.js:18`).

**Ce qui pèse contre.** Un cookie `HttpOnly`, `Secure`, `SameSite=Strict` mettrait
le jeton hors de portée de tout script, et c'est le seul moyen d'y parvenir
vraiment.

**Options.**

| Option | Coût | Conséquences |
| --- | --- | --- |
| **1. Acter le choix actuel** | 0,25 j (note écrite) | Le risque subsiste, tempéré par la brièveté du jeton et la relecture des droits. |
| **2. Passer au cookie `HttpOnly`** | 1 à 2 j | Supprime la lecture par script. Exige une protection contre la falsification de requête inter-site (jeton anti-CSRF ou `SameSite=Strict`), et complique les tests d'API qui posent aujourd'hui un en-tête `Authorization`. |
| **3. Commander un test d'intrusion avant de décider** | prestation externe | Quantifie le risque. Rien ne se code avant. |

**Ma recommandation : l'option 2, mais pas dans ce programme.** Le changement est
de faible ampleur et il ferme définitivement le sujet ; en revanche il touche
l'authentification, c'est-à-dire le chemin le plus critique du produit, et il ne
doit pas être fait dans le même lot que vingt-deux autres évolutions. À
programmer seul, avec une recette dédiée, une fois EVO-13 en place pour disposer
d'un filet.

---

### B-8 — Quelles valeurs de seuils pour le profil de risque ?

**La question.** EVO-18 livre le mécanisme du profil de risque : sept constats,
trois paliers, chacun motivé par la valeur qui l'a déclenché. Le mécanisme est du
ressort de l'agent 3. **Les valeurs** — seuil de volume mensuel moyen, seuil de
volume mensuel élevé, seuil de panier moyen, et le poids de chacun des sept
constats — sont une règle métier de la banque. Je ne les invente pas.

**Ce qu'il faut décider.** Trois montants en dinars tunisiens et sept
pondérations, plus les bornes des trois paliers. Rien d'autre.

**Options.**

| Option | Coût | Conséquences |
| --- | --- | --- |
| **1. Le commanditaire fixe les valeurs** | 0,5 j de son côté | Le profil est opérationnel dès la mise en service. C'est le cas nominal. |
| **2. Valeurs provisoires, révisées après un trimestre d'observation** | 0 immédiat | Le profil fonctionne, l'écran affiche « Seuils provisoires, non validés par la banque », et les valeurs sont ajustées sur des dossiers réels. Les seuils étant administrables, l'ajustement ne demande aucune livraison. |
| **3. Ne pas livrer le profil tant que les valeurs ne sont pas fixées** | 0 | Les six informations restent inertes, comme aujourd'hui. |

**Ma recommandation : l'option 2.** Le mécanisme a de la valeur même avec des
seuils imparfaits, parce qu'il **rend visible** une information aujourd'hui
invisible, et parce que chaque constat est affiché avec sa valeur : le banquier
peut juger par lui-même même si le palier ne lui convient pas. La mention
« seuils provisoires » interdit toute lecture abusive. L'option 3 laisserait le
gisement inexploité pour une raison qui ne tient pas : on n'a pas besoin d'un
seuil juste pour afficher un volume.

---

## 6. Ce que j'écarte — catégorie C

Ce qui suit n'entre pas au programme. Le dire franchement vaut mieux que de
l'inscrire et de ne pas le faire.

### C-1 — Référentiel et particularités Mastercard

Le *Mastercard Quick Reference Booklet* n'a jamais pu être téléchargé : la page
est protégée contre les robots, et le projet n'en a jamais obtenu une copie. Les
codes MCC étant des codes ISO 18245 partagés, nos propositions restent valides ;
mais **les particularités Mastercard — libellés propres, éligibilités
divergentes, codes à enregistrement — ne sont pas couvertes et ne peuvent pas
l'être.** La plateforme le dit déjà à l'écran. Aucune évolution ne peut être
programmée sur un document que nous n'avons pas ; si le commanditaire obtient le
référentiel par le canal Mastercard de la banque, la fonction d'import du
référentiel est déjà en place pour l'absorber, et seule l'adjonction d'un jeu de
libellés par réseau serait à coder — de l'ordre de deux jours.

### C-2 — Signature électronique qualifiée du contrat

Signicat vend une signature qualifiée au sens d'eIDAS, et l'article 10 du contrat
STB prévoit la signature électronique au sens de la loi n° 2000-83. Mais aucun
prestataire n'est désigné, aucune spécification d'interface n'est disponible, et
le formulaire STB lui-même se signe à la main avec cachet. Rien à coder.

### C-3 — Filtrage sanctions, personnes politiquement exposées, biométrie, entretien vidéo

Prestation tierce payante, sans prestataire retenu. Voir B-5 : la décision utile
est de lancer ou non une consultation, pas de coder.

### C-4 — Interrogation du Registre National des Entreprises tunisien

La veille n'a identifié aucune API publique documentée. Sans spécification
d'interface, il n'y a pas d'évolution à écrire — seulement une hypothèse.

### C-5 — Enregistrement du marchand à haut risque auprès du réseau (VIRP)

Le Visa Integrity Risk Program fait peser sur l'acquéreur l'obligation
d'enregistrer certains marchands auprès du réseau. Cette relation est celle de la
banque avec Visa ; elle ne passe pas par notre plateforme, et nous n'en avons ni
les formulaires, ni les délais officiels, ni le canal. Notre produit fait déjà ce
qui le concerne : il **interdit** les codes sensibles à la source
(`server/src/services/mccSuggestion.js:70` et
`server/src/services/requests.js:101-106`).

### C-6 — Constructeur de parcours par glisser-déposer

Signicat en fait un argument commercial, et nos cinq étapes sont effectivement
figées dans le code (`web/src/pages/RequestFormPage.jsx:11-17`). Mais elles
couvrent un contrat papier stable depuis 2020, et aucun utilisateur n'a demandé à
les réorganiser. Un moteur de parcours coûterait plusieurs semaines pour une
souplesse dont personne n'a besoin. C'est une fonction que tout le marché propose
et dont notre utilisateur n'a pas l'usage : exactement le cas où il ne faut pas
suivre le marché.

### C-7 — Reclassement en masse d'un portefeuille existant

KYC SiteScan en fait un de ses trois usages. Il suppose un portefeuille de
marchands déjà affiliés, que nous n'avons pas : la plateforme n'a aucune demande
validée en production, et la reprise de données n'a jamais été faite
(`rapport-recette.md` § 2.2 B). Sujet à rouvrir le jour où un portefeuille existe.

### C-8 — Phase de tests avec la Société Monétique Tunisie

La STB annonce « entamer les tests avec la SMT » avant mise en production. Nous
n'avons ni la spécification de cette interface, ni son protocole, ni ses
identifiants. Coder des états de test sans savoir ce qui les alimente
produirait une coquille. Voir B-3, option 3.

### C-9 — Déduction du MCC par apprentissage automatique

Brex décrit une approche par modèle appris ; Stripe retombe sur l'analyse du site
web. Nous ne devons pas les suivre : notre seul avantage franc sur le marché est
que **chaque proposition est justifiée par les termes qui l'ont produite**
(`server/src/services/mccSuggestion.js:143`, invariant tenu en dur). Un modèle
statistique romprait cette garantie, et il faudrait en plus un prestataire. Ce
n'est pas un renoncement, c'est un choix de produit.

### C-10 — Réutilisation d'informations entre dossiers (*networked onboarding*)

Stripe le propose pour un marchand détenant plusieurs comptes. Chez nous, un
marchand a une banque et un dossier. Le cas d'usage n'existe pas.

### C-11 — Campagne de mesure de charge, recette mobile et multi-navigateurs

R-09 et R-10 sont légitimes, mais ce sont des **activités de recette**, pas du
code : elles demandent un palier représentatif à établir, un téléphone réel et un
second moteur de rendu. EVO-16 traite les quatre coûts que la lecture du code
suffit à établir ; la mesure, elle, appartient à la prochaine campagne. Il serait
malhonnête de l'inscrire au cahier des charges de l'agent 3.

### C-12 — Audit de sécurité externe, reprise après incident, sauvegarde et restauration

Aucun n'a été conduit (`rapport-recette.md` § 2.2). Ce sont des prestations et des
procédures d'exploitation, pas des évolutions du produit.

---

## 7. Ce qu'il faut retenir

1. **Les huit écarts de la veille sont tous confirmés dans le code.** Aucun n'a
   été infirmé. Une formulation a dû être corrigée : « rien ne sort du système »
   est trop large, l'export du référentiel MCC existe
   (`server/src/routes/admin.js:111-130`).
2. **Six écarts sur huit ne sont pas des oublis mais des choix de périmètre.**
   Les inscrire au programme sans décision reviendrait à changer le produit en
   silence. Ils sont versés aux huit questions du § 5.
3. **Deux fonctions nouvelles sont prêtes à coder et le méritent** : le contrôle
   du site marchand (EVO-17), qui vérifie une exigence déjà contractuelle en
   Tunisie, et le profil de risque (EVO-18), qui exploite six informations
   aujourd'hui inertes.
4. **La priorité reste néanmoins la recette.** Sept corrections courtes
   — 3,25 jours au total — conditionnent la mise en service, et l'absence totale
   de test d'interface est le risque le plus sérieux du produit.
5. **Ce que la plateforme fait bien, elle le fait mieux que le marché** :
   l'explicabilité des propositions est un invariant tenu en dur, le référentiel
   est administrable et historisé, et le cloisonnement entre banques résiste à
   l'appel direct de l'API. Ces acquis ne demandent rien, sinon de ne pas les
   abîmer.

---

*Document établi le 2026-09-22. Aucun fichier du projet n'a été modifié, hors le
présent document. Les seules actions exécutées ont été des lectures du code de
`server/` et `web/` et des documents de `docs/`.*
