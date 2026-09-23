import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { CREDENTIALS, DEMANDE_VALIDE, app, pool, resetDatabase } from './helpers.js';

/**
 * Décision D-3 : le banquier administre SA banque.
 *
 * Ce fichier éprouve les deux faces de la décision — ce que le banquier gagne,
 * et ce qu'il ne gagne pas. La seconde compte davantage : une habilitation
 * élargie ne se prouve pas par ce qu'elle autorise, mais par ce qu'elle refuse
 * encore. Les cas sont donc écrits autour des bornes, pas des permissions.
 */

const login = async (profil) =>
  (await request(app).post('/api/auth/login').send(CREDENTIALS[profil]).expect(200)).body.token;

describe('Habilitations du banquier (D-3)', () => {
  const jetons = {};

  before(async () => {
    await resetDatabase();
    jetons.admin = await login('admin');
    jetons.banquier = await login('banquier');
    jetons.agent = await login('agent');
    jetons.agentAutreBanque = await login('agentAutreBanque');
  });

  const admin = () => ({ Authorization: `Bearer ${jetons.admin}` });
  const banquier = () => ({ Authorization: `Bearer ${jetons.banquier}` });
  const agent = () => ({ Authorization: `Bearer ${jetons.agent}` });

  // ------------------------------------------------ ce que le banquier gagne

  test('le banquier administre les comptes de sa banque', async () => {
    const res = await request(app).get('/api/admin/users').set(banquier()).expect(200);
    assert.ok(res.body.items.length > 0);
    const banques = new Set(res.body.items.map((u) => u.bankId));
    assert.deepEqual([...banques], [1], 'seul le personnel de sa banque lui est montré');
  });

  test('le banquier crée un compte agent dans sa banque', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set(banquier())
      .send({
        email: 'nouvel.agent@nouveau.tn', password: 'Agent#2026!', firstName: 'Nour',
        lastName: 'Ben Salah', role: 'AGENT', bankId: 1,
      })
      .expect(201);
    assert.equal(res.body.role, 'AGENT');
    assert.equal(res.body.bankId, 1);
  });

  test('la banque du compte créé est celle du banquier, quoi que dise la requête', async () => {
    // Le corps de la requête ne décide pas : un banquier qui réussirait à poster
    // `bankId: 2` créerait un compte chez un concurrent.
    const res = await request(app)
      .post('/api/admin/users')
      .set(banquier())
      .send({
        email: 'detourne@nouveau.tn', password: 'Agent#2026!', firstName: 'Test',
        lastName: 'Détourné', role: 'AGENT', bankId: 2,
      })
      .expect(201);
    assert.equal(res.body.bankId, 1, 'la banque de l’appelant prime sur celle du corps');
  });

  test('le banquier réinitialise le mot de passe d’un de ses agents', async () => {
    // Sur le compte qu'il vient de créer, et non sur un compte de démonstration :
    // réinitialiser un mot de passe révoque les jetons en cours, et emporterait
    // ceux dont les cas suivants ont besoin.
    const liste = await request(app).get('/api/admin/users').set(banquier()).expect(200);
    const cible = liste.body.items.find((u) => u.email === 'nouvel.agent@nouveau.tn');
    assert.ok(cible, 'le compte créé au cas précédent est bien là');
    const res = await request(app)
      .post(`/api/admin/users/${cible.id}/password`)
      .set(banquier())
      .send({ password: 'Nouveau#2026' })
      .expect(200);
    assert.equal(res.body.mustChangePassword, true, 'le mot de passe devra être changé');
  });

  test('le banquier saisit, soumet puis arbitre un dossier de sa banque', async () => {
    const cree = (await request(app).post('/api/requests').set(banquier())
      .send({ ...DEMANDE_VALIDE, siteName: 'Dossier du banquier' }).expect(201)).body;
    await request(app).put(`/api/requests/${cree.id}`).set(banquier())
      .send({ siteName: 'Dossier du banquier, corrigé' }).expect(200);
    await request(app).post(`/api/requests/${cree.id}/submit`).set(banquier()).expect(200);
    const decide = await request(app).post(`/api/requests/${cree.id}/decision`).set(banquier())
      .send({ decision: 'VALIDEE', visaMcc: '5977', mastercardMcc: '5977' }).expect(200);
    assert.equal(decide.body.status, 'VALIDEE');
  });

  test('le banquier reprend le dossier d’un agent de sa banque', async () => {
    const dossier = (await request(app).post('/api/requests').set(agent())
      .send({ ...DEMANDE_VALIDE, siteName: 'Dossier de l’agent' }).expect(201)).body;
    const repris = await request(app).put(`/api/requests/${dossier.id}`).set(banquier())
      .send({ siteName: 'Repris par le banquier' }).expect(200);
    assert.equal(repris.body.siteName, 'Repris par le banquier');
  });

  test('le journal du banquier ne porte que les actions de sa banque', async () => {
    // L'ancienne version de ce cas n'assertait que `Array.isArray(items)` : elle
    // passait aussi bien sur le journal de toute la plateforme, et n'a donc rien
    // vu quand le filtre s'est révélé faux. Une épreuve par mutation l'a établi —
    // retirer le filtre laissait les 165 tests au vert.
    const avant = await request(app).get('/api/admin/events').set(banquier()).expect(200);

    // Une action de l'administrateur SUR UNE AUTRE BANQUE.
    const tous = await request(app).get('/api/admin/users').set(admin()).expect(200);
    const etranger = tous.body.items.find((u) => u.bankId !== 1);
    await request(app).put(`/api/admin/users/${etranger.id}`).set(admin())
      .send({ firstName: 'Trace' }).expect(200);

    // Une action sur le référentiel MCC, commun à toutes les banques.
    await request(app).put('/api/admin/mcc/5977').set(admin())
      .send({ note: `Trace ${Date.now()}` }).expect(200);

    const apres = await request(app).get('/api/admin/events').set(banquier()).expect(200);
    assert.equal(apres.body.items.length, avant.body.items.length,
      'aucune des deux actions n’a sa place dans le journal de la banque 1');
    assert.ok(!apres.body.items.some((e) => e.entity === 'MCC'),
      'le référentiel est commun : ses modifications ne sont d’aucune banque');

    // À l'inverse, une action de l'administrateur SUR la banque du banquier doit
    // y figurer, quel qu'en soit l'auteur : c'est sa piste d'audit.
    const sien = tous.body.items.find((u) => u.bankId === 1 && u.role === 'AGENT');
    await request(app).put(`/api/admin/users/${sien.id}`).set(admin())
      .send({ firstName: 'Suivi' }).expect(200);
    const final = await request(app).get('/api/admin/events').set(banquier()).expect(200);
    assert.equal(final.body.items.length, avant.body.items.length + 1,
      'une action de l’administrateur sur un compte de sa banque lui est visible');
  });

  test('une mutation de banque ne fait pas franchir la cloison à l’historique', async () => {
    // Le journal était partitionné en interrogeant la banque ACTUELLE de l'auteur.
    // Muter un compte d'une banque à l'autre emportait donc tout son historique
    // dans la banque d'arrivée, qui le découvrait, et le retirait à la banque de
    // départ, qui le perdait. La banque est désormais figée à l'écriture.
    const tous = await request(app).get('/api/admin/users').set(admin()).expect(200);
    const etranger = tous.body.items.find((u) => u.bankId !== 1);

    // Une action tracée alors que le compte est encore dans l'autre banque. On
    // évite volontairement la réinitialisation de mot de passe : elle révoque les
    // jetons du compte visé, et emporterait celui dont les cas suivants ont besoin.
    await request(app).put(`/api/admin/users/${etranger.id}`).set(admin())
      .send({ lastName: 'Historique' }).expect(200);
    const avant = await request(app).get('/api/admin/events').set(banquier()).expect(200);

    // On le mute vers la banque du banquier, puis on le remet.
    await request(app).put(`/api/admin/users/${etranger.id}`).set(admin())
      .send({ bankId: 1 }).expect(200);
    const pendant = await request(app).get('/api/admin/events').set(banquier()).expect(200);

    const historiqueImporte = pendant.body.items.filter(
      (e) => e.entity === 'USER' && e.entityId === String(etranger.id)
    );
    assert.equal(historiqueImporte.length, 0,
      'l’historique du compte muté reste dans la banque où il a été écrit');
    assert.ok(pendant.body.items.length >= avant.body.items.length,
      'la mutation elle-même est tracée, mais rien n’est importé rétroactivement');

    await request(app).put(`/api/admin/users/${etranger.id}`).set(admin())
      .send({ bankId: etranger.bankId }).expect(200);
  });

  // ------------------------------------------- ce que le banquier ne gagne pas

  test('le banquier ne crée ni banquier ni administrateur', async () => {
    for (const role of ['BANQUIER', 'ADMIN']) {
      const res = await request(app)
        .post('/api/admin/users')
        .set(banquier())
        .send({
          email: `pair.${role.toLowerCase()}@nouveau.tn`, password: 'Agent#2026!',
          firstName: 'Pair', lastName: role, role, bankId: 1,
        })
        .expect(403);
      assert.match(res.body.error, /que des comptes agents/);
    }
  });

  test('le banquier ne promeut pas un de ses agents', async () => {
    const liste = await request(app).get('/api/admin/users?role=AGENT').set(banquier()).expect(200);
    const cible = liste.body.items.find((u) => u.email === 'nouvel.agent@nouveau.tn');
    await request(app).put(`/api/admin/users/${cible.id}`).set(banquier())
      .send({ role: 'BANQUIER' }).expect(403);
  });

  test('le banquier ne déplace pas un compte vers une autre banque', async () => {
    const liste = await request(app).get('/api/admin/users?role=AGENT').set(banquier()).expect(200);
    const cible = liste.body.items.find((u) => u.email === 'nouvel.agent@nouveau.tn');
    await request(app).put(`/api/admin/users/${cible.id}`).set(banquier())
      .send({ bankId: 2 }).expect(403);
  });

  test('le banquier ne touche à aucun compte d’une autre banque', async () => {
    const tous = await request(app).get('/api/admin/users').set(admin()).expect(200);
    const etranger = tous.body.items.find((u) => u.bankId !== 1);
    assert.ok(etranger, 'le jeu de démonstration comporte bien une seconde banque');

    // 404 et non 403 : un compte d'une autre banque doit répondre comme un
    // compte inexistant, faute de quoi on dénombre le personnel d'en face.
    const refus = await request(app).get(`/api/admin/users/${etranger.id}`).set(banquier()).expect(404);
    const inexistant = await request(app).get('/api/admin/users/999999').set(banquier()).expect(404);
    assert.equal(
      refus.body.error.replace(/\d+/, 'N'),
      inexistant.body.error.replace(/\d+/, 'N'),
      'les deux refus doivent être identiques à l’identifiant près'
    );
    await request(app).put(`/api/admin/users/${etranger.id}`).set(banquier())
      .send({ firstName: 'Piraté' }).expect(404);
    await request(app).post(`/api/admin/users/${etranger.id}/password`).set(banquier())
      .send({ password: 'Pirate#2026' }).expect(404);
  });

  test('le banquier ne modifie pas un compte banquier ou administrateur de sa banque', async () => {
    const tous = await request(app).get('/api/admin/users').set(admin()).expect(200);
    const pair = tous.body.items.find((u) => u.bankId === 1 && u.role !== 'AGENT');
    assert.ok(pair, 'sa banque compte bien un compte non agent');
    await request(app).put(`/api/admin/users/${pair.id}`).set(banquier())
      .send({ firstName: 'Modifié' }).expect(403);
  });

  test('le référentiel MCC reste hors de portée du banquier', async () => {
    // Il est commun à toutes les banques : un code désactivé par l'un
    // disparaîtrait des propositions de tous les autres.
    await request(app).get('/api/admin/mcc').set(banquier()).expect(403);
    await request(app).get('/api/admin/mcc/5977').set(banquier()).expect(403);
    await request(app).put('/api/admin/mcc/5977').set(banquier())
      .send({ riskLevel: 'INTERDIT' }).expect(403);
    await request(app).post('/api/admin/mcc/import').set(banquier())
      .send({ entrees: [{ code: '5977' }], apply: true }).expect(403);
    await request(app).get('/api/admin/mcc/export').set(banquier()).expect(403);
  });

  test('le banquier ne crée pas de banque et ne voit que la sienne', async () => {
    const res = await request(app).get('/api/admin/banks').set(banquier()).expect(200);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].id, 1);
    await request(app).post('/api/admin/banks').set(banquier())
      .send({ code: 'PIR', name: 'Banque pirate' }).expect(403);
    await request(app).put('/api/admin/banks/2').set(banquier())
      .send({ name: 'Renommée' }).expect(403);
  });

  test('le banquier ne désactive pas sa propre banque', async () => {
    // Se couper l'accès à soi-même n'est pas une opération qu'on laisse faire
    // sans administrateur : la banque deviendrait inadministrable de l'intérieur.
    await request(app).put('/api/admin/banks/1').set(banquier())
      .send({ active: false }).expect(403);
  });

  test('le banquier ne voit ni ne touche un dossier d’une autre banque', async () => {
    const etranger = (await request(app).post('/api/requests')
      .set({ Authorization: `Bearer ${jetons.agentAutreBanque}` })
      .send({ ...DEMANDE_VALIDE, siteName: 'Dossier d’en face' }).expect(201)).body;

    await request(app).get(`/api/requests/${etranger.id}`).set(banquier()).expect(404);
    await request(app).put(`/api/requests/${etranger.id}`).set(banquier())
      .send({ siteName: 'Intrusion' }).expect(404);
    await request(app).post(`/api/requests/${etranger.id}/submit`).set(banquier()).expect(404);
  });

  // ---------------------------------------------- ce que l'agent ne gagne pas

  test('l’agent n’administre rien', async () => {
    for (const chemin of ['/api/admin/users', '/api/admin/banks', '/api/admin/events', '/api/admin/mcc']) {
      await request(app).get(chemin).set(agent()).expect(403);
    }
  });

  test('un agent ne modifie pas le dossier d’un autre agent de sa banque', async () => {
    const jetonCollegue = jetons.agent;
    const dossier = (await request(app).post('/api/requests')
      .set({ Authorization: `Bearer ${jetonCollegue}` })
      .send({ ...DEMANDE_VALIDE, siteName: 'Dossier d’un collègue' }).expect(201)).body;

    // Un second agent de la MÊME banque, créé pour l'occasion.
    await request(app).post('/api/admin/users').set(admin()).send({
      email: 'collegue@nouveau.tn', password: 'Agent#2026!', firstName: 'Collègue',
      lastName: 'Test', role: 'AGENT', bankId: 1,
    }).expect(201);
    const jeton = (await request(app).post('/api/auth/login')
      .send({ email: 'collegue@nouveau.tn', password: 'Agent#2026!' }).expect(200)).body.token;
    // Mot de passe imposé à la création : on le change avant tout autre usage.
    const jetonPret = (await request(app).post('/api/auth/password')
      .set({ Authorization: `Bearer ${jeton}` })
      .send({ currentPassword: 'Agent#2026!', newPassword: 'Collegue#2026' }).expect(200)).body.token;

    const refus = await request(app).put(`/api/requests/${dossier.id}`)
      .set({ Authorization: `Bearer ${jetonPret}` })
      .send({ siteName: 'Intrusion entre collègues' }).expect(403);
    assert.match(refus.body.error, /que les demandes que vous avez saisies/);
  });

  after(async () => pool.end());
});
