import { z } from 'zod';
import { clesSecteurs } from './mccCatalog.js';
import { MONTANT_MAX, booleen, dateCalendaire, sansCaracteresDeControle } from './zodHelpers.js';
import './zodMessages.js';

const trimmed = (max) => sansCaracteresDeControle(z.string().trim().max(max));
const requiredText = (max, champ) =>
  trimmed(max).min(1, `${champ} est obligatoire`);
// `.optional()` enveloppe la transformation : un champ absent reste absent et
// n'écrase rien lors d'une mise à jour partielle.
const optionalText = (max) =>
  trimmed(max)
    .nullable()
    .transform((v) => (v === '' ? null : v))
    .optional();
const optionalNumber = z.coerce
  .number()
  .finite('Montant invalide')
  .nonnegative('La valeur doit être positive')
  .max(MONTANT_MAX, 'Montant trop élevé')
  .nullable()
  .optional();
const optionalDate = dateCalendaire()
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

/** Le référentiel des secteurs vit en base : la validation le lit à l'exécution. */
const secteurValide = () =>
  z
    .string()
    .trim()
    .max(40)
    .refine((v) => clesSecteurs().includes(v), 'Secteur inconnu')
    .or(z.literal('').transform(() => null));

const mccCode = z
  .string()
  .regex(/^\d{4}$/, 'Un MCC est composé de 4 chiffres')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null));

/** Corps attendu à la création et à la mise à jour d'une demande d'affiliation. */
export const affiliationRequestSchema = z.object({
  // Site marchand
  siteName: requiredText(160, 'Le nom du site'),
  siteUrl: trimmed(255)
    .min(1, "L'adresse du site est obligatoire")
    .refine(
      (v) => /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(v),
      "L'adresse du site doit être une URL valide (https://...)"
    ),
  siteLanguages: optionalText(120),

  // Société
  companyName: requiredText(160, 'La raison sociale'),
  legalForm: optionalText(40),
  rne: trimmed(32)
    .min(1, 'Le RNE est obligatoire')
    .regex(/^[A-Za-z0-9-]{6,32}$/, 'Le RNE doit comporter 6 à 32 caractères alphanumériques'),
  taxId: optionalText(32),
  companyCreatedOn: optionalDate,
  shareCapital: optionalNumber,

  // Contact
  contactFirstName: requiredText(80, 'Le prénom du contact'),
  contactLastName: requiredText(80, 'Le nom du contact'),
  contactEmail: trimmed(160).email('Adresse e-mail invalide'),
  contactPhone: trimmed(32)
    .min(6, 'Numéro de téléphone trop court')
    .regex(/^[+0-9 ().-]{6,32}$/, 'Numéro de téléphone invalide'),

  // Adresse physique
  addressLine1: requiredText(180, "L'adresse"),
  addressLine2: optionalText(180),
  city: requiredText(80, 'La ville'),
  postalCode: optionalText(16),
  governorate: optionalText(80),
  country: trimmed(80).default('Tunisie'),

  // Activité
  // Validé contre les secteurs réellement chargés, et non contre une liste figée.
  activitySector: secteurValide().nullable().optional(),
  activityDescription: trimmed(2000).min(
    20,
    "Décrivez l'activité en 20 caractères minimum : ce texte alimente la proposition de MCC"
  ),
  productTypes: optionalText(1000),
  deliveryMode: z.enum(['PHYSIQUE', 'NUMERIQUE', 'SERVICE', 'MIXTE']).default('PHYSIQUE'),
  hasSubscription: booleen().default(false),
  isMarketplace: booleen().default(false),
  sellsAbroad: booleen().default(false),
  averageBasket: optionalNumber,
  monthlyVolume: optionalNumber,
  currency: trimmed(3).default('TND'),

  // Coordonnées bancaires
  rib: optionalText(24),
  accountHolder: optionalText(160),
  bankAgency: optionalText(120),

  // MCC retenus par l'agent (issus ou non des propositions du moteur)
  proposedVisaMcc: mccCode,
  proposedMastercardMcc: mccCode,
  proposedJustification: optionalText(1000),
});

/** Mise à jour partielle : tous les champs deviennent optionnels. */
export const affiliationRequestUpdateSchema = affiliationRequestSchema.partial();

export const decisionSchema = z.object({
  decision: z.enum(['VALIDEE', 'REJETEE', 'COMPLEMENT_REQUIS']),
  visaMcc: mccCode,
  mastercardMcc: mccCode,
  comment: optionalText(1000),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Le mot de passe est obligatoire'),
});

/** Profil accepté par /api/mcc/suggest (suggestion à la volée pendant la saisie). */
export const suggestionProfileSchema = z.object({
  activityDescription: trimmed(2000).default(''),
  productTypes: trimmed(1000).default(''),
  siteName: trimmed(160).default(''),
  siteUrl: trimmed(255).default(''),
  companyName: trimmed(160).default(''),
  activitySector: secteurValide().nullable().optional(),
  deliveryMode: z.enum(['PHYSIQUE', 'NUMERIQUE', 'SERVICE', 'MIXTE']).default('PHYSIQUE'),
  hasSubscription: booleen().default(false),
  isMarketplace: booleen().default(false),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
