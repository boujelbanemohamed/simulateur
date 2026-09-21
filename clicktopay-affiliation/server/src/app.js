import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { asyncRoute, errorHandler, notFoundHandler } from './middleware/errors.js';
import { authenticate, requirePasswordChanged } from './middleware/auth.js';
import { assurerCatalogueCharge, catalogueEstCharge } from './services/mccCatalog.js';
import { authRouter } from './routes/auth.js';
import { mccRouter } from './routes/mcc.js';
import { requestsRouter } from './routes/requests.js';
import { adminRouter } from './routes/admin.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '1mb' }));

  // Déclaré avant le chargement du référentiel, ce contrôle doit tout de même
  // refléter l'état réel : répondre « ok » à un répartiteur de charge pendant que
  // toutes les routes métier échouent est pire que pas de contrôle du tout.
  app.get('/api/health', async (req, res) => {
    try {
      await assurerCatalogueCharge();
    } catch {
      // l'état est rapporté ci-dessous
    }
    const pret = catalogueEstCharge();
    res.status(pret ? 200 : 503).json({
      status: pret ? 'ok' : 'degraded',
      env: config.env,
      referentiel: pret ? 'charge' : 'indisponible',
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
