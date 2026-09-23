# Tests d'utilisation — lot 1 et décision D-3

Campagne menée à l'écran, en conditions d'usage, sur l'instance de démonstration
(front `http://localhost:5173`, API `http://127.0.0.1:4000`), pilotée par
Chromium. Le produit est éprouvé comme le feraient ses utilisateurs : un agent
d'agence, un banquier, un administrateur de la plateforme.

**Code éprouvé.** L'instance sert bien le code courant, et c'est vérifiable :
l'arbre de travail est propre au commit `ca06470` (« Corriger les trois
observations de la non-régression »), le fichier source le plus récent date du
23/09/2026 à 13:27:28 et le commit de 13:29:43 ; les deux processus servis ont
démarré **après** — l'API à 13:31:53, le serveur de développement du front à
13:32:06. Aucun constat de ce document ne porte sur une instance restée sur du
code antérieur.

**Reprise de campagne.** Ce document a été commencé par deux campagnes
précédentes, interrompues avant leur terme. Il est repris ici, non réécrit. Deux
corrections d'importance y ont été portées à la reprise, et signalées comme
telles :

- la **réserve d'environnement est levée**. La base de cette instance est
  désormais migrée (`admin_events.bank_id` existe) : les trois écrans qui
  tombaient en « Erreur interne du serveur » ont été repris et menés à leur
  terme. Voir `UTI-18`, requalifié ;
- le **référentiel de l'instance avait dérivé** au moment de la campagne
  précédente ; il est rétabli. Les trois jeux de référence rendent bien
  aujourd'hui `5977:74, 7230:66, 7298:63, 5912:57, 5999:50` avec le secteur
  beauté, `5977:54, 5999:50` sans secteur, et `5999:10` seul sur un descriptif
  sans correspondance — mesuré à la reprise. Les chiffres de `UTI-19` ont donc
  été **remesurés** ; le constat tient, ses valeurs ont changé.

Deux natures de constats, distinguées partout :

- **Défaut** — le produit ne fait pas ce qu'il annonce ou ce qu'on attend de lui ;
- **Gêne** — il le fait, mais l'utilisateur en pâtit.

Gravités : **bloquant** · **majeur** · **moyen** · **mineur**.

---

## 1. Ce qui a été parcouru

| Parcours | État |
| --- | --- |
| Connexion, échec de connexion, changement de mot de passe imposé | parcouru |
| Saisie d'une demande de bout en bout (5 étapes) | parcouru |
| Propositions MCC, arbitrage réseau par réseau, recherche manuelle | parcouru |
| Soumission et fiche de la demande | parcouru |
| Décisions du banquier : validation, rejet, complément requis | parcouru |
| Reprise après complément requis | parcouru |
| D-3 — le banquier administrateur de sa banque, ses cinq écrans | parcouru |
| D-3 — le banquier saisit, modifie, soumet, arbitre, reprend un dossier d'agent | parcouru |
| Cloisonnement de l'agent (aucune administration) | parcouru |
| Administration : comptes, banques | **interrompu** — voir `UTI-18` |
| Administration : référentiel MCC, désactivation et réactivation de `5999` | parcouru |
| Import d'une édition : simulation, double confirmation | parcouru |
| Journal d'administration : pagination, valeurs avant/après | parcouru pour l'administrateur, **interrompu** pour le banquier (`UTI-18`) |
| Liste des demandes paginable au-delà de cinquante | parcouru |
| Ergonomie mobile 375 × 812 | parcouru |
| Erreurs JavaScript en console | surveillées sur tout le parcours |

---

## 2. Vérification des points annoncés

### 2.1 Le banquier administrateur de sa banque (D-3) — le correctif tient

La revue précédente avait relevé que l'interface ne donnait pas au banquier le
droit principal de la décision : son dossier restait figé au brouillon, sans
bouton pour le modifier ni le soumettre. **C'est corrigé, et vérifié de bout en
bout sur l'instance courante.**

| Attendu | Constat |
| --- | --- |
| « Administration » montre **trois onglets sur cinq** : Comptes, Banques, Journal | **conforme** — les deux onglets « Référentiel MCC » et « Import du référentiel » ne lui sont pas proposés |
| L'URL directe d'un onglet interdit le renvoie aux Comptes | **conforme** — `/administration/referentiel` et `/administration/import` renvoient tous deux sur `/administration/comptes` |
| À la création d'un compte, le **rôle est figé sur « Agent »** | **conforme** — le sélecteur ne contient que `AGENT/Agent` et porte l'attribut `disabled`, avec la mention « Vous administrez les comptes agents de votre banque. » |
| Sa **banque est pré-remplie et figée** | **conforme** — `BQ001 — Banque Nationale de Tunisie` sélectionnée, sélecteur `disabled`, mention « Les comptes que vous créez rejoignent votre banque. » |
| Les lignes hors périmètre portent « hors de votre périmètre » | **conforme** — les lignes `admin@clicktopay.tn` et `banquier@banque.tn` portent la mention en lieu et place des trois boutons ; les lignes agents gardent « Modifier / Mot de passe / Désactiver » |
| Écran des banques : ni « + Nouvelle banque » ni « Désactiver » | **conforme** — seul « Modifier » est proposé, et la liste ne contient que sa propre banque |
| Il **saisit** un dossier | **conforme** — `/demandes/nouvelle` accessible, `AFF-2026-00067` créé en brouillon |
| Il le **modifie** | **conforme** — « Modifier » présent sur la fiche du brouillon, écran « Modifier la demande » accessible |
| Il le **soumet** | **conforme** — « Soumettre au banquier » présent et opérant, statut passé à « Soumise » |
| Il l'**arbitre** | **conforme** — les trois boutons « Valider l'affiliation / Demander un complément / Rejeter » apparaissent sur son propre dossier, et la demande de complément aboutit |
| Il **reprend le dossier d'un de ses agents** | **conforme** — `AFF-2026-00064`, « saisie par Salma Ben Ali », porte bien « Modifier » et « Soumettre au banquier » |
| Le tableau de bord n'a plus de filtre par défaut | **conforme** — le sélecteur de statut est sur « Tous les statuts », le titre est « Toutes les demandes », et le brouillon que le banquier vient de saisir figure en tête de liste |
| L'**agent** n'a aucune entrée « Administration » | **conforme** — sa barre ne porte que Demandes, Nouvelle demande, Référentiel MCC |
| L'URL directe renvoie l'agent aux demandes | **conforme** — les six URL `/administration*` renvoient toutes sur `/demandes` |

Le constat `UTI-01` de la revue précédente (le rôle de l'administrateur affiché
« Agent » au banquier) **est sans objet** : la ligne de l'administrateur ne porte
plus de bouton « Modifier ». Le constat `UTI-02` (des actions offertes puis
refusées en 403) **est corrigé** au même endroit.

### 2.2 Les points visibles du lot 1

| Réf. | Attendu à l'écran | Constat |
| --- | --- | --- |
| EVO-04 | Le journal montre le changement de mot de passe | **conforme** (voir §4.6) |
| EVO-05 | Valeurs avant / après (« Rôle : agent → banquier ») | **conforme** (voir §4.6) |
| EVO-06 | Journal paginé, « entrées 101 à 200 sur N » | **conforme** — l'administrateur lit « entrées 1 à 100 sur 132 » puis « entrées 101 à 132 sur 132 » |
| EVO-08 | La fiche affiche le libellé du code retenu | **conforme** — la fiche porte « Proposé par l'agent — Visa : **5977 — Cosmétiques et parfumerie** », libellé inclus |
| EVO-09 | Un code réintroduit après désactivation ressort en « réactivé » | **conforme** (voir §4.7) |
| EVO-02 | Jamais de proposition sans code ni libellé, même sans `5999` | **conforme** — éprouvé à l'écran, voir §2.3 |
| — | Liste des demandes paginable au-delà de 50 dossiers | **conforme** (voir §4.6) |

### 2.3 EVO-02 éprouvé pour de bon : le moteur sans code de repli

Le point a été éprouvé à l'écran, et non sur la seule foi des tests.

1. Connecté en administrateur, `/administration/referentiel`, recherche `5999`,
   bouton « Désactiver » → message « MCC 5999 désactivé. », compteur passé à
   « 278 codes actifs sur 279 ».
2. Connecté en agent, dossier dont la description d'activité est
   `qzxwv yjklm ptdfg` et dont le nom de site est neutre (`Zzz`) : l'étape 4
   n'affiche **aucune carte vide, aucun code sans libellé**, mais un message
   explicite à la place de la liste : « Aucune proposition ne peut être faite :
   le code de repli 5999 est absent du référentiel actif. Recherchez un code
   manuellement ou prévenez l'administrateur. »
3. Réactivation depuis le même écran → « MCC 5999 réactivé. », compteur revenu à
   « 279 codes actifs sur 279 ». Le moteur rend de nouveau 5999 à 10 %, avec le
   terme « aucune correspondance : code de repli ». **Le référentiel est rendu
   dans l'état où il a été trouvé.**

*Captures : `r03-desactivation.png`, `a04-5999-desactive.png`,
`r04-5999-reactive.png`, `a06-repli-retabli.png`.*

**Une réserve sur ce message.** Il est adressé à l'agent, qui ne peut rien y
faire, et il est écrit dans le vocabulaire du produit — « code de repli 5999 »,
« référentiel actif » — que rien à l'écran n'a jamais expliqué à un agent
d'agence.

---

## 3. Les erreurs JavaScript

**Aucune erreur JavaScript (`pageerror`) n'a été relevée sur l'ensemble de la
campagne**, sur tous les parcours et tous les profils. Les seules entrées de
console sont des `console.error` émis par le navigateur au retour de requêtes
HTTP en échec (500 et 400), qui sont traités comme constats fonctionnels
ci-dessous et non comme des régressions du front.

---

## 4. Défauts et gênes

### 4.1 L'instance livrée

#### UTI-18 — Défaut · bloquant · Trois écrans d'administration tombent en « Erreur interne du serveur » : la base n'a pas suivi le code

**Écran et parcours.** Banquier → Administration → Journal · Banquier ou
administrateur → Administration → Comptes → « + Nouveau compte » · toute
écriture sur un compte ou une banque.

**Attendu.** Le journal du banquier s'affiche, filtré sur sa banque. La création
d'un compte agent aboutit.

**Ce qui se produit.**

- Le journal du banquier affiche « **Erreur interne du serveur** », suivi de
  « Aucune action enregistrée. » — les deux à la fois, ce qui est déjà
  contradictoire. Aucune ligne, aucun compteur, aucune pagination.
- La création d'un compte agent par le banquier renvoie **500** ; l'écran
  affiche « Erreur interne du serveur » au-dessus du formulaire, qui reste
  rempli. Le compte **n'est pas créé** — la transaction est intégralement
  annulée.

**Cause, lisible dans le journal du serveur.** Les deux requêtes échouent sur la
même erreur PostgreSQL : `column e.bank_id does not exist`
(`services/admin.js:575` en lecture, `services/admin.js:20` — `journaliser` — en
écriture). Le commit courant a introduit la colonne `admin_events.bank_id` pour
partitionner le journal sur la banque *concernée* par l'action et non sur celle
de son auteur ; `db/schema.sql:203` la déclare bien
(`ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS bank_id …`). Mais **rien ne
l'applique au démarrage** : `src/index.js` n'appelle pas `migrate()`, la mise à
niveau est un geste séparé (`npm run db:migrate`), et il n'a pas été fait sur
cette instance.

**Portée.** Toute opération qui passe par `journaliser()` est atteinte : création,
modification, désactivation et réinitialisation de mot de passe d'un compte,
modification d'une banque — pour le banquier **comme pour l'administrateur**.
L'administration du référentiel MCC et l'import y échappent : ils journalisent
par un autre chemin, qui n'écrit pas la colonne. Le journal de
l'administrateur, lui, s'affiche : sa requête ne filtre pas par banque.

**Reproduire.** Sur l'instance en l'état : se connecter `banquier@banque.tn` /
`Banquier#2026`, aller sur `/administration/journal`. Puis
`/administration/comptes`, « + Nouveau compte », remplir les quatre champs
ouverts, « Créer le compte ».

**Deux constats, qu'il faut séparer.**

1. *Sur cette instance*, c'est la base qui n'a pas été migrée — et la remise en
   état est un seul geste. Ce n'est donc pas un défaut du code livré.
2. *Sur le produit*, c'en est un : une livraison qui emporte un changement de
   schéma ne le vérifie pas au démarrage et ne le signale pas. L'API démarre
   sans broncher, `/api/health` répond `status: ok`, et l'écart ne se découvre
   qu'au premier clic d'un utilisateur, sous la forme « Erreur interne du
   serveur ». Un contrôle de schéma à l'amorçage — ou une migration
   automatique — aurait transformé un incident d'exploitation en un refus de
   démarrer, visible de l'exploitant et non de l'agent.

**Ce que le banquier lit, lui,** c'est « Erreur interne du serveur » sur l'écran
dont D-3 fait l'unique contrepartie au cumul des rôles. Rien ne lui dit si le
journal est vide ou cassé, ni s'il doit prévenir quelqu'un.

*Captures : `b13-journal-500.png`, `b15-creation-resultat.png`.*

> **Conséquence sur cette campagne.** Les parcours « administration des comptes »
> (création, modification, mot de passe, désactivation), « administration des
> banques » (correction de la fiche) et « journal du banquier » (cloisonnement,
> pagination, filtres) n'ont pas pu être menés à leur terme. Ils restent à
> éprouver une fois la base mise à niveau. Les constats `UTI-03` à `UTI-06` de la
> revue précédente, qui portaient sur le cloisonnement du journal du banquier,
> **ne sont ni confirmés ni infirmés** par cette campagne.

### 4.2 L'explicabilité des propositions MCC

C'est la raison d'être du produit : l'écran doit faire comprendre **pourquoi** un
code est proposé à quelqu'un qui ne connaît pas le moteur. Chaque carte affiche
un code, un libellé, une description, la définition Visa d'origine, une pastille
« Pertinence N % » et un ou plusieurs termes. **La forme est bonne. Le fond ne
tient pas**, et les constats qui suivent le montrent à l'écran, sans jamais lire
le code du moteur.

#### UTI-12 — Défaut · majeur · La justification affichée n'explique pas le classement affiché

**Écran et parcours.** Agent → Nouvelle demande → étape 4, pour une activité
déclarée : « Vente de livres, de bandes dessinees et de manuels scolaires ».

**Ce qui se produit.** Le moteur rend six propositions. **Quatre portent
exactement la même justification, le seul mot « livres »** — et se classent
pourtant à 60 %, 51 %, 49 % et 41 % :

| Rang | Code | Libellé | Pertinence | Termes affichés |
| --- | --- | --- | --- | --- |
| 1 | 5815 | Biens numériques – livres, films, images et musique | 60 % | livres |
| 2 | 5943 | Papeteries et fournitures scolaires | 54 % | scolaires |
| 3 | 8931 | **Comptabilité, audit et tenue de livres** | 51 % | livres |
| 4 | 5192 | Livres, périodiques et journaux (gros) | 49 % | livres |
| 5 | 5816 | Biens numériques – jeux | 41 % | livres |
| 6 | **5942** | **Librairies** | **41 %** | livres |

Un agent regarde ces six cartes et ne peut rien en tirer : la justification est
identique, l'écart de classement est de dix-neuf points, et rien à l'écran ne dit
d'où vient l'écart. La pastille « Pertinence 60 % » n'est expliquée nulle part —
ni légende, ni infobulle, ni seuil annoncé.

**Et le classement lui-même dessert le produit.** Pour une librairie en ligne :

- le code proposé en premier est **5815, « Biens numériques »**, alors que
  l'activité déclarée est de la vente de livres papier ;
- le troisième, à 51 %, est **8931, « Comptabilité, audit et tenue de livres »** —
  un cabinet comptable, retenu parce que le mot « livres » figure dans « tenue de
  livres » ;
- **5942, « Librairies », le code manifestement juste, arrive dernier**, à égalité
  avec « Biens numériques – jeux ».

C'est le cœur du produit qui est en cause : un agent qui suit la première
proposition classe une librairie en biens numériques.

**Reproduire.** Agent → Nouvelle demande, étape 1 : nom du site `Zzz`, adresse
`https://zzz.tn`, raison sociale `ZZZ SARL` ; « Suivant » deux fois ; étape 3,
champ « Description de l'activité » : `Vente de livres, de bandes dessinees et de
manuels scolaires` ; « Suivant ».

*Capture : `a03-mcc.png`.*

#### UTI-19 — Défaut · majeur · Le même secteur déclaré justifie trois scores différents, sans autre mot à l'écran

**Écran et parcours.** Étape 4, dossier « cosmétiques » — celui de la
démonstration.

**Ce qui se produit.** Pour l'activité « Vente en ligne de cosmetiques naturels
et savons artisanaux », secteur déclaré « Beauté, cosmétique et parfumerie » :

| Code | Libellé | Pertinence | Termes affichés |
| --- | --- | --- | --- |
| 5977 | Cosmétiques et parfumerie | 76 % | `cosmetiques` · `secteur : Beauté, cosmétique et parfumerie` |
| 7230 | Salons de coiffure et instituts de beauté | 66 % | `secteur : Beauté, cosmétique et parfumerie` |
| 7298 | Spas et centres de bien-être | 63 % | `secteur : Beauté, cosmétique et parfumerie` |
| 5698 | Perruques et postiches | 53 % | `secteur : Beauté, cosmétique et parfumerie` |

Trois codes — un salon de coiffure, un spa, un vendeur de perruques — portent
**mot pour mot la même justification**, et s'échelonnent sur treize points. Aucun
d'eux ne correspond à la vente de cosmétiques en ligne, et l'écran ne donne à
l'agent aucun moyen de comprendre pourquoi un salon de coiffure lui est proposé à
66 % pour une boutique en ligne.

Le cas est plus grave que `UTI-12` parce qu'il porte sur le dossier type du
produit : c'est ce qu'un agent verra le plus souvent.

**Reproduire.** Étape 3, secteur `Beauté, cosmétique et parfumerie`, description
`Vente en ligne de cosmetiques naturels et savons artisanaux`, mode de livraison
`Biens physiques livrés`, « Suivant ».

*Capture : `b07-etape4.png`.*

#### UTI-13 — Défaut · majeur · Le score bouge sans que la justification bouge

**Écran et parcours.** Même dossier que `UTI-12`, étape 3, liste « Mode de
livraison ».

**Attendu.** Si deux saisies donnent deux classements différents, l'écran doit
dire ce qui a changé. C'est tout l'objet de la ligne de termes.

**Ce qui se produit.** En passant le mode de livraison de « Biens physiques
livrés » à « Biens numériques téléchargés », **sans toucher un seul mot de la
description** :

| Code | Libellé | Physique | Numérique | Termes affichés |
| --- | --- | --- | --- | --- |
| 5943 | Papeteries et fournitures scolaires | 54 % | **49 %** | `scolaires` — inchangé |
| 8931 | Comptabilité… | 51 % | **45 %** | `livres` — inchangé |
| 5192 | Livres, périodiques (gros) | 49 % | **42 %** | `livres` — inchangé |
| 5815 | Biens numériques – livres… | 60 % | 67 % | `livres`, **`livraison numérique`** |

Le moteur est **à moitié honnête** : le code qui *gagne* des points reçoit un
terme neuf, visible — « livraison numérique » — tandis que tous les codes qui
*perdent* des points n'en reçoivent aucun. Trois cartes voient leur pertinence
reculer de cinq à sept points et affichent mot pour mot la même justification
qu'avant.

Un agent qui change une liste déroulante et voit le classement se réorganiser
sous ses yeux, sans qu'aucune carte n'explique pourquoi, n'a plus de raison de
faire confiance à la pastille. C'est exactement ce que l'explicabilité devait
éviter.

**Reproduire.** Étape 3, description `Vente de livres, de bandes dessinees et de
manuels scolaires`, passer « Mode de livraison » de `Biens physiques livrés` à
`Biens numériques téléchargés`, « Suivant », comparer les pastilles.

#### UTI-14 — Défaut · moyen · L'écran affirme que les propositions viennent de l'activité déclarée ; elles viennent aussi du nom du site, de l'URL et de la raison sociale

**Écran et parcours.** Étape 4, bandeau de tête : « Propositions classées par
pertinence **à partir de l'activité déclarée**. »

**Ce qui se produit.** Le nom du site, l'adresse du site et la raison sociale
alimentent eux aussi les propositions, et peuvent les déterminer à eux seuls.
Trois essais, avec pour toute description la chaîne `qzxwv yjklm ptdfg` :

| Ce qui est saisi en plus | Proposition rendue | Terme affiché |
| --- | --- | --- |
| rien | 5999 Commerces de détail spécialisés divers, 10 % | « aucune correspondance : code de repli » |
| nom du site « UTI Souk **Bio** » | **5499 Commerces alimentaires spécialisés**, 37 % | `bio` |
| adresse `https://uti-souk-bio.tn` | 5499, 37 % | `bio` |
| raison sociale « **PHARMACIE** DU LAC SARL » | **5912 Pharmacies et parapharmacies**, 24 % | `pharmacie` |

Deux conséquences à l'écran :

1. L'agent lit « bio » comme justification et cherche ce mot dans la description
   de l'activité, où il ne figure pas. Rien ne dit d'où vient le terme — ni le
   champ, ni le poids.
2. **Le nom du site chasse le code de repli.** Sans nom de site, l'écran
   proposait honnêtement 5999 avec la mention « aucune correspondance : code de
   repli ». Avec un nom de site, il propose une épicerie à 37 % et le repli
   disparaît. Toute boutique qui s'appelle « Souk Bio » se verra proposer un code
   de commerce alimentaire, quoi qu'elle vende.

**Reproduire.** Étape 3, description `qzxwv yjklm ptdfg`, avec puis sans « UTI
Souk Bio » à l'étape 1, champ « Nom du site ».

#### UTI-15 — Gêne · moyen · Un mot isolé suffit à porter une proposition, et une correspondance à 6 % s'affiche comme une correspondance à 86 %

**Écran et parcours.** Étape 4.

**Ce qui se produit.** Trois illustrations relevées à l'écran :

- Activité déclarée : « je vends des billets d avion en ligne pour toutes
  **compagnies** ». Le moteur propose, derrière le bon code 4511 « Compagnies
  aériennes », **4411 Compagnies maritimes et de croisière** (45 %), **6300
  Assurances** (41 %), **4112 Transport ferroviaire** (32 %) et — le plus
  parlant — **5995 « Animalerie – animaux, aliments et accessoires »** (36 %).
  La justification affichée pour ces quatre cartes est le seul mot `compagnies` ;
  l'animalerie est là parce que sa description contient « animaux de
  **compagnie** ».
- Activité déclarée : « vente de cannabis, de stupefiants et d armes a feu en
  ligne ». **Une seule proposition** est rendue : **5718 « Cheminées et
  accessoires »**, à 6 %, justifiée par le mot `feu` — tiré de « armes à feu ».
- Rien à l'écran ne distingue une correspondance à 6 % d'un bon appariement à
  86 % : même cadre, même pastille, mêmes jetons. La seule différence est la
  couleur de la pastille — grise sous 40 %, ambre entre 40 et 65 %, verte
  au-dessus — un code couleur qui n'est expliqué nulle part et qu'un agent
  daltonien ne lira pas.

Et la proposition à 6 % **empêche le code de repli de sortir** : le repli
n'apparaît que lorsqu'il n'y a strictement aucune correspondance, pas lorsqu'il
n'y en a aucune de bonne. Une correspondance accidentelle sur un mot vaut donc
mieux, aux yeux du moteur, qu'un aveu d'ignorance.

**Reproduire.** Étape 3, description `vente de cannabis, de stupefiants et d
armes a feu en ligne`, puis « Suivant ».

#### UTI-16 — Gêne · mineur · Les termes affichés ne sont pas les mots de l'agent

Le produit pose que le terme affiché est celui que l'agent a lui-même saisi, et
qu'il lui parle donc toujours. Ce n'est pas ce que l'écran rend : les termes
sortent **désaccentués et en minuscules**. Un agent qui a écrit « cosmétiques »
lit « cosmetiques » ; il lira « bandes dessinees » pour « bandes dessinées ». Sur
un écran dont c'est toute la valeur, le mot rendu devrait être celui qui a été
tapé.

La liste est par ailleurs **tronquée à huit termes sans le dire** : au-delà, les
correspondances qui ont pourtant compté dans le score ne sont pas affichées.

#### UTI-17 — Gêne · moyen · La recherche manuelle d'un code désactivé rend un autre code, sans le dire

**Écran et parcours.** Étape 4 → « Rechercher un autre code dans le référentiel ».
Le champ est légendé « Mot-clé ou code à 4 chiffres (ex. « librairie » ou
« 5942 ») ».

**Ce qui se produit.** Pendant que `5999` était désactivé, y taper `5999` rend un
seul résultat : **5995, « Animalerie – animaux, aliments et accessoires »**. Rien
ne dit que le code demandé n'a pas été trouvé, ni qu'il existe mais qu'il est
désactivé. L'agent a tapé un code qu'il connaît et reçoit son voisin, présenté
comme une réponse.

Un code qui n'a jamais existé (`9999`) rend, lui, un message net : « Aucun code
éligible ne correspond à « 9999 ». » Le produit sait donc dire « rien ». Il ne le
dit pas dans le seul cas où la confusion est possible.

**Reproduire.** Désactiver `5999` depuis l'administration, puis, en agent, étape
4, taper `5999` dans le champ de recherche.

*Capture : `a05-recherche-5999.png`.*
