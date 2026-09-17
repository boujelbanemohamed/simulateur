import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../middleware/errors.js';
import { getMcc, rechargerCatalogue } from './mccCatalog.js';

const SALT_ROUNDS = 10;

async function journaliser(client, { userId, entity, entityId, action, payload = {} }) {
  await client.query(
    `INSERT INTO admin_events (user_id, entity, entity_id, action, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, entity, String(entityId ?? ''), action, payload]
  );
}

// ---------------------------------------------------------------- Utilisateurs

const versUtilisateur = (row) => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  role: row.role,
  bankId: row.bank_id,
  bankName: row.bank_name ?? null,
  bankCode: row.bank_code ?? null,
  active: row.active,
  mustChangePassword: row.must_change_password,
  lastLoginAt: row.last_login_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SELECT_UTILISATEURS = `
  SELECT u.*, b.name AS bank_name, b.code AS bank_code
    FROM users u JOIN banks b ON b.id = u.bank_id
`;

export async function listUsers({ search, bankId, role } = {}) {
  const conditions = [];
  const values = [];
  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;
    conditions.push(`(u.email ILIKE ${p} OR u.first_name ILIKE ${p} OR u.last_name ILIKE ${p})`);
  }
  if (bankId) {
    values.push(Number(bankId));
    conditions.push(`u.bank_id = $${values.length}`);
  }
  if (role) {
    values.push(role);
    conditions.push(`u.role = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT_UTILISATEURS} ${where} ORDER BY u.last_name, u.first_name`, values);
  return rows.map(versUtilisateur);
}

export async function getUser(id) {
  const { rows } = await query(`${SELECT_UTILISATEURS} WHERE u.id = $1`, [id]);
  if (!rows[0]) throw notFound(`Utilisateur ${id} introuvable`);
  return versUtilisateur(rows[0]);
}

async function assertBanqueActive(client, bankId) {
  const { rows } = await client.query('SELECT active FROM banks WHERE id = $1', [bankId]);
  if (!rows[0]) throw badRequest(`Banque ${bankId} introuvable`);
  if (!rows[0].active) throw badRequest('Cette banque est désactivée : aucun compte ne peut y être rattaché.');
}

export async function createUser({ payload, user }) {
  const id = await withTransaction(async (client) => {
    await assertBanqueActive(client, payload.bankId);
    const existe = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [payload.email]);
    if (existe.rowCount > 0) throw conflict(`Un compte existe déjà avec l'adresse ${payload.email}.`);

    const hash = await bcrypt.hash(payload.password, SALT_ROUNDS);
    const { rows } = await client.query(
      `INSERT INTO users (bank_id, email, password_hash, first_name, last_name, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
      [payload.bankId, payload.email, hash, payload.firstName, payload.lastName, payload.role]
    );
    await journaliser(client, {
      userId: user.id, entity: 'USER', entityId: rows[0].id, action: 'CREATION',
      payload: { email: payload.email, role: payload.role, bankId: payload.bankId },
    });
    return rows[0].id;
  });
  // Relecture hors transaction : getUser passe par le pool et ne verrait pas
  // une écriture encore non validée.
  return getUser(id);
}

const CHAMPS_UTILISATEUR = {
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  role: 'role',
  bankId: 'bank_id',
  active: 'active',
};

export async function updateUser({ id, payload, user }) {
  const avant = await getUser(id);

  // Un administrateur ne peut ni se retirer son propre rôle, ni se désactiver :
  // c'est la protection minimale contre le verrouillage de la plateforme.
  if (avant.id === user.id) {
    if (payload.role !== undefined && payload.role !== avant.role) {
      throw forbidden('Vous ne pouvez pas modifier votre propre rôle.');
    }
    if (payload.active === false) {
      throw forbidden('Vous ne pouvez pas désactiver votre propre compte.');
    }
  }
  if (avant.role === 'ADMIN' && (payload.role !== undefined || payload.active === false)) {
    await assertResteUnAdmin(id, payload);
  }

  await withTransaction(async (client) => {
    if (payload.bankId !== undefined) await assertBanqueActive(client, payload.bankId);
    if (payload.email !== undefined) {
      const existe = await client.query(
        'SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2',
        [payload.email, id]
      );
      if (existe.rowCount > 0) throw conflict(`Un autre compte utilise déjà l'adresse ${payload.email}.`);
    }

    const sets = [];
    const values = [];
    for (const [cle, colonne] of Object.entries(CHAMPS_UTILISATEUR)) {
      if (payload[cle] !== undefined) {
        values.push(payload[cle]);
        sets.push(`${colonne} = $${values.length}`);
      }
    }
    if (sets.length > 0) {
      values.push(id);
      await client.query(
        `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
        values
      );
    }
    await journaliser(client, {
      userId: user.id, entity: 'USER', entityId: id, action: 'MODIFICATION',
      payload: { champs: Object.keys(payload) },
    });
  });
  return getUser(id);
}

/** Refuse de retirer le dernier administrateur actif de la plateforme. */
async function assertResteUnAdmin(id, payload) {
  const perdLeRole = payload.role !== undefined && payload.role !== 'ADMIN';
  const estDesactive = payload.active === false;
  if (!perdLeRole && !estDesactive) return;

  const { rows } = await query(
    "SELECT COUNT(*)::int AS total FROM users WHERE role = 'ADMIN' AND active AND id <> $1",
    [id]
  );
  if (rows[0].total === 0) {
    throw conflict("Impossible : la plateforme doit conserver au moins un administrateur actif.");
  }
}

/** Réinitialisation par l'administrateur : le mot de passe devra être changé à la connexion. */
export async function resetPassword({ id, password, user }) {
  await getUser(id);
  await withTransaction(async (client) => {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await client.query(
      'UPDATE users SET password_hash = $1, must_change_password = TRUE, updated_at = now() WHERE id = $2',
      [hash, id]
    );
    await journaliser(client, {
      userId: user.id, entity: 'USER', entityId: id, action: 'REINITIALISATION_MOT_DE_PASSE',
    });
  });
  return getUser(id);
}

/** Changement par l'utilisateur lui-même : l'ancien mot de passe est exigé. */
export async function changeOwnPassword({ user, currentPassword, newPassword }) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  if (!rows[0]) throw notFound('Compte introuvable');
  if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    throw badRequest('Le mot de passe actuel est incorrect.');
  }
  if (await bcrypt.compare(newPassword, rows[0].password_hash)) {
    throw badRequest('Le nouveau mot de passe doit être différent de l’ancien.');
  }
  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query(
    'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2',
    [hash, user.id]
  );
  return { changed: true };
}

// --------------------------------------------------------------------- Banques

const versBanque = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  active: row.active,
  createdAt: row.created_at,
  userCount: row.user_count ?? undefined,
  requestCount: row.request_count ?? undefined,
});

export async function listBanks() {
  const { rows } = await query(`
    SELECT b.*,
           (SELECT COUNT(*)::int FROM users u WHERE u.bank_id = b.id) AS user_count,
           (SELECT COUNT(*)::int FROM affiliation_requests r WHERE r.bank_id = b.id) AS request_count
      FROM banks b ORDER BY b.name`);
  return rows.map(versBanque);
}

export async function createBank({ payload, user }) {
  const id = await withTransaction(async (client) => {
    const existe = await client.query('SELECT 1 FROM banks WHERE upper(code) = upper($1)', [payload.code]);
    if (existe.rowCount > 0) throw conflict(`Le code banque ${payload.code} est déjà utilisé.`);
    const { rows } = await client.query(
      'INSERT INTO banks (code, name) VALUES (upper($1), $2) RETURNING id',
      [payload.code, payload.name]
    );
    await journaliser(client, {
      userId: user.id, entity: 'BANK', entityId: rows[0].id, action: 'CREATION', payload,
    });
    return rows[0].id;
  });
  const banques = await listBanks();
  return banques.find((b) => b.id === id);
}

export async function updateBank({ id, payload, user }) {
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM banks WHERE id = $1', [id]);
    if (!rows[0]) throw notFound(`Banque ${id} introuvable`);

    // Désactiver une banque coupe l'accès à ses agents : on l'annonce explicitement.
    if (payload.active === false) {
      const actifs = await client.query(
        'SELECT COUNT(*)::int AS total FROM users WHERE bank_id = $1 AND active',
        [id]
      );
      if (actifs.rows[0].total > 0) {
        throw conflict(
          `Cette banque compte ${actifs.rows[0].total} compte(s) actif(s). Désactivez-les avant de désactiver la banque.`
        );
      }
    }

    const sets = [];
    const values = [];
    for (const [cle, colonne] of Object.entries({ name: 'name', active: 'active' })) {
      if (payload[cle] !== undefined) {
        values.push(payload[cle]);
        sets.push(`${colonne} = $${values.length}`);
      }
    }
    if (sets.length > 0) {
      values.push(id);
      await client.query(`UPDATE banks SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    }
    await journaliser(client, {
      userId: user.id, entity: 'BANK', entityId: id, action: 'MODIFICATION', payload,
    });
  });
  const banques = await listBanks();
  return banques.find((b) => b.id === Number(id));
}

// ------------------------------------------------------------------ Journal

export async function listAdminEvents({ limit = 100 } = {}) {
  const { rows } = await query(
    `SELECT e.*, (u.first_name || ' ' || u.last_name) AS user_name
       FROM admin_events e LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.created_at DESC, e.id DESC LIMIT $1`,
    [Math.min(limit, 500)]
  );
  return rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    entityId: r.entity_id,
    action: r.action,
    payload: r.payload,
    userName: r.user_name,
    createdAt: r.created_at,
  }));
}

export { journaliser, getMcc, rechargerCatalogue };
