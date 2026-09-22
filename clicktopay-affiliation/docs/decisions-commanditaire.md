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

## D-3 — Le banquier administre sa banque

**Décision.** Le banquier est rattaché à une banque. Il y a tous les droits :

1. il crée et administre les comptes **agents** de sa banque ;
2. il gère **tous les dossiers** des agents de sa banque, pas seulement leur arbitrage ;
3. il ne voit **que** les dossiers de sa banque ;
4. un agent ne peut pas gérer les dossiers des **autres agents de sa propre banque**.

La plateforme devient ainsi une fédération de banques autonomes, l'administrateur
gardant la main au-dessus (D-1).

### Écart avec le comportement actuel

| Règle | État aujourd'hui | À faire |
| --- | --- | --- |
| Le banquier est rattaché à une banque | **acquis** — `users.bank_id` | — |
| Le banquier ne voit que les dossiers de sa banque | **acquis** — `requests.js:190` et `:200-202` refusent une demande d'une autre banque | — |
| Un agent ne peut pas **modifier** le dossier d'un autre agent | **acquis** — `requests.js:180` | — |
| Le banquier crée et administre les agents de sa banque | **manquant** — `/api/admin` est réservé au profil `ADMIN` (`routes/admin.js:55`) | ouvrir l'administration des comptes au banquier, **bornée à sa banque et au seul rôle agent** |
| Le banquier gère les dossiers de sa banque | **manquant** — la création, la modification et la soumission sont réservées au rôle `AGENT` (`routes/requests.js:47`, `:62`, `:72`) | autoriser le banquier, sur les dossiers de sa banque |
| Un agent ne **voit** pas les dossiers des autres agents | **non acquis, et non demandé explicitement** | voir la question ci-dessous |

### Bornes à ne pas franchir

Ces limites ne découlent pas de la décision mais de ce qu'elle mettrait en péril si
on l'étendait sans réfléchir :

- **Le référentiel MCC reste réservé à l'administrateur.** Il est commun à toutes
  les banques : un banquier qui désactiverait un code le retirerait à ses
  concurrents. L'administration du référentiel, son import et son historique
  restent hors de portée du banquier.
- **La création de banques reste réservée à l'administrateur.** Le banquier peut
  consulter et corriger la fiche de *sa* banque, pas en créer ni en supprimer.
- **Le banquier ne crée que des comptes agents.** Il ne peut créer ni un autre
  banquier, ni un administrateur — sans quoi il s'auto-attribuerait des pairs, et
  le contrôle de la population d'arbitres échapperait à la banque centrale de la
  plateforme.
- **Le journal d'administration est filtré sur sa banque.** Un banquier ne voit
  pas les actions faites sur les autres banques.

### Conséquence à assumer, dans le prolongement de D-1

Un banquier qui saisit un dossier peut ensuite l'arbitrer lui-même : la séparation
entre celui qui instruit et celui qui décide disparaît aussi pour lui. C'est la même
entorse au contrôle à quatre yeux que D-1 a déjà assumée pour l'administrateur, mais
elle porte cette fois sur le profil **opérationnel**, donc sur des volumes autrement
plus importants. La traçabilité reste entière — le journal conserve qui a saisi, qui
a soumis et qui a décidé, avec l'horodatage — mais la plateforme ne l'empêche plus.

Si ce n'est pas l'intention, la variante à demander est simple : le banquier gère les
dossiers de ses agents, mais ne peut pas arbitrer un dossier qu'il a lui-même saisi.
Le coût est le même.

### Question ouverte : la visibilité entre agents

La décision dit qu'un agent ne peut pas **gérer** les dossiers des autres agents de
sa banque. La modification est déjà interdite. Reste la **lecture** : aujourd'hui,
un agent voit dans sa liste tous les dossiers de sa banque, y compris ceux de ses
collègues.

Deux lectures possibles, et elles ne coûtent pas la même chose :

- **« Gérer » = agir dessus.** La lecture reste ouverte : les agents d'une même
  agence se suppléent, reprennent un dossier en l'absence d'un collègue, et le
  banquier n'a pas à servir d'intermédiaire. C'est le comportement actuel, donc
  aucun développement.
- **« Gérer » = y avoir accès.** Chaque agent ne voit que ses propres dossiers ; le
  banquier voit tout. Plus étanche, mais une absence ou un départ rend les dossiers
  d'un agent invisibles à ses collègues jusqu'à intervention du banquier.

**En l'absence de réponse, la première lecture est retenue** — c'est le comportement
actuel, et changer la visibilité sur une interprétation serait plus risqué que de la
laisser telle quelle. La bascule est courte à faire si vous tranchez autrement.

## Questions encore ouvertes

| Réf. | Question | État |
| --- | --- | --- |
| D-3 | La lecture des dossiers entre agents d'une même banque : ouverte ou cloisonnée ? | **en attente** — comportement actuel conservé |
| B-3 | Aller au-delà de la validation : numéro d'affiliation, terminal, commission, puis vie du contrat ? | **en attente** |
| B-6 | Faire sortir des notifications : interne seulement, ou courriel également ? | **en attente** |
| B-4 | Attacher des pièces justificatives au dossier ? | non soumise |
| B-5 | Souscrire un contrôle externe (registre du commerce, sanctions) ? | non soumise |
| B-7 | Déplacer le jeton d'authentification du stockage local vers un cookie ? | non soumise |
| B-8 | Quels seuils pour le profil de risque du marchand ? | non soumise |

Rien qui dépende de ces questions n'est développé.
