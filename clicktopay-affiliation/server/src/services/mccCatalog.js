import { pool, query } from '../db/pool.js';
import { deriverMotsCles, tokenize } from './motsCles.js';
import { normalize } from './texte.js';

export { normalize };

/**
 * Référentiel MCC.
 *
 * La base de données fait foi : `data/mcc-catalog.json` ne sert qu'à l'amorçage
 * initial (npm run db:seed). Les ajustements faits depuis l'écran d'administration
 * ne sont donc jamais écrasés par un redéploiement.
 *
 * Le catalogue est lu en mémoire une fois puis servi depuis le cache : il est
 * consulté à chaque frappe dans le formulaire, et il change rarement.
 * Toute écriture doit appeler `rechargerCatalogue()`.
 */

let cache = { items: [], byCode: new Map(), secteurs: [] };
let chargement = null;

/**
 * Issue de la DERNIÈRE tentative de chargement.
 *
 * « Un catalogue est en mémoire » et « le référentiel est à jour » sont deux
 * choses différentes : après un rechargement raté, le cache continue de servir
 * une photo périmée. Le contrôle de santé doit voir l'échec, sinon un
 * répartiteur de charge laisse l'instance en rotation pendant une panne.
 */
let etat = { chargeLe: null, echec: null };

/** Mémorise l'échec sans vider le cache : servir une photo périmée reste mieux que rien. */
function noterEchec(err) {
  etat = { ...etat, echec: { message: err.message, le: new Date().toISOString() } };
}

/**
 * Canal PostgreSQL de propagation.
 *
 * Le cache vit dans le processus : une modification faite par une instance
 * laisserait les autres servir un référentiel périmé — et accepter un code
 * devenu interdit. Chaque écriture émet un NOTIFY, et chaque instance écoute.
 */
const CANAL = 'mcc_catalogue_modifie';
let ecoute = null;

/**
 * Poids des champs dans le score. Ils reproduisent la pondération historique du
 * moteur : un même mot présent dans le libellé ET dans les mots-clés compte deux
 * fois, d'où une somme et non un maximum.
 */
const POIDS = { label: 4, keywords: 5, keywordsAuto: 3, description: 2, en: 1 };

/**
 * Index de recherche d'un MCC, calculé une fois au chargement du catalogue.
 *
 * Auparavant le moteur retokenisait les quatre champs de chacun des 280 codes à
 * chaque appel, soit à chaque frappe de l'agent. Le coût devenait proportionnel
 * à la taille du référentiel.
 */
function construireIndex(mcc) {
  const tokens = new Map();
  const tokensForts = new Set();

  // `justifiant` marque les jetons qui méritent d'être montrés à l'agent comme
  // raison de la proposition. Les mots-clés dérivés en font partie : sans cela,
  // un code remonté par une variante (« borne » pour « bornes ») arrivait dans la
  // liste sans aucun terme correspondant affiché, donc sans justification.
  const ajouter = (texte, poids, justifiant = false) => {
    for (const jeton of tokenize(texte)) {
      tokens.set(jeton, (tokens.get(jeton) ?? 0) + poids);
      if (justifiant) tokensForts.add(jeton);
    }
  };

  ajouter(mcc.label, POIDS.label, true);
  ajouter(mcc.keywords.join(' '), POIDS.keywords, true);
  ajouter(mcc.keywordsAuto.join(' '), POIDS.keywordsAuto, true);
  ajouter(mcc.description, POIDS.description);
  ajouter(`${mcc.labelEn} ${mcc.descriptionEn}`, POIDS.en);

  // Expressions complètes : elles valent bien plus qu'un mot isolé.
  const phrases = [...mcc.keywords, ...mcc.keywordsAuto]
    .map((cle) => ({ libelle: cle, normalise: normalize(cle) }))
    .filter((p) => p.normalise.includes(' ') && p.normalise.length >= 4);

  return { tokens, tokensForts, phrases };
}

const versMcc = (row) => ({
  code: row.code,
  label: row.label_fr,
  description: row.description_fr,
  labelEn: row.label_en,
  descriptionEn: row.description_en,
  keywords: row.keywords,
  similar: row.similar_codes,
  ecommerceRelevance: row.ecommerce_relevance,
  riskLevel: row.risk_level,
  note: row.note,
  networks: row.networks,
  source: row.source,
  active: row.active,
  updatedAt: row.updated_at,
  // Dérivés du libellé et de la description : ils rendent trouvable un code
  // importé, qui n'arrive avec aucun mot-clé métier.
  keywordsAuto: deriverMotsCles({
    label: row.label_fr,
    description: row.description_fr,
    labelEn: row.label_en,
  }),
  sectors: [],
});

async function chargerCatalogue() {
  const [codes, secteurs, rattachements] = await Promise.all([
    query('SELECT * FROM mcc_codes ORDER BY code'),
    query('SELECT * FROM sectors WHERE active ORDER BY position, label'),
    query('SELECT * FROM mcc_sectors ORDER BY sector_key, rank'),
  ]);

  const items = codes.rows.map(versMcc);
  const byCode = new Map(items.map((m) => [m.code, m]));

  // Rattachement MCC <-> secteur, dans les deux sens.
  const parSecteur = new Map(
    secteurs.rows.map((s) => [s.key, { key: s.key, label: s.label, position: s.position, mccs: [] }])
  );
  for (const lien of rattachements.rows) {
    const secteur = parSecteur.get(lien.sector_key);
    const mcc = byCode.get(lien.mcc_code);
    if (!secteur || !mcc) continue;
    secteur.mccs.push(lien.mcc_code);
    mcc.sectors.push(lien.sector_key);
  }

  for (const mcc of items) mcc.index = construireIndex(mcc);

  cache = { items, byCode, secteurs: [...parSecteur.values()] };
  etat = { chargeLe: new Date().toISOString(), echec: null };
  return cache;
}

/** Charge le catalogue au premier besoin ; les appels concurrents partagent la promesse. */
export function assurerCatalogueCharge() {
  chargement ??= chargerCatalogue().catch((err) => {
    chargement = null; // un échec ne doit pas figer un cache vide
    noterEchec(err);
    throw err;
  });
  return chargement;
}

/** À appeler après toute écriture sur mcc_codes : recharge et prévient les autres instances. */
export async function rechargerCatalogue({ diffuser = true } = {}) {
  // Même précaution que dans assurerCatalogueCharge : sans ce `catch`, un échec
  // passager de la base laisse une promesse rejetée dans `chargement`, que le
  // `??=` ne remplacera jamais. Toutes les routes, connexion comprise,
  // répondraient alors 500 jusqu'au redémarrage du processus.
  const tentative = chargerCatalogue().catch((err) => {
    chargement = null;
    noterEchec(err);
    throw err;
  });
  chargement = tentative;
  const resultat = await tentative;
  if (diffuser) {
    // Best effort : une notification perdue ne doit pas faire échouer l'écriture,
    // qui est déjà validée à ce stade.
    try {
      await query(`NOTIFY ${CANAL}`);
    } catch (err) {
      console.warn('Notification du référentiel MCC impossible :', err.message);
    }
  }
  return resultat;
}

/** Le catalogue est-il chargé et exploitable ? */
export const catalogueEstCharge = () => cache.items.length > 0;

/**
 * État détaillé pour le contrôle de santé : présence d'un catalogue, date du
 * dernier chargement réussi, et échec de la dernière tentative s'il y en a eu un.
 */
export const etatCatalogue = () => ({
  charge: catalogueEstCharge(),
  codes: cache.items.length,
  chargeLe: etat.chargeLe,
  echec: etat.echec,
});

/** Remet l'état de santé à zéro. Réservé aux tests, qui simulent des pannes. */
export const reinitialiserEtat = () => {
  etat = { chargeLe: null, echec: null };
};

/**
 * Ouvre une connexion dédiée qui écoute les modifications du référentiel.
 * Appelée au démarrage du serveur ; sans elle, le cache reste local au processus.
 */
export async function ecouterModifications() {
  if (ecoute) return ecoute;
  const client = await pool.connect();
  client.on('notification', (message) => {
    if (message.channel === CANAL) {
      rechargerCatalogue({ diffuser: false }).catch((err) =>
        console.error('Rechargement du référentiel MCC impossible :', err.message)
      );
    }
  });
  client.on('error', (err) => {
    console.error('Écoute du référentiel MCC interrompue :', err.message);
    ecoute = null;
    client.release(err);
  });
  await client.query(`LISTEN ${CANAL}`);
  ecoute = client;
  return client;
}

/** Tous les codes, y compris désactivés : vue de l'administrateur. */
export const catalogueComplet = () => cache.items;

/** Codes actifs : seuls ceux-ci sont proposés et sélectionnables. */
export const catalogueActif = () => cache.items.filter((m) => m.active);

export const getMcc = (code) => cache.byCode.get(String(code ?? '').trim()) ?? null;

/** Secteurs d'activité proposés au formulaire, avec leurs MCC rattachés. */
export const secteurs = () => cache.secteurs;
export const getSecteur = (key) => cache.secteurs.find((s) => s.key === key) ?? null;
export const clesSecteurs = () => cache.secteurs.map((s) => s.key);

export const estSelectionnable = (code) => {
  const mcc = getMcc(code);
  return Boolean(mcc) && mcc.active && mcc.riskLevel !== 'INTERDIT';
};

/** Recherche plein texte, pour la sélection manuelle et l'écran d'administration. */
export function searchCatalog(term, { limit = 30, includeProhibited = true, includeInactive = false } = {}) {
  // `slice(0, limit)` avec un limit négatif couperait la fin de la liste sans
  // rien signaler : la borne est reposée ici, en plus de la validation en route.
  const taille = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 30;
  const needle = normalize(term ?? '');
  let pool = includeInactive ? catalogueComplet() : catalogueActif();
  if (!includeProhibited) pool = pool.filter((m) => m.riskLevel !== 'INTERDIT');
  if (!needle) return pool.slice(0, taille);

  return pool
    .map((mcc) => {
      const haystack = normalize(
        [mcc.code, mcc.label, mcc.description, mcc.labelEn, mcc.keywords.join(' ')].join(' ')
      );
      if (!haystack.includes(needle)) return null;
      // Un code exact ou un libellé qui commence par le terme remonte en premier.
      const weight = mcc.code === term.trim() ? 0 : normalize(mcc.label).startsWith(needle) ? 1 : 2;
      return { mcc, weight };
    })
    .filter(Boolean)
    .sort((a, b) => a.weight - b.weight || a.mcc.code.localeCompare(b.mcc.code))
    .slice(0, taille)
    .map((r) => r.mcc);
}
