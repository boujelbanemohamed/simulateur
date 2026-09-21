import { z } from 'zod';

/**
 * Booléen sûr.
 *
 * `z.coerce.boolean()` applique `Boolean(v)` : la chaîne "false" vaut donc true,
 * tout comme "0". Sur des drapeaux qui gouvernent une désactivation ou un import
 * destructeur, c'est un piège. Ici seules les valeurs explicitement vraies ou
 * fausses sont acceptées, et tout le reste est rejeté.
 */
const VRAI = new Set(['true', '1', 'oui', 'on', 'yes']);
const FAUX = new Set(['false', '0', 'non', 'off', 'no', '']);

export const booleen = () =>
  z.preprocess((valeur) => {
    if (typeof valeur === 'boolean') return valeur;
    if (typeof valeur === 'number') {
      if (valeur === 1) return true;
      if (valeur === 0) return false;
      return valeur; // laissé tel quel : z.boolean() le rejettera
    }
    if (typeof valeur === 'string') {
      const cle = valeur.trim().toLowerCase();
      if (VRAI.has(cle)) return true;
      if (FAUX.has(cle)) return false;
    }
    return valeur;
  }, z.boolean({ invalid_type_error: 'Valeur booléenne attendue (true ou false)' }));

/** Entier borné : refuse NaN, l'infini et les valeurs hors plage. */
export const entier = ({ min, max, defaut } = {}) => {
  let schema = z.coerce
    .number({ invalid_type_error: 'Nombre entier attendu' })
    .int('Nombre entier attendu')
    .finite('Nombre entier attendu');
  if (min !== undefined) schema = schema.min(min, `Valeur minimale : ${min}`);
  if (max !== undefined) schema = schema.max(max, `Valeur maximale : ${max}`);
  return defaut === undefined ? schema : schema.default(defaut);
};

/**
 * Date calendaire réellement valide. Le simple motif AAAA-MM-JJ laisse passer
 * 2026-02-30 ou 9999-99-99, que PostgreSQL rejette ensuite par une erreur 500.
 */
export const dateCalendaire = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
    .refine((v) => {
      const [a, m, j] = v.split('-').map(Number);
      if (a < 1900 || a > 2200 || m < 1 || m > 12 || j < 1 || j > 31) return false;
      const d = new Date(Date.UTC(a, m - 1, j));
      return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
    }, 'Date inexistante au calendrier');

/**
 * Texte destiné à PostgreSQL : l'octet NUL fait échouer l'insertion en UTF-8
 * (« invalid byte sequence »), et les autres caractères de contrôle n'ont rien à
 * faire dans une saisie. La contrainte est posée en `regex` et non en `refine`
 * pour que le schéma reste un `ZodString` chaînable (`.min()`, `.email()`…).
 */
const CARACTERES_DE_CONTROLE = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/;

export const sansCaracteresDeControle = (schema) =>
  schema.regex(CARACTERES_DE_CONTROLE, 'Caractères de contrôle non autorisés');

/** Décimal borné par la capacité de la colonne NUMERIC(14,3). */
export const MONTANT_MAX = 99999999999.999;
