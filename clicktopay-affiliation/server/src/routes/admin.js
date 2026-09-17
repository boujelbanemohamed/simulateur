import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncRoute, validate } from '../middleware/errors.js';
import {
  createBankSchema, createMccSchema, createUserSchema, importMccSchema,
  resetPasswordSchema, updateBankSchema, updateMccSchema, updateUserSchema,
} from '../services/adminSchema.js';
import {
  createBank, createUser, getUser, listAdminEvents, listBanks, listUsers,
  resetPassword, updateBank, updateUser,
} from '../services/admin.js';
import { createMcc, getMccHistory, importCatalog, updateMcc } from '../services/mccAdmin.js';
import { catalogueComplet, getMcc, searchCatalog } from '../services/mccCatalog.js';
import { notFound } from '../middleware/errors.js';

export const adminRouter = Router();

// Tout /api/admin est réservé au profil ADMIN.
adminRouter.use(authenticate, requireRole('ADMIN'));

// ---------------------------------------------------------------- Utilisateurs

adminRouter.get(
  '/users',
  asyncRoute(async (req, res) =>
    res.json({ items: await listUsers({ search: req.query.search, bankId: req.query.bankId, role: req.query.role }) })
  )
);

adminRouter.get('/users/:id', asyncRoute(async (req, res) => res.json(await getUser(Number(req.params.id)))));

adminRouter.post(
  '/users',
  validate(createUserSchema),
  asyncRoute(async (req, res) =>
    res.status(201).json(await createUser({ payload: req.body, user: req.user }))
  )
);

adminRouter.put(
  '/users/:id',
  validate(updateUserSchema),
  asyncRoute(async (req, res) =>
    res.json(await updateUser({ id: Number(req.params.id), payload: req.body, user: req.user }))
  )
);

adminRouter.post(
  '/users/:id/password',
  validate(resetPasswordSchema),
  asyncRoute(async (req, res) =>
    res.json(await resetPassword({ id: Number(req.params.id), password: req.body.password, user: req.user }))
  )
);

// --------------------------------------------------------------------- Banques

adminRouter.get('/banks', asyncRoute(async (req, res) => res.json({ items: await listBanks() })));

adminRouter.post(
  '/banks',
  validate(createBankSchema),
  asyncRoute(async (req, res) =>
    res.status(201).json(await createBank({ payload: req.body, user: req.user }))
  )
);

adminRouter.put(
  '/banks/:id',
  validate(updateBankSchema),
  asyncRoute(async (req, res) =>
    res.json(await updateBank({ id: Number(req.params.id), payload: req.body, user: req.user }))
  )
);

// ------------------------------------------------------------------ Référentiel

/** Vue administrateur : inclut les codes désactivés et interdits. */
adminRouter.get('/mcc', (req, res) => {
  const { search = '', limit = 50 } = req.query;
  const items = searchCatalog(search, {
    limit: Math.min(Number(limit) || 50, 300),
    includeProhibited: true,
    includeInactive: true,
  });
  const complet = catalogueComplet();
  res.json({
    total: complet.length,
    actifs: complet.filter((m) => m.active).length,
    count: items.length,
    items,
  });
});

adminRouter.get('/mcc/:code', (req, res) => {
  const mcc = getMcc(req.params.code);
  if (!mcc) throw notFound(`MCC ${req.params.code} introuvable`);
  res.json(mcc);
});

adminRouter.get(
  '/mcc/:code/history',
  asyncRoute(async (req, res) => res.json(await getMccHistory(req.params.code)))
);

adminRouter.post(
  '/mcc',
  validate(createMccSchema),
  asyncRoute(async (req, res) =>
    res.status(201).json(await createMcc({ payload: req.body, user: req.user }))
  )
);

adminRouter.put(
  '/mcc/:code',
  validate(updateMccSchema),
  asyncRoute(async (req, res) =>
    res.json(await updateMcc({ code: req.params.code, payload: req.body, user: req.user }))
  )
);

/**
 * Import d'une nouvelle édition du référentiel.
 * Sans `apply`, la route ne renvoie que le rapport d'écart : rien n'est modifié.
 */
adminRouter.post(
  '/mcc/import',
  validate(importMccSchema),
  asyncRoute(async (req, res) => res.json(await importCatalog({ ...req.body, user: req.user })))
);

// ------------------------------------------------------------------ Journal

adminRouter.get(
  '/events',
  asyncRoute(async (req, res) =>
    res.json({ items: await listAdminEvents({ limit: Number(req.query.limit) || 100 }) })
  )
);
