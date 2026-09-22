import { query, withTransaction } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../middleware/errors.js';
import { clesSecteurs, getMcc, rechargerCatalogue } from './mccCatalog.js';

/**
 * Administration du référentiel MCC.
 *
 * Un MCC est une donnée réglementaire : rien n'est supprimé (les demandes
 * validées y font référence), tout est historisé, et un code retiré d'une
 * édition du manuel est désactivé plutôt qu'effacé.
 */

/**
 * Remplace les secteurs d'un MCC. Le rang suit l'ordre fourni : le premier code
 * d'un secteur est celui que le moteur remonte en priorité.
 */
async function ecrireSecteurs(client, code, secteurs) {
  const connus = clesSecteurs();
  const inconnus = secteurs.filter((s) => !connus.includes(s));
  if (inconnus.length > 0) throw badRequest(`Secteur inconnu : ${inconnus.join(', ')}`);

  // Le rang traduit la priorité du code DANS son secteur, et le moteur s'en sert
  // pour départager les codes (jusqu'à 36 points d'écart). On ne touche donc
  // qu'aux rattachements qui changent réellement : un DELETE suivi d'un INSERT
  // global reléguerait le code en fin de secteur à chaque simple modification de
  // son libellé. Un nouveau rattachement, lui, prend la fin de file.
  const { rows } = await client.query(
    'SELECT sector_key FROM mcc_sectors WHERE mcc_code = $1',
    [code]
  );
  const actuels = rows.map((r) => r.sector_key);
  const aRetirer = actuels.filter((s) => !secteurs.includes(s));
  const aAjouter = secteurs.filter((s) => !actuels.includes(s));

  if (aRetirer.length > 0) {
    await client.query(
      'DELETE FROM mcc_sectors WHERE mcc_code = $1 AND sector_key = ANY($2::varchar[])',
      [code, aRetirer]
    );
  }

  for (const secteur of aAjouter) {
    // Le type de $1 est posé explicitement : sans cast, PostgreSQL déduit
    // « text » pour la valeur insérée et « varchar » pour la comparaison, et
    // refuse la requête (« inconsistent types deduced for parameter $1 »).
    await client.query(
      `INSERT INTO mcc_sectors (sector_key, mcc_code, rank)
       VALUES ($1::varchar, $2,
               (SELECT COALESCE(MAX(rank), -1) + 1 FROM mcc_sectors WHERE sector_key = $1::varchar))
       ON CONFLICT (sector_key, mcc_code) DO NOTHING`,
      [secteur, code]
    );
  }
}

const CHAMPS = {
  label: 'label_fr',
  description: 'description_fr',
  labelEn: 'label_en',
  descriptionEn: 'description_en',
  keywords: 'keywords',
  similar: 'similar_codes',
  ecommerceRelevance: 'ecommerce_relevance',
  riskLevel: 'risk_level',
  note: 'note',
  networks: 'networks',
  active: 'active',
};

/** Photographie d'un code, pour l'historique avant/après. */
const instantane = (mcc) =>
  mcc && {
    label: mcc.label,
    description: mcc.description,
    labelEn: mcc.labelEn,
    descriptionEn: mcc.descriptionEn,
    keywords: mcc.keywords,
    similar: mcc.similar,
    ecommerceRelevance: mcc.ecommerceRelevance,
    riskLevel: mcc.riskLevel,
    note: mcc.note,
    networks: mcc.networks,
    active: mcc.active,
    sectors: mcc.sectors,
  };

async function historiser(client, { code, userId, action, avant, apres, comment = null }) {
  await client.query(
    `INSERT INTO mcc_code_history (code, user_id, action, avant, apres, comment)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [code, userId, action, avant, apres, comment]
  );
  // Le journal d'administration doit aussi porter la trace : c'est là que l'on
  // regarde « qui a touché à quoi », sans ouvrir chaque code un par un.
  await client.query(
    `INSERT INTO admin_events (user_id, entity, entity_id, action, payload)
     VALUES ($1, 'MCC', $2, $3, $4)`,
    [userId, code, action, { comment, champs: champsModifies(avant, apres) }]
  );
}

/** Liste des champs réellement différents entre deux états d'un code. */
function champsModifies(avant, apres) {
  if (!avant || !apres) return [];
  return Object.keys(apres).filter(
    (cle) => JSON.stringify(apres[cle]) !== JSON.stringify(avant[cle])
  );
}

export async function createMcc({ payload, user }) {
  // Contrôle rapide sur le cache, puis filet sur la contrainte de clé primaire :
  // deux créations simultanées du même code passeraient toutes deux ce test.
  if (getMcc(payload.code)) throw conflict(`Le MCC ${payload.code} existe déjà dans le référentiel.`);

  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO mcc_codes (code, label_fr, description_fr, label_en, description_en,
                                keywords, similar_codes, ecommerce_relevance, risk_level,
                                note, networks, source, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          payload.code, payload.label, payload.description,
          payload.labelEn ?? payload.label, payload.descriptionEn ?? payload.description,
          payload.keywords ?? [], payload.similar ?? [],
          payload.ecommerceRelevance ?? 'MEDIUM', payload.riskLevel ?? 'STANDARD',
          payload.note ?? null, payload.networks ?? ['VISA', 'MASTERCARD'],
          payload.source ?? 'Ajout manuel', user.id,
        ]
      );
      if (payload.sectors?.length) await ecrireSecteurs(client, payload.code, payload.sectors);
      await historiser(client, {
        code: payload.code, userId: user.id, action: 'CREATION',
        avant: null, apres: payload, comment: payload.comment ?? null,
      });
    });
  } catch (err) {
    if (err.code === '23505') {
      throw conflict(`Le MCC ${payload.code} existe déjà dans le référentiel.`);
    }
    throw err;
  }
  // Le cache est relu après le commit : il passe par le pool et ne verrait pas
  // une écriture encore non validée.
  await rechargerCatalogue();
  return getMcc(payload.code);
}

export async function updateMcc({ code, payload, user }) {
  const avant = getMcc(code);
  if (!avant) throw notFound(`MCC ${code} introuvable`);

  const { comment, sectors, ...champs } = payload;
  const sets = [];
  const values = [];
  for (const [cle, colonne] of Object.entries(CHAMPS)) {
    if (champs[cle] !== undefined) {
      values.push(champs[cle]);
      sets.push(`${colonne} = $${values.length}`);
    }
  }
  if (sets.length === 0 && sectors === undefined) return avant;

  // L'état d'arrivée se déduit des champs soumis : pas besoin de relire la base
  // dans une transaction dont l'écriture n'est pas encore visible du pool.
  const apres = { ...instantane(avant), ...champs };
  if (sectors !== undefined) apres.sectors = sectors;

  await withTransaction(async (client) => {
    if (sets.length > 0) {
      values.push(user.id, code);
      await client.query(
        `UPDATE mcc_codes SET ${sets.join(', ')}, updated_at = now(),
                updated_by = $${values.length - 1}
          WHERE code = $${values.length}`,
        values
      );
    }
    if (sectors !== undefined) await ecrireSecteurs(client, code, sectors);
    await historiser(client, {
      code, userId: user.id,
      action: champs.active === false ? 'DESACTIVATION' : champs.active === true ? 'REACTIVATION' : 'MODIFICATION',
      avant: instantane(avant), apres, comment: comment ?? null,
    });
  });
  await rechargerCatalogue();
  return getMcc(code);
}

export async function getMccHistory(code) {
  if (!getMcc(code)) throw notFound(`MCC ${code} introuvable`);
  const { rows } = await query(
    `SELECT h.*, (u.first_name || ' ' || u.last_name) AS user_name
       FROM mcc_code_history h LEFT JOIN users u ON u.id = h.user_id
      WHERE h.code = $1 ORDER BY h.id DESC`,
    [code]
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    avant: r.avant,
    apres: r.apres,
    comment: r.comment,
    userName: r.user_name,
    createdAt: r.created_at,
    // Champs réellement modifiés : évite au relecteur de comparer deux objets à l'œil.
    champsModifies:
      r.avant && r.apres
        ? Object.keys(r.apres).filter(
            (k) => JSON.stringify(r.apres[k]) !== JSON.stringify(r.avant[k])
          )
        : [],
  }));
}

const COMPARABLES = ['label', 'description', 'labelEn', 'descriptionEn', 'keywords',
                     'similar', 'ecommerceRelevance', 'riskLevel', 'note'];

/**
 * Secteurs d'une ligne importée. La colonne du fichier en accepte plusieurs,
 * séparés par une virgule : n'en exporter qu'un puis le réimporter effacerait
 * silencieusement les autres rattachements du code.
 */
const secteursDeLEntree = (entree) => {
  if (entree.sector === undefined || entree.sector === null) return undefined;
  const liste = String(entree.sector)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return liste;
};

/**
 * Compare une nouvelle édition du référentiel à la base.
 * Toujours appelé une première fois en simulation : l'administrateur voit le
 * rapport d'écart avant de décider d'appliquer.
 */
export function compareImport(entrees) {
  const ajoutes = [];
  const modifies = [];
  const inchanges = [];
  const reactives = [];
  const vus = new Set();

  for (const entree of entrees) {
    const code = String(entree.code ?? '').trim();
    if (!/^\d{4}$/.test(code)) {
      throw badRequest(`Code MCC invalide dans le fichier importé : « ${entree.code} »`);
    }
    if (vus.has(code)) throw badRequest(`Le code ${code} apparaît plusieurs fois dans le fichier.`);
    vus.add(code);

    const existant = getMcc(code);
    if (!existant) {
      ajoutes.push({ code, label: entree.label ?? entree.labelEn ?? '' });
      continue;
    }
    const differences = COMPARABLES.filter(
      (champ) => entree[champ] !== undefined &&
        JSON.stringify(entree[champ]) !== JSON.stringify(existant[champ])
    ).map((champ) => ({ champ, avant: existant[champ], apres: entree[champ] }));

    // Le secteur ne figurait pas dans les champs comparés : un fichier qui ne
    // changeait que le rattachement d'un code existant était classé « inchangé »
    // et n'écrivait rien, sans que rien ne le signale.
    const secteursVoulus = secteursDeLEntree(entree);
    if (
      secteursVoulus !== undefined &&
      JSON.stringify([...secteursVoulus].sort()) !== JSON.stringify([...(existant.sectors ?? [])].sort())
    ) {
      differences.push({ champ: 'sectors', avant: existant.sectors ?? [], apres: secteursVoulus });
    }

    // `active` ne figure pas dans les champs comparés, et c'est volontaire : un
    // fichier ne désactive jamais un code. Mais un code désactivé qui y
    // REPARAÎT était classé « inchangé » et restait hors service, alors que
    // l'administrateur croyait l'avoir remis en circulation.
    if (!existant.active) reactives.push({ code, label: existant.label });

    if (differences.length > 0) {
      modifies.push({ code, label: existant.label, champs: differences });
    } else if (existant.active) {
      inchanges.push({ code });
    }
  }

  // `retires` est calculé par importCatalog, qui interroge la base : un code
  // absent du fichier n'est jamais supprimé, seulement désactivable.
  return { ajoutes, modifies, inchanges, reactives, retires: [] };
}

export async function importCatalog({ entrees, apply, deactivateMissing, comment, user }) {
  const rapport = compareImport(entrees);

  const presents = new Set(entrees.map((e) => String(e.code).trim()));
  const { rows } = await query('SELECT code, label_fr FROM mcc_codes WHERE active');
  rapport.retires = rows
    .filter((r) => !presents.has(r.code))
    .map((r) => ({ code: r.code, label: r.label_fr }));

  // Un code sans mots-clés métier et sans secteur n'est trouvable que si l'agent
  // emploie les mots exacts de son libellé : on le signale plutôt que de le
  // laisser passer silencieusement.
  rapport.muets = rapport.ajoutes
    .map(({ code }) => entrees.find((e) => String(e.code).trim() === code))
    .filter((e) => e && !(e.keywords?.length > 0) && !e.sector)
    .map((e) => ({ code: String(e.code).trim(), label: e.label ?? e.labelEn ?? '' }));

  rapport.resume = {
    ajoutes: rapport.ajoutes.length,
    modifies: rapport.modifies.length,
    reactives: rapport.reactives.length,
    inchanges: rapport.inchanges.length,
    retires: rapport.retires.length,
    muets: rapport.muets.length,
    applique: Boolean(apply),
    desactivationDesRetires: Boolean(apply && deactivateMissing),
  };

  if (!apply) return rapport;

  await withTransaction(async (client) => {
    for (const { code } of rapport.ajoutes) {
      const entree = entrees.find((e) => String(e.code).trim() === code);
      await client.query(
        `INSERT INTO mcc_codes (code, label_fr, description_fr, label_en, description_en,
                                keywords, similar_codes, ecommerce_relevance, risk_level,
                                note, networks, source, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          code, entree.label ?? entree.labelEn ?? '', entree.description ?? entree.descriptionEn ?? '',
          entree.labelEn ?? entree.label ?? '', entree.descriptionEn ?? entree.description ?? '',
          entree.keywords ?? [], entree.similar ?? [],
          entree.ecommerceRelevance ?? 'MEDIUM', entree.riskLevel ?? 'STANDARD',
          entree.note ?? null, entree.networks ?? ['VISA', 'MASTERCARD'],
          entree.source ?? 'Import référentiel', user.id,
        ]
      );
      const secteurs = secteursDeLEntree(entree);
      if (secteurs?.length) await ecrireSecteurs(client, code, secteurs);
      await historiser(client, {
        code, userId: user.id, action: 'IMPORT_AJOUT', avant: null, apres: entree, comment,
      });
    }

    for (const modification of rapport.modifies) {
      const entree = entrees.find((e) => String(e.code).trim() === modification.code);
      const avant = getMcc(modification.code);
      await client.query(
        `UPDATE mcc_codes
            SET label_fr = COALESCE($1, label_fr),
                description_fr = COALESCE($2, description_fr),
                label_en = COALESCE($3, label_en),
                description_en = COALESCE($4, description_en),
                keywords = COALESCE($5, keywords),
                similar_codes = COALESCE($6, similar_codes),
                ecommerce_relevance = COALESCE($7, ecommerce_relevance),
                risk_level = COALESCE($8, risk_level),
                note = $9,
                updated_at = now(), updated_by = $10
          WHERE code = $11`,
        [
          entree.label ?? null, entree.description ?? null,
          entree.labelEn ?? null, entree.descriptionEn ?? null,
          entree.keywords ?? null, entree.similar ?? null,
          entree.ecommerceRelevance ?? null, entree.riskLevel ?? null,
          entree.note ?? avant.note, user.id, modification.code,
        ]
      );
      const secteurs = secteursDeLEntree(entree);
      if (secteurs !== undefined) await ecrireSecteurs(client, modification.code, secteurs);
      await historiser(client, {
        code: modification.code, userId: user.id, action: 'IMPORT_MODIFICATION',
        avant: instantane(avant), apres: entree, comment,
      });
    }

    // Après les modifications : la remise en service est le dernier fait de
    // l'import pour ce code, et c'est elle qu'on veut lire en tête d'historique.
    for (const { code } of rapport.reactives) {
      await client.query(
        'UPDATE mcc_codes SET active = TRUE, updated_at = now(), updated_by = $1 WHERE code = $2',
        [user.id, code]
      );
      await historiser(client, {
        code, userId: user.id, action: 'IMPORT_REACTIVATION',
        avant: { active: false }, apres: { active: true }, comment,
      });
    }

    if (deactivateMissing) {
      for (const { code } of rapport.retires) {
        const avant = getMcc(code);
        await client.query(
          'UPDATE mcc_codes SET active = FALSE, updated_at = now(), updated_by = $1 WHERE code = $2',
          [user.id, code]
        );
        await historiser(client, {
          code, userId: user.id, action: 'IMPORT_DESACTIVATION',
          avant: instantane(avant), apres: { ...instantane(avant), active: false }, comment,
        });
      }
    }

    await client.query(
      `INSERT INTO admin_events (user_id, entity, entity_id, action, payload)
       VALUES ($1, 'MCC', 'IMPORT', 'IMPORT_REFERENTIEL', $2)`,
      [user.id, rapport.resume]
    );
  });

  await rechargerCatalogue();
  return rapport;
}
