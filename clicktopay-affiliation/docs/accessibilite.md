# Accessibilité et usage mobile — ClickToPay Affiliation

Campagne menée le 23 septembre 2026 sur l'instance de démonstration
(front `localhost:5173`, API `127.0.0.1:4000`), sur la version de l'interface
issue du commit `3a7ac2e` (tableau de bord, détail de demande et écrans
d'administration remaniés le jour même).

Référentiel appliqué : WCAG 2.1 niveau AA, complété des critères 2.4.11
(apparence du focus) et 2.5.8 (taille des cibles) de WCAG 2.2. Le seuil de
cible retenu par le commanditaire est **32 × 32 px**, plus exigeant que les
24 × 24 px de la norme.

Méthode : instrumentation Chromium (Playwright). Chaque couleur de texte est
recomposée sur son fond effectif — calques semi-transparents et `opacity`
hérités compris — puis le rapport de contraste est calculé selon la formule
WCAG. Les dimensions de cible sont lues sur le rectangle de rendu réel. Rien
n'est estimé à l'œil.

**Aucune valeur de ce document n'est une appréciation : toutes sont mesurées.**

---

## 1. Ce qui est conforme

Il faut le dire d'emblée, parce que c'est l'essentiel de la surface mesurée.

- **Le texte est très largement au-dessus du seuil.** Sur 3 309 nœuds de
  texte relevés à travers 25 relevés d'écran, 5 sont en écart, et 4 d'entre
  eux relèvent du même défaut unique (champs figés par `inert`). Le corps de
  texte courant (`--gris-700` #3e4c59 sur blanc) mesure **8,81:1**, les
  titres (`--bleu-900` #0b2545 sur blanc) **15,39:1**.
- **Les étiquettes de statut sont toutes conformes**, dans les cinq teintes :
  Brouillon **7,91:1**, Soumise **10,24:1**, Complément requis **6,34:1**,
  Validée **7,82:1**, Rejetée **5,58:1**. C'est la correction de la campagne
  précédente, et elle tient.
- **Le jeton « hors de votre périmètre »**, nouveau sur l'écran des comptes,
  mesure **7,91:1** (#3e4c59 sur #f0f3f6, 12 px). Conforme.
- **Aucune cible interactive n'est sous 32 px sur poste de bureau** : le
  minimum relevé sur 524 cibles est 32,0 px de hauteur
  (`.bouton--petit`, `min-height: 32px`). Les cases à cocher font 18,4 ×
  18,4 px mais leur libellé associé, cliquable, mesure 32 px de haut (voir
  § 3).
- **La structure est saine** : un seul `h1` par écran sur les 25 écrans
  mesurés, aucun saut de niveau, `lang="fr"` sur `<html>`, un `<main>` et un
  `<header>` uniques, tous les champs associés à un `<label for>` (83 champs
  mesurés, 0 sans libellé), les tableaux en `<table>` avec `<thead>` et
  `<th>`, les boutons en `<button>` et les liens en `<a href>` — aucun faux
  bouton (`div[onclick]`) sur l'ensemble de l'application.

Le produit ne part donc pas de loin. Les écarts qui suivent sont peu nombreux
mais deux d'entre eux sont systémiques : ils touchent chaque écran.

---

*(document en cours de rédaction — sections suivantes en cours de mesure)*
