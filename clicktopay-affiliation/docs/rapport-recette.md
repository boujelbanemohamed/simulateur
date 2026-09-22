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

Vingt défauts ont été relevés en exécution et dix-huit sont aujourd'hui corrigés. Les
corrections ont été vérifiées, selon les cas, par reproduction du scénario d'origine par un
agent de recette indépendant, ou par un test automatisé ajouté avec le correctif. La suite
automatisée compte **113 tests, tous verts** (`cd server && npm test`, exécuté le 2026-09-22).

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
