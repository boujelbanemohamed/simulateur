// Ce fichier exerce la limitation de débit elle-même : le seuil doit donc être
// réaliste, et non le seuil desserré que les autres suites emploient pour
// enchaîner des dizaines de connexions. Il est posé AVANT le chargement de
// `helpers.js`, qui lui-même précède l'import de la configuration.
process.env.LOGIN_RATE_LIMIT_MAX = '3';
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '60000';

const test = (await import('node:test')).default;
const { after, before, describe } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const request = (await import('supertest')).default;
const { CREDENTIALS, app, pool, resetDatabase } = await import('./helpers.js');

const connexionValide = () => request(app).post('/api/auth/login').send(CREDENTIALS.agent);
const corpsInvalide = (corps) => request(app).post('/api/auth/login').send(corps);

/**
 * Le compteur vit dans le processus et sa fenêtre couvre toute la suite : une
 * fois le quota dépassé, plus rien ne passe, pas même une connexion valide —
 * c'est le comportement attendu en production. L'ordre des tests s'y plie donc :
 * le dépassement est exercé en dernier.
 */
describe('Limitation de débit avant la validation du corps (EVO-11, CAS-AUTH-17)', () => {
  before(async () => {
    await resetDatabase();
  });

  test('un corps invalide est compté, et une connexion réussie remet le compteur à zéro', async () => {
    // Chaque tentative vise une adresse différente : seule la clé d'adresse IP
    // est ainsi mise à l'épreuve, la clé de compte n'ayant pas le temps de
    // s'accumuler — c'est bien le compteur d'IP que la remise à zéro doit vider.
    const premier = await corpsInvalide({ email: 'pas-une-adresse-1' }).expect(400);
    // Le message de validation reste celui d'avant : seule la place de la
    // limitation dans la chaîne change.
    assert.equal(premier.body.error, 'Données invalides');
    assert.ok(premier.body.details.some((d) => d.champ === 'email'));

    await corpsInvalide({ email: 'pas-une-adresse-2' }).expect(400);
    await connexionValide().expect(200);

    // Sans la remise à zéro, ces deux tentatives seraient les 4e et 5e de la
    // fenêtre, et la seconde partirait en 429.
    await corpsInvalide({ email: 'pas-une-adresse-3' }).expect(400);
    await corpsInvalide({ email: 'pas-une-adresse-4' }).expect(400);
    await connexionValide().expect(200);
  });

  test('au-delà du quota, un corps invalide reçoit 429 et non 400', async () => {
    const statuts = [];
    let derniere;
    // Deux corps sans adresse : aucune clé de compte ne peut être calculée,
    // seule la clé d'adresse IP les compte. Elles alimentent pourtant le même
    // quota que les corps porteurs d'une adresse.
    for (const corps of [{}, { email: 'pas-une-adresse' }, {}, { email: 'pas-une-adresse' }]) {
      derniere = await corpsInvalide(corps);
      statuts.push(derniere.status);
    }

    assert.deepEqual(statuts, [400, 400, 400, 429]);
    assert.ok(derniere.headers['retry-after'], "l'en-tête Retry-After accompagne le refus");
    assert.match(derniere.body.error, /Trop de tentatives/);

    // La limitation prime désormais sur tout le reste, connexion valide comprise.
    await connexionValide().expect(429);
  });

  after(async () => pool.end());
});
