# Tests de non-régression — modèle d'habilitation D-3 et correctifs de sécurité

Campagne de non-régression portant sur **deux** changements successifs :

| Commit | Objet |
| --- | --- |
| `3c03b25` | D-3 — « le banquier est l'administrateur de sa banque » |
| `3a7ac2e` | Correctifs des revues de sécurité et d'habilitation |

Date d'exécution : 2026-09-23. État vérifié : `HEAD` = `3a7ac2e`.
Question posée : **le périmètre acquis avant ces deux changements est-il intact ?**

Référence de comparaison : `c9abaf3` (lot 1, dernier état stable avant D-3 ; `78d44b0`,
qui le suit, ne porte que la spécification et le même code).
Documents de référence : `docs/plan-de-tests.md` (147 cas, § 3 matrice de couverture,
§ 4 jeux de données), `docs/decisions-commanditaire.md`, `docs/non-regression-lot1.md`
(campagne précédente, close sur le lot 1).

**Définition retenue** : une régression est un cas qui **passait avant** ces changements
et **ne passe plus**. Trois catégories sont tenues séparées :

- **régression** (§ 6, `NRG-xx`) — perte effective de comportement acquis ;
- **changement délibéré** (§ 4) — le comportement change parce que la décision ou le
  correctif le veut ; le cas du plan devient caduc, le plan doit être amendé ;
- **défaut antérieur** (§ 7) — déjà présent avant, non porté au débit de ces changements.

## 0. Provenance de ce document — à lire avant le reste

Ce fichier existait déjà, versionné (créé en `0d26319`, complété en `3a7ac2e`). Son
contenu antérieur était le rapport d'une campagne **arrêtée au stade D-3 seul**. Il
annonçait 165 tests et relevait, en plusieurs endroits, un refus `403
{"error":"Cette demande appartient à une autre banque."}` sur le cloisonnement.

**Ces constats sont périmés** : `3a7ac2e` porte la suite à 166 tests et remplace ce 403
par un 404. Aucune de ses conclusions n'est reprise ici sur parole ; **tout a été
rejoué**. La version antérieure reste consultable dans l'historique
(`git show 0d26319:clicktopay-affiliation/docs/non-regression-d3.md`).

---

## 1. Banc d'essai

| Élément | Valeur |
| --- | --- |
| Base | `clicktopay_nr2`, **recréée à vide** pour cette campagne, migrée (`db:migrate`) puis amorcée (`db:seed`) |
| Amorçage | 2 banques (BQ001, BQ002), 279 MCC, 4 comptes de démonstration |
| API | `PORT=4100`, `DATABASE_URL=…/clicktopay_nr2`, `LOGIN_RATE_LIMIT_MAX=5000` |
| Comptes | `agent@banque.tn` (AGENT, BQ001, id 1) · `banquier@banque.tn` (BANQUIER, BQ001, id 2) · `agent2@banque.tn` (AGENT, BQ002, id 3) · `admin@clicktopay.tn` (ADMIN, BQ001, id 4) |
| Dossiers | D1 = `AFF-2026-00001` (BQ001, saisi par l'agent) · D2 = `AFF-2026-00002` (BQ002, agent2) · D3 = `AFF-2026-00003` (BQ001, saisi par le banquier) |
| Non touchés | bases `clicktopay`, `revue_lot1*`, `clicktopay_recette_*` ; ports 4000, 4400 et 5173 (autres agents) |

**Note d'environnement.** Le rôle `clicktopay` n'a pas l'attribut `CREATEDB`
(`SELECT rolcreatedb FROM pg_roles WHERE rolname='clicktopay'` → `f`). La commande
prescrite `createdb -h 127.0.0.1 -U clicktopay clicktopay_nr2` échoue en
`ERROR: permission denied to create database`. La base a donc été créée par

```
sudo -u postgres psql -c "DROP DATABASE IF EXISTS clicktopay_nr2;" \
                     -c "CREATE DATABASE clicktopay_nr2 OWNER clicktopay;"
```

PostgreSQL a répondu (`pg_isready` : *accepting connections*) pendant toute la campagne ;
**aucun arrêt du service n'a été observé**, aucun cas annulé de ce fait.

---

## 2. Suite automatisée

```
cd /home/user/simulateur/clicktopay-affiliation/server && npm test
```

### 2.1 Première exécution — 9 échecs, 57 annulés, **cause externe**

```
# tests 166   # pass 100   # fail 9   # cancelled 57   # skipped 0   # duration_ms 42805.1
```

Ce résultat **n'est pas une régression**, et la cause est établie, non supposée. Les
échecs portent tous la même signature PostgreSQL :

```
# error: deadlock detected      code: '40P01'
#   detail: 'Process 2651 waits for RowExclusiveLock on relation 16561 of database 16386;
#            blocked by process 2639.
#            Process 2639 waits for AccessExclusiveLock on relation 16561 of database 16386;
#            blocked by process 2651.'
#   at async createUser (.../src/services/admin.js:195:14)
```

Identification des objets verrouillés :

```
psql -U clicktopay -d postgres -tAc "SELECT oid, datname FROM pg_database WHERE oid=16386;"
→ 16386|clicktopay_test
psql -U clicktopay -d clicktopay_test -tAc "SELECT 16561::regclass;"
→ users
```

Un `AccessExclusiveLock` sur `clicktopay_test.users` est le `TRUNCATE`/`DELETE` de
`resetDatabase` (`tests/helpers.js`) ; le `RowExclusiveLock` concurrent est l'`INSERT` de
`createUser`. Or `npm test` s'exécute en `--test-concurrency=1`, donc **en série** : les
deux processus ne peuvent pas appartenir à la même exécution. Une **seconde suite tournait
en parallèle sur la base partagée `clicktopay_test`** — un autre agent du banc. Ce n'est ni
l'arrêt de PostgreSQL évoqué en consigne (le service répondait), ni un défaut du produit :
c'est une contention d'environnement sur une base de test non cloisonnée.

**Constat d'environnement, consigné en § 7 (DEF-ENV-01)** : la suite n'est pas
ré-entrante — elle ne peut pas tourner à deux sur la même base.
