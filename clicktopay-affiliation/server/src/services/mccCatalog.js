import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const catalogPath = fileURLToPath(new URL('../../data/mcc-catalog.json', import.meta.url));

/** @type {Array<object>} */
export const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

const byCode = new Map(catalog.map((mcc) => [mcc.code, mcc]));

export const getMcc = (code) => byCode.get(String(code ?? '').trim()) ?? null;

export const isEligible = (code) => {
  const mcc = getMcc(code);
  return Boolean(mcc) && mcc.riskLevel !== 'INTERDIT';
};

/** Recherche plein texte simple, pour la sélection manuelle par le banquier. */
export function searchCatalog(term, { limit = 30, includeProhibited = true } = {}) {
  const needle = normalize(term ?? '');
  const pool = includeProhibited ? catalog : catalog.filter((m) => m.riskLevel !== 'INTERDIT');
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
