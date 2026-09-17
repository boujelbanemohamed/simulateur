// Le test tourne sur une base dédiée : la configuration est fixée avant tout
// import de l'application, qui lit process.env au chargement.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://clicktopay:clicktopay@127.0.0.1:5432/clicktopay_test';
process.env.JWT_SECRET = 'secret-de-test';

const { readFile } = await import('node:fs/promises');
const { fileURLToPath } = await import('node:url');

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { seed } = await import('../src/db/seed.js');
const { rechargerCatalogue } = await import('../src/services/mccCatalog.js');

const CODES_DE_REFERENCE = JSON.parse(
  await readFile(fileURLToPath(new URL('../data/mcc-catalog.json', import.meta.url)), 'utf8')
).map((m) => m.code);

export { pool };
export const app = createApp();

/**
 * Remet la base dans l'état d'origine : demandes vidées, référentiel MCC réaligné
 * sur le fichier d'amorçage (les tests d'administration le modifient et lui
 * ajoutent des codes).
 */
export async function resetDatabase() {
  await pool.query('TRUNCATE affiliation_requests RESTART IDENTITY CASCADE');
  await pool.query('DELETE FROM mcc_codes WHERE code <> ALL($1::text[])', [CODES_DE_REFERENCE]);
  await pool.query('DELETE FROM mcc_code_history');
  await pool.query('DELETE FROM admin_events');
  await seed({ forceMcc: true });
  await pool.query("UPDATE mcc_codes SET active = TRUE WHERE NOT active");
  await rechargerCatalogue();
}

export const CREDENTIALS = {
  agent: { email: 'agent@banque.tn', password: 'Agent#2026' },
  agentAutreBanque: { email: 'agent2@banque.tn', password: 'Agent#2026' },
  banquier: { email: 'banquier@banque.tn', password: 'Banquier#2026' },
  admin: { email: 'admin@clicktopay.tn', password: 'Admin#2026' },
};

export const DEMANDE_VALIDE = {
  siteName: 'Beldi Cosmetics',
  siteUrl: 'https://beldi-cosmetics.tn',
  companyName: 'BELDI SARL',
  legalForm: 'SARL',
  rne: '1234567ABC',
  taxId: '1234567/A/M/000',
  contactFirstName: 'Amine',
  contactLastName: 'Zouari',
  contactEmail: 'contact@beldi.tn',
  contactPhone: '+216 71 123 456',
  addressLine1: '12 rue de Marseille',
  city: 'Tunis',
  postalCode: '1001',
  governorate: 'Tunis',
  activitySector: 'BEAUTE_COSMETIQUE',
  activityDescription:
    'Vente en ligne de cosmetiques naturels, huiles essentielles et savons artisanaux fabriques en Tunisie',
  deliveryMode: 'PHYSIQUE',
  proposedVisaMcc: '5977',
  proposedMastercardMcc: '5977',
};
