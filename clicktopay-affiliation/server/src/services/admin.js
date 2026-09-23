import bcrypt from 'bcrypt';
import { query, withTransaction } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../middleware/errors.js';
import { getMcc, rechargerCatalogue } from './mccCatalog.js';

const SALT_ROUNDS = 10;

/** Clé arbitraire mais stable du verrou protégeant la population d'administrateurs. */
const VERROU_ADMINISTRATEURS = 4242;

/**
 * Écrit une ligne de journal.
 *
 * `bankId` est la banque **concernée par l'action**, pas celle de son auteur : un
 * administrateur qui modifie un compte de la banque B écrit dans le journal de B.
 * `null` vaut « portée plateforme » — le référentiel MCC, commun à toutes les
 * banques — et n'est alors visible que de l'administrateur.
 */
async function journaliser(client, { userId, bankId = null, entity, entityId, action, payload = {} }) {
  await client.query(
    `INSERT INTO admin_events (user_id, bank_id, entity, entity_id, action, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, bankId ?? null, entity, String(entityId ?? ''), action, payload]
  );
}

/** Les trois profils de la plateforme, du moins au plus étendu. */
const ROLES = ['AGENT', 'BANQUIER', 'ADMIN'];

/**
 * Périmètre d'administration de l'appelant.
 *
 * L'administrateur tient toute la plateforme. Le banquier administre SA banque et
 * rien d'autre : il y crée et gère des comptes agents, mais ne peut ni se donner
 * des pairs, ni toucher une autre banque. La règle est écrite ici, une seule fois :
 * toutes les routes d'administration des comptes s'y ramènent, faute de quoi elle
 * finirait recopiée dans chacune et oubliée dans l'une d'elles.
 */
export function perimetreAdministration(user) {
  if (user?.role === 'ADMIN') {
    return { banqueImposee: null, rolesAutorises: ROLES, estAdministrateur: true };
  }
  if (user?.role === 'BANQUIER') {
    return { banqueImposee: user.bankId, rolesAutorises: ['AGENT'], estAdministrateur: false };
  }
  throw forbidden("L'administration est réservée aux banquiers et aux administrateurs.");
}

/**
 * Refuse d'agir sur un compte hors du périmètre.
 *
 * Deux barrières distinctes, et il faut les deux : la banque, pour qu'un banquier
 * ne touche pas au personnel d'une autre ; le rôle, pour qu'il ne s'attribue pas
 * un pair ni ne rétrograde un administrateur.
 */
function assertCibleAutorisee(cible, perimetre) {
  if (perimetre.estAdministrateur) return;
  if (cible.bankId !== perimetre.banqueImposee) {
    // Le même refus qu'un compte inexistant : distinguer les deux laissait
    // dénombrer le personnel des autres banques en balayant les identifiants.
    throw notFound(`Utilisateur ${cible.id} introuvable`);
  }
  if (!perimetre.rolesAutorises.includes(cible.role)) {
    throw forbidden('Vous n’administrez que les comptes agents de votre banque.');
  }
}

/** Charge un compte et vérifie qu'il est administrable par l'appelant. */
export async function getUserAdministrable(id, user) {
  const cible = await getUser(id);
  assertCibleAutorisee(cible, perimetreAdministration(user));
  return cible;
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

export async function listUsers({ search, bankId, role, user } = {}) {
  const conditions = [];
  const values = [];

  // Le banquier ne voit que le personnel de sa banque. Le filtre est posé ici et
  // non dans la requête appelante : un filtre d'affichage se contourne, celui-ci
  // non. Il voit tous les rôles de sa banque — savoir qu'un collègue banquier
  // existe est utile — mais n'agit que sur les agents (assertCibleAutorisee).
  const perimetre = perimetreAdministration(user);
  if (perimetre.banqueImposee !== null) {
    values.push(perimetre.banqueImposee);
    conditions.push(`u.bank_id = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;
    conditions.push(`(u.email ILIKE ${p} OR u.first_name ILIKE ${p} OR u.last_name ILIKE ${p})`);
  }
  if (bankId && perimetre.banqueImposee === null) {
    // Un filtre illisible ne doit pas remonter en erreur PostgreSQL.
    const identifiant = Number(bankId);
    if (!Number.isInteger(identifiant)) throw badRequest(`Banque invalide : « ${bankId} »`);
    values.push(identifiant);
    conditions.push(`u.bank_id = $${values.length}`);
  }
  if (role && !['AGENT', 'BANQUIER', 'ADMIN'].includes(role)) {
    throw badRequest(`Rôle invalide : « ${role} »`);
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

/** Contrôle la banque de rattachement et rend son code, lisible dans le journal. */
async function assertBanqueActive(client, bankId) {
  const { rows } = await client.query('SELECT code, active FROM banks WHERE id = $1', [bankId]);
  if (!rows[0]) throw badRequest(`Banque ${bankId} introuvable`);
  if (!rows[0].active) throw badRequest('Cette banque est désactivée : aucun compte ne peut y être rattaché.');
  return rows[0].code;
}

/**
 * Valeurs avant et après d'une modification, pour le journal d'administration.
 *
 * Ne consigner que les NOMS des champs touchés produit un accusé de réception,
 * pas une piste d'audit : on savait qu'un rôle avait changé, jamais de quoi vers
 * quoi. Un champ soumis avec sa valeur actuelle n'apparaît pas ; si rien ne
 * change, la ligne reste écrite et porte `sansEffet`, car un appel doit rester
 * traçable même lorsqu'il ne modifie rien.
 */
function tracerChamps(champs) {
  const traces = {};
  for (const [cle, { avant, apres }] of Object.entries(champs)) {
    if (apres === undefined) continue;
    if (JSON.stringify(avant ?? null) === JSON.stringify(apres)) continue;
    traces[cle] = { avant: avant ?? null, apres };
  }
  return Object.keys(traces).length > 0 ? { champs: traces } : { champs: {}, sansEffet: true };
}

/**
 * Traduit la violation de l'index unique sur `lower(email)`.
 *
 * Le contrôle applicatif qui précède l'écriture ne protège de rien en
 * concurrence : deux créations simultanées de la même adresse le passent toutes
 * les deux, et c'est la base qui tranche. Sans cette traduction, le perdant
 * recevrait un 500 là où un 409 explicite est attendu.
 */
const CONTRAINTES_EMAIL = new Set(['idx_users_email_lower', 'users_email_key']);

function traduireConflitEmail(err, message) {
  if (err.code === '23505' && CONTRAINTES_EMAIL.has(err.constraint)) throw conflict(message);
  throw err;
}

export async function createUser({ payload, user }) {
  // Le banquier crée dans SA banque, et seulement des agents. On corrige la
  // banque plutôt que de refuser : l'écran ne la lui demande pas, et un identifiant
  // venu d'ailleurs dans le corps de la requête ne doit pas décider pour lui.
  const perimetre = perimetreAdministration(user);
  if (perimetre.banqueImposee !== null) {
    payload = { ...payload, bankId: perimetre.banqueImposee };
    if (!perimetre.rolesAutorises.includes(payload.role)) {
      throw forbidden('Vous ne pouvez créer que des comptes agents dans votre banque.');
    }
  }

  const id = await withTransaction(async (client) => {
    const codeBanque = await assertBanqueActive(client, payload.bankId);
    const existe = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [payload.email]);
    if (existe.rowCount > 0) throw conflict(`Un compte existe déjà avec l'adresse ${payload.email}.`);

    const hash = await bcrypt.hash(payload.password, SALT_ROUNDS);
    const { rows } = await client.query(
      `INSERT INTO users (bank_id, email, password_hash, first_name, last_name, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
      [payload.bankId, payload.email, hash, payload.firstName, payload.lastName, payload.role]
    );
    await journaliser(client, {
      userId: user.id, bankId: payload.bankId, entity: 'USER', entityId: rows[0].id, action: 'CREATION',
      // Le code de la banque, et pas seulement son identifiant : c'est lui qu'un
      // contrôleur sait lire sans ouvrir une seconde table.
      payload: { email: payload.email, role: payload.role, bankId: payload.bankId, bankCode: codeBanque },
    });
    return rows[0].id;
  }).catch((err) => traduireConflitEmail(err, `Un compte existe déjà avec l'adresse ${payload.email}.`));
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

  // Le compte visé doit être dans le périmètre, ET la modification ne doit pas
  // l'en faire sortir : sans ce second contrôle, un banquier promouvrait son
  // agent au rang de banquier, ou le déplacerait dans une autre banque.
  const perimetre = perimetreAdministration(user);
  assertCibleAutorisee(avant, perimetre);
  if (perimetre.banqueImposee !== null) {
    if (payload.role !== undefined && !perimetre.rolesAutorises.includes(payload.role)) {
      throw forbidden('Vous ne pouvez pas changer le rôle de ce compte.');
    }
    if (payload.bankId !== undefined && payload.bankId !== perimetre.banqueImposee) {
      throw forbidden('Vous ne pouvez pas rattacher ce compte à une autre banque.');
    }
  }

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
  await withTransaction(async (client) => {
    if (avant.role === 'ADMIN') {
      await assertResteUnAdmin(client, id, payload);
    }
    let banqueApres = null;
    if (payload.bankId !== undefined) {
      banqueApres = { id: payload.bankId, code: await assertBanqueActive(client, payload.bankId) };
    }
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
      // La banque d'AVANT : une mutation d'une banque vers une autre est un
      // événement de la banque de départ, qui doit en garder la trace.
      userId: user.id, bankId: avant.bankId, entity: 'USER', entityId: id, action: 'MODIFICATION',
      payload: tracerChamps({
        firstName: { avant: avant.firstName, apres: payload.firstName },
        lastName: { avant: avant.lastName, apres: payload.lastName },
        email: { avant: avant.email, apres: payload.email },
        role: { avant: avant.role, apres: payload.role },
        bankId: {
          avant: { id: avant.bankId, code: avant.bankCode },
          apres: banqueApres ?? undefined,
        },
        active: { avant: avant.active, apres: payload.active },
      }),
    });
  }).catch((err) => traduireConflitEmail(err, `Un autre compte utilise déjà l'adresse ${payload.email}.`));
  return getUser(id);
}

/**
 * Refuse de retirer le dernier administrateur actif de la plateforme.
 *
 * Le comptage doit se faire dans la transaction appelante ET verrouiller les
 * lignes comptées : exécuté en dehors, deux administrateurs qui se rétrogradent
 * simultanément voient chacun l'autre et la plateforme se retrouve sans aucun
 * administrateur, sans autre issue qu'une intervention SQL directe.
 */
async function assertResteUnAdmin(client, id, payload) {
  const perdLeRole = payload.role !== undefined && payload.role !== 'ADMIN';
  const estDesactive = payload.active === false;
  if (!perdLeRole && !estDesactive) return;

  // Verrou consultatif de transaction : il sérialise toutes les mutations du
  // périmètre « administrateurs ». Un FOR UPDATE sur les lignes suffirait à
  // protéger l'invariant, mais deux rétrogradations croisées se verrouilleraient
  // mutuellement et PostgreSQL trancherait par un interblocage (erreur 500) ;
  // ici la seconde transaction attend, puis se voit refuser proprement.
  await client.query('SELECT pg_advisory_xact_lock($1)', [VERROU_ADMINISTRATEURS]);

  const { rows } = await client.query(
    "SELECT id FROM users WHERE role = 'ADMIN' AND active AND id <> $1",
    [id]
  );
  if (rows.length === 0) {
    throw conflict("Impossible : la plateforme doit conserver au moins un administrateur actif.");
  }
}

/** Réinitialisation par l'administrateur : le mot de passe devra être changé à la connexion. */
export async function resetPassword({ id, password, user }) {
  const cible = await getUser(id);
  assertCibleAutorisee(cible, perimetreAdministration(user));
  await withTransaction(async (client) => {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await client.query(
      `UPDATE users SET password_hash = $1, must_change_password = TRUE,
              password_changed_at = now(), updated_at = now() WHERE id = $2`,
      [hash, id]
    );
    await journaliser(client, {
      userId: user.id, bankId: cible.bankId, entity: 'USER', entityId: id, action: 'REINITIALISATION_MOT_DE_PASSE',
    });
  });
  return getUser(id);
}

/** Changement par l'utilisateur lui-même : l'ancien mot de passe est exigé. */
export async function changeOwnPassword({ user, currentPassword, newPassword }) {
  const { rows } = await query(
    'SELECT password_hash, must_change_password FROM users WHERE id = $1',
    [user.id]
  );
  if (!rows[0]) throw notFound('Compte introuvable');
  if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    throw badRequest('Le mot de passe actuel est incorrect.');
  }
  if (await bcrypt.compare(newPassword, rows[0].password_hash)) {
    throw badRequest('Le nouveau mot de passe doit être différent de l’ancien.');
  }
  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  // Écriture et trace dans la même transaction : un contrôle interne doit
  // pouvoir établir qu'un compte a changé de mot de passe, et quand. Un journal
  // qui peut manquer la ligne alors que l'empreinte a changé ne vaut rien.
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE,
              password_changed_at = now(), updated_at = now() WHERE id = $2`,
      [hash, user.id]
    );
    // Le payload ne porte que la circonstance du changement : ni l'ancien mot de
    // passe, ni le nouveau, ni leur empreinte n'ont rien à faire dans un journal
    // consultable par tout administrateur.
    await journaliser(client, {
      userId: user.id, bankId: user.bankId, entity: 'USER', entityId: user.id, action: 'CHANGEMENT_MOT_DE_PASSE',
      payload: { impose: Boolean(rows[0].must_change_password) },
    });
  });
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

/**
 * Les banques visibles par l'appelant : toutes pour l'administrateur, la sienne
 * seulement pour le banquier. Appelée sans `user`, elle rend tout : c'est le cas
 * des usages internes (relecture après écriture), jamais d'une route.
 */
export async function listBanks(user = null) {
  const conditions = [];
  const values = [];
  if (user) {
    const perimetre = perimetreAdministration(user);
    if (perimetre.banqueImposee !== null) {
      values.push(perimetre.banqueImposee);
      conditions.push(`b.id = $${values.length}`);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(`
    SELECT b.*,
           (SELECT COUNT(*)::int FROM users u WHERE u.bank_id = b.id) AS user_count,
           (SELECT COUNT(*)::int FROM affiliation_requests r WHERE r.bank_id = b.id) AS request_count
      FROM banks b ${where} ORDER BY b.name`, values);
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
      userId: user.id, bankId: rows[0].id, entity: 'BANK', entityId: rows[0].id, action: 'CREATION', payload,
    });
    return rows[0].id;
  });
  const banques = await listBanks();
  return banques.find((b) => b.id === id);
}

export async function updateBank({ id, payload, user }) {
  // Le banquier corrige la fiche de sa banque ; il ne touche à aucune autre, et
  // ne la désactive pas — se couper l'accès à soi-même n'est pas une opération
  // qu'on laisse faire sans administrateur.
  const perimetre = perimetreAdministration(user);
  if (perimetre.banqueImposee !== null) {
    if (id !== perimetre.banqueImposee) throw forbidden('Vous ne gérez que votre propre banque.');
    if (payload.active !== undefined) {
      throw forbidden('Seul un administrateur peut activer ou désactiver une banque.');
    }
  }

  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM banks WHERE id = $1', [id]);
    if (!rows[0]) throw notFound(`Banque ${id} introuvable`);
    const avant = rows[0];

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
      userId: user.id, bankId: id, entity: 'BANK', entityId: id, action: 'MODIFICATION',
      payload: tracerChamps({
        // `code` ne peut pas être soumis aujourd'hui (le schéma de validation ne
        // l'accepte pas) ; il est tracé pour que l'ouvrir un jour suffise.
        code: { avant: avant.code, apres: payload.code },
        name: { avant: avant.name, apres: payload.name },
        active: { avant: avant.active, apres: payload.active },
      }),
    });
  });
  const banques = await listBanks();
  return banques.find((b) => b.id === Number(id));
}

// ------------------------------------------------------------------ Journal

const ENTITES_JOURNAL = ['USER', 'BANK', 'MCC'];

/**
 * Borne calendaire d'un filtre du journal.
 *
 * Le seul motif AAAA-MM-JJ laisse passer 2026-02-30, que PostgreSQL rejette
 * ensuite par une erreur 500 : la date doit exister au calendrier.
 */
function jourDeFiltre(valeur) {
  if (valeur === undefined || valeur === null || valeur === '') return null;
  const jour = String(valeur);
  const invalide = badRequest(`Date invalide : « ${jour} ». Format attendu : AAAA-MM-JJ.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) throw invalide;
  const [annee, mois, quantieme] = jour.split('-').map(Number);
  const date = new Date(Date.UTC(annee, mois - 1, quantieme));
  if (
    date.getUTCFullYear() !== annee ||
    date.getUTCMonth() !== mois - 1 ||
    date.getUTCDate() !== quantieme
  ) {
    throw invalide;
  }
  return jour;
}

/**
 * Journal d'administration, paginé et filtrable.
 *
 * Sans `offset`, les entrées au-delà de la 500e n'étaient plus atteignables par
 * l'application : il fallait une requête SQL directe pour les lire. Une piste
 * d'audit qu'on ne peut pas remonter n'en est pas une.
 */
export async function listAdminEvents({ limit = 100, offset = 0, entity, action, depuis, jusqua, user } = {}) {
  const conditions = [];
  const values = [];

  // Le banquier lit le journal de SA banque : les actions qui la concernent, quel
  // qu'en soit l'auteur — y compris celles d'un administrateur sur l'un de ses
  // comptes, qui lui échappaient jusqu'ici. Le filtre porte sur la banque figée à
  // l'écriture, et non sur la banque actuelle de l'auteur : celle-ci change, et
  // faisait alors franchir la cloison à des lignes déjà écrites.
  const perimetre = perimetreAdministration(user);
  if (perimetre.banqueImposee !== null) {
    values.push(perimetre.banqueImposee);
    conditions.push(`e.bank_id = $${values.length}`);
  }

  if (entity) {
    if (!ENTITES_JOURNAL.includes(entity)) {
      throw badRequest(
        `Entité inconnue : « ${entity} ». Valeurs acceptées : ${ENTITES_JOURNAL.join(', ')}.`
      );
    }
    values.push(entity);
    conditions.push(`e.entity = $${values.length}`);
  }
  if (action) {
    values.push(action);
    conditions.push(`e.action = $${values.length}`);
  }

  const debut = jourDeFiltre(depuis);
  const fin = jourDeFiltre(jusqua);
  if (debut && fin && debut > fin) throw badRequest('La date de début doit précéder la date de fin.');
  if (debut) {
    values.push(debut);
    conditions.push(`e.created_at >= $${values.length}::date`);
  }
  if (fin) {
    // Borne haute incluse : le lendemain exclu couvre la journée entière, heure
    // de fin comprise, ce qu'un `<= jusqua::date` laisserait tomber.
    values.push(fin);
    conditions.push(`e.created_at < $${values.length}::date + 1`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const compte = await query(`SELECT count(*)::int AS total FROM admin_events e ${where}`, values);

  values.push(Math.min(limit, 500), offset);
  const { rows } = await query(
    `SELECT e.*, (u.first_name || ' ' || u.last_name) AS user_name
       FROM admin_events e LEFT JOIN users u ON u.id = e.user_id
      ${where}
      -- L'identifiant départage les entrées du même horodatage : sans lui, deux
      -- pages successives peuvent montrer deux fois la même ligne, ou en sauter une.
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  const items = rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    entityId: r.entity_id,
    action: r.action,
    payload: r.payload,
    userName: r.user_name,
    createdAt: r.created_at,
  }));
  return { count: items.length, total: compte.rows[0].total, items };
}

export { journaliser, getMcc, rechargerCatalogue };
