# Journal du lot 1 — consolidation (EVO-01 à EVO-12)

Point de départ : suite à **115 tests**, tous verts (`cd server && npm test`).

| Réf. | Statut | Fichiers touchés | Tests ajoutés | Écarts au cahier des charges |
| --- | --- | --- | --- | --- |
| EVO-01 | **livré** (119 tests) | `server/tests/import.test.js` (nouveau) | 4 : CAS-IMPORT-08, -09, -10, -06 | aucun. Les quatre tests ont été éprouvés par mutation (garde retirée → test rouge). |
| EVO-02 | **livré** | `server/src/services/mccSuggestion.js`, `web/src/pages/RequestFormPage.jsx` | 1 (`tests/mcc.test.js`) | aucun. |
| EVO-03 | **livré** | `server/src/db/schema.sql`, `server/src/services/admin.js` | 2 (`tests/admin.test.js`) | aucun. Contrôle préalable des doublons de casse posé en `DO $$` dans `schema.sql`, vérifié à la main sur la base de test. |
| EVO-04 | **livré** | `server/src/services/admin.js` (`changeOwnPassword`), `web/src/pages/AdminEventsPage.jsx` | 1 (`tests/auth.test.js`) | effet de bord : le journal référence désormais l'utilisateur lui-même, d'où la purge préalable des lignes de journal dans le `beforeEach` de `admin.test.js`. |
| EVO-05 | **livré** (125 tests) | `server/src/services/admin.js`, `web/src/pages/AdminEventsPage.jsx` | 2 + 1 complété (`tests/admin.test.js`) | `updateBank` n'accepte pas `code` (le schéma de validation l'interdit) : le champ est tracé mais ne peut pas varier. L'écran rend « Rôle : agent → banquier », en reprenant l'humanisation déjà en place, plutôt que les valeurs brutes. |
| EVO-06 | **livré** | `server/src/routes/admin.js`, `server/src/services/admin.js`, `server/src/db/schema.sql` (index), `web/src/pages/AdminEventsPage.jsx`, `web/src/api/client.js` | 3 (`tests/admin.test.js`) | `total` est compté **filtres appliqués** : c'est ce que réclame le compteur « entrées 101 à 200 sur N » de l'écran. |
| EVO-07 | **livré** | `server/src/services/mccCatalog.js`, `server/src/app.js`, `server/src/index.js` | 2 (`tests/robustesse.test.js`) | `arreterEcoute()` ajouté (arrêt propre + retour de la connexion au lot, sans quoi `pool.end()` reste suspendu en test). |
| EVO-08 | **livré** | `server/src/db/schema.sql`, `server/src/services/requests.js`, `web/src/components/ui.jsx`, `web/src/pages/RequestDetailPage.jsx` | 2 (`tests/requests.test.js`) | le code retenu n'est porteur d'aucun libellé en base : la fiche l'affiche depuis la photographie quand il y figure, sinon le seul code, comme avant. |
| EVO-09 | **livré** (134 tests) | `server/src/services/mccAdmin.js`, `web/src/pages/AdminMccImportPage.jsx` | 2 (`tests/import.test.js`) | un code désactivé présent au fichier sort de `inchanges` pour entrer dans `reactives` : sans cela, le rejeu à l'identique ne pourrait pas le reclasser « inchangé ». |
| EVO-10 | **livré** | `server/src/app.js` | 5 (`tests/robustesse.test.js`), dont le balayage d'invariant | le 415 exige un intergiciel dédié : `express.json()` n'échoue pas sur un type de contenu inattendu, il ne lit simplement pas le corps. Le multipart du téléversement reste admis. |
| EVO-11 | **livré** | `server/src/routes/auth.js`, `README.md` (précision) | 2 (`tests/limitation.test.js`, nouveau) | le seuil de test est desserré à 10 000 pour toutes les suites : le fichier pose `LOGIN_RATE_LIMIT_MAX=3` avant le chargement de `helpers.js`, et s'exécute dans son propre processus. Le README ne décrivait pas l'ordre inverse ; une précision y a été ajoutée. |
| EVO-12 | **livré** (147 tests) | `server/src/db/pool.js`, `server/src/routes/admin.js` | 6 (`tests/robustesse.test.js`) | la connexion n'est détruite (`release(err)`) que lorsque son état est **suspect** — retour arrière en échec, ou `BEGIN` en échec. La relâcher avec l'erreur à chaque refus métier ferait tourner le lot de connexions pour rien. |

## Arrivée

Suite : **147 tests**, tous verts. Migration rejouée sur `clicktopay` et
`clicktopay_test`. L'instance de démonstration du port 4000 a été relancée pour
servir le code livré ; le front du 5173 recharge ses sources tout seul.
