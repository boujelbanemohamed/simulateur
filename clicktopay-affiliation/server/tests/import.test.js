import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { CREDENTIALS, app, pool, resetDatabase } from './helpers.js';

/**
 * Invariants de l'import du référentiel.
 *
 * L'import modifie la donnée réglementaire de toutes les banques d'un coup : ce
 * ne sont pas des cas de test isolés mais des invariants, et un invariant se
 * tient par un test, pas par une exécution unique en recette.
 */

let jetonAdmin;
let jetonAgent;
const asAdmin = () => ({ Authorization: `Bearer ${jetonAdmin}` });
const asAgent = () => ({ Authorization: `Bearer ${jetonAgent}` });

const login = async (cle) =>
  (await request(app).post('/api/auth/login').send(CREDENTIALS[cle]).expect(200)).body.token;

/**
 * Photographie de tout ce qu'un import peut écrire : les trois compteurs et une
 * empreinte du contenu des codes. Comparer les seuls compteurs laisserait passer
 * une modification sur place, qui est précisément ce qu'une simulation ne doit
 * pas faire.
 */
const photographie = async () => {
  const { rows } = await pool.query(`
    SELECT (SELECT count(*)::int FROM mcc_codes)        AS codes,
           (SELECT count(*)::int FROM mcc_code_history) AS historique,
           (SELECT count(*)::int FROM admin_events)     AS journal,
           (SELECT count(*)::int FROM mcc_codes WHERE active) AS actifs,
           (SELECT md5(string_agg(ligne, '|' ORDER BY ligne))
              FROM (SELECT code || label_fr || description_fr || risk_level ||
                           ecommerce_relevance || active::text AS ligne
                      FROM mcc_codes) t)                AS empreinte`);
  return rows[0];
};

/** Construit un classeur tel qu'une équipe métier le produirait. */
const classeurMetier = async (lignes) => {
  const ExcelJS = (await import('exceljs')).default;
  const classeur = new ExcelJS.Workbook();
  const feuille = classeur.addWorksheet('MCC');
  feuille.addRow(['Code MCC', 'Intitulé', 'Description', 'Pertinence', 'Niveau de vigilance']);
  for (const ligne of lignes) feuille.addRow(ligne);
  return Buffer.from(await classeur.xlsx.writeBuffer());
};

/** Deux lignes suffisent à couvrir les trois issues : modification, ajout, inchangé. */
const ENTREES = [
  { code: '5977', label: 'Cosmetiques, parfumerie et soins' },
  { code: '9998', label: 'Nouveau code de test', description: 'Code introduit par la nouvelle edition.' },
];

describe('Invariants de l’import du référentiel', () => {
  before(async () => {
    await resetDatabase();
    jetonAdmin = await login('admin');
    jetonAgent = await login('agent');
  });

  test('CAS-IMPORT-08 — la simulation n’écrit rien, ni par fichier ni par JSON', async () => {
    const avant = await photographie();

    const fichier = await classeurMetier([
      ['5977', 'Libellé qui ne doit pas être appliqué', 'Description qui ne doit pas être appliquée.', 'Forte', 'Standard'],
      ['9998', 'Code absent du référentiel', 'Il ne doit pas être créé par une simulation.', 'Moyenne', 'Standard'],
    ]);
    const parFichier = await request(app)
      .post('/api/admin/mcc/import-fichier')
      .set(asAdmin())
      .attach('fichier', fichier, 'edition.xlsx')
      .expect(200);
    assert.equal(parFichier.body.rapport.resume.applique, false);
    assert.ok(parFichier.body.rapport.resume.modifies >= 1, 'le rapport annonce bien un écart');

    const parJson = await request(app)
      .post('/api/admin/mcc/import')
      .set(asAdmin())
      .send({ entrees: ENTREES })
      .expect(200);
    assert.equal(parJson.body.resume.applique, false);

    assert.deepEqual(await photographie(), avant, 'aucune ligne ajoutée, aucune valeur modifiée');
    await request(app).get('/api/admin/mcc/9998').set(asAdmin()).expect(404);
  });

  test('CAS-IMPORT-09 — rien n’est appliqué sans confirmation explicite', async () => {
    const avant = await photographie();

    // `apply` absent, faux, et les deux écritures ambiguës que la carte de
    // conversion doit lire comme fausses.
    for (const apply of [undefined, false, 'false', 0]) {
      const corps = { entrees: ENTREES, ...(apply === undefined ? {} : { apply }) };
      const res = await request(app).post('/api/admin/mcc/import').set(asAdmin()).send(corps).expect(200);
      assert.equal(res.body.resume.applique, false, `apply=${JSON.stringify(apply)} ne doit rien appliquer`);
      assert.deepEqual(await photographie(), avant, `apply=${JSON.stringify(apply)} a écrit en base`);
    }

    // Seul `true` écrit.
    const applique = await request(app)
      .post('/api/admin/mcc/import')
      .set(asAdmin())
      .send({ apply: true, comment: 'Edition de test', entrees: ENTREES })
      .expect(200);
    assert.equal(applique.body.resume.applique, true);

    const apres = await photographie();
    assert.equal(apres.codes, avant.codes + 1, 'le code nouveau est créé');
    assert.ok(apres.historique > avant.historique, 'chaque code touché est historisé');
    assert.notEqual(apres.empreinte, avant.empreinte);

    await resetDatabase();
  });

  test('CAS-IMPORT-10 — la désactivation des absents est strictement optionnelle', async () => {
    const avant = await photographie();

    // Sans le drapeau : les codes absents du fichier restent en service.
    const sansDrapeau = await request(app)
      .post('/api/admin/mcc/import')
      .set(asAdmin())
      .send({ apply: true, entrees: [{ code: '5977' }] })
      .expect(200);
    assert.equal(sansDrapeau.body.resume.desactivationDesRetires, false);
    assert.ok(sansDrapeau.body.resume.retires > 250, 'les absents sont pourtant bien signalés');

    const sansEffet = await photographie();
    assert.equal(sansEffet.actifs, avant.actifs, 'aucun code désactivé sans le demander');
    assert.equal(sansEffet.codes, avant.codes, 'et surtout aucun code supprimé');

    // Avec le drapeau : désactivation, jamais suppression.
    const avecDrapeau = await request(app)
      .post('/api/admin/mcc/import')
      .set(asAdmin())
      .send({ apply: true, deactivateMissing: true, comment: 'Retrait édition 2027', entrees: [{ code: '5977' }] })
      .expect(200);
    assert.equal(avecDrapeau.body.resume.desactivationDesRetires, true);

    const apres = await photographie();
    assert.equal(apres.codes, avant.codes, 'un code retiré du manuel est désactivé, pas supprimé');
    assert.equal(apres.actifs, 1, 'seul le code présent au fichier reste actif');

    const { rows } = await pool.query(
      "SELECT code, comment FROM mcc_code_history WHERE action = 'IMPORT_DESACTIVATION'"
    );
    assert.equal(rows.length, avant.actifs - 1, 'chaque code désactivé porte sa ligne d’historique');
    assert.equal(rows[0].comment, 'Retrait édition 2027');

    // Le code désactivé n'est plus servi à l'agent.
    await request(app).get('/api/mcc/5942').set(asAgent()).expect(404);

    await resetDatabase();
  });

  test('CAS-IMPORT-06 — les anomalies portent leur numéro de ligne', async () => {
    const fichier = await classeurMetier([
      ['5977', 'Cosmétiques revus', 'Vente de produits de beauté.', 'Forte', 'Standard'], // ligne 2
      ['', 'Ligne sans code', 'Elle doit être signalée.', 'Forte', 'Standard'], //            ligne 3
      ['5977', 'Doublon', 'Deuxième occurrence du même code.', 'Forte', 'Standard'], //       ligne 4
      ['5942', 'Librairies', 'Vente de livres.', 'Énorme', 'Standard'], //                    ligne 5
      ['5941', 'Articles de sport', 'Vente d’articles de sport.', 'Forte', 'Extrême'], //     ligne 6
      ['5912', 'Pharmacies', 'Vente de parapharmacie.', 'Moyenne', 'Sensible'], //            ligne 7
    ]);

    const res = await request(app)
      .post('/api/admin/mcc/import-fichier')
      .set(asAdmin())
      .attach('fichier', fichier, 'edition-anomalies.xlsx')
      .expect(200);

    const anomalies = res.body.anomalies;
    assert.equal(anomalies.length, 4, 'quatre anomalies, une par ligne fautive');
    const parLigne = new Map(anomalies.map((a) => [a.ligne, a.motif]));
    assert.match(parLigne.get(3), /illisible ou absent/);
    assert.match(parLigne.get(4), /déjà présent ligne 2/);
    assert.match(parLigne.get(5), /Pertinence non reconnue/);
    assert.match(parLigne.get(6), /vigilance non reconnu/);

    // Le reste du fichier est lu normalement : les lignes saines sont retenues,
    // y compris celles qui ne portent qu'une anomalie de valeur.
    assert.deepEqual(res.body.entrees.map((e) => e.code), ['5977', '5942', '5941', '5912']);
    assert.equal(res.body.entrees[1].ecommerceRelevance, undefined, 'la pertinence illisible est écartée');
    assert.equal(res.body.entrees[2].riskLevel, undefined, 'la vigilance illisible est écartée');
    assert.equal(res.body.entrees[3].riskLevel, 'SENSIBLE');
  });

  test('EVO-09 — un code désactivé que le fichier réintroduit est remis en service', async () => {
    await request(app).put('/api/admin/mcc/5977').set(asAdmin())
      .send({ active: false, comment: 'Retiré par erreur' }).expect(200);

    const fichier = [{ code: '5977' }, { code: '5942' }];

    // Simulation : la réactivation est annoncée, rien n'est écrit.
    const avant = await photographie();
    const simulation = await request(app).post('/api/admin/mcc/import').set(asAdmin())
      .send({ entrees: fichier }).expect(200);
    assert.equal(simulation.body.resume.reactives, 1);
    assert.deepEqual(simulation.body.reactives.map((r) => r.code), ['5977']);
    assert.equal(simulation.body.resume.inchanges, 1, 'un code désactivé n’est pas « inchangé »');
    assert.deepEqual(await photographie(), avant, 'la simulation n’écrit rien');

    // La présence au fichier prime sur la désactivation des absents.
    const applique = await request(app).post('/api/admin/mcc/import').set(asAdmin())
      .send({ apply: true, deactivateMissing: true, comment: 'Édition mai 2027', entrees: fichier })
      .expect(200);
    assert.equal(applique.body.resume.reactives, 1);
    assert.ok(!applique.body.retires.some((r) => r.code === '5977'));

    // Le code est de nouveau servi à l'agent, et de nouveau proposable.
    const servi = await request(app).get('/api/mcc/5977').set(asAgent()).expect(200);
    assert.equal(servi.body.active, true);
    const propositions = await request(app).post('/api/mcc/suggest').set(asAgent())
      .send({ activityDescription: 'Vente de cosmétiques, parfums et maquillage en ligne' })
      .expect(200);
    assert.ok(propositions.body.VISA.some((m) => m.code === '5977'));

    const histo = await request(app).get('/api/admin/mcc/5977/history').set(asAdmin()).expect(200);
    const reactivation = histo.body.find((h) => h.action === 'IMPORT_REACTIVATION');
    assert.ok(reactivation, 'la remise en service est historisée');
    assert.equal(reactivation.comment, 'Édition mai 2027');
    assert.deepEqual(reactivation.avant, { active: false });
    assert.deepEqual(reactivation.apres, { active: true });

    // Rejoué à l'identique, l'import ne trouve plus rien à faire.
    const stable = await photographie();
    const rejeu = await request(app).post('/api/admin/mcc/import').set(asAdmin())
      .send({ apply: true, entrees: fichier }).expect(200);
    assert.equal(rejeu.body.resume.reactives, 0);
    assert.equal(rejeu.body.resume.inchanges, 2);
    const apresRejeu = await photographie();
    assert.equal(apresRejeu.empreinte, stable.empreinte, 'aucune écriture sur les codes');

    await resetDatabase();
  });

  test('EVO-09 — un code réintroduit ET modifié cumule les deux effets', async () => {
    await request(app).put('/api/admin/mcc/5942').set(asAdmin())
      .send({ active: false, comment: 'Retiré par erreur' }).expect(200);

    const res = await request(app).post('/api/admin/mcc/import').set(asAdmin())
      .send({
        apply: true, comment: 'Édition juin 2027',
        entrees: [{ code: '5942', label: 'Librairies et papeterie' }],
      })
      .expect(200);
    assert.equal(res.body.resume.reactives, 1);
    assert.equal(res.body.resume.modifies, 1);

    const code = await request(app).get('/api/admin/mcc/5942').set(asAdmin()).expect(200);
    assert.equal(code.body.active, true);
    assert.equal(code.body.label, 'Librairies et papeterie');

    const histo = await request(app).get('/api/admin/mcc/5942/history').set(asAdmin()).expect(200);
    const actions = histo.body.map((h) => h.action);
    assert.ok(actions.includes('IMPORT_REACTIVATION'));
    assert.ok(actions.includes('IMPORT_MODIFICATION'));

    await resetDatabase();
  });

  after(async () => pool.end());
});
