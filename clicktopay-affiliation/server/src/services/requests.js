import { query, withTransaction } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../middleware/errors.js';
import { getMcc } from './mccCatalog.js';
import { suggestMcc } from './mccSuggestion.js';

/** Champs métier : clé API (camelCase) -> colonne PostgreSQL. */
const FIELDS = {
  siteName: 'site_name',
  siteUrl: 'site_url',
  siteLanguages: 'site_languages',
  companyName: 'company_name',
  legalForm: 'legal_form',
  rne: 'rne',
  taxId: 'tax_id',
  companyCreatedOn: 'company_created_on',
  shareCapital: 'share_capital',
  contactFirstName: 'contact_first_name',
  contactLastName: 'contact_last_name',
  contactEmail: 'contact_email',
  contactPhone: 'contact_phone',
  addressLine1: 'address_line1',
  addressLine2: 'address_line2',
  city: 'city',
  postalCode: 'postal_code',
  governorate: 'governorate',
  country: 'country',
  activitySector: 'activity_sector',
  activityDescription: 'activity_description',
  productTypes: 'product_types',
  deliveryMode: 'delivery_mode',
  hasSubscription: 'has_subscription',
  isMarketplace: 'is_marketplace',
  sellsAbroad: 'sells_abroad',
  averageBasket: 'average_basket',
  monthlyVolume: 'monthly_volume',
  currency: 'currency',
  rib: 'rib',
  accountHolder: 'account_holder',
  bankAgency: 'bank_agency',
  proposedVisaMcc: 'proposed_visa_mcc',
  proposedMastercardMcc: 'proposed_mastercard_mcc',
  proposedJustification: 'proposed_justification',
};

const EDITABLE_STATUSES = new Set(['BROUILLON', 'COMPLEMENT_REQUIS']);

const camel = (row) => {
  const out = { id: row.id, reference: row.reference, status: row.status };
  for (const [key, column] of Object.entries(FIELDS)) out[key] = row[column];
  return {
    ...out,
    bankId: row.bank_id,
    bankName: row.bank_name ?? null,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    finalVisaMcc: row.final_visa_mcc,
    finalMastercardMcc: row.final_mastercard_mcc,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by_name ?? null,
    decisionComment: row.decision_comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const SELECT_BASE = `
  SELECT r.*,
         b.name AS bank_name,
         (a.first_name || ' ' || a.last_name) AS created_by_name,
         (d.first_name || ' ' || d.last_name) AS decided_by_name
    FROM affiliation_requests r
    JOIN banks b ON b.id = r.bank_id
    JOIN users a ON a.id = r.created_by
    LEFT JOIN users d ON d.id = r.decided_by
`;

/** Référence lisible et unique : AFF-<année>-<séquence sur 5 chiffres>. */
async function nextReference(client) {
  const { rows } = await client.query("SELECT nextval('affiliation_reference_seq') AS n");
  return `AFF-${new Date().getFullYear()}-${String(rows[0].n).padStart(5, '0')}`;
}

async function logEvent(client, { requestId, userId, type, comment = null, payload = {} }) {
  await client.query(
    `INSERT INTO request_events (request_id, user_id, event_type, comment, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [requestId, userId, type, comment, payload]
  );
}

/** Les MCC interdits ne peuvent jamais être retenus, quel que soit le profil. */
function assertSelectableMcc(code, champ) {
  if (code == null) return;
  const mcc = getMcc(code);
  if (!mcc) throw badRequest(`MCC inconnu pour ${champ} : ${code}`);
  if (!mcc.active) {
    throw badRequest(`Le MCC ${mcc.code} (${mcc.label}) a été désactivé dans le référentiel.`);
  }
  if (mcc.riskLevel === 'INTERDIT') {
    throw badRequest(
      `Le MCC ${mcc.code} (${mcc.label}) n'est pas éligible à l'affiliation ClickToPay.`,
      mcc.note ? [{ champ, message: mcc.note }] : undefined
    );
  }
}

export async function createRequest({ payload, user }) {
  assertSelectableMcc(payload.proposedVisaMcc, 'proposedVisaMcc');
  assertSelectableMcc(payload.proposedMastercardMcc, 'proposedMastercardMcc');

  return withTransaction(async (client) => {
    const reference = await nextReference(client);
    const columns = ['reference', 'bank_id', 'created_by'];
    const values = [reference, user.bankId, user.id];

    for (const [key, column] of Object.entries(FIELDS)) {
      if (payload[key] !== undefined) {
        columns.push(column);
        values.push(payload[key]);
      }
    }
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await client.query(
      `INSERT INTO affiliation_requests (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      values
    );
    const id = rows[0].id;
    await logEvent(client, { requestId: id, userId: user.id, type: 'CREATION', payload: { reference } });
    return getRequest(id, user, client);
  });
}

export async function updateRequest({ id, payload, user }) {
  const existing = await getRequest(id, user);
  assertEditable(existing, user);
  assertSelectableMcc(payload.proposedVisaMcc, 'proposedVisaMcc');
  assertSelectableMcc(payload.proposedMastercardMcc, 'proposedMastercardMcc');

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(FIELDS)) {
    if (payload[key] !== undefined) {
      values.push(payload[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) return existing;

  values.push(id);
  return withTransaction(async (client) => {
    // `assertEditable` a lu le statut hors transaction : entre cette lecture et
    // l'écriture, la demande a pu être soumise. C'était le dernier chemin
    // d'écriture sans garde dans sa clause WHERE.
    const { rowCount } = await client.query(
      `UPDATE affiliation_requests SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${values.length} AND status IN ('BROUILLON', 'COMPLEMENT_REQUIS')`,
      values
    );
    if (rowCount === 0) {
      throw conflict('Cette demande vient de changer de statut et n’est plus modifiable.');
    }
    await logEvent(client, {
      requestId: id,
      userId: user.id,
      type: 'MODIFICATION',
      payload: { champs: Object.keys(payload) },
    });
    return getRequest(id, user, client);
  });
}

function assertEditable(request, user) {
  if (!EDITABLE_STATUSES.has(request.status)) {
    throw conflict(
      `Une demande au statut ${request.status} n'est plus modifiable par l'agent.`
    );
  }
  if (user.role === 'AGENT' && request.createdBy !== user.id) {
    throw forbidden("Vous ne pouvez modifier que les demandes que vous avez saisies.");
  }
}

export async function getRequest(id, user, client = null) {
  const runner = client ?? { query };
  const { rows } = await runner.query(`${SELECT_BASE} WHERE r.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound(`Demande ${id} introuvable`);
  if (user.role !== 'ADMIN' && row.bank_id !== user.bankId) {
    throw forbidden("Cette demande appartient à une autre banque.");
  }
  return camel(row);
}

export async function listRequests({ user, status, search, mine, limit = 50, offset = 0 }) {
  const conditions = [];
  const values = [];

  if (user.role !== 'ADMIN') {
    values.push(user.bankId);
    conditions.push(`r.bank_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`r.status = $${values.length}`);
  }
  if (mine) {
    values.push(user.id);
    conditions.push(`r.created_by = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;
    conditions.push(
      `(r.reference ILIKE ${p} OR r.site_name ILIKE ${p} OR r.company_name ILIKE ${p} OR r.rne ILIKE ${p})`
    );
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit, offset);

  const { rows } = await query(
    `${SELECT_BASE} ${where} ORDER BY r.updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return rows.map(camel);
}

/**
 * Soumission par l'agent : fige les MCC proposés et la photographie des
 * suggestions du moteur, puis passe la demande au banquier.
 */
export async function submitRequest({ id, user }) {
  const request = await getRequest(id, user);
  assertEditable(request, user);

  if (!request.proposedVisaMcc || !request.proposedMastercardMcc) {
    throw badRequest(
      'Un MCC Visa et un MCC Mastercard doivent être proposés avant la soumission.'
    );
  }
  assertSelectableMcc(request.proposedVisaMcc, 'proposedVisaMcc');
  assertSelectableMcc(request.proposedMastercardMcc, 'proposedMastercardMcc');

  const suggestions = suggestMcc(request);

  return withTransaction(async (client) => {
    // La garde de statut est portée par l'UPDATE lui-même : deux soumissions
    // simultanées passeraient toutes deux le contrôle de statut lu plus haut.
    // Les traces de la décision précédente sont effacées : une demande en attente
    // d'arbitrage ne doit pas afficher un décideur.
    const { rowCount } = await client.query(
      `UPDATE affiliation_requests
          SET status = 'SOUMISE', submitted_at = now(), updated_at = now(),
              decision_comment = NULL, decided_at = NULL, decided_by = NULL
        WHERE id = $1 AND status IN ('BROUILLON', 'COMPLEMENT_REQUIS')`,
      [id]
    );
    if (rowCount === 0) {
      throw conflict('Cette demande vient d’être soumise par ailleurs.');
    }
    await client.query('DELETE FROM mcc_suggestions WHERE request_id = $1', [id]);
    for (const network of ['VISA', 'MASTERCARD']) {
      let rank = 0;
      for (const s of suggestions) {
        rank += 1;
        await client.query(
          `INSERT INTO mcc_suggestions (request_id, network, mcc_code, rank, score, matched_terms,
                                        label_at_submit, description_at_submit)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, network, s.code, rank, s.score, s.matchedTerms, s.label, s.description]
        );
      }
    }
    await logEvent(client, {
      requestId: id,
      userId: user.id,
      type: 'SOUMISSION',
      payload: {
        visa: request.proposedVisaMcc,
        mastercard: request.proposedMastercardMcc,
        suggestions: suggestions.map((s) => s.code),
      },
    });
    return getRequest(id, user, client);
  });
}

/**
 * Décision du banquier : il valide les MCC proposés ou les remplace, rejette la
 * demande, ou la renvoie à l'agent pour complément.
 */
export async function decideRequest({ id, decision, visaMcc, mastercardMcc, comment, user }) {
  const request = await getRequest(id, user);
  if (request.status !== 'SOUMISE') {
    throw conflict(
      `Seule une demande au statut SOUMISE peut être arbitrée (statut actuel : ${request.status}).`
    );
  }

  const finalVisa = visaMcc ?? request.proposedVisaMcc;
  const finalMastercard = mastercardMcc ?? request.proposedMastercardMcc;

  if (decision === 'VALIDEE') {
    if (!finalVisa || !finalMastercard) {
      throw badRequest('La validation exige un MCC Visa et un MCC Mastercard.');
    }
    assertSelectableMcc(finalVisa, 'visaMcc');
    assertSelectableMcc(finalMastercard, 'mastercardMcc');
  }
  if (decision !== 'VALIDEE' && !comment) {
    throw badRequest('Un commentaire est obligatoire pour un rejet ou une demande de complément.');
  }

  const modified =
    decision === 'VALIDEE' &&
    (finalVisa !== request.proposedVisaMcc || finalMastercard !== request.proposedMastercardMcc);

  return withTransaction(async (client) => {
    // `AND status = 'SOUMISE'` : sans cette garde, deux arbitrages simultanés
    // aboutissent tous les deux et la demande porte deux décisions contradictoires
    // dans sa piste d'audit.
    const { rowCount } = await client.query(
      `UPDATE affiliation_requests
          SET status = $1,
              final_visa_mcc = $2,
              final_mastercard_mcc = $3,
              decision_comment = $4,
              decided_at = now(),
              decided_by = $5,
              updated_at = now()
        WHERE id = $6 AND status = 'SOUMISE'`,
      [
        decision,
        decision === 'VALIDEE' ? finalVisa : null,
        decision === 'VALIDEE' ? finalMastercard : null,
        comment,
        user.id,
        id,
      ]
    );
    if (rowCount === 0) {
      throw conflict('Cette demande vient d’être arbitrée par ailleurs.');
    }
    await logEvent(client, {
      requestId: id,
      userId: user.id,
      type: decision === 'VALIDEE' ? (modified ? 'VALIDATION_AVEC_MODIFICATION' : 'VALIDATION') : decision,
      comment,
      payload: {
        proposes: { visa: request.proposedVisaMcc, mastercard: request.proposedMastercardMcc },
        retenus: { visa: finalVisa, mastercard: finalMastercard },
      },
    });
    return getRequest(id, user, client);
  });
}

/**
 * Photographie des propositions servies à la soumission.
 *
 * Ce que le banquier relit doit être ce qui a été servi, et non l'état du
 * référentiel du jour : c'est la justification de la demande, donc une pièce de
 * la piste d'audit. Le catalogue courant ne sert plus qu'à SIGNALER les écarts
 * survenus depuis — jamais à réécrire la photographie.
 */
export async function getSuggestionsSnapshot(id, user) {
  await getRequest(id, user); // contrôle d'accès
  const { rows } = await query(
    `SELECT network, mcc_code, rank, score, matched_terms, label_at_submit, description_at_submit
       FROM mcc_suggestions WHERE request_id = $1 ORDER BY network, rank`,
    [id]
  );
  const grouped = { VISA: [], MASTERCARD: [] };
  for (const row of rows) {
    grouped[row.network].push(photographier(row));
  }
  return grouped;
}

/** Une entrée de photographie, complétée des écarts constatés depuis la soumission. */
function photographier(row) {
  const actuel = getMcc(row.mcc_code);
  // Une photographie antérieure à l'évolution ne porte pas les libellés : on
  // retombe sur le catalogue courant, en le disant. On n'invente pas un libellé
  // d'époque que personne n'a conservé.
  const reconstitue = row.label_at_submit === null;

  const entree = {
    ...actuel,
    // Le code vient toujours de la photographie : un code sorti du cache
    // laissait auparavant une entrée sans code ni libellé.
    code: row.mcc_code,
    label: reconstitue ? actuel?.label ?? null : row.label_at_submit,
    description: reconstitue ? actuel?.description ?? null : row.description_at_submit,
    rank: row.rank,
    score: row.score,
    matchedTerms: row.matched_terms,
  };

  if (reconstitue) entree.libelleReconstitue = true;
  if (!actuel || !actuel.active) entree.plusAuReferentiel = true;
  if (!reconstitue && actuel && actuel.label !== row.label_at_submit) {
    entree.libelleActuel = actuel.label;
  }
  return entree;
}

export async function getEvents(id, user) {
  await getRequest(id, user);
  const { rows } = await query(
    `SELECT e.id, e.event_type, e.comment, e.payload, e.created_at,
            (u.first_name || ' ' || u.last_name) AS user_name, u.role AS user_role
       FROM request_events e
       LEFT JOIN users u ON u.id = e.user_id
      WHERE e.request_id = $1
      ORDER BY e.id`,
    [id]
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.event_type,
    comment: r.comment,
    payload: r.payload,
    createdAt: r.created_at,
    userName: r.user_name,
    userRole: r.user_role,
  }));
}

export async function getStats(user) {
  const values = [];
  let where = '';
  if (user.role !== 'ADMIN') {
    values.push(user.bankId);
    where = 'WHERE bank_id = $1';
  }
  const { rows } = await query(
    `SELECT status, COUNT(*)::int AS total FROM affiliation_requests ${where} GROUP BY status`,
    values
  );
  const stats = { BROUILLON: 0, SOUMISE: 0, COMPLEMENT_REQUIS: 0, VALIDEE: 0, REJETEE: 0 };
  for (const row of rows) stats[row.status] = row.total;
  return { ...stats, TOTAL: Object.values(stats).reduce((a, b) => a + b, 0) };
}
