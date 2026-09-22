import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { asyncRoute, forbidden, unauthorized } from './errors.js';

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      bankId: user.bank_id,
      // Empreinte du mot de passe sous lequel le jeton a été émis. Comparer des
      // horodatages ne convenait pas : `iat` est arrondi à la seconde (un jeton
      // émis dans la même seconde qu'une réinitialisation passait au travers) et
      // il mêlait l'horloge de Node à celle de PostgreSQL, deux référentiels qui
      // dérivent. Cette empreinte est comparée à l'identique, sans notion de temps.
      pwd: user.password_changed_at ? new Date(user.password_changed_at).toISOString() : null,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/**
 * Authentifie la requête.
 *
 * Le jeton n'est qu'une preuve d'identité : le rôle, la banque et l'état du
 * compte sont relus en base à chaque appel. Les déduire de la charge utile
 * signée reviendrait à figer les droits pour toute la durée de vie du jeton —
 * un compte désactivé, un agent muté vers une autre banque ou un mot de passe
 * réinitialisé resteraient sans effet jusqu'à l'expiration.
 */
export const authenticate = asyncRoute(async (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  let charge;
  try {
    charge = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Session expirée ou jeton invalide');
  }

  const { rows } = await query(
    `SELECT u.id, u.email, u.role, u.bank_id, u.active, u.must_change_password,
            u.password_changed_at, b.active AS bank_active
       FROM users u JOIN banks b ON b.id = u.bank_id
      WHERE u.id = $1`,
    [charge.sub]
  );
  const utilisateur = rows[0];

  if (!utilisateur) throw unauthorized('Compte introuvable');
  if (!utilisateur.active) throw unauthorized('Compte désactivé');
  if (!utilisateur.bank_active) throw unauthorized('Banque désactivée');

  // Le mot de passe a-t-il changé depuis l'émission du jeton ? C'est ce qui ferme
  // les sessions déjà ouvertes lors d'une réinitialisation.
  const empreinteActuelle = new Date(utilisateur.password_changed_at).toISOString();
  if (charge.pwd !== empreinteActuelle) {
    throw unauthorized('Mot de passe modifié : reconnectez-vous');
  }

  req.user = {
    id: utilisateur.id,
    email: utilisateur.email,
    role: utilisateur.role,
    bankId: utilisateur.bank_id,
    mustChangePassword: utilisateur.must_change_password,
  };
  next();
});

/** Restreint l'accès à une liste de rôles. ADMIN est toujours autorisé. */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role === 'ADMIN' || roles.includes(req.user.role)) return next();
  next(forbidden(`Action réservée aux profils : ${roles.join(', ')}`));
};

/**
 * Un mot de passe réinitialisé par un administrateur doit être changé avant tout
 * autre usage. Le contrôle est fait côté serveur : masquer l'écran ne suffirait pas.
 */
export function requirePasswordChanged(req, res, next) {
  if (req.user?.mustChangePassword) {
    return next(
      forbidden('Vous devez définir un nouveau mot de passe avant d’utiliser la plateforme.')
    );
  }
  next();
}
