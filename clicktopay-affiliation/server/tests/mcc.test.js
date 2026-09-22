import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { CREDENTIALS, app, pool, resetDatabase } from './helpers.js';

let token;

describe('Référentiel et suggestion de MCC', () => {
  before(async () => {
    await resetDatabase();
    const login = await request(app).post('/api/auth/login').send(CREDENTIALS.agent);
    token = login.body.token;
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  test('le catalogue expose les 279 MCC du manuel Visa', async () => {
    const res = await request(app).get('/api/mcc?limit=300').set(auth()).expect(200);
    assert.equal(res.body.total, 279);
    const mcc = res.body.items.find((m) => m.code === '5815');
    assert.ok(mcc.description.length > 10, 'chaque MCC porte une description en français');
    assert.ok(mcc.descriptionEn.length > 10, "la définition officielle Visa est conservée");
  });

  test('la recherche par mot-clé remonte le MCC attendu', async () => {
    const res = await request(app).get('/api/mcc?search=bijou').set(auth()).expect(200);
    assert.equal(res.body.items[0].code, '5944');
  });

  test('un code inconnu renvoie 404', async () => {
    await request(app).get('/api/mcc/0000').set(auth()).expect(404);
  });

  test('les secteurs d’activité sont exposés au formulaire', async () => {
    const res = await request(app).get('/api/mcc/secteurs').set(auth()).expect(200);
    assert.ok(res.body.length >= 20);
    assert.ok(res.body.every((s) => s.key && s.label && Array.isArray(s.mccs)));
  });

  test('la suggestion propose les mêmes codes pour Visa et Mastercard', async () => {
    const res = await request(app)
      .post('/api/mcc/suggest')
      .set(auth())
      .send({
        activityDescription: 'Livraison de pizzas et de sandwichs preparees a la commande',
        activitySector: 'RESTAURATION',
      })
      .expect(200);

    assert.deepEqual(
      res.body.VISA.map((s) => s.code),
      res.body.MASTERCARD.map((s) => s.code)
    );
    assert.equal(res.body.VISA[0].code, '5814', 'la restauration rapide arrive en tête');
  });

  test('chaque proposition porte une description et les termes qui l’ont déclenchée', async () => {
    const res = await request(app)
      .post('/api/mcc/suggest')
      .set(auth())
      .send({ activityDescription: 'Agence de voyage en ligne, reservation de sejours et circuits' })
      .expect(200);

    for (const suggestion of res.body.VISA) {
      assert.ok(suggestion.label, 'libellé présent');
      assert.ok(suggestion.description.length > 10, 'description présente pour le choix du banquier');
      assert.ok(suggestion.score > 0 && suggestion.score < 100);
      assert.ok(Array.isArray(suggestion.matchedTerms));
    }
    assert.ok(res.body.VISA.some((s) => s.code === '4722'));
  });

  test('une activité numérique fait remonter les MCC de biens numériques', async () => {
    const res = await request(app)
      .post('/api/mcc/suggest')
      .set(auth())
      .send({
        activityDescription: 'Vente de jeux video en telechargement et de credits de jeu',
        deliveryMode: 'NUMERIQUE',
      })
      .expect(200);
    assert.ok(res.body.VISA.slice(0, 3).some((s) => s.code === '5816'));
  });

  test('une place de marché est orientée vers le MCC 5262', async () => {
    const res = await request(app)
      .post('/api/mcc/suggest')
      .set(auth())
      .send({
        activityDescription: 'Plateforme mettant en relation des vendeurs tiers et des acheteurs',
        isMarketplace: true,
      })
      .expect(200);
    assert.equal(res.body.VISA[0].code, '5262');
  });

  test('aucun MCC interdit n’est jamais proposé automatiquement', async () => {
    const res = await request(app)
      .post('/api/mcc/suggest')
      .set(auth())
      .send({
        activityDescription: 'Site de paris sportifs et de jeux de casino en ligne avec mises',
        limit: 20,
      })
      .expect(200);
    assert.ok(res.body.VISA.every((s) => s.riskLevel !== 'INTERDIT'));
  });

  test('un descriptif sans correspondance retombe sur un code de repli', async () => {
    const res = await request(app)
      .post('/api/mcc/suggest')
      .set(auth())
      .send({ activityDescription: 'zzzz qqqq xxxx' })
      .expect(200);
    assert.ok(res.body.VISA.length >= 1);
    assert.equal(res.body.VISA[0].code, '5999');
  });

  test('le repli 5999 désactivé ne produit pas une proposition mutilée (EVO-02)', async () => {
    const admin = await request(app).post('/api/auth/login').send(CREDENTIALS.admin).expect(200);
    const asAdmin = { Authorization: `Bearer ${admin.body.token}` };

    await request(app)
      .put('/api/admin/mcc/5999')
      .set(asAdmin)
      .send({ active: false, comment: 'Retrait du code fourre-tout' })
      .expect(200);

    const res = await request(app)
      .post('/api/mcc/suggest')
      .set(auth())
      .send({ activityDescription: 'zzzz qqqq xxxx' })
      .expect(200);

    // Un référentiel qui ne permet aucune proposition n'est pas une erreur
    // serveur : c'est une liste vide, que l'appelant sait traiter.
    assert.deepEqual(res.body, { VISA: [], MASTERCARD: [] });

    // Le rechargement du catalogue est déjà en place : pas de redémarrage.
    await request(app).put('/api/admin/mcc/5999').set(asAdmin).send({ active: true }).expect(200);
    const retabli = await request(app)
      .post('/api/mcc/suggest')
      .set(auth())
      .send({ activityDescription: 'zzzz qqqq xxxx' })
      .expect(200);
    assert.equal(retabli.body.VISA[0].code, '5999');
  });

  after(async () => pool.end());
});
