import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncRoute, entierDeRequete, notFound, validate } from '../middleware/errors.js';
import { catalogueActif, getMcc, searchCatalog, secteurs } from '../services/mccCatalog.js';
import { suggestForNetworks } from '../services/mccSuggestion.js';

import { suggestionProfileSchema } from '../services/requestSchema.js';

export const mccRouter = Router();

mccRouter.use(authenticate);

/** Catalogue complet ou recherche plein texte (sélection manuelle du banquier). */
mccRouter.get('/', (req, res) => {
  const { search = '', limit = 30, eligibleOnly } = req.query;
  const results = searchCatalog(search, {
    limit: entierDeRequete(limit, { defaut: 30, min: 1, max: 300 }),
    includeProhibited: eligibleOnly !== 'true',
  });
  res.json({ total: catalogueActif().length, count: results.length, items: results });
});

mccRouter.get('/secteurs', (req, res) =>
  res.json(secteurs().map(({ key, label, mccs }) => ({ key, label, mccs })))
);

mccRouter.get('/:code', (req, res) => {
  const mcc = getMcc(req.params.code);
  if (!mcc || !mcc.active) throw notFound(`MCC ${req.params.code} introuvable`);
  res.json(mcc);
});

/**
 * Proposition de MCC Visa et Mastercard pour une activité donnée.
 * Appelée à la volée pendant la saisie du formulaire.
 */
mccRouter.post(
  '/suggest',
  validate(suggestionProfileSchema),
  asyncRoute(async (req, res) => {
    const { limit, ...profile } = req.body;
    res.json(suggestForNetworks(profile, limit ? { limit } : undefined));
  })
);
