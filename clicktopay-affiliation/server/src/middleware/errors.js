export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const unauthorized = (message = 'Authentification requise') => new HttpError(401, message);
export const forbidden = (message = 'Accès refusé') => new HttpError(403, message);
export const notFound = (message = 'Ressource introuvable') => new HttpError(404, message);
export const conflict = (message) => new HttpError(409, message);

/** Encapsule un handler async pour router les rejets vers errorHandler. */
export const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export const notFoundHandler = (req, res) =>
  res.status(404).json({ error: `Route inconnue : ${req.method} ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars -- Express identifie le handler d'erreur à ses 4 arguments
export function errorHandler(err, req, res, next) {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Erreur interne du serveur' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}

/**
 * Identifiant de route : `Number('abc')` vaut NaN et partait jusqu'à PostgreSQL,
 * qui répondait par une erreur 500 au lieu d'un 400 explicite.
 */
export function idDeRoute(valeur, nom = 'identifiant') {
  const nombre = Number(valeur);
  if (!Number.isInteger(nombre) || nombre < 1 || nombre > 2147483647) {
    throw badRequest(`${nom} invalide : « ${valeur} »`);
  }
  return nombre;
}

/** Entier de requête borné (pagination, limites) : jamais négatif, jamais NaN. */
export function entierDeRequete(valeur, { defaut, min = 0, max }) {
  if (valeur === undefined || valeur === '') return defaut;
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return defaut;
  return Math.min(Math.max(Math.trunc(nombre), min), max);
}

/** Valide `req.body` avec un schéma zod et remplace le corps par la valeur typée. */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(
      badRequest(
        'Données invalides',
        result.error.issues.map((i) => ({ champ: i.path.join('.'), message: i.message }))
      )
    );
  }
  req.body = result.data;
  next();
};
