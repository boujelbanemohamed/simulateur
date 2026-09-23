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
| Administration : comptes (création, modification, mot de passe, désactivation) | parcouru — repris à la reprise |
| Administration : banques (fiche, bornes du banquier) | parcouru — repris à la reprise |
| Administration : référentiel MCC, désactivation et réactivation de `5999` | parcouru |
| Import d'une édition : simulation, double confirmation | parcouru |
| Journal d'administration : pagination, valeurs avant/après | parcouru, pour l'administrateur **et** pour le banquier |
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

#### UTI-18 — Requalifié à la reprise · Défaut · moyen · Une livraison qui change le schéma ne le vérifie pas au démarrage

> **Reprise.** Le constat ci-dessous a été écrit alors que la base de cette
> instance n'était pas migrée. **Elle l'est depuis**, et les trois écrans ont été
> reparcourus : le journal du banquier s'affiche et se pagine, la création, la
> modification, la réinitialisation de mot de passe et la désactivation d'un
> compte agent par le banquier aboutissent toutes, et la fiche de sa banque est
> modifiable. **Il n'y a plus rien de bloquant.** Ce qui reste, et qui est le
> seul défaut du produit dans cette affaire, est le point 2 ci-dessous : l'API
> démarre et répond `status: ok` sur une base dont le schéma est en retard, et
> l'écart ne se découvre qu'au premier clic d'un utilisateur. La gravité passe
> de **bloquant** à **moyen**, et le périmètre du constat aux seules conditions
> de démarrage. Le détail d'origine est conservé ci-dessous à titre de trace.

<details><summary>Constat d'origine, tel qu'il a été relevé avant la remise à niveau de la base</summary>

**Défaut · bloquant · Trois écrans d'administration tombent en « Erreur interne du serveur »**

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

</details>

**Ce qui a été repris et mené à son terme**, une fois la base à niveau, est
consigné en `§4.3`. Les parcours d'administration des comptes, des banques et du
journal du banquier sont désormais **parcourus**.

### 4.3 L'administration des comptes et des banques

Ces parcours ont été repris à la reprise de campagne, une fois la base à niveau.
**Ils aboutissent tous.** Le banquier crée un compte agent, le modifie,
réinitialise son mot de passe, le désactive et le réactive ; la fiche de sa
banque est modifiable ; les bornes de D-3 tiennent — le rôle reste figé sur
« Agent » à la création **comme à la modification**, la banque reste figée, les
lignes qu'il n'administre pas portent « hors de votre périmètre », et l'écran des
banques ne propose ni « + Nouvelle banque » ni « Désactiver ». Ce qui suit porte
sur la manière, pas sur le résultat.

#### UTI-20 — Défaut · moyen · L'astérisque des champs obligatoires est purement décoratif : le formulaire part vide au serveur

**Écran et parcours.** Administration → Comptes → « + Nouveau compte ». Vaut
pour **tous les formulaires du produit**, la saisie en cinq étapes comprise.

**Attendu.** Un champ marqué `*` est obligatoire ; le navigateur retient la
soumission et place le curseur sur le premier champ manquant, sans aller-retour
serveur.

**Observé.** Le composant de champ rend l'astérisque et rien d'autre : l'attribut
`required` n'est jamais posé sur l'`input`. Vérifié à l'écran —
`#champ-email` rend `required = null`. Un formulaire entièrement vide part donc
au serveur, revient en **400** et l'utilisateur découvre ses cinq erreurs d'un
coup, après un aller-retour, au lieu d'être arrêté sur la première.

Deux conséquences visibles :

- **le message est faux pour l'adresse e-mail.** Un champ vide est rapporté
  « Adresse e-mail : Adresse e-mail **invalide** », là où le prénom et le nom
  reçoivent bien « est obligatoire ». L'utilisateur qui n'a rien tapé lit qu'il a
  mal tapé ;
- l'astérisque porte `aria-hidden="true"` et aucun `aria-required` ne le
  remplace : **un utilisateur au lecteur d'écran n'apprend nulle part que le
  champ est obligatoire**, ni avant ni après.

**Reproduire.** Banquier → Administration → Comptes → « + Nouveau compte » →
« Créer le compte » sans rien saisir.

*Capture : `b06-vide-erreurs.png`.*

#### UTI-21 — Gêne · moyen · Chaque erreur de saisie est affichée deux fois

**Écran et parcours.** Même écran, et tout formulaire du produit.

**Observé.** Le retour en 400 alimente **deux affichages simultanés** : un
bandeau « Données invalides » qui énumère toutes les erreurs, préfixées du nom du
champ, **et** un message sous chacun des champs fautifs. Sur la soumission à vide
ci-dessus, l'écran porte au même instant :

| Dans le bandeau | Sous le champ |
| --- | --- |
| Adresse e-mail : Adresse e-mail invalide | Adresse e-mail invalide |
| Prénom : Le prénom est obligatoire | Le prénom est obligatoire |
| Nom : Le nom est obligatoire | Le nom est obligatoire |
| Mot de passe : Le mot de passe doit comporter au moins 10 caractères | *(absent)* |
| Mot de passe : Le mot de passe doit contenir une minuscule, une majuscule et un chiffre | Le mot de passe doit contenir une minuscule, une majuscule et un chiffre |

L'utilisateur lit donc quatre fois le même texte à deux endroits — et, pour le
mot de passe, **le bandeau porte deux exigences quand le champ n'en montre
qu'une** : seule la dernière erreur est retenue sous le champ. Qui corrige ce que
le champ lui dit (ajouter une majuscule) peut échouer de nouveau sur la longueur,
sans l'avoir vu venir.

**Reproduire.** Identique à `UTI-20`.

#### UTI-22 — Défaut · moyen · Désactiver un compte ne dit rien, et laisse à l'écran le message de l'action précédente

**Écran et parcours.** Administration → Comptes → « Désactiver » / « Réactiver »
sur une ligne d'agent.

**Attendu.** Une action qui coupe l'accès d'un utilisateur se confirme avant, et
se confirme après. Les trois autres actions de l'écran le font : « Compte … créé. »,
« Compte … mis à jour. », « Mot de passe de … réinitialisé. »

**Observé.** Deux manques sur la même action :

1. **Aucune confirmation avant.** Un seul clic sur « Désactiver » coupe l'accès
   de l'agent. Aucune boîte de dialogue, aucun second geste. Le bouton est
   voisin de « Modifier » et de « Mot de passe » dans la même barre, sans
   séparation ni traitement visuel distinct.
2. **Aucun message après.** Ni « Désactiver » ni « Réactiver » n'émettent de
   message ; le seul signal est la pastille de la ligne qui change. Vérifié
   isolément, l'écran vierge de tout message le reste après les deux actions.

Le second manque produit un effet trompeur, relevé tel quel : en enchaînant
« Mot de passe » puis « Désactiver », l'écran **conserve** le message
« Mot de passe de `uti3.485439@banque.tn` réinitialisé. Communiquez-le par un
canal sûr. » alors que l'action qui vient d'être faite est une désactivation. Le
banquier lit une confirmation qui ne correspond pas à son dernier clic.

**Reproduire.** Banquier → Administration → Comptes → sur une ligne d'agent,
« Mot de passe », saisir un mot de passe valide, « Réinitialiser » ; puis, sur la
même ligne, « Désactiver ». Lire le bandeau.

*Capture : `b11-desactiver-message.png`.*

#### UTI-23 — Gêne · mineur · L'écran des banques explique au banquier une règle qui ne le concerne pas

**Écran et parcours.** Banquier → Administration → Banques.

**Observé.** L'écran est juste — une seule ligne, sa banque, un seul bouton
« Modifier », et une phrase d'en-tête exacte : « La fiche de votre banque. Vous
pouvez en corriger le libellé ; sa création et son activation relèvent de
l'administrateur. » Mais il se termine par : « Une banque ne peut être désactivée
que si elle ne compte plus aucun compte actif. Ses demandes déjà enregistrées
sont conservées. » — une note qui explique les conditions d'une action que le
banquier ne peut pas faire et dont l'écran ne lui propose pas le bouton.

*Capture : `b10-banques.png`.*

### 4.4 Le journal d'administration

**Ce qui est conforme.** Le journal a été repris pour les deux profils, une fois
la base à niveau.

| Attendu | Constat |
| --- | --- |
| `EVO-06` — journal paginé, « entrées 101 à 200 sur N » | **conforme** — l'administrateur lit « entrées 1 à 100 sur 143 » puis, après « Suivant », « entrées 101 à 143 sur 143 » ; cent lignes par page |
| `EVO-05` — valeurs avant / après | **conforme, au mot près** — une promotion rend « **Rôle : agent → banquier** » ; une désactivation rend « Statut : actif → désactivé » |
| `EVO-04` — le changement de mot de passe est journalisé | **conforme** — « Réinitialisation de mot de passe » apparaît en ligne propre |
| Le journal du banquier est **filtré sur sa banque** | **conforme** — l'administrateur compte 143 entrées, le banquier 128 au même instant : les quinze actions portant sur les autres banques ne lui sont pas servies. Vérifié en créant un compte en `BQ002` : la ligne apparaît chez l'administrateur, pas chez le banquier |
| Le journal est accessible au banquier | **conforme** — l'écran qui rendait une erreur serveur s'affiche, se pagine et se parcourt sans incident |

#### UTI-24 — Gêne · majeur · Le journal désigne les comptes par un numéro interne : on ne sait pas de qui on parle

**Écran et parcours.** Administration → Journal, colonne « Objet ».

**Attendu.** Un journal d'administration sert à répondre à « qui a fait quoi, à
qui ». Les deux premiers tiers sont bien rendus — l'auteur est nommé
(« Karim Trabelsi »), l'action est en clair. Le troisième manque.

**Observé.** L'objet de l'action est rendu « **Compte #71** », « Compte #72 » —
l'identifiant technique en base, qui n'est affiché nulle part ailleurs dans le
produit. L'écran des comptes ne montre pas ce numéro, la recherche ne le prend
pas, et rien ne permet de passer de la ligne de journal au compte concerné : ni
lien, ni infobulle, ni nom.

Seule la ligne **Création** porte l'adresse e-mail, en détail. Les lignes
« Modification », « Réinitialisation de mot de passe », « Statut : actif →
désactivé » ne portent que le numéro. Pour savoir qui a été désactivé, il faut
donc **remonter la liste jusqu'à la ligne de création du même numéro** — sur cent
lignes par page, sans filtre et sans recherche.

C'est précisément le contrôle que D-1 et D-3 désignent comme la seule contrepartie
au cumul des rôles : « la maîtrise du risque repose sur la relecture du journal ».
Cette relecture n'est pas praticable en l'état.

**Reproduire.** Administration → Comptes, désactiver un agent ; aller au Journal
et tenter de dire, à partir de la première ligne seule, quel compte a été
désactivé.

*Capture : `j03-avant-apres.png`.*

#### UTI-25 — Gêne · majeur · Le journal n'offre aucun filtre ni recherche

**Écran et parcours.** Administration → Journal.

**Observé.** L'écran ne comporte **aucun champ de recherche et aucun filtre** :
ni par date, ni par auteur, ni par objet, ni par type d'action. Les seuls
contrôles sont « Précédent » et « Suivant ». Sur cent quarante-trois entrées la
gêne est supportable ; la volumétrie réelle d'une plateforme bancaire la rend
impraticable — retrouver ce qui a été fait sur un compte un jour donné suppose de
feuilleter l'intégralité du journal, cent lignes à la fois.

Les autres écrans de liste du produit ont, eux, une recherche (« Recherche » sur
les comptes) ou des filtres (statut, banque sur le tableau de bord). Le seul
écran qui existe **pour** être fouillé est le seul à n'en avoir aucun.

#### UTI-26 — Défaut · mineur · Le détail d'une création expose des clés techniques non traduites

**Écran et parcours.** Administration → Journal, colonne « Détail », ligne
« Création » d'un compte.

**Attendu.** Le détail est écrit dans les mots du produit, comme le sont
« Rôle : agent → banquier » ou « Statut : actif → désactivé ».

**Observé.** La ligne rend :

> Rôle : agent · Adresse e-mail : uti3.role746070@banque.tn · **Banque : 2 · bankCode : BQ002**

Trois défauts dans la même ligne :

1. « **Banque : 2** » — l'identifiant interne de la banque, là où l'utilisateur
   attend `BQ002` ou « Banque Internationale Arabe de Tunisie » ;
2. « **bankCode** » — une clé technique, en anglais et en *camelCase*, non
   traduite, au milieu de libellés français ;
3. **l'information est donnée deux fois**, sous ses deux formes, l'une
   inutilisable et l'autre non traduite.

Le mécanisme de traduction des libellés existe et fonctionne pour « Rôle » et
« Adresse e-mail » ; il laisse simplement passer ce qu'il ne connaît pas, tel
quel, plutôt que de l'écarter ou de le nommer.

**Reproduire.** Administrateur → Comptes → « + Nouveau compte », créer un compte ;
aller au Journal et lire la première ligne.

#### UTI-27 — Gêne · mineur · L'en-tête du journal annonce au banquier un périmètre qu'il n'a pas

**Écran et parcours.** Banquier → Administration → Journal.

**Observé.** Le sous-titre est « Actions sur les comptes, les banques **et le
référentiel MCC** ». Le banquier n'a pas accès au référentiel MCC — c'est une
borne explicite de D-3 — et aucune action de référentiel ne lui est servie. Le
même texte est rendu pour les deux profils.

### 4.5 La connexion et le changement de mot de passe imposé

**Ce qui est conforme.** Le parcours du mot de passe imposé est le mieux traité du
produit. Un compte créé avec un mot de passe provisoire est, à sa première
connexion, envoyé sur `/mot-de-passe` ; le bandeau « Changement obligatoire »
explique la situation ; les quatre URL essayées à la main — `/demandes`,
`/demandes/nouvelle`, `/referentiel`, `/administration/comptes` — y ramènent
toutes ; un mot de passe actuel erroné rend « Le mot de passe actuel est
incorrect. » ; la règle est annoncée **avant** la saisie (« au moins 10
caractères, avec une minuscule, une majuscule et un chiffre ») et non après
l'échec ; une fois changé, l'utilisateur arrive sur ses demandes. Rien à redire.

#### UTI-28 — Défaut · majeur · La page de connexion affiche en clair les identifiants de deux comptes

**Écran et parcours.** `/connexion`, premier écran du produit, avant toute
authentification.

**Observé.** Sous le bouton « Se connecter », en toutes lettres et sans aucune
condition :

> Comptes de démonstration : `agent@banque.tn` / `Agent#2026` —
> `banquier@banque.tn` / `Banquier#2026`

Ce sont des identifiants valides, dont l'un ouvre l'administration d'une banque :
comptes agents, fiche de la banque, journal, et tous les dossiers d'affiliation
de l'établissement. La mention est **inconditionnelle** — elle n'est gardée ni par
une variable d'environnement, ni par un test sur le mode de développement ; elle
est écrite en dur dans la page (`web/src/pages/LoginPage.jsx`). Telle quelle,
elle part en production.

C'est commode pour une démonstration et c'est sans doute pourquoi elle est là.
Mais rien dans le produit ne la retirera le jour de la mise en service, et c'est
le genre d'oubli qui ne se voit plus une fois qu'on s'y est habitué.

**Reproduire.** Ouvrir `http://localhost:5173/connexion` et lire le bas de la
carte.

*Capture : `c01-connexion.png`.*

#### UTI-29 — Gêne · moyen · Un agent désactivé est renvoyé à « Identifiants incorrects »

**Écran et parcours.** `/connexion`, avec l'adresse et le **bon** mot de passe
d'un compte que le banquier vient de désactiver.

**Observé.** L'écran rend « Identifiants incorrects » — le même message, mot pour
mot, que pour un mot de passe erroné ou une adresse inconnue. L'agent sait qu'il
n'a pas fait de faute de frappe ; il va réessayer, se croire victime d'un
incident, puis appeler son agence.

Le produit connaît pourtant la cause, et son écran des comptes l'affiche au
banquier (pastille « Désactivé »). Le renvoyer à l'utilisateur — « Votre compte a
été désactivé ; rapprochez-vous de votre banque. » — lui éviterait l'essai
répété et éviterait un appel au support.

*La réserve est connue* : un message distinct révèle l'existence du compte. Elle
pèse peu ici, sur un outil interne où les adresses sont celles des salariés de la
banque, et où l'appelant a déjà fourni le bon mot de passe.

**Reproduire.** Créer un compte agent, le désactiver depuis l'administration,
puis tenter de s'y connecter avec son mot de passe valide.

#### UTI-30 — Gêne · mineur · Un compte neuf est accueilli par « votre mot de passe a été réinitialisé par un administrateur »

**Écran et parcours.** Première connexion d'un compte **créé** — jamais
réinitialisé.

**Observé.** Le bandeau annonce : « Changement obligatoire — **Votre mot de passe
a été réinitialisé par un administrateur.** Vous devez en définir un nouveau
avant d'accéder à la plateforme. » Rien n'a été réinitialisé : c'est le mot de
passe provisoire de création, communiqué à l'agent par son banquier.

Le produit distingue pourtant les deux cas — le journal enregistre « Création » et
« Réinitialisation de mot de passe » en lignes séparées. L'écran d'accueil du
nouvel arrivant, lui, ne retient que le second.

*Capture : `c03-mdp-impose.png`.*

### 4.6 La saisie en cinq étapes

**Ce qui est bon.** Le découpage en cinq étapes est lisible, chaque onglet porte
un titre et un sous-titre qui disent ce qu'il contient (« 3. Activité — Ce que
vend le site »), on navigue librement d'une étape à l'autre par les onglets, le
brouillon s'enregistre à n'importe quel moment, et l'étape 3 prévient l'agent que
son texte compte : « Ce descriptif est la principale source de la proposition de
MCC : soyez précis sur les produits ou services réellement vendus en ligne. »
C'est bien vu et bien placé.

Les constats qui suivent portent tous sur le même point : **le formulaire ne
contrôle rien avant la toute dernière seconde**, et ce qu'il affiche entre-temps
dit le contraire.

#### UTI-31 — Défaut · majeur · On traverse les cinq étapes sans rien saisir, et l'écran déclare les étapes « faites »

**Écran et parcours.** Agent → « + Nouvelle demande ».

**Attendu.** « Suivant » vérifie au moins les champs marqués obligatoires de
l'étape que l'on quitte, et l'onglet d'une étape incomplète se distingue d'une
étape complète.

**Observé.** Sur un formulaire **entièrement vierge**, quatre clics sur
« Suivant » suffisent à atteindre l'étape 5. Aucun contrôle, aucun message,
aucun arrêt — alors que l'étape 1 porte quatre champs marqués `*` (Nom du site,
Adresse du site, Raison sociale, RNE) et l'étape 2 six autres.

Pire, l'écran affirme le contraire de ce qui est : après l'échec de la
soumission, les onglets **1, 2, 3 et 4 portent tous l'état « faite »**
(`class="etape etape--faite"`), y compris les étapes 1, 2 et 3 qui concentrent les
douze erreurs bloquantes. Le seul état que l'interface sait rendre est « faite » —
il signifie en réalité « visitée ». Il n'existe aucun état « incomplète ».

L'agent lit donc, sur la même page, un bandeau de quatorze erreurs et quatre
étapes déclarées faites.

**Reproduire.** Agent → « + Nouvelle demande » → cliquer « Suivant » quatre fois
sans rien saisir.

*Captures : `v01-vide-etape2.png` à `v04-vide-etape5.png`, `s08-retour-etape1.png`.*

#### UTI-32 — Défaut · majeur · Le récapitulatif annonce qu'il ne manque que les codes MCC, alors que dix champs obligatoires sont vides

**Écran et parcours.** Étape 5, « Récapitulatif avant soumission ».

**Attendu.** Le bloc « Éléments manquants » de la dernière étape dit ce qui
empêche la soumission. C'est son seul rôle, et l'agent s'y fie.

**Observé, en deux temps.**

1. Formulaire vierge, aucun code MCC retenu : le bloc annonce
   « Éléments manquants — **La soumission exige : MCC Visa et MCC Mastercard.** »
   et **rien d'autre**. Nom du site, Adresse du site, Raison sociale, RNE,
   Prénom, Nom, E-mail, Téléphone, Adresse, Ville, Description de l'activité sont
   tous vides et tous obligatoires ; aucun n'est nommé. Ils figurent bien au
   récapitulatif, mais sous la forme d'un tiret cadratin (« Nom du site — »),
   qui se lit comme « non renseigné, et sans importance ».
2. On retient un code MCC par la recherche manuelle : **le bloc « Éléments
   manquants » disparaît entièrement.** L'agent a désormais sous les yeux un
   récapitulatif sans le moindre avertissement, et un bouton « Soumettre au
   banquier ». Rien ne lui dit que son dossier est vide.

Le bloc ne vérifie donc que les deux codes MCC et se tait sur tout le reste.

**Reproduire.** Agent → « + Nouvelle demande » → « Suivant » ×3 → étape 4,
« Les deux réseaux », taper `5942` dans « Recherche », cliquer le résultat →
« Suivant » → lire l'étape 5.

*Captures : `v04-vide-etape5.png` (avant), `s06-recap-incomplet.png` (après).*

#### UTI-33 — Gêne · majeur · Quatorze erreurs d'un coup, sur l'étape 5, pour des champs des étapes 1, 2 et 3

**Écran et parcours.** Étape 5 → « Soumettre au banquier », dans la continuité de
`UTI-32`.

**Observé.** La soumission part au serveur, revient en 400, et l'étape 5 affiche
un bandeau de **quatorze lignes** :

> Nom du site : Le nom du site est obligatoire · Adresse du site : L'adresse du
> site est obligatoire · Adresse du site : L'adresse du site doit être une URL
> valide (https://…) · Raison sociale : … · RNE : Le RNE est obligatoire · RNE :
> Le RNE doit comporter 6 à 32 caractères alphanumériques · Prénom du contact : …
> · Nom du contact : … · Adresse e-mail : Adresse e-mail invalide · Téléphone :
> Numéro de téléphone trop court · Téléphone : Numéro de téléphone invalide ·
> Adresse : … · Ville : … · Description de l'activité : Décrivez l'activité en 20
> caractères minimum…

Quatre griefs, au-delà du volume :

1. **Aucun de ces champs n'est sur l'écran affiché.** Ils appartiennent aux
   étapes 1, 2 et 3. Le bandeau n'offre aucun lien vers eux : il faut relever les
   noms, revenir en arrière et les retrouver à la main.
2. **Trois champs reçoivent deux messages pour une seule cause.** Un champ
   « Adresse du site » vide est à la fois « obligatoire » et « doit être une URL
   valide » ; le RNE vide est « obligatoire » et « doit comporter 6 à 32
   caractères » ; le téléphone vide est « trop court » **et** « invalide ». Sur
   quatorze lignes, trois sont des redites.
3. **Le champ vide est parfois qualifié d'invalide** plutôt que de manquant —
   « Adresse e-mail : Adresse e-mail invalide » pour un champ jamais touché,
   comme au formulaire de comptes (`UTI-20`).
4. **Le bandeau suit l'agent sur toutes les étapes.** En revenant à l'étape 1,
   les quatorze lignes sont toujours là, en plus des messages placés sous les
   champs concernés. L'agent lit alors « Le nom du site est obligatoire » deux
   fois sur le même écran, et douze autres messages qui ne concernent pas l'étape
   où il se trouve.

**Ce qui fonctionne**, et qu'il faut porter au crédit du produit : en revenant à
l'étape 1, les messages **sont** placés sous les bons champs
(« Le nom du site est obligatoire » sous *Nom du site*). Le mécanisme existe donc ;
c'est l'orchestration qui manque — contrôler à chaque étape, marquer les onglets
fautifs, et renvoyer l'agent au premier champ en défaut.

**Reproduire.** Identique à `UTI-32`, puis cliquer « Soumettre au banquier », puis
revenir sur l'onglet « 1. Site et société ».

*Capture : `s07-soumission-refusee.png`.*

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

#### UTI-19 — Défaut · majeur · Le même secteur déclaré justifie quatre scores différents, sans autre mot à l'écran

> **Remesuré à la reprise.** Ce constat avait été relevé sur un référentiel qui
> avait dérivé. Les valeurs ci-dessous sont celles du référentiel rétabli,
> relevées à l'écran le 23/09/2026 ; elles concordent avec le jeu de référence
> annoncé. **Le constat est inchangé ; il est même aggravé** — le quatrième code
> n'est plus un vendeur de perruques mais une pharmacie.

**Écran et parcours.** Étape 4, dossier « cosmétiques » — celui de la
démonstration.

**Ce qui se produit.** Pour l'activité « Vente en ligne de cosmetiques naturels,
huiles essentielles et savons artisanaux fabriques en Tunisie », secteur déclaré
« Beauté, cosmétique et parfumerie » :

| Code | Libellé | Pertinence | Termes affichés |
| --- | --- | --- | --- |
| 5977 | Cosmétiques et parfumerie | 74 % | `cosmetiques` · `secteur : Beauté, cosmétique et parfumerie` |
| 7230 | Salons de coiffure et instituts de beauté | 66 % | `secteur : Beauté, cosmétique et parfumerie` |
| 7298 | Spas et centres de bien-être | 63 % | `secteur : Beauté, cosmétique et parfumerie` |
| 5912 | **Pharmacies et parapharmacies** | 57 % | `secteur : Beauté, cosmétique et parfumerie` |
| 5999 | Commerces de détail spécialisés divers | 50 % | `vente en ligne` |

Trois codes — un salon de coiffure, un spa, une pharmacie — portent **mot pour
mot la même et unique justification**, et s'échelonnent sur neuf points. Aucun
des trois ne correspond à la vente de cosmétiques en ligne, et l'écran ne donne à
l'agent aucun moyen de comprendre pourquoi un salon de coiffure lui est proposé à
66 % pour une boutique en ligne, ni pourquoi le spa vaut trois points de moins.

**Deux aggravations propres au référentiel rétabli.**

1. **Une pharmacie est proposée à 57 % à un vendeur de savons**, et la carte
   porte la mention « **Vigilance renforcée** » avec la note « Vente en ligne de
   médicaments strictement encadrée en Tunisie. » Le produit sait donc que ce
   code engage une réglementation particulière, et le propose quand même, au
   quatrième rang, sur la seule foi d'un secteur déclaré qui n'a rien de
   pharmaceutique. Un agent pressé qui suit le rang sans lire classerait un
   savonnier en pharmacie.
2. **Le code de repli 5999 concourt avec les vrais codes**, à 50 %, justifié par
   `vente en ligne` — un terme qui vaudrait pour n'importe quel dossier de la
   plateforme, puisque la plateforme ne traite que du commerce en ligne. Sa
   propre carte porte pourtant : « Code de repli : à n'utiliser que si aucun MCC
   plus précis ne correspond à l'activité. » L'écran affiche donc, à sept points
   du code qui le précède, un code qui se déclare lui-même de dernier recours.

Le cas est plus grave que `UTI-12` parce qu'il porte sur le dossier type du
produit : c'est ce qu'un agent verra le plus souvent.

**Reproduire.** Étape 3, secteur `Beauté, cosmétique et parfumerie`, description
`Vente en ligne de cosmetiques naturels, huiles essentielles et savons artisanaux
fabriques en Tunisie`, mode de livraison `Biens physiques livrés`, « Suivant ».

*Capture : `m01-propositions.png`.*

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
