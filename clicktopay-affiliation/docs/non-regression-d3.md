# Tests de non-régression — après D-3 (commit `3c03b25`)

Campagne de non-régression sur la décision **D-3, « le banquier administre sa banque »**.
Date d'exécution : 2026-09-23.
Question posée : **le périmètre acquis avant D-3 est-il intact ?**

Référence de comparaison : commit `78d44b0` (état immédiatement antérieur au changement de
code ; il ne porte que la spécification, le code y est encore celui du lot 1 `c9abaf3`).
Documents de référence : `docs/plan-de-tests.md` (147 cas, § 3 matrice de couverture,
§ 4 jeux de données), `docs/decisions-commanditaire.md` (D-1, D-2, D-3),
`docs/non-regression-lot1.md` (campagne précédente, close sur le lot 1).

**Définition retenue** : une régression est un cas qui **passait avant D-3 et ne passe
plus**. Un défaut déjà présent avant D-3 est consigné à part (§ 7) et n'est pas porté au
débit du changement. Un comportement que D-3 modifie **délibérément** (le banquier saisit,
le banquier administre) n'est pas une régression : c'est la décision ; il est néanmoins
contrôlé, car une décision mal bornée en produit.

---

## 1. Banc d'essai

| Élément | Valeur |
| --- | --- |
| Base | `clicktopay_nr2`, créée pour cette campagne, migrée (`db:migrate`) et amorcée (`db:seed`) |
| Amorçage | 2 banques (BQ001, BQ002), 279 MCC, 4 comptes de démonstration |
| API | `PORT=4100`, `DATABASE_URL=…/clicktopay_nr2`, `LOGIN_RATE_LIMIT_MAX=5000` |
| Comptes | `agent@banque.tn` (AGENT, BQ001, id 1) · `banquier@banque.tn` (BANQUIER, BQ001, id 2) · `agent2@banque.tn` (AGENT, BQ002, id 3) · `admin@clicktopay.tn` (ADMIN, BQ001, id 4) |
| Bases et ports non touchés | `clicktopay`, `clicktopay_test` (hors exécution de la suite), ports 4000, 4200 et 5173 |

**Note d'environnement**, identique à celle de la campagne précédente : le rôle `clicktopay`
n'a pas l'attribut `CREATEDB`. La commande prescrite

```
createdb -h 127.0.0.1 -U clicktopay clicktopay_nr2
```

échoue en `ERROR: permission denied to create database`. La base a été créée par
`sudo -u postgres psql -c "CREATE DATABASE clicktopay_nr2 OWNER clicktopay"`.
PostgreSQL répondait (`pg_isready` : *accepting connections*) au démarrage et pendant
toute la campagne ; aucun arrêt du service n'a été observé, aucun cas annulé.

---

## 2. Suite automatisée

```
cd /home/user/simulateur/clicktopay-affiliation/server && npm test
```

Résultat du 2026-09-23 :

```
# tests 165
# suites 21
# pass 165
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 36050.4
```

**165 tests, 165 succès, 0 échec, 0 annulé, 0 ignoré.** Le compte annoncé par D-3
(147 → 165, soit les 18 cas d'habilitation ajoutés) est confirmé au tests près.
Aucun cas n'est annulé : la panne d'environnement PostgreSQL évoquée en consigne
ne s'est pas reproduite ici, et la distinction n'a pas eu à être faite.

**Aucune régression au niveau de la suite automatisée.**

---

## 3. Cas rejoués à la main

*(section renseignée au fil de l'eau)*
