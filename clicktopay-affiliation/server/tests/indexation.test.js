import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { CREDENTIALS, app, pool, resetDatabase } from './helpers.js';

/**
 * Ce qu'un code importé devient pour le moteur de suggestion.
 *
 * Le manuel Visa ne fournit aucun mot-clé métier : sans dérivation ni
 * rattachement à un secteur, un code ajouté par import n'est trouvable que si
 * l'agent emploie par hasard les mots exacts de son libellé.
 */

const NOUVEAU = {
  code: '9101',
  label: 'Bornes de recharge pour trottinettes et vélos électriques',
  description: 'Exploitants de bornes de recharge en libre-service pour trottinettes et vélos électriques.',
  ecommerceRelevance: 'HIGH',
};

let admin;
let agent;

const importer = (entrees, options = {}) =>
  request(app).post('/api/admin/mcc/import').set(admin)
    .send({ apply: true, comment: 'Edition de test', entrees, ...options });

const suggerer = async (activityDescription, activitySector = null) =>
  (await request(app).post('/api/mcc/suggest').set(agent)
    .send({ activityDescription, activitySector, limit: 10 }).expect(200)).body.VISA;

const rangDe = (suggestions, code) => suggestions.findIndex((m) => m.code === code) + 1;

describe('Indexation des codes importés', () => {
  before(async () => {
    await resetDatabase();
    const jeton = async (cle) =>
      (await request(app).post('/api/auth/login').send(CREDENTIALS[cle]).expect(200)).body.token;
    admin = { Authorization: `Bearer ${await jeton('admin')}` };
    agent = { Authorization: `Bearer ${await jeton('agent')}` };
  });

  test('un code importé est indexé immédiatement, sans redémarrage', async () => {
    await importer([NOUVEAU]).expect(200);
    const suggestions = await suggerer('bornes de recharge pour trottinettes electriques');
    assert.equal(suggestions[0].code, '9101', 'proposé dès l’import');
  });

  test('ses mots-clés sont dérivés de son libellé et de sa description', async () => {
    const fiche = (await request(app).get('/api/admin/mcc/9101').set(admin).expect(200)).body;
    assert.equal(fiche.keywords.length, 0, 'aucun mot-clé métier fourni par le manuel');
    assert.ok(fiche.keywordsAuto.length >= 10, 'des mots-clés sont dérivés');
    assert.ok(fiche.keywordsAuto.includes('trottinettes'));
    assert.ok(fiche.keywordsAuto.includes('trottinette'), 'le singulier est dérivé du pluriel');
    assert.ok(fiche.keywordsAuto.includes('bornes recharge'), 'les expressions du libellé sont conservées');
  });

  test('le singulier retrouve un libellé écrit au pluriel', async () => {
    const suggestions = await suggerer("Installation d une borne de recharge pour velo electrique");
    const rang = rangDe(suggestions, '9101');
    assert.ok(rang > 0 && rang <= 3, `attendu dans le trio de tête, obtenu rang ${rang}`);
  });

  test('un code importé peut être rattaché à un secteur et en bénéficie', async () => {
    const sansSecteur = await suggerer('Exploitation de stations en libre service', 'TRANSPORT_LIVRAISON');
    const rangAvant = rangDe(sansSecteur, '9101');

    await request(app).put('/api/admin/mcc/9101').set(admin)
      .send({ sectors: ['TRANSPORT_LIVRAISON'], comment: 'Rattachement' }).expect(200);

    const avecSecteur = await suggerer('Exploitation de stations en libre service', 'TRANSPORT_LIVRAISON');
    const rangApres = rangDe(avecSecteur, '9101');

    assert.ok(rangApres > 0, 'le code est désormais proposé');
    assert.ok(
      rangAvant === 0 || rangApres < rangAvant,
      `le rattachement doit améliorer le rang (${rangAvant} -> ${rangApres})`
    );
  });

  test('un secteur inconnu est refusé', async () => {
    const res = await request(app).put('/api/admin/mcc/9101').set(admin)
      .send({ sectors: ['SECTEUR_IMAGINAIRE'] }).expect(400);
    assert.match(res.body.error, /Secteur inconnu/);
  });

  test('le rapport d’import signale les codes sans lexique métier', async () => {
    const res = await importer([
      { code: '9102', label: 'Conciergerie numérique', description: 'Plateformes de conciergerie du quotidien.' },
      { code: '9103', label: 'Ateliers de reparation de drones', description: 'Reparation de drones civils.',
        keywords: ['drone', 'reparation drone'] },
      { code: '9104', label: 'Cours de cuisine en ligne', description: 'Ateliers culinaires a distance.',
        sector: 'EDUCATION_FORMATION' },
    ], { apply: false }).expect(200);

    assert.equal(res.body.resume.ajoutes, 3);
    assert.equal(res.body.resume.muets, 1, 'seul le code sans mots-clés ni secteur est signalé');
    assert.equal(res.body.muets[0].code, '9102');
  });

  test('la colonne « Secteur » du fichier rattache le code à l’import', async () => {
    await importer([
      { code: '9104', label: 'Cours de cuisine en ligne', description: 'Ateliers culinaires a distance.',
        sector: 'EDUCATION_FORMATION' },
    ]).expect(200);

    const fiche = (await request(app).get('/api/admin/mcc/9104').set(admin).expect(200)).body;
    assert.deepEqual(fiche.sectors, ['EDUCATION_FORMATION']);
  });

  test('les secteurs sont servis depuis la base, avec leurs codes rattachés', async () => {
    const res = await request(app).get('/api/mcc/secteurs').set(agent).expect(200);
    assert.equal(res.body.length, 27);
    const transport = res.body.find((s) => s.key === 'TRANSPORT_LIVRAISON');
    assert.ok(transport.mccs.includes('9101'), 'le rattachement fait à l’administration est visible');
  });

  test('un lexique métier saisi à la main reste plus fort que les dérivés', async () => {
    const avant = await suggerer('On installe des prises pour recharger leur patinette en ville');
    assert.equal(rangDe(avant, '9101'), 0, 'un mot absent du libellé ne peut pas être deviné');

    await request(app).put('/api/admin/mcc/9101').set(admin)
      .send({ keywords: ['patinette', 'engin de deplacement personnel'], comment: 'Lexique client' })
      .expect(200);

    const apres = await suggerer('On installe des prises pour recharger leur patinette en ville');
    assert.equal(apres[0].code, '9101', 'le lexique saisi rend le code trouvable');
  });

  test("l'index est reconstruit quand le libellé change", async () => {
    // Le test précédent n'a fait qu'une simulation : le code n'existe pas encore.
    await importer([
      { code: '9102', label: 'Conciergerie numérique', description: 'Plateformes de conciergerie du quotidien.' },
    ]).expect(200);

    await request(app).put('/api/admin/mcc/9102').set(admin)
      .send({ label: 'Services de majordome et conciergerie', comment: 'Libelle revu' }).expect(200);

    const suggestions = await suggerer('Prestation de majordome pour particuliers');
    assert.ok(rangDe(suggestions, '9102') > 0, 'le nouveau libellé est immédiatement indexé');
  });
});

after(async () => pool.end());
