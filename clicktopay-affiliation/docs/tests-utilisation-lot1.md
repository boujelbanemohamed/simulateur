# Tests d'utilisation — lot 1

Campagne menée à l'écran, en conditions d'usage, sur l'instance de démonstration
(front `http://localhost:5173`, API `http://127.0.0.1:4000`), pilotée par Chromium.

**Code éprouvé.** L'instance testée sert bien le code courant, et c'est
vérifiable : l'arbre de travail est propre à `3c03b25` (« Faire du banquier
l'administrateur de sa banque », validé le 22/09/2026 à 18:15), et les deux
processus servis ont démarré **après** ce commit — l'API à 07:30:47 le
23/09/2026, le serveur de développement du front à 07:30:50, ce que confirme
`/api/health` (référentiel chargé à 07:30:56). Aucun constat de ce document ne
porte sur une instance restée sur du code antérieur.

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

### Le banquier administrateur de sa banque (décision D-3)

#### UTI-01 — Défaut · majeur · Le rôle de l'administrateur s'affiche « Agent » au banquier

**Écran et parcours.** Banquier → Administration → Comptes → bouton
« Modifier » sur la ligne `admin@clicktopay.tn`.

**Attendu.** Le formulaire montre le compte tel qu'il est. Le rôle affiché est
celui du compte : Administrateur.

**Ce qui se produit.** Le champ « Rôle » affiche **Agent**. La liste déroulante
ne contient qu'une entrée, « Agent », parce que le banquier ne peut proposer que
ce rôle-là ; la valeur réelle du compte, `ADMIN`, n'y figure pas, et le
navigateur retombe sur la première option. Le même écran se contredit donc à
deux endroits : le tableau, juste en dessous, porte bien « Administrateur » sur
cette ligne. Le banquier lit une information fausse sur un compte qu'il ne
devrait pas avoir à connaître.

**Reproduire.** Se connecter `banquier@banque.tn` / `Banquier#2026`, aller sur
`/administration/comptes`, cliquer « Modifier » sur la ligne
`admin@clicktopay.tn`. Comparer le champ « Rôle » et la colonne « Rôle » du
tableau.

**Portée.** L'écriture, elle, est bien protégée : soumettre le formulaire
renvoie un 403 « Vous n'administrez que les comptes agents de votre banque. » Le
compte n'est pas rétrogradé. C'est donc un défaut d'affichage, pas une brèche —
mais l'affichage est faux, et il l'est sur la seule page où le banquier lit les
rôles.

*Capture : `b-06-modifier-admin.png`.*

#### UTI-02 — Gêne · majeur · Le banquier se voit offrir des actions qui lui seront toutes refusées

**Écran et parcours.** Banquier → Administration → Comptes.

**Attendu.** Le banquier administre « les comptes agents de sa banque »
(D-3). La liste devrait donc lui présenter ce qu'il administre, ou à tout le
moins ne pas lui proposer d'agir sur ce qu'il n'administre pas.

**Ce qui se produit.** La liste contient les **trois** comptes de BQ001 :
l'agent, l'administrateur de la plateforme et le banquier lui-même. Les trois
lignes portent les trois mêmes boutons — « Modifier », « Mot de passe »,
« Désactiver » — tous actifs, à la seule exception de « Désactiver » sur sa
propre ligne. Sur les deux lignes hors périmètre, **chaque** action part, atteint
le serveur et revient en 403 : « Vous n'administrez que les comptes agents de
votre banque. »

Concrètement, un banquier peut ouvrir le formulaire de réinitialisation du mot
de passe de l'administrateur de la plateforme, saisir un mot de passe
provisoire, cliquer « Réinitialiser » — et n'apprendre qu'après coup que ce
n'était pas permis. Il n'y a aucun moyen, avant de cliquer, de savoir sur
quelles lignes il a la main.

Le titre de l'écran entretient la confusion : « Création, habilitation et
**désactivation des agents, banquiers et administrateurs** » — texte écrit pour
l'administrateur, servi tel quel au banquier à qui, justement, rien de tout
cela n'est permis sauf sur les agents.

**Reproduire.** Connecté en banquier, `/administration/comptes`, cliquer
« Mot de passe » sur la ligne `admin@clicktopay.tn`, saisir `Provisoire#2026`,
valider. Puis recharger et cliquer « Désactiver » sur la même ligne.

*Captures : `b-04-reinit-admin-refus.png`, `b-05-desactiver-admin-refus.png`.*

#### UTI-03 — Défaut · majeur · Le journal du banquier n'est pas cloisonné : il montre le référentiel commun et le personnel d'une autre banque

**Écran et parcours.** Banquier → Administration → Journal.

**Attendu.** D-3 pose deux bornes explicites : « Le journal d'administration est
filtré sur sa banque. Un banquier ne voit pas les actions faites sur les autres
banques » et « L'administration du référentiel, son import et son historique
restent hors de portée du banquier ».

**Ce qui se produit.** Le banquier de BQ001 voit **129** des 130 lignes du
journal. Une seule lui est masquée. Y figurent notamment :

- **dix lignes du référentiel MCC** — `IMPORT_REFERENTIEL`, deux
  `IMPORT_MODIFICATION`, un `IMPORT_REACTIVATION`, les activations et
  désactivations du code `5999` — c'est-à-dire tout l'historique du référentiel
  commun, celui-là même que D-3 met hors de sa portée ;
- **la création d'un compte d'une autre banque**, adresse électronique comprise :
  « Compte #67 · Création · Rôle : agent · Adresse e-mail :
  `uti782210@banque.tn` · Banque : 2 · bankCode : **BQ002** » ;
- les quarante et quelques modifications de statut de ce même compte #67, qui
  appartient à BQ002.

**Cause visible du bord de l'écran.** Le filtre porte sur la banque de
**l'auteur** de l'action, non sur celle de l'objet. L'administrateur de la
plateforme étant rattaché à BQ001, tout ce qu'il fait — y compris sur le
référentiel et sur les comptes de BQ002 — tombe dans le journal du banquier de
BQ001. Un banquier rattaché à BQ002 ne verrait, lui, rien de ce que
l'administrateur fait sur sa propre banque : le cloisonnement est à la fois trop
ouvert d'un côté et trop fermé de l'autre.

**Reproduire.** Se connecter en banquier, `/administration/journal`, page 1 :
les lignes « Référentiel #5999 » et « Compte #67 · … bankCode : BQ002 » sont
visibles. Comparer le compteur — « entrées 1 à 100 sur **129** » — à celui de
l'administrateur, qui affiche 130.

*Capture : `b-09-journal.png`.*

#### UTI-04 — Défaut · moyen · La moitié des actions du journal s'affichent en majuscules techniques

**Écran et parcours.** Banquier ou administrateur → Administration → Journal.

**Attendu.** La colonne « Action » est écrite pour être lue. Elle l'est pour
certaines valeurs : « Création », « Modification », « Réinitialisation de mot de
passe », « Import du référentiel MCC ».

**Ce qui se produit.** Sur les huit actions présentes dans le journal de
l'instance, **quatre** sortent brutes, en majuscules et sans accents, au milieu
des libellés français : `IMPORT_REACTIVATION`, `IMPORT_MODIFICATION`,
`DESACTIVATION`, `REACTIVATION`. L'écran mélange donc deux registres sur la même
colonne, ligne après ligne. Un contrôleur qui relit le journal doit deviner que
`DESACTIVATION` sur « Référentiel #5999 » veut dire qu'un code a été retiré du
catalogue.

**Reproduire.** `/administration/journal`, colonne « Action », lignes
« Référentiel #5942 » et « Référentiel #5999 » du 22/09/2026.

#### UTI-05 — Gêne · moyen · Le détail du journal laisse passer des clés techniques et des identifiants internes

**Écran et parcours.** Administration → Journal, colonne « Détail ».

**Ce qui se produit.** Trois choses, sur une colonne pourtant refaite au lot 1
pour être lisible :

1. **Une clé non traduite.** La création d'un compte rend « Rôle : agent ·
   Adresse e-mail : … · Banque : 1 · **bankCode** : BQ001 ». Le nom de champ
   anglais est servi tel quel, à côté de ses voisins traduits.
2. **L'identifiant interne de la banque.** « Banque : **1** » ne dit rien ; le
   code, lui, est juste à côté. Les deux sont journalisés, les deux sont
   affichés, et seul le second parle.
3. **Le compte rendu d'import est illisible.** « muets : 0 · ajoutes : 0 ·
   retires : 276 · applique : true · modifies : 3 · inchanges : 0 · reactives :
   1 · desactivationDesRetires : false » : huit clés sans accents ni espaces,
   dans un ordre qui n'est pas celui de l'écran d'import, et deux booléens en
   `true` / `false` là où le reste de la colonne écrit « oui » / « non ». C'est
   pourtant la seule trace qui reste d'un import une fois l'écran quitté.

**Reproduire.** `/administration/journal`, première ligne (création de compte) et
ligne « Référentiel #IMPORT · Import du référentiel MCC ».

#### UTI-06 — Gêne · moyen · Le journal ne dit pas sur quel compte porte l'action, et n'offre aucun filtre

**Écran et parcours.** Administration → Journal.

**Ce qui se produit.** La colonne « Objet » porte « Compte #67 », « Compte
#68 », « Référentiel #5942 » : des identifiants de base de données. Pour une
**création**, l'adresse électronique figure dans le détail et l'on s'y retrouve.
Pour une **modification** — le cas le plus fréquent — le détail ne contient que
le couple avant/après : « Statut : actif → désactivé ». Rien, sur la ligne, ne
dit **de qui** il s'agit. L'instance en donne l'illustration : quarante-six
lignes consécutives « Compte #67 · Modification · Statut : actif → désactivé »,
sans un nom.

S'y ajoute qu'il n'y a **aucun filtre à l'écran** : ni par date, ni par auteur,
ni par action, ni par objet. L'API en accepte pourtant quatre (`entity`,
`action`, `depuis`, `jusqua`). Le seul moyen de retrouver une action est de
parcourir les pages de cent lignes à la main.

Mis bout à bout : le journal est l'unique contrepartie au cumul des rôles assumé
par D-1 et D-3 (« la maîtrise du risque repose […] sur la relecture du
journal »). En l'état, cette relecture consiste à faire défiler un tableau non
filtrable où les comptes n'ont pas de nom.

**Reproduire.** `/administration/journal`, observer l'absence de champ de
recherche ; comparer avec l'écran « Comptes », qui en a un.

### La saisie d'une demande, de la première étape à la soumission

#### UTI-07 — Gêne · majeur · Les cinq étapes ne contrôlent rien : on traverse le formulaire vide

**Écran et parcours.** Agent → Nouvelle demande.

**Attendu.** Un assistant en cinq étapes, dont les champs portent un astérisque
rouge « obligatoire », retient l'utilisateur sur une étape incomplète, ou lui dit
au moins ce qui manque.

**Ce qui se produit.** « Suivant » avance toujours. Sur un formulaire entièrement
vide, trois clics sur « Suivant » suffisent à atteindre l'étape 4 ; aucun message
n'est affiché, aucun champ n'est signalé. Les astérisques rouges des étapes 1 et
2 sont purement décoratifs jusqu'à la soumission.

Pire, le fil d'étapes **ment** sur ce qui a été fait : une étape passe au vert
(« faite ») dès qu'on est allé plus loin, que ses champs soient remplis ou non.
Un agent qui revient sur son dossier le lendemain voit quatre étapes vertes et en
conclut qu'il n'a plus qu'à envoyer.

Le seul contrôle arrive à l'étape 5, sous forme de liste. C'est tard : il faut
alors remonter les étapes une à une pour retrouver les champs cités.

**Reproduire.** Agent → Nouvelle demande → cliquer « Suivant » trois fois sans
rien saisir. Observer le passage à l'étape 4 et les étapes 1 à 3 en vert.

*Capture : `a-02-etape1-vide.png`.*

#### UTI-08 — Gêne · majeur · Le clic sur une proposition ne remplit que Visa, alors que l'écran vient d'expliquer que les deux codes sont identiques

**Écran et parcours.** Agent → Nouvelle demande → étape 4 « Codes MCC ».

**Ce qui se produit.** L'écran affiche, en tête, ce bandeau : « Les codes sont
identiques pour Visa et Mastercard (norme ISO 18245) mais restent modifiables
réseau par réseau. » Juste en dessous, le sélecteur « Le clic sur une proposition
affecte : » propose trois boutons — **Visa** (actif par défaut), Mastercard, Les
deux réseaux.

Le geste naturel — cliquer sur la proposition en tête de liste — ne remplit donc
que **Visa**. « MCC Mastercard retenu » reste sur « Aucun code sélectionné », en
gris clair, sans signal. L'agent l'apprend deux étapes plus loin, au moment de
soumettre.

Le cas par défaut est ainsi le cas rare : l'écran annonce que les deux codes
coïncident, puis prend par défaut l'option qui n'en remplit qu'un.

**Reproduire.** Étape 4, ne pas toucher au sélecteur, cliquer sur la première
proposition, passer à l'étape 5 et cliquer « Soumettre au banquier ».

*Capture : `a-06-clic-visa-seul.png`.*

#### UTI-09 — Gêne · moyen · Le refus de soumission s'affiche deux fois, en deux couleurs et deux formulations

**Écran et parcours.** Agent → étape 5 → « Soumettre au banquier » avec le MCC
Mastercard manquant.

**Ce qui se produit.** Deux blocs apparaissent simultanément, à dix pixels l'un
de l'autre, pour dire la même chose :

- un bandeau **rouge**, en haut : « Un MCC Visa et un MCC Mastercard doivent être
  proposés avant la soumission. » (le message du serveur) ;
- un encadré **ambre**, dans la carte : « Éléments manquants — La soumission
  exige : MCC Mastercard. » (le contrôle local).

Le premier parle des deux réseaux alors qu'un seul manque ; le second est le seul
à nommer le manque réel. Un utilisateur cherche naturellement lequel croire.

**Reproduire.** Voir UTI-08 ; la capture `a-08-soumission-refus.png` montre les
deux blocs.

#### UTI-10 — Gêne · mineur · « proposé », « retenu », « choisi » désignent la même chose sur trois écrans voisins

L'étape 4 titre les champs « MCC Visa **retenu** » / « MCC Mastercard
**retenu** ». L'étape 5, deux clics plus loin, reprend les mêmes valeurs sous
« MCC Visa **proposé** » / « MCC Mastercard **proposé** », et titre le panneau de
droite « Codes **retenus** ». Le message d'erreur du serveur, lui, dit
« **proposés** ». Sur la fiche de la demande, on lira « **Proposé par l'agent** ».

Aucun de ces mots n'est faux, mais ils ne recouvrent pas le même acte selon
l'endroit : ce que l'agent « retient » à l'étape 4, c'est ce qu'il « propose » au
banquier, et le banquier « retient » autre chose. Le même écran devrait choisir.

#### UTI-11 — Gêne · mineur · Le titre change de « Nouvelle demande » à « Modifier la demande » sans que l'agent ait rien demandé

À la première soumission refusée, la page est déjà enregistrée en brouillon et
l'URL bascule de `/demandes/nouvelle` à `/demandes/64/modifier` ; le titre passe
de « Nouvelle demande d'affiliation » à « Modifier la demande ». C'est correct au
fond — le brouillon existe — mais la bascule est muette, et rien ne dit à l'agent
que son dossier porte désormais un numéro.

### L'explicabilité des propositions MCC

C'est la raison d'être du produit : l'écran doit faire comprendre **pourquoi**
un code est proposé à quelqu'un qui ne connaît pas le moteur. Chaque carte
affiche donc un code, un libellé, une description, la définition Visa d'origine,
une pastille « Pertinence N % » et un ou plusieurs termes. La forme est bonne.
Le fond ne tient pas, et les quatre constats qui suivent le montrent à l'écran,
sans jamais lire le code du moteur.

#### UTI-12 — Défaut · majeur · La justification affichée n'explique pas le classement affiché

**Écran et parcours.** Agent → Nouvelle demande → étape 4, pour une activité
déclarée : « Vente de livres, de bandes dessinées et de manuels scolaires ».

**Ce qui se produit.** Le moteur rend six propositions. **Quatre d'entre elles
portent exactement la même justification, le seul mot « livres »** — et se
classent pourtant à 60 %, 51 %, 49 % et 41 % :

| Rang | Code | Libellé | Pertinence | Termes affichés |
| --- | --- | --- | --- | --- |
| 1 | 5815 | Biens numériques – livres, films, images et musique | 60 % | livres |
| 2 | 5943 | Papeteries et fournitures scolaires | 54 % | scolaires |
| 3 | 8931 | **Comptabilité, audit et tenue de livres** | 51 % | livres |
| 4 | 5192 | Livres, périodiques et journaux (gros) | 49 % | livres |
| 5 | 5816 | Biens numériques – jeux | 41 % | livres |
| 6 | **5942** | **Librairies** | **41 %** | livres |

Un agent regarde ces six cartes et ne peut rien en tirer : la justification est
identique, l'écart de classement est de dix-neuf points, et rien à l'écran ne
dit d'où vient l'écart. La pastille « Pertinence 60 % » n'est expliquée nulle
part — ni légende, ni infobulle, ni seuil annoncé.

**Et le classement lui-même dessert le produit.** Pour une librairie en ligne :

- le code proposé en premier est **5815, « Biens numériques »**, alors que
  l'activité déclarée est de la vente de livres papier ;
- le troisième, à 51 %, est **8931, « Comptabilité, audit et tenue de livres »** —
  un cabinet comptable, retenu parce que le mot « livres » figure dans
  « tenue de livres » ;
- **5942, « Librairies », le code manifestement juste, arrive dernier**, à égalité
  avec « Biens numériques – jeux ».

Ce n'est pas un cas limite construit pour l'occasion. En écrivant explicitement
« Librairie en ligne : vente de livres neufs », 5942 remonte à la deuxième place
(56 %) mais reste **derrière** 5815 « Biens numériques » (60 %).

**Reproduire.** Agent → Nouvelle demande, étapes 1 et 2 remplies avec un nom de
site neutre (« Zzz »), étape 3, champ « Description de l'activité » : `Vente de
livres, de bandes dessinees et de manuels scolaires`, puis « Suivant ».

*Capture : `a-14-librairie-classement.png`.*

#### UTI-13 — Défaut · majeur · Le score bouge sans que la justification bouge

**Écran et parcours.** Même dossier que ci-dessus, étape 3, case « Mode de
livraison ».

**Attendu.** Si deux saisies donnent deux classements différents, l'écran doit
dire ce qui a changé. C'est tout l'objet de la ligne de termes.

**Ce qui se produit.** En passant le mode de livraison de « Biens physiques
livrés » à « Biens numériques téléchargés », **sans toucher un seul mot de la
description** :

| Code | Libellé | Pertinence en physique | Pertinence en numérique | Termes affichés |
| --- | --- | --- | --- | --- |
| 5943 | Papeteries et fournitures scolaires | 54 % | **49 %** | `scolaires` — inchangé |
| 8931 | Comptabilité… | 51 % | **45 %** | `livres` — inchangé |
| 5192 | Livres, périodiques (gros) | 49 % | **42 %** | `livres` — inchangé |
| 5815 | Biens numériques – livres… | 60 % | 67 % | `livres`, **`livraison numérique`** |

Le moteur est donc **à moitié honnête** : le code qui *gagne* des points reçoit
un terme neuf, visible — « livraison numérique » — tandis que tous les codes qui
*perdent* des points n'en reçoivent aucun. Trois cartes voient leur pertinence
reculer de cinq à sept points, et affichent mot pour mot la même justification
qu'avant.

Un agent qui coche une case et voit le classement se réorganiser sous ses yeux,
sans qu'aucune carte n'explique pourquoi, n'a plus de raison de faire confiance
à la pastille. C'est exactement ce que l'explicabilité devait éviter.

**Reproduire.** Étape 3, description `Vente de livres, de bandes dessinees et de
manuels scolaires`, passer « Mode de livraison » de `Biens physiques livrés` à
`Biens numériques téléchargés`, revenir à l'étape 4 et comparer les pastilles.

#### UTI-14 — Défaut · moyen · L'écran affirme que les propositions viennent de l'activité déclarée ; elles viennent aussi du nom du site, de l'URL et de la raison sociale

**Écran et parcours.** Étape 4, bandeau de tête : « Propositions classées par
pertinence **à partir de l'activité déclarée**. »

**Ce qui se produit.** Le nom du site, l'adresse du site et la raison sociale
alimentent eux aussi les propositions, et peuvent les déterminer à eux seuls.
Trois essais, avec pour toute description la chaîne `qzxwv yjklm ptdfg` :

| Ce qui est saisi en plus | Proposition rendue | Terme affiché |
| --- | --- | --- |
| rien | 5999 Commerces de détail spécialisés divers, 10 % | « aucune correspondance : code de repli » |
| nom du site « UTI Souk **Bio** » | **5499 Commerces alimentaires spécialisés et supérettes**, 37 % | `bio` |
| adresse `https://uti-souk-**bio**.tn` | 5499, 37 % | `bio` |
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

**Reproduire.** Étape 3, description `qzxwv yjklm ptdfg`, avec puis sans
« UTI Souk Bio » à l'étape 1, champ « Nom du site ».

#### UTI-15 — Gêne · moyen · Un mot isolé suffit à porter une proposition, et une correspondance à 6 % s'affiche comme une correspondance à 86 %

**Écran et parcours.** Étape 4.

**Ce qui se produit.** Deux illustrations relevées à l'écran :

- Activité déclarée : « je vends des billets d'avion en ligne pour toutes
  **compagnies** ». Le moteur propose **4411 Compagnies maritimes et de
  croisière** (45 %) et **6300 Assurances – vente, souscription et primes**
  (41 %, avec le jeton « Vigilance renforcée »). La justification affichée, pour
  l'une comme pour l'autre, est le seul mot `compagnies`.
- Activité déclarée : « vente de cannabis, de stupéfiants et d'armes à feu en
  ligne ». **Une seule proposition** est rendue : **5718 « Cheminées et
  accessoires »**, à 6 %, justifiée par le mot `feu` — tiré de « armes à feu ».

Sur ce second cas, la carte à 6 % a exactement la même forme que la carte à
86 % d'un bon appariement : même cadre, même pastille, même jeton. La seule
différence est la couleur de la pastille — grise sous 40 %, ambre entre 40 et
65 %, verte au-dessus — un code couleur qui n'est expliqué nulle part et qu'un
agent daltonien ne lira pas.

Et la proposition à 6 % **empêche le code de repli de sortir** : le repli
n'apparaît que lorsqu'il n'y a strictement aucune correspondance, pas lorsqu'il
n'y en a aucune de bonne. Une correspondance accidentelle sur un mot vaut donc
mieux, aux yeux du moteur, qu'un aveu d'ignorance.

**Reproduire.** Étape 3, description `vente de cannabis, de stupefiants et d
armes a feu en ligne`, puis « Suivant ».

*Capture : `a-12-score-6pc.png`.*

#### UTI-16 — Gêne · mineur · Les termes affichés ne sont pas les mots de l'agent

Le commentaire du moteur pose que « le terme est celui que l'agent a lui-même
saisi, il lui parle donc toujours ». Ce n'est pas ce que l'écran rend : les
termes sortent **désaccentués et en minuscules**. Un agent qui a écrit
« cosmétiques » lit « cosmetiques » ; il lira « bandes dessinees » pour
« bandes dessinées ». Sur un écran dont c'est toute la valeur, le mot rendu
devrait être celui qui a été tapé.

La liste est par ailleurs **tronquée à huit termes sans le dire** : au-delà, les
correspondances qui ont pourtant compté dans le score ne sont pas affichées.

#### EVO-02 — conforme · Le moteur ne sert jamais de proposition sans code ni libellé

Éprouvé comme demandé, à l'écran, et non sur la seule foi des tests.

1. Connecté en administrateur, `/administration/referentiel`, recherche `5999`,
   bouton « Désactiver » → message « MCC 5999 désactivé. »
2. Connecté en agent, dossier dont la description d'activité est
   `qzxwv yjklm ptdfg` et dont le nom de site est neutre : l'étape 4 n'affiche
   **aucune carte vide, aucun code sans libellé**, mais un message explicite à la
   place de la liste : « Aucune proposition ne peut être faite : le code de repli
   5999 est absent du référentiel actif. Recherchez un code manuellement ou
   prévenez l'administrateur. » L'API renvoie bien `{ VISA: [], MASTERCARD: [] }`.
3. Réactivation depuis le même écran (`/administration/referentiel`, recherche
   `5999`, « Réactiver » → « MCC 5999 réactivé. »). Le moteur rend de nouveau
   5999 à 10 %, avec le terme « aucune correspondance : code de repli » et la
   note « Code de repli : à n'utiliser que si aucun MCC plus précis ne correspond
   à l'activité ». Le référentiel est rendu dans l'état où il a été trouvé.

*Captures : `r-02-5999-desactive.png`, `a-10-charabia-vide.png`,
`r-05-5999-retabli.png`.*

**Une réserve sur ce message.** Il est adressé à l'agent, qui ne peut rien y
faire, et il est écrit dans le vocabulaire du produit — « code de repli 5999 »,
« référentiel actif » — que rien à l'écran n'a jamais expliqué à un agent
d'agence.

#### UTI-17 — Gêne · moyen · La recherche manuelle d'un code désactivé rend un autre code, sans le dire

**Écran et parcours.** Étape 4 → « Rechercher un autre code dans le référentiel ».
Le champ est légendé « Mot-clé ou code à 4 chiffres (ex. « librairie » ou
« 5942 ») ».

**Ce qui se produit.** Pendant que `5999` était désactivé, y taper `5999` rend
un seul résultat : **5995, « Animalerie – animaux, aliments et accessoires »**.
Rien ne dit que le code demandé n'a pas été trouvé, ni qu'il existe mais qu'il
est désactivé. L'agent a tapé un code qu'il connaît et reçoit son voisin, présenté
comme une réponse.

Un code qui n'a jamais existé (`9999`, `0000`) rend, lui, une liste vide — donc
le produit sait dire « rien ». Il ne le dit pas dans le seul cas où la confusion
est possible.

**Reproduire.** Désactiver `5999` depuis l'administration, puis, en agent,
étape 4, taper `5999` dans le champ de recherche. *Capture :
`a-11-recherche-5999.png`.*
