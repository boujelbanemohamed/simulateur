import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { pool, withTransaction } from './pool.js';
import { migrate } from './migrate.js';
import { rechargerCatalogue } from '../services/mccCatalog.js';

// Fichier d'amorçage : il n'alimente que les codes absents de la base, qui fait foi.
const catalogPath = fileURLToPath(new URL('../../data/mcc-catalog.json', import.meta.url));
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

const BANKS = [
  { code: 'BQ001', name: 'Banque Nationale de Tunisie' },
  { code: 'BQ002', name: 'Banque Internationale Arabe de Tunisie' },
];

// Comptes de démonstration : à supprimer avant toute mise en production.
const USERS = [
  { email: 'agent@banque.tn', firstName: 'Salma', lastName: 'Ben Ali', role: 'AGENT', bank: 'BQ001', password: 'Agent#2026' },
  { email: 'banquier@banque.tn', firstName: 'Karim', lastName: 'Trabelsi', role: 'BANQUIER', bank: 'BQ001', password: 'Banquier#2026' },
  { email: 'agent2@banque.tn', firstName: 'Nadia', lastName: 'Gharbi', role: 'AGENT', bank: 'BQ002', password: 'Agent#2026' },
  { email: 'admin@clicktopay.tn', firstName: 'Admin', lastName: 'ClickToPay', role: 'ADMIN', bank: 'BQ001', password: 'Admin#2026' },
];

export async function seed({ withDemoUsers = true, forceMcc = false } = {}) {
  await migrate();

  await withTransaction(async (client) => {
    for (const bank of BANKS) {
      await client.query(
        `INSERT INTO banks (code, name) VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
        [bank.code, bank.name]
      );
    }

    // Amorçage du référentiel. Par défaut les codes déjà présents ne sont pas
    // touchés : la base fait foi et les ajustements de la conformité doivent
    // survivre à un redéploiement. `forceMcc` rejoue le fichier d'origine.
    const surConflit = forceMcc
      ? `DO UPDATE SET
           label_fr = EXCLUDED.label_fr,
           description_fr = EXCLUDED.description_fr,
           label_en = EXCLUDED.label_en,
           description_en = EXCLUDED.description_en,
           keywords = EXCLUDED.keywords,
           similar_codes = EXCLUDED.similar_codes,
           ecommerce_relevance = EXCLUDED.ecommerce_relevance,
           risk_level = EXCLUDED.risk_level,
           note = EXCLUDED.note,
           networks = EXCLUDED.networks,
           source = EXCLUDED.source,
           updated_at = now()`
      : 'DO NOTHING';

    for (const mcc of catalog) {
      await client.query(
        `INSERT INTO mcc_codes (code, label_fr, description_fr, label_en, description_en,
                                keywords, similar_codes, ecommerce_relevance, risk_level,
                                note, networks, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (code) ${surConflit}`,
        [
          mcc.code, mcc.label, mcc.description, mcc.labelEn, mcc.descriptionEn,
          mcc.keywords, mcc.similar, mcc.ecommerceRelevance, mcc.riskLevel,
          mcc.note, mcc.networks, mcc.source,
        ]
      );
    }

    if (withDemoUsers) {
      for (const user of USERS) {
        const hash = await bcrypt.hash(user.password, 10);
        await client.query(
          `INSERT INTO users (bank_id, email, password_hash, first_name, last_name, role)
           VALUES ((SELECT id FROM banks WHERE code = $1), $2, $3, $4, $5, $6)
           ON CONFLICT (email) DO UPDATE SET
             password_hash = EXCLUDED.password_hash,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             role = EXCLUDED.role,
             active = TRUE`,
          [user.bank, user.email, hash, user.firstName, user.lastName, user.role]
        );
      }
    }
  });

  await rechargerCatalogue();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(async () => {
      console.log(`Seed terminé : ${BANKS.length} banques, ${catalog.length} MCC, ${USERS.length} utilisateurs de démonstration.`);
      console.log('Comptes de démonstration :');
      for (const u of USERS) console.log(`  ${u.role.padEnd(9)} ${u.email.padEnd(24)} ${u.password}`);
      await pool.end();
    })
    .catch(async (err) => {
      console.error('Échec du seed :', err.message);
      await pool.end();
      process.exit(1);
    });
}
