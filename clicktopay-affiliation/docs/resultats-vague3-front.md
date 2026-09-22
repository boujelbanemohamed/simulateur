# Recette vague 3 — filière FRONT (agent 5) — retest

Exécution : 2026-09-22 · Interface `http://127.0.0.1:5173` (API 4000, base `clicktopay`).
Périmètre : (1) retest des 5 défauts front de `docs/resultats-vague2-front.md`,
(2) recherche de régressions sur les cas front conformes en vague 2,
(3) cas FRONT du plan restés `BLOQUÉ` ou non atteints.
Outillage : Playwright/Chromium, écouteurs `console`, `pageerror` et `requestfailed` sur chaque page.
Données créées préfixées `RECETTE-A5-`.
Captures : `/tmp/claude-0/-home-user-simulateur/2c840da0-0f37-50d2-9c7b-03919fb5b7eb/scratchpad/agent5/captures/`.

> Rédigé au fil de l'eau : chaque ligne est écrite dès le cas exécuté.

## 1. Retest des défauts de la vague 2

| Défaut / cas | Statut | Vérification faite | Résultat observé | Capture |
| --- | --- | --- | --- | --- |
| DEF-A2-01 (CAS-HAB-09) — formulaire « lecture seule » saisissable | **CORRIGÉ** (avec effet de bord, voir DEF-A5-01) | Reproduction exacte de la vague 2 : agent connecté, URL forcée `/demandes/20/modifier` (demande VALIDEE). Tentative de clic + frappe clavier, tentative de `fill`, tentative de `focus()` par script sur `#champ-siteName` | Le `<form class="carte">` porte `inert` (+ `opacity: .85`). Le clic échoue (élément non interactif), le `fill` laisse la valeur inchangée (`RECETTE-A2 Beldi Cosmetics D3`), `focus()` ne prend pas (`document.activeElement !== champ`), la tabulation saute tout le formulaire. Bandeau conservé : « … Vous la consultez en lecture seule ; toute saisie serait refusée à l'enregistrement. » Aucune erreur console | `a5-def01-edition-forcee-validee.png` |
| DEF-A2-02 (CAS-ERGO-04) — message « serveur injoignable » jamais affiché | **CORRIGÉ** (avec effet de bord, voir DEF-A5-02) | Reproduction exacte : agent connecté sur `/demandes`, `route('**/api/auth/me').abort('connectionrefused')`, puis rechargement | Le message est désormais rendu : `<div class="message message--attention" role="status">Session non vérifiée : le serveur est injoignable. Vos identifiants sont conservés.</div>` en haut de `/connexion`. Le jeton est conservé (identique avant/après). Retour du réseau + F5 → reprise automatique sur `/demandes`, en-tête `Salma Ben Ali / Agent — BQ001`. Un 401 explicite efface bien le jeton (`localStorage` à `null`) et n'affiche pas ce message | `a5-def02-serveur-injoignable.png`, `a5-def02-refus-401.png` |
| DEF-A2-03 (CAS-WF-06) — erreur d'arbitrage affichée deux fois | **CORRIGÉ** | Reproduction exacte : banquier sur `/demandes/19` (Soumise), clic « Rejeter » sans commentaire, puis clic « Demander un complément » sans commentaire | Une seule restitution : `document.querySelectorAll('.message--erreur')` → **1** élément, « Un commentaire est obligatoire pour un rejet ou une demande de complément. ». La 2e occurrence du texte dans la page est l'aide statique `p.champ__aide` de la carte d'arbitrage, présente avant le clic — ce n'est pas un doublon d'erreur. Statut inchangé (`Soumise`) dans les deux cas | `a5-def03-rejet-sans-commentaire.png`, `a5-def03-complement-sans-commentaire.png` |
| DEF-A2-04 (CAS-ERGO-05) — zones cliquables sous 32 px | **CORRIGÉ** | Reproduction exacte : 375 × 812 px, mesure de toutes les zones interactives (`button`, `a[href]`, cases, `[role=button]`, `select`) sur 11 écrans — `/connexion`, `/demandes`, les 5 étapes de `/demandes/nouvelle`, `/demandes/20`, `/referentiel`, `/administration/comptes`, `/administration/import` | **0 zone sous 32 px sur les 11 écrans** (144 zones mesurées). `bouton--petit` / « Déconnexion » passent de 31 à **32,9 px**. La case « Afficher aussi les codes non éligibles » : l'`input` fait toujours 18,4 px mais son `label[for=case-interdits]` fait **264,4 × 32 px** et est bien associé — le clic sur le libellé bascule la case (vérifié : `checked` true → false). Aucun défilement horizontal de page (`scrollWidth = clientWidth = 375`) sur les 11 écrans | `a5-def04-demandes.png`, `a5-def04-referentiel-case.png`, `a5-def04-admin-comptes.png` |
| DEF-A2-05 (CAS-ERGO-07) — 3 couples de contrastes sous 4,5:1 | **CORRIGÉ** | Reproduction exacte : calcul WCAG du rapport de contraste sur les couleurs calculées (`getComputedStyle`) des 3 sélecteurs incriminés, fond effectif remonté jusqu'au premier ancêtre opaque. `/demandes` pour les étiquettes, étape 4 d'une demande pour les jetons et les scores | Les 3 couples passent : `.etiquette--validee` `rgb(17,84,59)` sur `rgb(227,244,236)` = **7,82:1** (4,35 en vague 2) ; `.jeton--risque` (« Vigilance renforcée ») `rgb(125,78,4)` sur `rgb(253,241,220)` = **6,34:1** (3,97) ; `.mcc__score--moyen` même couple = **6,34:1** (3,97). Sur les 75 éléments mesurés (étiquettes des 5 statuts, `.champ__aide`, `.bouton`, barre supérieure, `.jeton`, `.mcc__score`), **aucun n'est sous 4,5:1** ; le plus bas est `.etiquette--rejetee` à 5,58:1 | `a5-def05-contrastes-demandes.png`, `a5-def05-contrastes-etape4.png` |

## 2. Correctifs du moteur visibles à l'écran

| Vérification | Statut | Vérification faite | Résultat observé | Capture |
| --- | --- | --- | --- | --- |
| Descriptif sans correspondance → une seule carte 5999 justifiée | **CONFORME** | Étape 4 d'une nouvelle demande, secteur non renseigné, descriptif sans aucun terme métier : `Zzzqwx yblrkt vdhmnp gjfsxo wplqzr tknvby dmhcqs xrlptw gvnzjk bfhmdq` | **Une seule carte** rendue : `5999 — Commerces de détail spécialisés divers`, `Pertinence 10 %`, jeton **« aucune correspondance : code de repli »**, plus la note « Code de repli : à n'utiliser que si aucun MCC plus précis ne correspond à l'activité. » Plus de six codes à 31 % sans justification | `a5-mcc-sans-correspondance.png`, `a5-mcc-jetons-profil5.png` |
| Toute carte porte au moins un terme justificatif | **CONFORME** | (a) À l'écran : étape 4 sur 5 profils (beauté/physique, contenus numériques/numérique, assurance-finance/service, autre/physique, sans correspondance) — 24 cartes rendues. (b) Balayage du moteur depuis l'API : 28 secteurs × 10 descriptifs × 2 modes de livraison × 2 combinaisons d'options = **1 120 profils** | (a) **0 carte sans jeton** sur les 24 ; chaque carte porte de 1 à 6 jetons (termes du descriptif, `secteur : …`, `livraison numérique`, `Vigilance renforcée`). (b) **0 suggestion à `matchedTerms` vide** et **0 liste vide** sur les 1 120 profils | `a5-mcc-jetons-profil1.png` à `a5-mcc-jetons-profil5.png` |

## 3. Recherche de régressions sur les cas conformes en vague 2

| Cas | Statut | Vérification faite | Résultat observé | Capture |
| --- | --- | --- | --- | --- |
| CAS-DEM-04 / CAS-ERGO-01 / CAS-ERGO-02 | CONFORME | `/demandes/nouvelle` : URL `pasuneurl`, RNE `!!`, description `court`, défilement en bas puis « Soumettre au banquier » | Bandeau `role="alert"` « Données invalides » listant 11 messages en intitulés métier (`Adresse du site`, `RNE`, `Téléphone`, `Description de l'activité`…), aucun nom technique. Page ramenée sur le bandeau (`scrollY` 116 → 0), focus sur le conteneur `tabindex="-1"` qui le contient | `a5-reg-dem04-bandeau.png` |
| CAS-DEM-13 | CONFORME | Étape 3 : compteurs de la description et des types de produits, collage de 2 500 caractères, frappe clavier | `0 / 2000 caractères (20 minimum)` → `21 / …` → `23 / …` ; collage tronqué à 2 000 (`maxlength="2000"`) et aide `2000 / 2000 caractères (20 minimum)` ; « Types de produits » tronqué à 1 000 | `a5-reg-dem13-compteurs.png` |
| CAS-DEM-05 | CONFORME | Deux clics successifs sur « Enregistrer le brouillon » | 1er clic : URL `/demandes/28/modifier`, bandeau « Demande AFF-2026-00028 enregistrée en brouillon. » ; 2e clic : même URL, `GET /api/requests?search=RECETTEA5V3` → **1** demande | `a5-reg-dem05-brouillon.png` |
| CAS-DEM-06 | CONFORME | F5 sur `/demandes/28/modifier`, relecture des 5 étapes | Site, RNE, date `2021-03-15`, ville, téléphone, secteur, description, cases à cocher restitués à l'identique ; aucun `null` affiché | `a5-reg-dem06-reprise.png` |
| CAS-DEM-11 / CAS-WF-02 | CONFORME | Étape 5 sans MCC, puis « Soumettre au banquier » | Récapitulatif : `MCC Visa proposé —` / `MCC Mastercard proposé —` ; le clic ramène à l'étape 5 avec « Un MCC Visa et un MCC Mastercard doivent être proposés avant la soumission. » ; statut inchangé | `a5-reg-dem11-wf02.png` |
| CAS-MCC-01 / MCC-02 / MCC-14 | **RÉGRESSION partielle** (voir DEF-A5-03) | Étape 4 de la demande `RECETTE-A5 Beldi Cosmetics V3` (profil JD-01 du plan) : structure des cartes, ordre, scores, jetons | Ordre et scores conformes au plan : `5977:75, 7230:66, 7298:63, 5912:57, 5999:50` ; message d'en-tête exact (« … norme ISO 18245 … modifiables réseau par réseau. ») ; chaque carte est un `<button aria-pressed>` portant code, libellé FR, description FR, `Définition Visa : …`, `Pertinence NN %` ; `5912` porte « Vigilance renforcée » ; classes `mcc__score--moyen` / `--faible` correctes ; aucun code INTERDIT. **Mais une 6e carte `5968 — Direct Marketing – Continuity/Subscription Merchant`, `Pertinence 32 %`, est rendue sans aucun jeton** → DEF-A5-03 | `a5-reg-mcc-propositions.png` |
| CAS-DEM-14 | CONFORME | Étape 4, cibles « Visa » / « Mastercard » / « Les deux réseaux » (sélecteurs exacts) | Visa→5977 (MC vide) ; Mastercard→5912 (Visa 5977) ; Les deux→5999/5999 ; re-clic Visa sur 5999 → Visa vide, MC 5999. Les deux champs restent `readOnly` | `a5-reg-dem14-selection-reseau.png` |
| CAS-DEM-12 | CONFORME | Recherche manuelle `5942` en étape 4, sélection sur les deux réseaux, passage à l'étape 5 | La carte `5942` est ajoutée aux résultats et sélectionnable ; `proposedVisaMcc = proposedMastercardMcc = 5942` ; le récapitulatif la restitue | `a5-reg-dem12-recap.png` |
| Parcours complet : saisie → soumission → complément → reprise → validation | CONFORME | Demande `RECETTE-A5 Beldi Cosmetics V3` (AFF-2026-00028) menée de bout en bout : 5 étapes, MCC 5977/5977, soumission, complément demandé par le banquier avec commentaire, reprise et modification par l'agent, re-soumission, validation avec MCC modifiés (5912/5999) | Chaque transition aboutit et le statut suit : `Brouillon` → `Soumise` → `Complément requis` → `Soumise` → `Validée`. **La correction `inert` ne bloque pas l'édition légitime** : au statut `Complément requis`, `/demandes/28/modifier` rend un formulaire sans `inert`, saisissable et enregistrable | `a5-reg-wf-soumission.png`, `a5-reg-wf-complement.png`, `a5-reg-reprise-complement.png`, `a5-reg-resoumission.png` |
| CAS-WF-03 / CAS-HAB-02 (front) | CONFORME | Agent auteur sur `/demandes/28` au statut `Soumise` | Seuls « Déconnexion » et « Retour » sont rendus ; ni « Modifier » ni « Soumettre » ; carte « Arbitrage du banquier » et champ commentaire absents du DOM | `a5-reg-wf03-agent-soumise.png` |
| CAS-ERGO-03 (3) | CONFORME | `/api/requests/*/decision` bridé à 2,5 s, clic « Valider l'affiliation » | « Valider l'affiliation » et « Rejeter » passent à `disabled` (`opacity: 0.55`, `cursor: not-allowed`) pendant l'appel ; un seul événement produit | `a5-reg-ergo03-boutons-desactives.png` |
| CAS-WF-05 / CAS-ERGO-10 | CONFORME | `/demandes/28` après validation avec MCC modifiés | Carte « Codes MCC » : `Proposé par l'agent — Visa 5977` / `— Mastercard 5977`, `Retenu — Visa 5912` / `Retenu — Mastercard 5999`, justification de l'agent, mention de modification, et carte « Propositions du moteur » figée consultable sur la même page | `a5-reg-wf05-propose-retenu.png` |
| CAS-WF-08 / CAS-ERGO-09 | CONFORME | Journal de `/demandes/28` (écran + `GET /api/requests/28/events`) | 9 entrées chronologiques cohérentes : `CREATION, MODIFICATION×3, SOUMISSION, COMPLEMENT_REQUIS, MODIFICATION, SOUMISSION, VALIDATION_AVEC_MODIFICATION` ; à l'écran chaque ligne porte le libellé français, le nom + rôle et la date `22/09/2026 08:11` ; les commentaires du banquier sont affichés entre guillemets | `a5-reg-wf08-journal.png` |
| CAS-AUTH-01 (front) | CONFORME | Connexion `agent@banque.tn` | Redirection `/demandes`, en-tête `Salma Ben Ali` / `Agent — BQ001`, liens `Demandes`, `Nouvelle demande`, `Référentiel MCC` | `a5-reg-auth01.png` |
| CAS-HAB-03 (front) | CONFORME | Agent, URL forcée `/administration/comptes` | Redirection vers `/demandes` ; aucun lien ni écran « Administration » | `a5-reg-hab03.png` |
| CAS-WF-09 (front) | CONFORME | `/demandes/22` (Rejetée) | Bandeau « Demande rejetée — Activite non eligible : vente de produits reglementes. » ; seuls « Déconnexion » et « Retour » | `a5-reg-wf09-rejetee.png` |
| CAS-WF-10 (front) | CONFORME | `/demandes/20` (Validée) | Aucun bouton « Modifier » ni « Soumettre » | `a5-reg-wf09-rejetee.png` |
| CAS-ERGO-08 | CONFORME | `/demandes` : compteurs vs `GET /api/requests/stats`, filtre statut, clic sur un compteur, recherche, liste vide | Compteurs `4/13/1/9/1` = stats (`SOUMISE 4, BROUILLON 13, COMPLEMENT_REQUIS 1, VALIDEE 9, REJETEE 1`) ; filtre `VALIDEE` → 9 lignes toutes « Validée » ; clic sur « À traiter » → 4 lignes toutes « Soumise » ; recherche `RECETTEA5V3` → 1 ligne ; recherche sans résultat → « Aucune demande ne correspond à ces critères. Saisir une première demande. » sans tableau (`document.querySelectorAll('table').length === 0`). Le compteur `TOTAL` attendu par le plan reste volontairement non exposé (constat identique à la vague 2) | `a5-reg-ergo08-filtres.png` |
| CAS-HAB-01 (front) | CONFORME | Banquier, URL forcée `/demandes/nouvelle` | Redirection `/demandes`, `#champ-siteName` absent du DOM, lien « Nouvelle demande » absent de l'en-tête | `a5-reg-hab01.png` |
| CAS-HAB-04 (front) | CONFORME | Agent2 (BQ002) sur `/demandes/28` (demande BQ001) | Bandeau « Cette demande appartient à une autre banque. » seul ; aucune donnée BQ001 dans le DOM (raison sociale, RNE, e-mail du contact : 0 occurrence) ; liste BQ002 vide | `a5-reg-hab04.png` |
| CAS-HAB-07 (front) | CONFORME | En-tête pour AGENT, BANQUIER, ADMIN | Lien « Référentiel MCC » présent pour les trois rôles ; « Administration » réservé à l'admin | `a5-reg-hab10.png` |
| CAS-HAB-10 (front) | CONFORME | Admin sur `/demandes/nouvelle` | Écran rendu (`#champ-siteName` présent), lien « Nouvelle demande » visible | `a5-reg-hab10.png` |
| CAS-ERGO-12 (cas 1) | CONFORME | Étape 4 atteinte sans description d'activité | Message exact « Complétez la description de l'activité à l'étape précédente pour obtenir des propositions de MCC. », 0 carte | `a5-reg-ergo12-sans-description.png` |
| CAS-ERGO-12 (cas 2) | CONFORME | Secteur `SECTEUR_IMAGINAIRE` injecté dans `POST /api/mcc/suggest` (reproduction exacte de la vague 2) | Bandeau « Propositions indisponibles — Données invalides — Secteur inconnu », 0 carte, aucune liste vide muette | `a5-reg-ergo12-indisponibles.png` |
| CAS-ROB-10 (front) | CONFORME | `<script>alert(1)</script>` en recherche référentiel ; relecture de la demande 27 créée en vague 2 avec la même chaîne en « Nom du site » | Aucune boîte de dialogue, aucun script injecté dans le HTML rendu (`innerHTML` ne contient pas la balise), « Aucun code ne correspond à cette recherche. » ; la fiche restitue le texte littéralement | `a5-reg-rob10-referentiel.png`, `a5-reg-rob14.png` |
| CAS-ROB-14 (front) | CONFORME | Relecture de la demande 27 (`SOCIÉTÉ ÉLÈVE & Cie – « Beldi »`, `Sfax`, `بن علي`) | Tous les caractères restitués à l'identique, aucun caractère de remplacement (`U+FFFD`) | `a5-reg-rob14.png` |
| Référentiel MCC (écran) | CONFORME | `/referentiel` : en-tête, recherche, case « Afficher aussi les codes non éligibles » | « 279 codes marchands issus du Visa Merchant Data Standards Manual… », 60 fiches en première page ; recherche `5977` → 1 fiche `Cosmétiques et parfumerie` ; case décochée → `7995` et `6051` (codes non éligibles) introuvables, `5122` toujours trouvé ; case recochée → les trois trouvés | `a5-reg-referentiel.png`, `a5-reg-referentiel-interdits.png` |
| Écrans d'administration (ADM, partie front) | CONFORME | Admin sur `/administration/comptes`, `/banques`, `/referentiel`, `/import`, `/journal` | Les 5 onglets sont rendus et alimentés : 7 comptes avec rôle, banque, statut (dont « mot de passe à changer ») et dernière connexion ; 3 banques avec nombre de comptes et de demandes ; référentiel admin « 279 codes actifs sur 279 » avec actions `Ouvrir` / `Désactiver` ; journal d'administration horodaté et nominatif. Aucune erreur console ni requête en échec | `a5-adm-comptes.png`, `a5-adm-banques.png`, `a5-adm-referentiel-admin.png`, `a5-adm-journal.png` |
| CAS-ERGO-11 (non atteint en vague 2) | **CONFORME** | `/administration/import` : téléchargement de l'export CSV (279 codes), modification de la note du code `5977`, suppression de 2 lignes, rechargement du fichier — **sans confirmer l'application** | Bandeau **« Simulation — aucune donnée modifiée »** présent ; les 4 compteurs sont affichés (`0 AJOUTÉS`, `1 MODIFIÉS`, `276 INCHANGÉS`, `2 ABSENTS DU FICHIER`) ; la case `case-desactiverAbsents` « Désactiver les 2 code(s) absent(s) du fichier » est **décochée par défaut** ; le clic sur « Appliquer l'import » ouvre une **seconde confirmation** « Confirmer l'application — 0 ajout(s), 1 modification(s) vont être écrits dans le référentiel… » avec « Annuler » / « Oui, appliquer l'import ». Écran de lecture complet : `277 sur 278 lue(s)`, colonnes reconnues, 1 ligne écartée avec motif et numéro de ligne, tableaux « Codes modifiés » (avant/après) et « Codes absents du fichier ». **Aucune écriture effectuée** (confirmation non validée) | `a5-ergo11-simulation.png`, `a5-ergo11-confirmation.png` |
| CAS-ERGO-06 | CONFORME | `/demandes/nouvelle` : association `label[for]` sur les 5 étapes, activation des cartes MCC au clavier, anneau de focus | **0 champ sans étiquette associée** sur les 5 étapes ; carte MCC focalisée : `Entrée` → `aria-pressed="true"` et `proposedVisaMcc = 5977`, `Espace` → désélection (`aria-pressed="false"`, champ vidé) ; `outline: auto 1px` visible au focus. La pose de `inert` ne crée aucun piège au clavier | `a5-reg-ergo06-clavier.png` |
| CAS-AUTH-12 (front, non atteint en vague 2) | CONFORME | `/administration/comptes` → « + Nouveau compte », mot de passe `abc` puis `Recette2026a5` | Aide du champ : « 10 caractères minimum, une minuscule, une majuscule et un chiffre » ; `POST /api/admin/users` → 400 restitué en français dans le bandeau : « Mot de passe : Le mot de passe doit comporter au moins 10 caractères » + « … une minuscule, une majuscule et un chiffre », et sous le champ ; avec un mot de passe conforme, 201 et le compte apparaît dans la liste au statut « mot de passe à changer » | `a5-auth12-politique-mdp.png`, `a5-auth12-compte-cree.png` |
| CAS-AUTH-11 (front, non atteint en vague 2) | CONFORME | Première connexion du compte `recette-a5-02@banque.tn` créé par l'administrateur | Redirection forcée vers `/mot-de-passe` : « Changement obligatoire — Votre mot de passe a été réinitialisé par un administrateur. Vous devez en définir un nouveau avant d'accéder à la plateforme. » ; l'URL forcée `/demandes` ramène sur `/mot-de-passe` ; après changement conforme, accès à `/demandes` (liste vide, BQ002) | `a5-auth11-mdp-obligatoire.png`, `a5-auth11-url-forcee.png`, `a5-auth11-apres-changement.png` |

## 4. Défauts de la vague 3

### DEF-A5-01 — Effet de bord de `inert` : en lecture seule, « Précédent », « Suivant » et « Voir la demande » deviennent inutilisables
**Gravité : MINEUR** · Écran : `/demandes/<id>/modifier` sur une demande non modifiable (VALIDEE, SOUMISE, REJETEE) · `web/src/pages/RequestFormPage.jsx`

La correction de DEF-A2-01 pose `inert` sur le `<form class="carte">`. Or ce formulaire contient
non seulement les champs, mais aussi les boutons de navigation du pied de page.

- Reproduction : agent connecté, URL forcée `/demandes/20/modifier` (demande VALIDEE).
- Observé : `form.contains(bouton)` vaut `true` pour « Suivant » et « Voir la demande » ;
  `page.click('button:has-text("Suivant")')` et `page.click('button:has-text("Voir la demande")')`
  échouent tous deux par dépassement de délai (l'élément n'est jamais interactif) alors que le
  bouton est bien peint à l'écran, à sa taille normale (171,6 × 40,5 px, `pointer-events: auto`).
  La tabulation saute l'ensemble du formulaire : après « Déconnexion » et les 5 onglets d'étape,
  le focus repart sur la barre supérieure — aucun accès clavier à « Voir la demande ».
- Attendu : les commandes de navigation et de retour restent utilisables en consultation ; seules
  les zones de saisie et les boutons d'écriture sont neutralisés.
- Atténuation : les 5 onglets d'étape sont hors du formulaire et restent cliquables, la consultation
  des 5 étapes reste donc possible. Le défaut porte sur la navigation séquentielle et le retour.
- Capture : `a5-def01-bord-navigation.png`, `a5-def01-voir-la-demande-inerte.png`.

### DEF-A5-02 — Effet de bord : le message « Session non vérifiée » survit à une reconnexion réussie
**Gravité : MINEUR** · Écrans : toutes les pages de l'application après une panne réseau · `web/src/auth/AuthContext.jsx`

La correction de DEF-A2-02 affiche bien le message, mais `erreurSession` n'est jamais remis à zéro
lors d'une connexion réussie.

- Reproduction : agent connecté sur `/demandes` ; `route('**/api/auth/me').abort('connectionrefused')` ;
  rechargement → renvoi sur `/connexion` avec le message (comportement attendu) ; **rétablissement du
  réseau** puis saisie des identifiants et « Se connecter ».
- Observé : la connexion aboutit (`/demandes`, en-tête `Salma Ben Ali`), **et le bandeau
  `message--attention` « Session non vérifiée : le serveur est injoignable. Vos identifiants sont
  conservés. » reste affiché** en haut de l'écran. Il persiste à la navigation interne (vérifié sur
  `/referentiel`) et ne disparaît qu'au rechargement complet de la page (F5).
- Attendu : le message disparaît dès que la session est vérifiée — l'afficher alors que la session
  vient d'être établie dit exactement le contraire de la vérité à l'utilisateur.
- Capture : `a5-def02-message-persistant-apres-reconnexion.png`.

### DEF-A5-03 — Une carte de proposition MCC est rendue sans aucun terme justificatif
**Gravité : MAJEUR** · Écrans : étape 4 de `/demandes/<id>/modifier` (agent) **et** carte d'arbitrage de `/demandes/<id>` (banquier)

Le correctif du moteur tient pour le descriptif d'activité, mais pas pour les termes issus du **nom
du site** et de l'**adresse du site** : un code remonté par un mot trouvé dans ces deux champs
arrive avec `matchedTerms` vide, et la carte s'affiche sans jeton sous le score.

- Reproduction exacte, profil JD-01 du plan : `siteName = "Beldi Cosmetics"`,
  `siteUrl = "https://beldi-cosmetics.tn"`, secteur `BEAUTE_COSMETIQUE`, descriptif cosmétiques.
- Observé à l'écran (demande AFF-2026-00028, étape 4) : 6 cartes, dont
  **`5968 — Vente à distance – abonnements et ventes récurrentes`, `Pertinence 32 %`, 0 jeton** —
  la carte passe directement du score à la note « Paiement récurrent : mandat client et conditions
  de résiliation à documenter. ». La même carte sans justification est rendue au banquier dans la
  carte « Arbitrage du banquier ».
- Isolement du déclencheur : le terme anglais `cosmetics` présent dans le nom ou l'adresse du site
  suffit (`siteName = "Beldi Cosmetics"` seul, ou `siteUrl` seul, le reproduisent ; avec
  `siteName = "RECETTE-A5"` ou vide, la carte `5968` disparaît). Le terme correspond au descriptif
  Visa anglais de `5968` (« … magazines/newspapers cosmetics, food, clothing… ») mais n'est pas
  remonté comme jeton.
- Mesure de l'étendue : balayage de 504 profils (28 secteurs × 6 couples nom/adresse réalistes ×
  3 modes de livraison) → **30 suggestions sans terme justificatif**, sur 2 codes (`5968` × 24,
  `5311 — Department Stores` × 6). Le même balayage sans nom ni adresse de site
  (1 120 profils) n'en produit aucune : c'est bien l'apport du nom et de l'URL qui échappe au
  correctif.
- Attendu : toute carte porte au moins un terme justificatif, ou le code n'est pas proposé.
- Capture : `a5-reg-mcc-propositions.png`, `a5-reg-banquier-arbitrage.png`.
- Réserve : `server/src/services/mccSuggestion.js` a été modifié dans l'arbre de travail à 08:21 UTC,
  pendant cette campagne, par un autre intervenant. Le défaut a été **revérifié à 08:24 UTC contre
  l'API en service** et se reproduit toujours à l'identique.

## 5. Observations (pas des défauts)

- **Erreurs console.** Les écouteurs `console`, `pageerror` et `requestfailed` étaient branchés sur
  chaque page. **Aucune erreur JavaScript (`pageerror`) sur l'ensemble de la campagne.** Les seules
  lignes `console:error` relevées sont les traces que le navigateur émet pour des réponses HTTP que
  l'application traite correctement : 400 sur `/api/requests/*/decision` (commentaire manquant),
  400 sur `/api/mcc/suggest` (secteur invalide), 400 sur `/api/admin/users` (mot de passe faible),
  401 sur `/api/auth/me` (jeton refusé), 403 sur `/api/requests/28` (cloisonnement inter-banques),
  et `net::ERR_CONNECTION_REFUSED` sur les coupures réseau simulées. Toutes étaient provoquées
  volontairement par le test.
- **Requêtes doublées.** Chaque appel d'API part deux fois (`GET /api/requests/28` ×2, etc.). C'est
  le double rendu du mode strict de React sur le serveur de développement Vite, pas un défaut du
  produit ; à revérifier sur un paquet de production.
- **Compteur `TOTAL`.** Le plan attend 6 compteurs sur `/demandes`, le produit en expose 5. Constat
  identique à la vague 2 : attente du plan inexacte, pas un défaut.
- **Case « Banque » du formulaire de compte.** Le clic sur « Créer le compte » sans banque choisie ne
  produit aucun message dans l'interface : la validation est déléguée à l'attribut natif `required`
  du navigateur (bulle système), là où le reste du produit rend ses erreurs dans un bandeau. Écart
  d'homogénéité, hors périmètre des cas ERGO du plan.

## 6. Synthèse

| | |
| --- | --- |
| Défauts de la vague 2 retestés | 5 |
| **Corrigés** | **5** (`DEF-A2-01`, `DEF-A2-02`, `DEF-A2-03`, `DEF-A2-04`, `DEF-A2-05`) |
| Non corrigés | 0 |
| Effets de bord introduits par les correctifs | 2 (`DEF-A5-01`, `DEF-A5-02`) |
| Correctifs du moteur visibles à l'écran | 1 conforme (repli 5999 seul et justifié), 1 **incomplet** (`DEF-A5-03`) |
| Cas de la vague 2 rejoués sans régression | 27 |
| Régressions | 0 au sens strict — `CAS-MCC-01/02/14` reste conforme sur tout ce que la vague 2 avait vérifié, la carte sans jeton est un défaut nouveau (`DEF-A5-03`) |
| Cas non atteints en vague 2 exécutés | 3 (`CAS-ERGO-11`, `CAS-AUTH-11` front, `CAS-AUTH-12` front) — tous conformes |
| Nouveaux défauts | 3 : `DEF-A5-01` (mineur), `DEF-A5-02` (mineur), `DEF-A5-03` (majeur) |

**Avis sur l'état de l'interface.** Les cinq défauts de la vague 2 sont réellement corrigés, et
vérifiés par la reproduction exacte du scénario d'origine, pas par lecture du code : le formulaire
en lecture seule est effectivement inerte (clic, `fill` et `focus()` tous sans effet), le message de
panne réseau est affiché, l'erreur d'arbitrage n'apparaît plus qu'une fois, les 144 zones cliquables
mesurées sur 11 écrans en 375 px sont toutes à 32 px ou plus, et les trois couples de contrastes
incriminés passent de 3,97–4,35:1 à 6,34–7,82:1. Le parcours métier complet — saisie, brouillon,
reprise après rechargement, soumission, demande de complément, reprise par l'agent, validation avec
modification des MCC — se déroule de bout en bout sans erreur JavaScript, et la correction `inert`
ne bloque pas l'édition légitime d'une demande au statut « Complément requis ».

Restent trois réserves. Les deux effets de bord sont bénins mais typiques d'un correctif posé un cran
trop haut dans l'arbre (`inert` sur tout le formulaire) ou d'un état jamais réinitialisé
(`erreurSession`) ; ils se corrigent en quelques lignes. La troisième réserve est plus gênante :
`DEF-A5-03` montre que le correctif « toute proposition doit être justifiée » n'a été appliqué qu'au
descriptif d'activité, et que les termes tirés du nom et de l'adresse du site continuent de faire
remonter des codes sans justification affichée. Le cas se produit précisément sur le profil de
référence du plan (« Beldi Cosmetics »), c'est-à-dire sur la démonstration que le banquier verra en
premier, dans un produit dont l'explicabilité est la raison d'être. L'interface est utilisable en
l'état ; c'est ce dernier point qui mérite une correction avant mise à disposition.
