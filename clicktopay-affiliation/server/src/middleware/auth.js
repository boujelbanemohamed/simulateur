import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { forbidden, unauthorized } from './errors.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, bankId: user.bank_id },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, email: payload.email, role: payload.role, bankId: payload.bankId };
    next();
  } catch {
    next(unauthorized('Session expirée ou jeton invalide'));
  }
}

/** Restreint l'accès à une liste de rôles. ADMIN est toujours autorisé. */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role === 'ADMIN' || roles.includes(req.user.role)) return next();
  next(forbidden(`Action réservée aux profils : ${roles.join(', ')}`));
};
