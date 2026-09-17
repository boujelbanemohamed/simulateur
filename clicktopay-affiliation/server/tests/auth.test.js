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

  test('le serveur répond au contrôle de santé', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.equal(res.body.status, 'ok');
  });

  after(async () => pool.end());
});
