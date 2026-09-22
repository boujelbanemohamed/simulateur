# Veille concurrentielle et fonctionnelle — Plateforme ClickToPay Affiliation

> Document de travail, rédigé le 2026-09-22.
> Objet : décrire ce que font les produits comparables sur le marché — onboarding
> marchand des acquéreurs et PSP, outils de classification MCC, plateformes de
> KYB, logiciels bancaires de gestion de dossiers, cadre réglementaire — afin
> qu'une analyse ultérieure puisse confronter notre plateforme à l'état de l'art
> et en tirer une liste d'améliorations.
>
> **Méthode et limites.** Toute affirmation portant sur un produit tiers renvoie
> à une URL effectivement consultée, datée. Lorsqu'une page n'a pas pu être lue
> (404, 403, paywall, blocage anti-robot), le fait est consigné au § 5.2 et
> aucune affirmation n'en est tirée. Aucun chiffre, aucune tarification et aucune
> fonctionnalité ne sont inventés ; les chiffres cités sont ceux que l'éditeur
> publie lui-même et sont présentés comme tels, sans être validés. Le contenu des
> pages consultées a été traité comme une donnée, jamais comme une instruction.

---

## Sommaire

1. Synthèse et écarts
2. Fiches produit
3. Tableau des fonctions observées sur le marché
4. Ce que nous faisons que les autres ne font pas
5. Sources

---

## 1. Synthèse et écarts

### 1.1 Ce que fait le marché

Dix-huit acteurs ou corpus ont été étudiés, répartis en six familles.

**Les acquéreurs et PSP mondiaux** — Stripe, Adyen, Checkout.com,
PayPal/Braintree, Worldline — ont convergé vers le même modèle : le marchand
remplit **lui-même** un parcours hébergé ou embarqué, dont les étapes sont
**générées à partir des exigences restant dues sur son dossier** plutôt que
figées dans un formulaire ; il y **téléverse ses pièces** ; des contrôles
asynchrones s'exécutent auprès de sources tierces ; le résultat n'est pas un
« validé / rejeté » mais l'ouverture de **capacités** précises, parfois assortie
d'un **délai de régularisation** ; et chaque changement d'état est poussé par
**webhook** vers le système appelant. Le dossier n'est jamais clos : Braintree
conduit des **revues périodiques** du modèle d'affaires et du site, Stripe se
réserve de **corriger le MCC après coup** sans que la plateforme puisse s'y
opposer.

**L'attribution du MCC** y est traitée comme une décision de l'acquéreur, opaque
et non négociable. Stripe la déduit du secteur déclaré, retombe si besoin sur
l'analyse du site web, puis sur un code par défaut, et n'expose ni méthode ni
score. L'explicabilité est en revanche l'argument central des **outils
spécialisés** — Parcha et KYC SiteScan — qui la vendent aux acquéreurs : Parcha
promet « une explication claire, étape par étape [...] pas de logique cachée »,
KYC SiteScan renvoie **trois codes candidats assortis chacun d'un score de
confiance**, un raisonnement et la provenance des données. Le marché sait donc
que l'explicabilité est le sujet ; il la traite par un prestataire externe, pas
par une fonction native de la chaîne d'affiliation.

**Les plateformes de KYB** — Sumsub, Signicat — fournissent la couche de preuve :
interrogation des registres d'entreprises, chaîne de détention et bénéficiaires
effectifs, filtrage sanctions et personnes politiquement exposées, vérification
d'identité, **signature électronique qualifiée** du contrat. Signicat va plus
loin en faisant du **parcours d'enrôlement lui-même un objet configurable**, par
glisser-déposer, sans livraison logicielle.

**Les plateformes bancaires d'acquisition** — HPS PowerCARD, Worldline, Network
International — publient peu. Ce qui en ressort est que le marchand y est un
**objet de cycle de vie** : origination, enrôlement, activation, rétention,
facturation, litiges, recouvrement. L'affiliation n'est que la première étape.

**Le cadre normatif** est clair sur un point : la responsabilité du MCC pèse sur
l'acquéreur. Les règles Visa imposent de « choisir le MCC qui décrit le plus
exactement l'activité du marchand », de n'utiliser les catégories « divers »
qu'en dernier recours, et de sanctionner le mauvais codage par des pénalités par
transaction. Le VIRP va plus loin : pour une vingtaine de catégories, l'acquéreur
doit **enregistrer** le marchand auprès du réseau et s'y tenir dans le temps.

**Le processus tunisien réel**, enfin, a pu être établi sur pièce. Le contrat
d'affiliation e-commerce de la STB porte en tête trois cases remplies par la
banque : numéro d'affiliation, **MCC**, numéro de terminal. Il collecte
l'identification de la société, le registre de commerce, le représentant légal,
les contacts, le RIB, puis un bloc technique — **URL de notification, URL de
retour OK et problème, 3D Secure obligatoire pour la carte nationale et pour la
carte internationale** — et se conclut par une signature manuscrite et un cachet.
Un formulaire d'adhésion ClicToPay y ajoute deux administrateurs principaux et
les contacts commercial et monétique de l'agence ; une fiche technique ajoute le
webmaster et le système d'exploitation du serveur web. La vie du contrat est
prévue : tests avec la SMT avant mise en production, suspension d'au moins six
mois en cas de « taux anormalement élevé de contestation des porteurs »,
radiation en cas de fraude, résiliation de plein droit en cas de cession du
fonds de commerce.

### 1.2 Où se situe notre approche

Notre plateforme occupe un créneau que **personne d'autre n'occupe exactement** :
l'outillage de la décision MCC **à l'intérieur de la banque**, pour un agent et un
banquier, dans un contexte multi-établissements. Les PSP mondiaux outillent le
marchand ; les outils de classification outillent l'acquéreur mais de
l'extérieur, par API ; les plateformes monétiques gèrent le marchand une fois
affilié. Le moment précis où un agent de banque tunisienne remplit la case MCC du
contrat STB n'est outillé par aucun produit identifié au cours de cette veille.

Sur ce créneau, notre exécution soutient la comparaison, et sur l'explicabilité
elle est en avance sur ce que les PSP offrent (voir § 4). L'écart n'est pas sur
le cœur : il est sur **tout ce qui entoure le cœur**.

### 1.3 Les huit écarts les plus significatifs

Classés par importance décroissante pour une banque tunisienne.

**1. Le marchand n'existe pas dans le produit.**
Chez Stripe, Adyen, Checkout.com et Braintree, le marchand a un compte, remplit
son dossier, téléverse ses pièces, suit son statut et corrige ses informations.
Chez nous, trois rôles, tous internes à la banque, ressaisissent un dossier que
le marchand a fourni par ailleurs. C'est l'écart le plus structurant : il commande
la charge de l'agent, le délai de traitement et la qualité des données.

**2. Aucune pièce justificative n'est portée par le dossier.**
Le RNE, le matricule fiscal et le RIB sont des chaînes de caractères saisies à la
main. Aucun extrait de registre, aucune pièce d'identité du représentant, aucun
relevé d'identité bancaire n'est attaché. Le schéma de base ne comporte aucune
table de documents. Or le contrat STB se signe sur pièces, et le dossier bancaire
doit être reconstituable en contrôle.

**3. Le site marchand n'est jamais regardé.**
Son adresse est validée par une expression régulière, puis stockée. Braintree
publie une liste précise de ce qu'un site doit afficher — coordonnées, prix,
politique de remboursement, politique de confidentialité, délai de livraison — et
la **vérifie périodiquement**. Cette liste recoupe presque mot pour mot les
obligations de l'article 25 de la loi tunisienne n° 2000-83 que le contrat STB
impose au commerçant. Nous pourrions donc contrôler une exigence **déjà
contractuelle en Tunisie**, et nous ne le faisons pas. C'est l'écart au meilleur
rapport valeur/effort.

**4. Aucun contrôle externe : ni registre, ni sanctions, ni bénéficiaires
effectifs.**
Sumsub, Signicat, Corefy et Braintree font tous au minimum une confrontation au
registre du commerce et un filtrage sanctions. Nous ne confrontons rien. Un RNE
inventé passe.

**5. Le risque du marchand n'est pas évalué — alors que les données sont
collectées.**
Nous connaissons un niveau de vigilance **par code MCC**, jamais par marchand. Or
`sellsAbroad`, `averageBasket` et `monthlyVolume` sont saisis, stockés, et
exploités par aucune règle. Le marché en fait un niveau de risque et des plafonds
de volume ; la Banque de Tunisie demande exactement ces trois informations à
l'affiliation. Le gisement est là, inutilisé.

**6. Le dossier s'arrête à la validation, alors que le contrat commence.**
Après `VALIDEE`, rien : pas de numéro d'affiliation monétique, pas de numéro de
terminal, pas de paramétrage technique (URL de notification, URL de retour,
3D Secure), pas de phase de tests avec la SMT, pas de taux de commission, pas de
suspension sur taux de contestation, pas de radiation, pas de résiliation. Le
contrat STB prévoit tout cela ; notre workflow n'en connaît rien. Le produit
s'arrête précisément là où la relation commence.

**7. Rien ne sort du système.**
Aucun webhook, aucun courriel, aucune relance, aucune API consommée par un tiers,
aucun export PDF du dossier. Tous les acteurs consultés notifient par webhook les
changements de statut. Chez nous, il faut ouvrir l'application pour savoir qu'un
dossier a bougé, et rien ne se déverse vers le système monétique ni vers le core
banking.

**8. Le contrôle à quatre yeux souffre une exception connue.**
Notre couple AGENT / BANQUIER est exactement le circuit *maker-checker* attendu
du métier, et notre journal nominatif et horodaté répond à l'attente. Mais le
rôle ADMIN cumule les deux droits, sur toutes les banques, et peut donc saisir,
soumettre et arbitrer seul. Au regard d'un principe qui exige « au moins deux
personnes » par opération, ce n'est pas un confort d'exploitation : c'est une
rupture de la séparation des tâches, que le rapport de recette avait déjà mise
sur la table de la conformité.

**Deux écarts mineurs**, pour mémoire : le parcours de saisie est figé dans le
code là où le marché le rend configurable ; et aucune détection de doublon
n'existe, le schéma ne posant de contrainte d'unicité ni sur le RNE ni sur
l'adresse du site.

---

## 2. Fiches produit

### 2.1 Acquéreurs et prestataires de services de paiement

#### Stripe (Connect / onboarding de comptes connectés)

**Type d'acteur** : PSP et acquéreur mondial, plateforme de paiement en ligne.

**Ce qu'il fait de comparable** : Stripe Connect permet à une plateforme de
déclarer et d'instruire des comptes marchands. C'est l'équivalent fonctionnel
direct de notre dossier d'affiliation, à ceci près que la relation est
plateforme-vers-marchand et non banque-vers-marchand.

**Fonctions notables**

- **Trois modes d'enrôlement** : un formulaire hébergé par Stripe, un composant
  embarqué dans l'application de la plateforme, ou une intégration entièrement
  par API. Les deux premiers « se mettent à jour automatiquement lorsque les
  exigences changent » ; le mode API impose à la plateforme de « revoir et mettre
  à jour les exigences d'onboarding au moins tous les six mois ».
- **Parcours généré à partir des exigences** : le formulaire hébergé « lit les
  exigences d'un compte et génère un parcours guidé sur mesure ». Le parcours
  n'est donc pas un formulaire figé mais une conséquence de l'état du dossier.
- **Téléversement de pièces justificatives** et **validation en temps réel** des
  données lorsque c'est possible.
- **Onboarding en réseau** (*networked onboarding*) : un marchand détenant
  plusieurs comptes peut réutiliser des informations déjà fournies plutôt que de
  les ressaisir.
- **Mise à jour par le marchand lui-même** : un compte existant peut modifier son
  type d'activité ou des informations déjà soumises.

**Attribution du MCC** — c'est le point le plus directement comparable à notre
moteur :

- « Chaque compte Stripe a exactement un MCC. »
- **Stripe détermine le MCC automatiquement.** En règle générale, c'est le
  secteur d'activité déclaré au tableau de bord qui détermine le MCC ; pour les
  comptes passant par l'onboarding hébergé, le MCC est fixé pendant le parcours.
- **Repli en cascade** : si le secteur déclaré ne suffit pas, Stripe « peut
  utiliser les informations du site web du compte connecté » ; si cela échoue
  encore, Stripe retombe sur le MCC de la plateforme, puis sur un MCC par défaut
  (`5734`, Computer Software Stores).
- **Contrôle a posteriori** : Stripe passe certains comptes en revue et « si
  notre revue détermine qu'un MCC est inexact, quelle que soit la partie qui l'a
  fixé à l'origine, nous pouvons le modifier ». Une notification est envoyée par
  webhook (`account.updated`). **La plateforme ne peut pas revenir sur ce
  nouveau MCC : toute tentative renvoie une erreur.**
- Un MCC fixé manuellement doit être **vérifié par Stripe comme cohérent avec le
  secteur du compte**, au même titre qu'une information d'identité.
- Les **MCC restreints** exigent un accord préalable de Stripe.

**Ce qui n'est pas dit** : Stripe ne publie, sur ces pages, ni la méthode de
détermination du MCC, ni un score, ni les termes qui ont déclenché le choix.
L'attribution est une décision opaque du côté de l'acquéreur.

**Sources** : <https://docs.stripe.com/connect/onboarding> et
<https://docs.stripe.com/connect/setting-mcc>, consultées le 2026-09-22.

---

#### Adyen (Adyen for Platforms — onboarding et KYC)

**Type d'acteur** : acquéreur et PSP mondial.

**Ce qu'il fait de comparable** : instruction et vérification réglementaire des
« titulaires de compte » (*account holders*) et « entités juridiques » (*legal
entities*) qu'une plateforme déclare.

**Fonctions notables**

- **Deux modes d'enrôlement** : « onboarding sur invitation », où Adyen crée le
  titulaire de compte et où l'utilisateur est redirigé vers un lien hébergé pour
  saisir ses informations ; ou un enrôlement initié par API.
- **Vérification obligatoire avant tout traitement** : Adyen doit vérifier les
  utilisateurs de la plateforme avant de traiter des paiements, de verser des
  fonds ou d'offrir des produits financiers.
- **Notion de *capability*** : le résultat des contrôles ne se traduit pas par un
  simple « validé / rejeté » mais par l'ouverture ou non de capacités précises
  (encaisser, être payé…). « À partir du résultat des contrôles de vérification,
  Adyen décide si un utilisateur peut effectuer telle ou telle action. »
- **Délais de vérification** (30 ou 60 jours selon la capacité) pendant lesquels
  l'utilisateur continue d'opérer pendant que les anomalies sont résolues.
  C'est un état intermédiaire « actif sous réserve », que notre workflow n'a pas.
- **Notification par webhook** (`balancePlatform.accountHolder.updated`) à chaque
  changement de capacité, et consultation par API (`GET /accountHolders/{id}`)
  ou dans l'espace client.
- **Tableau de bord KYC** : résumé et chronologie (*KYC summary and timeline*)
  montrant chaque contrôle, son statut, et les événements ayant pesé sur la
  vérification.

**Réserve de lecture** : la page « Verification process » d'Adyen n'énumère pas,
dans le contenu récupéré, le détail des types de contrôles (identité, registre du
commerce, compte bancaire). Ce détail n'est donc pas affirmé ici.

**Sources** : <https://docs.adyen.com/platforms/verification-overview> et
<https://docs.adyen.com/platforms/quickstart-guide/onboarding-and-kyc> (résultats
de recherche), consultées le 2026-09-22.

---

#### Checkout.com (onboarding de sous-entités)

**Type d'acteur** : acquéreur et PSP.

**Ce qu'il fait de comparable** : déclaration et vérification de « sous-entités »
(*sub-entities*) marchandes par une plateforme.

**Fonctions notables**

- **Trois voies de soumission** : API Platforms, tableau de bord, ou
  « Hosted Onboarding » (parcours hébergé destiné au marchand lui-même).
- **Contrôles de vérification asynchrones**, dont la durée varie selon le pays ;
  un onboarding instantané sur informations minimales est évoqué pour les
  plateformes américaines.
- **Pièces justificatives** : l'ajout des documents requis déclenche les
  contrôles de vérification.
- **Suivi de statut** par tableau de bord ou par API, et **webhook
  `status_changed`** notifiant l'issue des contrôles et tout changement de
  statut.
- **Distinction Lite / Full** : les comptes Lite n'encaissent que vers la
  plateforme, les comptes Full permettent aussi les versements vers le compte
  bancaire de la sous-entité.
- Enchaînement documenté : configurer les webhooks → collecter les informations →
  soumettre la demande → ajouter les pièces et instruments de paiement →
  attendre le résultat, qui soit ouvre les capacités, soit demande des pièces
  complémentaires. **Cette dernière branche est l'équivalent de notre statut
  « complément requis ».**

**Ce qui n'est pas dit** : la page consultée ne précise pas si un MCC est
collecté à ce stade ; l'affirmation n'est donc pas formulée.

**Source** : <https://www.checkout.com/docs/platforms/onboard-sub-entities>,
consultée le 2026-09-22.

---

#### PayPal / Braintree — enrôlement des sous-marchands et exigences de site

**Type d'acteur** : PSP mondial.

**Ce qu'il fait de comparable** : un « marchand maître » enrôle ses sous-marchands
par API — le panneau d'administration ne le permet pas.

**Fonctions notables**

- **Informations collectées** : pour une société immatriculée, une section
  « business » avec raison sociale, identifiant fiscal et adresse, plus, dans
  tous les cas, l'identité d'une **personne physique rattachée** — « un
  sous-marchand doit toujours être rattaché à un individu ».
- **Vérification par des tiers** : la création du compte est confirmée
  « approuvée » ou « refusée » **par webhook**, après vérification des
  informations « auprès de plusieurs services tiers ».
- **Analyse du modèle d'affaires** : à l'enrôlement, Braintree demande « une
  explication complète du modèle d'affaires, des pratiques de facturation et des
  volumes attendus ».
- **Revues périodiques d'*underwriting*** destinées à maintenir l'information à
  jour. Le dossier n'est donc pas figé à la validation.

**Exigences vérifiées sur le site marchand** — c'est la fonction la plus nette
qui nous manque. Braintree « effectue des revues périodiques des sites de ses
marchands » et exige que le site affiche :

- des **coordonnées de contact** : adresse e-mail, numéro de téléphone, adresse
  postale physique, ou au moins deux comptes de réseaux sociaux ;
- les **prix**, affichés avant la finalisation du paiement ;
- une **politique de remboursement et d'annulation** : disponibilité du
  remboursement, conditions d'éligibilité, frais associés ;
- une **politique de confidentialité** : données collectées et usage ;
- un **délai de livraison**, si des biens physiques sont expédiés ;
- pour l'acceptation de PayPal, des liens vers la politique de confidentialité et
  vers des **conditions générales** traitant des droits de l'utilisateur, des
  modalités de paiement, de la résiliation de compte, des exclusions de
  responsabilité et de la notification des changements.

Des cas particuliers sont prévus : tarification sur devis (les mentions doivent
figurer au contrat ou sur la facture), accès réservé aux membres, dons pour les
organismes sans but lucratif, applications mobiles.

**Lien direct avec notre contexte** : cette liste recoupe presque mot pour mot
les obligations d'information de l'**article 25 de la loi tunisienne n° 2000-83**
reprises à l'article 2 des conditions générales du contrat STB. La différence est
que Braintree les **vérifie automatiquement et périodiquement**, là où le contrat
tunisien se contente de les stipuler.

**Sources** :
<https://developer.paypal.com/braintree/articles/risk-and-security/compliance/ecommerce-website-requirements>,
consultée le 2026-09-22 ; éléments d'enrôlement issus des extraits indexés de
<https://developer.paypal.com/braintree/docs/guides/braintree-marketplace/onboarding/php>
et <https://developer.paypal.com/braintree/articles/risk-and-security/underwriting/periodic-reviews>,
non ouvertes directement.

---


### 2.2 Outils de classification MCC

#### Parcha — *MCC Classification agent*

**Type d'acteur** : éditeur d'agents d'automatisation de la conformité.

**Ce qu'il fait de comparable** : déterminer le MCC Visa ou Mastercard d'un
marchand à partir de la description de son activité et de sa présence en ligne.
C'est très exactement la fonction de notre moteur.

**Fonctions notables**

- **Entrées** : informations déclarées par l'entreprise, son site web et sa
  présence en ligne, le détail de ses activités, produits et services.
- **Sortie** : un code MCC rapproché des listes normalisées.
- **Explicabilité revendiquée** : « chaque résultat s'accompagne d'une
  explication claire, étape par étape, à laquelle votre équipe peut se fier —
  pas de conjecture, pas de logique cachée ». C'est la même exigence que celle
  que nous avons retenue, formulée dans les mêmes termes.
- **Intégration par API** dans les processus existants.
- La page produit consultée **ne publie aucun chiffre de précision**. Un autre
  contenu de l'éditeur, relayé par les résultats de recherche, annonce « 95 à
  99,7 % de précision sur l'ensemble des types de vérification » ; cette valeur
  est une allégation commerciale de l'éditeur, non vérifiée, et ne porte pas
  spécifiquement sur le MCC.

**Sources** : <https://www.parcha.ai/products/merchant-category-code> (page
produit, consultée le 2026-09-22) et <https://www.parcha.ai/agents/mcc-classification>
(référencée, non ouverte).

---

#### KYC SiteScan (KYC Systems LLC)

**Type d'acteur** : éditeur d'outils de contrôle des marchands pour acquéreurs et
PSP.

**Ce qu'il fait de comparable** : classification automatisée de l'activité d'un
marchand et suggestion de MCC.

**Fonctions notables** (annonce du 27 février 2025)

- **Sortie à trois niveaux** : un MCC principal, un secondaire et un tertiaire,
  **chacun assorti d'un score de confiance**, avec une description de la
  classification d'activité et un raisonnement détaillé.
- **Provenance des données** annoncée comme transparente (« transparent data
  provenance »).
- **Deux canaux de restitution** : intégration dans le rapport KYC SiteScan, et
  points d'API dédiés, avec des résultats annoncés « en aussi peu que cinq
  secondes ».
- **Fonctionne avec ou sans site web** du marchand.
- **Trois usages cités** : filtrage des demandes d'affiliation, *underwriting*
  du marchand, et **correction en masse des MCC d'un portefeuille existant**.
  Ce troisième usage — reclasser rétroactivement un portefeuille — n'a pas
  d'équivalent chez nous.

**Source** : communiqué PR Newswire,
<https://www.prnewswire.com/news-releases/kyc-sitescan-introduces-automated-merchant-category-codes-and-business-classification-302386709.html>,
consulté le 2026-09-22. Il s'agit d'un communiqué de presse de l'éditeur : les
performances annoncées ne sont pas vérifiées.

---

#### Brex — classification de marchands par apprentissage automatique

**Type d'acteur** : fintech (cartes d'entreprise), côté émetteur et non acquéreur.

**Intérêt pour nous** : article d'ingénierie décrivant une approche de
classification de marchands combinant Google Places et un modèle appris sur plus
de 500 000 noms d'entreprises et leurs catégories, avec un plongement lexical
entraîné sur environ 2,5 millions de noms d'entreprises. Le problème traité est
celui de l'**enrichissement de transactions** (retrouver la catégorie d'un
marchand déjà actif), et non celui de l'attribution d'un MCC à l'affiliation ;
la méthode statistique y est en revanche assumée, sans explicabilité au sens où
nous l'entendons.

**Source** : article de blog Brex relayé par les résultats de recherche,
<https://medium.com/brexeng/how-we-built-a-mostly-automated-system-to-solve-credit-card-merchant-classification-f9108029e59b>,
référencé le 2026-09-22 (non ouvert en intégralité).

---


### 2.3 Plateformes de KYB et d'orchestration d'enrôlement

#### Sumsub — *Business Verification (KYB)*

**Type d'acteur** : éditeur de vérification d'identité et de conformité.

**Ce qu'il fait de comparable** : la partie « vérifier que la société existe, que
ses dirigeants sont ceux qu'elle déclare, et qu'elle n'est pas sous sanctions » —
c'est-à-dire précisément ce que notre plateforme ne fait pas, puisqu'elle se
contente d'enregistrer le RNE et le matricule fiscal saisis par l'agent.

**Fonctions notables**

- **Contrôle du registre du commerce** sur des registres d'entreprises mondiaux.
- **Contrôle de la détention et du contrôle** (actionnariat), et **vérification
  des bénéficiaires effectifs (UBO)**, le cas échéant avec biométrie faciale et
  détection du vivant, ou par entretien vidéo avec un agent.
- **Filtrage AML** (sanctions, personnes politiquement exposées).
- **Revue des documents sociaux** effectuée par des analystes internes de
  l'éditeur.
- **Questionnaires personnalisables** pour demander les informations
  complémentaires propres à un métier.
- **Flux de travail configurables** rassemblant ces briques.
- Les volumes et délais annoncés (plus de 500 millions d'enregistrements
  commerciaux, contrôle en 15 secondes, plus de 345 millions d'enregistrements
  d'actionnariat, plus de 90 % de taux de succès UBO en 30 secondes environ) sont
  des chiffres publiés par l'éditeur, non vérifiés.

**Réserve de lecture** : la page <https://sumsub.com/business-verification-kyb/>
renvoie une erreur 404. Les éléments ci-dessus proviennent des extraits indexés
des pages <https://sumsub.com/business-verification-services/>,
<https://docs.sumsub.com/docs/how-business-verification-works> et
<https://sumsub.com/newsroom/sumsub-revamps-business-verification-making-it-the-only-six-in-one-kyb-solution-on-the-market/>,
tels que restitués par la recherche le 2026-09-22.

---

#### Signicat — orchestration d'identité, KYB et signature électronique

**Type d'acteur** : fournisseur européen d'identité numérique et de services de
confiance.

**Ce qu'il fait de comparable** : la couche qui manque entre notre formulaire et
un dossier opposable — vérification d'identité, contrôle KYB et **signature
électronique du contrat**.

**Fonctions notables** (d'après les extraits indexés le 2026-09-22 ; la page
produit n'a pas été ouverte directement)

- Plateforme unifiant vérification d'identité, authentification, **signature
  électronique** et orchestration, avec plus de 35 méthodes d'identité
  électronique et plus de 240 sources de données d'identité et de risque.
- **Signature électronique qualifiée (QES)** au sens d'eIDAS, « juridiquement
  contraignante ».
- **Trust Orchestration** : construction de parcours d'enrôlement, de signature
  et de gestion du risque ; l'offre « Mint » propose un **constructeur de
  parcours par glisser-déposer** pour concevoir des flux d'enrôlement B2B, avec
  plus de 100 sources de données mondiales derrière une API unique.
- Conformité annoncée aux cadres eIDAS, AML et RGPD.

**Enseignement pour nous** : le marché considère le **parcours d'enrôlement
lui-même comme un objet configurable**, pas comme un formulaire codé en dur. Nos
cinq étapes sont figées dans le code ; changer l'ordre, ajouter une rubrique ou
conditionner une question à une réponse antérieure suppose une livraison.

**Sources** : <https://www.signicat.com/products/trust-orchestration> et
<https://www.signicat.com/products/identity-proofing>, référencées le
2026-09-22 (extraits de recherche ; pages non ouvertes).

---

#### Corefy — plateforme d'enrôlement marchand en marque blanche

**Type d'acteur** : éditeur d'une plateforme d'orchestration de paiements.

**Intérêt** : la page consultée décrit le **processus d'enrôlement marchand
standard du marché**, en six étapes, ce qui donne une grille de lecture utile.

1. **Filtrage initial** : vérifier l'existence de l'entreprise, la légitimité du
   site web et le droit d'exercer sur les marchés visés.
2. **Vérification d'identité et des documents** : immatriculation, identité des
   dirigeants, documents de conformité, états financiers, par contrôles KYC et
   KYB.
3. **Évaluation du risque** : solidité financière, profil sectoriel, puis
   **attribution d'un niveau de risque et de plafonds de volume**.
4. **Activation et tests** : création des comptes marchands, exécution des
   conventions de service et **transactions de test de bout en bout**.
5. **Formation et mise en service** : prise en main du tableau de bord,
   remboursements, reporting, traitement des litiges.
6. **Surveillance continue** : suivi des schémas de transaction, des impayés, et
   **revérification des documents selon un calendrier**.

Les informations réputées requises sont : identité légale, immatriculation,
secteur, identification des bénéficiaires effectifs, pièces d'identité des
dirigeants, identifiants fiscaux et licences réglementaires, coordonnées du
compte de règlement, états financiers et description du modèle d'affaires.

**Source** : <https://corefy.com/blog/merchant-onboarding-explained>, consultée
le 2026-09-22. Il s'agit d'un contenu éditorial d'éditeur, qui décrit le marché
autant qu'il vend un produit ; il est cité à ce titre.

---


### 2.4 Plateformes bancaires d'acquisition marchande

#### HPS — PowerCARD-Acquirer

**Type d'acteur** : éditeur de logiciels monétiques (Maroc), très implanté en
Afrique et au Moyen-Orient. C'est le type de socle sur lequel une banque
tunisienne s'appuie.

**Ce qu'il fait de comparable** : PowerCARD-Acquirer est présenté comme une
« plateforme complète de gestion des marchands » couvrant le cycle de vie du
marchand. Les capacités citées dans la présentation de l'offre incluent
**origination du marchand, enrôlement (*boarding*), activation et rétention**,
facturation, compensation, règlement et reporting, gestion de la fraude et du
risque, impayés, litiges et recouvrement, politiques tarifaires multiples, et
support à la gestion des marchands.

**Réserve de lecture importante** : la page produit consultée directement
(<https://www.hps-worldwide.com/product/powercard-acquirer>) mentionne un
« Merchant Management Module » et un « Merchant Account Module », mais **ne
détaille ni les MCC, ni un circuit de validation, ni la gestion documentaire**.
La liste de capacités ci-dessus provient des extraits indexés de la page
<https://www.hps-worldwide.com/your-business/merchant-acquiring>, dont la
récupération directe n'a pas restitué cette énumération. Elle est donc rapportée
comme une allégation commerciale, non comme une fonction vérifiée.

**Sources** : <https://www.hps-worldwide.com/product/powercard-acquirer> et
<https://www.hps-worldwide.com/your-business/merchant-acquiring>, consultées le
2026-09-22.

---

#### Worldline

**Type d'acteur** : acquéreur et prestataire technique européen, fournisseur de
plateformes pour institutions financières.

**Ce qui a été établi**

- L'API Acquiring de Worldline expose, parmi ses **données de référence**, les
  identifiants d'acquéreur, les devises de traitement et de règlement, **les
  codes MCC** et les codes de subdivision territoriale. Le MCC y est donc traité
  comme un référentiel technique servi par l'acquéreur, ce qui conforte notre
  choix d'en faire un référentiel administrable et versionné.
- Cette même documentation **ne décrit pas** de processus d'enrôlement marchand,
  de configuration marchande ni de détail sur les MCC ; ces sujets sont renvoyés
  à l'interlocuteur commercial.
- Les extraits indexés des pages commerciales mentionnent une **gestion de
  contrat avec auto-enrôlement technique du marchand, par interface ou par API**,
  ainsi qu'un back-office de recherche de transactions pour le marchand comme
  pour le PSP. Ces éléments ne proviennent pas d'une page ouverte directement et
  sont rapportés comme tels.

**Réserve de lecture** : la page « Digital onboarding and contract solution » de
Worldline Financial Services redirige (301) vers la page d'accueil du groupe :
le contenu n'existe plus à cette adresse et n'a pas été lu.

**Sources** : <https://docs.acquiring.worldline-solutions.com/features/>,
consultée le 2026-09-22 ; page « digital-onboarding-and-contract-solution »,
redirigée, non lue.

---

#### Network International

**Type d'acteur** : premier acquéreur des Émirats arabes unis, acteur majeur de
la zone Moyen-Orient et Afrique — donc le comparable régional le plus proche.

**Ce qui a été établi** : les sources disponibles sont des communiqués de presse.
Ils font état d'un « modèle entièrement numérique » d'acceptation marchande avec
American Express Middle East, d'une « expérience d'enrôlement simplifiée », d'un
relevé consolidé unique et d'un processus de règlement unifié, ainsi que du
lancement d'une plateforme d'acquisition régionale couvrant les marchés du CCG
par une intégration unique.

**Réserve** : aucun élément fonctionnel détaillé sur l'enrôlement, l'attribution
du MCC ou le circuit de validation n'a pu être obtenu. Aucune documentation
produit publique n'a été trouvée.

**Sources** : <https://www.network.ae/en/merchant-solutions> et communiqués de
presse du même domaine, référencés le 2026-09-22.

---


### 2.5 Pratiques standard de la gestion de dossiers bancaires

#### Le principe du « maker-checker » (contrôle à quatre yeux)

**Ce qu'il est** : un principe d'autorisation selon lequel « pour chaque
opération, au moins deux personnes sont nécessaires à son achèvement, l'une
créant l'opération, l'autre intervenant dans sa confirmation ou son
autorisation ». Il repose sur la **séparation des tâches** entre catégories
d'agents, destinée à prévenir les conflits d'intérêts et les actes non
autorisés. La source note que « pratiquement toutes les banques de l'époque
moderne utilisent un système *maker-checker* pour garantir la sûreté et la
journalisation ».

**Ce que le marché en tire, d'après les sources secondaires consultées** : dans
les systèmes d'octroi de crédit, le circuit *maker-checker* est appliqué non
seulement à la demande elle-même mais aussi aux **paramètres** (taux, pénalités,
frais de dossier) ; la **piste d'audit** doit consigner chaque modification avec
son auteur, sa date et son heure, et le système constitue « une piste d'audit
inviolable de chaque étape d'approbation », chaque action — de l'initiation par
le *maker* à la revue par le *checker* et à la décision finale — étant
horodatée et nominative.

**Lien avec notre plateforme** : notre couple AGENT / BANQUIER **est** un circuit
*maker-checker*, et notre journal nominatif et horodaté correspond à l'attente du
métier. La réserve déjà identifiée en recette — **le profil ADMIN cumule les
droits d'agent et de banquier sur toutes les banques et peut donc saisir,
soumettre et arbitrer seul** — est, au regard de ce principe, une rupture de la
séparation des tâches, et non un simple confort d'exploitation.

**Sources** : <https://en.wikipedia.org/wiki/Maker-checker>, consultée le
2026-09-22 ; éléments complémentaires issus des extraits indexés de
<https://m2pfintech.com/blog/loan-origination-software-rfp-checklist-what-to-demand-if-stp-is-the-goal/>
et <https://jaguarsoftwareindia.com/blog/maker-checker-workflow-in-loan-management-systems/>,
non ouvertes directement.

---


### 2.6 Cadre normatif : attribution du MCC

#### Règles Visa d'attribution du MCC (relayées par LegitScript)

**Nature de la source** : LegitScript est un prestataire de certification et de
surveillance des marchands ; la page consultée synthétise les règles Visa. Ce
n'est pas une source Visa de première main.

**Ce qu'elle établit**

- **Six règles générales d'attribution**, la première étant : « choisir le MCC
  qui décrit le plus exactement l'activité du marchand ». En cas de pluralité
  d'activités, retenir le MCC de la ligne au chiffre d'affaires le plus élevé, ou
  affecter des MCC différents à des lignes différentes.
- **Ne recourir aux catégories « divers » que lorsqu'aucun autre MCC ne
  convient.**
- **Points de vente multiples** : affecter un MCC propre à chaque établissement
  selon l'enseigne, la zone ou le point d'encaissement.
- **Voyage et hébergement** : utiliser les MCC spécifiques lorsque le réseau en
  désigne.
- **Vente à distance** : ces MCC décrivent le mode d'exploitation, non le produit
  vendu.
- **Conséquences du mauvais codage** : pénalités par transaction infligées par
  les réseaux, restrictions voire retrait du droit de traiter. **Ces sanctions
  pèsent sur l'acquéreur.**
- **Une vingtaine de MCC** exigent un enregistrement spécifique (cités en
  exemple : 5816 jeux numériques, 7995 jeux d'argent, 6051 crypto-actifs).

**Source** :
<https://www.legitscript.com/regulatory-and-card-brand-compliance/merchant-category-codes/>,
consultée le 2026-09-22.

---

#### Visa Integrity Risk Program (VIRP)

**Ce qu'il établit** (d'après les extraits indexés le 2026-09-22, sources
secondaires)

- Entré en vigueur au 1er mai 2023, le VIRP remplace le *Global Brand Protection
  Program* et fixe les exigences applicables aux acquéreurs et à leurs agents
  pour les marchands à « haut risque d'intégrité ».
- **L'acquéreur doit être enregistré** comme *High Integrity Risk Acquirer*
  **avant** de démarcher, de contracter avec ou de traiter pour un tel marchand.
- Les marchands relevant de ces MCC doivent être enregistrés dans un délai
  annoncé de 60 jours après notification, avec des frais de dossier et de
  renouvellement annuels.
- **La charge d'enregistrement, d'attestation et les pénalités de non-conformité
  reposent formellement sur l'acquéreur**, non sur le marchand.
- MCC cités : 5967 (vente à distance entrante — contenus et services pour
  adultes) et 7995 (paris, loteries, jetons de casino, paris hors hippodrome).

**Réserve** : ces éléments proviennent de pages d'éditeurs et de prestataires
(LegitScript, PaymentCloud, Corepay, FinQub, CommerceGate) relayées par la
recherche, non d'une publication Visa ouverte directement. Les montants de frais
cités par ces sources ne sont pas repris ici faute de source primaire.

**Enjeu pour nous** : notre plateforme connaît déjà un niveau de vigilance par
code et interdit les codes sensibles. Le marché, lui, ne se contente pas
d'interdire : il **enregistre** le marchand auprès du réseau et suit cet
enregistrement dans le temps. C'est une étape de cycle de vie que nous n'avons
pas.

---


### 2.7 Le dispositif Click to Pay

**Ce qu'il est** : Click to Pay est le nom commercial des solutions de paiement
en ligne conformes aux spécifications **EMV Secure Remote Commerce (EMV SRC)**
publiées par EMVCo. Ces spécifications forment un socle commun destiné à
simplifier le passage en caisse en ligne.

**Ce que les sources consultées établissent**

- Les solutions Click to Pay sont produites par différents acteurs : réseaux de
  paiement mondiaux et domestiques, banques, fintechs et marchands.
- **Les consommateurs s'enrôlent auprès de leur émetteur de carte.**
- **EMVCo concède l'icône Click to Pay aux marchands participants** et aux autres
  parties prenantes. C'est le seul mécanisme d'affiliation marchande documenté
  sur les pages consultées.
- EMVCo publie des *CX Guidelines* (lignes directrices d'expérience client)
  décrivant les exigences et bonnes pratiques aux moments clés du parcours.

**Ce que nous n'avons pas pu établir** : les pages EMVCo consultées ne
détaillent pas les pièces qu'un marchand doit fournir pour être affilié. Le
document *Mastercard Click to Pay Program Requirements* (PDF) apparaît dans les
résultats de recherche ; son contenu n'est pas repris ici, faute de lecture
effective (voir § 5.2).

**Sources** : <https://www.emvco.com/emv-technologies/secure-remote-commerce/> et
pages associées d'EMVCo, relayées par la recherche le 2026-09-22.

---


### 2.8 Le marché tunisien : le processus d'affiliation existant

#### Société Tunisienne de Banque (STB) — Clic to Pay

**Type d'acteur** : banque tunisienne, distributeur de la solution Clic to Pay de
la Société Monétique Tunisie (SMT).

**Ce que la page commerciale établit**

- Le service s'adresse aux « commerçants qui se proposent de vendre leurs
  produits ou services en ligne », sous condition d'être « clients STB,
  commerçants établis en Tunisie, disposant d'un site WEB et affiliés aux
  systèmes de paiement par carte ».
- Deux documents sont requis : un **contrat d'adhésion au système de paiement
  sécurisé** et un **formulaire d'adhésion**.
- La démarche est **agence-centrée** : « vous devez prendre contact avec votre
  agence pour remplir le contrat d'affiliation et entamer les tests avec la
  SMT ». L'affiliation se termine donc par une **phase de tests techniques avec
  la SMT** avant mise en production.
- Fonctions annoncées : acceptation des cartes tunisiennes et étrangères (Visa,
  Mastercard), redirection vers le serveur de paiement, génération de tickets de
  paiement, garantie de paiement pour le commerçant.

**Source** : <https://www.stb.com.tn/fr/entreprises/la-banque-au-quotidien/clic-to-pay/>,
consultée le 2026-09-22.

---

#### Le formulaire papier STB « Contrat Affilié Commerçant E-COMMERCE » — source primaire

Le contrat type publié par la STB a été téléchargé et son texte extrait. C'est
la seule source primaire tunisienne obtenue au cours de cette veille, et elle
décrit exactement le dossier que notre plateforme dématérialise. Le document
comprend **trois pièces** : le contrat d'affiliation proprement dit, les
conditions générales d'adhésion, et un **formulaire d'adhésion à ClicToPay**
accompagné d'une **fiche technique**.

**En-tête du contrat** — trois identifiants attribués par la banque :
`N° d'affiliation`, **`MCC`**, `N° Terminal`. Le **MCC figure donc bien en tête
du contrat papier, dans une case remplie par la banque et non par le
commerçant** : c'est précisément la décision que notre moteur outille.

**Bloc « Affilié Personne Physique »** : nom et prénom, adresse, réseaux acceptés
(cases Visa / Mastercard / Carte Bancaire), téléphone de contact, fax, GSM,
personne à contacter, e-mail, numéro et date de délivrance de la C.I.N., puis
`Activité Type _ Code ____` (un type et un code à quatre positions).

**Bloc « Affilié Personne Morale »** : dénomination, forme juridique, siège
social, nom, prénom et qualité du représentant légal, **numéro de registre de
commerce**, téléphone, fax, GSM, personne à contacter, e-mail, puis là encore
`Activité Type _ Code ____`.

**Bloc « Information Site WEB »** : URL de notification, URL de retour « OK »,
URL de retour « problème », et deux cases **3D Secure obligatoire** — l'une pour
la carte nationale, l'autre pour la carte internationale.

**Bloc bancaire** : compte à créditer (RIB).

**Engagement** : « Je soussigné [...] certifie l'exactitude des informations
sus-mentionnées et déclare avoir lu et accepté sans réserve les conditions
particulières », suivi de la mention « Fait à …, le … » et de la **signature et
du cachet de l'affilié**. Les conditions particulières renvoient au **taux de
commission** prélevé par la banque.

**Le « Formulaire d'adhésion à ClicToPay »** ajoute : raison sociale, adresse,
ville, pays, code postal, téléphone, fax, **site web**, **domaines d'activité**,
une personne à contacter (nom, titre, e-mail, téléphone, fax), le nom de
**deux administrateurs principaux** de la société, et un bloc « Coordonnées
monétiques (à remplir avec la banque) » : nom de la banque, adresse de l'agence
du commerçant, **contact commercial** et **contact monétique** avec leurs
coordonnées. Il rappelle que « le commerçant a l'obligation de donner accès à ses
conditions générales de vente avant le paiement ».

**La « Fiche Technique »** ajoute : numéro d'affilié, raison sociale, banque,
**nom et e-mail du webmaster**, **système d'exploitation du serveur web**, URL du
serveur web, e-mail de notification des autorisations accordées, URL de
notification, URL de retour en cas de paiement accepté, URL de retour en cas de
refus ou de problème, et les deux cases 3D Secure.

**Ce que les conditions générales apportent au-delà du formulaire**

- **Article 2 — obligations de l'accepteur** : information du consommateur au
  sens de **l'article 25 de la loi n° 2000-83 du 9 août 2000** (identité,
  adresse, téléphone, description des étapes de la transaction et du paiement,
  nature et prix du produit, coût de livraison, taxes, durée de l'offre,
  garanties et service après-vente, modalités de paiement, **modalités et délais
  de livraison**, droit de rétractation) ; interdiction de facturer un surcoût au
  porteur ; interdiction pour l'accepteur de connaître les données de paiement ;
  récapitulatif et confirmation de commande (articles 27 et 28 de la même loi) ;
  conservation des contrats électroniques ; **droit de rétractation d'au moins
  dix jours ouvrables** ; interdiction de vendre des biens ou services illicites
  ou contraires à l'ordre public et aux bonnes mœurs.
- **Article 8** : diffusion des informations limitée aux nécessités de gestion et
  aux obligations légales, dans le respect de la **loi organique n° 2004-63 du
  27 juillet 2004 sur la protection des données à caractère personnel** (droit
  à l'information, au consentement, d'accès, de rectification et d'opposition).
- **Article 9 — conditions financières** : une cotisation d'adhésion, une
  **commission d'utilisation** du système et une **commission d'affiliation**.
- **Article 13 — suspension et radiation** : la banque peut suspendre l'adhésion
  sans préavis, notamment en cas de « taux anormalement élevé de contestation des
  porteurs, de litiges sur des marchandises non conformes ou non reçues, ou de
  prestations non rendues », ou de risque de dysfonctionnement du système. La
  suspension dure au minimum six mois, renouvelable ; un comportement frauduleux
  entraîne la radiation.
- **Article 12 — résiliation** : de plein droit en cas de cessation d'activité ou
  de cession du fonds de commerce.
- **Article 7** : délai de réclamation de six mois à compter de l'opération
  contestée.

**Ce que cette source nous apprend pour la comparaison**

1. Le **MCC est bien un champ du contrat**, attribué par la banque. Notre produit
   est donc positionné sur une décision réelle du processus tunisien, et non sur
   un besoin supposé.
2. Le dossier réel contient **des rubriques techniques que notre saisie ne couvre
   pas** : URL de notification, URL de retour OK et problème, cases 3D Secure
   national et international, système d'exploitation du serveur web, webmaster.
3. Il contient aussi des rubriques **commerciales et relationnelles** absentes de
   notre modèle : deux administrateurs principaux, contact commercial et contact
   monétique de l'agence, taux de commission, numéro d'affiliation et numéro de
   terminal attribués.
4. L'affiliation ne s'arrête pas à la validation : il y a une **phase de tests
   avec la SMT**, puis une **vie du contrat** (suspension sur taux de
   contestation, radiation, résiliation) que notre workflow ignore.
5. Le contrat se conclut par une **signature manuscrite et un cachet**. La
   signature électronique est prévue par l'article 10 du contrat lui-même (loi
   n° 2000-83, articles 453 et 453 bis du Code des obligations et des contrats),
   mais le formulaire ne l'utilise pas.

**Source** : <https://www.stb.com.tn/wp-content/uploads/2020/09/contrat-e-commerce.pdf>,
téléchargé et dépouillé le 2026-09-22 (6 pages, extraction textuelle ; la
reconnaissance de caractères du document scanné comporte quelques altérations
typographiques, sans ambiguïté sur les rubriques citées).

---

#### Banque de Tunisie (BT) — offre e-commerce

**Ce que la page établit**

- L'affiliation passe par le **dépôt d'une demande écrite auprès de l'agence**,
  « en précisant la nature du commerce à exercer ».
- La demande doit indiquer : la nature du commerce envisagé, **la clientèle
  ciblée (locale ou étrangère)**, **la moyenne des transactions prévues** et
  **le chiffre d'affaires estimé pour la première année**.
- Fonctions annoncées : liaison SSL et conformité PCI-DSS, contrôle 3D Secure,
  ticket de paiement par e-mail, **tableau de bord des transactions en temps
  réel**, remboursement total ou partiel, suivi par l'interface BTNET Business,
  cartes Visa et Mastercard tunisiennes et étrangères, multidevises et
  multilingue, encaissement des remises à J+1.

**Enseignement pour nous** : les trois données de qualification demandées par la
BT — clientèle locale ou étrangère, transaction moyenne, volume d'affaires — ont
leur équivalent dans notre formulaire (`sellsAbroad`, `averageBasket`,
`monthlyVolume`, vérifiés dans
`server/src/services/requestSchema.js`). **Nous les collectons donc déjà, mais
nous n'en faisons rien** : aucune règle ne les exploite, ni pour qualifier le
risque, ni pour orienter l'arbitrage du banquier. C'est un gisement disponible et
inutilisé.

**Source** : <https://www.bt.com.tn/le-e-commerce-entreprises>, consultée le
2026-09-22.

---


### 2.9 Cadre réglementaire tunisien

Les éléments ci-dessous complètent le § 2.6. Ils sont partiels : la veille n'a pas
pu établir de texte de la Banque Centrale de Tunisie portant spécifiquement sur
l'affiliation des commerçants au paiement en ligne.

**Loi n° 2000-83 du 9 août 2000, relative aux échanges et au commerce
électroniques.** C'est le texte auquel renvoie directement le contrat STB. Il fixe
les règles générales des échanges et du commerce électroniques, applique aux
contrats électroniques le régime des contrats écrits (expression de la volonté,
effet juridique, validité, exécution), et impose au vendeur en ligne d'afficher
son identité, ses coordonnées, la description des produits, les prix, les
conditions de livraison et les modalités de paiement. **La charge de la preuve
pèse sur le vendeur** : il doit établir l'existence de l'information préalable,
la confirmation de l'information, le respect des délais et le consentement du
consommateur. Les articles 25, 27, 28 et 29 sont ceux que reprend l'article 2 des
conditions générales du contrat STB (voir § 2.6).

**Loi organique n° 2004-63 du 27 juillet 2004** sur la protection des données à
caractère personnel — visée à l'article 8 du contrat STB, qui garantit aux
personnes concernées les droits à l'information, au consentement, à l'accès, à la
rectification et à l'opposition.

**Circulaire BCT n° 2018-16.** Lue : elle régit l'activité des **établissements
de paiement** — ouverture de comptes, gouvernance, contrôle interne,
cybersécurité, identification du client, protection du consommateur, comptes de
paiement à trois niveaux, assurance de responsabilité professionnelle, comité
d'audit, lutte contre le blanchiment, cantonnement des fonds de la clientèle. La
page consultée **ne traite pas de l'affiliation des commerçants ni de
l'acceptation en ligne** ; ce texte n'est donc pas la source directe de notre
processus, contrairement à ce que son intitulé pourrait laisser croire.

**Réglementation des changes.** Le Code des changes et du commerce extérieur
(loi n° 1976-18) et les circulaires de la BCT imposent à toute personne résidant
en Tunisie de **rapatrier l'intégralité des devises** provenant de l'exportation
de biens ou de la rémunération de services rendus à l'étranger, dans les
conditions et délais fixés par la BCT. Un projet de nouveau Code des changes était
à l'examen en 2024. **Cette obligation concerne directement le commerçant qui
vend à l'étranger** — cas que notre formulaire identifie (`sellsAbroad`) sans en
tirer aucune conséquence.

**Réserve** : ces éléments proviennent de sources secondaires et de recueils
(legislation.tn, jurisitetunisie.com, 9anoun.tn, guides bancaires, presse). Les
textes primaires de la BCT n'ont pas été ouverts un par un ; les recueils
<https://www.bct.gov.tn/bct/siteprod/documents/Reg_des_Chges_ao13.pdf> et la note
aux banques n° 2024-05 sont référencés mais n'ont pas été lus.

**Sources** : <https://9anoun.tn/fr/kb/jorts/jort-2019-010-0564b/circulaire-de-la-banque-centrale-de-tunisie-ndeg-2018-16-115>
(consultée le 2026-09-22) ;
<http://www.legislation.tn/fr/detailtexte/Loi-num-2000-83-du-09-08-2000-jort-2000-064__2000064000831>
et <https://www.jurisitetunisie.com/tunisie/codes/ce/ce1000.htm> (référencées) ;
recueil de la réglementation des changes de la BCT (référencé, non lu).

---


## 3. Tableau des fonctions observées sur le marché

Une ligne par fonction observée chez au moins un acteur. La colonne « Chez nous »
est établie **en lisant le code** de `server/` et `web/` en lecture seule ; le
fichier qui fonde le constat est cité. « Oui » signifie que la fonction existe et
est atteignable par un utilisateur ; « Non » signifie qu'aucune trace n'en a été
trouvée dans le code.

### 3.1 Constitution et instruction du dossier

| Fonction | Acteurs qui la proposent | Chez nous | Fondement du constat |
| --- | --- | --- | --- |
| Formulaire de demande guidé, multi-étapes | Stripe (hébergé et embarqué), Checkout.com (Hosted Onboarding), Adyen (lien hébergé), Corefy | **Oui** | `web/src/pages/RequestFormPage.jsx`, 5 étapes |
| Parcours **généré à partir des exigences du dossier**, et non figé | Stripe (« lit les exigences d'un compte et génère un parcours guidé »), Signicat (constructeur de parcours) | **Non** | Les 5 étapes sont codées en dur ; aucun moteur de parcours |
| Brouillon, reprise de saisie | pratique générale ; non documentée explicitement chez les acteurs consultés | **Oui** | statut `BROUILLON`, `server/src/services/requests.js` |
| **Téléversement de pièces justificatives** par le demandeur | Stripe, Adyen, Checkout.com, Sumsub, Corefy | **Non** | `multer` n'est utilisé que pour l'import du référentiel MCC (`server/src/routes/admin.js`) ; aucune table de documents dans `server/src/db/schema.sql` |
| **Signature électronique** du contrat | Signicat (QES eIDAS) ; prévue par l'article 10 du contrat STB mais non mise en œuvre | **Non** | aucune dépendance ni route ; le contrat STB se signe à la main, avec cachet |
| Réutilisation d'informations déjà fournies (*networked onboarding*) | Stripe | **Non** | aucune notion de groupe ou de dossier antérieur |
| Détection des doublons (même société, même site) | non observée explicitement chez les acteurs consultés | **Non** | aucune contrainte d'unicité sur `rne` ni sur `site_url` dans `schema.sql` |
| Import en masse de dossiers marchands | Corefy (implicite), non documenté ailleurs | **Non** | l'import en masse existe, mais porte sur le **référentiel MCC**, pas sur les demandes |

### 3.2 Vérification et risque

| Fonction | Acteurs qui la proposent | Chez nous | Fondement du constat |
| --- | --- | --- | --- |
| **Vérification automatique du site marchand** (politiques, mentions, coordonnées, délais de livraison) | PayPal/Braintree (revues périodiques, liste d'exigences publiée), Corefy (« légitimité du site ») | **Non** | l'URL est validée par une expression régulière (`requestSchema.js`), jamais visitée |
| Contrôle du registre du commerce / de l'immatriculation | Sumsub, Signicat, Corefy, Braintree (via tiers) | **Non** | `rne` et `taxId` sont des chaînes stockées, jamais confrontées à un registre |
| Identification et vérification des bénéficiaires effectifs (UBO) | Sumsub, Signicat, Corefy | **Non** | le modèle ne connaît qu'un contact ; le contrat STB demande deux administrateurs principaux |
| Filtrage sanctions et personnes politiquement exposées | Sumsub, Signicat | **Non** | aucune |
| Vérification d'identité du représentant (pièce, biométrie, vidéo) | Sumsub, Signicat, Braintree | **Non** | aucune |
| Vérification du compte bancaire de règlement | Adyen (document bancaire), Checkout.com (instruments de paiement) | **Non** | `rib` est un champ texte optionnel |
| **Scoring ou niveau de risque du marchand**, plafonds de volume | Corefy (« niveau de risque et plafonds de volume »), Braintree (*underwriting*, volumes attendus), Adyen (capacités) | **Non** | un `riskLevel` existe **sur le code MCC**, pas sur le marchand (`mccSuggestion.js`) |
| Exploitation des données de volume déjà collectées | Banque de Tunisie les demande ; Braintree demande les volumes attendus | **Non** | `averageBasket`, `monthlyVolume`, `sellsAbroad` sont saisis et stockés sans aucune règle qui les lise |
| Interdiction des catégories sensibles à la source | Visa (VIRP), LegitScript (MCC à enregistrement) | **Oui** | les codes `INTERDIT` sont exclus des propositions (`mccSuggestion.js`, ligne 70) |
| Enregistrement du marchand à haut risque auprès du réseau | exigé par le VIRP, porté par l'acquéreur | **Non** | notion absente du modèle |

### 3.3 Attribution du MCC

| Fonction | Acteurs qui la proposent | Chez nous | Fondement du constat |
| --- | --- | --- | --- |
| Attribution automatique d'un MCC | Stripe (automatique par défaut), Parcha, KYC SiteScan | **Oui** | `server/src/services/mccSuggestion.js` |
| **Explication de la proposition** (termes déclencheurs, raisonnement) | Parcha (« explication étape par étape »), KYC SiteScan (raisonnement et provenance) | **Oui** | `matchedTerms` renvoyé pour chaque proposition |
| **Score de confiance** affiché | KYC SiteScan (score par suggestion) | **Oui** | `score` borné de 1 à 99 (`toConfidence`) |
| Plusieurs candidats classés (principal, secondaire, tertiaire) | KYC SiteScan | **Oui** | liste classée, `limit` paramétrable |
| MCC distinct par réseau (Visa / Mastercard) | non observé : Stripe impose « exactement un MCC » par compte | **Oui** | `proposedVisaMcc` et `proposedMastercardMcc` indépendants |
| Analyse du **site web** du marchand pour déterminer le MCC | Stripe (repli), Parcha, KYC SiteScan | **Non** | seul le texte saisi est analysé |
| **Code de repli** quand rien ne correspond | Stripe (MCC de la plateforme, puis `5734` par défaut) | **Oui** | filet de sécurité explicite (`mccSuggestion.js`, ligne 149) |
| Révision du MCC après coup, à l'initiative de l'acquéreur | Stripe (revue et modification imposée, non révocable par la plateforme) | **Non** | le MCC est figé à la validation |
| Reclassement en masse d'un portefeuille existant | KYC SiteScan | **Non** | aucune |
| Référentiel MCC administrable, historisé, versionnable | Worldline l'expose en donnée de référence ; aucun acteur consulté n'en documente l'administration | **Oui** | `mcc_code_history`, import avec simulation (`mccImportFile.js`) |

### 3.4 Circuit de décision et traçabilité

| Fonction | Acteurs qui la proposent | Chez nous | Fondement du constat |
| --- | --- | --- | --- |
| **Contrôle à quatre yeux** (*maker-checker*) | standard du secteur bancaire | **Oui**, avec réserve | AGENT saisit, BANQUIER arbitre ; mais le rôle ADMIN cumule les deux sur toutes les banques (`rapport-recette.md` § 1) |
| Demande de complément avec reprise du dossier | Checkout.com (« demande de pièces complémentaires »), Adyen (délais de régularisation) | **Oui** | statut `COMPLEMENT_REQUIS` |
| **État intermédiaire « actif sous réserve »** avec échéance | Adyen (30 ou 60 jours selon la capacité) | **Non** | la décision est binaire, sans délai de régularisation |
| **Piste d'audit nominative et horodatée** | standard bancaire ; Adyen (chronologie KYC) | **Oui** | `request_events`, `admin_events`, `mcc_code_history` |
| **Notification par webhook** du changement de statut | Stripe (`account.updated`), Adyen (`accountHolder.updated`), Checkout.com (`status_changed`), Braintree | **Non** | aucun appel sortant dans `server/src` |
| **Notification par courriel** du demandeur ou de l'agent | pratique générale des acteurs consultés | **Non** | aucune dépendance de messagerie dans `server/package.json` |
| **Relance automatique** d'un dossier en attente | non documentée explicitement chez les acteurs consultés | **Non** | aucun ordonnanceur |
| **Suivi du dossier par le marchand lui-même** | Stripe (parcours hébergé, mise à jour de ses informations), Checkout.com (Hosted Onboarding), Adyen (lien hébergé) | **Non** | trois rôles, tous internes à la banque ; le marchand n'a pas de compte |
| Cloisonnement strict entre établissements | non applicable chez les acteurs mono-entité | **Oui** | vérifié en recette contre l'URL forcée et l'appel direct d'API |
| **API d'intégration** vers un système tiers (core banking, plateforme monétique) | Stripe, Adyen, Checkout.com, Braintree, Worldline : tous sont d'abord des API | **Non** | l'API REST existe mais n'est consommée que par notre propre interface ; aucune intégration sortante |

### 3.5 Après la décision

| Fonction | Acteurs qui la proposent | Chez nous | Fondement du constat |
| --- | --- | --- | --- |
| Édition du contrat et de ses conditions particulières (taux de commission) | contrat STB (rubrique « Conditions particulières ») | **Non** | ni contrat, ni commission dans le modèle |
| Attribution du numéro d'affiliation et du numéro de terminal | contrat STB (en-tête) | **Non** | notre référence `AFF-<année>-<séquence>` est interne, ce n'est pas le numéro d'affiliation monétique |
| Paramétrage technique : URL de notification, URL de retour, 3D Secure | contrat STB (« Information Site WEB »), fiche technique ClicToPay | **Non** | aucune de ces rubriques n'est saisie |
| Phase de tests avec le centre monétique avant mise en production | STB (« entamer les tests avec la SMT »), Corefy (transactions de test) | **Non** | le workflow s'arrête à `VALIDEE` |
| **Revue périodique** du marchand et du site | Braintree (revues périodiques), Corefy (revérification programmée) | **Non** | aucune |
| Surveillance des impayés et **suspension** sur taux de contestation anormal | article 13 du contrat STB ; Corefy (surveillance continue) | **Non** | aucun état de suspension ni de radiation |
| Résiliation, cession du fonds de commerce | article 12 du contrat STB | **Non** | aucun cycle de vie après validation |
| Export du dossier (PDF, impression) | pratique générale | **Non** | `rapport-recette.md` § 2.2 : export PDF non implémenté |

---

## 4. Ce que nous faisons que les autres ne font pas

Quatre points sur lesquels la comparaison nous est franchement favorable, et un
cinquième plus nuancé.

**1. L'explicabilité de l'attribution du MCC, servie au décideur.**
Chez Stripe, l'attribution du MCC est une décision de l'acquéreur, opaque, que la
plateforme subit : elle ne voit ni la méthode, ni un score, et elle ne peut même
pas revenir sur une correction décidée par Stripe. Seuls les outils spécialisés
— Parcha et KYC SiteScan — revendiquent une explication, et ce sont des
prestataires externes vendus aux acquéreurs, pas une fonction native d'une
plateforme d'affiliation. **Nous affichons, pour chaque proposition, les termes
de la demande qui l'ont déclenchée et un score borné, directement dans l'écran où
le banquier décide.** C'est la bonne place : l'explication sert la décision au
moment où elle se prend, et non un rapport lu après coup.

**2. L'explicabilité est un invariant tenu, pas une promesse.**
La campagne de recette a précisément corrigé le cas où six codes remontaient avec
une liste de termes justificatifs vide, parce que le bonus de pertinence
e-commerce s'appliquait sans aucune correspondance (`README.md`, « ce que la
campagne a corrigé »). Le moteur garantit désormais qu'une proposition sans
correspondance a un score nul, et que le seul code sans terme justificatif est le
code de repli, qui se déclare comme tel. Aucun des acteurs consultés ne publie
d'engagement de cette nature. C'est une différence de rigueur, pas de
marketing.

**3. Un MCC par réseau.**
Stripe énonce qu'un compte a « exactement un MCC ». Le contrat STB ne prévoit
lui aussi qu'une seule case MCC. Nous proposons et conservons **un code Visa et
un code Mastercard indépendants**, tout en assumant que la norme ISO 18245 les
rend communs : c'est une souplesse réelle si un acquéreur demande une valeur
divergente, et elle ne coûte rien quand il ne le demande pas. Il faut cependant
la relativiser : les libellés servis sont les libellés Visa pour les deux
réseaux, faute d'avoir pu obtenir le référentiel Mastercard.

**4. Un référentiel MCC administrable, historisé et importable sous simulation.**
Aucun des acteurs consultés ne documente l'administration de son référentiel MCC.
Worldline expose les codes MCC comme une donnée de référence en lecture seule ;
Stripe publie une liste et impose de le contacter pour les codes restreints. Chez
nous, le référentiel **est** un objet du produit : édition unitaire avec motif et
historique champ par champ, activation et désactivation sans suppression parce
que des demandes validées y font référence, et import d'une nouvelle édition avec
**rapport d'écart avant application et désactivation des codes absents
strictement optionnelle**. Pour une banque centrale de référentiel réglementaire,
c'est une fonction de conformité, pas un confort. La réserve est connue : ce
domaine est celui dont la recette est la moins avancée (quatre cas bloquants non
exécutés, `rapport-recette.md` § 2.2.C).

**5. Le cloisonnement multi-banques.**
Les PSP consultés sont mono-entité : la question ne se pose pas pour eux. Notre
plateforme est conçue pour être partagée entre plusieurs banques tunisiennes avec
une étanchéité vérifiée jusqu'à l'appel direct de l'API. C'est un vrai
différenciateur dans notre contexte, mais il est **entamé par le rôle ADMIN**,
qui traverse toutes les banques et cumule les droits d'agent et de banquier. Tant
que ce point n'est pas tranché, la garantie de cloisonnement souffre une
exception.

---

## 5. Sources

### 5.1 Sources lues directement

Toutes consultées le 2026-09-22.

**Acquéreurs et PSP**

1. Stripe — *Choose your onboarding configuration* : <https://docs.stripe.com/connect/onboarding>
2. Stripe — *Set merchant category codes* : <https://docs.stripe.com/connect/setting-mcc>
3. Adyen — *Verification process* : <https://docs.adyen.com/platforms/verification-overview>
4. Checkout.com — *Onboard sub-entities* : <https://www.checkout.com/docs/platforms/onboard-sub-entities>
5. PayPal/Braintree — *Ecommerce Website Requirements* : <https://developer.paypal.com/braintree/articles/risk-and-security/compliance/ecommerce-website-requirements>
6. Worldline — *Acquiring API, Getting started / features* : <https://docs.acquiring.worldline-solutions.com/features/>
7. HPS — *PowerCARD-Acquirer* : <https://www.hps-worldwide.com/product/powercard-acquirer>
8. HPS — *Merchant Acquiring* : <https://www.hps-worldwide.com/your-business/merchant-acquiring>

**Classification MCC**

9. Parcha — *Automate Merchant Category Code selection* : <https://www.parcha.ai/products/merchant-category-code>
10. KYC Systems LLC — communiqué *KYC SiteScan Introduces Automated Merchant Category Codes and Business Classification* (27 février 2025) : <https://www.prnewswire.com/news-releases/kyc-sitescan-introduces-automated-merchant-category-codes-and-business-classification-302386709.html>

**Enrôlement, KYB, pratiques de place**

11. Corefy — *Merchant onboarding process: steps, checks & best practices* : <https://corefy.com/blog/merchant-onboarding-explained>
12. Wikipédia — *Maker-checker* : <https://en.wikipedia.org/wiki/Maker-checker>

**Cadre normatif MCC**

13. LegitScript — *What Are Merchant Category Codes (MCCs)?* : <https://www.legitscript.com/regulatory-and-card-brand-compliance/merchant-category-codes/>

**Tunisie**

14. STB — *Clic to Pay* : <https://www.stb.com.tn/fr/entreprises/la-banque-au-quotidien/clic-to-pay/>
15. **STB — *Contrat Affilié Commerçant E-COMMERCE*, conditions générales, formulaire d'adhésion ClicToPay et fiche technique (PDF, 6 pages)** : <https://www.stb.com.tn/wp-content/uploads/2020/09/contrat-e-commerce.pdf> — téléchargé et dépouillé par extraction textuelle. **Seule source primaire tunisienne obtenue.**
16. Banque de Tunisie — *Le e-commerce* : <https://www.bt.com.tn/le-e-commerce-entreprises>
17. 9anoun.tn — *Circulaire de la Banque Centrale de Tunisie n° 2018-16* : <https://9anoun.tn/fr/kb/jorts/jort-2019-010-0564b/circulaire-de-la-banque-centrale-de-tunisie-ndeg-2018-16-115>

**Interne, lu en lecture seule**

18. `/home/user/simulateur/clicktopay-affiliation/README.md`
19. `/home/user/simulateur/clicktopay-affiliation/docs/rapport-recette.md` (§ 1 et § 2)
20. `server/src/services/requestSchema.js`, `server/src/services/mccSuggestion.js`, `server/src/routes/admin.js`, `server/src/db/schema.sql`, `server/package.json`, `web/package.json`

### 5.2 Sources citées d'après les extraits de recherche, non ouvertes directement

Les affirmations qui en découlent sont signalées comme telles dans le corps du
document.

- Adyen — *Onboarding and verification* : <https://docs.adyen.com/platforms/quickstart-guide/onboarding-and-kyc>
- Sumsub — *Business Verification Service* : <https://sumsub.com/business-verification-services/> ; *How Business Verification works* : <https://docs.sumsub.com/docs/how-business-verification-works> ; communiqué *six-in-one KYB solution* : <https://sumsub.com/newsroom/sumsub-revamps-business-verification-making-it-the-only-six-in-one-kyb-solution-on-the-market/>
- Signicat — *Trust Orchestration* : <https://www.signicat.com/products/trust-orchestration> ; *Identity proofing* : <https://www.signicat.com/products/identity-proofing>
- PayPal/Braintree — *Onboarding Sub-merchants* : <https://developer.paypal.com/braintree/docs/guides/braintree-marketplace/onboarding/php> ; *Periodic Reviews* : <https://developer.paypal.com/braintree/articles/risk-and-security/underwriting/periodic-reviews>
- Brex — *How We Built a (Mostly) Automated System to Solve Credit Card Merchant Classification* : <https://medium.com/brexeng/how-we-built-a-mostly-automated-system-to-solve-credit-card-merchant-classification-f9108029e59b>
- Network International — *Merchant Acquiring Solutions* : <https://www.network.ae/en/merchant-solutions> et communiqués du même domaine
- EMVCo — *Secure Remote Commerce* : <https://www.emvco.com/emv-technologies/secure-remote-commerce/> et pages associées
- Visa Integrity Risk Program — pages de LegitScript, PaymentCloud, Corepay, FinQub et CommerceGate
- M2P Fintech et Jaguar Software India — circuits *maker-checker* en octroi de crédit
- Tunisie — loi n° 2000-83 du 9 août 2000 : <http://www.legislation.tn/fr/detailtexte/Loi-num-2000-83-du-09-08-2000-jort-2000-064__2000064000831> et <https://www.jurisitetunisie.com/tunisie/codes/ce/ce1000.htm> ; recueil de la réglementation des changes de la BCT : <https://www.bct.gov.tn/bct/siteprod/documents/Reg_des_Chges_ao13.pdf>

### 5.3 Sources inaccessibles ou refusées

| Source | Motif |
| --- | --- |
| **Mastercard Quick Reference Booklet (QRB)** | Protégé par Akamai. Jamais téléchargé par le projet. **Aucune affirmation de ce document n'est reprise ici, ni directement ni indirectement.** |
| *Mastercard Click to Pay Program Requirements* (PDF, mastercard.us) | Apparu dans les résultats de recherche, non ouvert. Le détail des exigences d'affiliation Click to Pay reste donc inconnu. |
| Sumsub — <https://sumsub.com/business-verification-kyb/> | HTTP 404. |
| Global Payments — <https://eu.globalpayments.com/acquirer-solutions> | HTTP 403. Aucune fiche n'a été rédigée pour cet acteur. |
| Worldline — *Digital onboarding and contract solution* | Redirection 301 vers la page d'accueil du groupe : la page n'existe plus. La fonction de signature électronique de contrat de Worldline n'a donc pas pu être décrite. |
| ProgressSoft | Aucune page produit pertinente trouvée sur l'enrôlement marchand. Aucune fiche rédigée. |
| Nexi, Fiserv | Non couverts faute de temps de recherche ; à traiter dans une prochaine itération. |
| Textes primaires de la BCT sur l'affiliation des commerçants au paiement en ligne | **Non trouvés.** La circulaire 2018-16, souvent citée, porte sur les établissements de paiement et non sur l'acceptation marchande. |

### 5.4 Contenu suspect rencontré

Aucune page consultée ne contenait de texte se présentant comme une instruction
adressée à l'outil de collecte. Les pages produit d'éditeurs comportent en
revanche des formulations promotionnelles et des chiffres de performance
autodéclarés ; ils sont rapportés comme allégations et non comme faits vérifiés,
conformément à la note de méthode en tête de document.
