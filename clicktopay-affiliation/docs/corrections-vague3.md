# Corrections de la vague 3

Défauts relevés par l'agent 5 (retest front) et l'agent 6 (retest back), et
correctifs appliqués. Chaque correctif vise l'invariant, pas le seul cas
reproduit : c'est la critique que l'agent 6 avait adressée à la vague
précédente, et elle a été retenue.

Tous les cas ci-dessous sont couverts par `server/tests/vague3.test.js`
(7 cas), qui porte la suite à **113 tests, 113 réussis**.

## DEF-A6-01 — propositions sans justification — MAJEUR

**Constat.** Une carte MCC pouvait être servie avec `matchedTerms` vide : le
banquier voyait un code à 32 % de pertinence sans savoir pourquoi. Seuls les
jetons marqués « forts » étaient affichés, alors que tout jeton ayant contribué
au score justifie la proposition.

L'agent 5 a relevé le même défaut par une autre porte (`DEF-A5-03`) : le
correctif initial ne couvrait que le descriptif d'activité, et les termes tirés
du **nom du site** et de l'**adresse du site** échappaient encore — sur 504
profils balayés, 30 suggestions sans jeton.

**Correctif** (`server/src/services/mccSuggestion.js`) : tout jeton qui entre
dans le score est ajouté à `matchedTerms`, et le filtre final pose l'invariant
en dur — `mcc.rawScore > 0 && mcc.matchedTerms.length > 0`. Une proposition
sans justification ne peut plus sortir du moteur, quelle que soit la porte
d'entrée.

**Vérification.** 11 profils de formes différentes (descriptif seul, nom seul,
URL seule, nom + URL, secteur, descriptif sans correspondance, profil vide) ;
aucune carte sans jeton sur les deux réseaux. Un descriptif sans correspondance
ne renvoie plus que `5999`, annoncé comme code de repli.

## DEF-A6-02 — l'aller-retour export → import échouait à l'application — MAJEUR

**Constat.** Le code `5817` porte deux secteurs ; l'export les joint dans une
seule colonne (`CONTENUS_NUMERIQUES, INFORMATIQUE_LOGICIEL`, 42 caractères),
au-delà de la borne de 40 posée sur `sector`. Le défaut traversait la
simulation — le rapport d'écart était propre — et n'échouait qu'à
**l'application confirmée**, en 400, après que l'administrateur eut validé.

**Correctif** (`server/src/services/adminSchema.js`) : `sector` passe à 400
caractères, ce qui couvre un rattachement multiple.

**Vérification.** C'était le seul défaut de la vague qu'un test de bout en bout
aurait arrêté, et il n'existait pas. Il existe désormais : le cycle complet
`export → import-fichier → import apply=true` est rejoué sur le référentiel de
référence, en `xlsx` et en `csv`, et doit rendre 279 codes inchangés, 0 ajouté,
0 modifié, 0 retiré.

## DEF-A6-03 — le secret de développement acceptable en production — MAJEUR

**Constat.** `required()` ne pouvait jamais lever : un repli était toujours
fourni. Une production démarrée sans `JWT_SECRET` signait donc ses jetons avec
le secret publié dans le dépôt — n'importe qui pouvait forger un jeton
administrateur.

**Correctif** (`server/src/config.js`) : en production, `required()` lève sur
une variable absente, et `JWT_SECRET` est refusé s'il vaut le secret de
développement ou s'il compte moins de 32 caractères.

**Vérification.** Trois démarrages en `NODE_ENV=production` : secret de
développement → refusé ; secret court → refusé ; secret conforme → démarre.

## DEF-A6-04 — le contrôle de santé mentait pendant une panne — MAJEUR

**Constat.** `/api/health` répondait `200 {"referentiel":"charge"}` en
s'appuyant sur « un catalogue a été chargé une fois ». Pendant une panne de
base, le cache continuait de servir une photo périmée, le répartiteur de charge
laissait l'instance en rotation, et toutes les routes métier répondaient 500.

**Correctif** (`server/src/services/mccCatalog.js`, `server/src/app.js`) :
le service mémorise l'issue de la **dernière** tentative de chargement
(`etatCatalogue()` : `charge`, `codes`, `chargeLe`, `echec`), et le contrôle
sonde réellement la base à chaque appel. Trois états distincts :

| Situation | Réponse |
| --- | --- |
| Base joignable, dernier chargement réussi | `200 {"status":"ok","referentiel":"charge"}` |
| Cache en place mais dernier rechargement en échec | `503 {"status":"degraded","referentiel":"perime","dernierEchec":{…}}` |
| Aucun catalogue chargé | `503 {"status":"degraded","referentiel":"indisponible"}` |

Le cache n'est pas vidé sur échec : servir une photo périmée reste préférable à
ne rien servir, mais l'instance s'annonce dégradée.

**Vérification.** Panne simulée : `503`, `base: "injoignable"`, message d'échec
publié ; rétablissement automatique sans intervention, `dernierEchec` disparaît.

## DEF-A5-01 — `inert` posé un cran trop haut — MINEUR

**Constat.** L'attribut `inert` qui rend le formulaire réellement non
saisissable en lecture seule était porté par le `<form>`, qui contient aussi la
barre d'actions : « Précédent », « Suivant » et « Voir la demande » étaient
peints mais inutilisables, clic en timeout et invisibles à la tabulation. La
consultation d'une demande soumise devenait impraticable.

**Correctif** (`web/src/pages/RequestFormPage.jsx`) : `inert` descend sur un
conteneur qui n'enveloppe que les champs ; la barre d'actions reste hors de son
périmètre.

## DEF-A5-02 — bandeau « serveur injoignable » persistant — MINEUR

**Constat.** Après une coupure réseau puis une reconnexion réussie, le bandeau
« Session non vérifiée : le serveur est injoignable » restait affiché et ne
disparaissait qu'au rechargement de la page : `erreurSession` n'était jamais
remis à zéro.

**Correctif.** Plutôt que de l'effacer à la seule connexion, le client d'API
émet `clicktopay:serveur-joignable` dès qu'une réponse est reçue — quel qu'en
soit le code, car une réponse prouve que le serveur répond — et le contexte
d'authentification efface l'avertissement sur ce signal
(`web/src/api/client.js`, `web/src/auth/AuthContext.jsx`). La reprise est ainsi
couverte en cours de session, pas seulement à la reconnexion.

## Point de méthode

`DEF-A5-03` a été signalé par l'agent 5 comme non corrigé, sur la foi d'un
essai contre l'API en service. L'API tournait encore sur le code d'avant le
correctif : le processus n'avait pas été redémarré. Vérification refaite
contre le code courant — 0 suggestion sans jeton sur le profil de référence.
L'instance de démonstration du port 4000 a depuis été redémarrée.
