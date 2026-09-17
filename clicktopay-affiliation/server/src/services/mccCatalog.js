import { query } from '../db/pool.js';

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

let cache = { items: [], byCode: new Map() };
let chargement = null;

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
});

async function chargerCatalogue() {
  const { rows } = await query('SELECT * FROM mcc_codes ORDER BY code');
  const items = rows.map(versMcc);
  cache = { items, byCode: new Map(items.map((m) => [m.code, m])) };
  return cache;
}

/** Charge le catalogue au premier besoin ; les appels concurrents partagent la promesse. */
export function assurerCatalogueCharge() {
  chargement ??= chargerCatalogue().catch((err) => {
    chargement = null; // un échec ne doit pas figer un cache vide
    throw err;
  });
  return chargement;
}

/** À appeler après toute écriture sur mcc_codes. */
export async function rechargerCatalogue() {
  chargement = chargerCatalogue();
  return chargement;
}

/** Tous les codes, y compris désactivés : vue de l'administrateur. */
export const catalogueComplet = () => cache.items;

/** Codes actifs : seuls ceux-ci sont proposés et sélectionnables. */
export const catalogueActif = () => cache.items.filter((m) => m.active);

export const getMcc = (code) => cache.byCode.get(String(code ?? '').trim()) ?? null;

export const estSelectionnable = (code) => {
  const mcc = getMcc(code);
  return Boolean(mcc) && mcc.active && mcc.riskLevel !== 'INTERDIT';
};

/** Recherche plein texte, pour la sélection manuelle et l'écran d'administration. */
export function searchCatalog(term, { limit = 30, includeProhibited = true, includeInactive = false } = {}) {
  const needle = normalize(term ?? '');
  let pool = includeInactive ? catalogueComplet() : catalogueActif();
  if (!includeProhibited) pool = pool.filter((m) => m.riskLevel !== 'INTERDIT');
  if (!needle) return pool.slice(0, limit);

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
    .slice(0, limit)
    .map((r) => r.mcc);
}

/** Minuscule, sans accents ni ponctuation : la base de toute comparaison. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
