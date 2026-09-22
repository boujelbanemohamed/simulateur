import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncRoute, entierDeRequete, idDeRoute, validate } from '../middleware/errors.js';
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
      limit: entierDeRequete(req.query.limit, { defaut: 50, min: 1, max: 200 }),
      offset: entierDeRequete(req.query.offset, { defaut: 0, min: 0, max: 1000000 }),
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
  // Le banquier administre sa banque : il saisit aussi bien qu'il arbitre. Le
  // cloisonnement entre banques reste assuré plus bas, par `getRequest`.
  requireRole('AGENT', 'BANQUIER'),
  validate(affiliationRequestSchema),
  asyncRoute(async (req, res) => {
    const created = await createRequest({ payload: req.body, user: req.user });
    res.status(201).json(created);
  })
);

requestsRouter.get(
  '/:id',
  asyncRoute(async (req, res) => res.json(await getRequest(idDeRoute(req.params.id, 'Demande'), req.user)))
);

requestsRouter.put(
  '/:id',
  requireRole('AGENT', 'BANQUIER'),
  validate(affiliationRequestUpdateSchema),
  asyncRoute(async (req, res) =>
    res.json(await updateRequest({ id: idDeRoute(req.params.id, 'Demande'), payload: req.body, user: req.user }))
  )
);

/** L'agent transmet la demande au banquier, qui peut aussi soumettre les siennes. */
requestsRouter.post(
  '/:id/submit',
  requireRole('AGENT', 'BANQUIER'),
  asyncRoute(async (req, res) =>
    res.json(await submitRequest({ id: idDeRoute(req.params.id, 'Demande'), user: req.user }))
  )
);

/** Le banquier valide (en conservant ou en modifiant les MCC), rejette ou renvoie la demande. */
requestsRouter.post(
  '/:id/decision',
  requireRole('BANQUIER'),
  validate(decisionSchema),
  asyncRoute(async (req, res) =>
    res.json(await decideRequest({ id: idDeRoute(req.params.id, 'Demande'), ...req.body, user: req.user }))
  )
);

/** Propositions figées à la soumission, telles que vues par le banquier. */
requestsRouter.get(
  '/:id/suggestions',
  asyncRoute(async (req, res) =>
    res.json(await getSuggestionsSnapshot(idDeRoute(req.params.id, 'Demande'), req.user))
  )
);

requestsRouter.get(
  '/:id/events',
  asyncRoute(async (req, res) => res.json(await getEvents(idDeRoute(req.params.id, 'Demande'), req.user)))
);
