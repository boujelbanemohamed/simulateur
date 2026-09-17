import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { mccRouter } from './routes/mcc.js';
import { requestsRouter } from './routes/requests.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok', env: config.env }));
  app.use('/api/auth', authRouter);
  app.use('/api/mcc', mccRouter);
  app.use('/api/requests', requestsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
