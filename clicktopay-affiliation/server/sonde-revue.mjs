process.env.TEST_DATABASE_URL = 'postgres://clicktopay:clicktopay@127.0.0.1:5432/revue_lot1_test';
const { app, pool, CREDENTIALS, resetDatabase } = await import('/home/user/simulateur/clicktopay-affiliation/server/tests/helpers.js');
const request = (await import('supertest')).default;
await resetDatabase();
const jeton = async (k) => (await request(app).post('/api/auth/login').send(CREDENTIALS[k])).body.token;
const admin = { Authorization: `Bearer ${await jeton('admin')}` };
const agent = { Authorization: `Bearer ${await jeton('agent')}` };

const montre = (t, r) => console.log(`${t.padEnd(52)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 190)}`);

console.log('=== EVO-10 : types de contenu ===');
montre('login multipart', await request(app).post('/api/auth/login').field('email','agent@banque.tn').field('password','Agent#2026'));
montre('login urlencoded', await request(app).post('/api/auth/login').type('form').send({email:'agent@banque.tn',password:'Agent#2026'}));
montre('login sans Content-Type', await request(app).post('/api/auth/login').set('Content-Type','').send('{"email":"a@b.tn","password":"x"}'));
montre('login application/json;charset=utf-8', await request(app).post('/api/auth/login').set('Content-Type','application/json; charset=utf-8').send('{"email":"agent@banque.tn","password":"Agent#2026"}'));
montre('login application/vnd.api+json', await request(app).post('/api/auth/login').set('Content-Type','application/vnd.api+json').send('{"email":"agent@banque.tn","password":"Agent#2026"}'));
montre('import-fichier multipart (EVO-10 doit rester admis)', await request(app).post('/api/admin/mcc/import-fichier').set(admin).attach('fichier', Buffer.from('code,label\n5977,Test\n'), 'ref.csv'));

console.log('\n=== Fuite par le message du lecteur de fichier ===');
montre('xlsx corrompu', await request(app).post('/api/admin/mcc/import-fichier').set(admin).attach('fichier', Buffer.from('ceci n est pas un zip'), 'ref.xlsx'));
montre('json corrompu', await request(app).post('/api/admin/mcc/import-fichier').set(admin).attach('fichier', Buffer.from('{"a":'), 'ref.json'));

console.log('\n=== EVO-06 : journal ===');
montre('events entity inconnue', await request(app).get('/api/admin/events?entity=BIDULE').set(admin));
montre('events dates inversees', await request(app).get('/api/admin/events?depuis=2026-09-22&jusqua=2026-09-21').set(admin));
montre('events date impossible', await request(app).get('/api/admin/events?depuis=2026-02-30').set(admin));
montre('events entity en tableau', await request(app).get('/api/admin/events?entity=USER&entity=BANK').set(admin));
montre('events action en tableau', await request(app).get('/api/admin/events?action=CREATION&action=MODIFICATION').set(admin));
montre('events offset enorme', await request(app).get('/api/admin/events?offset=999999').set(admin));
montre('events limit=abc', await request(app).get('/api/admin/events?limit=abc').set(admin));

console.log('\n=== Autorisation ===');
montre('events par un agent', await request(app).get('/api/admin/events').set(agent));

await pool.end();
process.exit(0);
