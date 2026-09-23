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
    // 404 : un dossier hors périmètre se comporte comme un dossier inexistant.
    await request(app).get(`/api/requests/${demande.id}`).set(asAgent()).expect(404);
    await request(app).put(`/api/requests/${demande.id}`).set(asAgent())
      .send({ siteName: 'tentative' }).expect(404);

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
    // L'observable est l'accès à l'administration : depuis la décision D-3, le
    // banquier administre sa banque, l'agent n'administre rien. La saisie de
    // demandes ne départage plus les deux rôles, elle leur est commune.
    await request(app).get('/api/admin/users').set(asAgent()).expect(403);
    await request(app).put('/api/admin/users/1').set(asAdmin()).send({ role: 'BANQUIER' }).expect(200);
    await request(app).get('/api/admin/users').set(asAgent()).expect(200);
    await request(app).put('/api/admin/users/1').set(asAdmin()).send({ role: 'AGENT' }).expect(200);
    await request(app).get('/api/admin/users').set(asAgent()).expect(403);
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

describe('Défauts relevés par la revue de code', () => {
  let admin;
  let agent;

  before(async () => {
    await resetDatabase();
    const jeton = async (cle) =>
      (await request(app).post('/api/auth/login').send(CREDENTIALS[cle]).expect(200)).body.token;
    admin = { Authorization: `Bearer ${await jeton('admin')}` };
    agent = { Authorization: `Bearer ${await jeton('agent')}` };
  });

  test('la configuration refuse de démarrer en production sans secret (C-01)', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');

    const lancer = (env) =>
      promisify(execFile)('node', ['-e', "import('./src/config.js').then(() => process.exit(0))"], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH, ...env },
      });

    // En développement, les replis restent autorisés.
    await lancer({ NODE_ENV: 'development' });

    // En production, l'absence de secret doit être fatale.
    await assert.rejects(
      () => lancer({ NODE_ENV: 'production' }),
      (err) => {
        assert.match(err.stderr, /obligatoire en production/);
        return true;
      },
      'démarrer en production sans JWT_SECRET doit échouer'
    );
  });

  test("un échec de rechargement du référentiel ne fige pas l'application (C-12)", async () => {
    const catalogue = await import('../src/services/mccCatalog.js');
    const pool = (await import('../src/db/pool.js')).pool;

    // On force l'échec du rechargement en rendant la requête impossible.
    const requeteOriginale = pool.query.bind(pool);
    pool.query = async () => {
      throw new Error('panne simulée de la base');
    };
    await assert.rejects(() => catalogue.rechargerCatalogue({ diffuser: false }));
    pool.query = requeteOriginale;

    // Après la panne, l'application doit se rétablir d'elle-même.
    await catalogue.assurerCatalogueCharge();
    await request(app).get('/api/mcc?limit=1').set(agent).expect(200);
    await request(app).post('/api/auth/login').send(CREDENTIALS.agent).expect(200);
  });

  test('le contrôle de santé reflète l’état du référentiel (C-12)', async () => {
    const res = await request(app).get('/api/health').expect(200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.referentiel, 'charge');
  });

  test('aucune modification n’atterrit sur une demande déjà soumise (C-02)', async () => {
    // L'état final seul ne prouve rien : si la modification s'applique avant la
    // soumission, le résultat est légitime. Ce qui trahit le défaut, c'est
    // l'ordre des événements — une MODIFICATION journalisée après la SOUMISSION.
    for (let essai = 0; essai < 6; essai += 1) {
      const demande = (await request(app).post('/api/requests').set(agent)
        .send({ ...DEMANDE_VALIDE, siteName: `Course ${essai}` }).expect(201)).body;

      await Promise.all([
        request(app).post(`/api/requests/${demande.id}/submit`).set(agent),
        request(app).put(`/api/requests/${demande.id}`).set(agent)
          .send({ siteName: `Modifié pendant la course ${essai}` }),
      ]);

      const evenements = (await request(app).get(`/api/requests/${demande.id}/events`)
        .set(agent).expect(200)).body.map((e) => e.type);

      const soumission = evenements.indexOf('SOUMISSION');
      if (soumission === -1) continue; // la soumission a perdu la course
      const modificationTardive = evenements
        .slice(soumission + 1)
        .includes('MODIFICATION');
      assert.equal(modificationTardive, false,
        `essai ${essai} : une modification a été écrite après la soumission (${evenements.join(' > ')})`);
    }
  });

  test('modifier un MCC ne le relègue pas en fin de secteur (C-14)', async () => {
    const secteurs = async () =>
      (await request(app).get('/api/mcc/secteurs').set(agent).expect(200)).body
        .find((s) => s.key === 'MODE_HABILLEMENT').mccs;

    const avant = await secteurs();
    const premier = avant[0];
    assert.equal(premier, '5651', 'le code de tête du secteur mode');

    // Une modification quelconque, en renvoyant le même rattachement.
    await request(app).put(`/api/admin/mcc/${premier}`).set(admin)
      .send({ note: 'Note ajoutée par la recette', sectors: ['MODE_HABILLEMENT'] })
      .expect(200);

    const apres = await secteurs();
    assert.deepEqual(apres, avant, 'l’ordre du secteur est préservé');
  });

  test('un nouveau rattachement prend la fin de file, sans bousculer les autres (C-14)', async () => {
    const secteurs = async () =>
      (await request(app).get('/api/mcc/secteurs').set(agent).expect(200)).body
        .find((s) => s.key === 'ANIMALERIE').mccs;

    const avant = await secteurs();
    await request(app).put('/api/admin/mcc/5995').set(admin)
      .send({ sectors: ['ANIMALERIE', 'MODE_HABILLEMENT'] }).expect(200);

    const apres = await secteurs();
    assert.deepEqual(apres, avant, 'le secteur d’origine est inchangé');

    const mode = (await request(app).get('/api/mcc/secteurs').set(agent).expect(200)).body
      .find((s) => s.key === 'MODE_HABILLEMENT').mccs;
    assert.equal(mode[mode.length - 1], '5995', 'le nouveau rattachement arrive en fin de file');
  });
});

describe('Défauts relevés par la recette fonctionnelle (vague 2)', () => {
  let admin;
  let agent;

  before(async () => {
    await resetDatabase();
    const jeton = async (cle) =>
      (await request(app).post('/api/auth/login').send(CREDENTIALS[cle]).expect(200)).body.token;
    admin = { Authorization: `Bearer ${await jeton('admin')}` };
    agent = { Authorization: `Bearer ${await jeton('agent')}` };
  });

  test('un descriptif sans correspondance retombe sur le code de repli (DEF-A3-03)', async () => {
    const res = await request(app).post('/api/mcc/suggest').set(agent)
      .send({ activityDescription: 'zzzz qqqq xxxx wwww yyyy', limit: 10 }).expect(200);

    assert.equal(res.body.VISA.length, 1, 'une seule proposition : le code de repli');
    assert.equal(res.body.VISA[0].code, '5999');
    assert.ok(res.body.VISA[0].matchedTerms.length > 0, 'le repli est explicitement justifié');
  });

  test('aucune proposition n’est servie sans justification (DEF-A3-03)', async () => {
    for (const description of [
      'Vente en ligne de cosmetiques naturels et de parfums',
      'Livraison de pizzas et de sandwichs a domicile',
      'Reparation de telephones portables et de tablettes',
    ]) {
      const res = await request(app).post('/api/mcc/suggest').set(agent)
        .send({ activityDescription: description, limit: 10 }).expect(200);
      for (const suggestion of res.body.VISA) {
        assert.ok(
          suggestion.matchedTerms.length > 0,
          `${suggestion.code} proposé pour « ${description} » sans aucun terme justificatif`
        );
      }
    }
  });

  test('un code remonté par un mot-clé dérivé est justifié (DEF-A3-05)', async () => {
    await request(app).post('/api/admin/mcc').set(admin).send({
      code: '9201',
      label: 'Bornes de recharge pour trottinettes électriques',
      description: 'Exploitants de bornes de recharge en libre-service.',
      ecommerceRelevance: 'HIGH',
    }).expect(201);

    // « borne » au singulier : le libellé porte le pluriel, seule une variante
    // dérivée peut faire remonter le code.
    const res = await request(app).post('/api/mcc/suggest').set(agent)
      .send({ activityDescription: 'Installation d une borne de recharge en libre service', limit: 10 })
      .expect(200);

    const propose = res.body.VISA.find((m) => m.code === '9201');
    assert.ok(propose, 'le code est proposé grâce à la variante dérivée');
    assert.ok(propose.matchedTerms.length > 0, 'et le terme qui l’a fait remonter est affiché');
  });

  test('un jeton émis avant une réinitialisation est refusé, même à la seconde près (DEF-A3-02)', async () => {
    const compte = (await request(app).post('/api/admin/users').set(admin).send({
      email: 'fenetre@banque.tn', firstName: 'Fe', lastName: 'Netre',
      role: 'AGENT', bankId: 1, password: 'Provisoire2026',
    }).expect(201)).body;

    const premier = (await request(app).post('/api/auth/login')
      .send({ email: 'fenetre@banque.tn', password: 'Provisoire2026' }).expect(200)).body.token;
    const jeton = (await request(app).post('/api/auth/password')
      .set({ Authorization: `Bearer ${premier}` })
      .send({ currentPassword: 'Provisoire2026', newPassword: 'MonMotDePasse2026' })
      .expect(200)).body.token;
    await request(app).get('/api/requests').set({ Authorization: `Bearer ${jeton}` }).expect(200);

    // Sans attente : la réinitialisation suit immédiatement l'émission du jeton.
    await request(app).post(`/api/admin/users/${compte.id}/password`).set(admin)
      .send({ password: 'Reinitialise2026' }).expect(200);

    await request(app).get('/api/requests').set({ Authorization: `Bearer ${jeton}` }).expect(401);
  });

  test('le secteur est compare a l’import et n’est plus perdu (D2 et D3)', async () => {
    await request(app).put('/api/admin/mcc/9201').set(admin)
      .send({ sectors: ['TRANSPORT_LIVRAISON', 'AUTOMOBILE'] }).expect(200);

    // Un fichier qui ne change que le secteur ne doit plus être classé « inchangé ».
    const simulation = await request(app).post('/api/admin/mcc/import').set(admin)
      .send({ entrees: [{ code: '9201', sector: 'TRANSPORT_LIVRAISON' }] }).expect(200);
    assert.equal(simulation.body.resume.modifies, 1, 'l’écart de secteur est détecté');
    assert.ok(simulation.body.modifies[0].champs.some((c) => c.champ === 'sectors'));

    // Un aller-retour export/import conserve les deux rattachements.
    const { catalogueComplet } = await import('../src/services/mccCatalog.js');
    const { ecrireReferentiel } = await import('../src/services/mccImportFile.js');
    const fichier = await ecrireReferentiel(catalogueComplet(), 'xlsx');
    const relecture = await request(app).post('/api/admin/mcc/import-fichier').set(admin)
      .attach('fichier', fichier, 'referentiel.xlsx').expect(200);

    // L'ordre des secteurs d'un code n'a pas de sens (le rang se compte DANS un
    // secteur) : c'est l'ensemble qui doit être préservé.
    const ligne = relecture.body.entrees.find((e) => e.code === '9201');
    assert.deepEqual(
      ligne.sector.split(',').map((x) => x.trim()).sort(),
      ['AUTOMOBILE', 'TRANSPORT_LIVRAISON'],
      'les deux secteurs sont exportés'
    );
    const ecart = relecture.body.rapport.modifies.find((m) => m.code === '9201');
    assert.equal(ecart, undefined, 'l’aller-retour ne signale aucun écart de secteur');
  });

  test('les messages de validation sont en français (DEF-A3-04)', async () => {
    const trop = await request(app).put('/api/admin/mcc/5977').set(admin)
      .send({ label: 'x'.repeat(300) }).expect(400);
    assert.match(trop.body.details[0].message, /caractères au maximum/);

    const enumeration = await request(app).put('/api/admin/mcc/5977').set(admin)
      .send({ riskLevel: 'PIRATE' }).expect(400);
    assert.match(enumeration.body.details[0].message, /Valeur non autorisée/);

    const type = await request(app).put('/api/admin/mcc/5977').set(admin)
      .send({ keywords: [123] }).expect(400);
    assert.match(type.body.details[0].message, /Format attendu : texte/);

    // Aucun message ne doit rester en anglais.
    for (const reponse of [trop, enumeration, type]) {
      for (const detail of reponse.body.details) {
        assert.ok(
          !/must contain|Expected .* received|Invalid enum/.test(detail.message),
          `message non traduit : ${detail.message}`
        );
      }
    }
  });
});

describe("Écoute du référentiel : reprise après coupure (EVO-07)", () => {
  let catalogue;

  before(async () => {
    await resetDatabase();
    catalogue = await import('../src/services/mccCatalog.js');
  });

  // La connexion d'écoute est empruntée au lot : sans ce retour, `pool.end()`
  // attend indéfiniment et la suite ne se termine pas.
  after(() => catalogue.arreterEcoute());

  /** Attend qu'une condition devienne vraie, sans figer la suite si elle ne l'est jamais. */
  const attendre = async (condition, limiteMs = 10000) => {
    const echeance = Date.now() + limiteMs;
    while (!condition()) {
      if (Date.now() > echeance) throw new Error('condition jamais atteinte');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  test("une écoute perdue est rétablie, et le catalogue rechargé dans la foulée", async () => {
    const client = await catalogue.ecouterModifications();
    assert.equal(catalogue.etatCatalogue().ecoute, 'active');

    // Coupure : c'est l'événement que pg émet quand la connexion tombe.
    client.emit('error', new Error('connection terminated unexpectedly'));
    assert.equal(catalogue.etatCatalogue().ecoute, 'perdue');

    // Une écoute perdue ne rend pas l'instance indisponible.
    const pendantLaCoupure = await request(app).get('/api/health').expect(200);
    assert.ok(['perdue', 'active'].includes(pendantLaCoupure.body.ecoute));

    // Modification faite pendant la coupure : aucun NOTIFY ne l'annoncera,
    // puisque personne n'écoute. Seul le rechargement au rétablissement la voit.
    await pool.query(
      "UPDATE mcc_codes SET label_fr = 'Libellé posé pendant la coupure' WHERE code = '5999'"
    );
    assert.notEqual(catalogue.getMcc('5999').label, 'Libellé posé pendant la coupure');

    await attendre(() => catalogue.etatCatalogue().ecoute === 'active');
    await attendre(() => catalogue.getMcc('5999').label === 'Libellé posé pendant la coupure');

    const apres = await request(app).get('/api/health').expect(200);
    assert.equal(apres.body.ecoute, 'active');

    // L'écoute rétablie porte bien sur une NOUVELLE connexion.
    const repris = await catalogue.ecouterModifications();
    assert.notEqual(repris, client);
  });

  test("l'arrêt de l'écoute annule les tentatives de reprise", async () => {
    const client = await catalogue.ecouterModifications();
    client.emit('error', new Error('coupure'));
    assert.equal(catalogue.etatCatalogue().ecoute, 'perdue');

    catalogue.arreterEcoute();
    assert.equal(catalogue.etatCatalogue().ecoute, 'jamais_etablie');

    // Aucune reprise ne doit survenir après l'arrêt.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(catalogue.etatCatalogue().ecoute, 'jamais_etablie');
  });
});

describe('Aucune fuite par les erreurs (EVO-10)', () => {
  let agent;

  before(async () => {
    await resetDatabase();
    agent = { Authorization: `Bearer ${await login('agent')}` };
  });

  test('un corps JSON tronqué est refusé sans rien citer de ce qui a été reçu', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set(agent)
      .set('Content-Type', 'application/json')
      .send('{"siteName":')
      .expect(400);

    assert.equal(res.body.error, "Le corps de la requête n'est pas un JSON valide.");
    assert.deepEqual(Object.keys(res.body), ['error'], 'rien d’autre que le message');
    assert.ok(!JSON.stringify(res.body).includes('siteName'), 'aucun extrait du corps reçu');
  });

  test('un corps au-delà de la limite est refusé en 413', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set(agent)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ activityDescription: 'x'.repeat(2 * 1024 * 1024) }))
      .expect(413);
    assert.equal(res.body.error, 'Le corps de la requête dépasse la taille autorisée (1 Mo).');
  });

  test('un type de contenu inattendu est refusé en 415', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'text/plain')
      .send('email=agent@banque.tn&password=Agent#2026')
      .expect(415);
    assert.equal(res.body.error, 'Type de contenu non pris en charge : JSON attendu.');
  });

  test("une panne applicative ne sort que « Erreur interne du serveur »", async () => {
    const { pool: lot } = await import('../src/db/pool.js');
    const vraieRequete = lot.query.bind(lot);
    // Panne de base au milieu d'une lecture : le détail part au journal serveur,
    // jamais dans la réponse.
    lot.query = async () => {
      throw Object.assign(new Error('relation "affiliation_requests" does not exist'), { code: '42P01' });
    };
    try {
      const res = await request(app).get('/api/requests').set(agent).expect(500);
      assert.deepEqual(res.body, { error: 'Erreur interne du serveur' });
    } finally {
      lot.query = vraieRequete;
    }
  });

  test('balayage des routes : aucune réponse en erreur ne porte de trace technique', async () => {
    const appels = [
      request(app).get('/api/inconnue'),
      request(app).get('/api/requests'),
      request(app).get('/api/requests/999999').set(agent),
      request(app).get('/api/requests/abc').set(agent),
      request(app).get('/api/mcc/0000').set(agent),
      request(app).get('/api/admin/users').set(agent),
      request(app).post('/api/requests').set(agent).send({}),
      request(app).post('/api/mcc/suggest').set(agent).send({ limit: 'beaucoup' }),
      request(app).post('/api/auth/login').send({ email: 'pas-une-adresse', password: '' }),
      request(app).post('/api/auth/login').send({ email: { $ne: null }, password: [1, 2] }),
      request(app).put('/api/requests/1').set(agent).send({ shareCapital: 'beaucoup' }),
      request(app).post('/api/requests/1/submit').set(agent),
      request(app).post('/api/requests').set(agent).set('Content-Type', 'application/json').send('{['),
    ];

    const interdits = [/\bat\s+\/?\w[\w./-]*:\d+/, /node_modules/, /\n\s+at\s/, /SELECT\s|INSERT\s|UPDATE\s/i];
    for (const appel of appels) {
      const res = await appel;
      if (res.status < 400) continue;
      const corps = JSON.stringify(res.body);
      for (const motif of interdits) {
        assert.ok(!motif.test(corps), `fuite technique (${motif}) dans : ${corps.slice(0, 200)}`);
      }
    }
  });
});

describe("Diagnostic d'incident : conserver l'erreur d'origine (EVO-12)", () => {
  let admin;

  before(async () => {
    await resetDatabase();
    admin = { Authorization: `Bearer ${await login('admin')}` };
  });

  test("un retour arrière impossible n'efface pas l'erreur métier (C-04)", async () => {
    const lot = await import('../src/db/pool.js');
    const vraiConnect = lot.pool.connect.bind(lot.pool);
    const relachements = [];

    // Connexion qui meurt pendant la transaction : le ROLLBACK lève à son tour.
    lot.pool.connect = async () => ({
      query: async (sql) => {
        if (sql === 'ROLLBACK') throw new Error('Connection terminated unexpectedly');
        return { rows: [], rowCount: 0 };
      },
      release: (err) => relachements.push(err),
    });

    try {
      await assert.rejects(
        lot.withTransaction(async () => {
          throw new Error('Cette demande vient d’être soumise par ailleurs.');
        }),
        /vient d’être soumise/
      );
      assert.equal(relachements.length, 1);
      assert.match(relachements[0].message, /Connection terminated/,
        'la connexion suspecte est retirée du lot');
    } finally {
      lot.pool.connect = vraiConnect;
    }
  });

  test("un BEGIN en échec ne tente pas de retour arrière (C-04)", async () => {
    const lot = await import('../src/db/pool.js');
    const vraiConnect = lot.pool.connect.bind(lot.pool);
    const requetes = [];
    const relachements = [];

    lot.pool.connect = async () => ({
      query: async (sql) => {
        requetes.push(sql);
        throw new Error('Connection terminated unexpectedly');
      },
      release: (err) => relachements.push(err),
    });

    try {
      await assert.rejects(lot.withTransaction(async () => 'jamais atteint'), /Connection terminated/);
      assert.deepEqual(requetes, ['BEGIN'], 'aucun ROLLBACK sur une transaction jamais ouverte');
      assert.ok(relachements[0], 'la connexion est relâchée avec son erreur');
    } finally {
      lot.pool.connect = vraiConnect;
    }
  });

  test("une transaction saine ne détruit pas la connexion (C-04)", async () => {
    const lot = await import('../src/db/pool.js');
    // Un refus métier laisse la connexion utilisable : le lot doit la garder.
    await assert.rejects(
      lot.withTransaction(async (client) => {
        await client.query('SELECT 1');
        throw Object.assign(new Error('refus métier'), { status: 409 });
      }),
      /refus métier/
    );
    const { rows } = await lot.query('SELECT 1 AS un');
    assert.equal(rows[0].un, 1, 'le lot continue de servir');
  });

  test('un fichier trop volumineux est refusé en 413, pas en 500 (C-09)', async () => {
    const res = await request(app)
      .post('/api/admin/mcc/import-fichier')
      .set(admin)
      .attach('fichier', Buffer.alloc(6 * 1024 * 1024, 'x'), 'trop-gros.csv')
      .expect(413);
    assert.equal(res.body.error, 'Le fichier dépasse la taille autorisée (5 Mo).');
  });

  test('un champ de fichier inattendu est refusé en 400, pas en 500 (C-09)', async () => {
    const res = await request(app)
      .post('/api/admin/mcc/import-fichier')
      .set(admin)
      .attach('document', Buffer.from('code\n5977\n'), 'referentiel.csv')
      .expect(400);
    assert.equal(
      res.body.error,
      'Champ de fichier inattendu : le fichier doit être transmis sous le nom « fichier ».'
    );
  });

  test('une extension non acceptée conserve son message et son statut (C-09)', async () => {
    const res = await request(app)
      .post('/api/admin/mcc/import-fichier')
      .set(admin)
      .attach('fichier', Buffer.from('nimporte quoi'), 'referentiel.txt')
      .expect(400);
    assert.equal(res.body.error, 'Format non pris en charge : attendu .xlsx, .csv ou .json.');
  });
});
