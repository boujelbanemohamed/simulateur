# Rapport de recette — Plateforme ClickToPay Affiliation

> Agent 7 — vague 4, synthèse de la campagne. Rédigé le 2026-09-22.
> Sources : `plan-de-tests.md` (147 cas), `revue-de-code.md` (26 constats),
> `resultats-vague2-front.md`, `resultats-vague2-back.md`, `resultats-vague3-front.md`,
> `resultats-vague3-back.md`, `corrections-vague3.md`, `recette-coordination.md`,
> `recette-tableau-de-bord.md`, le code de `server/` et `web/`, et l'exécution de
> `npm test` le 2026-09-22.
>
> Ce rapport ne rejoue pas la campagne : il la consolide et statue. Les quelques
> vérifications faites en propre par l'agent 7 sont signalées comme telles et leur
> commande est donnée.

---

## 1. Synthèse pour le commanditaire

### Ce que fait la plateforme

ClickToPay Affiliation permet à une banque d'instruire les demandes d'affiliation de ses
commerçants en ligne. Un **agent** de la banque saisit le dossier du commerçant en cinq
étapes — site et société, contact, adresse et coordonnées bancaires, activité, récapitulatif.
À l'étape « activité », la plateforme lui propose les **codes MCC** (codes d'activité
marchande, norme ISO 18245) qui correspondent à ce qu'il a décrit, classés par pertinence et
accompagnés des termes qui ont déclenché chaque proposition. L'agent retient un code pour
Visa et un code pour Mastercard, puis soumet le dossier. Un **banquier** de la même banque
arbitre : il valide — en conservant ou en substituant les codes —, rejette avec motif, ou
renvoie le dossier à l'agent pour complément. Un **administrateur** gère les comptes, les
banques et le référentiel des 279 codes MCC, qu'il peut exporter, corriger hors ligne et
réimporter. Chaque étape laisse une trace nominative et horodatée.

Trois garde-fous structurent le produit : aucun code interdit (jeux d'argent, contenus pour
adultes, crypto-actifs…) ne peut être proposé ni retenu ; une banque ne voit jamais les
dossiers d'une autre ; et toute proposition faite au banquier est justifiée par les termes
qui l'ont produite.

### Où en est sa qualité

La campagne a comporté quatre vagues : rédaction d'un plan de 147 cas et revue du code
(vague 1), exécution (vague 2), correction puis retest (vague 3), synthèse (vague 4).
**137 des 147 cas du plan ont été exécutés au moins une fois** ; 10 ne l'ont jamais été,
dont quatre classés bloquants, tous dans le domaine de l'import du référentiel (§ 2.2).

Dix-sept défauts ont été relevés en exécution au cours des vagues 2 et 3 ; **tous sont
aujourd'hui clos**. Les corrections ont été vérifiées, selon les cas, par reproduction du
scénario d'origine par un agent de recette indépendant (9 défauts), ou par un test automatisé
ajouté avec le correctif (6 défauts) ; deux corrections mineures, toutes deux sur l'interface,
ont été rejouées à l'écran par l'intervenant qui les a écrites, sans agent de recette
indépendant. Le présent rapport ouvre un
dix-huitième défaut, mineur (§ 5.2, DEF-A7-01). **Aucun défaut bloquant n'a été relevé au
cours de la campagne.** La suite automatisée compte **113 tests, tous verts**
(`cd server && npm test`, exécuté le 2026-09-22).

Le chemin nominal est solide : le parcours complet — saisie, brouillon, reprise, soumission,
demande de complément, re-soumission, validation avec substitution de codes — a été joué de
bout en bout à l'écran et par l'API, sans erreur. Le cloisonnement entre banques et la
séparation des rôles résistent à l'accès par URL forcée comme à l'appel direct de l'API.
Les quatre situations où deux utilisateurs agissent en même temps sur le même dossier sont
fermées par des garde-fous en base, pas seulement par du code applicatif.

Deux faiblesses de méthode méritent d'être connues du commanditaire. D'abord, **les
correctifs de la vague 2 ont traité le cas constaté plutôt que la règle générale** : trois
d'entre eux ont dû être repris en vague 3 parce que le défaut restait atteignable par une
autre porte. Ils ont, cette fois, été formulés comme des invariants et couverts par un test.
Ensuite, **l'interface n'est couverte par aucun test automatisé** : les 113 tests portent
tous sur l'API. Toute régression d'écran ne sera vue que par une recette manuelle.

### Avis

**Apte sous réserve.**

La plateforme peut être mise à disposition des banques, à trois réserves près, qui ne
touchent pas au parcours métier mais à ce qui l'entoure :

1. **L'import du référentiel MCC n'a pas été recetté au niveau attendu par le plan.**
   Sept des seize cas de ce domaine n'ont jamais été exécutés, dont quatre bloquants qui
   portent précisément sur la garantie « la simulation ne modifie rien » et « rien n'est
   écrit sans confirmation explicite ». Des éléments convergents existent (tests automatisés,
   cas `CAS-ERGO-11` joué à l'écran, `CAS-ROB-01`), mais la garantie formelle demandée par
   le plan n'est pas acquise. Or c'est la fonction qui modifie le référentiel réglementaire
   de toutes les banques d'un coup.
2. **Vingt-deux des vingt-six constats de la revue de code n'ont été ni corrigés ni
   confirmés en exécution.** Quatre seulement ont été traités. Aucun des vingt-deux restants
   n'est bloquant, mais cinq touchent la traçabilité et la résilience du référentiel, deux
   sujets sur lesquels un contrôle interne bancaire posera des questions (§ 5.4).
3. **Aucune mesure de charge, aucun audit de sécurité externe, aucune recette sur navigateur
   mobile réel** n'ont été conduits, et le référentiel Mastercard n'a pas pu être obtenu
   (§ 2.2). Les libellés servis sont les libellés Visa ; les codes, eux, sont communs aux
   deux réseaux par la norme ISO 18245.

Aucune de ces réserves n'empêche une mise en service pilote sur un périmètre maîtrisé —
une ou deux banques, un volume connu, l'import du référentiel réservé à l'équipe projet.
Elles s'opposent en revanche à une ouverture large sans le complément de recette décrit
au § 7.

---

## 2. Périmètre

### 2.1 Périmètre couvert

| Domaine | Cas au plan | Cas exécutés au moins une fois | Vagues |
| --- | --- | --- | --- |
| AUTH — authentification, jeton, mot de passe, limitation de débit | 17 | 17 | 2 et 3 |
| HABILITATION — rôles, cloisonnement par banque, URL forcée | 10 | 10 | 2 et 3 |
| DEMANDE — saisie, validation, brouillon, formulaire en 5 étapes | 14 | 14 | 2 et 3 |
| WORKFLOW — transitions, refus, concurrence | 15 | 14 | 2 et 3 |
| MCC — moteur de proposition, codes interdits, recherche manuelle | 15 | 15 | 2, 3 et 4 |
| ADMIN — comptes, banques, référentiel, historique, journal | 22 | 22 | 2 et 3 |
| IMPORT — export, lecture Excel/CSV, rapport d'écart, application | 16 | 9 | 3 |
| INDEXATION — mots-clés dérivés, secteurs, effet immédiat | 10 | 10 | 2 et 3 |
| ROBUSTESSE — types hostiles, bornes, codes HTTP | 16 | 15 | 2 et 3 |
| ERGONOMIE — erreurs, chargement, 375 px, clavier, contrastes | 12 | 12 | 2 et 3 |
| **Total** | **147** | **137** | |

Le décompte est établi en relevant les identifiants `CAS-…` cités dans les quatre rapports
d'exécution et en les rapprochant des 147 identifiants du plan. « Exécuté » ne vaut pas
« conforme » : le détail des statuts est au § 3 et au § 5.

Ont été couverts en outre, hors identifiants du plan :

- la **concurrence** sur trois transitions (soumission, arbitrage, modification), jouée en
  parallèle réel — 45 itérations sur la modification, 9 sur la soumission et l'arbitrage
  (`resultats-vague3-back.md`, ligne C-02) ;
- la **résistance du moteur** sur un balayage de 1 120 profils côté interface et de
  504 profils avec nom et adresse de site (`resultats-vague3-front.md` § 2 et DEF-A5-03) ;
- les **en-têtes de sécurité HTTP** et le refus d'une origine étrangère (CAS-ROB-16) ;
- le **démarrage en production** avec un secret absent, faible ou laissé à la valeur du
  dépôt (`corrections-vague3.md`, DEF-A6-03).

### 2.2 Périmètre non couvert

Ce paragraphe est explicite à dessein : ce qui suit n'a pas été vérifié, et ne doit donc pas
être présenté comme garanti.

**A. Exclusions posées dès la rédaction du plan** (`plan-de-tests.md` § 1.2)

| Exclusion | Raison |
| --- | --- |
| Référentiel et libellés **Mastercard** | Le manuel Mastercard n'a pas pu être téléchargé (le README indique un refus du CDN en 403). Les codes MCC étant communs aux deux réseaux par la norme ISO 18245, la plateforme sert les libellés Visa pour les deux réseaux et l'annonce à l'écran. Aucune vérification n'a donc été faite contre une source Mastercard : si Mastercard publie un libellé ou une éligibilité divergents pour un code, la plateforme ne le saura pas. |
| **Tests de charge et de performance** | Hors recette fonctionnelle. Le README annonce 4,1 ms par appel du moteur ; ce chiffre n'a été ni reproduit ni contredit. Aucun palier de montée en charge, aucun comportement sous concurrence de masse, aucune mesure de temps de réponse sous volume n'ont été établis. |
| **Audit de sécurité externe** | Aucun. Les contrôles faits sont ceux du plan (injection SQL, script injecté, en-têtes HTTP, cloisonnement, cycle de vie du jeton) : c'est une recette, pas un test d'intrusion. |
| Propagation `LISTEN/NOTIFY` **entre plusieurs instances** | Exige deux processus API sur des ports dédiés, incompatible avec la matrice d'isolation de la campagne. Seul le rechargement à l'intérieur d'un processus est vérifié. En production multi-instances, une modification du référentiel peut n'être vue que par l'instance qui l'a reçue. |
| Robustesse de bcrypt, cryptanalyse du jeton JWT | Bibliothèques tierces ; seul leur usage applicatif est testé. |
| Chaîne Python `tools/extract.py` / `parse_mcc.py` | Hors application, non rejouable sans le PDF Visa. |
| Expiration naturelle du jeton (8 h) | Non observable dans la durée d'une campagne. Approchée par un jeton forgé expiré (CAS-AUTH-14). |
| Internationalisation, impression, export PDF | Non implémentés. |

**B. Non couvert, et non prévu au plan**

| Exclusion | Conséquence |
| --- | --- |
| **Navigateur mobile réel** | Les cas 375 px (CAS-ERGO-05) ont été joués avec Chromium piloté, en fenêtre réduite, pas sur un téléphone. Le comportement tactile réel, le clavier virtuel et le rendu sur iOS ou Android n'ont pas été observés. |
| **Autres navigateurs que Chromium** | Aucun essai sur Firefox ni Safari. L'attribut `inert`, utilisé pour neutraliser un formulaire en lecture seule, a un support inégal selon les versions. |
| **Lecteur d'écran** | Les cas d'accessibilité portent sur l'association des étiquettes, l'ordre de tabulation, le focus et les contrastes. Aucun parcours au lecteur d'écran (NVDA, VoiceOver) n'a été fait : la restitution vocale des bandeaux `role="alert"` et `aria-pressed` n'est pas vérifiée. |
| **Paquet de production de l'interface** | Toute la recette front s'est faite sur le serveur de développement Vite. L'agent 5 note que chaque appel d'API part deux fois (double rendu du mode strict de React) et signale lui-même que le point est à revérifier sur un paquet construit. Ce n'est pas fait. |
| **Reprise après incident, sauvegarde, restauration** | Aucun essai. |
| **Migration de données existantes** | Aucune : toutes les bases de recette partent d'un amorçage. |

**C. Cas du plan jamais exécutés**

Dix cas n'apparaissent dans aucun des quatre rapports d'exécution. Leur statut est
**non exécuté**, et non « satisfait ».

| Cas | Intitulé | Criticité au plan |
| --- | --- | --- |
| CAS-IMPORT-04 | Fichier métier désordonné : ordre libre, colonnes en trop, variantes d'en-tête | MAJEUR |
| CAS-IMPORT-05 | Traduction des valeurs métier | MAJEUR |
| CAS-IMPORT-06 | Anomalies signalées avec leur numéro de ligne | **BLOQUANT** |
| CAS-IMPORT-07 | Codes normalisés par Excel | MAJEUR |
| CAS-IMPORT-08 | Le rapport d'écart ne modifie rien | **BLOQUANT** |
| CAS-IMPORT-09 | Application après confirmation explicite | **BLOQUANT** |
| CAS-IMPORT-10 | Désactivation des codes absents : strictement optionnelle | **BLOQUANT** |
| CAS-IMPORT-14 | Fichiers refusés | MAJEUR |
| CAS-ROB-12 | Les erreurs internes ne fuient pas | MAJEUR |
| CAS-WF-15 | Re-soumission : la photographie précédente est remplacée, pas cumulée | MAJEUR |

Des éléments convergents existent pour quatre d'entre eux, sans les remplacer :
`CAS-ERGO-11` (joué à l'écran en vague 3) montre la simulation, le bandeau « aucune donnée
modifiée », la case de désactivation décochée par défaut et la seconde confirmation, sans
aucune écriture ; `CAS-ROB-01` montre que `apply:"false"` n'écrit rien ; la suite automatisée
contient « l'import produit un rapport d'écart sans rien modifier », « l'import applique les
écarts et historise chaque code touché », « un fichier métier désordonné est lu, et ses
anomalies signalées » et « un fichier sans colonne « code » est refusé avec un message
exploitable ». Ces éléments réduisent le risque ; ils ne valent pas exécution des cas.

---

## 3. Scénarios d'exécution

Seize parcours métier de bout en bout. Chacun rassemble les cas du plan qui l'établissent ;
le résultat observé est celui consigné par l'agent qui l'a joué, avec la référence du rapport
d'origine. Les statuts employés sont **conforme**, **conforme avec réserve**,
**non conforme** et **non exécuté**.

Convention de lecture : « vague 2 » renvoie à l'exécution initiale (agents 2 et 3),
« vague 3 » au retest après correction (agents 5 et 6), « vague 4 » à une vérification faite
par l'agent 7 pour ce rapport.

---

### SC-01 — Connexion et politique de mot de passe

**Acteur** : agent, banquier ou administrateur d'une banque cliente.
**Préconditions** : compte actif, banque active, référentiel chargé.
**Cas rattachés** : CAS-AUTH-01 à 06, CAS-AUTH-12, CAS-AUTH-13, CAS-AUTH-14, CAS-HAB-08.

**Enchaînement**
1. L'utilisateur saisit son adresse et son mot de passe sur `/connexion`.
2. Il est redirigé vers la liste des demandes ; l'en-tête porte son nom, son rôle et sa banque.
3. Il change son mot de passe depuis l'écran dédié.
4. Il tente de se reconnecter avec l'ancien mot de passe.

**Résultat attendu** : connexion en 200 avec un jeton ; identifiants erronés refusés en 401
avec un message qui ne dit pas si le compte existe ; mot de passe d'au moins 10 caractères
avec minuscule, majuscule et chiffre ; après changement, les sessions ouvertes sous l'ancien
mot de passe sont fermées.

**Résultat observé** : conforme sur les deux niveaux. Côté API, `agent@banque.tn` obtient un
jeton à trois segments portant `AGENT`/`BQ001`, et `last_login_at` avance ; compte inconnu et
mot de passe faux renvoient tous deux exactement `{"error":"Identifiants incorrects"}` ; un
compte désactivé reçoit 401 `Compte désactivé` et une banque désactivée 401
`Banque désactivée` ; la politique de mot de passe rend trois messages français distincts ;
après changement, l'ancien jeton reçoit 401 `Mot de passe modifié : reconnectez-vous` et le
nouveau 200 (`resultats-vague2-back.md`, CAS-AUTH-01 à 06, 12, 13 ; non-régression confirmée
en vague 3, `reg_auth.py` et `reg_auth2.py`). Côté écran, la redirection, l'en-tête
`Salma Ben Ali / Agent — BQ001` et l'ordre de tabulation `e-mail → mot de passe → Se connecter`
sont conformes (`resultats-vague2-front.md`, CAS-AUTH-01, CAS-ERGO-06).

**Statut : conforme.**

**Réserve** : un point reste ouvert, `CAS-AUTH-10`. Un jeton émis dans la même seconde qu'une
réinitialisation du mot de passe restait accepté. Le correctif remplace la comparaison
d'horodatages par une empreinte du mot de passe portée par le jeton ; il est vérifié en vague 3
(`resultats-vague3-back.md`, DEF-A3-02 : ancien jeton en 401 alors que l'écart est de 76 ms)
et par le test automatisé « un jeton émis avant une réinitialisation est refusé, même à la
seconde près ». Défaut clos.

---

### SC-02 — Première connexion d'un compte créé par l'administrateur

**Acteur** : administrateur, puis le titulaire du nouveau compte.
**Préconditions** : banque active.
**Cas rattachés** : CAS-ADM-01, CAS-ADM-02, CAS-ADM-03, CAS-AUTH-11, CAS-AUTH-12.

**Enchaînement**
1. L'administrateur crée un compte avec un mot de passe provisoire.
2. Le titulaire se connecte pour la première fois.
3. Il tente d'atteindre une page métier avant d'avoir changé son mot de passe.
4. Il définit un nouveau mot de passe, puis accède à la plateforme.

**Résultat attendu** : le compte est créé en 201 avec `mustChangePassword` à vrai et le mot de
passe haché ; la première connexion réussit mais toute route métier est refusée tant que le
mot de passe n'a pas été changé ; l'action est journalisée.

**Résultat observé** : conforme. En API, création en 201, empreinte en `$2b…`, aucune trace du
mot de passe en clair, et une entrée `admin_events` `USER`/`CREATION` portant l'adresse et le
rôle ; la première connexion rend `mustChangePassword: true` puis 403
« Vous devez définir un nouveau mot de passe avant d'utiliser la plateforme. » sur `/api/mcc`,
`/api/requests` et `/api/admin/users`, tandis que `/api/auth/me` et `/api/auth/password`
restent ouverts (`resultats-vague2-back.md`, CAS-ADM-01, CAS-ADM-02, CAS-AUTH-11). À l'écran,
la première connexion force `/mot-de-passe` avec le message « Changement obligatoire — Votre
mot de passe a été réinitialisé par un administrateur… » ; l'URL forcée `/demandes` y ramène ;
après changement conforme, l'accès s'ouvre (`resultats-vague3-front.md`, CAS-AUTH-11 front,
joué en vague 3 faute d'avoir été atteint en vague 2).

**Statut : conforme.** C'est le cas classé n° 1 des priorités du plan (§ 3.13) : il est couvert
aux deux niveaux.

---

### SC-03 — Limitation des tentatives de connexion

**Acteur** : un tiers qui essaie des mots de passe.
**Préconditions** : instance démarrée sans `LOGIN_RATE_LIMIT_MAX` (valeur par défaut :
10 tentatives par fenêtre de 15 minutes).
**Cas rattachés** : CAS-AUTH-15, CAS-AUTH-16, CAS-AUTH-17.

**Enchaînement** : dix tentatives erronées, puis une onzième, puis une douzième avec le bon
mot de passe ; puis neuf tentatives erronées, une réussie, neuf erronées ; puis quinze envois
à corps invalide suivis d'une tentative erronée.

**Résultat attendu** : blocage à la onzième tentative erronée, y compris pour le bon mot de
passe pendant la fenêtre ; une connexion réussie remet le compteur à zéro.

**Résultat observé** : les deux premières parties sont conformes — 10 × 401 puis 429
« Trop de tentatives de connexion. Réessayez dans quelques minutes. » avec `Retry-After: 900`,
le bon mot de passe recevant aussi 429 ; et 9 × 401, 1 × 200, 9 × 401 sans aucun 429
(`resultats-vague3-back.md`, CAS-AUTH-15 et 16, joués en vague 3, non joués en vague 2).
La troisième partie confirme la divergence **D5** : quinze envois à corps invalide rendent
400 sans alimenter le compteur, la seizième tentative recevant 401 et non 429.

**Statut : conforme avec réserve.** La protection annoncée existe et fonctionne sur la voie
normale ; une sollicitation à corps malformé n'est pas freinée. Le risque est faible — un
corps invalide n'essaie aucun mot de passe — mais le compteur n'est pas celui que décrit le
README. Réserve ouverte, non corrigée (§ 5.3).

---

### SC-04 — Saisie d'une demande d'affiliation en cinq étapes

**Acteur** : agent d'une banque.
**Préconditions** : agent connecté, référentiel chargé, 27 secteurs d'activité servis.
**Cas rattachés** : CAS-DEM-01 à 14, CAS-ERGO-01, CAS-ERGO-02, CAS-ERGO-06, CAS-ROB-04 à 06,
CAS-ROB-13, CAS-ROB-14.

**Enchaînement**
1. L'agent ouvre « Nouvelle demande » et parcourt les cinq étapes : site et société, contact,
   adresse et banque, activité, récapitulatif.
2. Il laisse des champs vides, saisit une adresse de site invalide, un RNE trop court, une
   description trop brève, puis tente de passer à la suite.
3. Il enregistre un brouillon, recharge la page, reprend la saisie.
4. Il corrige, complète les cinq étapes et atteint le récapitulatif.

**Résultat attendu** : chaque champ obligatoire manquant est signalé nommément, en intitulé
métier et non en nom technique ; le bandeau d'erreur est annoncé au lecteur d'écran et ramène
la page sur lui ; un brouillon enregistré deux fois ne crée qu'une demande ; la reprise
restitue toutes les valeurs.

**Résultat observé** : conforme. En API, un corps vide rend 400 avec exactement onze messages
`Champ obligatoire` sur les onze champs attendus et aucun autre ; les neuf formats invalides
rendent chacun le message exact prévu par le plan ; les bornes de longueur, les dates
inexistantes, les montants hors capacité et les caractères de contrôle sont tous refusés en
400 sans jamais atteindre PostgreSQL (`resultats-vague2-back.md`, CAS-DEM-01 à 03, CAS-ROB-04
à 06, CAS-ROB-13). À l'écran, le bandeau `role="alert"` liste
« Adresse du site : L'adresse du site doit être une URL valide (https://...) », « RNE : … »,
« Description de l'activité : … », la page est ramenée sur le bandeau (défilement 116 → 0) et
le focus passe sur le conteneur qui le contient ; les compteurs de caractères se comportent
comme prévu ; les trente-six champs des cinq étapes ont tous une étiquette associée ; deux
clics sur « Enregistrer le brouillon » laissent une seule demande ; après rechargement, les
cinq étapes restituent site, société, contact, adresse, coordonnées bancaires, activité, cases
à cocher et codes retenus, sans aucun `null` affiché (`resultats-vague2-front.md`, CAS-DEM-04,
05, 06, 10, 13, CAS-ERGO-01, 02, 06 ; non-régression confirmée en vague 3).
Les caractères accentués, arabes et les émojis sont restitués à l'identique (CAS-ROB-14), et
`<script>alert(1)</script>` saisi en nom de site est restitué littéralement, sans exécution
(CAS-ROB-10).

**Statut : conforme.**

---

### SC-05 — Proposition des codes MCC et arbitrage Visa / Mastercard par l'agent

**Acteur** : agent.
**Préconditions** : étape « activité » renseignée, référentiel d'amorçage intact (279 codes).
**Cas rattachés** : CAS-MCC-01, 02, 03, 04, 05, 11, 12, 13, 14, CAS-DEM-12, CAS-DEM-14,
CAS-ERGO-12.

**Enchaînement**
1. L'agent décrit l'activité et choisit un secteur, puis atteint l'étape 4.
2. La plateforme affiche les propositions classées, chacune avec son code, son libellé
   français, sa description, la définition Visa, un pourcentage de pertinence et les termes
   qui l'ont déclenchée.
3. L'agent retient un code pour Visa, un autre pour Mastercard, ou le même pour les deux.
4. Il cherche un code au clavier et le retient bien qu'il ne soit pas proposé.
5. Il décrit une activité que rien ne reconnaît.

**Résultat attendu** : ordre et scores exacts sur les jeux de référence ; listes Visa et
Mastercard identiques mais indépendantes ; tout score entre 1 et 99 ; **toute proposition
porte au moins un terme justificatif** ; une activité non reconnue reçoit le code de repli
5999, annoncé comme tel, et jamais une liste vide.

**Résultat observé** : conforme après correction. Sur le jeu JD-01, le moteur rend
`5977:74, 7230:66, 7298:63, 5912:57, 5999:50` — ordre et scores conformes au plan, avec
`secteur : Beauté, cosmétique et parfumerie` parmi les termes justificatifs ; les listes Visa
et Mastercard sont identiques au caractère près et sont bien deux objets distincts
(`resultats-vague3-back.md`, CAS-MCC-01 et 02). Le passage de six à cinq propositions est
l'effet voulu du correctif : la sixième ne portait aucune justification. Un balayage de
1 120 profils à l'écran et de 280 éléments en API n'a produit aucun score hors de l'intervalle
1–99 ni aucune rupture de tri (CAS-MCC-12). Une activité non reconnue rend **une seule**
carte, `5999`, à 10 %, portant le terme « aucune correspondance : code de repli » (CAS-MCC-11,
divergence D4 close). La sélection par réseau se comporte comme décrit, les deux champs de
code restant en lecture seule (CAS-DEM-14), et un code trouvé par la recherche manuelle est
sélectionnable et repris au récapitulatif (CAS-DEM-12). Une réponse en erreur du moteur
produit un bandeau « Propositions indisponibles », jamais une liste vide muette
(CAS-ERGO-12).

**Vérification faite par l'agent 7 en vague 4.** Les cas CAS-MCC-04 et CAS-MCC-05 avaient été
déclarés **bloqués** en vagues 2 et 3, les jeux de données JD-04 et JD-06 étant réputés absents
du plan. Ils ne le sont plus : le § 4 du plan, qui les définit, a été déposé le 2026-09-21 à
16 h 10 (commit `2d48118`), c'est-à-dire après le début de l'exécution de la vague 2 mais
avant la vague 3. Les deux cas ont donc été joués ici, contre l'API de démonstration, avec le
jeu exact du plan :

- **CAS-MCC-04** (JD-04, logiciels en téléchargement avec abonnement) rend
  `5734:78, 5817:75, 4816:73, 7372:73, 4899:67, 5815:61` — **l'ordre et les six scores
  attendus par le plan, à l'unité près** ; `5734, 5817, 4816, 7372` portent bien
  `livraison numérique` et `5817, 4816, 4899` portent `vente par abonnement`. Parité Visa /
  Mastercard vérifiée. **Statut : conforme**, alors que les deux vagues précédentes le
  déclaraient bloqué sur une reconstitution approximative.
- **CAS-MCC-05** (JD-06, place de marché) rend, avec `isMarketplace: true`, `5262` en rang 1
  à **90 %** avec `place de marche` parmi les termes justificatifs : conforme au plan. Avec
  `isMarketplace: false`, `5262` **reste en rang 1**, à 84 % (score brut 188,5 → 118,5). Le
  plan exige qu'il soit déclassé. **Statut : non conforme** sur cette seconde partie.

**Statut : conforme avec réserve** — la réserve étant CAS-MCC-05 (§ 5.3, DEF-A7-01).

---

### SC-06 — Refus des codes interdits ou retirés du référentiel

**Acteur** : agent, puis banquier.
**Préconditions** : référentiel contenant 12 codes `INTERDIT`.
**Cas rattachés** : CAS-MCC-06, 07, 08, 09, 10, 15, CAS-INDEX-10.

**Enchaînement**
1. L'agent décrit une activité de jeux d'argent, puis de crypto-actifs, puis d'armes.
2. Il tente de forcer un code interdit à la création, à la modification et à l'arbitrage.
3. L'administrateur désactive un code ; l'agent tente de le retenir.

**Résultat attendu** : aucun code interdit n'est jamais proposé ; un code interdit forcé par
l'API est refusé en 400 avec un message nommant le code et son libellé ; un code désactivé
disparaît des propositions sans redémarrage et n'est plus sélectionnable.

**Résultat observé** : conforme. Sur 120 propositions (trois descriptifs à risque × 20 codes ×
deux réseaux), **zéro** code `INTERDIT` et aucun des douze codes de la liste (CAS-MCC-06).
Les trois points d'entrée rendent 400 avec le libellé du code :
« Le MCC 7995 (Paris, loteries et jeux de hasard) n'est pas éligible… » à la création,
« Le MCC 5967 (Contenus et services pour adultes)… » à la modification et à l'arbitrage
(CAS-MCC-07) — c'est le cas classé n° 3 des priorités du plan. Un code désactivé rend 404 en
lecture agent, disparaît des deux listes, et sa sélection forcée rend 400
« Le MCC 5942 (Librairies) a été désactivé dans le référentiel. » ; l'administrateur le voit
toujours avec `active: false`, et la base n'en garde qu'une ligne (CAS-MCC-08). Le changement
de niveau de vigilance prend effet sans redémarrage, dans les deux sens (CAS-INDEX-10).

**Statut : conforme.**

---

### SC-07 — Soumission de la demande au banquier

**Acteur** : agent auteur de la demande.
**Préconditions** : demande au statut brouillon, un code Visa et un code Mastercard retenus.
**Cas rattachés** : CAS-WF-01, CAS-WF-02, CAS-WF-03, CAS-WF-12, CAS-WF-14, CAS-DEM-11.

**Enchaînement**
1. L'agent soumet sans avoir retenu de code.
2. Il retient les deux codes et soumet.
3. Il tente de modifier la demande une fois soumise.
4. Deux soumissions partent en même temps.

**Résultat attendu** : soumission refusée sans les deux codes ; à la soumission, le statut
passe à « soumise », la date est posée, et les propositions du moteur sont **figées** pour que
le banquier voie ce que l'agent a vu ; la demande n'est plus modifiable par l'agent ; deux
soumissions simultanées n'en produisent qu'une.

**Résultat observé** : conforme. Sans code, 400 « Un MCC Visa et un MCC Mastercard doivent
être proposés avant la soumission. » et statut inchangé ; à la soumission, `SOUMISE`,
`submittedAt` renseigné, décideur à `null`, un événement `SOUMISSION` portant les deux codes,
et six lignes de propositions figées par réseau (CAS-WF-01, CAS-WF-02). Toute modification
ultérieure rend 409 « Une demande au statut SOUMISE n'est plus modifiable par l'agent. » et
le nom du site reste intact (CAS-WF-03). Cinq soumissions lancées en parallèle donnent un
seul 200 et quatre 409 « Cette demande vient d'être soumise par ailleurs. », un seul événement
et douze lignes toutes distinctes (CAS-WF-12, rejoué en vague 3). La photographie est
réellement figée : après modification du libellé et des mots-clés du code `5977` par
l'administrateur, les codes, rangs, scores **et termes justificatifs** enregistrés restent
identiques, tandis qu'une demande créée après la modification reflète le nouveau classement
(CAS-WF-14). À l'écran, le récapitulatif affiche « La soumission exige : MCC Visa et MCC
Mastercard. » et les deux lignes à `—` tant que les codes manquent (CAS-DEM-11).

**Statut : conforme.**

**Réserve** : `CAS-WF-15` — « la photographie précédente est remplacée, pas cumulée » à la
re-soumission — **n'a jamais été exécuté**. Le comportement observé en SC-10 (une seule ligne
par couple réseau/rang) le rend probable, sans l'établir.

---

### SC-08 — Décision du banquier : validation

**Acteur** : banquier de la même banque que l'agent.
**Préconditions** : demande au statut soumise.
**Cas rattachés** : CAS-WF-04, CAS-WF-05, CAS-WF-07, CAS-WF-11, CAS-WF-13, CAS-ERGO-03,
CAS-ERGO-10.

**Enchaînement**
1. Le banquier ouvre la demande et consulte les propositions figées ainsi que la
   justification de l'agent.
2. Il valide sans toucher aux codes.
3. Sur une autre demande, il substitue un autre code pour chaque réseau, puis valide.
4. Il tente de valider une demande dont les codes ont disparu, puis une demande au brouillon.
5. Deux décisions partent en même temps.

**Résultat attendu** : validation en 200 avec les codes retenus, la date et le nom du
décideur ; l'événement journalisé distingue une validation conforme d'une validation avec
substitution ; une validation sans code est refusée ; seule une demande soumise est arbitrable ;
deux décisions simultanées n'en retiennent qu'une.

**Résultat observé** : conforme. Validation sans modification : 200, `VALIDEE`, codes retenus
égaux aux codes proposés, décideur et date renseignés, événement `VALIDATION` dont les codes
proposés égalent les codes retenus (CAS-WF-04). Avec substitution : codes retenus `5912` et
`5999`, propositions intactes à `5977`, événement `VALIDATION_AVEC_MODIFICATION` portant les
deux jeux (CAS-WF-05). Sans code, 400 « La validation exige un MCC Visa et un MCC
Mastercard. » et statut conservé (CAS-WF-07). Sur un brouillon, 409
« Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : BROUILLON). »
(CAS-WF-11). Quatre décisions en parallèle : un 200, trois 409
« Cette demande vient d'être arbitrée par ailleurs. », exactement un événement de décision
(CAS-WF-13, rejoué en vague 3) — c'est le cas classé n° 4 des priorités du plan. À l'écran,
les boutons passent à l'état désactivé pendant l'appel et un seul événement est produit
(CAS-ERGO-03), et la fiche présente côte à côte « proposé par l'agent » et « retenu », avec la
mention explicite d'une modification et la carte des propositions du moteur consultable
(CAS-ERGO-10).

**Statut : conforme.**

---

### SC-09 — Décision du banquier : rejet et demande de complément

**Acteur** : banquier.
**Préconditions** : demande au statut soumise.
**Cas rattachés** : CAS-WF-06, CAS-WF-09, CAS-WF-10, CAS-HAB-02.

**Enchaînement**
1. Le banquier rejette sans saisir de commentaire, puis demande un complément sans commentaire.
2. Il rejette avec motif.
3. Il tente d'arbitrer de nouveau une demande déjà rejetée ou déjà validée.
4. L'agent auteur ouvre la demande rejetée.

**Résultat attendu** : commentaire obligatoire pour un rejet comme pour une demande de
complément ; le motif est conservé et restitué ; une demande déjà arbitrée ne l'est pas deux
fois ; l'agent voit le motif mais aucune commande d'écriture.

**Résultat observé** : conforme. Trois tentatives sans commentaire, chaîne vide comprise,
rendent 400 « Un commentaire est obligatoire pour un rejet ou une demande de complément. » ;
le rejet motivé rend 200, `REJETEE`, commentaire conservé et codes retenus à `null`
(CAS-WF-06). Une demande rejetée ou validée rend 409 avec son statut courant
(CAS-WF-09, CAS-WF-10). À l'écran, l'agent voit « Demande rejetée » et le motif, sans aucun
bouton d'écriture, et la carte d'arbitrage ainsi que le champ commentaire sont **absents du
DOM**, pas seulement masqués (CAS-HAB-02, CAS-WF-09 front).

**Statut : conforme.** Le défaut de vague 2 — message d'erreur affiché deux fois
(`DEF-A2-03`) — est corrigé et vérifié par reproduction : une seule restitution de l'erreur,
la seconde occurrence du texte étant l'aide statique présente avant le clic
(`resultats-vague3-front.md`, DEF-A2-03).

---

### SC-10 — Reprise après demande de complément et re-soumission

**Acteur** : banquier, puis agent auteur.
**Préconditions** : demande soumise.
**Cas rattachés** : CAS-WF-08, CAS-ERGO-09, CAS-HAB-09.

**Enchaînement**
1. Le banquier renvoie la demande pour complément, avec commentaire.
2. L'agent rouvre la demande, la modifie et la re-soumet.
3. Le banquier valide, en substituant les codes.
4. L'agent consulte le journal de la demande.

**Résultat attendu** : la demande redevient modifiable au statut « complément requis » ; à la
re-soumission, le commentaire, la date et le nom du précédent décideur sont effacés ; le
journal restitue toute la séquence, nominativement et dans l'ordre.

**Résultat observé** : conforme. Les quatre statuts s'enchaînent correctement ; à la
re-soumission, `decisionComment`, `decidedAt` et `decidedBy` repassent à `null` ; le journal
rend `CREATION, SOUMISSION, COMPLEMENT_REQUIS, MODIFICATION, SOUMISSION, VALIDATION` dans
l'ordre, nominatif et horodaté (`resultats-vague2-back.md`, CAS-WF-08). Le parcours complet a
été rejoué de bout en bout à l'écran en vague 3, sur la demande AFF-2026-00028 : chaque
transition aboutit, le statut suit `Brouillon → Soumise → Complément requis → Soumise →
Validée`, et le journal affiche neuf entrées, chacune avec son libellé français, le nom et le
rôle de l'auteur, la date, et les commentaires du banquier entre guillemets
(`resultats-vague3-front.md`, § 3). Point important : la neutralisation du formulaire en
lecture seule **ne bloque pas** l'édition légitime — au statut « complément requis », le
formulaire est saisissable et enregistrable.

**Statut : conforme.**

**Réserve** : `CAS-HAB-09` — consultation d'une demande non modifiable — a connu deux
corrections successives. Le formulaire est bien inerte en lecture seule
(`DEF-A2-01` corrigé, vérifié par clic, saisie forcée et prise de focus, toutes sans effet) ;
l'effet de bord qui rendait « Précédent », « Suivant » et « Voir la demande » inutilisables
(`DEF-A5-01`) a été corrigé en vague 3 en descendant l'attribut sur un conteneur qui
n'enveloppe que les champs (vérifié par lecture de `web/src/pages/RequestFormPage.jsx`,
ligne 255). **Ce dernier correctif n'a pas été revérifié à l'écran** : aucune vague de
retest front n'a suivi (§ 5.2).

---

### SC-11 — Cloisonnement entre banques et séparation des rôles

**Acteur** : agent BQ001, agent BQ002, banquier BQ001, administrateur.
**Préconditions** : deux banques actives, une demande appartenant à BQ001.
**Cas rattachés** : CAS-HAB-01 à 07, CAS-HAB-10, CAS-AUTH-08, CAS-AUTH-09, CAS-ROB-10.

**Enchaînement**
1. Un banquier tente de saisir, de modifier et de soumettre une demande.
2. Un agent tente d'arbitrer.
3. Un agent et un banquier tentent d'atteindre les cinq routes d'administration.
4. L'agent de BQ002 tente de lire, de modifier, de soumettre et de consulter les événements
   d'une demande de BQ001, par l'API puis par URL forcée.
5. Un agent tente de modifier la demande d'un collègue de sa propre banque.
6. Un agent est muté d'une banque à l'autre pendant que son jeton est valide.

**Résultat attendu** : chaque refus est rendu par l'API, pas seulement par l'écran ; le
cloisonnement porte sur toutes les routes, y compris les événements et les propositions ;
aucune donnée de l'autre banque ne parvient au navigateur.

**Résultat observé** : conforme. Banquier qui saisit : trois fois 403
« Action réservée aux profils : AGENT » ; agent qui arbitre : 403 « … : BANQUIER » ; dix
appels sur cinq routes d'administration par deux rôles : dix fois 403 « … : ADMIN »
(CAS-HAB-01, 02, 03). Quatre appels croisés entre banques : quatre fois 403
« Cette demande appartient à une autre banque. », et la liste de l'agent de BQ002 ne contient
aucune demande de BQ001 (CAS-HAB-04) — c'est le cas classé n° 2 des priorités du plan. Un
agent qui modifie la demande d'un collègue reçoit 403 « Vous ne pouvez modifier que les
demandes que vous avez saisies. » et la base reste intacte (CAS-HAB-06). La mutation de banque
prend effet **sur le jeton en cours** : le même jeton passe de 200 à 403 (CAS-AUTH-08), et un
changement de rôle s'applique de même sans reconnexion (CAS-AUTH-09). À l'écran, l'agent de
BQ002 ne voit qu'un bandeau « Cette demande appartient à une autre banque. » et **aucune donnée
de BQ001 n'est présente dans le DOM** — ni raison sociale, ni RNE, ni adresse électronique du
contact (CAS-HAB-04 front). Les caractères jokers `%` et `_` en recherche ne remontent que les
demandes de la banque de l'appelant (CAS-ROB-10).

**Statut : conforme.**

**Divergence assumée D6** (`CAS-HAB-05`) : le profil administrateur franchit toutes les
séparations de fonction — sa liste contient les demandes des deux banques, il enchaîne
création, soumission et arbitrage avec le même compte, et les compteurs agrègent toutes les
banques. C'est le comportement décrit par le README comme un point ouvert, confirmé en
exécution ; il est consigné, non corrigé, et correspond au constat de revue `C-10`. Pour un
usage bancaire, un profil capable de créer **et** d'arbitrer un dossier est une entorse à la
séparation des tâches : à trancher par le commanditaire (§ 7).

---

### SC-12 — Administration des comptes et des banques

**Acteur** : administrateur.
**Cas rattachés** : CAS-ADM-01 à 13, CAS-AUTH-06, CAS-AUTH-07, CAS-ROB-09.

**Enchaînement** : création de comptes, rattachement à une banque, modification de rôle et de
banque, désactivation, tentative d'auto-rétrogradation, création et désactivation de banques.

**Résultat attendu** : politique de mot de passe appliquée ; adresse unique ; un administrateur
ne peut ni changer son propre rôle ni se désactiver ; la plateforme conserve toujours au moins
un administrateur actif, y compris quand deux administrateurs se rétrogradent en même temps ;
une banque comptant des comptes actifs n'est pas désactivable ; chaque action est journalisée
avec les champs modifiés.

**Résultat observé** : conforme. Adresse déjà utilisée : 409 avec un message nommant l'adresse,
casse indifférente (CAS-ADM-04). Banque inconnue ou désactivée : 400 avec le motif
(CAS-ADM-05). Modification : 200 et une entrée `admin_events` `MODIFICATION` portant la liste
exacte des champs touchés (CAS-ADM-06). Auto-rétrogradation et auto-désactivation : 403 dans
les deux cas, y compris après création d'un second administrateur (CAS-ADM-08, CAS-ADM-09).
Deux administrateurs qui se rétrogradent en parallèle : un 200 et un 409
« Impossible : la plateforme doit conserver au moins un administrateur actif. », aucun 500,
aucun interblocage, exactement un administrateur survivant (CAS-ADM-10). Création de banque :
201 avec le code mis en majuscules, 409 sur doublon, et les compteurs de comptes et de demandes
de la liste strictement égaux aux dénombrements en base (CAS-ADM-12). Banque avec comptes
actifs : 409 nommant le nombre exact, puis désactivation possible une fois les comptes
désactivés (CAS-ADM-13).

**Statut : conforme.**

**Réserve** : la validation du champ « Banque » du formulaire de création de compte est
déléguée à la bulle native du navigateur, là où le reste du produit rend ses erreurs dans un
bandeau. Écart d'homogénéité relevé par l'agent 5, hors périmètre des cas du plan, non corrigé.

---

### SC-13 — Administration du référentiel MCC et effet immédiat sur le moteur

**Acteur** : administrateur, puis agent.
**Cas rattachés** : CAS-ADM-14 à 20, CAS-INDEX-01 à 10, CAS-MCC-15.

**Enchaînement**
1. L'administrateur consulte le référentiel, y compris les codes interdits et désactivés.
2. Il modifie le libellé, la note et le niveau de vigilance d'un code, avec un commentaire.
3. Il ajoute un code absent du manuel, puis le rattache à un secteur, puis lui saisit des
   mots-clés métier.
4. Un agent obtient immédiatement des propositions qui tiennent compte de ces modifications.
5. L'administrateur consulte l'historique du code et le journal d'administration.

**Résultat attendu** : toute écriture est historisée avec le commentaire, l'auteur, les champs
touchés et les valeurs avant et après ; l'effet sur le moteur est immédiat, sans redémarrage ;
les mots-clés sont dérivés automatiquement du libellé et de la description ; un secteur inconnu
est refusé et la transaction annulée.

**Résultat observé** : conforme. La vue administrateur rend `total = 279` et `actifs = 278`
après une désactivation, avec les douze codes interdits présents (CAS-ADM-14). La modification
de trois champs produit une entrée d'historique `MODIFICATION` portant le commentaire de
conformité, le nom de l'auteur, la liste exacte des champs et les valeurs avant et après
(CAS-ADM-15) ; une désactivation suivie d'une réactivation produit bien `DESACTIVATION` puis
`REACTIVATION`, et non deux `MODIFICATION` (CAS-ADM-16). Un code ajouté est **proposé dès
l'appel suivant**, dans les deux réseaux, avec ses termes justificatifs (CAS-INDEX-01) ; ses
mots-clés dérivés comptent dix-sept entrées, bigrammes et variantes singulier/pluriel comprises,
sans aucun mot vide (CAS-INDEX-02) ; le singulier retrouve un libellé écrit au pluriel
(CAS-INDEX-03) ; un secteur inconnu rend 400 et la transaction est annulée — le code n'existe
pas (CAS-INDEX-07) ; les vingt-sept secteurs sont servis depuis la base et une désactivation de
secteur est prise en compte (CAS-INDEX-09). Un code désactivé disparaît des propositions sans
redémarrage et revient à la réactivation (CAS-MCC-15). Le journal d'administration présente les
actions du plus récent au plus ancien, avec entité, identifiant, action, auteur et date
(CAS-ADM-21). L'amorçage de la base ne réécrit pas les ajustements de conformité (CAS-ADM-22).

**Statut : conforme.**

**Réserve** : la divergence **D1** subsiste pour partie. Sa conséquence dommageable — un code
modifié était silencieusement relégué en fin de priorité de son secteur, soit jusqu'à
36 points perdus au moteur — est corrigée et vérifiée : les rangs sont inchangés après
modification, et un nouveau rattachement prend la fin de file et y reste
(`resultats-vague3-back.md`, C-14). En revanche, la promesse du code selon laquelle « le rang
suit l'ordre fourni » n'est toujours pas tenue : un nouveau rattachement est ajouté en queue,
jamais à la position demandée. Écart de documentation, sans effet fonctionnel constaté.

---

### SC-14 — Import d'une nouvelle édition du référentiel : simulation puis application

**Acteur** : administrateur.
**Préconditions** : référentiel à 279 codes.
**Cas rattachés** : CAS-IMPORT-01, 02, 03, 11, 12, 13, 15, 16, CAS-ERGO-11, CAS-ROB-01,
CAS-ROB-02.

**Enchaînement**
1. L'administrateur exporte le référentiel en Excel ou en CSV.
2. Il modifie le fichier hors ligne et le recharge.
3. La plateforme affiche un **rapport d'écart** : codes ajoutés, modifiés, inchangés, absents
   du fichier, lignes écartées avec leur motif — **sans rien écrire**.
4. Il clique sur « Appliquer l'import », confirme une seconde fois, et les écarts sont écrits.

**Résultat attendu** : l'export est relisible sans perte ; la simulation ne modifie rien ; rien
n'est écrit sans confirmation explicite ; la désactivation des codes absents du fichier est
strictement optionnelle et décochée par défaut ; les anomalies portent leur numéro de ligne ;
l'import est réservé à l'administrateur.

**Résultat observé** : conforme sur ce qui a été joué. L'export rend les bons types de contenu
et le bon nom de fichier dans les deux formats ; l'aller-retour rend `lignesLues = 279`,
`entrees = 279`, aucune anomalie et un bilan `0 ajouté, 0 modifié, 279 inchangés, 0 retiré,
non appliqué` (CAS-IMPORT-01, 02, 03). Un fichier ne modifiant que le rattachement sectoriel
d'un code existant est désormais classé en « modifié » avec les valeurs avant et après, là où
la vague 2 le classait « inchangé » sans rien écrire — divergence **D2** close. L'export porte
désormais **tous** les secteurs d'un code et l'aller-retour ne les perd plus — divergence
**D3** close (`resultats-vague3-back.md`). Les fichiers invalides sont refusés en 400 avec cinq
messages exploitables, le référentiel restant à 279 codes, et l'export comme l'import rendent
403 pour un agent ou un banquier (CAS-IMPORT-13, 15, 16). À l'écran, la simulation affiche le
bandeau « Simulation — aucune donnée modifiée », les quatre compteurs, la case
« Désactiver les codes absents du fichier » **décochée par défaut**, la liste des lignes
écartées avec leur motif et leur numéro, et le clic sur « Appliquer » ouvre une seconde
confirmation nommant le nombre d'écritures ; l'opération n'ayant pas été confirmée, **aucune
écriture n'a eu lieu** (CAS-ERGO-11). Enfin, `apply: "false"` et `deactivateMissing: "false"`
n'écrivent rien, et une valeur booléenne incompréhensible est refusée plutôt que devinée
(CAS-ROB-01, CAS-ROB-02).

**Statut : conforme avec réserve.** Sept cas de ce domaine n'ont **jamais été exécutés**
(§ 2.2 C), dont quatre bloquants. C'est la première réserve du § 1.

**Défaut corrigé en dernière vague** : `DEF-A6-02`. L'aller-retour complet
« exporter → relire → appliquer » échouait en 400 sur le référentiel livré, sans aucune
modification de l'administrateur : le code `5817` porte deux secteurs dont la concaténation
fait 42 caractères, au-delà de la borne de 40 posée sur la colonne. Le défaut traversait la
simulation — le rapport d'écart était propre — et n'échouait qu'à l'application confirmée.
La borne est portée à 400 caractères et le cycle complet est désormais couvert par deux tests
automatisés en Excel et en CSV (`corrections-vague3.md` ; `server/tests/vague3.test.js`).
Ce correctif n'a pas été revérifié par un agent de recette indépendant (§ 5.2).

---

### SC-15 — Journal d'audit

**Acteur** : agent, banquier, administrateur, contrôle interne.
**Cas rattachés** : CAS-WF-08, CAS-ERGO-09, CAS-ADM-15, CAS-ADM-16, CAS-ADM-21, CAS-DEM-07.

**Enchaînement** : parcourir une demande de bout en bout, puis consulter son journal ; modifier
un code du référentiel, puis consulter son historique ; consulter le journal d'administration.

**Résultat attendu** : chaque action métier laisse une trace nominative et horodatée ; les
modifications nomment les champs touchés ; l'historique d'un code porte les valeurs avant et
après ainsi que le commentaire justificatif.

**Résultat observé** : conforme sur le périmètre testé. Le journal d'une demande rend la
séquence complète dans l'ordre, chaque ligne portant son libellé français, le nom et le rôle
de l'auteur, la date à la minute, et le commentaire du banquier entre guillemets
(CAS-WF-08, CAS-ERGO-09). Une modification de demande journalise la liste exacte des champs
modifiés (CAS-DEM-07). L'historique d'un code MCC porte le commentaire, l'auteur, la liste
exacte des champs et les valeurs avant et après (CAS-ADM-15). Le journal d'administration
présente les actions les plus récentes en tête, avec entité, identifiant, action, auteur et
date, et résiste aux paramètres de pagination hostiles (CAS-ADM-21).

**Statut : conforme avec réserve.** Trois limites subsistent, toutes issues de la revue de
code et **jamais confirmées ni infirmées en exécution** :

- `C-05` — un changement de mot de passe **par l'utilisateur lui-même** ne laisse aucune trace.
  Vérifié par lecture : `server/src/services/admin.js` ne journalise pas cette action.
- `C-06` — le journal d'administration des comptes enregistre les **noms** des champs modifiés,
  pas leurs valeurs. Un contrôle interne qui demande « qui a donné ce droit, et quelle était la
  valeur d'avant ? » n'obtient pas la réponse pour les comptes, alors qu'il l'obtient pour les
  codes MCC.
- `C-24` — le journal d'administration ne se consulte qu'au travers des 500 dernières lignes,
  sans pagination au-delà.

---

### SC-16 — Résilience du référentiel et contrôle de santé

**Acteur** : exploitant, répartiteur de charge.
**Cas rattachés** : CAS-AUTH-05, constats de revue `C-12` et `C-13`.

**Enchaînement** : provoquer une panne de la base pendant que l'API tourne, observer le
contrôle de santé et les routes métier, puis rétablir la base.

**Résultat attendu** : l'API ne se fige pas définitivement ; le contrôle de santé dit la
vérité ; le rétablissement est automatique.

**Résultat observé** : conforme après deux corrections successives. La panne a été simulée en
renommant la table du référentiel. Premier point, corrigé dès la vague 1 et vérifié en vague 3 :
dès la table rétablie, les routes repassent en 200 **sans redémarrage** — la promesse rejetée
n'est plus mémorisée. Second point, ouvert en vague 3 sous `DEF-A6-04` : le contrôle de santé
répondait `200 {"referentiel":"charge"}` alors que **toutes** les routes métier rendaient 500,
parce qu'il s'appuyait sur « un catalogue a été chargé une fois ». Le répartiteur de charge
continuait donc d'envoyer du trafic à une instance fonctionnellement morte. Le correctif de la
vague 3 fait mémoriser l'issue du **dernier** chargement et sonder réellement la base à chaque
appel, avec trois états distincts : `200 ok`, `503 degraded / referentiel: perime` quand le
cache est en place mais le dernier rechargement en échec, `503 degraded / referentiel:
indisponible` quand aucun catalogue n'a jamais été chargé. Le cache n'est pas vidé sur échec :
servir une photo périmée reste préférable à ne rien servir, mais l'instance s'annonce dégradée
(`corrections-vague3.md`). Deux tests automatisés couvrent ces états.

**Statut : conforme.**

**Réserve** : `C-13` — après une coupure de la connexion qui écoute les modifications du
référentiel, rien ne planifie de réabonnement. Le gestionnaire d'erreur remet bien le
descripteur d'écoute à zéro, ce qui autorise un réabonnement ultérieur, mais aucun mécanisme
ne le déclenche. Constat de revue **jamais confirmé ni infirmé en exécution** ; combiné à
l'exclusion « propagation entre plusieurs instances » du § 2.2, c'est le point le moins couvert
de la campagne sur le plan de l'exploitation.

---

## 4. Critères d'acceptation

Chaque critère est formulé de sorte qu'il puisse être vérifié sans appréciation : un code
HTTP, un message exact, un état en base, un élément d'écran nommé, une mesure. Le statut
**non vérifié** signifie qu'aucune exécution de la campagne ne l'établit — ce n'est ni un
succès ni un échec, c'est une absence de preuve.

Statuts : **satisfait** · **non satisfait** · **non vérifié**.

### 4.1 Fonctionnel

| Id | Énoncé vérifiable | Méthode de vérification | Statut | Preuve |
| --- | --- | --- | --- | --- |
| CA-F-01 | Une demande ne peut pas être soumise sans un code Visa **et** un code Mastercard retenus : l'API rend 400 et le statut reste « brouillon ». | Appel API et lecture du statut en base ; clic sur « Soumettre » à l'écran. | satisfait | CAS-WF-02 (vague 2 back et front) ; test automatisé « la soumission exige un MCC Visa et un MCC Mastercard ». |
| CA-F-02 | Aucun code de niveau `INTERDIT` n'apparaît dans une réponse du moteur, quel que soit le descriptif. | 3 descriptifs à risque × 20 propositions × 2 réseaux = 120 propositions, contrôle du niveau de chaque élément. | satisfait | CAS-MCC-06 : zéro code interdit sur 120 propositions ; test « aucun MCC interdit n'est jamais proposé automatiquement ». |
| CA-F-03 | Un code `INTERDIT` forcé par l'API est refusé en 400 sur les **trois** points d'entrée (création, modification, arbitrage), avec un message nommant le code et son libellé. | Trois appels API avec un code interdit. | satisfait | CAS-MCC-07 : « Le MCC 7995 (Paris, loteries et jeux de hasard) n'est pas éligible… » à la création, « Le MCC 5967… » à la modification et à l'arbitrage. |
| CA-F-04 | **Toute proposition servie par le moteur porte au moins un terme justificatif** (`matchedTerms` non vide) ; à défaut, le code n'est pas proposé. | Balayage de profils variés sur les deux réseaux, contrôle de la longueur de la liste de termes pour chaque proposition. | satisfait | Balayage de 1 120 profils (vague 3 front) puis, après le correctif final, 11 profils de formes différentes et invariant posé en dur dans `server/src/services/mccSuggestion.js` ligne 143 ; test « aucune proposition n'est servie sans terme justificatif ». Vérifié de nouveau en vague 4 : 12 propositions sur JD-04 et JD-06, toutes justifiées. |
| CA-F-05 | Un descriptif qu'aucun terme ne reconnaît renvoie **une seule** proposition, le code de repli `5999`, annoncée comme telle — jamais une liste vide. | Appel API avec un descriptif sans terme métier. | satisfait | CAS-MCC-11 : une carte `5999`, score 10, terme « aucune correspondance : code de repli », sur les deux réseaux. Divergence D4 close. |
| CA-F-06 | Les listes Visa et Mastercard sont identiques dans leur contenu et sont deux objets distincts, modifiables indépendamment. | Comparaison des deux listes sérialisées et de leur identité en mémoire. | satisfait | CAS-MCC-02 (vagues 2 et 3) ; vérifié de nouveau en vague 4 sur JD-04. |
| CA-F-07 | Tout score de pertinence est compris entre 1 et 99 inclus, et les propositions sont triées par score décroissant sans rupture. | Balayage multi-profils, contrôle de chaque score et de l'ordre. | satisfait | CAS-MCC-12 : 280 éléments, zéro score hors intervalle, aucune rupture de tri. |
| CA-F-08 | Sur les jeux de référence du plan (§ 4.3), l'ordre et les scores des propositions sont reproduits à l'unité près sur un référentiel intact. | Appel API avec le jeu exact, comparaison au tableau du plan. | satisfait pour JD-01 et JD-04 ; **non vérifié** pour JD-02, JD-03, JD-05, JD-07, JD-08, JD-09 | JD-01 : CAS-MCC-01 (vague 3). JD-04 : vérifié en vague 4, `5734:78, 5817:75, 4816:73, 7372:73, 4899:67, 5815:61`. Les six autres jeux n'ont jamais été joués. JD-10 : l'attente du plan est **caduque** depuis le correctif du repli (voir CA-F-05). |
| CA-F-09 | Avec `isMarketplace` à faux, le code `5262` n'est plus en rang 1 (pénalité de −25). | Deux appels API sur le jeu JD-06, l'un avec le drapeau, l'autre sans. | **non satisfait** | Vérifié en vague 4 : `5262` reste rang 1, à 84 % au lieu de 90 % (score brut 188,5 → 118,5). La pénalité s'applique au score brut et ne suffit pas à déclasser. Voir DEF-A7-01 (§ 5.3). |
| CA-F-10 | Une demande soumise n'est plus modifiable par l'agent : l'API rend 409 et la base est inchangée. | Deux appels API sur une demande soumise, relecture en base. | satisfait | CAS-WF-03 : 2 × 409 « Une demande au statut SOUMISE n'est plus modifiable par l'agent. », nom du site intact. |
| CA-F-11 | Seule une demande au statut « soumise » peut être arbitrée : tout autre statut rend 409 en nommant le statut courant. | Arbitrage tenté sur brouillon, rejetée, validée. | satisfait | CAS-WF-09, CAS-WF-10, CAS-WF-11 : « Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : …). » |
| CA-F-12 | Un rejet ou une demande de complément sans commentaire est refusé en 400, chaîne vide comprise, et le statut ne change pas. | Trois appels API, dont un à commentaire vide. | satisfait | CAS-WF-06 : 3 × 400 « Un commentaire est obligatoire pour un rejet ou une demande de complément. » |
| CA-F-13 | À la soumission, les propositions du moteur sont figées : elles restent identiques — codes, rangs, scores et termes justificatifs — même après modification du référentiel. | Soumission, modification d'un code par l'administrateur, relecture de la photographie. | satisfait | CAS-WF-14 : photographie strictement identique avant et après ; une demande créée ensuite reflète bien le nouveau classement. |
| CA-F-14 | À la re-soumission après complément, le commentaire, la date et le nom du précédent décideur sont remis à zéro. | Cycle complet, relecture des colonnes. | satisfait | CAS-WF-08 : `decisionComment`, `decidedAt`, `decidedBy` repassent à `null`. |
| CA-F-15 | Un import en mode simulation n'écrit rien dans le référentiel. | Appel `apply: false`, dénombrement avant et après. | satisfait | CAS-ROB-01 : `resume.applique = false`, zéro code inactif avant et après ; CAS-ERGO-11 à l'écran ; test « l'import produit un rapport d'écart sans rien modifier ». **Le cas dédié du plan, CAS-IMPORT-08, n'a pas été exécuté.** |
| CA-F-16 | La désactivation des codes absents du fichier importé est optionnelle et décochée par défaut. | Lecture de l'écran d'import, puis appel avec `deactivateMissing: "false"`. | satisfait | CAS-ERGO-11 : case `case-desactiverAbsents` décochée par défaut ; CAS-ROB-01 : `desactivationDesRetires: false`, zéro code désactivé. **Le cas dédié CAS-IMPORT-10 n'a pas été exécuté.** |
| CA-F-17 | Le cycle « exporter → relire → appliquer » sur le référentiel livré, sans aucune modification, rend 279 codes inchangés, 0 ajouté, 0 modifié, 0 retiré, en Excel comme en CSV. | Cycle complet en API dans les deux formats. | satisfait | Corrigé en vague 3 (DEF-A6-02) ; couvert par deux tests automatisés dans `server/tests/vague3.test.js`. |
| CA-F-18 | Les anomalies d'un fichier importé sont signalées avec leur numéro de ligne, et la ligne fautive est écartée sans bloquer les autres. | Import d'un fichier comportant une ligne invalide. | **non vérifié** | `CAS-IMPORT-06` (bloquant) jamais exécuté. Élément convergent seulement : CAS-ERGO-11 montre « 1 ligne écartée avec motif et numéro de ligne » à l'écran, et un test automatisé porte sur un fichier désordonné. |
| CA-F-19 | Un code ajouté ou modifié au référentiel est pris en compte par le moteur dès l'appel suivant, sans redémarrage. | Écriture puis appel immédiat au moteur. | satisfait | CAS-INDEX-01, CAS-INDEX-08, CAS-INDEX-10, CAS-MCC-15 : effet immédiat constaté dans les deux sens. |
| CA-F-20 | La plateforme conserve toujours au moins un administrateur actif, y compris sous deux rétrogradations simultanées. | Deux appels en parallèle, dénombrement en base. | satisfait | CAS-ADM-10 : un 200, un 409 « Impossible : la plateforme doit conserver au moins un administrateur actif. », exactement un administrateur survivant, aucun interblocage. |

### 4.2 Traçabilité

| Id | Énoncé vérifiable | Méthode de vérification | Statut | Preuve |
| --- | --- | --- | --- | --- |
| CA-T-01 | Chaque transition d'une demande produit exactement un événement, nominatif et horodaté, lisible dans l'ordre chronologique. | Cycle complet, lecture du journal en API et à l'écran. | satisfait | CAS-WF-08, CAS-ERGO-09 : séquence `CREATION, SOUMISSION, COMPLEMENT_REQUIS, MODIFICATION, SOUMISSION, VALIDATION` avec nom, rôle et date ; test « le journal retrace chaque étape de manière nominative ». |
| CA-T-02 | Une validation qui substitue un code est journalisée différemment d'une validation conforme, et l'événement porte les codes proposés **et** les codes retenus. | Deux validations, lecture des événements. | satisfait | CAS-WF-04 (`VALIDATION`, proposés = retenus) et CAS-WF-05 (`VALIDATION_AVEC_MODIFICATION`, proposés `5977`, retenus `5912`/`5999`). |
| CA-T-03 | Deux actions concurrentes ne produisent jamais deux événements de décision sur la même demande. | Décisions lancées en parallèle, dénombrement des événements. | satisfait | CAS-WF-13 : exactement un événement de décision sur quatre appels simultanés. |
| CA-T-04 | Une modification du référentiel MCC est historisée avec le commentaire justificatif, l'auteur, la liste exacte des champs touchés et les valeurs avant et après. | Modification puis lecture de l'historique du code. | satisfait | CAS-ADM-15 : commentaire « Demande conformité 2026-09 », auteur, `champsModifies` exact, `avant` et `apres` renseignés. |
| CA-T-05 | Une désactivation et une réactivation de code sont journalisées sous leur nom propre, et non comme de simples modifications. | Désactivation puis réactivation, lecture de l'historique. | satisfait | CAS-ADM-16 : `REACTIVATION` puis `DESACTIVATION`, une seule ligne en base pour le code. |
| CA-T-06 | Une modification de compte est journalisée avec les **valeurs** avant et après, et pas seulement les noms des champs. | Modification de rôle ou de banque, lecture du journal d'administration. | **non satisfait** | Constat de revue `C-06`, non corrigé : le journal des comptes enregistre `payload.champs = ["lastName","role","bankId"]` sans les valeurs (CAS-ADM-06). L'historique des codes MCC, lui, les porte (CA-T-04). |
| CA-T-07 | Un changement de mot de passe **par l'utilisateur lui-même** laisse une trace. | Changement de mot de passe puis lecture du journal. | **non satisfait** | Constat de revue `C-05`, non corrigé, vérifié par lecture de `server/src/services/admin.js` : aucune écriture dans `admin_events` sur ce chemin. Jamais confirmé en exécution. |
| CA-T-08 | Le journal d'administration est consultable au-delà de ses 500 dernières entrées. | Pagination au-delà de 500 lignes. | **non satisfait** | Constat de revue `C-24`, non corrigé. CAS-ADM-21 confirme le plafond : `limit=9999` rend au plus 500. |
| CA-T-09 | L'horodatage des événements reflète l'ordre réel d'exécution, y compris sous écritures concurrentes. | 45 itérations de modification et soumission en parallèle, relecture de l'ordre du journal. | satisfait | Corrigé en vague 1 (passage à `clock_timestamp()`) ; vérifié en vague 3, C-02 : zéro cas où une modification est journalisée après une soumission qu'elle précède. |

### 4.3 Sécurité

| Id | Énoncé vérifiable | Méthode de vérification | Statut | Preuve |
| --- | --- | --- | --- | --- |
| CA-S-01 | Une banque n'accède à aucune donnée d'une autre banque : lecture, modification, soumission et consultation des événements rendent toutes 403, et le navigateur ne reçoit aucune donnée de l'autre banque. | Appels API croisés et URL forcée à l'écran, inspection du DOM. | satisfait | CAS-HAB-04 : 4 × 403 « Cette demande appartient à une autre banque. » ; à l'écran, zéro occurrence de la raison sociale, du RNE et de l'adresse du contact dans le DOM ; test « une demande reste invisible pour une autre banque ». |
| CA-S-02 | Les droits sont relus à chaque requête : une désactivation, une mutation de banque ou un changement de rôle s'appliquent au jeton déjà émis, sans reconnexion. | Modification du compte puis réutilisation du même jeton. | satisfait | CAS-AUTH-06, CAS-AUTH-08, CAS-AUTH-09 ; quatre tests automatisés « Cycle de vie des jetons : les droits sont relus, pas figés ». |
| CA-S-03 | Un jeton émis avant une réinitialisation du mot de passe est refusé, même si l'écart est inférieur à une seconde. | Réinitialisation 76 ms après l'émission du jeton, appel avec l'ancien jeton. | satisfait | Corrigé en vague 2 (`DEF-A3-02`), vérifié en vague 3 : 401 « Mot de passe modifié : reconnectez-vous » ; test « un jeton émis avant une réinitialisation est refusé, même à la seconde près ». |
| CA-S-04 | En production, l'API refuse de démarrer si `JWT_SECRET` est absent, vaut le secret publié dans le dépôt, ou compte moins de 32 caractères. | Trois démarrages en `NODE_ENV=production`. | satisfait | Corrigé en vague 3 (`DEF-A6-03`), après une première correction incomplète qui n'écartait que l'absence de variable ; test « la production refuse un secret faible ou laissé par défaut ». |
| CA-S-05 | Un message d'erreur d'authentification ne révèle pas si le compte existe. | Deux appels, compte inconnu et mot de passe faux, comparaison des corps. | satisfait | CAS-AUTH-02 : corps strictement identiques, `{"error":"Identifiants incorrects"}` ; un compte désactivé rend le même message générique (CAS-ADM-11). |
| CA-S-06 | Après dix tentatives de connexion erronées, la onzième est refusée en 429, y compris avec le bon mot de passe ; une connexion réussie remet le compteur à zéro. | Séquences de connexions sur une instance à la configuration par défaut. | satisfait | CAS-AUTH-15 et CAS-AUTH-16 (joués en vague 3) : 429 avec `Retry-After: 900` ; 9 × 401, 1 × 200, 9 × 401 sans aucun 429. |
| CA-S-07 | Une sollicitation de la route de connexion à corps invalide alimente le compteur de limitation. | Quinze envois à corps invalide, puis une tentative erronée. | **non satisfait** | CAS-AUTH-17, divergence D5 confirmée en vagues 2 et 3 : 15 × 400 puis 401, jamais 429. Impact faible — aucun mot de passe n'est essayé — mais le compteur n'est pas celui que décrit le README. |
| CA-S-08 | Aucune saisie ne permet d'injecter du SQL ni du script : les caractères jokers, les apostrophes et les balises sont traités comme du texte. | Saisies hostiles en recherche et dans les champs, inspection du HTML rendu. | satisfait | CAS-ROB-10 aux deux niveaux : aucune erreur SQL, `count = 0` sur `' OR '1'='1`, aucune boîte de dialogue, balise restituée littéralement ; les jokers ne franchissent pas le cloisonnement. |
| CA-S-09 | Les en-têtes de sécurité HTTP sont servis et une origine étrangère est refusée. | Lecture des en-têtes, requête `OPTIONS` avec une origine étrangère. | satisfait | CAS-ROB-16 : `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, politique de sécurité de contenu présente, `Strict-Transport-Security: max-age=15552000; includeSubDomains` ; `OPTIONS` rend 204 **sans** en-tête d'autorisation d'origine. |
| CA-S-10 | Aucune erreur interne ne fuit de détail technique (trace, requête SQL, chemin de fichier) dans une réponse HTTP. | Provocation d'erreurs internes, lecture des corps de réponse. | **non vérifié** | `CAS-ROB-12` jamais exécuté. Élément convergent : pendant la panne provoquée en vague 3, les routes rendaient `{"error":"Erreur interne du serveur"}` sans détail — une observation, pas l'exécution du cas. Réserve connexe consignée en vague 2 : sur un corps JSON tronqué, la réponse reprend le message brut de l'analyseur (`Unexpected end of JSON input`). |
| CA-S-11 | Un compte désactivé ou rattaché à une banque désactivée ne peut ni se connecter ni utiliser un jeton en cours. | Désactivation puis appels. | satisfait | CAS-AUTH-06 (401 `Compte désactivé`), CAS-AUTH-07 (401 `Banque désactivée`), CAS-ADM-11 (connexion refusée par le message générique). |
| CA-S-12 | L'unicité des adresses électroniques est garantie par la base, insensiblement à la casse. | Lecture du schéma, création concurrente de deux comptes à la même adresse en casse différente. | **non satisfait** | Constat de revue `C-16`, non corrigé, vérifié par lecture de `server/src/db/schema.sql` ligne 18 : la contrainte `UNIQUE` porte sur `email` brut, pas sur `lower(email)`. L'unicité insensible à la casse n'est assurée que par le code applicatif (CAS-ADM-04 le montre à l'usage). Le scénario concurrent n'a jamais été joué. |
| CA-S-13 | Le jeton d'authentification n'est pas exposé à un script tiers. | Revue du stockage côté navigateur. | **non satisfait** | Constat de revue `C-25`, non corrigé : le jeton est conservé dans le stockage local du navigateur. Choix d'architecture assumé, à arbitrer par le commanditaire. Aucun test d'intrusion n'a été mené (§ 2.2). |
| CA-S-14 | Le profil administrateur ne cumule pas la saisie et l'arbitrage d'un même dossier. | Enchaînement création, soumission, arbitrage avec le même compte. | **non satisfait** | Divergence D6 et constat `C-10`, confirmés en exécution (CAS-HAB-05) : le même compte administrateur enchaîne les trois actions, et sa liste agrège toutes les banques. Comportement assumé par le README ; il reste une entorse à la séparation des tâches. |

### 4.4 Accessibilité

| Id | Énoncé vérifiable | Méthode de vérification | Statut | Preuve |
| --- | --- | --- | --- | --- |
| CA-A-01 | Tout champ de saisie porte une étiquette qui lui est associée. | Inspection des trente-six champs des cinq étapes. | satisfait | CAS-ERGO-06 (vagues 2 et 3) : zéro champ sans étiquette associée. |
| CA-A-02 | Le parcours complet du formulaire est possible au clavier seul, sans piège au focus, avec un anneau de focus visible. | Navigation à la tabulation, activation des cartes de proposition à `Entrée` et à `Espace`. | satisfait | CAS-ERGO-06 : cartes de proposition activables aux deux touches, désélection au second appui, anneau de focus visible, aucun piège. Revérifié en vague 3 après la pose de l'attribut de neutralisation. |
| CA-A-03 | Tout couple texte / fond de l'interface atteint un rapport de contraste d'au moins 4,5:1. | Calcul du rapport sur les couleurs calculées, fond effectif remonté au premier ancêtre opaque. | satisfait | `DEF-A2-05` corrigé, vérifié en vague 3 : les trois couples fautifs passent de 3,97–4,35:1 à 6,34–7,82:1 ; sur 75 éléments mesurés, le plus bas est à 5,58:1. |
| CA-A-04 | Aucune zone cliquable ne mesure moins de 32 × 32 px en largeur de 375 px. | Mesure de toutes les zones interactives sur onze écrans. | satisfait | `DEF-A2-04` corrigé, vérifié en vague 3 : 0 zone sous 32 px sur 144 mesurées, et aucun défilement horizontal de page. |
| CA-A-05 | Un bandeau d'erreur est annoncé aux technologies d'assistance et la page est ramenée sur lui. | Défilement en bas de page, soumission invalide, lecture du rôle et de la position. | satisfait | CAS-ERGO-01 : bandeau `role="alert"`, page ramenée sur lui, focus porté sur son conteneur. |
| CA-A-06 | Les messages d'erreur emploient des intitulés métier, jamais des noms techniques. | Lecture du bandeau sur une saisie invalide. | satisfait | CAS-ERGO-02 : « Adresse du site », « RNE », « Description de l'activité », « Téléphone » ; aucun nom technique. |
| CA-A-07 | Un formulaire annoncé en lecture seule est réellement non saisissable, sans rendre inutilisables les commandes de navigation et de retour. | Clic, saisie forcée et prise de focus par script ; puis usage des boutons de navigation. | satisfait | Neutralisation : `DEF-A2-01` corrigé, vérifié en vague 3 (clic, saisie et focus tous sans effet). Effet de bord `DEF-A5-01` corrigé puis rejoué à l'écran sur une demande soumise : le champ reste inerte et sa valeur inchangée après une saisie forcée, « Suivant » fait passer à l'étape suivante, « Voir la demande » navigue vers la fiche, sans erreur JavaScript (`docs/corrections-vague3.md`). |
| CA-A-08 | Le produit est utilisable au lecteur d'écran. | Parcours complet sous NVDA ou VoiceOver. | **non vérifié** | Aucun essai au lecteur d'écran dans la campagne (§ 2.2 B). |
| CA-A-09 | Le produit est utilisable sur un navigateur mobile réel et sur un autre moteur que Chromium. | Recette sur téléphone, puis sur Firefox et Safari. | **non vérifié** | Toute la recette front s'est faite sous Chromium piloté, en fenêtre réduite (§ 2.2 B). |

### 4.5 Performance

| Id | Énoncé vérifiable | Méthode de vérification | Statut | Preuve |
| --- | --- | --- | --- | --- |
| CA-P-01 | Un appel au moteur de proposition répond en moins de 10 ms sur le référentiel de 279 codes. | Mesure répétée sur une instance dédiée. | **non vérifié** | Exclusion posée par le plan (§ 1.2). Le README annonce 4,1 ms ; ce chiffre n'a été ni reproduit ni contredit. |
| CA-P-02 | La plateforme tient un volume de demandes et d'utilisateurs représentatif d'une mise en service. | Tests de charge par paliers. | **non vérifié** | Aucun test de charge (§ 2.2 A). |
| CA-P-03 | La liste des demandes reste utilisable sur un volume important. | Mesure du temps de réponse sur un volume de production simulé. | **non vérifié** | Constat de revue `C-23` : le tri n'est pas indexé et la recherche emploie une comparaison non ancrée. Jamais mesuré. |
| CA-P-04 | Un import du référentiel complet s'applique en un temps compatible avec un usage interactif. | Mesure sur les 279 codes, puis sur un référentiel élargi. | **non vérifié** | Constat de revue `C-21` : l'import est quadratique et insère ligne à ligne. L'aller-retour a été exécuté sans incident sur 279 codes, sans mesure de durée. |
| CA-P-05 | Les réponses ne transportent pas de données internes inutiles. | Inspection d'une réponse du référentiel. | **non satisfait** | Constat de revue `C-18`, non corrigé : les objets MCC servis par l'API embarquent l'index de recherche interne. Sans conséquence fonctionnelle constatée ; alourdit les réponses. |

### 4.6 Exploitabilité

| Id | Énoncé vérifiable | Méthode de vérification | Statut | Preuve |
| --- | --- | --- | --- | --- |
| CA-E-01 | Le contrôle de santé rend 503 dès que le référentiel n'est pas exploitable, et 200 seulement quand les routes métier peuvent répondre. | Panne de base simulée, appel au contrôle de santé et à une route métier. | satisfait | `DEF-A6-04` corrigé en vague 3 : trois états distincts (`ok`, `perime`, `indisponible`), sonde réelle de la base à chaque appel ; deux tests automatisés. |
| CA-E-02 | Après une panne passagère de la base, l'API se rétablit seule, sans redémarrage. | Panne simulée puis rétablissement. | satisfait | `C-12` corrigé en vague 1, vérifié en vague 3 : dès la table rétablie, les routes repassent en 200 sans redémarrage. |
| CA-E-03 | Après une coupure de la connexion qui écoute les modifications du référentiel, l'écoute se rétablit et le catalogue est rechargé. | Coupure de la connexion d'écoute, modification du référentiel, observation. | **non vérifié** | Constat de revue `C-13`, non corrigé et jamais joué. Par lecture : le gestionnaire d'erreur remet le descripteur d'écoute à zéro, ce qui autorise un réabonnement ultérieur, mais rien ne le déclenche. |
| CA-E-04 | Une modification du référentiel faite sur une instance est vue par les autres instances. | Deux instances API, modification sur l'une, lecture sur l'autre. | **non vérifié** | Exclusion posée par le plan (§ 1.2) : incompatible avec la matrice d'isolation de la campagne. Le README reconnaît lui-même la limite. |
| CA-E-05 | Une erreur d'envoi de fichier rend un code HTTP explicite et un message exploitable, et non une erreur interne. | Envoi d'un fichier hors format ou surdimensionné. | partiellement satisfait | Les fichiers invalides rendent bien 400 avec cinq messages exploitables et un corps surdimensionné rend 413 (CAS-IMPORT-15, CAS-ROB-11). Le constat de revue `C-09` — les erreurs du composant d'envoi remontent en 500 — n'a pas été corrigé et **le cas CAS-IMPORT-14 « fichiers refusés » n'a pas été exécuté**. |
| CA-E-06 | L'amorçage de la base ne réécrit pas les ajustements faits par la conformité. | Écriture d'ajustements, puis amorçage, puis relecture. | satisfait | CAS-ADM-22 : niveau de vigilance, note et libellé conservés, codes ajoutés subsistants ; test « le seed ne réécrit pas les ajustements de la conformité ». |
| CA-E-07 | L'amorçage de la base ne réactive pas de comptes désactivés ni ne réinitialise de mots de passe en silence. | Désactivation d'un compte, amorçage, relecture. | **non vérifié** | Constat de revue `C-20`, non corrigé et jamais joué en exécution. À vérifier avant toute réexécution de l'amorçage sur un environnement en service. |
| CA-E-08 | Aucune erreur JavaScript ne se produit au cours d'un parcours métier complet. | Écouteurs d'erreurs branchés sur chaque page pendant toute la campagne front. | satisfait | Vague 3 front, § 5 : aucune erreur JavaScript sur l'ensemble de la campagne ; les seules traces relevées correspondent à des réponses HTTP provoquées volontairement par les tests. |
| CA-E-09 | Le comportement constaté en recette se retrouve sur le paquet de production de l'interface. | Recette sur un paquet construit. | **non vérifié** | Toute la recette front s'est faite sur le serveur de développement. L'agent 5 signale lui-même que le double envoi de chaque appel d'API, propre au mode de développement, est à revérifier sur un paquet construit. |

---

## 5. Bilan des défauts

### 5.1 Nomenclature et méthode de classement

Trois sources distinctes ont produit des constats, et elles ne se confondent pas :

- la **revue de code** de la vague 1 a produit 26 constats `C-01` à `C-26`. Ce sont des
  constats **de lecture** : le protocole de la campagne prévoit qu'ils ne deviennent des
  défauts qu'une fois confirmés en exécution ;
- la **lecture croisée du README et du code** a produit 7 divergences `D1` à `D7`, chacune
  rattachée à un cas de test destiné à trancher ;
- l'**exécution** des vagues 2 et 3 a produit 17 défauts, et le présent rapport en ouvre un
  dix-huitième.

Le statut final distingue trois niveaux de preuve, volontairement séparés :

- **corrigé et vérifié** — le scénario d'origine a été rejoué par un agent de recette qui n'a
  pas écrit le correctif, et le défaut ne se reproduit plus ;
- **corrigé et couvert par un test** — le correctif est accompagné d'un test automatisé qui
  échoue sans lui, mais aucun agent de recette indépendant ne l'a rejoué ;
- **corrigé et rejoué par l'intervenant du correctif** — le scénario d'origine a été rejoué et
  le défaut ne se reproduit plus, mais la vérification n'est pas croisée : celui qui a écrit le
  correctif est celui qui l'a éprouvé.

### 5.2 Défauts relevés en exécution

| Réf. | Gravité | Objet | Statut final | Correctif |
| --- | --- | --- | --- | --- |
| DEF-A2-01 | MINEUR | Un formulaire annoncé « en lecture seule » restait saisissable (CAS-HAB-09). | **corrigé et vérifié** (vague 3 : clic, saisie forcée et prise de focus tous sans effet) | Attribut de neutralisation posé sur le formulaire (`web/src/pages/RequestFormPage.jsx`). A produit l'effet de bord DEF-A5-01. |
| DEF-A2-02 | MAJEUR | Le message « le serveur est injoignable » était produit mais affiché par aucun composant : l'utilisateur était renvoyé à la connexion sans explication (CAS-ERGO-04). | **corrigé et vérifié** (vague 3 : message rendu, jeton conservé, reprise automatique au retour du réseau) | Consommation de l'état d'erreur de session dans l'interface. A produit l'effet de bord DEF-A5-02. |
| DEF-A2-03 | MINEUR | L'erreur d'arbitrage sans commentaire était affichée deux fois (CAS-WF-06). | **corrigé et vérifié** (vague 3 : une seule restitution) | Suppression de la restitution redondante (`RequestDetailPage.jsx`). |
| DEF-A2-04 | MINEUR | Plusieurs zones cliquables mesuraient moins de 32 px en largeur de 375 px (CAS-ERGO-05). | **corrigé et vérifié** (vague 3 : 0 zone sous 32 px sur 144 mesurées, onze écrans) | Hauteurs portées à 32,9 px ; étiquette cliquable associée à la case du référentiel. |
| DEF-A2-05 | MINEUR | Trois couples de couleurs sous 4,5:1 (CAS-ERGO-07). | **corrigé et vérifié** (vague 3 : 6,34 à 7,82:1 ; plus bas des 75 éléments mesurés à 5,58:1) | Assombrissement des teintes verte et ambre (`web/src/styles/app.css`). |
| DEF-A3-01 | MAJEUR | **Défaut de plan** : le § 4 « jeux de données JD-01 à JD-06 » était absent du plan de tests, rendant CAS-MCC-04 et CAS-MCC-05 inexécutables. | **résolu** | Le § 4 a été déposé le 2026-09-21 à 16 h 10 (commit `2d48118`), après le début de la vague 2. Il définit dix jeux et leurs résultats attendus. La vague 3 l'a ignoré et a maintenu les deux cas « bloqués » à tort ; ils ont été joués en vague 4 (§ 3, SC-05). |
| DEF-A3-02 | MINEUR | Un jeton émis dans la même seconde qu'une réinitialisation du mot de passe restait accepté (CAS-AUTH-10). | **corrigé et vérifié** (vague 3 : 401 avec un écart de 76 ms) | Le jeton porte l'empreinte du mot de passe sous lequel il a été émis, comparée à l'identique, sans notion de temps (`server/src/middleware/auth.js`). |
| DEF-A3-03 | MAJEUR | Le repli sur le code 5999 était inatteignable, et un descriptif sans correspondance rendait six codes à 31 % sans aucune justification (CAS-MCC-11, divergence D4). | **corrigé** en deux temps : partiellement en vague 2 (repli atteignable), complètement en vague 3 sous DEF-A6-01 | Les ajustements de modèle de vente modulent une pertinence au lieu de la créer (`mccSuggestion.js`). |
| DEF-A3-04 | MINEUR | Les messages de validation des bornes, des types et des énumérations n'étaient pas traduits (CAS-MCC-13, CAS-ROB-13, CAS-ROB-15). | **corrigé et vérifié** (vague 3 : 25 messages distincts examinés sur 6 routes, aucun anglais résiduel) | Carte de messages français extraite dans son propre module, importée par tous les schémas. Réserve mineure subsistante : un champ rend « Format invalide » là où une autre route sait dire « Un MCC est composé de 4 chiffres ». |
| DEF-A3-05 | MAJEUR | Un code remonté par une variante dérivée d'un mot-clé arrivait sans justification et perdait quatre rangs (CAS-INDEX-03). | **corrigé et vérifié** (vague 3) | Les mots-clés dérivés alimentent les termes justificatifs. Couvert par le test « un code remonté par un mot-clé dérivé est justifié ». |
| DEF-A5-01 | MINEUR | Effet de bord de DEF-A2-01 : en lecture seule, « Précédent », « Suivant » et « Voir la demande » devenaient inutilisables, au clic comme au clavier. | **corrigé et vérifié** | L'attribut de neutralisation descend sur un conteneur qui n'enveloppe que les champs ; la barre d'actions reste hors de son périmètre. Rejoué à l'écran sur une demande soumise : champ toujours inerte et valeur inchangée après saisie forcée, « Suivant » et « Voir la demande » opérants, 0 erreur JavaScript. |
| DEF-A5-02 | MINEUR | Effet de bord de DEF-A2-02 : le bandeau « Session non vérifiée » survivait à une reconnexion réussie et ne disparaissait qu'au rechargement de la page. | **corrigé et vérifié** | Le client d'API émet un signal dès qu'une réponse est reçue, quel qu'en soit le code, et le contexte d'authentification efface l'avertissement (`web/src/api/client.js`, `web/src/auth/AuthContext.jsx`). Rejoué à l'écran : coupure simulée sur `/api/auth/me`, le bandeau apparaît ; la coupure levée, une simple navigation interne le fait disparaître, sans rechargement de page. |
| DEF-A5-03 | MAJEUR | Une carte de proposition était rendue sans aucun terme justificatif, sur le **profil de référence du plan** : les termes tirés du nom et de l'adresse du site échappaient au correctif de DEF-A3-03. Mesure : 30 suggestions sans justification sur 504 profils. | **corrigé et couvert par un test** | Même correctif que DEF-A6-01 ci-dessous : tout jeton qui entre dans le score est ajouté aux termes justificatifs, et le filtre final pose l'invariant en dur. |
| DEF-A6-01 | MAJEUR | Même défaut que DEF-A5-03, atteint par l'API : un code ne correspondant que par sa description française ou ses champs anglais sortait avec une liste de termes vide. Mesure : 10 propositions sur 272. | **corrigé et couvert par un test** | `server/src/services/mccSuggestion.js` : filtre `rawScore > 0 && matchedTerms.length > 0`. Vérifié sur 11 profils de formes différentes à la correction ; recoupé en vague 4 sur 12 propositions (JD-04 et JD-06), toutes justifiées. |
| DEF-A6-02 | MAJEUR | **Régression** introduite par le correctif D3 : l'aller-retour « exporter → relire → appliquer » échouait en 400 sur le référentiel livré, sans aucune modification, le code `5817` portant deux secteurs dont la concaténation fait 42 caractères pour une borne de 40. Le défaut traversait la simulation et n'échouait qu'à l'application confirmée. | **corrigé et couvert par un test** | `server/src/services/adminSchema.js` : borne portée à 400 caractères. Le cycle complet est désormais rejoué en Excel et en CSV par deux tests automatisés — le seul défaut de la vague qu'un test de bout en bout aurait arrêté, et il n'existait pas. |
| DEF-A6-03 | MAJEUR | Correction incomplète de `C-01` : en production, le secret publié dans le dépôt était accepté s'il était fourni explicitement, et aucune longueur minimale n'était imposée. Un jeton administrateur forgé avec ce secret était accepté. | **corrigé et couvert par un test** | `server/src/config.js` : refus du secret de développement et de toute valeur de moins de 32 caractères, en plus du refus de l'absence. Vérifié par trois démarrages en production. |
| DEF-A6-04 | MAJEUR | Correction incomplète de `C-12` : le contrôle de santé répondait 200 alors que toutes les routes métier rendaient 500 — le répartiteur de charge continuait d'alimenter une instance morte. | **corrigé et couvert par un test** | `mccCatalog.js` et `app.js` : mémorisation de l'issue du **dernier** chargement et sonde réelle de la base à chaque appel ; trois états distincts. |
| DEF-A7-01 | MINEUR | Ouvert par le présent rapport. Avec `isMarketplace` à faux, le code `5262` reste en rang 1 (84 %) alors que le plan exige son déclassement : la pénalité de −25 s'applique au score brut (188,5 → 118,5) et ne suffit pas à le faire reculer (CAS-MCC-05). | **ouvert** | Aucun. Le comportement est inchangé depuis la vague 2 ; il avait été masqué par le classement « bloqué » de DEF-A3-01. |

### 5.3 Décompte

| Statut | Nombre | Références |
| --- | --- | --- |
| Corrigé **et vérifié** par un agent de recette indépendant | 9 | DEF-A2-01 à 05, DEF-A3-02, DEF-A3-04, DEF-A3-05, et DEF-A3-03 sur sa partie « repli atteignable » |
| Corrigé **et couvert par un test automatisé**, sans retest indépendant | 6 | DEF-A5-03, DEF-A6-01, DEF-A6-02, DEF-A6-03, DEF-A6-04, et DEF-A3-03 sur sa partie finale |
| Corrigé **et rejoué à l'écran** par l'intervenant du correctif, sans agent indépendant | 2 | DEF-A5-01, DEF-A5-02 (tous deux front, tous deux mineurs) |
| Résolu sans correctif de code | 1 | DEF-A3-01 (défaut de plan) |
| **Ouvert** | 1 | DEF-A7-01 (mineur) |

Par gravité, sur les 18 références : 9 majeures, 8 mineures, 1 majeure de plan. **Aucun défaut
bloquant n'a été relevé en exécution au cours de la campagne.**

Deux régressions ont été introduites par des correctifs et détectées par la vague suivante :
`DEF-A5-01` et `DEF-A5-02` (effets de bord des correctifs front), et une troisième,
`DEF-A6-02`, qui cassait une fonction annoncée du produit. Toutes trois sont corrigées.
Aucune régression n'a été constatée sur le périmètre fonctionnel rejoué : 27 cas front et
45 cas back rejoués en vague 3 sans écart, hors les écarts **attendus** produits par les
correctifs du moteur.

### 5.4 Constats de la revue de code

Sur les 26 constats, **4 ont été corrigés** et 22 restent ouverts. Aucun des 22 n'a été
confirmé en exécution par un cas dédié, sauf mention contraire ci-dessous ; leur statut est
donc « constat de lecture, non traité ».

| Constat | Gravité (revue) | Objet | Statut |
| --- | --- | --- | --- |
| C-01 | CRITIQUE | Secret d'authentification en dur, jamais exigé en production. | **corrigé** en deux temps (vague 1 puis DEF-A6-03), couvert par deux tests. |
| C-12 | CRITIQUE | Une erreur passagère de base figeait l'API entière jusqu'au redémarrage, pendant que le contrôle de santé annonçait « ok ». | **corrigé** en deux temps (vague 1 puis DEF-A6-04), couvert par trois tests. |
| C-02 | MAJEUR | Fenêtre de concurrence sur la modification d'une demande. | **corrigé et vérifié** : 45 itérations en parallèle, 4 conflits correctement rendus en 409, zéro écriture sur une demande déjà soumise. |
| C-14 | MAJEUR | Un code MCC réenregistré était silencieusement relégué en fin de priorité de son secteur. | **corrigé et vérifié** : rangs inchangés après modification ; un nouveau rattachement prend la fin de file et y reste. Voir la réserve D1 au § 3, SC-13. |
| C-03 | MAJEUR | La photographie des suggestions perd son sens si un MCC quitte le référentiel. | ouvert, non confirmé en exécution. |
| C-04 | MAJEUR | Un retour arrière de transaction en échec masque l'erreur d'origine. | ouvert, non confirmé. Coûte du temps de diagnostic le jour d'un incident. |
| C-05 | MAJEUR | Un changement de mot de passe par l'utilisateur ne laisse aucune trace. | ouvert, vérifié par lecture (§ 4.2, CA-T-07). |
| C-06 | MAJEUR | Le journal d'administration des comptes n'enregistre pas les valeurs modifiées. | ouvert, effet observé en exécution (CAS-ADM-06) sans cas dédié (§ 4.2, CA-T-06). |
| C-07 | MAJEUR | L'authentification s'exécute deux fois par requête : deux allers-retours en base inutiles. | ouvert, non confirmé. Effet de performance, jamais mesuré. |
| C-08 | MAJEUR (latent) | La péremption des jetons comparait deux horloges différentes. | **traité indirectement** par le correctif de DEF-A3-02, qui supprime la notion de temps de la comparaison. Non recensé comme corrigé faute de vérification portant explicitement sur ce constat. |
| C-13 | MAJEUR | L'écoute des modifications du référentiel ne se rétablit jamais après une coupure. | ouvert, jamais joué (§ 4.6, CA-E-03). |
| C-15 | MAJEUR | Un import qui réintroduit un code désactivé ne le réactive pas et l'annonce « inchangé ». | ouvert, non confirmé. Le cas d'import correspondant fait partie des sept non exécutés. |
| C-16 | MAJEUR | L'unicité des adresses électroniques n'est garantie que par le code applicatif. | ouvert, vérifié par lecture du schéma (§ 4.3, CA-S-12). |
| C-17 | MAJEUR | Le repli sur le code 5999 produit un objet vide si ce code est absent ou désactivé. | ouvert, vérifié par lecture (`mccSuggestion.js` ligne 148 : la recherche du code de repli n'est pas défendue contre une absence). Jamais joué. |
| C-09, C-10, C-11, C-18 à C-26 | MINEUR | Erreurs d'envoi de fichier en 500 ; administrateur au-dessus des séparations de fonction ; blocage d'un compte tiers ; index de recherche exposé ; paramètre répété provoquant une erreur interne ; amorçage réactivant les comptes ; import quadratique ; rechargement complet des banques ; tri non indexé ; journal non paginable ; jeton dans le stockage local ; conventions de journalisation divergentes. | ouverts. `C-10` est confirmé en exécution par CAS-HAB-05 (divergence D6) et assumé par le README. Les autres n'ont pas de cas dédié. |

### 5.5 Divergences README / code

| Div. | Cas | Statut final |
| --- | --- | --- |
| D1 | CAS-INDEX-06 | **partiellement close.** La conséquence dommageable est corrigée (C-14) ; la promesse « le rang suit l'ordre fourni » n'est toujours pas tenue. Écart de documentation. |
| D2 | CAS-IMPORT-11 | **close.** Un fichier ne modifiant que le rattachement sectoriel est désormais détecté et appliqué. |
| D3 | CAS-IMPORT-12 | **close.** L'export porte tous les secteurs et l'aller-retour ne les perd plus. A produit la régression DEF-A6-02, corrigée. |
| D4 | CAS-MCC-11 | **close.** Le repli sur 5999 est atteignable et annoncé. |
| D5 | CAS-AUTH-17 | **confirmée, ouverte.** Un corps invalide n'alimente pas le compteur de limitation (§ 4.3, CA-S-07). |
| D6 | CAS-HAB-05 | **confirmée, assumée.** L'administrateur cumule les droits d'agent et de banquier (§ 4.3, CA-S-14). À arbitrer. |
| D7 | CAS-MCC-02 | **confirmée, mineure.** Le total affiché du référentiel baisse après une désactivation sans que l'écran le signale (CAS-ADM-14 : 279 codes, 278 actifs). |

### 5.6 Attentes du plan de tests devenues inexactes

Plusieurs résultats attendus du plan ne correspondent plus au produit, soit parce qu'ils
étaient erronés à la rédaction, soit parce qu'un correctif les a rendus caducs. Ils sont
recensés ici pour que le plan soit corrigé avant sa prochaine exécution — aucun n'est un
défaut du produit.

| Attente | Constat |
| --- | --- |
| CAS-MCC-01 : six propositions dont `5960` à 31 % | Caduque. Le correctif du moteur écarte la sixième, qui ne portait aucune justification. Cinq propositions désormais. |
| CAS-MCC-03 : quatre codes à 31 % dans l'appel sans secteur | Caduque, même raison. |
| JD-10 (§ 4.3 du plan) : six codes à 31 %, « pas de repli sur 5999 » | Caduque. C'était la description de la divergence D4, désormais corrigée : une seule proposition, le repli. |
| CAS-INDEX-01 : le terme `bornes recharge` attendu parmi les justificatifs | Inexacte. La description écrit « bornes **de** recharge » : le couple de mots n'y est pas contigu. |
| CAS-INDEX-04 (1) et CAS-INDEX-08 (3) | Inexactes, et CAS-INDEX-08 (3) se contredit avec son propre point (4). |
| CAS-ERGO-08 : six compteurs sur la liste des demandes | Inexacte. Le produit en expose cinq, volontairement. Constat identique en vagues 2 et 3. |

---

## 6. Couverture par les tests automatisés

### 6.1 État constaté

`cd /home/user/simulateur/clicktopay-affiliation/server && npm test`, exécuté le 2026-09-22 :
**113 tests, 113 réussis, 0 échec, 14 suites**, en 19 secondes, sur la base `clicktopay_test`
remise à zéro à chaque exécution.

Répartition par fichier :

| Fichier | Tests | Ce qu'il couvre |
| --- | --- | --- |
| `server/tests/auth.test.js` | 5 | Connexion, refus sans jeton, profil du porteur, contrôle de santé. |
| `server/tests/requests.test.js` | 20 | Cycle de vie complet d'une demande : saisie, contrôle champ par champ, brouillon, soumission et gel des propositions, arbitrage sous ses quatre issues, cloisonnement, filtres, compteurs, journal. |
| `server/tests/mcc.test.js` | 10 | Catalogue à 279 codes, recherche, secteurs, parité Visa/Mastercard, explicabilité des propositions, activité numérique, place de marché, refus des codes interdits, repli. |
| `server/tests/admin.test.js` | 23 | Comptes, politique de mot de passe, banques, journalisation des actions, référentiel administrateur, historique des codes, rapport d'écart et application de l'import, amorçage non destructeur. |
| `server/tests/indexation.test.js` | 10 | Indexation immédiate d'un code importé, dérivation des mots-clés, variantes singulier/pluriel, rattachement sectoriel, refus d'un secteur inconnu, reconstruction de l'index. |
| `server/tests/robustesse.test.js` | 39 | Types hostiles et coercitions, concurrence (quatre situations), cycle de vie des jetons, limitation de débit, import Excel et CSV, et les six tests ajoutés avec les correctifs de la revue de code. |
| `server/tests/vague3.test.js` | 7 | Les six défauts de la dernière vague : justification systématique des propositions, repli seul, aller-retour d'import complet en deux formats, refus d'un secret faible ou laissé par défaut, deux états du contrôle de santé. |

### 6.2 Ce que les 113 tests garantissent réellement

Ils garantissent, à chaque exécution et sans intervention humaine :

- **le cycle de vie complet d'une demande**, y compris les quatre issues de l'arbitrage, le gel
  des propositions à la soumission et le journal nominatif ;
- **les quatre situations de concurrence** : deux soumissions, deux décisions, deux
  rétrogradations d'administrateur, deux créations du même code — chacune jouée en parallèle
  réel, pas simulée ;
- **le cycle de vie des droits** : un compte désactivé, muté ou changé de rôle voit ses accès
  suivre immédiatement, sans reconnexion, et une réinitialisation ferme les sessions ouvertes ;
- **le cloisonnement entre banques** et la séparation des rôles sur les routes couvertes ;
- **le refus des codes interdits** et la justification systématique de toute proposition —
  l'invariant `matchedTerms.length > 0` est désormais un test, pas une intention ;
- **l'aller-retour export → import du référentiel complet**, en Excel et en CSV, avec
  l'application confirmée : c'est le test qui manquait et qui aurait arrêté DEF-A6-02 ;
- **le refus de démarrer en production** avec un secret absent, faible ou laissé à la valeur
  du dépôt ;
- **les trois états du contrôle de santé**, dont l'état dégradé sur référentiel périmé ;
- **la résistance aux types hostiles** : la chaîne « false », les booléens indevinables, les
  dates inexistantes, les montants hors capacité de colonne, l'octet nul, les identifiants non
  numériques.

### 6.3 Ce qu'ils ne garantissent pas

C'est le point important de cette section.

**A. L'interface n'est couverte par aucun test automatisé.** Les 113 tests portent tous sur
l'API Node. Le répertoire `web/` n'a aucune suite de tests. Tout ce qui a été établi sur
l'interface — la neutralisation du formulaire en lecture seule, l'affichage du message de
panne réseau, les contrastes, les tailles de zones cliquables, l'association des étiquettes,
la restitution des erreurs, l'écran d'import et sa double confirmation — l'a été **une fois,
à la main, par un agent de recette**. Aucune régression d'écran ne sera détectée autrement
que par une nouvelle recette manuelle. Les deux défauts front corrigés en dernière vague
(`DEF-A5-01`, `DEF-A5-02`) illustrent le risque : ils ont été rejoués à l'écran, mais aucun
test automatisé ne les retiendra si une évolution future les rouvre.

**B. Sept des seize cas d'import ne sont couverts ni par un test ni par une exécution.** Les
tests couvrent l'aller-retour, un fichier désordonné, un fichier sans colonne de code, un
format non pris en charge et la réservation à l'administrateur. Ils ne couvrent pas les
anomalies avec numéro de ligne (CAS-IMPORT-06), la garantie que le rapport d'écart ne modifie
rien prise pour elle-même (CAS-IMPORT-08), l'application après confirmation explicite
(CAS-IMPORT-09), le caractère strictement optionnel de la désactivation des codes absents
(CAS-IMPORT-10), la traduction des valeurs métier (CAS-IMPORT-05), les codes normalisés par
le tableur (CAS-IMPORT-07) ni l'ordre libre des colonnes avec variantes d'en-tête
(CAS-IMPORT-04).

**C. Zones qui ne reposent que sur une vérification manuelle, faite une fois.** Outre
l'interface entière : les six jeux de données du plan jamais joués (JD-02, JD-03, JD-05,
JD-07, JD-08, JD-09), la limitation de débit sur la route réelle — un seul test automatisé
l'exerce, alors que le plan classait ce point n° 5 de ses priorités —, la résilience du
référentiel sous panne de base réelle (les tests simulent, la vague 3 a joué la panne à la
main), et les scénarios d'exploitation du § 4.6 marqués non vérifiés.

**D. Ce qu'aucun test ne peut garantir ici.** La performance, la charge, le comportement
multi-instances, le rendu sur un navigateur mobile réel, la restitution au lecteur d'écran et
le comportement du paquet de production de l'interface (§ 2.2).

### 6.4 Une remarque de méthode

Les six tests de `vague3.test.js` et les six tests ajoutés avec les correctifs de la revue de
code ont une caractéristique commune : ils ont été écrits **après** le défaut, par la personne
qui posait le correctif. C'est utile — ils empêchent le retour du défaut — mais ce n'est pas
une couverture conçue à l'avance. Trois des correctifs de la vague 2 ont dû être repris parce
qu'ils traitaient le cas constaté plutôt que la règle ; les tests de la vague 3, eux, énoncent
l'invariant (« aucune proposition n'est servie sans terme justificatif », « la production
refuse un secret faible ou laissé par défaut »). C'est la bonne formulation, et elle mérite
d'être la règle pour la suite.

---

## 7. Réserves et recommandations avant mise en service

Classées par priorité. L'effort est estimé en jours-personne pour une équipe qui connaît le
code ; il couvre la réalisation, le test et la vérification.

### 7.1 À traiter avant toute mise à disposition

| N° | Réserve | Action | Effort |
| --- | --- | --- | --- |
| R-01 | **Sept cas d'import jamais exécutés, dont quatre bloquants** (§ 2.2 C). C'est la fonction qui modifie le référentiel réglementaire de toutes les banques, et la garantie « rien n'est écrit sans confirmation explicite » n'est pas formellement acquise. | Exécuter CAS-IMPORT-04 à 10 et 14 sur une instance dédiée, et ajouter un test automatisé pour CAS-IMPORT-08, 09 et 10, qui portent sur des invariants et non sur des cas. | 2 à 3 j |
| R-02 | **Les deux correctifs front de la dernière vague ont été rejoués par l'intervenant qui les a écrits**, non par un agent de recette indépendant (`DEF-A5-01`, `DEF-A5-02`). Le comportement est établi, la revérification croisée ne l'est pas. | Faire rejouer les deux scénarios par un agent de recette distinct, et les porter en test automatisé d'interface (voir R-05). | 0,25 j |
| R-03 | **Deux cas majeurs jamais exécutés hors import** : CAS-ROB-12 (les erreurs internes ne fuient pas) et CAS-WF-15 (la photographie précédente est remplacée, pas cumulée). Le premier touche la sécurité, le second l'intégrité de la piste d'audit. | Exécuter les deux cas. Traiter au passage la réserve consignée en vague 2 : un corps JSON tronqué renvoie le message brut de l'analyseur. | 0,5 j |
| R-04 | **Arbitrer la divergence D6** : le profil administrateur peut saisir **et** arbitrer le même dossier, et voit les dossiers de toutes les banques (§ 4.3, CA-S-14 ; constat `C-10`). C'est une décision métier, pas un défaut technique. | Soit restreindre le profil administrateur aux fonctions d'administration, soit acter par écrit que ce cumul est accepté et le documenter à destination du contrôle interne. | 0,5 j pour la décision, 1 j si restriction |

### 7.2 À traiter avant une ouverture large

| N° | Réserve | Action | Effort |
| --- | --- | --- | --- |
| R-05 | **L'interface n'a aucun test automatisé** (§ 6.3 A). Toute régression d'écran passera inaperçue jusqu'à la prochaine recette manuelle. | Poser une suite de bout en bout sur les cinq parcours les plus coûteux à reprendre à la main : connexion et changement imposé de mot de passe, saisie en cinq étapes jusqu'à la soumission, arbitrage sous ses trois issues, cloisonnement par URL forcée, écran d'import en simulation. | 4 à 6 j |
| R-06 | **Traçabilité incomplète pour un contrôle interne** : le changement de mot de passe par l'utilisateur n'est pas tracé (`C-05`), le journal des comptes n'enregistre pas les valeurs modifiées (`C-06`), et il n'est pas consultable au-delà de 500 entrées (`C-24`). | Tracer le changement de mot de passe, journaliser les valeurs avant et après sur les modifications de compte — comme cela se fait déjà pour les codes MCC —, et paginer le journal. | 2 j |
| R-07 | **Invariants portés par le code applicatif et non par la base** : l'unicité des adresses électroniques n'est pas insensible à la casse en base (`C-16`). | Poser un index unique sur l'adresse en minuscules. La revue signale ce point comme l'une des deux corrections au meilleur rapport risque écarté / effort de tout son rapport. | 0,5 j |
| R-08 | **Résilience du référentiel** : l'écoute des modifications ne se rétablit pas après une coupure (`C-13`), le repli sur le code 5999 n'est pas défendu contre l'absence de ce code (`C-17`), et la photographie des suggestions perd son sens si un code quitte le référentiel (`C-03`). | Reconnecter l'écoute avec rechargement au retour, défendre le repli, et rendre les lectures d'historique indépendantes du catalogue vivant. | 2 à 3 j |
| R-09 | **Aucune mesure de performance ni de charge** (§ 4.5). Trois points de la revue portent précisément sur des coûts non mesurés : double authentification par requête (`C-07`), import quadratique (`C-21`), tri non indexé de la liste des demandes (`C-23`). | Établir un palier de charge représentatif — nombre de banques, d'agents simultanés et de demandes — et mesurer la liste des demandes, le moteur de proposition et l'import complet. | 3 à 4 j |
| R-10 | **Recette mobile et multi-navigateurs absente**, et le paquet de production de l'interface n'a jamais été recetté (§ 2.2 B). | Rejouer les cas d'ergonomie sur un téléphone réel et sur un second moteur de rendu, contre un paquet construit. Vérifier au passage le support de l'attribut de neutralisation du formulaire, dont le support est inégal. | 1 à 2 j |
| R-11 | **DEF-A7-01 ouvert** : la pénalité de place de marché ne déclasse pas le code 5262 comme le prévoit le plan. | Trancher : soit la règle métier est bien celle du plan et la pénalité doit s'appliquer au score final, soit l'attente du plan est excessive et il faut la corriger. En l'état, ni l'un ni l'autre n'est établi. | 0,5 j |

### 7.3 À traiter au fil de l'eau

| N° | Réserve | Action | Effort |
| --- | --- | --- | --- |
| R-12 | Limitation de débit non alimentée par un corps invalide (divergence D5, `CA-S-07`). | Monter la limitation avant la validation du corps, ou corriger la documentation. | 0,5 j |
| R-13 | Jeton d'authentification conservé dans le stockage local du navigateur (`C-25`). | Décision d'architecture à acter ou à revoir. Aucun test d'intrusion n'ayant été mené, le risque n'est pas quantifié. | à arbitrer |
| R-14 | Diagnostic d'incident dégradé : un retour arrière de transaction en échec masque l'erreur d'origine (`C-04`), et les erreurs d'envoi de fichier remontent en erreur interne (`C-09`). | Deux corrections courtes, sans effet fonctionnel, qui feront gagner du temps le jour d'un incident. | 1 j |
| R-15 | Le plan de tests contient six attentes devenues inexactes ou caduques (§ 5.6), et la vague 3 a maintenu deux cas « bloqués » alors que les jeux de données existaient. | Mettre le plan à jour avant sa prochaine exécution, sans quoi la campagne suivante rejouera les mêmes faux écarts. | 0,5 j |
| R-16 | Écarts d'homogénéité mineurs : la validation du champ « Banque » passe par la bulle native du navigateur ; le total affiché du référentiel baisse silencieusement après une désactivation (divergence D7) ; un message de validation rend « Format invalide » là où une autre route sait nommer la règle. | À traiter avec les autres retouches d'interface. | 1 j |

### 7.4 Ce que l'agent 7 recommande

La plateforme tient sur ce qui compte : le parcours métier, le cloisonnement entre banques,
le refus des codes non éligibles, l'explicabilité des propositions et la piste d'audit des
dossiers. Ces points ont été éprouvés, corrigés quand il le fallait, et sont désormais tenus
par des tests qui énoncent des règles et non des cas.

Ce qui manque n'est pas dans le produit mais **autour** : une fonction d'administration
insuffisamment recettée (l'import), une interface sans filet automatisé, et une série de
constats de revue laissés de côté qui touchent la traçabilité et la résilience. Ce sont des
sujets d'exploitation et de contrôle, pas de fonctionnement.

D'où l'avis : **apte sous réserve**. Une mise en service **pilote** — une ou deux banques,
volume connu, import du référentiel réservé à l'équipe projet — est envisageable dès que les
quatre points du § 7.1 sont traités, soit environ **quatre jours de travail**. Une ouverture
large demande en plus le § 7.2, soit une douzaine de jours supplémentaires, dont la moitié
pour poser les tests d'interface qui manquent.

---

## 8. Tableau de bord — vague 4

Valeurs demandées par `recette-tableau-de-bord.md` § « Vague 4 — synthèse ».

| Indicateur | Valeur |
| --- | --- |
| Cas prévus au plan | 147 |
| Cas joués au moins une fois | 137 |
| Cas jamais joués | 10 (7 IMPORT, 1 ROBUSTESSE, 1 WORKFLOW, plus CAS-MCC-05 joué mais non satisfait) |
| Défauts ouverts par criticité | 1 mineur (DEF-A7-01). Aucun bloquant, aucun majeur. |
| Défauts corrigés et confirmés par un agent indépendant | 9 |
| Défauts corrigés et couverts par un test, sans retest indépendant | 6 |
| Défauts corrigés et rejoués par l'intervenant du correctif, sans agent indépendant | 2 |
| Constats de revue confirmés en exécution | 3 sur 26 (`C-01`, `C-12`, `C-10`), auxquels s'ajoutent `C-02` et `C-14` confirmés par la vérification de leur correctif |
| Constats de revue corrigés | 4 sur 26 (`C-01`, `C-02`, `C-12`, `C-14`) |
| Régressions introduites par les correctifs | 3, toutes détectées par la vague suivante et corrigées (`DEF-A5-01`, `DEF-A5-02`, `DEF-A6-02`) |
| Régressions subsistantes | 0 |
| Suite automatisée | 113 tests, 113 réussis (2026-09-22) |
| Avis de mise en production | **Apte sous réserve** — voir § 1 et § 7 |

---

*Rapport établi par l'agent 7 le 2026-09-22. Aucun fichier du projet n'a été modifié, hors le
présent document. Les seules actions exécutées ont été des lectures : `npm test` sur la base
`clicktopay_test`, et quatre appels à `POST /api/mcc/suggest` sur l'instance de démonstration
du port 4000, qui n'écrivent rien.*

---

## Amendement du 2026-09-22

Le tableau des défauts classait `DEF-A5-01` et `DEF-A5-02` « corrigés, non revérifiés » sur
la foi d'une lecture du code. Ces deux correctifs avaient en réalité été rejoués à l'écran le
jour même, avant la remise du rapport, et le compte rendu de cette vérification figure dans
`docs/corrections-vague3.md` (commit `cbceb13`) : formulaire d'une demande soumise, champ
resté inerte et valeur inchangée après saisie forcée, boutons « Suivant » et « Voir la
demande » redevenus opérants, bandeau de panne effacé par une navigation interne après la
levée de la coupure, aucune erreur JavaScript.

Les statuts, le critère `CA-A-07` et la recommandation `R-02` ont été rectifiés en
conséquence. La réserve qui subsiste n'est pas l'absence de vérification mais son absence de
croisement : c'est l'auteur des correctifs qui les a éprouvés, non un agent de recette
indépendant. L'avis d'aptitude et les autres réserves du rapport sont inchangés.

## Amendement du 2026-09-22 (2) — `DEF-A7-01`

`DEF-A7-01` était le seul défaut laissé ouvert par ce rapport : avec
`isMarketplace: false`, le code `5262` restait en rang 1 sur JD-06 alors que
`CAS-MCC-05` exigeait son déclassement. Vérification faite, **ce n'est pas un défaut
de code mais un défaut du cas de test**, et il est requalifié comme tel.

Le descriptif de JD-06 est « Place de marche generaliste regroupant des vendeurs
tiers tunisiens… » et son secteur déclaré est `MARKETPLACE` : le jeu de données
contredit son propre drapeau. Mesures :

| Profil | Rang 1 | Score de 5262 |
| --- | --- | --- |
| JD-06, `isMarketplace: true` | `5262` | 90 % (brut 188,5) |
| JD-06, `isMarketplace: false` | `5262` | 84 % (brut 118,5) |
| JD-06 sans le secteur `MARKETPLACE`, `isMarketplace: false` | `5262` | 79 % (brut 80,5) |
| Descriptif neutre, `isMarketplace: false` | `5719` | **absent du classement** |

La case agit donc bien — elle coûte les 25 points annoncés — mais elle ne peut pas
effacer un descriptif qui dit explicitement le contraire. Une pénalité qui y
parviendrait retirerait au banquier le code le plus pertinent sur la foi d'une seule
case à cocher, ce qui irait contre la raison d'être du produit : proposer, expliquer,
et laisser le banquier arbitrer.

`CAS-MCC-05` a été reformulé en conséquence (`plan-de-tests.md`, amendement du même
jour) et l'invariant réel est désormais couvert par deux cas automatisés dans
`server/tests/vague3.test.js`. La suite compte **115 tests, tous verts**.

Reste ouverte, en revanche, une **question de produit** que ce rapport verse au
dossier : lorsque la déclaration de l'agent contredit le descriptif qu'il a saisi, la
plateforme arbitre silencieusement. Signaler la contradiction à l'écran — « vous avez
décoché « place de marché » mais votre descriptif en décrit une » — serait plus fidèle
à la promesse d'explicabilité. C'est une évolution, pas un correctif.

**Avec cette requalification, aucun défaut n'est ouvert à l'issue de la campagne.**
