# Revue de code du lot 1 — évolutions EVO-01 à EVO-12

> Commit relu : `c9abaf3` « Livrer le lot 1 des évolutions : consolidation »,
> comparé à `154edba`. Références croisées : `docs/evolutions-proposees.md`
> (cahier des charges) et `docs/journal-lot1.md` (compte rendu de l'auteur).
>
> **Méthode.** Rien n'est retenu sur la seule lecture : chaque constat de gravité
> bloquante ou majeure est accompagné d'une exécution réelle. La base de revue
> `revue_lot1` a été créée pour l'occasion, peuplée à la main, et détruite en
> partant ; `clicktopay` et `clicktopay_test` n'ont pas été touchées. Les tests
> importants ont été éprouvés par mutation : la garde est retirée, le test doit
> rougir, la garde est remise.
>
> **Aucun fichier du projet n'a été modifié**, hors le présent document. Les
> mutations sont appliquées puis annulées par un harnais qui restaure le fichier
> d'origine ; l'état du dépôt est vérifié après chaque passe.
>
> Le code est relu tel qu'il se présente dans l'arborescence de travail, qui
> porte deux commits postérieurs (`78d44b0`, `3c03b25`, habilitation du
> banquier) : c'est cette version-là qui partirait en service.

*(document en cours de rédaction — voir la section « État de la revue » en fin
de fichier)*

---

## Sommaire

1. Ce que le lot fait bien
2. Constats — bloquants
3. Constats — majeurs
4. Constats — mineurs
5. Les quatre points signalés par l'auteur
6. Ce que j'ai éprouvé par mutation
7. Ce que je soupçonne sans l'avoir prouvé
8. Synthèse

---

