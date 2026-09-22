# Tests d'utilisation — lot 1

Campagne menée à l'écran, en conditions d'usage, sur l'instance de démonstration
(front `http://localhost:5173`, API `http://127.0.0.1:4000`), pilotée par Chromium.

**Code éprouvé** : l'API et le front ont été **arrêtés puis relancés** depuis le
dépôt au commit `a5e046b` (lot 1 = `c9abaf3`) avant le premier test. Aucun
constat de ce document ne porte sur une instance restée sur du code antérieur.

Deux natures de constats, distinguées partout :

- **Défaut** — le produit ne fait pas ce qu'il annonce ou ce qu'on attend de lui ;
- **Gêne** — il le fait, mais l'utilisateur en pâtit.

Gravités : **bloquant** · **majeur** · **moyen** · **mineur**.

---

## 1. Ce qui a été parcouru

| Parcours | État |
| --- | --- |
| Connexion, échec de connexion, déconnexion | parcouru |
| Changement de mot de passe imposé après réinitialisation | parcouru |
| Saisie d'une demande de bout en bout (5 étapes) | parcouru |
| Propositions MCC, arbitrage réseau par réseau, recherche manuelle | parcouru |
| Soumission et fiche de la demande | parcouru |
| Décisions du banquier : validation, rejet, complément requis | parcouru |
| Reprise après complément requis | parcouru |
| Administration : comptes, banques, référentiel | parcouru |
| Import d'une édition : simulation, double confirmation, réactivation | parcouru |
| Journal d'administration : pagination, valeurs avant/après, mot de passe | parcouru |
| Ergonomie mobile 375 × 812 | parcouru |
| Erreurs JavaScript en console | surveillées sur tout le parcours |

---

## 2. Vérification des points annoncés du lot 1

| Réf. | Attendu à l'écran | Constat |
| --- | --- | --- |
| EVO-04 | Le journal montre le changement de mot de passe par l'utilisateur | (voir §4) |
| EVO-05 | Valeurs avant / après (« Rôle : agent → banquier ») | (voir §4) |
| EVO-06 | Journal paginé, « entrées 101 à 200 sur N », filtres appliqués | (voir §4) |
| EVO-08 | La fiche affiche le libellé du code retenu | **conforme** — la fiche de la demande `AFF-2026-00030` affiche « Proposé par l'agent — Visa : **5977 — Cosmétiques et parfumerie** », libellé inclus, et non le seul code. |
| EVO-09 | Un code réintroduit après désactivation ressort en « réactivé » | (voir §4) |
| EVO-02 | Jamais de proposition sans code ni libellé, même sans `5999` | (voir §4) |
| — | Liste des demandes paginable au-delà de 50 dossiers | (voir §4) |

---

## 3. Défauts et gênes

*(section rédigée au fil de la campagne)*
