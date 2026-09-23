import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { CREDENTIALS, DEMANDE_VALIDE, app, pool, resetDatabase } from './helpers.js';

const tokens = {};

const login = async (key) => {
  const res = await request(app).post('/api/auth/login').send(CREDENTIALS[key]).expect(200);
  return res.body.token;
};

const asAgent = () => ({ Authorization: `Bearer ${tokens.agent}` });
const asBanquier = () => ({ Authorization: `Bearer ${tokens.banquier}` });

/** Crée une demande au statut BROUILLON et renvoie son corps. */
const creerDemande = async (overrides = {}) => {
  const res = await request(app)
    .post('/api/requests')
    .set(asAgent())
    .send({ ...DEMANDE_VALIDE, ...overrides })
    .expect(201);
  return res.body;
};

describe("Demandes d'affiliation", () => {
  before(async () => {
    await resetDatabase();
    tokens.agent = await login('agent');
    tokens.banquier = await login('banquier');
    tokens.agentAutreBanque = await login('agentAutreBanque');
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE affiliation_requests RESTART IDENTITY CASCADE');
  });

  test('un agent saisit une demande et obtient une référence', async () => {
    const demande = await creerDemande();
    assert.match(demande.reference, /^AFF-\d{4}-\d{5}$/);
    assert.equal(demande.status, 'BROUILLON');
    assert.equal(demande.siteName, DEMANDE_VALIDE.siteName);
    assert.equal(demande.createdByName, 'Salma Ben Ali');
  });

  test('les champs obligatoires sont contrôlés champ par champ', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set(asAgent())
      .send({ ...DEMANDE_VALIDE, siteUrl: 'pas-une-url', contactEmail: 'invalide', rne: '' })
      .expect(400);

    const champs = res.body.details.map((d) => d.champ);
    assert.ok(champs.includes('siteUrl'));
    assert.ok(champs.includes('contactEmail'));
    assert.ok(champs.includes('rne'));
  });

  test("un descriptif d'activité trop court est refusé : il alimente la suggestion", async () => {
    const res = await request(app)
      .post('/api/requests')
      .set(asAgent())
      .send({ ...DEMANDE_VALIDE, activityDescription: 'cosmetiques' })
      .expect(400);
    assert.ok(res.body.details.some((d) => d.champ === 'activityDescription'));
  });

  test("un MCC non éligible ne peut pas être proposé", async () => {
    const res = await request(app)
      .post('/api/requests')
      .set(asAgent())
      .send({ ...DEMANDE_VALIDE, proposedVisaMcc: '7995' })
      .expect(400);
    assert.match(res.body.error, /7995/);
    assert.match(res.body.error, /pas éligible/);
  });

  test('un banquier saisit des demandes dans sa banque (D-3)', async () => {
    // Décision du commanditaire : le banquier administre sa banque et y gère les
    // dossiers, il ne fait plus seulement arbitrer. L'ancienne règle — « un
    // banquier ne saisit pas » — est volontairement levée.
    const res = await request(app)
      .post('/api/requests')
      .set(asBanquier())
      .send({ ...DEMANDE_VALIDE, siteName: 'Saisie du banquier' })
      .expect(201);
    assert.equal(res.body.siteName, 'Saisie du banquier');
    // Le dossier reste rattaché à SA banque, pas à une autre.
    const fiche = await request(app).get(`/api/requests/${res.body.id}`).set(asBanquier()).expect(200);
    assert.equal(fiche.body.bankId, 1);
  });

  test('une demande est modifiable tant qu’elle est au brouillon', async () => {
    const demande = await creerDemande();
    const res = await request(app)
      .put(`/api/requests/${demande.id}`)
      .set(asAgent())
      .send({ siteName: 'Beldi Cosmetics Pro', proposedVisaMcc: '5999' })
      .expect(200);
    assert.equal(res.body.siteName, 'Beldi Cosmetics Pro');
    assert.equal(res.body.proposedVisaMcc, '5999');
  });

  test('la soumission exige un MCC Visa et un MCC Mastercard', async () => {
    const demande = await creerDemande({ proposedMastercardMcc: null });
    const res = await request(app)
      .post(`/api/requests/${demande.id}/submit`)
      .set(asAgent())
      .expect(400);
    assert.match(res.body.error, /Mastercard/);
  });

  test('la soumission fige les propositions du moteur pour le banquier', async () => {
    const demande = await creerDemande();
    const soumise = await request(app)
      .post(`/api/requests/${demande.id}/submit`)
      .set(asAgent())
      .expect(200);
    assert.equal(soumise.body.status, 'SOUMISE');
    assert.ok(soumise.body.submittedAt);

    const snapshot = await request(app)
      .get(`/api/requests/${demande.id}/suggestions`)
      .set(asBanquier())
      .expect(200);

    assert.ok(snapshot.body.VISA.length > 0);
    assert.ok(snapshot.body.MASTERCARD.length > 0);
    assert.equal(snapshot.body.VISA[0].code, '5977');
    assert.ok(snapshot.body.VISA[0].description.length > 10);
  });

  test('une demande soumise n’est plus modifiable par l’agent', async () => {
    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);
    const res = await request(app)
      .put(`/api/requests/${demande.id}`)
      .set(asAgent())
      .send({ siteName: 'Nouveau nom' })
      .expect(409);
    assert.match(res.body.error, /SOUMISE/);
  });

  test('le banquier valide en conservant les MCC proposés', async () => {
    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);

    const res = await request(app)
      .post(`/api/requests/${demande.id}/decision`)
      .set(asBanquier())
      .send({ decision: 'VALIDEE' })
      .expect(200);

    assert.equal(res.body.status, 'VALIDEE');
    assert.equal(res.body.finalVisaMcc, '5977');
    assert.equal(res.body.finalMastercardMcc, '5977');
    assert.equal(res.body.decidedByName, 'Karim Trabelsi');
  });

  test('le banquier peut substituer un autre MCC, réseau par réseau', async () => {
    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);

    const res = await request(app)
      .post(`/api/requests/${demande.id}/decision`)
      .set(asBanquier())
      .send({
        decision: 'VALIDEE',
        visaMcc: '5999',
        mastercardMcc: '5977',
        comment: 'Assortiment plus large que la seule parfumerie',
      })
      .expect(200);

    assert.equal(res.body.finalVisaMcc, '5999');
    assert.equal(res.body.finalMastercardMcc, '5977');
    assert.equal(res.body.proposedVisaMcc, '5977', 'la proposition initiale reste tracée');

    const events = await request(app)
      .get(`/api/requests/${demande.id}/events`)
      .set(asBanquier())
      .expect(200);
    assert.ok(events.body.some((e) => e.type === 'VALIDATION_AVEC_MODIFICATION'));
  });

  test('le banquier ne peut pas retenir un MCC interdit', async () => {
    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);
    await request(app)
      .post(`/api/requests/${demande.id}/decision`)
      .set(asBanquier())
      .send({ decision: 'VALIDEE', visaMcc: '5967' })
      .expect(400);
  });

  test('un rejet ou une demande de complément exige un commentaire', async () => {
    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);

    await request(app)
      .post(`/api/requests/${demande.id}/decision`)
      .set(asBanquier())
      .send({ decision: 'REJETEE' })
      .expect(400);

    const res = await request(app)
      .post(`/api/requests/${demande.id}/decision`)
      .set(asBanquier())
      .send({ decision: 'COMPLEMENT_REQUIS', comment: 'RNE illisible, merci de le corriger' })
      .expect(200);
    assert.equal(res.body.status, 'COMPLEMENT_REQUIS');
  });

  test('une demande renvoyée pour complément redevient modifiable puis re-soumissible', async () => {
    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);
    await request(app)
      .post(`/api/requests/${demande.id}/decision`)
      .set(asBanquier())
      .send({ decision: 'COMPLEMENT_REQUIS', comment: 'RNE illisible' })
      .expect(200);

    await request(app)
      .put(`/api/requests/${demande.id}`)
      .set(asAgent())
      .send({ rne: '7654321XYZ' })
      .expect(200);

    const res = await request(app)
      .post(`/api/requests/${demande.id}/submit`)
      .set(asAgent())
      .expect(200);
    assert.equal(res.body.status, 'SOUMISE');
  });

  test('un agent ne peut pas arbitrer une demande', async () => {
    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);
    await request(app)
      .post(`/api/requests/${demande.id}/decision`)
      .set(asAgent())
      .send({ decision: 'VALIDEE' })
      .expect(403);
  });

  test('seule une demande soumise peut être arbitrée', async () => {
    const demande = await creerDemande();
    await request(app)
      .post(`/api/requests/${demande.id}/decision`)
      .set(asBanquier())
      .send({ decision: 'VALIDEE' })
      .expect(409);
  });

  test('une demande reste invisible pour une autre banque', async () => {
    const demande = await creerDemande();
    // 404 et non 403 : le refus doit être indiscernable de celui d'une demande
    // inexistante, sans quoi balayer les identifiants permet de dénombrer les
    // dossiers d'une banque concurrente.
    const refus = await request(app)
      .get(`/api/requests/${demande.id}`)
      .set({ Authorization: `Bearer ${tokens.agentAutreBanque}` })
      .expect(404);
    const inexistante = await request(app)
      .get('/api/requests/999999')
      .set({ Authorization: `Bearer ${tokens.agentAutreBanque}` })
      .expect(404);
    assert.equal(
      refus.body.error.replace(/\d+/, 'N'),
      inexistante.body.error.replace(/\d+/, 'N'),
      'les deux refus doivent être identiques à l’identifiant près'
    );

    const liste = await request(app)
      .get('/api/requests')
      .set({ Authorization: `Bearer ${tokens.agentAutreBanque}` })
      .expect(200);
    assert.equal(liste.body.count, 0);
  });

  test('la liste se filtre par statut et par recherche', async () => {
    await creerDemande();
    const autre = await creerDemande({ siteName: 'Dar Artisanat', companyName: 'DAR SARL' });
    await request(app).post(`/api/requests/${autre.id}/submit`).set(asAgent()).expect(200);

    const soumises = await request(app).get('/api/requests?status=SOUMISE').set(asBanquier()).expect(200);
    assert.equal(soumises.body.count, 1);
    assert.equal(soumises.body.items[0].siteName, 'Dar Artisanat');

    const recherche = await request(app).get('/api/requests?search=Beldi').set(asAgent()).expect(200);
    assert.equal(recherche.body.count, 1);
  });

  test('le tableau de bord compte les demandes par statut', async () => {
    const demande = await creerDemande();
    await creerDemande({ siteName: 'Autre site' });
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);

    const res = await request(app).get('/api/requests/stats').set(asBanquier()).expect(200);
    assert.equal(res.body.BROUILLON, 1);
    assert.equal(res.body.SOUMISE, 1);
    assert.equal(res.body.TOTAL, 2);
  });

  test('le journal retrace chaque étape de manière nominative', async () => {
    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);
    await request(app)
      .post(`/api/requests/${demande.id}/decision`)
      .set(asBanquier())
      .send({ decision: 'VALIDEE' })
      .expect(200);

    const res = await request(app).get(`/api/requests/${demande.id}/events`).set(asAgent()).expect(200);
    assert.deepEqual(
      res.body.map((e) => e.type),
      ['CREATION', 'SOUMISSION', 'VALIDATION']
    );
    assert.equal(res.body[0].userName, 'Salma Ben Ali');
    assert.equal(res.body[2].userRole, 'BANQUIER');
  });

  test('la photographie des suggestions est autoportante (EVO-08)', async () => {
    const admin = (await request(app).post('/api/auth/login').send(CREDENTIALS.admin).expect(200)).body.token;
    const asAdmin = { Authorization: `Bearer ${admin}` };

    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);

    const relire = async () =>
      (await request(app).get(`/api/requests/${demande.id}/suggestions`).set(asBanquier()).expect(200)).body;

    const origine = (await relire()).VISA.find((m) => m.code === '5977');
    assert.equal(origine.label, 'Cosmétiques et parfumerie');
    assert.equal(origine.libelleActuel, undefined);
    assert.equal(origine.plusAuReferentiel, undefined);

    // Le code est renommé APRÈS la soumission : la photographie ne bouge pas.
    await request(app).put('/api/admin/mcc/5977').set(asAdmin)
      .send({ label: 'Parfumerie, cosmétique et soins du corps', comment: 'Libellé revu' }).expect(200);

    const renomme = (await relire()).VISA.find((m) => m.code === '5977');
    assert.equal(renomme.label, 'Cosmétiques et parfumerie', "le libellé servi est celui d'époque");
    assert.equal(renomme.libelleActuel, 'Parfumerie, cosmétique et soins du corps');
    assert.equal(renomme.description, origine.description);

    // Puis désactivé : la relecture reste complète, et le signale.
    await request(app).put('/api/admin/mcc/5977').set(asAdmin)
      .send({ active: false, comment: 'Code retiré du manuel' }).expect(200);

    const desactive = (await relire()).VISA.find((m) => m.code === '5977');
    assert.equal(desactive.code, '5977', 'jamais une entrée sans code');
    assert.equal(desactive.label, 'Cosmétiques et parfumerie');
    assert.equal(desactive.plusAuReferentiel, true);

    await request(app).put('/api/admin/mcc/5977').set(asAdmin).send({ active: true }).expect(200);
    await request(app).put('/api/admin/mcc/5977').set(asAdmin)
      .send({ label: 'Cosmétiques et parfumerie' }).expect(200);
  });

  test('une demande antérieure à la migration se relit en repli (EVO-08)', async () => {
    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);

    // Photographie d'avant l'évolution : les libellés n'y figuraient pas.
    await pool.query(
      'UPDATE mcc_suggestions SET label_at_submit = NULL, description_at_submit = NULL WHERE request_id = $1',
      [demande.id]
    );

    const res = await request(app)
      .get(`/api/requests/${demande.id}/suggestions`)
      .set(asBanquier())
      .expect(200);

    const entree = res.body.VISA.find((m) => m.code === '5977');
    assert.equal(entree.libelleReconstitue, true);
    assert.equal(entree.label, 'Cosmétiques et parfumerie', 'repli sur le catalogue courant');
    assert.ok(entree.description.length > 10);
  });

  after(async () => pool.end());
});
