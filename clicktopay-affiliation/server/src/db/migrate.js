import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

export async function migrate() {
  const sql = await readFile(schemaPath, 'utf8');
  await pool.query(sql);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => {
      console.log('Migration terminée.');
      return pool.end();
    })
    .catch((err) => {
      console.error('Échec de la migration :', err.message);
      process.exit(1);
    });
}
