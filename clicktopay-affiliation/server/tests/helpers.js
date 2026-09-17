// Le test tourne sur une base dédiée : la configuration est fixée avant tout
// import de l'application, qui lit process.env au chargement.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://clicktopay:clicktopay@127.0.0.1:5432/clicktopay_test';
process.env.JWT_SECRET = 'secret-de-test';

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { seed } = await import('../src/db/seed.js');

export { pool };
export const app = createApp();

export async function resetDatabase() {
  await seed();
  await pool.query('TRUNCATE affiliation_requests RESTART IDENTITY CASCADE');
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
