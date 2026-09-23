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
