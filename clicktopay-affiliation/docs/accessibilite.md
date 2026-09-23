# Accessibilité et usage mobile — ClickToPay Affiliation

Campagne menée le 23 septembre 2026 sur l'instance de démonstration
(front `localhost:5173`, API `127.0.0.1:4000`), sur la version de l'interface
issue du commit `3a7ac2e` — tableau de bord, détail de demande et écrans
d'administration ayant été remaniés le jour même.

Référentiel appliqué : WCAG 2.1 niveau AA, complété des critères 2.4.11
(apparence du focus) et 2.5.8 (taille des cibles) de WCAG 2.2. Le seuil de
cible retenu par le commanditaire est **32 × 32 px**, plus exigeant que les
24 × 24 px de la norme.

Méthode : instrumentation Chromium. Chaque couleur de texte est recomposée
sur son fond effectif — calques semi-transparents et `opacity` hérités
compris — puis le rapport de contraste est calculé selon la formule WCAG. Les
dimensions de cible sont lues sur le rectangle de rendu réel. Les indicateurs
de focus sont mesurés par différence de pixels entre l'état au repos et
l'état focalisé. Les couleurs de `::placeholder`, que le DOM n'expose pas,
sont relevées par échantillonnage de la capture d'écran.

Le calcul a été contrôlé contre la mesure pixel : sur le placeholder du champ
« Adresse du site », la composition donne 4,59:1 et l'échantillonnage 4,61:1
— 0,02 d'écart. Les valeurs calculées de ce document sont donc fiables.

**Aucune valeur de ce document n'est une appréciation : toutes sont mesurées.**

Parcours couverts : 25 relevés d'écran, les trois profils (agent, banquier,
administrateur), les cinq étapes du formulaire, les états normal, survol,
focus, désactivé, erreur, succès, chargement et lecture seule, aux largeurs
1440, 640, 375 et 320 px.

---

## 1. Ce qui est conforme

Il faut le dire d'emblée, parce que c'est l'essentiel de la surface mesurée.

- **Le texte est très largement au-dessus du seuil.** Sur 3 815 nœuds de
  texte relevés, 6 sont en écart, dont 2 relèvent d'un état désactivé que la
  norme exempte. Le corps de texte courant (`--gris-700` #3e4c59 sur blanc)
  mesure **8,81:1**, les titres (`--bleu-900` #0b2545 sur blanc) **15,39:1**.
- **Les étiquettes de statut sont toutes conformes**, dans les cinq teintes :
  Brouillon **7,91:1**, Soumise **10,24:1**, Complément requis **6,34:1**,
  Validée **7,82:1**, Rejetée **5,58:1**. C'était l'objet de la correction de
  la campagne précédente, et elle tient.
- **Les mentions nouvelles tiennent aussi.** Le jeton « hors de votre
  périmètre » de l'écran des comptes mesure **7,91:1** (#3e4c59 sur #f0f3f6,
  12 px) ; le jeton « mot de passe à changer » **6,34:1** ; le jeton « vous »
  **7,91:1** ; le bandeau « Changement de mot de passe requis » de l'en-tête
  **9,67:1**.
- **Les liserés de statut des compteurs du tableau de bord sont conformes**,
  y compris le plus pâle : À traiter **5,59:1**, Brouillons **3,66:1**,
  Compléments **4,44:1**, Validées **4,96:1**, Rejetées **6,54:1** — seuil
  3:1. Et le statut n'y est jamais porté par la seule couleur : chaque
  compteur affiche son libellé en toutes lettres.
- **Tous les états de survol restent au-dessus du seuil** : bouton primaire
  5,59 → **11,81:1**, bouton secondaire 11,81 → **10,60:1**, lien de
  navigation 11,81 → **8,79:1**, lien de profil 15,39 → **12,21:1**, onglet
  d'administration 8,35 → **11,19:1**, ligne de tableau survolée 14,76 →
  **13,98:1**.
- **Aucune cible interactive n'est sous 32 px sur poste de bureau** : sur
  526 cibles mesurées, le minimum est 32,0 px de hauteur (`.bouton--petit`,
  `min-height: 32px`, posé lors de la campagne précédente). Les quatre cases
  à cocher de l'application font 18,4 × 18,4 px, mais leur libellé associé
  par `for`/`id` est cliquable et mesure **32 px de haut** (158,7 à 319,1 px
  de large) : la cible effective est donc conforme. Aucune cible sous 32 px
  non plus à 375 px ni à 320 px.
- **La tabulation ne rencontre aucun piège** sur les six parcours
  instrumentés : le focus revient toujours au premier élément, jamais bloqué.
- **L'ordre de tabulation suit l'ordre visuel** : 0 remontée sur les
  6 parcours mesurés en coordonnées absolues (tableau de bord, comptes,
  formulaire modifiable, formulaire en lecture seule, arbitrage, référentiel).
- **Le conteneur rendu inerte se comporte comme demandé.** Sur
  `/demandes/19/modifier`, la tabulation enchaîne les 5 éléments de l'en-tête,
  les 5 onglets d'étape, puis saute directement les 9 champs figés pour
  atteindre « Voir la demande » et « Suivant ». Les champs sont hors du
  parcours, les boutons de navigation restent atteignables. C'est exactement
  le comportement attendu.
- **La structure est saine** : un seul `h1` sur chacun des 25 relevés, aucun
  saut de niveau, `lang="fr"` sur `<html>`, un `<main>` et un `<header>`
  uniques, `<nav>` présent. Les 83 champs mesurés ont tous un `<label for>`
  — aucun champ sans libellé. Les groupes du formulaire sont en
  `fieldset`/`legend` (Site marchand, Société, Contact du e-commerçant,
  Adresse physique, Coordonnées bancaires, Activité du e-commerçant, Codes
  MCC proposés, Rechercher un autre code). Les 10 tableaux sont de vrais
  `<table>` avec `<thead>` et `<th>`. Les boutons sont des `<button>`, les
  liens des `<a href>` : aucun faux bouton dans toute l'application, à
  l'exception traitée en ACC‑01.
- **Le zoom 200 % ne casse rien.** À 640 × 512 px CSS (poste 1280 × 1024
  zoomé à 200 %), les 8 écrans mesurés : 0 débordement horizontal,
  0 chevauchement de blocs, navigation entièrement visible.
- **Le mobile 375 px est propre** : sur les 11 écrans mesurés,
  `scrollWidth` = 375 partout, 0 élément débordant, gouttière de 16 px
  gauche et droite exactement, police minimale 12 px, formulaires en une
  colonne, tableaux confinés dans leur cadre de défilement.
- **L'erreur n'est jamais portée par la seule couleur** : la bordure rouge du
  champ (#b3261e, **6,54:1**) est doublée d'un message en toutes lettres
  sous le champ (**6,54:1**) et d'une bannière récapitulative en haut
  (**8,65:1**) qui énumère chaque champ fautif par son libellé métier.
- **Les bannières portent un rôle ARIA** : `role="alert"` pour les erreurs,
  `role="status"` pour l'information et le succès. Vérifié à l'exécution sur
  l'erreur de connexion et sur l'erreur de validation du formulaire.
- **L'état « choisi » d'une carte MCC n'est pas que visuel** : `aria-pressed`
  vaut `true`/`false` selon le cas, mesuré sur les 6 cartes de l'écran
  d'arbitrage.
- **La soumission par Entrée fonctionne** sur la connexion (vérifiée :
  identifiants erronés saisis puis Entrée, la requête part et l'erreur
  s'affiche), ainsi que sur les formulaires de compte, de banque, de mot de
  passe et de fiche MCC, tous munis d'un `onSubmit` réel.

Le produit ne part donc pas de loin. Les écarts qui suivent sont peu
nombreux, mais l'un est bloquant et deux sont systémiques.

---

## 2. Constats

### ACC-01 — Les lignes du tableau de bord sont inatteignables au clavier

**Gravité : bloquante.** — WCAG 2.1.1 Clavier (niveau A).

**Écran** : tableau de bord `/demandes`, les trois profils.
**Élément** : `main.contenu .tableau table tbody tr`.

**Mesure.** Le tableau compte **36 lignes** et **0 élément focalisable dans
`<tbody>`** (requête `a[href], button, input, select, textarea, [tabindex]` :
aucun résultat). La ligne porte `onClick={() => navigate('/demandes/' + id)}`
et `cursor: pointer`, mais ni `tabindex`, ni `role`, ni `href`. Un `focus()`
forcé sur la première ligne laisse `document.activeElement` sur `BODY` :
l'élément refuse le focus.

Le parcours au clavier de l'écran s'arrête après **15 arrêts** — en-tête,
compteurs, champ de recherche, filtre de statut, puis le conteneur de
défilement du tableau — et se referme. Aucun de ces 15 arrêts n'ouvre un
dossier.

**Conséquence.** Le tableau de bord est le point d'entrée de l'application.
Un agent qui travaille au clavier peut lire la liste de ses 36 demandes et ne
peut en ouvrir aucune. Il n'existe aucun chemin de secours à l'écran : la
référence n'est pas un lien, aucune colonne d'action n'est proposée. Seule la
saisie directe de l'URL `/demandes/17` permet de poursuivre.

**Correction proposée.** Faire de la référence un vrai lien, en gardant le
`onClick` de la ligne comme raccourci souris :

```jsx
<td className="mono"><Link to={`/demandes/${d.id}`}>{d.reference}</Link></td>
```

Le lien hérite de `a { color: var(--bleu-500) }`, soit #1b6ca8 sur blanc =
**5,59:1** (seuil 4,5:1), et d'une hauteur de ligne de 19 px : lui donner
`display: inline-block; padding: 0.4rem 0` pour atteindre les 32 px exigés.
Variante équivalente : une colonne d'action portant un `<button
className="bouton bouton--petit">Ouvrir</button>`, composant déjà présent
ailleurs et mesuré à 69,2 × 32,9 px.

---

### ACC-02 — Les cases à cocher perdent leur anneau de focus

**Gravité : majeure.** — WCAG 2.4.7 Visibilité du focus (A), 2.4.11
Apparence du focus (AA).

**Écran** : référentiel MCC `/referentiel` (`#case-interdits`) et formulaire
étape 3 (`#case-hasSubscription`, `#case-isMarketplace`,
`#case-sellsAbroad`). 4 cases au total.
**Élément** : `.champ--case input[type=checkbox]`.

**Mesure.** Contraste de l'indicateur de focus entre l'état au repos et
l'état focalisé : **1,24:1** — le pixel le plus contrasté passe de
rgb(249, 252, 255) à rgb(215, 230, 242). Seuil : **3:1**. À titre de
comparaison, les autres cibles focalisées mesurent 18,03 à 19,03:1 (anneau
natif du navigateur) et les champs de saisie 3,66:1.

**Cause.** La règle `.champ input:focus { outline: none; border-color:
var(--bleu-500); box-shadow: 0 0 0 3px rgba(27,108,168,0.15) }` s'applique
aussi aux cases : `.champ--case` porte la classe `.champ`. Elle supprime
l'anneau natif, et ses deux substituts sont sans effet sur une case à cocher
— une case native n'a pas de bordure stylable, et le halo à 15 % d'opacité
est en pratique invisible.

**Correction proposée.** Restreindre la règle et redonner un anneau aux
cases :

```css
.champ input:not([type=checkbox]):not([type=radio]):focus,
.champ select:focus, .champ textarea:focus { /* règle actuelle */ }

.champ--case input:focus-visible {
  outline: 2px solid var(--bleu-500);
  outline-offset: 2px;
}
```

#1b6ca8 mesure **5,59:1** sur blanc, **5,30:1** sur `--gris-050`,
**5,02:1** sur `--gris-100` et **4,85:1** sur `--bleu-100` : conforme sur
tous les fonds de l'application.

---

### ACC-03 — Les bordures des champs et des cartes cliquables sont sous le seuil

**Gravité : majeure.** — WCAG 1.4.11 Contraste des éléments non textuels (AA).

**Écran** : tous. 101 occurrences mesurées sur les 25 relevés.
**Élément** : `.champ input`, `.champ select`, `.champ textarea`,
`button.mcc`, `.etape`.

**Mesure.**

| Élément | Couleur | Fond | Mesuré | Seuil |
|---|---|---|---|---|
| Bordure de champ (60 champs) | `--gris-300` #cbd2d9 | blanc | **1,53:1** | 3:1 |
| Bordure de carte MCC cliquable au repos (12 cartes) | #cbd2d9 | blanc | **1,53:1** | 3:1 |
| Trait d'étape inactive (`.etape`) | #cbd2d9 | `--gris-050` #f7f9fb | **1,45:1** | 3:1 |

Ce sont les limites des composants de saisie : la norme demande qu'elles se
distinguent de leur environnement. À 1,53:1, sur un écran d'agence vieilli ou
mal réglé, un champ vide ne se détache plus du fond de la carte.

Le trait d'étape mérite une nuance : l'étape *active* porte un trait
`--bleu-500` mesuré à **5,30:1** sur le même fond, et son libellé est en gras
900 contre 700 — l'état de progression, lui, est bien perceptible. C'est la
limite de l'étape inactive qui disparaît.

**Correction proposée.** Faire porter les limites de composant par
`--gris-500` #7b8794 au lieu de `--gris-300` :

```css
.champ input, .champ select, .champ textarea,
.mcc, .etape { border-color: var(--gris-500); }
```

Rapports recalculés pour #7b8794 : **3,66:1** sur blanc, **3,47:1** sur
`--gris-050`, **3,29:1** sur `--gris-100`, **3,18:1** sur `--bleu-100` —
conforme sur les quatre fonds de l'application. Les nuances intermédiaires
testées ne suffisent pas : #b3bcc6 donne 1,92:1, #a6b1bd 2,18:1, #9aa5b1
2,50:1, #8c98a4 2,94:1. Il faut descendre jusqu'à #7b8794.

`--gris-300` peut rester tel quel pour les séparations purement décoratives
(bordure de carte, filet de tableau), que la norme n'atteint pas.

---

### ACC-04 — Les champs obligatoires ne sont pas annoncés comme tels

**Gravité : majeure.** — WCAG 3.3.2 Étiquettes ou instructions (A), 4.1.2
Nom, rôle et valeur (A).

**Écran** : formulaire de demande (5 étapes), formulaire de compte,
formulaire de banque, mot de passe, fiche MCC.
**Élément** : `.champ label .requis`, et les `input`/`select` correspondants.

**Mesure.** Sur l'étape 1 du formulaire de demande : **9 champs,
4 astérisques visuelles, 0 champ programmatiquement requis**. Sur le
formulaire de création de compte : **6 champs, 5 astérisques, 1 seul attribut
`required`** (`#champ-bankId`).

L'astérisque est rendue par `<span className="requis" aria-hidden="true">*</span>` :
elle est explicitement retirée de l'arbre d'accessibilité, et aucun attribut
ne la remplace — ni `required`, ni `aria-required` sur les champs mesurés.

**Conséquence.** Une personne qui parcourt le formulaire à la synthèse vocale
entend « Nom du site, zone d'édition » sans savoir que le champ est
obligatoire. Elle ne l'apprend qu'après avoir tenté de soumettre. Sur un
formulaire en cinq étapes, la découverte arrive tard.

**Correction proposée.** Poser `aria-required="true"` sur le champ, et
laisser l'astérisque décorative :

```jsx
export function Champ({ label, name, erreur, aide, requis, children, ...props }) {
  const id = `champ-${name}`;
  return (
    <div className={`champ${erreur ? ' champ--erreur' : ''}`}>
      <label htmlFor={id}>{label}{requis && <span className="requis" aria-hidden="true">*</span>}</label>
      {children ?? <input id={id} name={name} aria-required={requis || undefined} {...props} />}
      …
```

`aria-required` est préférable à `required` : il expose l'information sans
déclencher la validation native du navigateur, qui doublerait la validation
serveur avec des messages en anglais.

---

### ACC-05 — Le message d'erreur d'un champ n'est pas relié à ce champ

**Gravité : majeure.** — WCAG 3.3.1 Identification des erreurs (A), 4.1.2 (A).

**Écran** : tous les formulaires.
**Élément** : `.champ--erreur .champ__erreur` et son `input` frère.

**Mesure.** Provoqué en vidant « Nom du site » puis en soumettant. Relevé sur
`#champ-siteName` :

| Attribut | Valeur mesurée | Attendu |
|---|---|---|
| `aria-invalid` sur le champ | *absent* | `"true"` |
| `aria-describedby` sur le champ | *absent* | l'`id` du message |
| `id` sur `.champ__erreur` | *absent* | requis pour la liaison |
| Message affiché | « Le nom du site est obligatoire » | — |
| Contraste du message | **6,54:1** | 4,5:1 — conforme |
| Contraste de la bordure d'erreur | **6,54:1** | 3:1 — conforme |

Visuellement, l'erreur est irréprochable : bordure rouge, message en toutes
lettres sous le champ, bannière `role="alert"` en haut qui énumère les champs
fautifs par leur libellé métier. C'est la liaison programmatique qui manque :
en revenant sur le champ, la synthèse vocale relit l'étiquette sans le motif
du rejet.

**Correction proposée.** Dans `Champ` :

```jsx
const idErreur = `${id}-erreur`;
{children ?? <input id={id} name={name}
   aria-invalid={erreur ? 'true' : undefined}
   aria-describedby={erreur ? idErreur : (aide ? `${id}-aide` : undefined)}
   {...props} />}
{aide && !erreur && <span id={`${id}-aide`} className="champ__aide">{aide}</span>}
{erreur && <span id={idErreur} className="champ__erreur">{erreur}</span>}
```

Le même `aria-describedby` sert aussi au texte d'aide quand il n'y a pas
d'erreur : il résout du même coup le second volet d'ACC‑08.

---

### ACC-06 — Le chargement n'est pas annoncé

**Gravité : moyenne.** — WCAG 4.1.3 Messages de statut (AA).

**Écran** : tableau de bord, référentiel, journal, comptes — partout où une
liste se charge.
**Élément** : `p.vide` (« Chargement… », « Chargement de la session… »).

**Mesure.** Requête API retardée de 2,5 s, relevé pendant l'attente :

| Attribut | Valeur mesurée |
|---|---|
| Texte | « Chargement… » |
| `role` | *absent* |
| `aria-live` | *absent* |
| `aria-busy` dans la page | *aucun* |

Le texte s'affiche mais rien ne le signale : la région n'est pas vivante, et
le remplacement de « Chargement… » par la liste passe inaperçu à la synthèse
vocale.

**Correction proposée.** `<p className="vide" role="status">Chargement…</p>`.
`role="status"` porte un `aria-live="polite"` implicite : l'apparition du
texte est annoncée sans interrompre la lecture en cours. Un attribut sur le
seul élément de chargement suffit — la même classe `.vide` sert aussi aux
listes vides (« Aucune action enregistrée. »), qui gagneraient le même rôle.

---

### ACC-07 — Débordement horizontal à 320 px sur deux écrans

**Gravité : moyenne.** — WCAG 1.4.10 Redistribution (AA).

**Écran** : détail de demande `/demandes/:id` et arbitrage du banquier.
**Élément** : `.grille--2`.

**Mesure.** À 320 px de large :

| Écran | `scrollWidth` | Viewport | Excédent | Blocs débordants |
|---|---|---|---|---|
| Détail de demande | **336 px** | 320 px | 16 px | 8 |
| Arbitrage du banquier | **357 px** | 320 px | 37 px | 15 |

Les 9 autres écrans mesurés à 320 px sont propres (`scrollWidth` = 320,
0 élément débordant). Tous les écrans sont propres à 375 px.

Sur l'arbitrage, le débordement atteint les champs de saisie :
`#champ-visaMcc` et `#champ-mastercardMcc` occupent de x = 37 à x = 357, soit
37 px hors de l'écran. Le banquier doit faire défiler horizontalement pour
lire ce qu'il saisit.

**Cause.** `.grille--2 { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)) }`.
Le minimum de 320 px dépasse les 288 px réellement disponibles une fois
retirées les gouttières de 16 px. Sur l'arbitrage, la grille est imbriquée
dans une carte déjà en retrait, d'où les 37 px.

Le même défaut se manifeste au **zoom 400 %** sur un poste 1280 px, qui
ramène à 320 px CSS : mêmes deux écrans, mêmes valeurs (336 et 357 px). Au
zoom 200 % (640 px CSS), les 8 écrans mesurés sont propres.

**Correction proposée et vérifiée.**

```css
.grille--2 { grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); }
```

Correctif appliqué à l'exécution et remesuré : détail 336 → **320 px**,
arbitrage 357 → **320 px**, **0 élément débordant** dans les deux cas. Le
comportement à 375 px et au-dessus est inchangé, `min()` ne mordant qu'en
dessous du seuil. `.grille` (minmax 260 px) n'est pas concernée : 260 < 288.

---

### ACC-08 — Les champs figés sortent du parcours clavier avec leur explication

**Gravité : moyenne.** — WCAG 1.3.1 Information et relations (A), 4.1.2 (A).

**Écran** : administration · comptes, formulaire de compte.
**Élément** : `#champ-role` et `#champ-bankId` en profil banquier.

**Mesure.**

| Point | Valeur mesurée |
|---|---|
| Attribut posé | `disabled` (et non `aria-disabled`) |
| Présence dans l'ordre de tabulation | **non** |
| `aria-describedby` | *absent* |
| `title` | *absent* |
| Explication visible | « Vous administrez les comptes agents de votre banque. » / « Les comptes que vous créez rejoignent votre banque. » |
| Contraste du champ figé | **5,55:1** (seuil 4,5:1 — conforme) |
| Contraste de l'explication | **8,81:1** (conforme) |

L'interface fait donc l'essentiel : **elle explique pourquoi le champ est
figé, en toutes lettres et sous le champ.** C'est plus que ce que fait la
plupart des applications. Mais `disabled` retire l'élément du parcours
clavier : une personne qui tabule d'un champ à l'autre saute par-dessus le
sélecteur *et* par-dessus son explication, et arrive au champ suivant sans
avoir su qu'un choix lui était retiré ni pourquoi.

**Correction proposée.** Conserver `disabled` pour l'affichage, et relier
l'explication par `aria-describedby` (voir ACC‑05, qui pose le mécanisme) :
même sauté, le champ reste lisible en mode parcours de formulaire. Solution
plus complète si l'ergonomie le permet : remplacer `disabled` par
`aria-disabled="true"` accompagné d'un blocage du changement dans
`onChange`, ce qui garde le champ focalisable, donc lisible, tout en le
rendant inopérant.

---

### ACC-09 — Le formulaire de demande ne se soumet pas par Entrée

**Gravité : moyenne.** — Hors critère WCAG, mais attendu sur un formulaire.

**Écran** : `/demandes/nouvelle` et `/demandes/:id/modifier`.
**Élément** : `form.carte`.

**Mesure.** Texte saisi dans `#champ-siteName`, puis Entrée : l'URL est
inchangée, aucune requête ne part, aucun message n'apparaît, l'étape ne
change pas. Le formulaire porte `onSubmit={(e) => e.preventDefault()}`.

À comparer avec la connexion, où Entrée soumet bien (vérifié : la requête
part, « Identifiants incorrects » s'affiche), et avec les formulaires de
compte, de banque et de mot de passe, tous munis d'un `onSubmit` réel.

Sur un formulaire en cinq étapes, la touche Entrée est le geste naturel pour
passer à l'étape suivante. Aujourd'hui, il faut sortir du champ à la
tabulation et traverser jusqu'au bouton « Suivant » — jusqu'à 13 tabulations
depuis le premier champ de l'étape 2.

**Correction proposée.** Faire du `onSubmit` l'action de progression, plutôt
que de l'annuler :

```jsx
<form className="carte" onSubmit={(e) => { e.preventDefault(); if (modifiable) allerEtapeSuivante(); }}>
```

et donner `type="submit"` au bouton « Suivant ». Le bouton « Soumettre » de
la dernière étape reste en `type="button"` avec son propre gestionnaire, pour
qu'une frappe involontaire n'envoie pas le dossier.

---

### ACC-10 — Le focus déplacé sur la bannière d'erreur devient invisible

**Gravité : mineure.** — WCAG 2.4.7 Visibilité du focus (A).

**Écran** : tous ceux qui affichent une `ErreurApi`.
**Élément** : le conteneur de `ErreurApi`, `<div tabIndex={-1} style={{ outline: 'none' }}>`.

**Mesure.** Après une tentative de connexion erronée, `document.activeElement`
vaut `DIV` (le conteneur), et son style calculé porte `outline: none`. Le
focus existe donc, mais rien à l'écran ne le montre.

L'intention est bonne — le composant amène la bannière dans le champ de
vision et y porte le focus, ce qui résout un vrai problème sur les écrans
longs. Mais une personne qui voit l'écran perd la trace du focus : la
tabulation suivante repart d'un point qu'elle n'avait pas identifié.

**Correction proposée.** Retirer `outline: 'none'` et laisser l'anneau natif,
mesuré à 18,03:1 sur `--gris-050` ailleurs dans l'application. Si l'anneau
autour d'un bandeau entier est jugé trop lourd, le remplacer par un liseré
explicite :

```css
.message:focus-visible { outline: 2px solid var(--bleu-900); outline-offset: 2px; }
```

#0b2545 mesure **13,35:1** sur `--bleu-100` et **15,39:1** sur blanc.

---

### ACC-11 — Le cadre de défilement des tableaux n'a ni nom ni rôle

**Gravité : mineure.** — WCAG 1.3.1 (A), 2.1.1 (A) selon le navigateur.

**Écran** : les 10 écrans porteurs d'un tableau.
**Élément** : `div.tableau`.

**Mesure.**

| Attribut | Valeur mesurée |
|---|---|
| `tabindex` | *absent* |
| `role` | *absent* |
| `aria-label` | *absent* |
| `overflow-x` | `auto` |
| `min-width` de la table | `720px` |

Le cadre apparaît malgré tout dans le parcours clavier du tableau de bord
(15ᵉ arrêt), parce que Chromium rend focalisable de lui-même toute région
défilante. L'annonce est alors le contenu entier du tableau, sans nom.
Surtout, cette focalisation automatique n'est pas garantie hors Chromium :
Firefox ne la fait pas. Sur un poste sous Firefox à 375 px, un tableau large
de 720 px n'a plus aucun moyen d'être parcouru au clavier.

**Correction proposée.** Déclarer la région explicitement plutôt que compter
sur l'heuristique du navigateur :

```jsx
export function Tableau({ children, titre = 'Tableau de données' }) {
  return <div className="tableau" tabIndex={0} role="region" aria-label={titre}>{children}</div>;
}
```

et passer un titre parlant à chaque appel (« Demandes d'affiliation »,
« Comptes utilisateurs », « Journal d'administration »…).

---

### ACC-12 — Tableaux sans `caption` ni `scope`

**Gravité : mineure.** — WCAG 1.3.1 Information et relations (A).

**Écran** : les 10 tableaux de l'application (386 lignes cumulées).

**Mesure.** **10 tableaux, 66 cellules d'en-tête, 0 portant `scope`,
0 `<caption>`.** Tous ont en revanche un `<thead>` correct et de vrais `<th>`.

Sur un tableau simple à une seule rangée d'en-tête, l'absence de `scope` est
rattrapée par la plupart des restitutions. L'absence de `caption` coûte plus
cher : le tableau des comptes et celui du journal se ressemblent, et rien ne
les nomme.

**Correction proposée.** `<th scope="col">` sur chaque en-tête, et une
`<caption>` par tableau. Si la légende fait doublon avec le `h2` de la carte,
la masquer visuellement sans la retirer de l'arbre d'accessibilité — jamais
par `display: none` :

```css
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
```

---

### ACC-13 — Les commandes désactivées descendent à 2,82:1

**Gravité : mineure.** — Hors périmètre de 1.4.3, qui exempte les composants
inactifs. Relevé pour l'usage en agence.

**Écran** : administration · comptes (« Désactiver » sur sa propre ligne),
journal (« Précédent » en première page), tout formulaire pendant l'envoi.

**Mesure.**

| Élément | Couleur composée | Fond | Mesuré |
|---|---|---|---|
| `.bouton--secondaire.bouton--petit:disabled` | rgb(125, 146, 167) | blanc | **3,21:1** |
| `.bouton:disabled` (primaire) | rgb(152, 189, 216) | #1b6ca8 | **2,82:1** |

`.bouton:disabled { opacity: 0.55 }` s'applique à tout l'élément, texte et
fond compris. La norme n'exige rien ici, mais sur un écran d'agence usé, un
bouton à 2,82:1 n'est plus lu du tout : l'utilisateur ne sait pas s'il est
désactivé ou si l'affichage est incomplet.

**Correction proposée.** Remplacer l'opacité globale par des couleurs
explicites, qui restent lisibles tout en disant clairement « inactif » :

```css
.bouton:disabled { opacity: 1; background: #4a83b2; border-color: #4a83b2; cursor: not-allowed; }
.bouton--secondaire:disabled { background: var(--gris-100); color: #6b7b8c; border-color: var(--gris-300); }
```

Rapports recalculés : blanc sur #4a83b2 = **4,05:1** ; #6b7b8c sur #f0f3f6 =
**4,06:1**. Au-dessus de 3:1 dans les deux cas, et bien au-dessus des valeurs
actuelles.

---

### ACC-14 — Le placeholder d'un champ figé descend à 3,50:1

**Gravité : mineure.** — WCAG 1.4.3 Contraste minimum (AA).

**Écran** : `/demandes/:id/modifier` sur un dossier non modifiable, quand un
champ facultatif porteur d'un placeholder est vide.
**Élément** : `::placeholder` à l'intérieur de `form > div[inert]`.

**Mesure.** Relevée par échantillonnage de pixels sur le dossier 12,
champ « Langues du site » : texte rgb(137, 137, 137) sur fond rgb(255, 255, 255)
= **3,50:1**. Seuil : 4,5:1.

Hors du conteneur inerte, le même placeholder mesure **4,61:1** : conforme,
mais de justesse. C'est le `style={{ opacity: 0.85 }}` posé sur le conteneur
inerte qui le fait basculer sous le seuil. Les autres textes du conteneur
survivent à la même opacité : étiquettes **5,80:1**, valeurs **9,14:1**,
légendes de `fieldset` **7,56:1**, astérisque d'obligation **5,04:1**.

**Correction proposée.** Deux voies, l'une ou l'autre :

- Assombrir le placeholder pour qu'il tienne la marge :
  `::placeholder { color: #5b6772 }` = **5,79:1** hors conteneur inerte,
  **4,84:1** à 0,85 d'opacité. Conforme dans les deux cas.
- Ou supprimer l'`opacity: 0.85`, qui n'apporte rien : le bandeau « Demande
  au statut Validée, elle n'est plus modifiable » (mesuré **6,34:1**) et
  l'exclusion des champs du parcours clavier disent déjà la lecture seule.

---

### ACC-15 — Pas de lien d'évitement

**Gravité : mineure.** — WCAG 2.4.1 Contourner des blocs (A).

**Écran** : tous.

**Mesure.** Aucun `a[href^="#"]` dans les 25 relevés. Nombre de tabulations à
franchir avant d'atteindre le contenu, compté sur les parcours instrumentés :
**6 arrêts** sur le tableau de bord et le formulaire, **11 arrêts** sur les
écrans d'administration (en-tête + sous-navigation). À chaque changement
d'écran.

**Correction proposée.** Un lien d'évitement en tête de `<div className="app">` :

```jsx
<a href="#contenu" className="lien-evitement">Aller au contenu</a>
…
<main className="contenu" id="contenu" tabIndex={-1}>
```

```css
.lien-evitement { position:absolute; left:-9999px; }
.lien-evitement:focus { left:0; top:0; z-index:100; padding:0.6rem 1rem;
  background:var(--blanc); color:var(--bleu-900); outline:2px solid var(--bleu-500); }
```

#0b2545 sur blanc = **15,39:1** ; anneau #1b6ca8 sur blanc = **5,59:1**.

---

### ACC-16 — Le titre de page ne distingue pas les écrans

**Gravité : mineure.** — WCAG 2.4.2 est formellement satisfait ; constat
d'usage.

**Mesure.** `document.title` vaut « ClickToPay – Affiliation des
e-commerçants » sur les **25 relevés**, sans exception.

Un banquier qui tient trois onglets ouverts — sa file, un dossier, le journal
— ne les distingue pas. Une personne à la synthèse vocale qui change d'onglet
entend trois fois la même chose.

**Correction proposée.** Poser le titre au niveau de chaque écran, par
exemple par un petit effet dans chaque page :
`Demandes d'affiliation — ClickToPay`, `AFF-2026-00019 — ClickToPay`,
`Comptes utilisateurs — ClickToPay`.

---

### ACC-17 — Le champ de date consomme quatre tabulations

**Gravité : informative.** Aucune correction attendue.

**Mesure.** Sur le formulaire, `#champ-companyCreatedOn` (`input[type=date]`)
occupe les rangs 18 à 21 du parcours : jour, mois, année, puis le bouton
d'ouverture du calendrier. Comportement natif de Chromium, identique dans
toute application web. Le dernier segment n'affiche pas de halo, l'anneau
natif restant porté par le champ entier.

Signalé uniquement pour que ce ne soit pas pris pour un défaut lors d'une
prochaine campagne.

---

## 3. Synthèse par écran

Colonnes : éléments mesurés / éléments en écart. « Texte » compte les nœuds
de texte rendus et les placeholders ; « Interface » les limites de composants
porteuses de sens ; « Cibles » les éléments interactifs mesurés contre le
seuil de 32 × 32 px.

| Écran | Texte | Interface | Cibles | Champs | Tableaux | Écarts |
|---|---|---|---|---|---|---|
| Connexion | 10 / 0 | 2 / 2 | 3 / 0 | 2 | 0 | ACC‑03 ·04 ·05 ·10 ·15 ·16 |
| Tableau de bord (agent) | 320 / 0 | 7 / 2 | 13 / 0 | 2 | 1 | **ACC‑01** ·03 ·06 ·11 ·12 ·15 ·16 |
| Tableau de bord (banquier) | 321 / 0 | 7 / 2 | 14 / 0 | 2 | 1 | **ACC‑01** ·03 ·06 ·11 ·12 ·15 ·16 |
| Tableau de bord (admin) | 321 / 0 | 7 / 2 | 14 / 0 | 2 | 1 | **ACC‑01** ·03 ·06 ·11 ·12 ·15 ·16 |
| Formulaire ét. 1 — Site et société | 41 / 0 | 14 / 13 | 21 / 0 | 9 | 0 | ACC‑03 ·04 ·05 ·09 ·15 ·16 |
| Formulaire ét. 2 — Contact et adresse | 47 / 0 | 18 / 16 | 26 / 0 | 13 | 0 | ACC‑03 ·04 ·05 ·09 ·15 ·16 |
| Formulaire ét. 3 — Activité | 41 / 0 | 12 / 9 | 23 / 0 | 10 | 0 | **ACC‑02** ·03 ·04 ·05 ·09 ·15 ·16 |
| Formulaire ét. 4 — Codes MCC | 80 / 0 | 9 / 5 | 26 / 0 | 4 | 0 | ACC‑03 ·04 ·05 ·09 ·15 ·16 |
| Formulaire ét. 5 — Récapitulatif | 63 / 0 | 5 / 0 | 13 / 0 | 0 | 0 | ACC‑09 ·15 ·16 |
| Modifier (dossier modifiable) | 41 / 0 | 14 / 13 | 21 / 0 | 9 | 0 | ACC‑03 ·04 ·05 ·09 ·15 ·16 |
| Modifier (lecture seule, `inert`) | 43 / 3 | 14 / 13 | 21 / 0 | 9 | 0 | ACC‑03 ·14 ·15 ·16 |
| Détail (brouillon) | 77 / 0 | 0 / 0 | 8 / 0 | 0 | 0 | ACC‑07 ·15 ·16 |
| Détail (validée) | 125 / 0 | 0 / 0 | 6 / 0 | 0 | 0 | ACC‑07 ·15 ·16 |
| Arbitrage (banquier) | 129 / 0 | 3 / 3 | 19 / 0 | 3 | 0 | ACC‑03 ·05 ·07 ·10 ·15 ·16 |
| Référentiel MCC | 263 / 0 | 1 / 1 | 7 / 0 | 2 | 0 | **ACC‑02** ·03 ·06 ·15 ·16 |
| Mot de passe | 17 / 0 | 3 / 3 | 9 / 0 | 3 | 0 | ACC‑03 ·04 ·05 ·15 ·16 |
| Admin · Comptes (banquier) | 58 / 0 | 2 / 1 | 17 / 0 | 1 | 1 | ACC‑03 ·04 ·05 ·08 ·11 ·12 ·15 ·16 |
| Admin · Comptes (admin) | 120 / 1 | 2 / 1 | 43 / 0 | 1 | 1 | ACC‑03 ·04 ·05 ·11 ·12 ·13 ·15 ·16 |
| Admin · Banques (banquier) | 28 / 0 | 1 / 0 | 10 / 0 | 0 | 1 | ACC‑04 ·05 ·11 ·12 ·15 ·16 |
| Admin · Banques (admin) | 48 / 0 | 1 / 0 | 18 / 0 | 0 | 1 | ACC‑04 ·05 ·11 ·12 ·15 ·16 |
| Admin · Journal (banquier) | 522 / 1 | 1 / 0 | 11 / 0 | 0 | 1 | ACC‑11 ·12 ·13 ·15 ·16 |
| Admin · Journal (admin) | 524 / 1 | 1 / 0 | 13 / 0 | 0 | 1 | ACC‑11 ·12 ·13 ·15 ·16 |
| Admin · Référentiel MCC | 509 / 0 | 2 / 1 | 135 / 0 | 1 | 1 | ACC‑03 ·04 ·05 ·11 ·12 ·15 ·16 |
| Admin · Import du référentiel | 26 / 0 | 2 / 1 | 14 / 0 | 1 | 0 | ACC‑03 ·04 ·05 ·15 ·16 |
| **Total** | **3 815 / 6** | **142 / 101** | **526 / 0** | **83 / 0** | **10 / 10** | — |

Les 12 cartes MCC cliquables de l'arbitrage et de l'étape 4 (bordure à
1,53:1) sont décrites dans ACC‑03 mais ne sont pas comptées dans la colonne
« Interface », que l'instrumentation réserve aux bordures de champ, liserés
de compteur et traits d'étape.

Sur les 6 écarts de texte : 3 sont les placeholders du conteneur inerte
(ACC‑14), 3 sont des boutons désactivés (ACC‑13), que la norme exempte.

---

## 4. Synthèse par catégorie

| Catégorie | Mesurés | En écart | Constats |
|---|---|---|---|
| Contraste du texte | 3 815 | 6 | ACC‑13, ACC‑14 |
| Contraste des éléments d'interface | 142 | 101 | ACC‑03 |
| Contraste des indicateurs de focus | 16 | 1 | ACC‑02 |
| Cibles interactives (bureau) | 526 | 0 | — |
| Cibles interactives (375 px et 320 px) | 312 | 0 | — |
| Clavier — pièges | 6 parcours | 0 | — |
| Clavier — ordre de tabulation | 6 parcours | 0 | — |
| Clavier — éléments atteignables | 36 lignes de tableau | 36 | ACC‑01 |
| Clavier — contournement du bloc inerte | 1 écran | 0 | — |
| Structure — `h1` unique, hiérarchie | 25 écrans | 0 | — |
| Structure — `label` associé | 83 champs | 0 | — |
| Structure — `fieldset`/`legend` | 8 groupes | 0 | — |
| Structure — tableaux (`scope`, `caption`) | 10 tableaux | 10 | ACC‑12 |
| Structure — lien d'évitement | 25 écrans | 25 | ACC‑15 |
| Structure — titre de page distinct | 25 écrans | 25 | ACC‑16 |
| Restitution — champs obligatoires | 15 champs requis | 14 | ACC‑04 |
| Restitution — liaison champ ↔ erreur | 1 formulaire instrumenté | 1 | ACC‑05 |
| Restitution — rôle des bannières | 4 types de message | 0 | — |
| Restitution — chargement annoncé | 1 état instrumenté | 1 | ACC‑06 |
| Restitution — motif des champs figés | 2 champs | 2 | ACC‑08 |
| Mobile 375 px — débordement | 12 écrans | 0 | — |
| Mobile 320 px — débordement | 12 écrans | 2 | ACC‑07 |
| Zoom 200 % (640 px) | 9 écrans | 0 | — |
| Zoom 400 % (320 px) | 8 écrans | 2 | ACC‑07 |

---

## 5. Les trois corrections les plus rentables

1. **ACC‑01, la ligne cliquable du tableau de bord.** Une ligne de JSX
   — faire de la référence un `<Link>` — rend au clavier le point d'entrée
   de toute l'application. C'est le seul constat qui empêche de travailler,
   et c'est le moins cher à corriger.

2. **ACC‑03, `--gris-300` → `--gris-500` sur les bordures de composant.**
   Une déclaration CSS corrige **101 occurrences** sur les 25 écrans, et fait
   passer de 1,53:1 à 3,66:1 la limite de tous les champs de saisie et de
   toutes les cartes MCC. La valeur de remplacement est mesurée conforme sur
   les quatre fonds de l'application.

3. **ACC‑04 et ACC‑05 ensemble, dans le composant `Champ`.** Le même fichier,
   la même fonction, une dizaine de lignes : `aria-required`, `aria-invalid`,
   `aria-describedby` et un `id` sur le message d'erreur. Cela couvre les
   **83 champs** de l'application d'un coup, et résout du même mouvement le
   second volet d'ACC‑08.

Viennent ensuite, par rapport effort/gain : ACC‑07 (une déclaration CSS,
correctif déjà vérifié à l'exécution), ACC‑02 (un sélecteur à restreindre) et
ACC‑06 (un attribut `role="status"`).

---

## 6. Avis sur l'usage en agence

L'interface a manifestement été travaillée : contrastes de texte confortables,
cibles toutes au-dessus de 32 px, structure HTML propre, formulaires
correctement étiquetés et groupés, messages d'erreur clairs et jamais réduits
à une couleur. Le comportement du conteneur inerte — champs hors du parcours
clavier, boutons de navigation conservés — est exactement ce qu'il fallait
faire, et c'est rare. Le mobile 375 px, le zoom 200 % et les écrans
d'administration récents ne présentent aucun défaut de mise en page. Sur ces
plans, le produit est au-dessus de la moyenne des applications métier.

La réserve porte sur le travail sans souris. Sur les écrans d'administration,
il est faisable : les actions sont des boutons, l'ordre de tabulation est
logique, le focus est visible. Sur le tableau de bord, il s'arrête net : les
36 lignes de dossier ne sont pas atteignables, et aucun chemin de rechange
n'est offert à l'écran. Un agent qui travaille au clavier — parce qu'il est
rapide, ou parce qu'il n'a pas le choix — se retrouve devant sa liste sans
pouvoir en ouvrir une seule entrée. Pour une plateforme destinée à des
agences bancaires, c'est le point à traiter en premier, et il se corrige en
une ligne.

Le second angle mort est la restitution à la synthèse vocale : visuellement
tout est dit — l'astérisque, le message sous le champ, l'explication du champ
figé — mais rien de cela n'est relié programmatiquement. Une personne qui
n'accède qu'au texte restitué perd l'obligation des champs, le motif du rejet
et la raison d'un champ gelé. Ce n'est pas de l'oubli global : c'est que la
mise en forme a été faite et la liaison ARIA pas encore. Les deux se posent
dans le même composant partagé, ce qui en fait une correction courte pour un
gain sur toute l'application.

Enfin, deux écarts sont des sujets d'écran : la bordure de champ à 1,53:1 et
le débordement à 320 px. Le premier pèse précisément là où le commanditaire
le craignait — sur un poste ancien, un champ vide ne se distingue plus du
fond de la carte. Le second ne se manifeste qu'à 320 px, cas minoritaire mais
réel, et sur l'écran d'arbitrage il repousse les champs de saisie hors de
l'écran.

En l'état : **utilisable à la souris sur tous les écrans, à tous les
grossissements jusqu'à 200 %, et sur mobile 375 px sans réserve ; inutilisable
au clavier depuis le tableau de bord.** Les corrections listées au § 5 sont
toutes de faible ampleur et ramèneraient l'ensemble dans le seuil.

---

*Aucun fichier du projet n'a été modifié dans le cadre de cette campagne,
hormis ce document. Aucune donnée de l'instance de démonstration n'a été
créée ni modifiée : tous les dossiers, comptes et banques observés
préexistaient. Les scripts de mesure et les captures d'écran sont conservés
hors du dépôt.*
