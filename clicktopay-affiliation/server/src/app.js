import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { asyncRoute, errorHandler, notFoundHandler } from './middleware/errors.js';
import { authenticate, requirePasswordChanged } from './middleware/auth.js';
import { assurerCatalogueCharge, etatCatalogue } from './services/mccCatalog.js';
import { authRouter } from './routes/auth.js';
import { mccRouter } from './routes/mcc.js';
import { requestsRouter } from './routes/requests.js';
import { adminRouter } from './routes/admin.js';
import { query } from './db/pool.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '1mb' }));

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
