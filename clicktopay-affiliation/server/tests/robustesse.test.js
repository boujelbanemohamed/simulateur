import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { CREDENTIALS, DEMANDE_VALIDE, app, pool, resetDatabase } from './helpers.js';

/**
 * Suite adversariale : types hostiles, concurrence et cycle de vie des jetons.
 * Chaque cas correspond à un défaut réellement observé en recette.
 */

const tokens = {};
const login = async (key) =>
  (await request(app).post('/api/auth/login').send(CREDENTIALS[key]).expect(200)).body.token;

const asAgent = () => ({ Authorization: `Bearer ${tokens.agent}` });
const asBanquier = () => ({ Authorization: `Bearer ${tokens.banquier}` });
const asAdmin = () => ({ Authorization: `Bearer ${tokens.admin}` });

const creerDemande = async (overrides = {}) =>
  (await request(app).post('/api/requests').set(asAgent())
    .send({ ...DEMANDE_VALIDE, ...overrides }).expect(201)).body;

describe('Types hostiles : aucune valeur ne doit être coercée à tort', () => {
  before(async () => {
    await resetDatabase();
    tokens.agent = await login('agent');
    tokens.admin = await login('admin');
  });

  test('la chaîne « false » ne déclenche pas un import destructeur', async () => {
    const res = await request(app)
      .post('/api/admin/mcc/import')
      .set(asAdmin())
      .send({
        entrees: [{ code: '5977', label: 'MODIFIE PAR ERREUR' }],
        apply: 'false',
        deactivateMissing: 'false',
      })
      .expect(200);

    assert.equal(res.body.resume.applique, false);
    assert.equal(res.body.resume.desactivationDesRetires, false);

    const inchange = await request(app).get('/api/admin/mcc/5977').set(asAdmin()).expect(200);
    assert.equal(inchange.body.label, 'Cosmétiques et parfumerie');

    const catalogue = await request(app).get('/api/admin/mcc?limit=1').set(asAdmin()).expect(200);
    assert.equal(catalogue.body.actifs, catalogue.body.total, 'aucun code désactivé');
  });

  test('active: « false » désactive, et ne réactive pas', async () => {
    const res = await request(app).put('/api/admin/mcc/5950').set(asAdmin())
      .send({ active: 'false' }).expect(200);
    assert.equal(res.body.active, false);

    await request(app).put('/api/admin/mcc/5950').set(asAdmin()).send({ active: 'true' }).expect(200);
  });

  test('une valeur booléenne incompréhensible est refusée, pas devinée', async () => {
    const res = await request(app).put('/api/admin/mcc/5950').set(asAdmin())
      .send({ active: 'peut-être' }).expect(400);
    assert.ok(res.body.details.some((d) => d.champ === 'active'));
  });

  test('les drapeaux métier « false » ne faussent pas le moteur de suggestion', async () => {
    const demande = await creerDemande({
      hasSubscription: 'false',
      isMarketplace: 'false',
      sellsAbroad: 'false',
    });
    assert.equal(demande.hasSubscription, false);
    assert.equal(demande.isMarketplace, false);
    assert.equal(demande.sellsAbroad, false);
  });

  test('une date inexistante est refusée avant PostgreSQL', async () => {
    for (const date of ['2026-02-30', '9999-99-99', '0000-00-00']) {
      const res = await request(app).post('/api/requests').set(asAgent())
        .send({ ...DEMANDE_VALIDE, companyCreatedOn: date }).expect(400);
      assert.ok(res.body.details.some((d) => d.champ === 'companyCreatedOn'), `refus attendu pour ${date}`);
    }
  });

  test('un montant hors capacité de colonne est refusé', async () => {
    const res = await request(app).post('/api/requests').set(asAgent())
      .send({ ...DEMANDE_VALIDE, shareCapital: 1e30 }).expect(400);
    assert.ok(res.body.details.some((d) => d.champ === 'shareCapital'));
  });

  test('un octet NUL est refusé au lieu de casser l’encodage', async () => {
    const res = await request(app).post('/api/requests').set(asAgent())
      .send({ ...DEMANDE_VALIDE, siteName: 'ab\u0000cd' }).expect(400);
    assert.ok(res.body.details.some((d) => d.champ === 'siteName'));
  });

  test('un identifiant non numérique donne 400 et non 500', async () => {
    for (const id of ['abc', '1.5', '-3']) {
      const res = await request(app).get(`/api/requests/${id}`).set(asAgent()).expect(400);
      assert.match(res.body.error, /invalide/);
    }
  });

  test('une pagination négative est ramenée à une borne saine', async () => {
    await request(app).get('/api/requests?limit=-5&offset=-10').set(asAgent()).expect(200);
    // Une limite négative est ramenée dans la plage autorisée : surtout, elle ne
    // doit plus tronquer la liste par la fin en silence.
    const res = await request(app).get('/api/admin/mcc?limit=-5').set(asAdmin()).expect(200);
    assert.ok(res.body.count >= 1 && res.body.count <= res.body.total);
    assert.equal(res.body.items[0].code, '4011', 'la liste commence bien au début');
    await request(app).get('/api/admin/events?limit=-1').set(asAdmin()).expect(200);
    await request(app).get('/api/admin/users?bankId=abc').set(asAdmin()).expect(400);
  });

  test('chaque ligne d’un import est validée, pas seulement son code', async () => {
    const res = await request(app).post('/api/admin/mcc/import').set(asAdmin())
      .send({ apply: true, entrees: [
        { code: '9911', riskLevel: 'PIRATE' },
        { code: '9912', label: 'x'.repeat(10000) },
      ] })
      .expect(400);
    const champs = res.body.details.map((d) => d.champ);
    assert.ok(champs.some((c) => c.includes('riskLevel')));
    assert.ok(champs.some((c) => c.includes('label')));
    await request(app).get('/api/admin/mcc/9911').set(asAdmin()).expect(404);
  });
});

describe('Concurrence : les garde-fous doivent tenir en parallèle', () => {
  before(async () => {
    await resetDatabase();
    tokens.agent = await login('agent');
    tokens.banquier = await login('banquier');
    tokens.admin = await login('admin');
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE affiliation_requests RESTART IDENTITY CASCADE');
  });

  test('deux soumissions simultanées : une seule aboutit', async () => {
    const demande = await creerDemande();
    const reponses = await Promise.all([
      request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()),
      request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()),
    ]);
    const codes = reponses.map((r) => r.status).sort();
    assert.deepEqual(codes, [200, 409]);

    const events = await request(app).get(`/api/requests/${demande.id}/events`).set(asAgent()).expect(200);
    assert.equal(events.body.filter((e) => e.type === 'SOUMISSION').length, 1);
  });

  test('deux décisions contradictoires simultanées : une seule est retenue', async () => {
    const demande = await creerDemande();
    await request(app).post(`/api/requests/${demande.id}/submit`).set(asAgent()).expect(200);

    const reponses = await Promise.all([
      request(app).post(`/api/requests/${demande.id}/decision`).set(asBanquier())
        .send({ decision: 'VALIDEE' }),
      request(app).post(`/api/requests/${demande.id}/decision`).set(asBanquier())
        .send({ decision: 'REJETEE', comment: 'refus concurrent' }),
    ]);
    assert.deepEqual(reponses.map((r) => r.status).sort(), [200, 409]);

    const events = await request(app).get(`/api/requests/${demande.id}/events`).set(asAgent()).expect(200);
    const decisions = events.body.filter((e) =>
      ['VALIDATION', 'VALIDATION_AVEC_MODIFICATION', 'REJETEE', 'COMPLEMENT_REQUIS'].includes(e.type)
    );
    assert.equal(decisions.length, 1, 'une seule décision au journal');
  });

  test('deux administrateurs qui se rétrogradent simultanément : il en reste un', async () => {
    const creer = async (n) =>
      (await request(app).post('/api/admin/users').set(asAdmin()).send({
        email: `concurrent${n}@admin.tn`, firstName: 'C', lastName: `A${n}`,
        role: 'ADMIN', bankId: 1, password: 'Provisoire2026',
      }).expect(201)).body;

    const jetonDe = async (email) => {
      const premier = (await request(app).post('/api/auth/login')
        .send({ email, password: 'Provisoire2026' }).expect(200)).body.token;
      const change = await request(app).post('/api/auth/password')
        .set({ Authorization: `Bearer ${premier}` })
        .send({ currentPassword: 'Provisoire2026', newPassword: 'MonMotDePasse2026' })
        .expect(200);
      return change.body.token;
    };

    const a1 = await creer(1);
    const a2 = await creer(2);
    const t1 = await jetonDe(a1.email);
    const t2 = await jetonDe(a2.email);

    // Seuls a1 et a2 restent administrateurs actifs.
    await pool.query("UPDATE users SET active = FALSE WHERE role = 'ADMIN' AND id NOT IN ($1, $2)", [a1.id, a2.id]);

    await Promise.all([
      request(app).put(`/api/admin/users/${a2.id}`).set({ Authorization: `Bearer ${t1}` }).send({ role: 'AGENT' }),
      request(app).put(`/api/admin/users/${a1.id}`).set({ Authorization: `Bearer ${t2}` }).send({ role: 'AGENT' }),
    ]);

    const { rows } = await pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'ADMIN' AND active");
    assert.equal(rows[0].total, 1, 'la plateforme conserve un administrateur');

    await pool.query("UPDATE users SET active = TRUE, role = 'ADMIN' WHERE email = $1", [CREDENTIALS.admin.email]);
  });

  test('deux créations simultanées du même MCC : 201 puis 409', async () => {
    const corps = { code: '9931', label: 'Doublon concurrent', description: 'Description suffisamment longue.' };
    const reponses = await Promise.all([
      request(app).post('/api/admin/mcc').set(asAdmin()).send(corps),
      request(app).post('/api/admin/mcc').set(asAdmin()).send({ ...corps, label: 'Autre' }),
    ]);
    assert.deepEqual(reponses.map((r) => r.status).sort(), [201, 409]);
  });
});

describe('Cycle de vie des jetons : les droits sont relus, pas figés', () => {
  before(async () => {
    await resetDatabase();
    tokens.agent = await login('agent');
    tokens.admin = await login('admin');
  });

  test('un compte désactivé perd immédiatement ses accès', async () => {
    const compte = (await request(app).post('/api/admin/users').set(asAdmin()).send({
      email: 'revoque@banque.tn', firstName: 'Re', lastName: 'Voque',
      role: 'AGENT', bankId: 1, password: 'Provisoire2026',
    }).expect(201)).body;

    const premier = (await request(app).post('/api/auth/login')
      .send({ email: 'revoque@banque.tn', password: 'Provisoire2026' }).expect(200)).body.token;
    const jeton = (await request(app).post('/api/auth/password')
      .set({ Authorization: `Bearer ${premier}` })
      .send({ currentPassword: 'Provisoire2026', newPassword: 'MonMotDePasse2026' })
      .expect(200)).body.token;

    await request(app).get('/api/requests').set({ Authorization: `Bearer ${jeton}` }).expect(200);
    await request(app).put(`/api/admin/users/${compte.id}`).set(asAdmin()).send({ active: false }).expect(200);
    await request(app).get('/api/requests').set({ Authorization: `Bearer ${jeton}` }).expect(401);
  });

  test('un agent muté de banque perd l’accès aux dossiers de son ancienne banque', async () => {
    const demande = await creerDemande({ siteName: 'Dossier BQ001' });

    await request(app).put('/api/admin/users/1').set(asAdmin()).send({ bankId: 2 }).expect(200);
    await request(app).get(`/api/requests/${demande.id}`).set(asAgent()).expect(403);
    await request(app).put(`/api/requests/${demande.id}`).set(asAgent())
      .send({ siteName: 'tentative' }).expect(403);

    await request(app).put('/api/admin/users/1').set(asAdmin()).send({ bankId: 1 }).expect(200);
  });

  test('une réinitialisation de mot de passe ferme les sessions déjà ouvertes', async () => {
    const compte = (await request(app).post('/api/admin/users').set(asAdmin()).send({
      email: 'session@banque.tn', firstName: 'Se', lastName: 'Ssion',
      role: 'AGENT', bankId: 1, password: 'Provisoire2026',
    }).expect(201)).body;

    const premier = (await request(app).post('/api/auth/login')
      .send({ email: 'session@banque.tn', password: 'Provisoire2026' }).expect(200)).body.token;
    const jeton = (await request(app).post('/api/auth/password')
      .set({ Authorization: `Bearer ${premier}` })
      .send({ currentPassword: 'Provisoire2026', newPassword: 'MonMotDePasse2026' })
      .expect(200)).body.token;
    await request(app).get('/api/requests').set({ Authorization: `Bearer ${jeton}` }).expect(200);

    // Une seconde d'écart : l'horodatage du jeton est à la seconde près.
    await new Promise((r) => setTimeout(r, 1100));
    await request(app).post(`/api/admin/users/${compte.id}/password`).set(asAdmin())
      .send({ password: 'Reinitialise2026' }).expect(200);

    await request(app).get('/api/requests').set({ Authorization: `Bearer ${jeton}` }).expect(401);
  });

  test('un changement de rôle s’applique sans reconnexion', async () => {
    await request(app).put('/api/admin/users/1').set(asAdmin()).send({ role: 'BANQUIER' }).expect(200);
    await request(app).post('/api/requests').set(asAgent()).send(DEMANDE_VALIDE).expect(403);
    await request(app).put('/api/admin/users/1').set(asAdmin()).send({ role: 'AGENT' }).expect(200);
    await request(app).post('/api/requests').set(asAgent()).send(DEMANDE_VALIDE).expect(201);
  });
});

describe('Limitation de débit sur la connexion', () => {
  before(async () => {
    await resetDatabase();
  });

  test('les tentatives répétées finissent par être refusées', async () => {
    const { loginLimiter } = await import('../src/routes/auth.js');
    const { createRateLimiter } = await import('../src/middleware/rateLimit.js');
    // Le limiteur applicatif est volontairement desserré dans les tests ; on
    // vérifie ici le composant lui-même, avec un seuil réaliste.
    const limiteur = createRateLimiter({ windowMs: 60000, max: 3, keyGenerator: () => 'ip:test' });
    const appels = [];
    const faux = { ip: '1.2.3.4', body: {} };
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => {
        limiteur(faux, { setHeader() {} }, (err) => {
          appels.push(err ? err.status : 200);
          resolve();
        });
      });
    }
    assert.deepEqual(appels, [200, 200, 200, 429, 429]);
    limiteur.stop();
    assert.ok(loginLimiter, 'la route de connexion est bien protégée');
  });
});


describe('Import Excel et CSV du référentiel', () => {
  let jetonAdmin;

  before(async () => {
    await resetDatabase();
    jetonAdmin = await login('admin');
  });

  const enTete = () => ({ Authorization: `Bearer ${jetonAdmin}` });

  /** Construit un classeur tel qu'une équipe métier le produirait. */
  const classeurMetier = async (lignes) => {
    const ExcelJS = (await import('exceljs')).default;
    const classeur = new ExcelJS.Workbook();
    const feuille = classeur.addWorksheet('MCC');
    feuille.addRow(['Niveau de vigilance', 'Code MCC', 'Intitulé', 'Description', 'Mots-clés', 'Pertinence', 'Responsable']);
    for (const l of lignes) feuille.addRow(l);
    return Buffer.from(await classeur.xlsx.writeBuffer());
  };

  test('la route d’export sert bien un classeur Excel', async () => {
    // `.buffer()` et `.parse()` sont indispensables : sans eux, supertest tente
    // d'analyser la réponse binaire comme du JSON et la requête reste en suspens.
    const res = await request(app)
      .get('/api/admin/mcc/export')
      .set(enTete())
      .buffer()
      .parse((reponse, callback) => {
        const morceaux = [];
        reponse.on('data', (m) => morceaux.push(m));
        reponse.on('end', () => callback(null, Buffer.concat(morceaux)));
      })
      .expect(200);

    assert.match(res.headers['content-type'], /spreadsheetml/);
    assert.match(res.headers['content-disposition'], /referentiel-mcc-\d{4}-\d{2}-\d{2}\.xlsx/);
    assert.equal(res.body.subarray(0, 2).toString(), 'PK', 'un .xlsx est une archive ZIP');
    assert.ok(res.body.length > 10000, 'le classeur porte bien les 279 codes');
  });

  test('un aller-retour export puis relecture ne modifie aucun code', async () => {
    const { catalogueComplet } = await import('../src/services/mccCatalog.js');
    const { ecrireReferentiel } = await import('../src/services/mccImportFile.js');

    for (const format of ['xlsx', 'csv']) {
      const fichier = await ecrireReferentiel(catalogueComplet(), format);
      const res = await request(app)
        .post('/api/admin/mcc/import-fichier')
        .set(enTete())
        .attach('fichier', fichier, `referentiel.${format}`)
        .expect(200);

      assert.equal(res.body.entrees.length, 279, `${format} : toutes les lignes relues`);
      assert.equal(res.body.anomalies.length, 0, `${format} : aucune anomalie`);
      assert.equal(res.body.rapport.resume.modifies, 0, `${format} : aucun écart`);
      assert.equal(res.body.rapport.resume.inchanges, 279);
    }
  });

  test('un fichier métier désordonné est lu, et ses anomalies signalées', async () => {
    const fichier = await classeurMetier([
      ['Sensible', 5977, 'Cosmétiques revus', 'Vente de produits de beauté.', 'cosmetique, parfum ; maquillage', 'Forte', 'Mme Ben Ali'],
      ['Standard', '5942', 'Librairies', 'Vente de livres imprimés.', 'librairie\nlivre', 'forte', ''],
      ['', '', '', '', '', '', ''],
      ['Standard', 'ABCD', 'Code illisible', 'x', '', '', ''],
      ['Standard', 5942, 'Doublon', 'y', '', '', ''],
      ['Extreme', 6012, 'Institutions', 'Services bancaires.', 'banque', 'Enorme', ''],
    ]);

    const res = await request(app)
      .post('/api/admin/mcc/import-fichier')
      .set(enTete())
      .attach('fichier', fichier, 'edition.xlsx')
      .expect(200);

    assert.equal(res.body.entrees.length, 3, 'la ligne vide, le code illisible et le doublon sont écartés');
    assert.ok(res.body.colonnesIgnorees.includes('Responsable'));
    const motifs = res.body.anomalies.map((a) => a.motif);
    assert.ok(motifs.some((m) => m.includes('illisible')));
    assert.ok(motifs.some((m) => m.includes('déjà présent')));
    assert.ok(motifs.some((m) => m.includes('Pertinence non reconnue')));
    assert.equal(res.body.rapport.resume.applique, false, 'la lecture ne modifie rien');
  });

  test('le CSV est accepté au même titre que l’Excel', async () => {
    const res = await request(app).get('/api/admin/mcc/export?format=csv').set(enTete()).expect(200);
    assert.match(res.headers['content-type'], /text\/csv/);

    const relecture = await request(app)
      .post('/api/admin/mcc/import-fichier')
      .set(enTete())
      .attach('fichier', Buffer.from(res.text ?? res.body), 'referentiel.csv')
      .expect(200);
    assert.equal(relecture.body.entrees.length, 279);
  });

  test('un fichier sans colonne « code » est refusé avec un message exploitable', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const classeur = new ExcelJS.Workbook();
    classeur.addWorksheet('x').addRow(['Truc', 'Machin']);
    const res = await request(app)
      .post('/api/admin/mcc/import-fichier')
      .set(enTete())
      .attach('fichier', Buffer.from(await classeur.xlsx.writeBuffer()), 'mauvais.xlsx')
      .expect(400);
    assert.match(res.body.error, /Colonne « code » introuvable/);
    assert.match(res.body.error, /Truc, Machin/);
  });

  test('un format non pris en charge est refusé', async () => {
    await request(app)
      .post('/api/admin/mcc/import-fichier')
      .set(enTete())
      .attach('fichier', Buffer.from('nimporte quoi'), 'referentiel.txt')
      .expect(400);
  });

  test('l’import reste réservé à l’administrateur', async () => {
    const agent = await login('agent');
    await request(app)
      .post('/api/admin/mcc/import-fichier')
      .set({ Authorization: `Bearer ${agent}` })
      .attach('fichier', Buffer.from('x'), 'referentiel.csv')
      .expect(403);
    await request(app).get('/api/admin/mcc/export').set({ Authorization: `Bearer ${agent}` }).expect(403);
  });
});

// Déclaré en toute fin de fichier : placé plus haut, ce hook fermait le pool
// avant les suites suivantes, qui restaient alors en attente indéfiniment.
after(async () => pool.end());
