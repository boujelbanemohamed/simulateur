import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncRoute, validate } from '../middleware/errors.js';
import {
  affiliationRequestSchema,
  affiliationRequestUpdateSchema,
  decisionSchema,
} from '../services/requestSchema.js';
import {
  createRequest,
  decideRequest,
  getEvents,
  getRequest,
  getStats,
  getSuggestionsSnapshot,
  listRequests,
  submitRequest,
  updateRequest,
} from '../services/requests.js';

export const requestsRouter = Router();

requestsRouter.use(authenticate);

requestsRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const items = await listRequests({
      user: req.user,
      status: req.query.status,
      search: req.query.search,
      mine: req.query.mine === 'true',
      limit: Math.min(Number(req.query.limit) || 50, 200),
      offset: Number(req.query.offset) || 0,
    });
    res.json({ count: items.length, items });
  })
);

requestsRouter.get(
  '/stats',
  asyncRoute(async (req, res) => res.json(await getStats(req.user)))
);

requestsRouter.post(
  '/',
  requireRole('AGENT'),
  validate(affiliationRequestSchema),
  asyncRoute(async (req, res) => {
    const created = await createRequest({ payload: req.body, user: req.user });
    res.status(201).json(created);
  })
);

requestsRouter.get(
  '/:id',
  asyncRoute(async (req, res) => res.json(await getRequest(Number(req.params.id), req.user)))
);

requestsRouter.put(
  '/:id',
  requireRole('AGENT'),
  validate(affiliationRequestUpdateSchema),
  asyncRoute(async (req, res) =>
    res.json(await updateRequest({ id: Number(req.params.id), payload: req.body, user: req.user }))
  )
);

/** L'agent transmet la demande au banquier. */
requestsRouter.post(
  '/:id/submit',
  requireRole('AGENT'),
  asyncRoute(async (req, res) =>
    res.json(await submitRequest({ id: Number(req.params.id), user: req.user }))
  )
);

/** Le banquier valide (en conservant ou en modifiant les MCC), rejette ou renvoie la demande. */
requestsRouter.post(
  '/:id/decision',
  requireRole('BANQUIER'),
  validate(decisionSchema),
  asyncRoute(async (req, res) =>
    res.json(await decideRequest({ id: Number(req.params.id), ...req.body, user: req.user }))
  )
);

/** Propositions figées à la soumission, telles que vues par le banquier. */
requestsRouter.get(
  '/:id/suggestions',
  asyncRoute(async (req, res) =>
    res.json(await getSuggestionsSnapshot(Number(req.params.id), req.user))
  )
);

requestsRouter.get(
  '/:id/events',
  asyncRoute(async (req, res) => res.json(await getEvents(Number(req.params.id), req.user)))
);
