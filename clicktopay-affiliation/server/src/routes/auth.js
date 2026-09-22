import { Router } from 'express';
import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { asyncRoute, unauthorized, validate } from '../middleware/errors.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { loginSchema } from '../services/requestSchema.js';
import { changePasswordSchema } from '../services/adminSchema.js';
import { changeOwnPassword } from '../services/admin.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

/**
 * Deux clés par tentative : l'adresse IP (freine un balayage de comptes depuis
 * une même source) et le compte visé (freine une attaque distribuée sur un
 * compte précis).
 */
export const loginLimiter = createRateLimiter({
  windowMs: config.loginRateLimitWindowMs,
  max: config.loginRateLimitMax,
  message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
  keyGenerator: (req) => [
    `ip:${req.ip}`,
    req.body?.email ? `compte:${String(req.body.email).toLowerCase()}` : null,
  ],
});

export const authRouter = Router();

// La limitation passe AVANT la validation : un corps invalide était refusé en
// 400 sans rien consommer du quota, si bien qu'un balayage d'adresses mal
// formées ne laissait aucune trace de débit, et qu'alterner corps valides et
// invalides diluait la consommation d'un attaquant.
authRouter.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncRoute(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await query(
      `SELECT u.*, b.name AS bank_name, b.code AS bank_code, b.active AS bank_active
         FROM users u JOIN banks b ON b.id = u.bank_id
        WHERE lower(u.email) = lower($1)`,
      [email]
    );
    const user = rows[0];
    // Message identique que l'utilisateur existe ou non : pas d'énumération de comptes.
    const invalid = unauthorized('Identifiants incorrects');
    if (!user || !user.active || !user.bank_active) throw invalid;
    if (!(await bcrypt.compare(password, user.password_hash))) throw invalid;

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    loginLimiter.reset(req);

    res.json({
      token: signToken(user),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        bankId: user.bank_id,
        bankName: user.bank_name,
        bankCode: user.bank_code,
        mustChangePassword: user.must_change_password,
      },
    });
  })
);

authRouter.get(
  '/me',
  authenticate,
  asyncRoute(async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.bank_id, u.last_login_at,
              u.must_change_password, b.name AS bank_name, b.code AS bank_code
         FROM users u JOIN banks b ON b.id = u.bank_id
        WHERE u.id = $1 AND u.active AND b.active`,
      [req.user.id]
    );
    if (!rows[0]) throw unauthorized('Compte désactivé');
    const u = rows[0];
    res.json({
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      bankId: u.bank_id,
      bankName: u.bank_name,
      bankCode: u.bank_code,
      lastLoginAt: u.last_login_at,
      mustChangePassword: u.must_change_password,
    });
  })
);

/**
 * Changement de mot de passe par l'utilisateur lui-même. Accessible même lorsque
 * le changement est imposé après une réinitialisation par un administrateur :
 * un nouveau jeton, sans l'obligation, est renvoyé en cas de succès.
 */
authRouter.post(
  '/password',
  authenticate,
  validate(changePasswordSchema),
  asyncRoute(async (req, res) => {
    await changeOwnPassword({
      user: req.user,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });
    const { rows } = await query(
      `SELECT id, email, role, bank_id, must_change_password, password_changed_at
         FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ token: signToken(rows[0]), changed: true });
  })
);
