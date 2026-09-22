import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { HttpError, asyncRoute, badRequest, errorHandler, notFoundHandler } from './middleware/errors.js';
import { authenticate, requirePasswordChanged } from './middleware/auth.js';
import { assurerCatalogueCharge, etatCatalogue } from './services/mccCatalog.js';
import { authRouter } from './routes/auth.js';
import { mccRouter } from './routes/mcc.js';
import { requestsRouter } from './routes/requests.js';
import { adminRouter } from './routes/admin.js';
import { query } from './db/pool.js';

/** Taille maximale d'un corps JSON, en clair pour le message d'erreur. */
const TAILLE_MAXIMALE = '1mb';

/**
 * Erreurs levées par l'analyseur de corps, AVANT le gestionnaire d'erreurs.
 *
 * `express.json()` répond de lui-même en 400 avec le texte de son analyseur, qui
 * cite un extrait du corps reçu et une position de caractère : sur une route
 * d'authentification, c'est un fragment de saisie utilisateur renvoyé tel quel.
 * On substitue un message stable, en français, et rien d'autre.
 */
// eslint-disable-next-line no-unused-vars -- Express identifie le handler d'erreur à ses 4 arguments
function corpsInexploitable(err, req, res, next) {
  if (!err || !err.type) return next(err);
  if (err.type === 'entity.parse.failed') {
    return next(badRequest("Le corps de la requête n'est pas un JSON valide."));
  }
  if (err.type === 'entity.too.large') {
    return next(new HttpError(413, 'Le corps de la requête dépasse la taille autorisée (1 Mo).'));
  }
  if (err.type === 'encoding.unsupported' || err.type === 'charset.unsupported') {
    return next(new HttpError(415, 'Type de contenu non pris en charge : JSON attendu.'));
  }
  return next(err);
}

/**
 * Un corps transmis dans un autre format que JSON n'est pas analysé par
 * `express.json()`, qui le laisse simplement passer : la route répondait alors
 * « Données invalides » sur des champs pourtant renseignés, ce qui n'aide
 * personne. Le téléversement de fichier, lui, est en multipart et reste admis.
 */
function typeDeContenuAttendu(req, res, next) {
  const aUnCorps = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'];
  if (!aUnCorps) return next();
  if (req.is('json') || req.is('multipart/form-data')) return next();
  return next(new HttpError(415, 'Type de contenu non pris en charge : JSON attendu.'));
}

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: TAILLE_MAXIMALE }));
  app.use(corpsInexploitable);
  app.use(typeDeContenuAttendu);

  // Ce contrôle doit refléter l'état RÉEL de l'instance. Se contenter de
  // « un catalogue est en mémoire » répondait « ok » pendant une panne de base :
  // le cache gardait une photo d'il y a deux heures, le répartiteur laissait
  // l'instance en rotation, et toutes les routes métier répondaient 500.
  // On interroge donc la base à chaque appel, et on regarde l'issue du DERNIER
  // rechargement, pas seulement le fait qu'un chargement ait réussi un jour.
  app.get('/api/health', async (req, res) => {
    try {
      await assurerCatalogueCharge();
    } catch {
      // l'échec est déjà mémorisé par le service ; il est rapporté ci-dessous
    }

    let base = 'joignable';
    try {
      await query('SELECT 1');
    } catch (err) {
      base = 'injoignable';
      console.error('Contrôle de santé : base injoignable —', err.message);
    }

    const catalogue = etatCatalogue();
    // Un rechargement raté laisse le cache en place : on sert encore, mais en
    // dégradé, car le référentiel servi n'est plus celui de la base.
    const referentiel = !catalogue.charge ? 'indisponible' : catalogue.echec ? 'perime' : 'charge';
    const pret = referentiel === 'charge' && base === 'joignable';

    res.status(pret ? 200 : 503).json({
      status: pret ? 'ok' : 'degraded',
      env: config.env,
      base,
      referentiel,
      // Une écoute perdue ne dégrade pas l'instance — elle sert encore — mais
      // l'exploitation doit la voir : le référentiel servi peut être figé.
      ecoute: catalogue.ecoute,
      codes: catalogue.codes,
      chargeLe: catalogue.chargeLe,
      ...(catalogue.echec ? { dernierEchec: catalogue.echec } : {}),
    });
  });

  // Le référentiel vit en base : on garantit son chargement avant toute route métier.
  app.use(asyncRoute(async (req, res, next) => {
    await assurerCatalogueCharge();
    next();
  }));

  // /api/auth reste joignable : c'est par là qu'on change un mot de passe expiré.
  app.use('/api/auth', authRouter);

  app.use(authenticate, requirePasswordChanged);
  app.use('/api/mcc', mccRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
