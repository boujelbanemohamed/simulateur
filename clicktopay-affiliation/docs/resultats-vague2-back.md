# Recette vague 2 — exécution des cas BACK (agent 3)

Instance dédiée : port **4011**, base **`clicktopay_recette_back`**, `JWT_SECRET=recette-a3`,
`LOGIN_RATE_LIMIT_MAX=5000` (sauf cas de limitation de débit, joués sur une instance
relancée avec la valeur par défaut). Base remise à l'état de référence avant la campagne
(`DROP SCHEMA public CASCADE` + `node src/db/seed.js`) : 4 utilisateurs, 279 MCC,
0 demande, 2 banques.

Périmètre : cas de niveau **BACK** et **LES DEUX** du plan `docs/plan-de-tests.md`
(la part FRONT des cas « LES DEUX » revient à l'agent 2 et n'est pas jugée ici).

Fichier écrit au fil de l'eau, cas par cas.

## Réserve préalable sur le plan de tests

Le plan renvoie à un **§4 (jeux de données JD-01 à JD-06)** qui **n'existe pas** dans
`docs/plan-de-tests.md` : le document s'arrête à la §3 « Matrice de couverture ».
Seul JD-01 est reconstituable sans ambiguïté (il correspond à `DEMANDE_VALIDE` de
`server/tests/helpers.js`, et les résultats chiffrés attendus le confirment).
JD-02 à JD-06 ne sont décrits que par quelques attributs épars. Les cas qui en
dépendent sont joués avec une reconstitution documentée, ou déclarés `BLOQUÉ`.
Consigné comme **DEF-A3-01** (défaut de plan, MAJEUR).

## Tableau de synthèse

| Cas | Statut | Gravité | Défaut | Note |
|---|---|---|---|---|
| CAS-AUTH-01 | CONFORME | | | 200, jeton à 3 segments, `AGENT`/`BQ001`/`mustChangePassword:false`, `last_login_at` avancé de 16:08:06 à 16:08:37. Part FRONT non jugée. |
| CAS-AUTH-02 | CONFORME | | | Les deux appels renvoient 401 et le corps strictement identique `{"error":"Identifiants incorrects"}`. |
| CAS-AUTH-03 | CONFORME | | | 400 + `{"champ":"email","message":"Adresse e-mail invalide"}` puis `{"champ":"password","message":"Champ obligatoire"}`. |
| CAS-AUTH-04 | CONFORME | | | 401 `Authentification requise` / `Session expirée ou jeton invalide` / `Authentification requise`. |
| CAS-AUTH-05 | CONFORME | | | 200 `{"status":"ok","env":"development","referentiel":"charge"}`. Le champ `referentiel` est un ajout du correctif de santé ; l'acceptation (200 + `status="ok"`) est tenue. |
| CAS-HAB-08 | CONFORME | | | 404 `Route inconnue : GET /api/administration`, 404 `Route inconnue : DELETE /api/requests/1`, 401 `Authentification requise` sans jeton. |
| CAS-AUTH-06 | CONFORME | | | Après désactivation : `GET /api/requests` → 401 `Compte désactivé`, `login` → 401 `Identifiants incorrects`. |
| CAS-AUTH-07 | CONFORME | | | BQ003 + agent3 créés ; compte réactivé (`users.active=true`) mais banque inactive (`banks.active=false`) → `GET /api/auth/me` = 401 `Banque désactivée`. |
| CAS-AUTH-08 | CONFORME | | | Mutation BQ001→BQ002 par l'ADMIN : le même jeton passe de 200 à 403 `Cette demande appartient à une autre banque.` |
| CAS-AUTH-09 | CONFORME | | | 403 `Action réservée aux profils : BANQUIER` puis, après passage BANQUIER, 200 et `status=VALIDEE` avec le **même** jeton. |
| CAS-AUTH-10 | DÉFAUT | MINEUR | DEF-A3-02 | `server/src/middleware/auth.js:55-56` — jeton émis dans la **même seconde** que la réinitialisation : `GET /api/auth/me` répond 200 au lieu de 401. Au-delà d'une seconde d'écart, le 401 attendu est bien rendu. |
