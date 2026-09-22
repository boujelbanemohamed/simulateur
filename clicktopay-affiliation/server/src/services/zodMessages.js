import { z } from 'zod';

/**
 * Messages de validation en français.
 *
 * `z.setErrorMap` est global, mais ne s'applique qu'une fois ce module chargé :
 * posée dans un seul fichier de schéma, la carte laissait l'autre schéma
 * répondre en anglais selon l'ordre des imports. Ce module est donc importé par
 * tous les schémas, pour son effet de bord.
 */

/** Noms de types lisibles par un utilisateur, plutôt que le vocabulaire de zod. */
const TYPES = {
  string: 'texte',
  number: 'nombre',
  boolean: 'booléen (true ou false)',
  array: 'liste',
  object: 'objet',
  date: 'date',
};

z.setErrorMap((issue, ctx) => {
  if (issue.code === z.ZodIssueCode.invalid_type) {
    return {
      message:
        issue.received === 'undefined'
          ? 'Champ obligatoire'
          : `Format attendu : ${TYPES[issue.expected] ?? issue.expected}`,
    };
  }

  if (issue.code === z.ZodIssueCode.invalid_enum_value) {
    return { message: `Valeur non autorisée (attendu : ${issue.options.join(', ')})` };
  }

  // Les bornes remontaient en anglais (« String must contain at most 255
  // character(s) »), y compris dans le bandeau d'erreur affiché à l'agent.
  if (issue.code === z.ZodIssueCode.too_big) {
    if (issue.type === 'string') return { message: `${issue.maximum} caractères au maximum` };
    if (issue.type === 'array') return { message: `${issue.maximum} éléments au maximum` };
    return { message: `Valeur maximale : ${issue.maximum}` };
  }

  if (issue.code === z.ZodIssueCode.too_small) {
    if (issue.type === 'string') {
      return {
        message: issue.minimum === 1 ? 'Champ obligatoire' : `${issue.minimum} caractères au minimum`,
      };
    }
    if (issue.type === 'array') return { message: `${issue.minimum} élément(s) au minimum` };
    return { message: `Valeur minimale : ${issue.minimum}` };
  }

  if (issue.code === z.ZodIssueCode.invalid_string) {
    if (issue.validation === 'email') return { message: 'Adresse e-mail invalide' };
    return { message: 'Format invalide' };
  }

  if (issue.code === z.ZodIssueCode.not_finite) return { message: 'Nombre invalide' };
  if (issue.code === z.ZodIssueCode.invalid_union) return { message: 'Valeur non reconnue' };

  return { message: ctx.defaultError };
});
