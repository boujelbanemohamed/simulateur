# Recette ClickToPay — protocole de coordination des agents

Document maintenu par l'**agent 8 (orchestrateur)**. Tout ce qui suit a été exécuté et
vérifié sur la machine de recette avant d'être écrit ; les commandes sont à copier telles quelles.

Vérification globale de l'environnement en une commande :

```bash
bash /home/user/simulateur/clicktopay-affiliation/docs/verifier-environnement.sh
```

Code de retour `0` = tout est en place, non nul = au moins un contrôle en échec.

---

## 1. Matrice d'isolation

| Agent | Rôle | Vague | Port API | Base PostgreSQL | Interface | Dossier de travail |
|---|---|---|---|---|---|---|
| — | Démonstration (commune, **ne jamais arrêter**) | — | **4000** | `clicktopay` | **5173** | `server/`, `web/` (lecture seule) |
| 1 | Plan de tests | 1 | aucun | aucune | aucune | `docs/` (ses propres fichiers) |
| 2 | Recette front | 2 | 4000 (lecture) | `clicktopay` (lecture) | 5173 | scratchpad |
| 3 | Recette back | 2 | **4011** | `clicktopay_recette_back` | — | scratchpad |
| 4 | Revue de code | 1 | **4021** | `clicktopay_test` via `npm test` | — | scratchpad |
| 5 | Retest front | 3 | 4000 (lecture) | `clicktopay` (lecture) | 5173 | scratchpad |
| 6 | Retest back | 3 | **4012** | `clicktopay_recette_back2` | — | scratchpad |
| 7 | Rapport final | 4 | aucun | aucune | aucune | `docs/` |
| 8 | Orchestration | 1 | aucun | aucune | aucune | `docs/` |

Scratchpad de session :
`/tmp/claude-0/-home-user-simulateur/2c840da0-0f37-50d2-9c7b-03919fb5b7eb/scratchpad`
Chaque agent y crée **son propre sous-dossier** (`agent-3/`, `agent-6/`…) : scripts, journaux,
captures, exports. Rien de tout cela n'entre dans le dépôt.

### Accès PostgreSQL

Identifiants uniques pour toutes les bases : `clicktopay` / `clicktopay` sur `127.0.0.1:5432`.

```bash
PGPASSWORD=clicktopay psql -h 127.0.0.1 -U clicktopay -d <base>
```

| Base | Propriétaire | Usage |
|---|---|---|
| `clicktopay` | démonstration | alimente l'API 4000 et l'interface 5173. **Lecture seule** pour les agents front ; ne jamais la réamorcer pendant une vague. |
| `clicktopay_recette_back` | agent 3 | instance dédiée port 4011 |
| `clicktopay_recette_back2` | agent 6 | instance dédiée port 4012 |
| `clicktopay_test` | `npm test` | réservée à la suite automatisée, qui la remet à zéro à chaque exécution. **Aucun agent ne s'y connecte à la main.** |

### Comptes applicatifs

| Courriel | Mot de passe | Rôle | Banque |
|---|---|---|---|
| `agent@banque.tn` | `Agent#2026` | AGENT | BQ001 |
| `banquier@banque.tn` | `Banquier#2026` | BANQUIER | BQ001 |
| `agent2@banque.tn` | `Agent#2026` | AGENT | BQ002 (cloisonnement inter-banques) |
| `admin@clicktopay.tn` | `Admin#2026` | ADMIN | BQ001 |

Ces quatre comptes sont recréés par `npm run db:seed`. Un agent qui change un mot de passe
en cours de test le signale immédiatement dans le tableau de bord, ou remet la base à zéro.

---

## 2. Instance dédiée : démarrage et arrêt propres

Les agents 3, 4 et 6 travaillent sur **leur** instance d'API, jamais sur celle de démonstration.
Aucune variable n'est indispensable au démarrage : `server/src/config.js` retombe sur
`PORT=4000` et sur la base `clicktopay`. **Un oubli de `PORT` ou de `DATABASE_URL` fait donc
écrire l'agent dans la base de démonstration.** Passez toujours les deux.

### Démarrage (exemple : agent 3)

```bash
SP=/tmp/claude-0/-home-user-simulateur/2c840da0-0f37-50d2-9c7b-03919fb5b7eb/scratchpad/agent-3
mkdir -p "$SP"
cd /home/user/simulateur/clicktopay-affiliation/server
PORT=4011 \
DATABASE_URL='postgres://clicktopay:clicktopay@127.0.0.1:5432/clicktopay_recette_back' \
JWT_SECRET=recette-agent3 \
CORS_ORIGIN='*' \
nohup node src/index.js > "$SP/api-4011.log" 2>&1 &
sleep 3
curl -s http://127.0.0.1:4011/api/health
```

Réponse attendue : `{"status":"ok","env":"development"}`.
Si la commande ne répond pas, lire `"$SP/api-4011.log"` : le message de démarrage attendu est
`API ClickToPay Affiliation à l'écoute sur http://localhost:4011`.

Adapter pour l'agent 6 : port `4012`, base `clicktopay_recette_back2`, dossier `agent-6`.
Adapter pour l'agent 4 : port `4021`, dossier `agent-4` (choisir une base de travail
parmi celles qui lui sont ouvertes ; **jamais** `clicktopay`).

### Identifier une instance (le PID du shell ne suffit pas)

Le `$!` retourné par `nohup … &` est bien le PID du nœud, mais il est perdu dès que le shell
de l'agent change. La source de vérité est le **port** :

```bash
lsof -nP -iTCP:4011 -sTCP:LISTEN -t     # -> PID, ou vide si rien n'écoute
```

Pour savoir avec quelles variables une instance tourne :

```bash
PID=$(lsof -nP -iTCP:4011 -sTCP:LISTEN -t)
tr '\0' '\n' < /proc/$PID/environ | grep -E '^(PORT|DATABASE_URL|JWT_SECRET|CORS_ORIGIN)='
```

Recensement de toutes les instances API avec leur port et leur base :

```bash
for p in $(lsof -nP -iTCP -sTCP:LISTEN -t 2>/dev/null | sort -u); do
  [ -r /proc/$p/cmdline ] || continue
  tr '\0' ' ' < /proc/$p/cmdline | grep -q 'src/index.js' || continue
  env_p=$(tr '\0' '\n' < /proc/$p/environ)
  port=$(printf '%s\n' "$env_p" | sed -n 's/^PORT=//p'); port=${port:-4000 (défaut)}
  db=$(printf '%s\n' "$env_p" | sed -n 's/^DATABASE_URL=//p'); db=${db##*/}; db=${db:-clicktopay (défaut)}
  echo "pid=$p port=$port base=$db"
done
```

### Arrêt propre

```bash
PID=$(lsof -nP -iTCP:4011 -sTCP:LISTEN -t)
[ -n "$PID" ] && kill -TERM "$PID"
sleep 2
lsof -nP -iTCP:4011 -sTCP:LISTEN -t    # doit ne rien afficher
```

Si le processus résiste au bout de 5 s : `kill -KILL "$PID"`.
Chaque agent arrête son instance à la fin de sa vague, et vérifie avant de rendre la main que
`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/health` renvoie bien `200`.

---

## 3. Règle d'écriture

**Les agents de recette (1 à 8) ne modifient aucun fichier du projet.**

| Chemin | Droit |
|---|---|
| `server/src/`, `server/tests/`, `server/scripts/`, `server/data/` | **lecture seule** |
| `web/src/`, `web/public/`, tout fichier de configuration | **lecture seule** |
| `server/.env` | **ne jamais créer.** `config.js` charge `dotenv/config` : un `.env` déposé là s'appliquerait à toutes les instances, démonstration comprise, et masquerait silencieusement les variables voulues. |
| `docs/` | écriture, **uniquement les fichiers dont l'agent est propriétaire** |
| scratchpad `…/scratchpad/agent-N/` | écriture libre |

Propriétaires des fichiers de `docs/` :

| Fichier | Propriétaire |
|---|---|
| `recette-coordination.md`, `verifier-environnement.sh` | agent 8 |
| `recette-tableau-de-bord.md` | agent 8 pour l'en-tête ; **chaque agent n'ajoute que ses propres lignes**, il ne réécrit ni ne supprime celles des autres |
| `plan-de-tests.md` | agent 1 |
| `revue-de-code.md` | agent 4 |
| rapports de recette, **un fichier par agent** (`recette-front-a2.md`, `recette-back-a3.md`, `retest-front-a5.md`, `retest-back-a6.md`) | agents 2, 3, 5, 6 |
| rapport final | agent 7 |

Les identifiants de cas viennent de `plan-de-tests.md` (`CAS-<DOM>-<NN>`) et les constats de
revue de `revue-de-code.md` (`C-<NN>`) : aucune autre nomenclature n'est créée. Les règles de
saisie et les plages de numérotation des défauts sont dans `recette-tableau-de-bord.md`.

**Seul l'agent principal corrige le code**, entre la vague 2 et la vague 3. Un agent de recette
qui identifie un correctif le décrit dans son rapport et dans le tableau de bord ; il ne
l'applique pas. Si une anomalie bloque la poursuite des tests, elle est consignée avec la
criticité `BLOQUANT` et le cas suivant est joué.

---

## 4. Remise à zéro d'une base de recette

`npm run db:seed` est **additif** : le schéma est en `CREATE TABLE IF NOT EXISTS` et les
insertions en `ON CONFLICT DO UPDATE/DO NOTHING`. Il recrée les comptes et le référentiel MCC,
mais **ne supprime ni les demandes d'affiliation ni l'historique** créés pendant les tests.
Pour repartir d'un état identique, il faut vider le schéma d'abord :

```bash
BASE=clicktopay_recette_back     # ou clicktopay_recette_back2

# 1. arrêter l'instance qui utilise cette base (cf. § 2)
# 2. vider
PGPASSWORD=clicktopay psql -h 127.0.0.1 -U clicktopay -d "$BASE" -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
# 3. réamorcer
cd /home/user/simulateur/clicktopay-affiliation/server
DATABASE_URL="postgres://clicktopay:clicktopay@127.0.0.1:5432/$BASE" npm run db:seed
# 4. contrôler
PGPASSWORD=clicktopay psql -h 127.0.0.1 -U clicktopay -d "$BASE" -tAc \
  'select (select count(*) from users), (select count(*) from mcc_codes), (select count(*) from affiliation_requests)'
```

État de référence attendu : **4 utilisateurs, 279 codes MCC, 0 demande d'affiliation**,
2 banques (BQ001, BQ002). Procédure exécutée et vérifiée sur `clicktopay_recette_back2`.

> `DROP SCHEMA public CASCADE` sur `clicktopay` détruirait la démonstration commune, et sur
> `clicktopay_test` entrerait en conflit avec `npm test`. Ne l'appliquer qu'à sa propre base.

Remise à zéro **partielle** (garder le référentiel, effacer seulement les demandes) :

```bash
PGPASSWORD=clicktopay psql -h 127.0.0.1 -U clicktopay -d "$BASE" -v ON_ERROR_STOP=1 \
  -c 'TRUNCATE request_events, mcc_suggestions, affiliation_requests RESTART IDENTITY CASCADE;
      ALTER SEQUENCE affiliation_reference_seq RESTART WITH 1;'
```

---

## 5. Pièges d'environnement (tous confirmés par l'expérience)

### 5.1 Les instances API sont indiscernables dans `ps`

`node src/index.js` ne porte jamais le port dans sa ligne de commande : les variables sont
passées en préfixe et n'apparaissent pas dans `/proc/<pid>/cmdline`. Observé avec deux
instances actives (4000 et 4011) :

```
  450 node src/index.js
  767 node src/index.js
```

**Parade** : identifier par le port avec `lsof -nP -iTCP:<port> -sTCP:LISTEN -t`, puis lire les
variables dans `/proc/<pid>/environ` (cf. § 2). Jamais par `ps | grep`.

### 5.2 `pkill -f` / `pgrep -f` tuent ou comptent le shell appelant

`pgrep -f 'node src/index.js'` a renvoyé chez nous **trois** PID alors que deux instances
seulement tournaient : le troisième était le shell exécutant la commande, dont la ligne de
commande contient la chaîne recherchée. Avec `pkill -f`, ce shell est tué — l'agent perd sa
session avant d'avoir arrêté quoi que ce soit.

**`pkill -f` et `pgrep -f` sont interdits dans cette campagne.** Toujours passer par
`lsof … -t` puis `kill -TERM <pid>`.

### 5.3 `ss` et `netstat` ne sont pas installés

Seuls `lsof` et `fuser` sont disponibles. Toutes les vérifications de ports passent par `lsof`.
Un port réellement libre fait retourner `lsof … -t` **vide avec un code de retour 1** : tester
la chaîne vide, pas le code de retour.

### 5.4 L'instance de démonstration tourne sans aucune variable

`/proc/450/environ` ne contient ni `PORT` ni `DATABASE_URL` : la démonstration s'appuie
entièrement sur les valeurs par défaut de `config.js`. Conséquence directe : une instance
lancée en oubliant `DATABASE_URL` écrit dans `clicktopay`, la base de la démonstration, sans
le moindre avertissement. **Toujours passer `PORT` et `DATABASE_URL` ensemble, puis vérifier
l'environnement du processus avec la commande du § 2 avant de commencer les tests.**

### 5.5 `server/.env` s'appliquerait à toutes les instances

`config.js` importe `dotenv/config`. Il n'y a volontairement **aucun** `server/.env` sur la
machine. En créer un contaminerait la démonstration et les instances des autres agents.
Interdit (cf. § 3).

### 5.6 L'interface 5173 est câblée sur l'API 4000

`web/vite.config.js` proxie `/api` vers `process.env.API_URL ?? http://127.0.0.1:4000`.
L'interface de démonstration parle donc à l'API 4000 et à la base `clicktopay`. Les agents 2
et 5 travaillent sur cette pile telle quelle et **ne redémarrent pas Vite** : le serveur de
développement est partagé, l'arrêter prive l'autre agent de sa cible. Un besoin d'interface
pointant sur une autre API se règle par une instance Vite supplémentaire sur un autre port
(`API_URL=http://127.0.0.1:4011 npx vite --port 5181 --host 127.0.0.1`), à annoncer d'abord
dans le tableau de bord.

### 5.7 Limitation du nombre de connexions — source classique de faux défauts

`server/src/routes/auth.js` limite `/api/auth/login` à `LOGIN_RATE_LIMIT_MAX` (défaut **10**)
par fenêtre de `LOGIN_RATE_LIMIT_WINDOW_MS` (défaut **15 minutes**). Mesuré sur une instance
dédiée :

- 13 connexions **réussies** d'affilée : `200` à chaque fois — les succès ne sont pas comptés ;
- 10 connexions **en échec** (`401`), puis `429` à la 11e ;
- une fois le seuil atteint, **le bon mot de passe renvoie aussi `429`** pendant toute la fenêtre.

Conséquences pratiques :

- Le compteur est en mémoire du processus : il disparaît au redémarrage de l'instance. Sur une
  instance dédiée, c'est la sortie de secours la plus rapide (§ 2), ou le démarrage avec
  `LOGIN_RATE_LIMIT_MAX=1000`.
- **Sur la démonstration 4000, le compteur est partagé entre les agents 2 et 5** et l'instance
  ne doit pas être redémarrée : quelques cas d'identifiants erronés suffisent à bloquer les
  connexions de l'autre agent pour 15 minutes. Les cas de test sur les mauvais identifiants se
  font sur une instance dédiée, pas sur 4000.
- Un `429` inattendu est un effet de bord à écarter avant de déclarer un défaut, sauf s'il
  s'agit justement du cas de test sur la limitation.

### 5.8 Playwright

Le module est installé dans le scratchpad de session, pas dans le projet. Depuis ce dossier :

```js
const { chromium } = require('playwright');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
```

Vérifié : ouverture de `http://127.0.0.1:5173/`, titre `ClickToPay – Affiliation des
e-commerçants`. Lancer le script **depuis** le dossier scratchpad (ou renseigner `NODE_PATH`),
sinon `require('playwright')` échoue.

### 5.9 `clicktopay_test` appartient à `npm test`

La suite automatisée remet cette base à zéro à chaque exécution. Deux `npm test` simultanés se
détruisent mutuellement : **une seule exécution de `npm test` à la fois** sur toute la
campagne, à annoncer dans le tableau de bord avant de la lancer.

---

## 6. Risques de collision et parades

| Risque | Vagues exposées | Parade |
|---|---|---|
| Deux agents sur le même port | 2 et 3 | Ports nominatifs (4011/4012/4021). Contrôler avec `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` **avant** de démarrer ; si occupé, ne pas tuer — vérifier `/proc/<pid>/environ` et signaler dans le tableau de bord. |
| Instance lancée sans `DATABASE_URL`, qui écrit dans `clicktopay` | 2 et 3 | Les deux variables sont obligatoires, et l'on relit `/proc/<pid>/environ` après démarrage (§ 2, § 5.4). |
| Agents 2 et 5 sur la même base `clicktopay` | 2 et 3 | Ils ne sont **jamais actifs en même temps** (vagues distinctes). Chacun préfixe les données qu'il crée par son identifiant (`RECETTE-A2-…`, `RECETTE-A5-…`) pour que les enregistrements restent attribuables. |
| Limitation de connexion déclenchée sur 4000 | 2 et 3 | Cas d'identifiants erronés sur instance dédiée uniquement ; jeton réutilisé entre les cas (§ 5.7). |
| `npm test` lancé par deux agents (base `clicktopay_test`) | 1 et 3 | Une seule exécution à la fois, annoncée dans le tableau de bord avant lancement. |
| Arrêt accidentel de la démonstration | toutes | `pkill`/`pgrep -f` interdits (§ 5.2) ; l'arrêt se cible par port. Après chaque vague, contrôler `4000` et `5173` — ou lancer `verifier-environnement.sh`. |
| Écriture concurrente dans le tableau de bord | toutes | Un agent n'ajoute que ses propres lignes, en fin de section, et ne réécrit jamais celles des autres (§ 3). |
| Correctifs appliqués pendant qu'un test tourne | entre 2 et 3 | L'agent principal ne corrige qu'une fois les agents 2 et 3 terminés et leurs instances arrêtées. Les agents 5 et 6 ne démarrent qu'après. |
| Bases de retest polluées par la vague 2 | 3 | L'agent 6 dispose de sa propre base `clicktopay_recette_back2`, déjà amorcée à l'état de référence. En cas de doute, remise à zéro (§ 4). |

---

## 7. Checklist par agent

**Avant de commencer**

1. `bash docs/verifier-environnement.sh` — doit sortir en code 0.
2. Créer son dossier de travail dans le scratchpad.
3. Pour les agents 3, 4, 6 : démarrer son instance (§ 2) et contrôler `/api/health` **et**
   `/proc/<pid>/environ`.

**Pendant**

4. Consigner chaque cas dans `docs/recette-tableau-de-bord.md` (une ligne par cas).
5. Ne modifier aucun fichier du projet (§ 3).

**Avant de rendre la main**

6. Arrêter son instance (§ 2) et vérifier que son port est bien libéré.
7. Vérifier que la démonstration répond toujours : `4000` en `200`, `5173` en `200`.
8. Relancer `verifier-environnement.sh` — code 0 attendu.
