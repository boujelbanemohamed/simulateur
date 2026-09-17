import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { asyncRoute, unauthorized, validate } from '../middleware/errors.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { loginSchema } from '../services/requestSchema.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncRoute(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await query(
      `SELECT u.*, b.name AS bank_name, b.code AS bank_code
         FROM users u JOIN banks b ON b.id = u.bank_id
        WHERE lower(u.email) = lower($1)`,
      [email]
    );
    const user = rows[0];
    // Message identique que l'utilisateur existe ou non : pas d'énumération de comptes.
    const invalid = unauthorized('Identifiants incorrects');
    if (!user || !user.active) throw invalid;
    if (!(await bcrypt.compare(password, user.password_hash))) throw invalid;

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

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
              b.name AS bank_name, b.code AS bank_code
         FROM users u JOIN banks b ON b.id = u.bank_id
        WHERE u.id = $1 AND u.active`,
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
    });
  })
);
