import { z } from 'zod';
import { booleen, entier } from './zodHelpers.js';

const texte = (max) => z.string().trim().max(max);
// L'ordre compte : `.optional()` doit envelopper la transformation, sinon un
// champ absent du corps est transformé en null explicite et écrase la valeur
// existante lors d'une mise à jour partielle.
const optionnel = (max) =>
  texte(max)
    .nullable()
    .transform((v) => (v === '' ? null : v))
    .optional();

// Politique de mot de passe : longueur d'abord, puis diversité de caractères.
export const motDePasse = z
  .string()
  .min(10, 'Le mot de passe doit comporter au moins 10 caractères')
  .max(128, 'Mot de passe trop long')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
    message: 'Le mot de passe doit contenir une minuscule, une majuscule et un chiffre',
  });

export const ROLES = ['AGENT', 'BANQUIER', 'ADMIN'];

export const createUserSchema = z.object({
  email: texte(160).email('Adresse e-mail invalide'),
  firstName: texte(80).min(1, 'Le prénom est obligatoire'),
  lastName: texte(80).min(1, 'Le nom est obligatoire'),
  role: z.enum(ROLES),
  bankId: entier({ min: 1 }),
  password: motDePasse,
});

export const updateUserSchema = z
  .object({
    email: texte(160).email('Adresse e-mail invalide').optional(),
    firstName: texte(80).min(1).optional(),
    lastName: texte(80).min(1).optional(),
    role: z.enum(ROLES).optional(),
    bankId: entier({ min: 1 }).optional(),
    active: booleen().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie' });

export const resetPasswordSchema = z.object({ password: motDePasse });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Le mot de passe actuel est obligatoire'),
  newPassword: motDePasse,
});

export const createBankSchema = z.object({
  code: texte(16)
    .min(2, 'Code banque trop court')
    .regex(/^[A-Za-z0-9-]{2,16}$/, 'Code banque alphanumérique, 2 à 16 caractères'),
  name: texte(160).min(2, 'Nom de la banque obligatoire'),
});

export const updateBankSchema = z
  .object({
    name: texte(160).min(2).optional(),
    active: booleen().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie' });

const listeTextes = (max) => z.array(texte(max)).max(200).optional();

const champsMcc = {
  label: texte(255).min(2, 'Le libellé est obligatoire'),
  description: texte(2000).min(10, 'La description doit être exploitable par le banquier'),
  labelEn: optionnel(255),
  descriptionEn: optionnel(2000),
  keywords: listeTextes(120),
  similar: z.array(z.string().regex(/^\d{4}$/)).max(50).optional(),
  ecommerceRelevance: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  riskLevel: z.enum(['STANDARD', 'SENSIBLE', 'INTERDIT']).optional(),
  note: optionnel(1000),
  networks: z.array(z.enum(['VISA', 'MASTERCARD'])).min(1).optional(),
};

export const createMccSchema = z.object({
  code: z.string().regex(/^\d{4}$/, 'Un MCC est composé de 4 chiffres'),
  ...champsMcc,
  source: optionnel(160),
  comment: optionnel(1000),
});

export const updateMccSchema = z
  .object({
    label: champsMcc.label.optional(),
    description: champsMcc.description.optional(),
    labelEn: champsMcc.labelEn,
    descriptionEn: champsMcc.descriptionEn,
    keywords: champsMcc.keywords,
    similar: champsMcc.similar,
    ecommerceRelevance: champsMcc.ecommerceRelevance,
    riskLevel: champsMcc.riskLevel,
    note: champsMcc.note,
    networks: champsMcc.networks,
    active: booleen().optional(),
    comment: optionnel(1000),
  })
  .refine((v) => Object.keys(v).filter((k) => k !== 'comment').length > 0, {
    message: 'Aucune modification fournie',
  });

/**
 * Une ligne du fichier importé. Chaque champ est validé ici, et pas seulement le
 * code : sans cela, une valeur hors énumération ou un libellé trop long passe la
 * simulation, affiche un rapport d'écart rassurant, puis fait échouer
 * l'application en erreur 500 sans désigner la ligne fautive.
 */
const entreeImportSchema = z.object({
  code: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  label: texte(255).optional(),
  description: texte(2000).optional(),
  labelEn: texte(255).optional(),
  descriptionEn: texte(2000).optional(),
  keywords: listeTextes(120),
  similar: z.array(z.string().regex(/^\d{4}$/)).max(50).optional(),
  ecommerceRelevance: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  riskLevel: z.enum(['STANDARD', 'SENSIBLE', 'INTERDIT']).optional(),
  note: texte(1000).optional(),
  networks: z.array(z.enum(['VISA', 'MASTERCARD'])).min(1).optional(),
  source: texte(160).optional(),
});

export const importMccSchema = z.object({
  // Une édition complète du manuel : quelques centaines de codes.
  entrees: z.array(entreeImportSchema)
    .min(1, 'Le fichier importé est vide')
    .max(2000, 'Fichier trop volumineux (2000 codes maximum)'),
  // Drapeaux gouvernant une opération destructrice : strictement booléens.
  apply: booleen().default(false),
  deactivateMissing: booleen().default(false),
  comment: optionnel(1000),
});
