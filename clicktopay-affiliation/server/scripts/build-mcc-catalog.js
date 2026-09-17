/**
 * Fusionne le référentiel Visa extrait du PDF officiel (mcc-visa-raw.json) avec
 * l'overlay français (mcc-fr.json) pour produire data/mcc-catalog.json, le seul
 * fichier consommé par l'application.
 *
 * Régénération : npm run build:mcc
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
const SOURCE = 'Visa Merchant Data Standards Manual – avril 2026 (codes ISO 18245)';

const readJson = async (name) => JSON.parse(await readFile(dataDir + name, 'utf8'));

const raw = await readJson('mcc-visa-raw.json');
const fr = await readJson('mcc-fr.json');

const catalog = raw.map((entry) => {
  const overlay = fr[entry.code];
  if (!overlay) throw new Error(`Traduction française manquante pour le MCC ${entry.code}`);

  // Les mots-clés du moteur combinent le lexique métier français et les
  // intitulés anglais officiels ("Included in this MCC").
  const keywords = [
    ...(overlay.keywords ?? []),
    ...entry.includedEn.map((k) => k.toLowerCase()),
  ];

  return {
    code: entry.code,
    label: overlay.label,
    description: overlay.description,
    labelEn: entry.titleEn,
    descriptionEn: entry.descriptionEn,
    keywords: [...new Set(keywords)],
    similar: entry.similar,
    ecommerceRelevance: overlay.ecommerce ?? 'LOW',
    riskLevel: overlay.risk ?? 'STANDARD',
    note: overlay.note ?? null,
    networks: ['VISA', 'MASTERCARD'],
    source: SOURCE,
  };
});

await writeFile(dataDir + 'mcc-catalog.json', JSON.stringify(catalog, null, 2) + '\n');

const byRelevance = catalog.reduce((acc, m) => {
  acc[m.ecommerceRelevance] = (acc[m.ecommerceRelevance] ?? 0) + 1;
  return acc;
}, {});
console.log(`mcc-catalog.json : ${catalog.length} MCC`, byRelevance);
