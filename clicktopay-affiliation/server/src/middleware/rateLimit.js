import { HttpError } from './errors.js';

/**
 * Limitation de débit en mémoire, destinée à la route de connexion.
 *
 * Sans elle, un compte peut être attaqué par force brute sans aucune friction,
 * et la vérification bcrypt de chaque tentative consomme du temps serveur.
 *
 * Portée : ce compteur vit dans le processus. En déploiement multi-instances, il
 * faut le déporter (Redis, ou la limitation du répartiteur de charge) — la
 * fenêtre effective serait sinon multipliée par le nombre d'instances.
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  message = 'Trop de tentatives. Réessayez dans quelques minutes.',
  keyGenerator = (req) => req.ip,
} = {}) {
  const compteurs = new Map();

  // Purge périodique : sans elle la table grossit avec chaque adresse vue.
  const purge = setInterval(() => {
    const maintenant = Date.now();
    for (const [cle, entree] of compteurs) {
      if (entree.expireLe <= maintenant) compteurs.delete(cle);
    }
  }, windowMs).unref();

  const limiter = (req, res, next) => {
    const cles = [keyGenerator(req)].flat().filter(Boolean);
    const maintenant = Date.now();

    for (const cle of cles) {
      const entree = compteurs.get(cle);
      if (!entree || entree.expireLe <= maintenant) {
        compteurs.set(cle, { total: 1, expireLe: maintenant + windowMs });
        continue;
      }
      entree.total += 1;
      if (entree.total > max) {
        const secondes = Math.ceil((entree.expireLe - maintenant) / 1000);
        res.setHeader('Retry-After', String(secondes));
        return next(new HttpError(429, message));
      }
    }
    next();
  };

  /** Une authentification réussie efface l'ardoise de l'appelant. */
  limiter.reset = (req) => {
    for (const cle of [keyGenerator(req)].flat().filter(Boolean)) compteurs.delete(cle);
  };
  limiter.stop = () => clearInterval(purge);
  return limiter;
}
