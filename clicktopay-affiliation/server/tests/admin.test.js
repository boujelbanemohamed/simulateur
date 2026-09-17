import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { CREDENTIALS, DEMANDE_VALIDE, app, pool, resetDatabase } from './helpers.js';

const tokens = {};
const login = async (email, password) => {
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return res.body.token;
};
const asAdmin = () => ({ Authorization: `Bearer ${tokens.admin}` });
const asAgent = () => ({ Authorization: `Bearer ${tokens.agent}` });

describe('Administration : profils et banques', () => {
  before(async () => {
    await resetDatabase();
    tokens.admin = await login(CREDENTIALS.admin.email, CREDENTIALS.admin.password);
    tokens.agent = await login(CREDENTIALS.agent.email, CREDENTIALS.agent.password);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%@nouveau.tn'");
    await pool.query("DELETE FROM admin_events WHERE entity = 'BANK'");
    await pool.query("DELETE FROM banks WHERE code = 'BQ099'");
  });

  test("l'administration est fermée aux autres profils", async () => {
    await request(app).get('/api/admin/users').set(asAgent()).expect(403);
    await request(app).get('/api/admin/banks').set(asAgent()).expect(403);
    await request(app).get('/api/admin/mcc').set(asAgent()).expect(403);
    await request(app).get('/api/admin/users').expect(401);
  });

  test('un administrateur liste les comptes avec leur banque', async () => {
    const res = await request(app).get('/api/admin/users').set(asAdmin()).expect(200);
    assert.ok(res.body.items.length >= 4);
    const agent = res.body.items.find((u) => u.email === CREDENTIALS.agent.email);
    assert.equal(agent.role, 'AGENT');
    assert.equal(agent.bankCode, 'BQ001');
    assert.equal(agent.active, true);
  });

  test('la création de compte impose une politique de mot de passe', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set(asAdmin())
      .send({ email: 'faible@nouveau.tn', firstName: 'Test', lastName: 'Faible', role: 'AGENT', bankId: 1, password: 'motdepasse' })
      .expect(400);
    assert.ok(res.body.details.some((d) => d.champ === 'password'));
  });

  test('un compte créé doit changer son mot de passe à la première connexion', async () => {
    const cree = await request(app)
      .post('/api/admin/users')
      .set(asAdmin())
      .send({ email: 'nouvel.agent@nouveau.tn', firstName: 'Nouvel', lastName: 'Agent', role: 'AGENT', bankId: 1, password: 'Provisoire2026' })
      .expect(201);
    assert.equal(cree.body.mustChangePassword, true);

    const connexion = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nouvel.agent@nouveau.tn', password: 'Provisoire2026' })
      .expect(200);
    const jeton = { Authorization: `Bearer ${connexion.body.token}` };

    // Tant que le mot de passe n'est pas changé, la plateforme reste fermée.
    const bloque = await request(app).get('/api/requests').set(jeton).expect(403);
    assert.match(bloque.body.error, /nouveau mot de passe/);

    const change = await request(app)
      .post('/api/auth/password')
      .set(jeton)
      .send({ currentPassword: 'Provisoire2026', newPassword: 'MonMotDePasse2026' })
      .expect(200);

    // Le jeton renvoyé après le changement ouvre bien la plateforme.
    await request(app)
      .get('/api/requests')
      .set({ Authorization: `Bearer ${change.body.token}` })
      .expect(200);
  });

  test('un mot de passe identique à l’ancien est refusé', async () => {
    await request(app)
      .post('/api/admin/users')
      .set(asAdmin())
      .send({ email: 'recyclage@nouveau.tn', firstName: 'Re', lastName: 'Cyclage', role: 'AGENT', bankId: 1, password: 'Provisoire2026' })
      .expect(201);
    const connexion = await request(app)
      .post('/api/auth/login')
      .send({ email: 'recyclage@nouveau.tn', password: 'Provisoire2026' });
    const res = await request(app)
      .post('/api/auth/password')
      .set({ Authorization: `Bearer ${connexion.body.token}` })
      .send({ currentPassword: 'Provisoire2026', newPassword: 'Provisoire2026' })
      .expect(400);
    assert.match(res.body.error, /différent/);
  });

  test('une adresse e-mail déjà utilisée est refusée', async () => {
    const payload = { email: 'doublon@nouveau.tn', firstName: 'A', lastName: 'B', role: 'AGENT', bankId: 1, password: 'Provisoire2026' };
    await request(app).post('/api/admin/users').set(asAdmin()).send(payload).expect(201);
    const res = await request(app).post('/api/admin/users').set(asAdmin()).send(payload).expect(409);
    assert.match(res.body.error, /existe déjà/);
  });

  test('un administrateur ne peut ni changer son propre rôle ni se désactiver', async () => {
    const moi = (await request(app).get('/api/admin/users').set(asAdmin()).expect(200))
      .body.items.find((u) => u.email === CREDENTIALS.admin.email);

    const role = await request(app)
      .put(`/api/admin/users/${moi.id}`)
      .set(asAdmin())
      .send({ role: 'AGENT' })
      .expect(403);
    assert.match(role.body.error, /votre propre rôle/);

    await request(app).put(`/api/admin/users/${moi.id}`).set(asAdmin()).send({ active: false }).expect(403);
  });

  test('le rôle et la banque d’un compte sont modifiables', async () => {
    const cree = await request(app)
      .post('/api/admin/users')
      .set(asAdmin())
      .send({ email: 'promu@nouveau.tn', firstName: 'Pro', lastName: 'Mu', role: 'AGENT', bankId: 1, password: 'Provisoire2026' })
      .expect(201);

    const res = await request(app)
      .put(`/api/admin/users/${cree.body.id}`)
      .set(asAdmin())
      .send({ role: 'BANQUIER', bankId: 2 })
      .expect(200);
    assert.equal(res.body.role, 'BANQUIER');
    assert.equal(res.body.bankCode, 'BQ002');
  });

  test('un compte désactivé ne peut plus se connecter', async () => {
    const cree = await request(app)
      .post('/api/admin/users')
      .set(asAdmin())
      .send({ email: 'sortant@nouveau.tn', firstName: 'Sor', lastName: 'Tant', role: 'AGENT', bankId: 1, password: 'Provisoire2026' })
      .expect(201);
    await request(app).put(`/api/admin/users/${cree.body.id}`).set(asAdmin()).send({ active: false }).expect(200);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'sortant@nouveau.tn', password: 'Provisoire2026' })
      .expect(401);
  });

  test("la réinitialisation par l'administrateur force un changement", async () => {
    const cree = await request(app)
      .post('/api/admin/users')
      .set(asAdmin())
      .send({ email: 'oubli@nouveau.tn', firstName: 'Ou', lastName: 'Bli', role: 'AGENT', bankId: 1, password: 'Provisoire2026' })
      .expect(201);
    const connexion = await request(app).post('/api/auth/login').send({ email: 'oubli@nouveau.tn', password: 'Provisoire2026' });
    await request(app)
      .post('/api/auth/password')
      .set({ Authorization: `Bearer ${connexion.body.token}` })
      .send({ currentPassword: 'Provisoire2026', newPassword: 'MonMotDePasse2026' })
      .expect(200);

    const reset = await request(app)
      .post(`/api/admin/users/${cree.body.id}/password`)
      .set(asAdmin())
      .send({ password: 'Nouveau2026Temp' })
      .expect(200);
    assert.equal(reset.body.mustChangePassword, true);

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'oubli@nouveau.tn', password: 'Nouveau2026Temp' })
      .expect(200);
    assert.equal(relogin.body.user.mustChangePassword, true);
  });

  test('la plateforme refuse de perdre son dernier administrateur', async () => {
    const autreAdmin = await request(app)
      .post('/api/admin/users')
      .set(asAdmin())
      .send({ email: 'admin2@nouveau.tn', firstName: 'Second', lastName: 'Admin', role: 'ADMIN', bankId: 1, password: 'Provisoire2026' })
      .expect(201);

    // Deux administrateurs actifs : la rétrogradation du second est possible.
    await request(app).put(`/api/admin/users/${autreAdmin.body.id}`).set(asAdmin()).send({ role: 'AGENT' }).expect(200);

    // Il ne reste que le compte courant : il ne peut pas se rétrograder (règle du compte courant).
    const moi = (await request(app).get('/api/admin/users').set(asAdmin()).expect(200))
      .body.items.find((u) => u.email === CREDENTIALS.admin.email);
    await request(app).put(`/api/admin/users/${moi.id}`).set(asAdmin()).send({ role: 'AGENT' }).expect(403);
  });

  test('les banques sont créées, listées et modifiées', async () => {
    const liste = await request(app).get('/api/admin/banks').set(asAdmin()).expect(200);
    assert.ok(liste.body.items.length >= 2);
    assert.ok(typeof liste.body.items[0].userCount === 'number');

    const creee = await request(app)
      .post('/api/admin/banks')
      .set(asAdmin())
      .send({ code: 'bq099', name: 'Banque de Test' })
      .expect(201);
    assert.equal(creee.body.code, 'BQ099', 'le code est normalisé en majuscules');

    await request(app).post('/api/admin/banks').set(asAdmin()).send({ code: 'BQ099', name: 'Doublon' }).expect(409);

    const modifiee = await request(app)
      .put(`/api/admin/banks/${creee.body.id}`)
      .set(asAdmin())
      .send({ name: 'Banque de Test SA', active: false })
      .expect(200);
    assert.equal(modifiee.body.name, 'Banque de Test SA');
    assert.equal(modifiee.body.active, false);

    // Une banque désactivée n'accueille plus de compte.
    const refus = await request(app)
      .post('/api/admin/users')
      .set(asAdmin())
      .send({ email: 'orphelin@nouveau.tn', firstName: 'Or', lastName: 'Phelin', role: 'AGENT', bankId: creee.body.id, password: 'Provisoire2026' })
      .expect(400);
    assert.match(refus.body.error, /désactivée/);
  });

  test('une banque comptant des utilisateurs actifs ne peut pas être désactivée', async () => {
    const res = await request(app).put('/api/admin/banks/1').set(asAdmin()).send({ active: false }).expect(409);
    assert.match(res.body.error, /compte\(s\) actif\(s\)/);
  });

  test("les actions d'administration sont journalisées", async () => {
    await request(app)
      .post('/api/admin/users')
      .set(asAdmin())
      .send({ email: 'trace@nouveau.tn', firstName: 'Tra', lastName: 'Ce', role: 'AGENT', bankId: 1, password: 'Provisoire2026' })
      .expect(201);

    const res = await request(app).get('/api/admin/events').set(asAdmin()).expect(200);
    const creation = res.body.items.find((e) => e.entity === 'USER' && e.action === 'CREATION');
    assert.ok(creation);
    assert.equal(creation.userName, 'Admin ClickToPay');
  });

});

describe('Administration : référentiel MCC', () => {
  before(async () => {
    await resetDatabase();
    tokens.admin = await login(CREDENTIALS.admin.email, CREDENTIALS.admin.password);
    tokens.agent = await login(CREDENTIALS.agent.email, CREDENTIALS.agent.password);
  });

  test("la vue administrateur expose aussi les codes interdits et désactivés", async () => {
    const res = await request(app).get('/api/admin/mcc?search=7995').set(asAdmin()).expect(200);
    assert.equal(res.body.items[0].code, '7995');
    assert.equal(res.body.items[0].riskLevel, 'INTERDIT');
    assert.equal(res.body.total, 279);
  });

  test('un MCC est modifiable et la modification est historisée', async () => {
    const res = await request(app)
      .put('/api/admin/mcc/5977')
      .set(asAdmin())
      .send({
        description: 'Vente au détail de produits cosmétiques, de parfums, de maquillage et de soins du corps.',
        keywords: ['cosmetique', 'parfum', 'maquillage', 'soin du corps', 'beaute'],
        comment: 'Precision demandee par la conformite',
      })
      .expect(200);
    assert.match(res.body.description, /soins du corps/);

    const histo = await request(app).get('/api/admin/mcc/5977/history').set(asAdmin()).expect(200);
    assert.equal(histo.body[0].action, 'MODIFICATION');
    assert.equal(histo.body[0].comment, 'Precision demandee par la conformite');
    assert.deepEqual(histo.body[0].champsModifies.sort(), ['description', 'keywords']);
    assert.equal(histo.body[0].userName, 'Admin ClickToPay');
  });

  test("le changement de niveau de vigilance s'applique immédiatement au moteur", async () => {
    const avant = await request(app)
      .post('/api/mcc/suggest')
      .set(asAgent())
      .send({ activityDescription: 'Vente en ligne de bijoux en or et de montres', limit: 20 })
      .expect(200);
    assert.ok(avant.body.VISA.some((m) => m.code === '5944'));

    await request(app)
      .put('/api/admin/mcc/5944')
      .set(asAdmin())
      .send({ riskLevel: 'INTERDIT', comment: 'Decision conformite' })
      .expect(200);

    const apres = await request(app)
      .post('/api/mcc/suggest')
      .set(asAgent())
      .send({ activityDescription: 'Vente en ligne de bijoux en or et de montres', limit: 20 })
      .expect(200);
    assert.ok(!apres.body.VISA.some((m) => m.code === '5944'), 'un code interdit n’est plus proposé');

    // Remise en état pour les tests suivants.
    await request(app).put('/api/admin/mcc/5944').set(asAdmin()).send({ riskLevel: 'SENSIBLE' }).expect(200);
  });

  test("un code désactivé disparaît du catalogue et n'est plus sélectionnable", async () => {
    await request(app)
      .put('/api/admin/mcc/5950')
      .set(asAdmin())
      .send({ active: false, comment: 'Code non utilise par l acquereur' })
      .expect(200);

    await request(app).get('/api/mcc/5950').set(asAgent()).expect(404);

    const res = await request(app)
      .post('/api/requests')
      .set(asAgent())
      .send({ ...DEMANDE_VALIDE, proposedVisaMcc: '5950' })
      .expect(400);
    assert.match(res.body.error, /désactivé/);

    const histo = await request(app).get('/api/admin/mcc/5950/history').set(asAdmin()).expect(200);
    assert.equal(histo.body[0].action, 'DESACTIVATION');

    await request(app).put('/api/admin/mcc/5950').set(asAdmin()).send({ active: true }).expect(200);
    await request(app).get('/api/mcc/5950').set(asAgent()).expect(200);
  });

  test('un code absent du manuel peut être ajouté', async () => {
    const res = await request(app)
      .post('/api/admin/mcc')
      .set(asAdmin())
      .send({
        code: '6555',
        label: 'Services locaux specifiques',
        description: 'Code local ouvert par l acquereur pour une activite non couverte par le manuel.',
        keywords: ['local', 'specifique'],
        ecommerceRelevance: 'MEDIUM',
      })
      .expect(201);
    assert.equal(res.body.code, '6555');

    await request(app).post('/api/admin/mcc').set(asAdmin()).send({
      code: '6555', label: 'Doublon', description: 'Description suffisamment longue pour passer.',
    }).expect(409);

    const visible = await request(app).get('/api/mcc/6555').set(asAgent()).expect(200);
    assert.equal(visible.body.label, 'Services locaux specifiques');
  });

  test("l'import produit un rapport d'écart sans rien modifier", async () => {
    const res = await request(app)
      .post('/api/admin/mcc/import')
      .set(asAdmin())
      .send({
        entrees: [
          { code: '5977', label: 'Cosmetiques, parfumerie et soins' },
          { code: '9998', label: 'Nouveau code de test', description: 'Code introduit par la nouvelle edition.' },
        ],
      })
      .expect(200);

    assert.equal(res.body.resume.ajoutes, 1);
    assert.equal(res.body.resume.modifies, 1);
    assert.equal(res.body.resume.applique, false);
    assert.ok(res.body.resume.retires > 250, 'les codes absents du fichier sont signalés');
    assert.equal(res.body.modifies[0].champs[0].champ, 'label');

    // Rien n'a bougé : le code annoncé en ajout n'existe pas.
    await request(app).get('/api/admin/mcc/9998').set(asAdmin()).expect(404);
  });

  test("l'import applique les écarts et historise chaque code touché", async () => {
    const res = await request(app)
      .post('/api/admin/mcc/import')
      .set(asAdmin())
      .send({
        apply: true,
        comment: 'Edition avril 2027',
        entrees: [
          { code: '5977', label: 'Cosmetiques, parfumerie et soins' },
          { code: '9998', label: 'Nouveau code de test', description: 'Code introduit par la nouvelle edition.' },
        ],
      })
      .expect(200);
    assert.equal(res.body.resume.applique, true);
    assert.equal(res.body.resume.desactivationDesRetires, false);

    const ajoute = await request(app).get('/api/admin/mcc/9998').set(asAdmin()).expect(200);
    assert.equal(ajoute.body.label, 'Nouveau code de test');

    const modifie = await request(app).get('/api/admin/mcc/5977').set(asAdmin()).expect(200);
    assert.equal(modifie.body.label, 'Cosmetiques, parfumerie et soins');

    const histo = await request(app).get('/api/admin/mcc/5977/history').set(asAdmin()).expect(200);
    assert.equal(histo.body[0].action, 'IMPORT_MODIFICATION');
    assert.equal(histo.body[0].comment, 'Edition avril 2027');

    // Les codes absents du fichier restent actifs tant qu'on ne le demande pas.
    await request(app).get('/api/mcc/5942').set(asAgent()).expect(200);
  });

  test('un fichier d’import invalide est rejeté avant toute écriture', async () => {
    await request(app).post('/api/admin/mcc/import').set(asAdmin()).send({ entrees: [] }).expect(400);

    const res = await request(app)
      .post('/api/admin/mcc/import')
      .set(asAdmin())
      .send({ apply: true, entrees: [{ code: '59' }] })
      .expect(400);
    assert.match(res.body.error, /invalide/);

    const doublon = await request(app)
      .post('/api/admin/mcc/import')
      .set(asAdmin())
      .send({ entrees: [{ code: '5977' }, { code: '5977' }] })
      .expect(400);
    assert.match(doublon.body.error, /plusieurs fois/);
  });

  test('le seed ne réécrit pas les ajustements de la conformité', async () => {
    await request(app)
      .put('/api/admin/mcc/5992')
      .set(asAdmin())
      .send({ label: 'Fleuristes et livraison florale', comment: 'Libelle metier' })
      .expect(200);

    const { seed } = await import('../src/db/seed.js');
    await seed();

    const apres = await request(app).get('/api/admin/mcc/5992').set(asAdmin()).expect(200);
    assert.equal(apres.body.label, 'Fleuristes et livraison florale');
  });
});

// Un seul arrêt du pool pour tout le fichier : chaque suite le partage.
after(async () => pool.end());
