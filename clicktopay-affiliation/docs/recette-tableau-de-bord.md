# Recette ClickToPay — tableau de bord partagé

Journal unique de la campagne. **Chaque agent ajoute ses propres lignes et ne touche pas à
celles des autres** (`recette-coordination.md` § 3). En-tête et conventions posés par l'agent 8,
**alignés sur les conventions déjà adoptées** par le plan de tests (agent 1) et la revue de
code (agent 4) — aucune nomenclature concurrente n'est introduite ici.

Documents de référence, dans `docs/` :

| Document | Auteur | Rôle |
|---|---|---|
| `plan-de-tests.md` | agent 1 | source des identifiants de cas `CAS-…` |
| `revue-de-code.md` | agent 4 | source des constats de revue `C-…` |
| `recette-coordination.md` | agent 8 | ports, bases, protocoles, pièges |
| `verifier-environnement.sh` | agent 8 | contrôle de l'environnement en une commande |

État au démarrage : aucun cas exécuté. Les lignes marquées _(exemple)_ montrent le format
attendu ; les vraies lignes se placent en dessous.

---

## Conventions de saisie

Une ligne = un cas exécuté une fois. Un cas rejoué en vague 3 donne une **nouvelle** ligne
(même identifiant, vague et agent différents) ; on ne réécrit jamais la ligne de la vague 2.

| Colonne | Format | Valeurs autorisées |
|---|---|---|
| **Cas** | `CAS-<DOM>-<NN>` | Identifiant repris **tel quel** du plan de tests de l'agent 1. `<DOM>` déjà utilisé : `AUTH`, `HAB`, `MCC`, `INDEX`, `IMPORT` — la liste fait foi dans `plan-de-tests.md`. Un test hors plan est noté `HORS-PLAN-<agent>-<NN>` (ex. `HORS-PLAN-A3-01`) et décrit dans le commentaire. |
| **Vague** | entier | `1`, `2`, `3`, `4` |
| **Agent** | `A<n>` | `A1` … `A8` |
| **Niveau** | mot-clé | `BACK`, `FRONT`, `LES DEUX` — reprend le niveau indiqué par le plan pour ce cas. |
| **Statut** | mot-clé | `OK` (conforme), `KO` (défaut constaté), `PARTIEL` (conforme avec réserve), `BLOQUÉ` (non exécutable à cause d'un défaut bloquant — citer sa référence), `NON JOUÉ` (prévu, pas exécuté), `HORS PÉRIMÈTRE` |
| **Criticité** | mot-clé | `BLOQUANT`, `MAJEUR`, `MINEUR`, `COSMÉTIQUE`, `—`. Obligatoirement `—` si statut `OK`, `NON JOUÉ` ou `HORS PÉRIMÈTRE`. Les trois premiers niveaux ont la définition donnée par le plan de tests § 1.4. |
| **Réf. défaut** | `DEF-<NNN>` ou `C-<NN>` | `—` si statut `OK`. Un défaut qui confirme en exécution un constat de la revue de code porte **le numéro de la revue** (`C-01` … `C-12`) au lieu d'un nouveau `DEF-`. Sinon, `DEF-<NNN>` selon les plages ci-dessous. Un défaut revu en vague 3 garde **le même numéro**. |
| **Commentaire** | texte d'une ligne | Attendu vs constaté, en une phrase, avec le code HTTP, le message ou l'élément d'écran en cause. Pas de retour à la ligne ; échapper les `\|`. |

### Plages de numérotation des défauts

Les agents 2 et 3 travaillent en parallèle : les plages évitent les collisions de numéros.

| Agent | Plage | Remarque |
|---|---|---|
| A2 (front, vague 2) | `DEF-001` → `DEF-099` | |
| A3 (back, vague 2) | `DEF-101` → `DEF-199` | |
| A4 (revue de code) | `C-01` → `C-12` | déjà attribués dans `revue-de-code.md` ; ne pas renuméroter |
| A5 (retest front) | `DEF-301` → | uniquement pour une **régression nouvelle** ; sinon reprendre le numéro existant |
| A6 (retest back) | `DEF-401` → | idem |

### Règles

- Un défaut se déclare **avec sa preuve** (requête et réponse, état en base, ou capture) rangée
  dans le scratchpad de l'agent ; chemin absolu cité dans le commentaire s'il est utile.
- Écarter d'abord les effets de bord d'environnement — un `429` de limitation de connexion en
  tête (`recette-coordination.md` § 5.7) — avant de déclarer un défaut.
- Un agent de recette **ne corrige rien** : il décrit. Les corrections reviennent à l'agent
  principal, entre les vagues 2 et 3.
- Le critère est binaire : `OK` ou `KO`, sans appréciation. `PARTIEL` est réservé aux cas où le
  résultat attendu est atteint par un chemin différent de celui décrit par le plan.

---

## Vague 1 — préparation (agents 1, 4, 8)

Livrables déposés, pas de cas exécuté à ce stade. Les constats `C-01` à `C-12` de la revue de
code sont des constats **de lecture** : ils deviennent des défauts du tableau seulement une
fois confirmés en exécution par les agents 2 ou 3.

| Cas | Vague | Agent | Niveau | Statut | Criticité | Réf. défaut | Commentaire |
|---|---|---|---|---|---|---|---|
| _(exemple)_ `CAS-HAB-05` | 1 | A4 | BACK | KO | MINEUR | `C-10` | Revue : `requireRole` laisse ADMIN franchir toutes les séparations de fonction — à confirmer en exécution. |

## Vague 2 — recette initiale (agents 2 et 3)

| Cas | Vague | Agent | Niveau | Statut | Criticité | Réf. défaut | Commentaire |
|---|---|---|---|---|---|---|---|
| _(exemple)_ `CAS-AUTH-01` | 2 | A2 | FRONT | OK | — | — | Connexion `agent@banque.tn` : redirection vers le tableau de bord, menu conforme au rôle AGENT. |

## Correctifs (agent principal, entre les vagues 2 et 3)

| Réf. défaut | Statut correctif | Fichiers touchés | Commentaire |
|---|---|---|---|
| _(exemple)_ `DEF-101` | `corrigé` | `server/src/routes/…` | Contrôle de la banque d'appartenance ajouté côté serveur. |

Statuts autorisés : `corrigé`, `corrigé partiellement`, `non corrigé`, `refusé` (avec
justification), `non reproduit`.

## Vague 3 — retest (agents 5 et 6)

Rejouer **tout cas `KO`, `PARTIEL` ou `BLOQUÉ` de la vague 2**, plus les cas `OK` du même
périmètre fonctionnel que les fichiers modifiés (recherche de régression).

| Cas | Vague | Agent | Niveau | Statut | Criticité | Réf. défaut | Commentaire |
|---|---|---|---|---|---|---|---|
| _(exemple)_ `CAS-AUTH-01` | 3 | A5 | FRONT | OK | — | `DEF-001` | Retest après correctif : comportement conforme, défaut clos. |

## Vague 4 — synthèse (agent 7)

| Indicateur | Valeur |
|---|---|
| Cas prévus au plan | _(agent 7)_ |
| Cas joués | _(agent 7)_ |
| `OK` / `KO` / `PARTIEL` / `BLOQUÉ` / `NON JOUÉ` | _(agent 7)_ |
| Défauts ouverts par criticité | _(agent 7)_ |
| Défauts corrigés et confirmés en vague 3 | _(agent 7)_ |
| Constats de revue confirmés en exécution | _(agent 7)_ |
| Régressions introduites par les correctifs | _(agent 7)_ |
| Avis de mise en production | _(agent 7)_ |

---

## Journal des événements d'environnement

À renseigner dès qu'un agent démarre ou arrête une instance, lance `npm test`, ou remet une
base à zéro. C'est ce qui permet d'expliquer après coup un résultat incohérent.

| Horodatage | Agent | Événement | Détail |
|---|---|---|---|
| 2026-09-21 15:50 | A8 | Préparation | Base `clicktopay_recette_back2` trouvée vide (0 table), amorcée à l'état de référence : 4 utilisateurs, 279 MCC, 0 demande. |
| 2026-09-21 15:52 | A8 | Vérification | Protocoles de démarrage et d'arrêt validés sur les ports 4011, 4012 et 4099, puis instances arrêtées. Démonstration 4000/5173 intacte. |
| 2026-09-21 15:54 | A8 | Vérification | `verifier-environnement.sh` exécuté : code 0, environnement conforme. |
