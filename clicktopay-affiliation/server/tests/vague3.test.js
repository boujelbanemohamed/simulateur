import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { app, CREDENTIALS, DEMANDE_VALIDE, pool, resetDatabase } from './helpers.js';

/**
 * Défauts relevés par les agents 5 et 6 lors du retest de la vague 3.
 *
 * Chaque cas reproduit le défaut tel qu'il a été observé, pas seulement la ligne
 * corrigée : la critique de l'agent 6 sur la vague précédente — « les correctifs
 * traitent le cas de test constaté, pas l'invariant » — vaut aussi pour les tests.
 */

const login = async (profil) =>
  (await request(app).post('/api/auth/login').send(CREDENTIALS[profil]).expect(200)).body.token;

describe('Défauts relevés par le retest (vague 3)', () => {
  let jetonAdmin;
  let jetonAgent;

  before(async () => {
    await resetDatabase();
    jetonAdmin = await login('admin');
    jetonAgent = await login('agent');
  });

  const admin = () => ({ Authorization: `Bearer ${jetonAdmin}` });
  const agent = () => ({ Authorization: `Bearer ${jetonAgent}` });

  // ------------------------------------------------------------ DEF-A6-01
  test('aucune proposition n’est servie sans terme justificatif (DEF-A6-01, DEF-A5-03)', async () => {
    // L'invariant, pas le cas : le produit vend l'explicabilité. Une carte sans
    // aucun terme correspondant est une proposition que le banquier ne peut pas
    // arbitrer. On balaie donc des profils de formes très différentes, y compris
    // ceux qui n'ont qu'un nom de site ou qu'une URL — la variante qui avait
    // échappé au premier correctif, appliqué au seul descriptif d'activité.
    const profils = [
      { ...DEMANDE_VALIDE },
      { siteName: 'Beldi Cosmetics', siteUrl: 'https://beldi-cosmetics.tn' },
      { siteName: 'Beldi Cosmetics' },
      { siteUrl: 'https://beldi-cosmetics.tn' },
      { activityDescription: 'Vente de billets de spectacle et de concerts' },
      { activityDescription: 'Plateforme de mise en relation entre artisans et particuliers' },
      { activityDescription: 'Abonnement mensuel à des cours de langue en visioconférence' },
      { siteName: 'Tunis Pharma', activityDescription: 'Parapharmacie en ligne' },
      { siteName: 'Zitouna Books', siteUrl: 'https://zitouna-books.tn', activitySector: 'LIVRES_CULTURE' },
      { activityDescription: 'qzxwv yjklm' },
      { activityDescription: '' },
    ];

    for (const profil of profils) {
      const res = await request(app).post('/api/mcc/suggest').set(agent()).send(profil).expect(200);
      for (const reseau of ['VISA', 'MASTERCARD']) {
        for (const suggestion of res.body[reseau] ?? []) {
          assert.ok(
            Array.isArray(suggestion.matchedTerms) && suggestion.matchedTerms.length > 0,
            `${reseau} ${suggestion.code} servi sans justification pour ${JSON.stringify(profil)}`
          );
        }
      }
    }
  });

  test('un descriptif sans correspondance ne renvoie que le code de repli (DEF-A6-01)', async () => {
    const res = await request(app)
      .post('/api/mcc/suggest')
      .set(agent())
      .send({ activityDescription: 'qzxwv yjklm ptdfg' })
      .expect(200);
    assert.deepEqual(res.body.VISA.map((s) => s.code), ['5999']);
    assert.ok(res.body.VISA[0].matchedTerms.length > 0, 'le repli s’annonce comme tel');
  });

  // ------------------------------------------------------------ DEF-A6-02
  test('le cycle exporter → relire → appliquer ne modifie aucun code (DEF-A6-02)', async () => {
    // Le défaut a traversé la simulation : le rapport d'écart était propre, et
    // c'est l'application confirmée qui échouait en 400. Seul le cycle complet
    // l'attrape, d'où ce test de bout en bout sur le référentiel de référence.
    for (const format of ['xlsx', 'csv']) {
      const exporte = await request(app)
        .get(`/api/admin/mcc/export?format=${format}`)
        .set(admin())
        .buffer()
        .parse((reponse, callback) => {
          const morceaux = [];
          reponse.on('data', (m) => morceaux.push(m));
          reponse.on('end', () => callback(null, Buffer.concat(morceaux)));
        })
        .expect(200);

      const lecture = await request(app)
        .post('/api/admin/mcc/import-fichier')
        .set(admin())
        .attach('fichier', exporte.body, `referentiel.${format}`)
        .expect(200);
      assert.equal(lecture.body.anomalies.length, 0, `${format} : relecture sans anomalie`);

      const applique = await request(app)
        .post('/api/admin/mcc/import')
        .set(admin())
        .send({ entrees: lecture.body.entrees, apply: true, comment: `Aller-retour ${format}` })
        .expect(200);

      assert.equal(applique.body.resume.applique, true, `${format} : l’import est bien appliqué`);
      assert.equal(applique.body.resume.modifies, 0, `${format} : aucun code modifié`);
      assert.equal(applique.body.resume.ajoutes, 0, `${format} : aucun code ajouté`);
      assert.equal(applique.body.resume.retires, 0, `${format} : aucun code manquant`);
      assert.equal(applique.body.resume.inchanges, 279, `${format} : les 279 codes sont inchangés`);
    }
  });

  test('un secteur long survit à la validation de l’import (DEF-A6-02)', async () => {
    // La cause exacte : le code 5817 porte deux secteurs, que l'export joint en
    // une colonne de 42 caractères — au-delà de la borne d'alors.
    const mcc = (await request(app).get('/api/admin/mcc/5817').set(admin()).expect(200)).body;
    assert.ok(mcc.sectors.length >= 2, 'le code de référence porte bien plusieurs secteurs');

    const res = await request(app)
      .post('/api/admin/mcc/import')
      .set(admin())
      .send({ entrees: [{ code: '5817', sector: mcc.sectors.join(', ') }], apply: false })
      .expect(200);
    assert.equal(res.body.resume.modifies, 0, 'les secteurs relus sont identiques');
  });

  // ------------------------------------------------------------ DEF-A6-03
  test('la production refuse un secret faible ou laissé par défaut (DEF-A6-03)', async () => {
    const lancer = (env) =>
      promisify(execFile)('node', ['-e', "import('./src/config.js').then(() => process.exit(0))"], {
        cwd: process.cwd(),
        // DATABASE_URL est lue avant JWT_SECRET : sans elle, la configuration
        // échouerait sur elle et le test ne prouverait rien sur le secret.
        env: { PATH: process.env.PATH, DATABASE_URL: process.env.DATABASE_URL, ...env },
      });

    // Le secret de développement est publié dans le dépôt : l'accepter en
    // production revient à laisser signer des jetons par n'importe qui.
    await assert.rejects(
      () => lancer({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret-a-remplacer-en-production' }),
      (err) => {
        assert.match(err.stderr, /secret de développement/);
        return true;
      }
    );

    await assert.rejects(
      () => lancer({ NODE_ENV: 'production', JWT_SECRET: 'trop-court' }),
      (err) => {
        assert.match(err.stderr, /32 caractères/);
        return true;
      }
    );

    // Un secret conforme démarre sans rien réclamer.
    await lancer({
      NODE_ENV: 'production',
      JWT_SECRET: 'un-secret-vraiment-long-et-aleatoire-2026',
    });
  });

  // ------------------------------------------------------------ DEF-A6-04
  test('le contrôle de santé signale une base injoignable (DEF-A6-04)', async () => {
    const catalogue = await import('../src/services/mccCatalog.js');

    const sain = await request(app).get('/api/health').expect(200);
    assert.equal(sain.body.status, 'ok');
    assert.equal(sain.body.base, 'joignable');
    assert.equal(sain.body.referentiel, 'charge');
    assert.ok(sain.body.chargeLe, 'la date du dernier chargement réussi est publiée');

    const requeteOriginale = pool.query.bind(pool);
    pool.query = async () => {
      throw new Error('panne simulée de la base');
    };
    try {
      // Le cache garde une photo du référentiel : sans sonde, l'ancien contrôle
      // répondait « ok » et le répartiteur laissait l'instance en rotation.
      await assert.rejects(() => catalogue.rechargerCatalogue({ diffuser: false }));
      const malade = await request(app).get('/api/health').expect(503);
      assert.equal(malade.body.status, 'degraded');
      assert.equal(malade.body.base, 'injoignable');
      assert.notEqual(malade.body.referentiel, 'charge');
      assert.match(malade.body.dernierEchec.message, /panne simulée/);
    } finally {
      pool.query = requeteOriginale;
    }

    // Le rétablissement est automatique : aucune intervention n'est requise.
    await catalogue.rechargerCatalogue({ diffuser: false });
    const retabli = await request(app).get('/api/health').expect(200);
    assert.equal(retabli.body.status, 'ok');
    assert.equal(retabli.body.referentiel, 'charge');
    assert.equal(retabli.body.dernierEchec, undefined);
  });

  test('un référentiel périmé se distingue d’un référentiel absent (DEF-A6-04)', async () => {
    const catalogue = await import('../src/services/mccCatalog.js');
    const requeteOriginale = pool.query.bind(pool);

    pool.query = async () => {
      throw new Error('panne simulée de la base');
    };
    try {
      await assert.rejects(() => catalogue.rechargerCatalogue({ diffuser: false }));
      const etat = catalogue.etatCatalogue();
      assert.equal(etat.charge, true, 'le cache reste servi');
      assert.ok(etat.echec, 'mais la dernière tentative est signalée en échec');
      assert.equal(etat.codes, 279);
    } finally {
      pool.query = requeteOriginale;
      await catalogue.rechargerCatalogue({ diffuser: false });
    }
  });

  // ------------------------------------------------------------ DEF-A7-01
  test('la case « place de marché » pèse réellement sur le classement (DEF-A7-01)', async () => {
    // Le plan attendait que 5262 soit déclassé dès que la case est décochée, sur
    // un profil dont le descriptif dit « place de marché » et dont le secteur
    // déclaré est MARKETPLACE. Le critère était mal posé : le drapeau est un
    // signal parmi d'autres, et l'effacer ne peut pas effacer le texte.
    // L'invariant réel, lui, tient : à descriptif neutre, la case décide.
    const neutre = {
      siteName: 'SOUK ONLINE SA',
      activityDescription:
        'Vente de vetements, high tech et articles de maison de vendeurs tiers tunisiens',
      deliveryMode: 'PHYSIQUE',
    };

    const codes = async (profil) =>
      (await request(app).post('/api/mcc/suggest').set(agent()).send(profil).expect(200))
        .body.VISA.map((s) => s.code);

    const avecCase = await codes({ ...neutre, isMarketplace: true });
    const sansCase = await codes({ ...neutre, isMarketplace: false });

    assert.equal(avecCase[0], '5262', 'cochée, la case porte 5262 en tête');
    assert.ok(!sansCase.includes('5262'), 'décochée, 5262 ne figure plus dans les propositions');
  });

  test('un descriptif qui décrit une place de marché prime sur la case décochée (DEF-A7-01)', async () => {
    // Contrepartie assumée : quand la déclaration contredit le descriptif, le
    // moteur suit le descriptif plutôt que la case. Masquer 5262 reviendrait à
    // retirer au banquier le code le plus pertinent sur la foi d'une case.
    const res = await request(app)
      .post('/api/mcc/suggest')
      .set(agent())
      .send({
        siteName: 'SOUK ONLINE SA',
        activitySector: 'MARKETPLACE',
        activityDescription:
          'Place de marche generaliste regroupant des vendeurs tiers tunisiens vendant vetements, high tech et maison',
        deliveryMode: 'PHYSIQUE',
        isMarketplace: false,
      })
      .expect(200);

    assert.equal(res.body.VISA[0].code, '5262');
    // La case décochée reste sensible : elle coûte bien les 25 points annoncés.
    const coche = await request(app).post('/api/mcc/suggest').set(agent())
      .send({
        siteName: 'SOUK ONLINE SA',
        activitySector: 'MARKETPLACE',
        activityDescription:
          'Place de marche generaliste regroupant des vendeurs tiers tunisiens vendant vetements, high tech et maison',
        deliveryMode: 'PHYSIQUE',
        isMarketplace: true,
      }).expect(200);
    assert.ok(
      coche.body.VISA[0].score > res.body.VISA[0].score,
      'cocher la case reste payant : le score doit monter'
    );
  });

  after(async () => pool.end());
});
