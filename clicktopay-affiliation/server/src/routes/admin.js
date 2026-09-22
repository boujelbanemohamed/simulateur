import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncRoute, entierDeRequete, idDeRoute, validate } from '../middleware/errors.js';
import {
  createBankSchema, createMccSchema, createUserSchema, importMccSchema,
  resetPasswordSchema, updateBankSchema, updateMccSchema, updateUserSchema,
} from '../services/adminSchema.js';
import {
  createBank, createUser, getUserAdministrable, listAdminEvents, listBanks, listUsers,
  resetPassword, updateBank, updateUser,
} from '../services/admin.js';
import { createMcc, getMccHistory, importCatalog, updateMcc } from '../services/mccAdmin.js';
import { catalogueComplet, getMcc, searchCatalog } from '../services/mccCatalog.js';
import { HttpError, badRequest, notFound } from '../middleware/errors.js';
import { ecrireReferentiel, lireReferentiel } from '../services/mccImportFile.js';

/**
 * Le fichier reste en mémoire : une édition du manuel pèse quelques centaines de
 * kilo-octets et n'a pas vocation à être conservée sur disque.
 */
const televersement = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, fichier, callback) => {
    if (/\.(xlsx|csv|json)$/i.test(fichier.originalname)) return callback(null, true);
    callback(badRequest('Format non pris en charge : attendu .xlsx, .csv ou .json.'));
  },
});

/**
 * Erreurs produites par multer lui-même (taille dépassée, champ inattendu).
 *
 * Elles portent un code propre mais aucun statut HTTP : elles tombaient dans le
 * gestionnaire d'erreurs avec `status` indéfini, et sortaient en 500 là où un
 * refus explicite est attendu. Les erreurs du filtre d'extension, elles, sont
 * déjà des HttpError et traversent ce point sans être touchées.
 */
// eslint-disable-next-line no-unused-vars -- Express identifie le handler d'erreur à ses 4 arguments
function erreursDeTeleversement(err, req, res, next) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return next(new HttpError(413, 'Le fichier dépasse la taille autorisée (5 Mo).'));
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return next(
      badRequest('Champ de fichier inattendu : le fichier doit être transmis sous le nom « fichier ».')
    );
  }
  return next(err);
}

export const adminRouter = Router();

// L'administration est ouverte au banquier, qui tient sa banque, et à
// l'administrateur, qui tient la plateforme. Le partage se fait ensuite : les
// routes marquées `reserveAAdministrateur` portent sur des ressources communes à
// toutes les banques, et n'appartiennent donc à aucun banquier.
adminRouter.use(authenticate, requireRole('ADMIN', 'BANQUIER'));

/**
 * Réserve une route au seul administrateur.
 *
 * Le référentiel MCC est partagé par toutes les banques : un banquier qui
 * désactiverait un code le retirerait à ses concurrents. La création de banques
 * relève de la même logique.
 */
const reserveAAdministrateur = requireRole('ADMIN');

// ---------------------------------------------------------------- Utilisateurs

adminRouter.get(
  '/users',
  asyncRoute(async (req, res) =>
    res.json({
      items: await listUsers({
        search: req.query.search, bankId: req.query.bankId, role: req.query.role, user: req.user,
      }),
    })
  )
);

adminRouter.get(
  '/users/:id',
  asyncRoute(async (req, res) =>
    res.json(await getUserAdministrable(idDeRoute(req.params.id, 'Identifiant'), req.user))
  )
);

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
    res.json(await updateUser({ id: idDeRoute(req.params.id, 'Identifiant'), payload: req.body, user: req.user }))
  )
);

adminRouter.post(
  '/users/:id/password',
  validate(resetPasswordSchema),
  asyncRoute(async (req, res) =>
    res.json(await resetPassword({ id: idDeRoute(req.params.id, 'Identifiant'), password: req.body.password, user: req.user }))
  )
);

// --------------------------------------------------------------------- Banques

adminRouter.get('/banks', asyncRoute(async (req, res) => res.json({ items: await listBanks(req.user) })));

adminRouter.post(
  '/banks',
  reserveAAdministrateur,
  validate(createBankSchema),
  asyncRoute(async (req, res) =>
    res.status(201).json(await createBank({ payload: req.body, user: req.user }))
  )
);

adminRouter.put(
  '/banks/:id',
  validate(updateBankSchema),
  asyncRoute(async (req, res) =>
    res.json(await updateBank({ id: idDeRoute(req.params.id, 'Identifiant'), payload: req.body, user: req.user }))
  )
);

// ------------------------------------------------------------------ Référentiel

/** Vue administrateur : inclut les codes désactivés et interdits. */
adminRouter.get('/mcc', reserveAAdministrateur, (req, res) => {
  const { search = '', limit = 50 } = req.query;
  const items = searchCatalog(search, {
    limit: entierDeRequete(limit, { defaut: 50, min: 1, max: 300 }),
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

/** Export du référentiel courant : point de départ du cycle télécharger → corriger → réimporter. */
adminRouter.get(
  '/mcc/export',
  reserveAAdministrateur,
  asyncRoute(async (req, res) => {
    const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
    const codes = req.query.actifsSeuls === 'true'
      ? catalogueComplet().filter((m) => m.active)
      : catalogueComplet();
    const contenu = await ecrireReferentiel(codes, format);
    const jour = new Date().toISOString().slice(0, 10);

    res.setHeader(
      'Content-Type',
      format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="referentiel-mcc-${jour}.${format}"`);
    res.send(contenu);
  })
);

// Déclaré après /mcc/export : sinon « export » serait capturé comme un code.
adminRouter.get('/mcc/:code', reserveAAdministrateur, (req, res) => {
  const mcc = getMcc(req.params.code);
  if (!mcc) throw notFound(`MCC ${req.params.code} introuvable`);
  res.json(mcc);
});

adminRouter.get(
  '/mcc/:code/history',
  reserveAAdministrateur,
  asyncRoute(async (req, res) => res.json(await getMccHistory(req.params.code)))
);

adminRouter.post(
  '/mcc',
  reserveAAdministrateur,
  validate(createMccSchema),
  asyncRoute(async (req, res) =>
    res.status(201).json(await createMcc({ payload: req.body, user: req.user }))
  )
);

adminRouter.put(
  '/mcc/:code',
  reserveAAdministrateur,
  validate(updateMccSchema),
  asyncRoute(async (req, res) =>
    res.json(await updateMcc({ code: req.params.code, payload: req.body, user: req.user }))
  )
);

/**
 * Lecture d'un fichier Excel ou CSV. Cette route ne modifie rien : elle renvoie
 * les lignes normalisées, les anomalies de lecture et le rapport d'écart, que
 * l'administrateur examine avant de confirmer l'application.
 */
adminRouter.post(
  '/mcc/import-fichier',
  reserveAAdministrateur,
  televersement.single('fichier'),
  erreursDeTeleversement,
  asyncRoute(async (req, res) => {
    if (!req.file) throw badRequest('Aucun fichier reçu.');

    let lecture;
    try {
      lecture = /\.json$/i.test(req.file.originalname)
        ? { ...lireJson(req.file.buffer), anomalies: [], colonnesIgnorees: [] }
        : await lireReferentiel(req.file.buffer, req.file.originalname);
    } catch (err) {
      throw badRequest(`Fichier illisible : ${err.message}`);
    }

    // Simulation systématique : le rapport d'écart est produit sans écriture.
    const rapport = await importCatalog({ entrees: lecture.entrees, apply: false, user: req.user });
    res.json({ fichier: req.file.originalname, ...lecture, rapport });
  })
);

/** Compatibilité : un référentiel fourni en JSON reste accepté. */
function lireJson(buffer) {
  const donnees = JSON.parse(buffer.toString('utf8'));
  const entrees = Array.isArray(donnees) ? donnees : donnees.entrees ?? donnees.items;
  if (!Array.isArray(entrees)) throw new Error('le fichier doit contenir un tableau de codes MCC');
  return { entrees, colonnesDetectees: ['json'], lignesLues: entrees.length };
}

/**
 * Import d'une nouvelle édition du référentiel.
 * Sans `apply`, la route ne renvoie que le rapport d'écart : rien n'est modifié.
 */
adminRouter.post(
  '/mcc/import',
  reserveAAdministrateur,
  validate(importMccSchema),
  asyncRoute(async (req, res) => res.json(await importCatalog({ ...req.body, user: req.user })))
);

// ------------------------------------------------------------------ Journal

adminRouter.get(
  '/events',
  asyncRoute(async (req, res) =>
    res.json(
      await listAdminEvents({
        limit: entierDeRequete(req.query.limit, { defaut: 100, min: 1, max: 500 }),
        // Sans décalage, les entrées les plus anciennes deviennent
        // inatteignables par l'application dès la 500e ligne.
        offset: entierDeRequete(req.query.offset, { defaut: 0, min: 0, max: 1000000 }),
        entity: req.query.entity,
        action: req.query.action,
        depuis: req.query.depuis,
        jusqua: req.query.jusqua,
        user: req.user,
      })
    )
  )
);
