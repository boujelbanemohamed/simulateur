import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { CREDENTIALS, app, pool, resetDatabase } from './helpers.js';

describe('Authentification', () => {
  before(async () => {
    await resetDatabase();
  });

  test('un agent se connecte avec ses identifiants', async () => {
    const res = await request(app).post('/api/auth/login').send(CREDENTIALS.agent).expect(200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'AGENT');
    assert.equal(res.body.user.bankName, 'Banque Nationale de Tunisie');
  });

  test('un mot de passe erroné est rejeté sans révéler si le compte existe', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CREDENTIALS.agent.email, password: 'mauvais' })
      .expect(401);
    assert.equal(res.body.error, 'Identifiants incorrects');

    const inconnu = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inconnu@banque.tn', password: 'mauvais' })
      .expect(401);
    assert.equal(inconnu.body.error, res.body.error);
  });

  test('une route protégée refuse un appel sans jeton', async () => {
    await request(app).get('/api/requests').expect(401);
  });

  test('/me renvoie le profil du porteur du jeton', async () => {
    const login = await request(app).post('/api/auth/login').send(CREDENTIALS.banquier);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    assert.equal(res.body.email, CREDENTIALS.banquier.email);
    assert.equal(res.body.role, 'BANQUIER');
  });

  test("le changement de mot de passe par l'utilisateur est journalisé (EVO-04)", async () => {
    const admin = (await request(app).post('/api/auth/login').send(CREDENTIALS.admin).expect(200)).body.token;
    const asAdmin = { Authorization: `Bearer ${admin}` };

    const cree = await request(app).post('/api/admin/users').set(asAdmin).send({
      email: 'trace.mdp@nouveau.tn', firstName: 'Trace', lastName: 'Motdepasse',
      role: 'AGENT', bankId: 1, password: 'Provisoire2026',
    }).expect(201);

    const jeton = (await request(app).post('/api/auth/login')
      .send({ email: 'trace.mdp@nouveau.tn', password: 'Provisoire2026' }).expect(200)).body.token;
    const asUtilisateur = { Authorization: `Bearer ${jeton}` };

    const lignes = async () => {
      const res = await request(app).get('/api/admin/events').set(asAdmin).expect(200);
      return res.body.items.filter((e) => e.action === 'CHANGEMENT_MOT_DE_PASSE');
    };

    // Un échec ne laisse aucune trace : le journal ne consigne que les faits.
    await request(app).post('/api/auth/password').set(asUtilisateur)
      .send({ currentPassword: 'MauvaisMotDePasse1', newPassword: 'Nouveau#2026x' }).expect(400);
    await request(app).post('/api/auth/password').set(asUtilisateur)
      .send({ currentPassword: 'Provisoire2026', newPassword: 'Provisoire2026' }).expect(400);
    assert.equal((await lignes()).length, 0);

    await request(app).post('/api/auth/password').set(asUtilisateur)
      .send({ currentPassword: 'Provisoire2026', newPassword: 'Nouveau#2026x' }).expect(200);

    const trace = (await lignes())[0];
    assert.ok(trace, 'le changement réussi est consigné');
    assert.equal(trace.entity, 'USER');
    assert.equal(trace.entityId, String(cree.body.id));
    assert.equal(trace.userName, 'Trace Motdepasse');
    assert.ok(trace.createdAt);
    // Le changement était imposé : le compte venait d'être créé.
    assert.deepEqual(trace.payload, { impose: true });
    const serialise = JSON.stringify(trace.payload);
    assert.ok(!serialise.includes('Provisoire2026'), "l'ancien mot de passe ne fuit pas");
    assert.ok(!serialise.includes('Nouveau#2026x'), 'le nouveau non plus');

    // Second changement, cette fois à l'initiative de l'utilisateur.
    const jeton2 = (await request(app).post('/api/auth/login')
      .send({ email: 'trace.mdp@nouveau.tn', password: 'Nouveau#2026x' }).expect(200)).body.token;
    await request(app).post('/api/auth/password').set({ Authorization: `Bearer ${jeton2}` })
      .send({ currentPassword: 'Nouveau#2026x', newPassword: 'Encore#2026x' }).expect(200);
    assert.deepEqual((await lignes())[0].payload, { impose: false });
  });

  test('le serveur répond au contrôle de santé', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.equal(res.body.status, 'ok');
  });

  after(async () => pool.end());
});
