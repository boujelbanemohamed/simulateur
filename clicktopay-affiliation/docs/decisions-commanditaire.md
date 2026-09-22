# Décisions du commanditaire

Arbitrages rendus sur les questions ouvertes par l'agent 2
(`evolutions-proposees.md`, questions B-1 à B-8). Ce document fait foi : les
recommandations de l'agent 2 et les réserves du rapport de recette qui portent
sur ces points sont closes par ce qui suit, qu'elles aient été suivies ou non.

## D-1 — Le rôle administrateur conserve tous ses droits

**Question posée** (B-2) : le rôle `ADMIN` peut saisir **et** arbitrer le même
dossier, sur toutes les banques. Au regard du principe de séparation des tâches
(*maker-checker*), c'est une entorse au contrôle à quatre yeux, et le rapport de
recette en faisait un préalable à la mise en service (recommandation `R-04`,
constat de revue `C-10`, critère `CA-S-14`).

**Décision : l'administrateur garde tous les droits.** Le cumul est assumé.

**Conséquences, énoncées pour le contrôle interne.** Un compte administrateur
peut créer une demande d'affiliation, la soumettre, puis la valider lui-même, et
ce sur n'importe quelle banque de la plateforme. Aucun second regard n'est
techniquement exigé sur un dossier instruit par un administrateur. Les actions
restent intégralement journalisées — qui, quoi, quand, et depuis le lot 1 les
valeurs avant et après — de sorte que le cumul est **traçable a posteriori**,
même s'il n'est pas empêché a priori. La maîtrise du risque repose donc sur le
nombre de comptes administrateurs, sur leur attribution, et sur la relecture du
journal.

**Aucun développement.** La plateforme se comporte déjà ainsi.

`R-04` est close par décision, non par correction. La recommandation reste
consultable au rapport de recette ; elle n'est pas à reprendre.

## D-2 — Le dossier est rempli par la banque, le marchand n'a aucun accès

**Question posée** (B-1) : tous les prestataires étudiés par la veille font
remplir le dossier par le marchand lui-même, par un espace dédié ou par un lien
de pré-saisie. Fallait-il ouvrir la plateforme au marchand ?

**Décision : non. La banque saisit l'ensemble des informations ; le marchand n'a
aucune visibilité sur la plateforme.**

**Conséquences.** L'écart relevé par la veille est assumé : la saisie reste
entièrement à la charge de l'agence, y compris les rubriques que seul le
marchand connaît (adresse du site, langues, modalités de livraison, volumétrie).
Le marchand ne suit pas l'avancement de son dossier et n'est pas sollicité par
la plateforme en cas de complément requis — l'agence le contacte par ses propres
moyens. En contrepartie, la plateforme reste un outil purement interne : aucune
surface exposée à l'extérieur, aucun compte à gérer hors de la banque, aucun
support marchand à organiser.

**Aucun développement.** Les évolutions qui en dépendaient sont écartées :
lien de pré-saisie à usage unique, espace marchand, suivi de dossier côté
marchand, notification du marchand.

> **Point à confirmer.** La décision dit « le banquier remplit l'ensemble des
> informations ». La plateforme distingue aujourd'hui deux rôles internes :
> l'`AGENT` saisit le dossier, le `BANQUIER` l'arbitre. Cette lecture est
> conservée — c'est la **banque** qui remplit tout, par opposition au marchand.
> Si l'intention était que le rôle `BANQUIER` puisse lui aussi saisir des
> dossiers, et non seulement les arbitrer, c'est une modification courte à
> demander ; elle n'a pas été faite faute de certitude.

## Questions encore ouvertes

| Réf. | Question | État |
| --- | --- | --- |
| B-3 | Aller au-delà de la validation : numéro d'affiliation, terminal, commission, puis vie du contrat ? | **en attente** |
| B-6 | Faire sortir des notifications : interne seulement, ou courriel également ? | **en attente** |
| B-4 | Attacher des pièces justificatives au dossier ? | non soumise |
| B-5 | Souscrire un contrôle externe (registre du commerce, sanctions) ? | non soumise |
| B-7 | Déplacer le jeton d'authentification du stockage local vers un cookie ? | non soumise |
| B-8 | Quels seuils pour le profil de risque du marchand ? | non soumise |

Rien qui dépende de ces questions n'est développé.
